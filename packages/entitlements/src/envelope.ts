/**
 * The gate-denial envelope — shared between the API that produces it and the web app
 * that renders a paywall from it.
 *
 * It lives here rather than in the API because a single global 402 interceptor in
 * `mutator.ts` has to understand every denial without knowing which route produced it.
 * Getting that shape agreed before any handler is written is what stops each gate from
 * inventing its own error body and each call site from hand-rolling its own dialog.
 *
 * `context.count` is the conversion payload: "14 people started and didn't finish"
 * persuades where "upgrade for partial responses" does not, and the server is the only
 * place that number is knowable.
 */

import { FEATURES, minPlanFor, type FeatureKey } from "./features";
import { limitMeta, type LimitKey } from "./limits";
import { PLANS, type PlanId } from "./plans";

/**
 * `forbidden` is the odd one out and stays deliberately separate: it is a 403 about
 * *who you are in this org*, and it must never render an upgrade prompt, because
 * upgrading would not fix it. Only a role change would.
 */
export type GateCode =
  | "feature_locked"
  | "limit_reached"
  | "ceiling_reached"
  | "seat_limit"
  | "forbidden";

export interface GateContext {
  /** How many rows/items are sitting behind this gate right now. */
  count?: number;
  /** Plural noun for `count`, e.g. "partial responses". */
  noun?: string;
  /** Where the denial happened, for funnel analysis: "results.partial", "publish". */
  surface?: string;
  /** Free-form extras a specific gate wants to show, e.g. the worst drop-off block. */
  [key: string]: unknown;
}

export interface GateError {
  code: GateCode;
  message: string;
  feature: FeatureKey | null;
  metric: string | null;
  used: number | null;
  limit: number | null;
  plan: PlanId;
  requiredPlan: PlanId | null;
  /** When a monthly counter resets, so the UI can say "resets in 4 days". */
  resetsAt: number | null;
  context: GateContext;
  upgradeUrl: string | null;
}

export interface GateErrorBody {
  error: GateError;
}

export const GATE_STATUS: Record<GateCode, 402 | 403> = {
  feature_locked: 402,
  limit_reached: 402,
  ceiling_reached: 402,
  seat_limit: 402,
  forbidden: 403,
};

function upgradeUrl(requiredPlan: PlanId | null, from: string): string | null {
  if (!requiredPlan || requiredPlan === "free") return null;
  return `/billing?plan=${requiredPlan}&from=${encodeURIComponent(from)}`;
}

/**
 * A plan does not include this feature at all.
 *
 * The message names the feature the way the pricing page does and nothing more —
 * everything the dialog needs to be persuasive travels in `context`, so the copy stays
 * one sentence and the UI stays in charge of the pitch.
 */
export function featureLocked(
  feature: FeatureKey,
  plan: PlanId,
  context: GateContext = {},
): GateErrorBody {
  const meta = FEATURES[feature];
  const requiredPlan = minPlanFor(feature);
  return {
    error: {
      code: "feature_locked",
      message: `${meta.label} is a ${PLANS[requiredPlan].name} feature.`,
      feature,
      metric: null,
      used: null,
      limit: null,
      plan,
      requiredPlan,
      resetsAt: null,
      context: { noun: meta.noun, ...context },
      upgradeUrl: upgradeUrl(requiredPlan, feature),
    },
  };
}

/**
 * A metered allowance is exhausted.
 *
 * `ceiling_reached` rather than `limit_reached` when the limit is the absolute monthly
 * ceiling behind an "unlimited" row — the two want different copy, because one means
 * "buy the next tier" and the other means "you are using this at a scale we need to
 * talk about".
 */
export function limitReached(args: {
  limitKey: LimitKey;
  plan: PlanId;
  used: number;
  limit: number;
  resetsAt?: number | null;
  requiredPlan?: PlanId | null;
  context?: GateContext;
}): GateErrorBody {
  const meta = limitMeta(args.limitKey);
  const isCeiling = args.limitKey === "responses_ceiling_per_month";
  const nextPlan = args.requiredPlan ?? nextPlanWithMore(args.limitKey, args.plan);
  return {
    error: {
      code: isCeiling ? "ceiling_reached" : "limit_reached",
      message: isCeiling
        ? `This organization has reached its ${args.limit.toLocaleString("en-US")} responses for the month.`
        : `You've used all ${args.limit.toLocaleString("en-US")} ${meta.label.toLowerCase()} on ${PLANS[args.plan].name}.`,
      feature: null,
      metric: meta.metric ?? args.limitKey,
      used: args.used,
      limit: args.limit,
      plan: args.plan,
      requiredPlan: nextPlan,
      resetsAt: args.resetsAt ?? null,
      context: { ...args.context },
      upgradeUrl: upgradeUrl(nextPlan, args.limitKey),
    },
  };
}

export function seatLimit(plan: PlanId, used: number, limit: number): GateErrorBody {
  const nextPlan = nextPlanWithMore("seats", plan);
  return {
    error: {
      code: "seat_limit",
      message: `${PLANS[plan].name} includes ${limit} ${limit === 1 ? "member" : "members"}.`,
      feature: null,
      metric: "seats",
      used,
      limit,
      plan,
      requiredPlan: nextPlan,
      resetsAt: null,
      context: {},
      upgradeUrl: upgradeUrl(nextPlan, "seats"),
    },
  };
}

/**
 * A role denial. No `requiredPlan` and no `upgradeUrl` — by construction, because
 * offering an upgrade for something a role change would fix is the single worst thing
 * this envelope could do.
 */
export function forbidden(resource: string, action: string, plan: PlanId): GateErrorBody {
  return {
    error: {
      code: "forbidden",
      message: `Your role can't ${action} ${resource}. Ask an admin for access.`,
      feature: null,
      metric: null,
      used: null,
      limit: null,
      plan,
      requiredPlan: null,
      resetsAt: null,
      context: { resource, action },
      upgradeUrl: null,
    },
  };
}

/** The cheapest plan above `from` that allows more of `limitKey`, if any. */
function nextPlanWithMore(limitKey: LimitKey, from: PlanId): PlanId | null {
  const order: PlanId[] = ["free", "pro", "business"];
  const current = PLANS[from].limits[limitKey];
  for (const id of order.slice(order.indexOf(from) + 1)) {
    const candidate = PLANS[id].limits[limitKey];
    if (candidate == null) return id; // unlimited beats any finite value
    if (current != null && candidate > current) return id;
  }
  return null;
}

/** Narrow an unknown API error body to a gate denial. Used by the web interceptor. */
export function isGateError(body: unknown): body is GateErrorBody {
  if (typeof body !== "object" || body === null) return false;
  const err = (body as { error?: unknown }).error;
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && code in GATE_STATUS;
}
