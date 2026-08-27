/**
 * Resolving a plan (plus any per-org overrides) into a flat set of entitlements.
 *
 * Pure and dependency-free on purpose: the API resolves against D1 rows, the web app
 * resolves against a JSON payload, and both must agree. Anything that touches a
 * database lives in `apps/api/src/lib/entitlements.ts` and calls into here.
 */

import { FEATURE_KEYS, type FeatureKey } from "./features.js";
import { LIMIT_KEYS, type LimitKey, type LimitValue } from "./limits.js";
import { PLANS, type PlanId } from "./plans.js";

/** Dodo's subscription statuses, plus the implicit "no subscription" case. */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "on_hold"
  | "canceled"
  | "expired"
  | "none";

export type BillingCycle = "monthly" | "yearly";

/**
 * How long paid entitlements survive a failed renewal.
 *
 * Dodo's dunning retries a declining card for days. Revoking a paying customer's
 * analytics the instant their card blips is how you manufacture churn, so `past_due`
 * and `on_hold` keep everything they had for a week. After that they read as Free —
 * but their data is never touched. See `submission_retention_days` in `limits.ts`.
 */
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface EntitlementOverride {
  kind: "feature" | "limit";
  key: string;
  /** `"true"`/`"false"` for features; a decimal string or `""` (unlimited) for limits. */
  value: string;
  expiresAt?: number | null;
}

export interface ResolveInput {
  planId: PlanId;
  status: SubscriptionStatus;
  cycle?: BillingCycle | null;
  periodStart?: number | null;
  periodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
  seats?: number | null;
  /** When the grace window ends; set by the webhook on the first failed renewal. */
  graceUntil?: number | null;
  overrides?: readonly EntitlementOverride[];
  /** Injected so tests are deterministic and workers stay side-effect free. */
  now: number;
}

export interface Entitlements {
  planId: PlanId;
  planName: string;
  status: SubscriptionStatus;
  cycle: BillingCycle | null;
  periodStart: number | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
  /** True while a lapsed subscription is still being honoured. */
  inGrace: boolean;
  features: Record<FeatureKey, boolean>;
  limits: Record<LimitKey, LimitValue>;
  source: "subscription" | "grace" | "free" | "override";
}

/** Statuses that entitle the org to its paid plan outright. */
function isEntitling(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}

/** Statuses that entitle the org only while the grace window is open. */
function isLapsing(status: SubscriptionStatus): boolean {
  return status === "past_due" || status === "on_hold";
}

/**
 * Collapse a subscription into the plan that should actually apply right now.
 *
 * Deliberately tolerant of the shapes a webhook can leave behind: a `canceled` row whose
 * period has not yet elapsed still entitles (the customer paid through the end of the
 * month — Dodo's own downgrade flow relies on this), and a lapsed row entitles until
 * `graceUntil`, defaulting to `periodEnd + GRACE_MS` when the webhook never set one.
 */
export function effectivePlan(input: ResolveInput): { planId: PlanId; source: Entitlements["source"]; inGrace: boolean } {
  const { planId, status, now } = input;
  if (planId === "free") return { planId: "free", source: "free", inGrace: false };

  if (isEntitling(status)) return { planId, source: "subscription", inGrace: false };

  if (isLapsing(status)) {
    const until = input.graceUntil ?? (input.periodEnd != null ? input.periodEnd + GRACE_MS : null);
    if (until != null && now < until) return { planId, source: "grace", inGrace: true };
    return { planId: "free", source: "free", inGrace: false };
  }

  // canceled / expired: honour the period the customer already paid for.
  if (input.periodEnd != null && now < input.periodEnd) {
    return { planId, source: "subscription", inGrace: false };
  }
  return { planId: "free", source: "free", inGrace: false };
}

/** Parse an override's stored string into a usable value, or `undefined` if malformed. */
function parseOverride(o: EntitlementOverride, now: number): boolean | LimitValue | undefined {
  if (o.expiresAt != null && o.expiresAt <= now) return undefined;
  if (o.kind === "feature") {
    if (o.value === "true") return true;
    if (o.value === "false") return false;
    return undefined;
  }
  if (o.value === "" || o.value === "null") return null; // unlimited
  const n = Number(o.value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * The one function every gate is ultimately asking. Overrides win over the plan so a
 * comp, an enterprise deal or a support grant needs no new plan row.
 */
export function resolve(input: ResolveInput): Entitlements {
  const { planId, source, inGrace } = effectivePlan(input);
  const plan = PLANS[planId];

  const features = {} as Record<FeatureKey, boolean>;
  const granted = new Set<string>(plan.features);
  for (const key of FEATURE_KEYS) features[key] = granted.has(key);

  const limits = {} as Record<LimitKey, LimitValue>;
  for (const key of LIMIT_KEYS) limits[key] = plan.limits[key];

  let overridden = false;
  for (const o of input.overrides ?? []) {
    const value = parseOverride(o, input.now);
    if (value === undefined) continue;
    if (o.kind === "feature" && (o.key as FeatureKey) in features) {
      features[o.key as FeatureKey] = value as boolean;
      overridden = true;
    } else if (o.kind === "limit" && (o.key as LimitKey) in limits) {
      limits[o.key as LimitKey] = value as LimitValue;
      overridden = true;
    }
  }

  // A paid seat count from Dodo (seat add-ons) beats the plan's included figure, but
  // never lowers it — a subscription row defaulting to seats=1 must not shrink Pro's 3.
  const paidSeats = input.seats ?? 0;
  if (planId !== "free" && paidSeats > (limits.seats ?? 0)) limits.seats = paidSeats;

  return {
    planId,
    planName: plan.name,
    status: input.status,
    cycle: input.cycle ?? null,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    seats: limits.seats ?? 1,
    inGrace,
    features,
    limits,
    source: overridden ? "override" : source,
  };
}

/** Entitlements for an org with no subscription at all. */
export function freeEntitlements(now: number): Entitlements {
  return resolve({ planId: "free", status: "none", now });
}

export function can(ent: Entitlements, feature: FeatureKey): boolean {
  return ent.features[feature] === true;
}

export function limitOf(ent: Entitlements, key: LimitKey): LimitValue {
  return ent.limits[key];
}

/**
 * Whether `used` has reached `limit`. `null` is unlimited and never reached — which is
 * why every "unlimited" row is paired with a `hard` ceiling row that is not null.
 */
export function isAtLimit(used: number, limit: LimitValue): boolean {
  return limit != null && used >= limit;
}

/**
 * Apply a `clamp`-mode limit. Used for `agent_max_turns` and `agent_token_budget` so a
 * form authored on Pro keeps running after a downgrade instead of refusing to load.
 */
export function clampToLimit(authored: number, limit: LimitValue): number {
  return limit == null ? authored : Math.min(authored, limit);
}
