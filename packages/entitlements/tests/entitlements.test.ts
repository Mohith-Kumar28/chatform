import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_LIST,
  FEATURE_KEYS,
  LIMIT_KEYS,
  orphanedFeatures,
  yearlyPerMonthCents,
  yearlySavingPercent,
  resolve,
  freeEntitlements,
  effectivePlan,
  can,
  limitOf,
  isAtLimit,
  clampToLimit,
  GRACE_MS,
  featureLocked,
  limitReached,
  seatLimit,
  forbidden,
  isGateError,
  periodKey,
  periodResetsAt,
  previousPeriodKey,
  minPlanFor,
} from "../src/index.js";

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0); // 27 Aug 2026
const MONTH = 30 * 24 * 60 * 60 * 1000;

describe("the catalogue", () => {
  it("prices each tier $5 under Youform, monthly", () => {
    expect(PLANS.pro.priceMonthlyCents).toBe(2_400); // Youform $29
    expect(PLANS.business.priceMonthlyCents).toBe(8_400); // Youform $89
  });

  it("preserves Youform's annual discount", () => {
    expect(yearlyPerMonthCents(PLANS.pro)).toBe(1_600); // $16/mo
    expect(yearlySavingPercent(PLANS.pro)).toBe(33); // slightly beats Youform's 31%
    expect(yearlyPerMonthCents(PLANS.business)).toBe(5_500); // $55/mo
    expect(yearlySavingPercent(PLANS.business)).toBe(35);
  });

  it("leaves no feature ungranted by every plan", () => {
    // A key nothing grants is a gate no customer can ever pass.
    expect(orphanedFeatures()).toEqual([]);
  });

  it("gives every plan a value for every limit", () => {
    for (const plan of PLAN_LIST) {
      for (const key of LIMIT_KEYS) {
        expect(plan.limits, `${plan.id}.${key}`).toHaveProperty(key);
      }
    }
  });

  it("never grants a feature on a cheaper plan than its declared minimum", () => {
    const rank = { free: 0, pro: 1, business: 2 } as const;
    for (const plan of PLAN_LIST) {
      for (const feature of plan.features) {
        expect(rank[plan.id], `${plan.id} grants ${feature}`).toBeGreaterThanOrEqual(rank[minPlanFor(feature)]);
      }
    }
  });

  it("never lets a higher tier allow less than a lower one", () => {
    for (const key of LIMIT_KEYS) {
      const free = PLANS.free.limits[key];
      const pro = PLANS.pro.limits[key];
      if (free == null) expect(pro, key).toBeNull(); // unlimited must stay unlimited
      else if (pro != null) expect(pro, key).toBeGreaterThanOrEqual(free);
    }
  });

  it("keeps Free's headline promise: unlimited responses", () => {
    expect(PLANS.free.limits.responses_per_month).toBeNull();
    // …but never without a ceiling behind it, or "unlimited" is an uncapped bill.
    expect(PLANS.free.limits.responses_ceiling_per_month).toBeGreaterThan(0);
  });

  it("locks the revenue features off Free", () => {
    const free = freeEntitlements(NOW);
    for (const f of ["partial_responses", "advanced_analytics", "remove_branding", "custom_domain"] as const) {
      expect(can(free, f), f).toBe(false);
    }
  });

  it("keeps the whole build-and-launch path free", () => {
    // The model is generous about input, stingy about output. Nothing that gets a form
    // built, published and collecting may be gated.
    const free = PLANS.free.limits;
    expect(free.forms_count).toBeGreaterThan(0);
    expect(free.blocks_per_form).toBeGreaterThan(0);
    expect(free.webhooks_per_form).toBeGreaterThan(0);
    expect(free.ai_conversations_per_month).toBeGreaterThan(0);
  });

  it("never expires anyone's data", () => {
    // The conversion mechanism depends on the free user knowing their partials are
    // intact behind the glass. A retention limit would destroy the leverage.
    expect(LIMIT_KEYS).not.toContain("submission_retention_days");
  });
});

