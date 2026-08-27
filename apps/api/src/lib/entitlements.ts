/**
 * Entitlement resolution and usage metering — the D1/KV half of `@repo/entitlements`.
 *
 * The pure arithmetic (which plan applies, which features it grants, whether a number is
 * at its limit) lives in the shared package so the web app computes the same answers.
 * Everything here is the part that needs a database.
 */

import {
  resolve,
  freeEntitlements,
  periodKey,
  periodResetsAt,
  isAtLimit,
  LIMIT_KEYS,
  limitMeta,
  PLANS,
  isPlanId,
  type Entitlements,
  type EntitlementOverride,
  type FeatureKey,
  type LimitKey,
  type LimitValue,
  type MetricKey,
  type PlanId,
  type SubscriptionStatus,
  type BillingCycle,
} from "@repo/entitlements";
import type { Bindings } from "../env.js";

const CACHE_TTL_SECONDS = 300;

function cacheKey(orgId: string): string {
  return `ent:${orgId}`;
}

/**
 * Drop an org's cached entitlements. Called from every webhook handler and from every
 * override change — a stale 5-minute cache after a successful payment means a customer
 * who just paid still sees the paywall, which is the one cache miss they will remember.
 */
export async function invalidateEntitlements(env: Bindings, orgId: string): Promise<void> {
  await env.KV_CONFIG.delete(cacheKey(orgId)).catch(() => {
    /* a failed invalidation costs at most CACHE_TTL_SECONDS of staleness */
  });
}

interface SubscriptionRow {
  plan_id: string;
  status: string;
  cycle: string | null;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: number | null;
  grace_until: number | null;
  seats: number | null;
}

/**
 * Read the subscription that should govern this org.
 *
 * Ordered by `created_at DESC` and NOT filtered by status, unlike the old
 * `getPlanLimits`, which only looked at `active`/`trialing` rows and therefore dropped a
 * `past_due` customer straight to Free with no grace window at all.
 */
async function loadSubscription(env: Bindings, orgId: string): Promise<SubscriptionRow | null> {
  const row = await env.DB.prepare(
    `SELECT plan_id, status, cycle, current_period_start, current_period_end,
            cancel_at_period_end, grace_until, seats
       FROM subscriptions
      WHERE organization_id = ?
      ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END,
               created_at DESC
      LIMIT 1`,
  )
    .bind(orgId)
    .first<SubscriptionRow>();
  return row ?? null;
}

async function loadOverrides(env: Bindings, orgId: string): Promise<EntitlementOverride[]> {
  const res = await env.DB.prepare(
    `SELECT kind, key, value, expires_at FROM entitlement_overrides WHERE organization_id = ?`,
  )
    .bind(orgId)
    .all<{ kind: string; key: string; value: string; expires_at: number | null }>();
  return (res.results ?? []).map((r) => ({
    kind: r.kind === "feature" ? "feature" : "limit",
    key: r.key,
    value: r.value,
    expiresAt: r.expires_at,
  }));
}

/**
 * The current entitlements for an organization.
 *
 * Cached in KV for five minutes because it is read on nearly every authenticated request
 * and changes only when a webhook fires. Usage counters are deliberately NOT part of this
 * — they change constantly and are read fresh in `meter`.
 */
export async function getEntitlements(env: Bindings, orgId: string): Promise<Entitlements> {
  const cached = await env.KV_CONFIG.get(cacheKey(orgId), "json").catch(() => null);
  if (cached) return cached as Entitlements;

  const now = Date.now();
  const [sub, overrides] = await Promise.all([loadSubscription(env, orgId), loadOverrides(env, orgId)]);

  const ent = sub
    ? resolve({
        planId: isPlanId(sub.plan_id) ? (sub.plan_id as PlanId) : "free",
        status: (sub.status as SubscriptionStatus) ?? "none",
        cycle: (sub.cycle as BillingCycle | null) ?? null,
        periodStart: sub.current_period_start,
        periodEnd: sub.current_period_end,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        graceUntil: sub.grace_until,
        seats: sub.seats,
        overrides,
        now,
      })
    : resolve({ planId: "free", status: "none", overrides, now });

  await env.KV_CONFIG.put(cacheKey(orgId), JSON.stringify(ent), { expirationTtl: CACHE_TTL_SECONDS }).catch(() => {
    /* a failed cache write just costs a query next time */
  });
  return ent;
}

