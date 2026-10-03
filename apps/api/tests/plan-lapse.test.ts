import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { readFormDoc, type FormDoc } from "@repo/form-schema";
import { PLANS, freeEntitlements, resolve } from "@repo/entitlements";
import { applySchema, seedTenant, minimalDoc, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import { clampForRuntime, gatewayPaymentsLapsed, paidFeaturesLost } from "../src/lib/doc-entitlements.js";
import { lapsedForms, sweepPlanNotices } from "../src/lib/plan-notices.js";
import { planLapseEmail } from "../src/lib/mail-templates.js";

/**
 * What happens when a paid plan ends: the live form sheds every paid setting on read,
 * a verified payment closes it, and the owner is told before and after, the same way
 * whether the plan was cancelled, gifted or unpaid.
 */

const E = () => env as unknown as Bindings;
const DAY = 24 * 60 * 60 * 1000;
let t: Tenant;
let jobs: { kind: string; [k: string]: unknown }[];

function proDoc(label: string): FormDoc {
  const doc = readFormDoc(minimalDoc(label));
  doc.theme.logoUrl = "https://example.com/logo.png";
  doc.theme.fontHeading = "Lora";
  doc.endings[0]!.redirectUrl = "https://example.com/thanks";
  doc.settings.agent = { ...doc.settings.agent!, personaPrompt: "You are Ada." };
  return doc;
}

async function publish(doc: FormDoc): Promise<void> {
  const now = Date.now();
  await E().DB.batch([
    E().DB.prepare(
      `INSERT OR REPLACE INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?, ?, 1, ?, 'x', ?, NULL, ?)`,
    ).bind(`fv_${t.formId}`, t.formId, JSON.stringify(doc), now, now),
    E().DB.prepare(`UPDATE forms SET status = 'published', active_version_id = ? WHERE id = ?`).bind(`fv_${t.formId}`, t.formId),
  ]);
}

async function subscribe(a: { status: string; periodEnd: number; dodoId?: string; cancel?: boolean; grace?: number | null }) {
  await E()
    .DB.prepare(
      `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
         current_period_start, current_period_end, cancel_at_period_end, grace_until, seats, created_at, updated_at)
       VALUES (?, ?, 'pro', ?, 'monthly', ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      `sub_${crypto.randomUUID().slice(0, 8)}`,
      t.orgId,
      a.dodoId ?? `dodo_${crypto.randomUUID().slice(0, 8)}`,
      a.status,
      a.periodEnd - 30 * DAY,
      a.periodEnd,
      a.cancel ? 1 : 0,
      a.grace ?? null,
      Date.now(),
      Date.now(),
    )
    .run();
  await invalidateEntitlements(E(), t.orgId);
}

beforeAll(async () => {
  await applySchema();
  for (const plan of Object.values(PLANS)) {
    await E()
      .DB.prepare(
        `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, seat_price_cents,
                            currency, features_json, limits_json, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .bind(plan.id, plan.id, plan.name, plan.priceMonthlyCents, plan.priceYearlyCents, plan.seatPriceCents,
        JSON.stringify(plan.features), JSON.stringify(plan.limits), plan.sortOrder)
      .run();
  }
  t = await seedTenant("lapse");
  await publish(proDoc("lapse"));
});

beforeEach(async () => {
  await E().DB.prepare(`DELETE FROM subscriptions WHERE organization_id = ?`).bind(t.orgId).run();
  await E().DB.prepare(`DELETE FROM plan_notices WHERE organization_id = ?`).bind(t.orgId).run();
  await invalidateEntitlements(E(), t.orgId);
  jobs = [];
  vi.spyOn(E().Q_EMAIL, "send").mockImplementation(async (j: unknown) => {
    jobs.push(j as { kind: string });
  });
});

afterEach(() => vi.restoreAllMocks());

const lapseJobs = () => jobs.filter((j) => j.kind === "plan_lapse");