describe("resolve", () => {
  const base = { cycle: "monthly", periodStart: NOW - MONTH, periodEnd: NOW + MONTH, now: NOW } as const;

  it("gives an active Pro subscription Pro's entitlements", () => {
    const ent = resolve({ ...base, planId: "pro", status: "active" });
    expect(ent.planId).toBe("pro");
    expect(ent.source).toBe("subscription");
    expect(can(ent, "partial_responses")).toBe(true);
    expect(can(ent, "respondent_auth_phone")).toBe(false); // Business only
    expect(limitOf(ent, "ai_conversations_per_month")).toBe(2_000);
  });

  it("treats a trial as fully entitled", () => {
    expect(resolve({ ...base, planId: "business", status: "trialing" }).planId).toBe("business");
  });

  it("honours paid entitlements through the grace window", () => {
    const lapsed = { ...base, planId: "pro", status: "past_due" } as const;
    const inside = resolve({ ...lapsed, graceUntil: NOW + 1000 });
    expect(inside.planId).toBe("pro");
    expect(inside.source).toBe("grace");
    expect(inside.inGrace).toBe(true);

    const outside = resolve({ ...lapsed, graceUntil: NOW - 1000 });
    expect(outside.planId).toBe("free");
    expect(outside.inGrace).toBe(false);
  });

  it("derives the grace window from periodEnd when the webhook never set one", () => {
    const ent = resolve({ ...base, planId: "pro", status: "on_hold", periodEnd: NOW - 1000 });
    expect(ent.planId).toBe("pro"); // periodEnd + GRACE_MS is still ahead
    expect(resolve({ ...base, planId: "pro", status: "on_hold", periodEnd: NOW - GRACE_MS - 1 }).planId).toBe("free");
  });

  it("lets a cancelled subscription run out the period it paid for", () => {
    expect(resolve({ ...base, planId: "pro", status: "canceled" }).planId).toBe("pro");
    expect(resolve({ ...base, planId: "pro", status: "canceled", periodEnd: NOW - 1 }).planId).toBe("free");
  });

  it("falls back to free with no subscription", () => {
    const ent = resolve({ planId: "free", status: "none", now: NOW });
    expect(ent.planId).toBe("free");
    expect(ent.source).toBe("free");
    expect(ent.seats).toBe(1);
  });

  it("applies feature and limit overrides over the plan", () => {
    const ent = resolve({
      planId: "free",
      status: "none",
      now: NOW,
      overrides: [
        { kind: "feature", key: "partial_responses", value: "true" },
        { kind: "limit", key: "ai_conversations_per_month", value: "5000" },
        { kind: "limit", key: "responses_ceiling_per_month", value: "" }, // unlimited
      ],
    });
    expect(can(ent, "partial_responses")).toBe(true);
    expect(limitOf(ent, "ai_conversations_per_month")).toBe(5_000);
    expect(limitOf(ent, "responses_ceiling_per_month")).toBeNull();
    expect(ent.source).toBe("override");
  });

  it("ignores expired, malformed and unknown overrides", () => {
    const ent = resolve({
      planId: "free",
      status: "none",
      now: NOW,
      overrides: [
        { kind: "feature", key: "partial_responses", value: "true", expiresAt: NOW - 1 },
        { kind: "limit", key: "forms_count", value: "not-a-number" },
        { kind: "limit", key: "forms_count", value: "-5" },
        { kind: "feature", key: "no_such_feature", value: "true" },
      ],
    });
    expect(can(ent, "partial_responses")).toBe(false);
    expect(limitOf(ent, "forms_count")).toBe(PLANS.free.limits.forms_count);
    expect(ent.source).toBe("free");
  });

  it("lets paid seats raise the plan's seat count but never lower it", () => {
    expect(resolve({ ...base, planId: "business", status: "active", seats: 9 }).seats).toBe(9);
    // A subscription row defaulting to seats=1 must not shrink Pro's included 3.
    expect(resolve({ ...base, planId: "pro", status: "active", seats: 1 }).seats).toBe(3);
  });

  it("exposes every feature and limit key, whatever the plan", () => {
    const ent = freeEntitlements(NOW);
    expect(Object.keys(ent.features).sort()).toEqual([...FEATURE_KEYS].sort());
    expect(Object.keys(ent.limits).sort()).toEqual([...LIMIT_KEYS].sort());
  });
});

