import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import {
  getEntitlements,
  invalidateEntitlements,
  meter,
  checkQuota,
  releaseMeter,
  getUsage,
  getAllUsage,
  countForms,
  countSeats,
  countWorkspaces,
  storageBytes,
  loadPlanCatalogue,
  verifyCatalogue,
} from "../src/lib/entitlements.js";
import { roleAllows, permissionsFor } from "../src/lib/permissions.js";
import { recordGate, markConverted, pruneGateLog, audit } from "../src/lib/gate-log.js";
import { periodKey, featureLocked, PLANS } from "@repo/entitlements";

const DB = () => (env as unknown as Bindings);

let org: Tenant;

/**
 * Seeds `plans` the way `pnpm seed:plans` does, from the shared catalogue.
 *
 * Doing it here rather than reading the generated .sql keeps the test honest about the
 * thing that actually matters — that a row shaped like the generator's output resolves to
 * the entitlements the catalogue promises.
 */
async function seedPlans(): Promise<void> {
  for (const plan of Object.values(PLANS)) {
    await DB()
      .DB.prepare(
        `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, seat_price_cents,
                            currency, features_json, limits_json, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?)
         ON CONFLICT (id) DO UPDATE SET features_json = excluded.features_json, limits_json = excluded.limits_json`,
      )
      .bind(
        plan.id,
        plan.id,
        plan.name,
        plan.priceMonthlyCents,
        plan.priceYearlyCents,
        plan.seatPriceCents,
        JSON.stringify(plan.features),
        JSON.stringify(plan.limits),
        plan.sortOrder,
      )
      .run();
  }
}