describe("a live form after the plan ends", () => {
  it("sheds every paid setting on read, not only at the next publish", () => {
    const doc = clampForRuntime(proDoc("sample"), freeEntitlements(Date.now()));
    expect(doc.theme.logoUrl).toBeNull();
    expect(doc.theme.fontHeading).toBe("Bricolage Grotesque");
    expect(doc.endings[0]!.redirectUrl).toBeUndefined();
    expect(doc.settings.agent?.personaPrompt).toBeUndefined();
  });

  it("keeps them while the plan applies", () => {
    const pro = resolve({ planId: "pro", status: "active", now: Date.now() });
    const doc = clampForRuntime(proDoc("sample"), pro);
    expect(doc.theme.logoUrl).toBe("https://example.com/logo.png");
    expect(doc.settings.agent?.personaPrompt).toBe("You are Ada.");
  });

  it("closes a form whose verified payment the plan no longer takes, and only that kind", () => {
    const doc = readFormDoc(minimalDoc("pay"));
    const free = freeEntitlements(Date.now());
    expect(gatewayPaymentsLapsed(doc, free)).toBe(false);
    doc.blocks.push({ ...(doc.blocks[1] as object), id: "blk_pay", ref: "q_pay", type: "payment", method: "gateway" } as never);
    expect(gatewayPaymentsLapsed(doc, free)).toBe(true);
    expect(paidFeaturesLost(doc, free)).toContain("collect_payments");
    const business = resolve({ planId: "business", status: "active", now: Date.now() });
    expect(gatewayPaymentsLapsed(doc, business)).toBe(false);
  });

  it("lists the live form and what it loses", async () => {
    const { forms } = await lapsedForms(E(), t.orgId);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.losing).toEqual(expect.arrayContaining(["Brand logo", "Custom fonts", "Custom persona", "Redirect on completion"]));
  });
});

describe("plan emails", () => {
  it("warns a week before a cancelled plan ends, once", async () => {
    const now = Date.now();
    await subscribe({ status: "active", cancel: true, periodEnd: now + 5 * DAY });
    await sweepPlanNotices(E(), now);
    await sweepPlanNotices(E(), now + 60_000);
    expect(lapseJobs()).toHaveLength(1);
    expect(lapseJobs()[0]).toMatchObject({ stage: "ending", reason: "cancelled", endsAt: now + 5 * DAY });
  });

  it("says nothing while the end is further off", async () => {
    const now = Date.now();
    await subscribe({ status: "active", cancel: true, periodEnd: now + 20 * DAY });
    await sweepPlanNotices(E(), now);
    expect(lapseJobs()).toHaveLength(0);
  });

  it("treats a gift running out the same way, worded as a gift", async () => {
    const now = Date.now();
    await subscribe({ status: "canceled", cancel: true, periodEnd: now + 3 * DAY, dodoId: `internal_manual_${t.orgId}` });
    await sweepPlanNotices(E(), now);
    expect(lapseJobs()).toEqual([expect.objectContaining({ stage: "ending", reason: "gift" })]);
  });

  it("tells them a payment failed, then again before grace runs out", async () => {
    const now = Date.now();
    await subscribe({ status: "on_hold", periodEnd: now - DAY, grace: now + 7 * DAY });
    await sweepPlanNotices(E(), now);
    expect(lapseJobs()).toEqual([expect.objectContaining({ stage: "payment_failed", reason: "payment" })]);
    await sweepPlanNotices(E(), now + 6 * DAY);
    expect(lapseJobs().map((j) => j.stage)).toEqual(["payment_failed", "ending"]);
  });

  it("announces the move to Free once it has happened, once", async () => {
    const now = Date.now();
    await subscribe({ status: "canceled", periodEnd: now - DAY });
    await sweepPlanNotices(E(), now);
    await sweepPlanNotices(E(), now + 60_000);
    expect(lapseJobs()).toEqual([expect.objectContaining({ stage: "ended" })]);
  });

  it("does not mail about a plan that ended long ago", async () => {
    await subscribe({ status: "canceled", periodEnd: Date.now() - 60 * DAY });
    await sweepPlanNotices(E(), Date.now());
    expect(lapseJobs()).toHaveLength(0);
  });

  it("ignores a lapsing gift on an account that also pays", async () => {
    const now = Date.now();
    await subscribe({ status: "active", periodEnd: now + 20 * DAY });
    await subscribe({ status: "canceled", periodEnd: now + 2 * DAY, dodoId: `internal_manual_${t.orgId}` });
    await sweepPlanNotices(E(), now);
    expect(lapseJobs()).toHaveLength(0);
  });

  it("renders the forms and the date", () => {
    const msg = planLapseEmail({
      organizationName: "Acme",
      recipientName: "Sam Lee",
      stage: "ending",
      reason: "cancelled",
      planId: "pro",
      endsAt: Date.UTC(2026, 9, 14),
      forms: [{ title: "Hackathon signup", url: "https://chatform.in/forms/f1", losing: ["Brand logo"], closes: true }],
      moreForms: 0,
      planUrl: "https://chatform.in/usage",
    });
    expect(msg.subject).toBe("Your chatform Pro plan ends on 14 Oct 2026");
    expect(msg.text).toContain("Hackathon signup: will close to new responses (verified payments); loses Brand logo");
    expect(msg.html).toContain("Keep Pro");
    expect(msg.html + msg.text).not.toContain("—");
  });
});