/** Entitlements for a caller with no organization — everything locked, nothing crashes. */
export function anonymousEntitlements(): Entitlements {
  return freeEntitlements(Date.now());
}

// ───────────────────────────── usage metering ─────────────────────────────

export interface MeterResult {
  /** False when a `hard` limit was exceeded and the caller must refuse the action. */
  ok: boolean;
  used: number;
  limit: LimitValue;
  /** Which limit was consulted, so the caller can build the right 402. */
  limitKey: LimitKey | null;
  /** True when a `degrade`-mode limit is exceeded: proceed, but at reduced quality. */
  degraded: boolean;
  resetsAt: number;
}

/**
 * The limit that governs a metric, and how it bites.
 *
 * `responses` is the interesting case: `responses_per_month` is `meter`-only on every
 * plan (that is the "unlimited responses" promise) while
 * `responses_ceiling_per_month` is the `hard` ceiling behind it. Looking up by metric
 * and preferring the enforcing row is what keeps both true at once.
 */
function governingLimit(metric: MetricKey): { key: LimitKey; mode: "hard" | "degrade" } | null {
  for (const key of LIMIT_KEYS) {
    const meta = limitMeta(key);
    if (meta.metric === metric && (meta.mode === "hard" || meta.mode === "degrade")) {
      return { key, mode: meta.mode };
    }
  }
  return null;
}

/**
 * Read a metric without touching it.
 *
 * `limit_override` on the counter row wins over the plan, which is how a support grant
 * for a single month works without minting an `entitlement_overrides` row.
 */
export async function getUsage(env: Bindings, orgId: string, metric: MetricKey, now = Date.now()): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT used FROM usage_counters WHERE organization_id = ? AND period = ? AND metric = ?`,
  )
    .bind(orgId, periodKey(now), metric)
    .first<{ used: number }>();
  return row?.used ?? 0;
}

/** Every metric's current value, for the usage page and the entitlements payload. */
export async function getAllUsage(
  env: Bindings,
  orgId: string,
  now = Date.now(),
): Promise<Record<string, number>> {
  const res = await env.DB.prepare(
    `SELECT metric, used FROM usage_counters WHERE organization_id = ? AND period = ?`,
  )
    .bind(orgId, periodKey(now))
    .all<{ metric: string; used: number }>();
  const out: Record<string, number> = {};
  for (const r of res.results ?? []) out[r.metric] = r.used;
  return out;
}

/**
 * Atomically consume `n` of a metric and report whether that was allowed.
 *
 * One statement with `RETURNING used`, rather than the read-then-write the old
 * `enforceLimit`/`incrementUsage` pair required. That pair double-counts under exactly
 * the concurrency a single popular form produces: two simultaneous sessions both read
 * 99/100, both pass, both increment, and the org lands at 101 with two responses it was
 * only entitled to one of.
 *
 * When the reservation turns out to be over a hard limit the counter is left high on
 * purpose — it genuinely is over, and compensating downward would reopen the same race.
 */
export async function meter(
  env: Bindings,
  orgId: string,
  metric: MetricKey,
  n = 1,
  ent?: Entitlements,
): Promise<MeterResult> {
  const now = Date.now();
  const period = periodKey(now);
  const entitlements = ent ?? (await getEntitlements(env, orgId));
  const governing = governingLimit(metric);

  const row = await env.DB.prepare(
    `INSERT INTO usage_counters (id, organization_id, period, metric, used, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (organization_id, period, metric)
       DO UPDATE SET used = used + excluded.used, updated_at = excluded.updated_at
     RETURNING used, limit_override`,
  )
    .bind(`uc_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, orgId, period, metric, n, now)
    .first<{ used: number; limit_override: number | null }>();

  const used = row?.used ?? n;
  const limit = row?.limit_override ?? (governing ? entitlements.limits[governing.key] : null);
  const over = isAtLimit(used - n, limit) || (limit != null && used > limit);

  return {
    ok: !(over && governing?.mode === "hard"),
    used,
    limit,
    limitKey: governing?.key ?? null,
    degraded: over && governing?.mode === "degrade",
    resetsAt: periodResetsAt(now),
  };
}

