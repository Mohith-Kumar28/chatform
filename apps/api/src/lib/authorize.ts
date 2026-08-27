/**
 * The gates. Four middlewares, one error shape, no per-route improvisation.
 *
 *   requirePermission(resource, action)  RBAC   → 403 forbidden      (no upsell)
 *   requireFeature(feature)              plan   → 402 feature_locked (upsell)
 *   requireQuota(metric)                 usage  → 402 limit_reached  (upsell)
 *   requireSeat()                        seats  → 402 seat_limit     (upsell)
 *
 * They compose with the existing guards in `guards.ts` and read `orgId` from the context
 * `requireOrg` already set, so wiring a route is one line. Everything they return is a
 * `GateErrorBody` from `@repo/entitlements`, which is what lets a single interceptor on
 * the web render every paywall without knowing which route produced it.
 */

import type { Context, MiddlewareHandler } from "hono";
import {
  featureLocked,
  limitReached,
  seatLimit,
  forbidden,
  GATE_STATUS,
  limitMeta,
  type Entitlements,
  type FeatureKey,
  type GateContext,
  type GateErrorBody,
  type LimitKey,
  type MetricKey,
} from "@repo/entitlements";
import type { Bindings } from "../env.js";
import type { GuardVars } from "./guards.js";
import { roleAllows, type ActionOf, type Resource } from "./permissions.js";
import {
  getEntitlements,
  checkQuota,
  countSeats,
  countForms,
  countWorkspaces,
  countWebhooks,
  storageBytes,
} from "./entitlements.js";
import { recordGate } from "./gate-log.js";

/** Context variables the gates add on top of `GuardVars`. */
export type AuthzVars = GuardVars & {
  entitlements: Entitlements;
  role: string;
};

type Ctx = Context<{ Bindings: Bindings; Variables: Partial<AuthzVars> }>;
type Handler = MiddlewareHandler<{ Bindings: Bindings; Variables: Partial<AuthzVars> }>;

/**
 * Emit the denial and return the response.
 *
 * Every gate funnels through here so that logging a denial is not something an individual
 * gate can forget — which matters because the denial log *is* the conversion funnel.
 */
function deny(c: Ctx, body: GateErrorBody, surface?: string): Response {
  const orgId = c.get("orgId");
  if (orgId) {
    // Never let telemetry failure turn a 402 into a 500. `c.executionCtx` is a getter that
    // *throws* rather than returning undefined when there is no execution context (a
    // queue consumer, a scheduled handler, some test harnesses), so `?.` is not enough.
    const logging = recordGate(c.env, orgId, body.error, surface).catch(() => {});
    try {
      c.executionCtx.waitUntil(logging);
    } catch {
      /* no execution context — the promise still runs, just unawaited */
    }
  }
  return c.json(body, GATE_STATUS[body.error.code]);
}

/**
 * Resolve entitlements once per request and stash them.
 *
 * Several gates can run on one route (a role check, then a feature check, then a quota
 * check); resolving three times would be three KV reads for an answer that cannot change
 * mid-request.
 */
export async function entitlementsFor(c: Ctx): Promise<Entitlements> {
  const cached = c.get("entitlements");
  if (cached) return cached;
  const orgId = c.get("orgId");
  const ent = orgId
    ? await getEntitlements(c.env, orgId)
    : (await import("./entitlements.js")).anonymousEntitlements();
  c.set("entitlements", ent);
  return ent;
}

/** The caller's role in the active org, memoized per request. */
export async function roleFor(c: Ctx): Promise<string> {
  const cached = c.get("role");
  if (cached) return cached;
  const userId = c.get("userId");
  const orgId = c.get("orgId");
  if (!userId || !orgId) return "";
  const row = await c.env.DB.prepare(
    `SELECT role FROM members WHERE organization_id = ? AND user_id = ?`,
  )
    .bind(orgId, userId)
    .first<{ role: string }>();
  const role = row?.role ?? "";
  c.set("role", role);
  return role;
}

// ─────────────────────────────── RBAC ───────────────────────────────

/**
 * A role gate. 403, never 402, and never an `upgradeUrl` — see `forbidden` in the shared
 * envelope. A caller with an API key rather than a session bypasses this: keys are minted
 * with explicit scopes and are checked by `requireApiKey` instead.
 */
export function requirePermission<R extends Resource>(resource: R, action: ActionOf<R>): Handler {
  return async (c, next) => {
    if (c.get("keyId")) return next(); // API keys carry their own scopes
    const role = await roleFor(c);
    if (!roleAllows(role, resource, action)) {
      const ent = await entitlementsFor(c);
      return deny(c, forbidden(resource, action, ent.planId), `${resource}.${action}`);
    }
    await next();
  };
}

/** The same check, callable inside a handler when the decision depends on the request. */
export async function assertPermission<R extends Resource>(
  c: Ctx,
  resource: R,
  action: ActionOf<R>,
): Promise<Response | null> {
  if (c.get("keyId")) return null;
  const role = await roleFor(c);
  if (roleAllows(role, resource, action)) return null;
  const ent = await entitlementsFor(c);
  return deny(c, forbidden(resource, action, ent.planId), `${resource}.${action}`);
}

// ───────────────────────────── features ─────────────────────────────