async function subscribe(
  orgId: string,
  planId: string,
  overrides: Partial<{ status: string; periodEnd: number; graceUntil: number; seats: number; cycle: string }> = {},
): Promise<void> {
  const now = Date.now();
  await DB()
    .DB.prepare(
      `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                  current_period_start, current_period_end, grace_until, seats, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `sub_${crypto.randomUUID().slice(0, 12)}`,
      orgId,
      planId,
      `dodo_${crypto.randomUUID().slice(0, 12)}`,
      overrides.cycle ?? "monthly",
      overrides.status ?? "active",
      now - 86_400_000,
      overrides.periodEnd ?? now + 86_400_000 * 20,
      overrides.graceUntil ?? null,
      overrides.seats ?? 1,
      now,
      now,
    )
    .run();
  await invalidateEntitlements(DB(), orgId);
}

async function clearBilling(orgId: string): Promise<void> {
  await DB().DB.prepare(`DELETE FROM subscriptions WHERE organization_id = ?`).bind(orgId).run();
  await DB().DB.prepare(`DELETE FROM entitlement_overrides WHERE organization_id = ?`).bind(orgId).run();
  await DB().DB.prepare(`DELETE FROM usage_counters WHERE organization_id = ?`).bind(orgId).run();
  await DB().DB.prepare(`DELETE FROM feature_access_log WHERE organization_id = ?`).bind(orgId).run();
  await invalidateEntitlements(DB(), orgId);
}

beforeAll(async () => {
  await applySchema();
  await seedPlans();
  org = await seedTenant("ent");
});

beforeEach(async () => {
  await clearBilling(org.orgId);
});

describe("the seeded catalogue", () => {
  it("matches the authored catalogue", async () => {
    const { ok, problems } = await verifyCatalogue(DB());
    expect(problems).toEqual([]);
    expect(ok).toBe(true);
  });

  it("reports drift rather than enforcing it silently", async () => {
    await DB().DB.prepare(`UPDATE plans SET price_monthly_cents = 999 WHERE id = 'pro'`).run();
    const { ok, problems } = await verifyCatalogue(DB());
    expect(ok).toBe(false);
    expect(problems.join(" ")).toContain("monthly price is 999");
    await seedPlans();
    await DB()
      .DB.prepare(`UPDATE plans SET price_monthly_cents = ? WHERE id = 'pro'`)
      .bind(PLANS.pro.priceMonthlyCents)
      .run();
  });

  it("exposes the catalogue for a pricing page", async () => {
    const rows = await loadPlanCatalogue(DB());
    expect(rows.map((r) => r.id)).toEqual(["free", "pro", "business"]);
    expect(rows[1]?.priceMonthlyCents).toBe(2_400);
    expect(rows[1]?.features).toContain("partial_responses");
  });
});

describe("resolving entitlements from the database", () => {
  it("gives an org with no subscription the free plan", async () => {
    const ent = await getEntitlements(DB(), org.orgId);
    expect(ent.planId).toBe("free");
    expect(ent.features.partial_responses).toBe(false);
    expect(ent.limits.responses_per_month).toBeNull();
    expect(ent.limits.responses_ceiling_per_month).toBe(5_000);
  });

  it("gives a Pro subscriber Pro", async () => {
    await subscribe(org.orgId, "pro");
    const ent = await getEntitlements(DB(), org.orgId);
    expect(ent.planId).toBe("pro");
    expect(ent.features.partial_responses).toBe(true);
    expect(ent.features.respondent_auth_phone).toBe(false);
    expect(ent.limits.ai_conversations_per_month).toBe(2_000);
  });

  it("keeps a past_due subscriber on their plan inside the grace window", async () => {
    // The old getPlanLimits filtered on status IN ('active','trialing'), which dropped a
    // customer whose card merely blipped straight to Free with no grace at all.
    await subscribe(org.orgId, "pro", { status: "past_due", graceUntil: Date.now() + 60_000 });
    const ent = await getEntitlements(DB(), org.orgId);
    expect(ent.planId).toBe("pro");
    expect(ent.inGrace).toBe(true);
  });

  it("drops them to free once grace has expired", async () => {
    await subscribe(org.orgId, "pro", {
      status: "past_due",
      graceUntil: Date.now() - 60_000,
      periodEnd: Date.now() - 86_400_000 * 40,
    });
    const ent = await getEntitlements(DB(), org.orgId);
    expect(ent.planId).toBe("free");
  });

  it("prefers an active subscription over a stale cancelled one", async () => {
    await subscribe(org.orgId, "business", { status: "canceled", periodEnd: Date.now() - 1000 });
    await subscribe(org.orgId, "pro", { status: "active" });
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("pro");
  });

  it("applies per-org overrides over the plan", async () => {
    await DB()
      .DB.prepare(
        `INSERT INTO entitlement_overrides (id, organization_id, kind, key, value, reason, created_at)
         VALUES (?, ?, 'feature', 'partial_responses', 'true', 'design partner', ?)`,
      )
      .bind(`ovr_${crypto.randomUUID().slice(0, 12)}`, org.orgId, Date.now())
      .run();
    await invalidateEntitlements(DB(), org.orgId);
    const ent = await getEntitlements(DB(), org.orgId);
    expect(ent.planId).toBe("free");
    expect(ent.features.partial_responses).toBe(true); // comped
    expect(ent.source).toBe("override");
  });

  it("serves a cached answer and honours invalidation", async () => {
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("free");
    // Write the subscription without invalidating: the cache must still say free.
    await DB()
      .DB.prepare(
        `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, status, created_at, updated_at)
         VALUES (?, ?, 'pro', ?, 'active', ?, ?)`,
      )
      .bind(`sub_c`, org.orgId, `dodo_c`, Date.now(), Date.now())
      .run();
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("free");
    await invalidateEntitlements(DB(), org.orgId);
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("pro");
  });
});

describe("metering", () => {
  it("counts, reports and resets by period", async () => {
    await meter(DB(), org.orgId, "ai_generations", 3);
    expect(await getUsage(DB(), org.orgId, "ai_generations")).toBe(3);
    expect(await getAllUsage(DB(), org.orgId)).toMatchObject({ ai_generations: 3 });
    // A different period is a different counter, which is how the monthly reset works.
    const row = await DB()
      .DB.prepare(`SELECT period FROM usage_counters WHERE organization_id = ? AND metric = 'ai_generations'`)
      .bind(org.orgId)
      .first<{ period: string }>();
    expect(row?.period).toBe(periodKey(Date.now()));
  });

  it("allows a hard-limited metric up to its limit and refuses past it", async () => {
    const limit = PLANS.free.limits.ai_generations_per_month!;
    for (let i = 0; i < limit; i++) {
      const r = await meter(DB(), org.orgId, "ai_generations");
      expect(r.ok, `call ${i + 1} of ${limit}`).toBe(true);
    }
    const over = await meter(DB(), org.orgId, "ai_generations");
    expect(over.ok).toBe(false);
    expect(over.used).toBe(limit + 1);
    expect(over.limit).toBe(limit);
    expect(over.limitKey).toBe("ai_generations_per_month");
  });

  it("does not double-count under concurrency", async () => {
    // The old check-then-increment pair let two simultaneous callers both read 9/10, both
    // pass, and both increment. The atomic reserve makes exactly one of them the 11th.
    const limit = PLANS.free.limits.ai_generations_per_month!;
    await meter(DB(), org.orgId, "ai_generations", limit - 1);
    const results = await Promise.all([
      meter(DB(), org.orgId, "ai_generations"),
      meter(DB(), org.orgId, "ai_generations"),
    ]);
    expect(await getUsage(DB(), org.orgId, "ai_generations")).toBe(limit + 1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("degrades rather than refusing when the AI cap is hit", async () => {
    // This is what keeps "unlimited responses" true on a plan with a metered LLM: the
    // form keeps working, it just stops being a conversation.
    const cap = PLANS.free.limits.ai_conversations_per_month!;
    await meter(DB(), org.orgId, "ai_conversations", cap);
    const next = await meter(DB(), org.orgId, "ai_conversations");
    expect(next.ok).toBe(true); // never refuses
    expect(next.degraded).toBe(true);
    expect(next.limitKey).toBe("ai_conversations_per_month");
  });

  it("never refuses a response until the ceiling behind 'unlimited' is reached", async () => {
    const ceiling = PLANS.free.limits.responses_ceiling_per_month!;
    const under = await meter(DB(), org.orgId, "responses", ceiling - 1);
    expect(under.ok).toBe(true);
    expect(under.limitKey).toBe("responses_ceiling_per_month");
    expect(under.limit).toBe(ceiling);
    await meter(DB(), org.orgId, "responses");
    expect((await meter(DB(), org.orgId, "responses")).ok).toBe(false);
  });

  it("treats a null limit as genuinely unlimited", async () => {
    await subscribe(org.orgId, "pro");
    const ent = await getEntitlements(DB(), org.orgId);
    expect(ent.limits.responses_per_month).toBeNull();
    const r = await meter(DB(), org.orgId, "responses", 40_000, ent);
    expect(r.ok).toBe(true); // still under Pro's 50,000 ceiling
  });

  it("lets a counter-level override beat the plan", async () => {
    // How a one-month support grant works without minting an entitlement_overrides row.
    await DB()
      .DB.prepare(
        `INSERT INTO usage_counters (id, organization_id, period, metric, used, limit_override, updated_at)
         VALUES (?, ?, ?, 'ai_generations', 0, 500, ?)`,
      )
      .bind(`uc_o`, org.orgId, periodKey(Date.now()), Date.now())
      .run();
    const r = await meter(DB(), org.orgId, "ai_generations", 100);
    expect(r.ok).toBe(true);
    expect(r.limit).toBe(500);
  });

  it("checks a quota without consuming any of it", async () => {
    await meter(DB(), org.orgId, "ai_generations", 5);
    const before = await getUsage(DB(), org.orgId, "ai_generations");
    const check = await checkQuota(DB(), org.orgId, "ai_generations");
    expect(check.ok).toBe(true);
    expect(check.used).toBe(5);
    expect(await getUsage(DB(), org.orgId, "ai_generations")).toBe(before);
  });

  it("releases a reservation without ever going negative", async () => {
    await meter(DB(), org.orgId, "ai_generations", 2);
    await releaseMeter(DB(), org.orgId, "ai_generations", 1);
    expect(await getUsage(DB(), org.orgId, "ai_generations")).toBe(1);
    // A double release must not hand out free quota.
    await releaseMeter(DB(), org.orgId, "ai_generations", 50);
    expect(await getUsage(DB(), org.orgId, "ai_generations")).toBe(0);
  });
});

describe("gauges", () => {
  it("counts the tenant's real forms, workspaces and seats", async () => {
    expect(await countForms(DB(), org.orgId)).toBe(1);
    expect(await countWorkspaces(DB(), org.orgId)).toBe(1);
    expect(await countSeats(DB(), org.orgId)).toBe(1);
  });

  it("counts a pending invitation against the seat limit", async () => {
    // Otherwise three simultaneous invites all pass on a one-seat plan.
    await DB()
      .DB.prepare(
        `INSERT INTO invitations (id, organization_id, email, role, status, expires_at, inviter_id, created_at)
         VALUES (?, ?, 'pending@example.com', 'editor', 'pending', ?, ?, ?)`,
      )
      .bind(`inv_p`, org.orgId, Date.now() + 86_400_000, org.userId, Date.now())
      .run();
    expect(await countSeats(DB(), org.orgId)).toBe(2);
    await DB().DB.prepare(`DELETE FROM invitations WHERE id = 'inv_p'`).run();
  });

  it("counts only confirmed bytes, and counts form-less org assets", async () => {
    const insert = (id: string, status: string, bytes: number, formId: string | null) =>
      DB()
        .DB.prepare(
          `INSERT INTO files (id, organization_id, form_id, r2_key, filename, mime, size_bytes, status, created_at)
           VALUES (?, ?, ?, ?, 'f.png', 'image/png', ?, ?, ?)`,
        )
        .bind(id, org.orgId, formId, `k_${id}`, bytes, status, Date.now())
        .run();

    await insert("fil_a", "confirmed", 1000, org.formId);
    await insert("fil_b", "pending", 9_000_000, org.formId); // an intent is not storage
    await insert("fil_c", "confirmed", 500, null); // an org logo has no form
    expect(await storageBytes(DB(), org.orgId)).toBe(1500);
    await DB().DB.prepare(`DELETE FROM files WHERE organization_id = ?`).bind(org.orgId).run();
  });
});

describe("roles", () => {
  it("gives the owner everything, including billing", () => {
    expect(roleAllows("owner", "billing", "manage")).toBe(true);
    expect(roleAllows("owner", "organization", "delete")).toBe(true);
  });

  it("stops an admin at billing and deleting the org", () => {
    expect(roleAllows("admin", "form", "delete")).toBe(true);
    expect(roleAllows("admin", "billing", "read")).toBe(true);
    expect(roleAllows("admin", "billing", "manage")).toBe(false);
    expect(roleAllows("admin", "organization", "delete")).toBe(false);
  });

  it("lets an editor build and read everything but not run the team or the account", () => {
    expect(roleAllows("editor", "form", "publish")).toBe(true);
    expect(roleAllows("editor", "submission", "export")).toBe(true);
    expect(roleAllows("editor", "submission", "read_partial")).toBe(true);
    expect(roleAllows("editor", "member", "create")).toBe(false);
    expect(roleAllows("editor", "billing", "read")).toBe(false);
    expect(roleAllows("editor", "apikey", "create")).toBe(false);
    expect(roleAllows("editor", "audit", "read")).toBe(false);
  });

  it("does not trust a viewer with unfinished responses or exports", () => {
    expect(roleAllows("viewer", "submission", "read")).toBe(true);
    expect(roleAllows("viewer", "submission", "read_partial")).toBe(false);
    expect(roleAllows("viewer", "submission", "export")).toBe(false);
    expect(roleAllows("viewer", "analytics", "read")).toBe(true);
    expect(roleAllows("viewer", "analytics", "read_advanced")).toBe(false);
    expect(roleAllows("viewer", "form", "update")).toBe(false);
  });

  it("keeps the legacy 'member' name working as an editor", () => {
    // An un-migrated row, or a Better Auth internal default, must not silently lose
    // every permission it had.
    expect(roleAllows("member", "form", "publish")).toBe(true);
    expect(roleAllows("member", "billing", "manage")).toBe(false);
  });

  it("honours a member holding several comma-separated roles", () => {
    expect(roleAllows("viewer,admin", "form", "delete")).toBe(true);
  });

  it("denies an unknown or missing role everything", () => {
    expect(roleAllows("wizard", "form", "read")).toBe(false);
    expect(roleAllows("", "form", "read")).toBe(false);
    expect(roleAllows(null, "form", "read")).toBe(false);
    expect(roleAllows(undefined, "form", "read")).toBe(false);
  });

  it("summarises a role for the UI", () => {
    const viewer = permissionsFor("viewer");
    expect(viewer.submission).toEqual(["read"]);
    expect(viewer.billing).toBeUndefined();
    expect(permissionsFor("owner").billing).toEqual(["read", "manage"]);
  });

  it("reads the migrated role off the seeded tenant", async () => {
    const row = await DB()
      .DB.prepare(`SELECT role FROM members WHERE organization_id = ? AND user_id = ?`)
      .bind(org.orgId, org.userId)
      .first<{ role: string }>();
    expect(row?.role).toBe("owner");
  });
});

describe("gate logging", () => {
  it("records a denial once per feature and counts repeats", async () => {
    const body = featureLocked("partial_responses", "free", { count: 14, surface: "results.partial" });
    await recordGate(DB(), org.orgId, body.error, "results.partial");
    await recordGate(DB(), org.orgId, body.error, "results.partial");

    const row = await DB()
      .DB.prepare(`SELECT feature, surface, denial_count, converted_at FROM feature_access_log WHERE organization_id = ?`)
      .bind(org.orgId)
      .first<{ feature: string; surface: string; denial_count: number; converted_at: number | null }>();
    expect(row).toMatchObject({ feature: "partial_responses", surface: "results.partial", denial_count: 2 });
    expect(row?.converted_at).toBeNull();
  });

  it("does not count a role denial as hitting a paywall", async () => {
    // Upgrading would not fix a role, so counting it would poison the funnel numbers.
    const { forbidden } = await import("@repo/entitlements");
    await recordGate(DB(), org.orgId, forbidden("submission", "export", "business").error, "export");
    const row = await DB()
      .DB.prepare(`SELECT COUNT(*) AS n FROM feature_access_log WHERE organization_id = ?`)
      .bind(org.orgId)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("attributes a sale to every lock the org had hit", async () => {
    await recordGate(DB(), org.orgId, featureLocked("remove_branding", "free").error, "design");
    await recordGate(DB(), org.orgId, featureLocked("custom_domain", "free").error, "share");
    await markConverted(DB(), org.orgId);
    const res = await DB()
      .DB.prepare(`SELECT feature, converted_at FROM feature_access_log WHERE organization_id = ?`)
      .bind(org.orgId)
      .all<{ feature: string; converted_at: number | null }>();
    expect(res.results).toHaveLength(2);
    for (const r of res.results ?? []) expect(r.converted_at, r.feature).not.toBeNull();
  });

  it("prunes stale unconverted rows and keeps converted ones", async () => {
    await recordGate(DB(), org.orgId, featureLocked("brand_logo", "free").error, "design");
    await recordGate(DB(), org.orgId, featureLocked("api_access", "free").error, "keys");
    const old = Date.now() - 200 * 86_400_000;
    await DB().DB.prepare(`UPDATE feature_access_log SET last_denied_at = ? WHERE organization_id = ?`).bind(old, org.orgId).run();
    await DB()
      .DB.prepare(`UPDATE feature_access_log SET converted_at = ? WHERE organization_id = ? AND feature = 'api_access'`)
      .bind(Date.now(), org.orgId)
      .run();

    expect(await pruneGateLog(DB(), 90)).toBe(1);
    const left = await DB()
      .DB.prepare(`SELECT feature FROM feature_access_log WHERE organization_id = ?`)
      .bind(org.orgId)
      .all<{ feature: string }>();
    expect(left.results?.map((r) => r.feature)).toEqual(["api_access"]);
  });

  it("writes an audit row a human can read", async () => {
    await audit(DB(), {
      orgId: org.orgId,
      action: "subscription.activated",
      actorType: "webhook",
      resourceType: "subscription",
      resourceId: "sub_x",
      meta: { planId: "pro", cycle: "yearly" },
    });
    const row = await DB()
      .DB.prepare(`SELECT action, actor_type, resource_id, meta FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1`)
      .bind(org.orgId)
      .first<{ action: string; actor_type: string; resource_id: string; meta: string }>();
    expect(row).toMatchObject({ action: "subscription.activated", actor_type: "webhook", resource_id: "sub_x" });
    expect(JSON.parse(row!.meta)).toEqual({ planId: "pro", cycle: "yearly" });
  });
});