/**
 * Check a metric against its limit without consuming any of it.
 *
 * For gates that must answer before doing work whose cost is not yet known — an upload
 * intent, or an AI turn whose token count is only known afterwards.
 */
export async function checkQuota(
  env: Bindings,
  orgId: string,
  metric: MetricKey,
  ent?: Entitlements,
): Promise<MeterResult> {
  const now = Date.now();
  const entitlements = ent ?? (await getEntitlements(env, orgId));
  const governing = governingLimit(metric);
  const row = await env.DB.prepare(
    `SELECT used, limit_override FROM usage_counters
      WHERE organization_id = ? AND period = ? AND metric = ?`,
  )
    .bind(orgId, periodKey(now), metric)
    .first<{ used: number; limit_override: number | null }>();

  const used = row?.used ?? 0;
  const limit = row?.limit_override ?? (governing ? entitlements.limits[governing.key] : null);
  const over = isAtLimit(used, limit);

  return {
    ok: !(over && governing?.mode === "hard"),
    used,
    limit,
    limitKey: governing?.key ?? null,
    degraded: over && governing?.mode === "degrade",
    resetsAt: periodResetsAt(now),
  };
}

/**
 * Give back a reservation that turned out not to happen — a checkout that failed, an AI
 * call that errored before producing anything. Clamped at zero so a double-release
 * cannot drive a counter negative and hand out free quota.
 */
export async function releaseMeter(env: Bindings, orgId: string, metric: MetricKey, n = 1): Promise<void> {
  await env.DB.prepare(
    `UPDATE usage_counters SET used = MAX(0, used - ?), updated_at = ?
      WHERE organization_id = ? AND period = ? AND metric = ?`,
  )
    .bind(n, Date.now(), orgId, periodKey(Date.now()), metric)
    .run();
}

// ─────────────────────────── gauge-style limits ───────────────────────────

/**
 * Live counts, recomputed rather than incremented.
 *
 * A counter for "how many forms does this org have" drifts the moment one is deleted, and
 * a byte counter for storage drifts the moment an upload is abandoned between intent and
 * confirm. These are cheap indexed aggregates; correctness beats saving a query.
 */