/**
 * A plan gate.
 *
 * `context` is a function rather than a value so the count that makes the upsell
 * persuasive — "14 partial responses" — is only queried when the gate actually denies.
 * On the happy path it costs nothing.
 */
export function requireFeature(
  feature: FeatureKey,
  opts: { surface?: string; context?: (c: Ctx) => Promise<GateContext> | GateContext } = {},
): Handler {
  return async (c, next) => {
    const ent = await entitlementsFor(c);
    if (!ent.features[feature]) {
      const extra = opts.context ? await opts.context(c) : {};
      return deny(c, featureLocked(feature, ent.planId, { surface: opts.surface, ...extra }), opts.surface);
    }
    await next();
  };
}

/** In-handler variant, for a feature that is only required on some code paths. */
export async function assertFeature(
  c: Ctx,
  feature: FeatureKey,
  context: GateContext = {},
): Promise<Response | null> {
  const ent = await entitlementsFor(c);
  if (ent.features[feature]) return null;
  return deny(c, featureLocked(feature, ent.planId, context), context.surface as string | undefined);
}

/** Non-denying check, for handlers that redact a response rather than refuse it. */
export async function hasFeature(c: Ctx, feature: FeatureKey): Promise<boolean> {
  return (await entitlementsFor(c)).features[feature] === true;
}

// ─────────────────────────────── quotas ───────────────────────────────

/**
 * A usage gate that checks without consuming.
 *
 * Consumption happens where the work succeeds, via `meter()`, so a request that fails for
 * an unrelated reason does not silently spend someone's allowance. The check here is
 * advisory in the `degrade` case by design: the caller proceeds and reads
 * `result.degraded` to decide what to do about it.
 */
export function requireQuota(metric: MetricKey, surface?: string): Handler {
  return async (c, next) => {
    const orgId = c.get("orgId");
    if (!orgId) return next();
    const ent = await entitlementsFor(c);
    const result = await checkQuota(c.env, orgId, metric, ent);
    if (!result.ok && result.limitKey && result.limit != null) {
      return deny(
        c,
        limitReached({
          limitKey: result.limitKey,
          plan: ent.planId,
          used: result.used,
          limit: result.limit,
          resetsAt: result.resetsAt,
          context: { surface },
        }),
        surface,
      );
    }
    await next();
  };
}

/**
 * A gauge gate — forms, workspaces, seats, storage, webhooks-per-form.
 *
 * Counted live rather than metered, because "how many forms does this org have" drifts
 * the moment one is deleted.
 */
export function requireGauge(limitKey: GaugeLimitKey, surface?: string): Handler {
  return async (c, next) => {
    const orgId = c.get("orgId");
    if (!orgId) return next();
    const ent = await entitlementsFor(c);
    const limit = ent.limits[limitKey];
    if (limit == null) return next(); // unlimited
    const used = await readGauge(c, limitKey, orgId);
    if (used >= limit) {
      return deny(
        c,
        limitReached({ limitKey, plan: ent.planId, used, limit, context: { surface } }),
        surface,
      );
    }
    await next();
  };
}

export type GaugeLimitKey = Extract<
  LimitKey,
  "forms_count" | "workspaces_count" | "seats" | "file_storage_mb" | "webhooks_per_form"
>;

async function readGauge(c: Ctx, limitKey: GaugeLimitKey, orgId: string): Promise<number> {
  switch (limitKey) {
    case "forms_count":
      return countForms(c.env, orgId);
    case "workspaces_count":
      return countWorkspaces(c.env, orgId);
    case "seats":
      return countSeats(c.env, orgId);
    case "file_storage_mb":
      return Math.ceil((await storageBytes(c.env, orgId)) / (1024 * 1024));
    case "webhooks_per_form": {
      const formId = c.get("form")?.id ?? c.req.param("id") ?? "";
      return formId ? countWebhooks(c.env, formId) : 0;
    }
  }
}

/**
 * Seats get their own gate because the copy is different: "Pro includes 3 teammates" is a
 * plan statement, not a usage warning, and pending invitations count against the total —
 * otherwise three simultaneous invites all pass on a one-seat plan.
 */
export function requireSeat(surface = "team.invite"): Handler {
  return async (c, next) => {
    const orgId = c.get("orgId");
    if (!orgId) return next();
    const ent = await entitlementsFor(c);
    const limit = ent.limits.seats;
    if (limit == null) return next();
    const used = await countSeats(c.env, orgId);
    if (used >= limit) return deny(c, seatLimit(ent.planId, used, limit), surface);
    await next();
  };
}

// ─────────────────────────── document limits ───────────────────────────

/**
 * Check a value authored in a form document against a `document`-mode limit.
 *
 * Returns a denial body rather than a Response so the publish handler can collect several
 * problems and report them together — a document with four gated settings should say all
 * four, not fail four times.
 */
export function checkDocumentLimit(
  ent: Entitlements,
  limitKey: LimitKey,
  value: number,
  context: GateContext = {},
): GateErrorBody | null {
  const limit = ent.limits[limitKey];
  if (limit == null || value <= limit) return null;
  if (limitMeta(limitKey).mode !== "hard") return null; // clamp/meter limits never refuse
  return limitReached({ limitKey, plan: ent.planId, used: value, limit, context });
}