describe("effectivePlan", () => {
  it("never promotes a free org", () => {
    expect(effectivePlan({ planId: "free", status: "active", now: NOW }).planId).toBe("free");
  });
});

describe("limit arithmetic", () => {
  it("treats null as unlimited and never at the limit", () => {
    expect(isAtLimit(999_999, null)).toBe(false);
    expect(isAtLimit(99, 100)).toBe(false);
    expect(isAtLimit(100, 100)).toBe(true);
    expect(isAtLimit(101, 100)).toBe(true);
  });

  it("clamps an authored value down but never up", () => {
    expect(clampToLimit(200, 60)).toBe(60);
    expect(clampToLimit(30, 60)).toBe(30);
    expect(clampToLimit(200, null)).toBe(200);
  });
});

describe("the gate envelope", () => {
  it("names the required plan and carries the count that sells it", () => {
    const { error } = featureLocked("partial_responses", "free", { count: 14, surface: "results.partial" });
    expect(error.code).toBe("feature_locked");
    expect(error.requiredPlan).toBe("pro");
    expect(error.message).toBe("Partial responses is a Pro feature.");
    expect(error.context.count).toBe(14);
    expect(error.context.noun).toBe("partial responses");
    expect(error.upgradeUrl).toBe("/billing?plan=pro&from=partial_responses");
  });

  it("points a Business-only feature at Business", () => {
    expect(featureLocked("respondent_auth_phone", "pro").error.requiredPlan).toBe("business");
  });

  it("distinguishes a plan allowance from the absolute ceiling", () => {
    const allowance = limitReached({ limitKey: "ai_generations_per_month", plan: "free", used: 10, limit: 10 });
    expect(allowance.error.code).toBe("limit_reached");
    expect(allowance.error.requiredPlan).toBe("pro");
    expect(allowance.error.metric).toBe("ai_generations");

    const ceiling = limitReached({ limitKey: "responses_ceiling_per_month", plan: "free", used: 5000, limit: 5000 });
    expect(ceiling.error.code).toBe("ceiling_reached");
    expect(ceiling.error.message).toContain("5,000 responses");
  });

  it("offers no upgrade when no higher plan allows more", () => {
    const at = limitReached({ limitKey: "responses_ceiling_per_month", plan: "business", used: 50_000, limit: 50_000 });
    expect(at.error.requiredPlan).toBeNull();
    expect(at.error.upgradeUrl).toBeNull();
  });

  it("reports seat limits against the next plan up", () => {
    const { error } = seatLimit("free", 1, 1);
    expect(error.code).toBe("seat_limit");
    expect(error.requiredPlan).toBe("pro");
    expect(error.message).toBe("Free includes 1 member.");
  });

  it("never offers an upgrade for a role denial", () => {
    // Upgrading cannot fix a role, and offering it is the worst thing this could do.
    const { error } = forbidden("responses", "export", "business");
    expect(error.code).toBe("forbidden");
    expect(error.requiredPlan).toBeNull();
    expect(error.upgradeUrl).toBeNull();
  });

  it("recognises its own bodies and nothing else", () => {
    expect(isGateError(featureLocked("brand_logo", "free"))).toBe(true);
    expect(isGateError({ error: { code: "not_found", message: "no" } })).toBe(false);
    expect(isGateError({ error: "unauthorized" })).toBe(false);
    expect(isGateError(null)).toBe(false);
    expect(isGateError(undefined)).toBe(false);
  });
});

describe("periods", () => {
  it("keys usage by UTC calendar month", () => {
    expect(periodKey(NOW)).toBe("2026-08");
    expect(previousPeriodKey(NOW)).toBe("2026-07");
    expect(previousPeriodKey(Date.UTC(2026, 0, 15))).toBe("2025-12");
  });

  it("resets at the first instant of the next month", () => {
    expect(periodResetsAt(NOW)).toBe(Date.UTC(2026, 8, 1));
    expect(periodKey(periodResetsAt(NOW))).toBe("2026-09");
    expect(periodResetsAt(Date.UTC(2026, 11, 31, 23, 59))).toBe(Date.UTC(2027, 0, 1));
  });
});