export async function countForms(env: Bindings, orgId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM forms WHERE organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(orgId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function countWorkspaces(env: Bindings, orgId: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM workspaces WHERE organization_id = ?`)
    .bind(orgId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function countSeats(env: Bindings, orgId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM members WHERE organization_id = ?1)
          + (SELECT COUNT(*) FROM invitations WHERE organization_id = ?1 AND status = 'pending') AS n`,
  )
    .bind(orgId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Confirmed upload bytes. Pending rows are excluded — an intent is not storage yet.
 *
 * Reads `files.organization_id` rather than joining through `forms`: `files.form_id` is
 * nullable (org assets such as logos have no form), so a join would silently omit them
 * from the storage total.
 */
export async function storageBytes(env: Bindings, orgId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(size_bytes), 0) AS n
       FROM files WHERE organization_id = ? AND status = 'confirmed'`,
  )
    .bind(orgId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function countWebhooks(env: Bindings, formId: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM webhooks WHERE form_id = ?`)
    .bind(formId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ────────────────────────────── introspection ──────────────────────────────

export interface PlanCatalogueRow {
  id: PlanId;
  name: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  seatPriceCents: number;
  currency: string;
  features: FeatureKey[];
  limits: Record<string, number | null>;
  sortOrder: number;
  dodoProductMonthlyId: string | null;
  dodoProductYearlyId: string | null;
}

/**
 * The plan catalogue as stored, not as authored.
 *
 * Reading D1 rather than `PLANS` on purpose: this is what the runtime actually enforces,
 * so a pricing page built from it cannot promise something the gates do not honour. When
 * the two diverge it is the seed that is stale, which `verifyCatalogue` reports.
 */
export async function loadPlanCatalogue(env: Bindings): Promise<PlanCatalogueRow[]> {
  const res = await env.DB.prepare(
    `SELECT id, name, price_monthly_cents, price_yearly_cents, seat_price_cents, currency,
            features_json, limits_json, sort_order, dodo_product_monthly_id, dodo_product_yearly_id
       FROM plans WHERE is_active = 1 ORDER BY sort_order`,
  ).all<{
    id: string;
    name: string;
    price_monthly_cents: number;
    price_yearly_cents: number;
    seat_price_cents: number;
    currency: string;
    features_json: string;
    limits_json: string;
    sort_order: number;
    dodo_product_monthly_id: string | null;
    dodo_product_yearly_id: string | null;
  }>();

  return (res.results ?? []).flatMap((r) => {
    if (!isPlanId(r.id)) return [];
    return [
      {
        id: r.id as PlanId,
        name: r.name,
        priceMonthlyCents: r.price_monthly_cents,
        priceYearlyCents: r.price_yearly_cents,
        seatPriceCents: r.seat_price_cents,
        currency: r.currency,
        features: safeParse<FeatureKey[]>(r.features_json, []),
        limits: safeParse<Record<string, number | null>>(r.limits_json, {}),
        sortOrder: r.sort_order,
        dodoProductMonthlyId: r.dodo_product_monthly_id,
        dodoProductYearlyId: r.dodo_product_yearly_id,
      },
    ];
  });
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Does the seeded catalogue still match the authored one?
 *
 * Surfaced by `GET /api/billing/config-check` and asserted in CI. A drifted `plans` row
 * is a gate that disagrees with the pricing page, which is worse than either being wrong
 * consistently.
 */
export async function verifyCatalogue(env: Bindings): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = [];
  const rows = await loadPlanCatalogue(env);
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const plan of Object.values(PLANS)) {
    const row = byId.get(plan.id);
    if (!row) {
      problems.push(`plan "${plan.id}" is not seeded — run pnpm seed:plans`);
      continue;
    }
    if (row.priceMonthlyCents !== plan.priceMonthlyCents) {
      problems.push(`plan "${plan.id}" monthly price is ${row.priceMonthlyCents}, catalogue says ${plan.priceMonthlyCents}`);
    }
    if (row.priceYearlyCents !== plan.priceYearlyCents) {
      problems.push(`plan "${plan.id}" yearly price is ${row.priceYearlyCents}, catalogue says ${plan.priceYearlyCents}`);
    }
    const seeded = new Set(row.features);
    for (const f of plan.features) {
      if (!seeded.has(f)) problems.push(`plan "${plan.id}" is missing feature "${f}"`);
    }
    for (const f of row.features) {
      if (!plan.features.includes(f)) problems.push(`plan "${plan.id}" grants unknown feature "${f}"`);
    }
    for (const [key, value] of Object.entries(plan.limits) as [LimitKey, LimitValue][]) {
      if (row.limits[key] !== value) {
        problems.push(`plan "${plan.id}" limit "${key}" is ${String(row.limits[key])}, catalogue says ${String(value)}`);
      }
    }
  }

  return { ok: problems.length === 0, problems };
}
