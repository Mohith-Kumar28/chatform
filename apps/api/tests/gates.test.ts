import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { invalidateEntitlements, meter, getEntitlements } from "../src/lib/entitlements.js";
import { stripForPublish, clampForRuntime, brandingHiddenFor, checkDocLimits } from "../src/lib/doc-entitlements.js";
import { PLANS, resolve, type PlanId } from "@repo/entitlements";
import { FormDoc } from "@repo/form-schema";

const DB = () => env as unknown as Bindings;

let org: Tenant;

async function seedPlans(): Promise<void> {
  for (const plan of Object.values(PLANS)) {
    await DB()
      .DB.prepare(
        `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, seat_price_cents,
                            currency, features_json, limits_json, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?)
         ON CONFLICT (id) DO UPDATE SET features_json = excluded.features_json, limits_json = excluded.limits_json`,
      )
      .bind(plan.id, plan.id, plan.name, plan.priceMonthlyCents, plan.priceYearlyCents, plan.seatPriceCents,
            JSON.stringify(plan.features), JSON.stringify(plan.limits), plan.sortOrder)
      .run();
  }
}

/** Put the tenant on a plan without going through Dodo. */
async function setPlan(orgId: string, planId: PlanId): Promise<void> {
  await DB().DB.prepare(`DELETE FROM subscriptions WHERE organization_id = ?`).bind(orgId).run();
  if (planId !== "free") {
    await DB()
      .DB.prepare(
        `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                    current_period_start, current_period_end, seats, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'monthly', 'active', ?, ?, 1, ?, ?)`,
      )
      .bind(`sub_${planId}_${orgId}`, orgId, planId, `dodo_${planId}_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
      .run();
  }
  await invalidateEntitlements(DB(), orgId);
}

async function setRole(orgId: string, role: string): Promise<void> {
  await DB().DB.prepare(`UPDATE members SET role = ? WHERE organization_id = ?`).bind(role, orgId).run();
}

const auth = (t: Tenant) => ({ cookie: t.cookie, "content-type": "application/json" });

/** A published form with N submissions of the given statuses. */
async function seedSubmissions(formId: string, statuses: string[]): Promise<void> {
  await DB().DB.prepare(`DELETE FROM submissions WHERE form_id = ?`).bind(formId).run();
  for (const [i, status] of statuses.entries()) {
    await DB()
      .DB.prepare(
        `INSERT INTO submissions (id, form_id, organization_id, status, started_at, completed_at, duration_ms)
         VALUES (?, ?, (SELECT organization_id FROM forms WHERE id = ?), ?, ?, ?, ?)`,
      )
      .bind(
        `sub_${formId}_${i}`,
        formId,
        formId,
        status,
        Date.now() - i * 1000,
        status === "completed" ? Date.now() : null,
        status === "completed" ? 42_000 : null,
      )
      .run();
  }
}

beforeAll(async () => {
  await applySchema();
  await seedPlans();
  org = await seedTenant("gate");
});

beforeEach(async () => {
  await setPlan(org.orgId, "free");
  await setRole(org.orgId, "owner");
  await DB().DB.prepare(`DELETE FROM usage_counters WHERE organization_id = ?`).bind(org.orgId).run();
  await DB().DB.prepare(`DELETE FROM feature_access_log WHERE organization_id = ?`).bind(org.orgId).run();
});

// ─────────────────────────── the revenue gate ───────────────────────────

describe("partial responses — the gate that pays for everything", () => {
  beforeEach(async () => {
    await seedSubmissions(org.formId, ["completed", "completed", "abandoned", "abandoned", "in_progress"]);
  });

  it("serves completed responses free", async () => {
    const res = await fetchApi(`/api/forms/${org.formId}/submissions?status=completed`, { headers: auth(org) });
    expect(res.status).toBe(200);
    expect(await res.json<unknown[]>()).toHaveLength(2);
  });

  it("refuses the unfinished ones on Free, and says how many there are", async () => {
    const res = await fetchApi(`/api/forms/${org.formId}/submissions?status=abandoned`, { headers: auth(org) });
    expect(res.status).toBe(402);
    const body = await res.json<{ error: { code: string; feature: string; requiredPlan: string; context: { count: number; noun: string }; upgradeUrl: string } }>();
    expect(body.error.code).toBe("feature_locked");
    expect(body.error.feature).toBe("partial_responses");
    expect(body.error.requiredPlan).toBe("pro");
    // The number is the whole pitch: "3 people started and didn't finish."
    expect(body.error.context.count).toBe(3);
    expect(body.error.context.noun).toBe("partial responses");
    expect(body.error.upgradeUrl).toBe("/billing?plan=pro&from=partial_responses");
  });

  it("degrades the default `all` view to completed-only rather than erroring", async () => {
    // The results page must still render on Free.
    const res = await fetchApi(`/api/forms/${org.formId}/submissions?status=all`, { headers: auth(org) });
    expect(res.status).toBe(200);
    const rows = await res.json<{ status: string }[]>();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "completed")).toBe(true);
  });

  it("never lets an unentitled row leave the server", async () => {
    // A blurred table in the client is a presentation choice, not a boundary.
    const res = await fetchApi(`/api/forms/${org.formId}/submissions?status=all&limit=200`, { headers: auth(org) });
    const text = await res.text();
    expect(text).not.toContain("abandoned");
    expect(text).not.toContain("in_progress");
  });

  it("serves them on Pro", async () => {
    await setPlan(org.orgId, "pro");
    const res = await fetchApi(`/api/forms/${org.formId}/submissions?status=abandoned`, { headers: auth(org) });
    expect(res.status).toBe(200);
    expect(await res.json<unknown[]>()).toHaveLength(2);
  });

  it("keeps the count free even while the rows are locked", async () => {
    // The analytics `abandoned` field is basic analytics, so the UI can truthfully say
    // "3 people started and didn't finish" while holding none of what they said.
    const res = await fetchApi(`/api/forms/${org.formId}/analytics`, { headers: auth(org) });
    const body = await res.json<{ abandoned: number; starts: number }>();
    expect(body.abandoned).toBe(2);
    expect(body.starts).toBe(5);
  });

  it("does not trust a viewer with them even on Business", async () => {
    await setPlan(org.orgId, "business");
    await setRole(org.orgId, "viewer");
    const res = await fetchApi(`/api/forms/${org.formId}/submissions?status=abandoned`, { headers: auth(org) });
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string; upgradeUrl: string | null } }>();
    // A role denial, so no upsell — upgrading could not fix it.
    expect(body.error.code).toBe("forbidden");
    expect(body.error.upgradeUrl).toBeNull();
  });

  it("logs the denial as a funnel event", async () => {
    await fetchApi(`/api/forms/${org.formId}/submissions?status=abandoned`, { headers: auth(org) });
    const row = await DB()
      .DB.prepare(`SELECT feature, surface, denial_count FROM feature_access_log WHERE organization_id = ?`)
      .bind(org.orgId)
      .first<{ feature: string; surface: string; denial_count: number }>();
    expect(row).toMatchObject({ feature: "partial_responses", surface: "results.partial" });
  });
});

describe("advanced analytics", () => {
  beforeEach(async () => {
    await seedSubmissions(org.formId, ["completed", "completed", "abandoned"]);
  });

  it("keeps the headline numbers real and free", async () => {
    const res = await fetchApi(`/api/forms/${org.formId}/analytics`, { headers: auth(org) });
    const body = await res.json<{ starts: number; completed: number; completionRate: number; locked: string[] }>();
    expect(body.starts).toBe(3);
    expect(body.completed).toBe(2);
    expect(body.completionRate).toBe(67);
    expect(body.locked).toContain("perBlock");
  });

  it("withholds the detail, and says what it would take to see it", async () => {
    const res = await fetchApi(`/api/forms/${org.formId}/analytics`, { headers: auth(org) });
    const body = await res.json<{
      perBlock: unknown[];
      distributions: unknown[];
      avgDurationMs: number | null;
      lockedContext: { feature: string; requiredPlan: string; questionCount: number; worstBlockTitle: string | null };
    }>();
    expect(body.perBlock).toEqual([]);
    expect(body.distributions).toEqual([]);
    expect(body.avgDurationMs).toBeNull();
    expect(body.lockedContext.feature).toBe("advanced_analytics");
    expect(body.lockedContext.requiredPlan).toBe("pro");
    // Enough truth to make the upsell honest: "most people drop off at question N".
    expect(body.lockedContext.questionCount).toBeGreaterThan(0);
    expect(body.lockedContext.worstBlockTitle).toBeTruthy();
  });

  it("serves the detail on Pro", async () => {
    await setPlan(org.orgId, "pro");
    const res = await fetchApi(`/api/forms/${org.formId}/analytics`, { headers: auth(org) });
    const body = await res.json<{ perBlock: unknown[]; locked: string[]; lockedContext: unknown }>();
    expect(body.perBlock.length).toBeGreaterThan(0);
    expect(body.locked).toEqual([]);
    expect(body.lockedContext).toBeNull();
  });

  it("withholds it from a viewer even on Pro", async () => {
    await setPlan(org.orgId, "pro");
    await setRole(org.orgId, "viewer");
    const res = await fetchApi(`/api/forms/${org.formId}/analytics`, { headers: auth(org) });
    // Degrades rather than 403s: basic analytics are legitimately theirs to read.
    expect(res.status).toBe(200);
    const body = await res.json<{ starts: number; perBlock: unknown[] }>();
    expect(body.starts).toBe(3);
    expect(body.perBlock).toEqual([]);
  });
});

describe("CSV export", () => {
  beforeEach(async () => {
    await seedSubmissions(org.formId, ["completed", "abandoned"]);
  });

  it("exports completed responses free — taking your own data out is never the paywall", async () => {
    const res = await fetchApi(`/api/forms/${org.formId}/submissions/export`, { headers: auth(org) });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("submission_id");
    expect(csv).not.toContain("abandoned");
  });

  it("gates the unfinished ones", async () => {
    const res = await fetchApi(`/api/forms/${org.formId}/submissions/export?includePartials=true`, { headers: auth(org) });
    expect(res.status).toBe(402);
    expect((await res.json<{ error: { feature: string } }>()).error.feature).toBe("export_partials");
  });

  it("includes them on Pro when asked", async () => {
    await setPlan(org.orgId, "pro");
    const res = await fetchApi(`/api/forms/${org.formId}/submissions/export?includePartials=true`, { headers: auth(org) });
    expect(await res.text()).toContain("abandoned");
  });

  it("refuses a viewer entirely", async () => {
    await setRole(org.orgId, "viewer");
    const res = await fetchApi(`/api/forms/${org.formId}/submissions/export`, { headers: auth(org) });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────── the watermark ───────────────────────────

describe("the watermark", () => {
  /** Publish a doc with `hidePoweredBy` on, and read the public config back. */
  async function publishWithBrandingOff(): Promise<Response> {
    const doc = {
      ...minimalDoc("gate"),
      settings: { branding: { hidePoweredBy: true } },
      theme: { brandName: "Acme", logoUrl: "https://cdn.example/logo.png", fontHeading: "Playfair Display" },
    };
    const put = await fetchApi(`/api/forms/${org.formId}/doc`, { method: "PUT", headers: auth(org), body: JSON.stringify({ doc }) });
    expect(put.status).toBe(200);
    return fetchApi(`/api/forms/${org.formId}/publish`, { method: "POST", headers: auth(org) });
  }

  it("lets a free user author it, then strips it at publish and says so", async () => {
    // Authoring is never blocked — they see their form wearing their logo in the builder.
    const res = await publishWithBrandingOff();
    expect(res.status).toBe(200);
    const body = await res.json<{ stripped: { feature: string; requiredPlan: string; label: string }[] }>();
    const features = body.stripped.map((s) => s.feature);
    expect(features).toContain("remove_branding");
    expect(features).toContain("brand_logo");
    expect(features).toContain("custom_fonts");
    for (const s of body.stripped) expect(s.requiredPlan).toBe("pro");
  });

  it("shows the footer on the public form however the document was authored", async () => {
    await publishWithBrandingOff();
    const res = await fetchApi(`/p/forms/gate-form/config`);
    expect(res.status).toBe(200);
    // Before this, `hidePoweredBy` was honoured straight from the document with no plan
    // check — so any free user removed the footer by flipping a toggle.
    expect((await res.json<{ brandingHidden: boolean }>()).brandingHidden).toBe(false);
  });

  it("leaves the working document untouched, so an upgrade needs no re-authoring", async () => {
    await publishWithBrandingOff();
    const res = await fetchApi(`/api/forms/${org.formId}`, { headers: auth(org) });
    const body = await res.json<{ workingSchema: { settings: { branding: { hidePoweredBy: boolean } }; theme: { brandName?: string } } }>();
    expect(body.workingSchema.settings.branding.hidePoweredBy).toBe(true);
    expect(body.workingSchema.theme.brandName).toBe("Acme");
  });

  it("honours it on Pro, and strips nothing", async () => {
    await setPlan(org.orgId, "pro");
    const res = await publishWithBrandingOff();
    expect((await res.json<{ stripped: unknown[] }>()).stripped).toEqual([]);
    const cfg = await fetchApi(`/p/forms/gate-form/config`);
    expect((await cfg.json<{ brandingHidden: boolean }>()).brandingHidden).toBe(true);
  });

  it("puts the footer back when the subscription lapses, with no republish", async () => {
    await setPlan(org.orgId, "pro");
    await publishWithBrandingOff();
    expect((await (await fetchApi(`/p/forms/gate-form/config`)).json<{ brandingHidden: boolean }>()).brandingHidden).toBe(true);

    await setPlan(org.orgId, "free");
    expect((await (await fetchApi(`/p/forms/gate-form/config`)).json<{ brandingHidden: boolean }>()).brandingHidden).toBe(false);
  });
});

// ─────────────────────────── quotas and gauges ───────────────────────────

describe("AI generation quota", () => {
  it("refuses once the monthly allowance is spent", async () => {
    const limit = PLANS.free.limits.ai_generations_per_month!;
    await meter(DB(), org.orgId, "ai_generations", limit);
    const res = await fetchApi("/api/ai/generate-form", {
      method: "POST",
      headers: auth(org),
      body: JSON.stringify({ prompt: "a short customer feedback form", questionCount: 3 }),
    });
    expect(res.status).toBe(402);
    const body = await res.json<{ error: { code: string; metric: string; used: number; limit: number; requiredPlan: string; resetsAt: number } }>();
    expect(body.error.code).toBe("limit_reached");
    expect(body.error.metric).toBe("ai_generations");
    expect(body.error.limit).toBe(limit);
    expect(body.error.requiredPlan).toBe("pro");
    expect(body.error.resetsAt).toBeGreaterThan(Date.now());
  });

  it("allows it while allowance remains, and does not spend it on a failure", async () => {
    // Aimed at a form id that does not exist, so the request 404s *after* the gates run
    // and before any upstream call. That proves the gate let it through without this test
    // depending on whether an OpenRouter key happens to be present.
    const res = await fetchApi("/api/ai/add-blocks", {
      method: "POST",
      headers: auth(org),
      body: JSON.stringify({ formId: "frm_does_not_exist", prompt: "add two questions about pricing" }),
    });
    expect(res.status).not.toBe(402);
    expect(res.status).not.toBe(403);

    // A generation that never produced anything must not have spent the allowance.
    const row = await DB()
      .DB.prepare(`SELECT used FROM usage_counters WHERE organization_id = ? AND metric = 'ai_generations'`)
      .bind(org.orgId)
      .first<{ used: number }>();
    expect(row?.used ?? 0).toBe(0);
  });

  it("refuses a viewer regardless of allowance", async () => {
    await setRole(org.orgId, "viewer");
    const res = await fetchApi("/api/ai/generate-form", {
      method: "POST",
      headers: auth(org),
      body: JSON.stringify({ prompt: "a short customer feedback form" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("the response ceiling behind 'unlimited'", () => {
  it("presents an exhausted ceiling to the respondent as a closed form, never a billing error", async () => {
    await fetchApi(`/api/forms/${org.formId}/publish`, { method: "POST", headers: auth(org) });
    await meter(DB(), org.orgId, "responses", PLANS.free.limits.responses_ceiling_per_month!);

    const res = await fetchApi("/p/forms/gate-form/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe("form_closed");
    // A stranger filling in a survey must never be told to upgrade.
    expect(body.error.message.toLowerCase()).not.toContain("upgrade");
    expect(body.error.message.toLowerCase()).not.toContain("plan");
  });

  it("reports the form as closed in the public config too", async () => {
    await fetchApi(`/api/forms/${org.formId}/publish`, { method: "POST", headers: auth(org) });
    await meter(DB(), org.orgId, "responses", PLANS.free.limits.responses_ceiling_per_month!);
    const res = await fetchApi(`/p/forms/gate-form/config`);
    expect((await res.json<{ closed: boolean }>()).closed).toBe(true);
  });
});

describe("form count", () => {
  it("refuses a new form past the plan's ceiling", async () => {
    await DB()
      .DB.prepare(
        `INSERT INTO entitlement_overrides (id, organization_id, kind, key, value, created_at)
         VALUES (?, ?, 'limit', 'forms_count', '1', ?)
         ON CONFLICT (organization_id, kind, key) DO UPDATE SET value = '1'`,
      )
      .bind(`ovr_forms`, org.orgId, Date.now())
      .run();
    await invalidateEntitlements(DB(), org.orgId);

    const res = await fetchApi("/api/forms", { method: "POST", headers: auth(org), body: JSON.stringify({ title: "Another" }) });
    expect(res.status).toBe(402);
    expect((await res.json<{ error: { metric: string } }>()).error.metric).toBe("forms_count");

    await DB().DB.prepare(`DELETE FROM entitlement_overrides WHERE organization_id = ?`).bind(org.orgId).run();
    await invalidateEntitlements(DB(), org.orgId);
  });
});

describe("API access", () => {
  it("refuses /v1 on Free with a machine-readable reason", async () => {
    const res = await fetchApi("/v1/forms", { headers: { authorization: `Bearer ${org.apiKeyRaw}` } });
    expect(res.status).toBe(402);
    const body = await res.json<{ error: { code: string; feature: string; requiredPlan: string } }>();
    expect(body.error.code).toBe("feature_locked");
    expect(body.error.feature).toBe("api_access");
    expect(body.error.requiredPlan).toBe("pro");
  });

  it("allows it on Pro and meters the request", async () => {
    await setPlan(org.orgId, "pro");
    const res = await fetchApi("/v1/forms", { headers: { authorization: `Bearer ${org.apiKeyRaw}` } });
    expect(res.status).toBe(200);
    const row = await DB()
      .DB.prepare(`SELECT used FROM usage_counters WHERE organization_id = ? AND metric = 'api_requests'`)
      .bind(org.orgId)
      .first<{ used: number }>();
    expect(row?.used).toBe(1);
  });

  it("stops minting keys on Free but still lets them be listed and revoked", async () => {
    const create = await fetchApi("/api/keys", { method: "POST", headers: auth(org), body: JSON.stringify({ name: "k" }) });
    expect(create.status).toBe(402);
    // A lapsed plan must not hide what already exists.
    expect((await fetchApi("/api/keys", { headers: auth(org) })).status).toBe(200);
  });
});

describe("the activity log", () => {
  it("is locked below Business", async () => {
    await setPlan(org.orgId, "pro");
    const res = await fetchApi("/api/audit-logs", { headers: auth(org) });
    expect(res.status).toBe(402);
    expect((await res.json<{ error: { feature: string; requiredPlan: string } }>()).error.requiredPlan).toBe("business");
  });

  it("serves entries on Business", async () => {
    await setPlan(org.orgId, "business");
    const { audit } = await import("../src/lib/gate-log.js");
    await audit(DB(), { orgId: org.orgId, action: "form.published", actorType: "user", actorId: org.userId, resourceType: "form", resourceId: org.formId });
    const res = await fetchApi("/api/audit-logs", { headers: auth(org) });
    expect(res.status).toBe(200);
    const body = await res.json<{ entries: { action: string; actorLabel: string | null }[] }>();
    expect(body.entries[0]?.action).toBe("form.published");
    // Actor names are resolved once for the whole page, not per row.
    expect(body.entries[0]?.actorLabel).toBe("gate");
  });

  it("exports as CSV on Business", async () => {
    await setPlan(org.orgId, "business");
    const res = await fetchApi("/api/audit-logs/export", { headers: auth(org) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain("timestamp");
  });

  it("refuses an editor even on Business", async () => {
    await setPlan(org.orgId, "business");
    await setRole(org.orgId, "editor");
    expect((await fetchApi("/api/audit-logs", { headers: auth(org) })).status).toBe(403);
  });
});

describe("seats", () => {
  // Better Auth rejects a state-changing call with no Origin as CSRF before any hook runs.
  const invite = (email: string) =>
    fetchApi("/api/auth/organization/invite-member", {
      method: "POST",
      headers: { ...auth(org), origin: "http://localhost" },
      body: JSON.stringify({ email, role: "editor", organizationId: org.orgId }),
    });

  it("refuses an invitation past the plan's seat count", async () => {
    // Free includes one seat, which the owner already occupies. Enforced in a Better Auth
    // organization hook rather than middleware, because the plugin owns this endpoint.
    const res = await invite("new@example.com");
    expect(res.status).toBe(402);
    const body = await res.text();
    expect(body).toContain("seat_limit");
    expect(body).toContain("Free includes 1 member");
  });

  it("counts a pending invitation, so three simultaneous invites cannot all pass", async () => {
    await setPlan(org.orgId, "pro"); // 3 seats, 1 taken by the owner
    expect((await invite("a@example.com")).status).toBe(200);
    expect((await invite("b@example.com")).status).toBe(200);
    // Two pending plus the owner fills Pro's three seats.
    expect((await invite("c@example.com")).status).toBe(402);
    await DB().DB.prepare(`DELETE FROM invitations WHERE organization_id = ?`).bind(org.orgId).run();
  });
});

describe("webhooks", () => {
  it("are free, but bounded per form", async () => {
    const create = () =>
      fetchApi("/api/webhooks", {
        method: "POST",
        headers: auth(org),
        body: JSON.stringify({ url: "https://example.com/hook", events: ["submission.completed"], formId: org.formId }),
      });
    // Free allows two per form — Youform gives webhooks away and so do we.
    expect((await create()).status).toBe(200);
    expect((await create()).status).toBe(200);
    const third = await create();
    expect(third.status).toBe(402);
    expect((await third.json<{ error: { metric: string } }>()).error.metric).toBe("webhooks_per_form");
    await DB().DB.prepare(`DELETE FROM webhooks WHERE organization_id = ?`).bind(org.orgId).run();
  });
});

// ─────────────────────── document reconciliation ───────────────────────

describe("stripForPublish", () => {
  const docWith = (overrides: Record<string, unknown>) =>
    FormDoc.parse({ ...minimalDoc("strip"), ...overrides });

  const entFor = (planId: PlanId) => resolve({ planId, status: planId === "free" ? "none" : "active", now: Date.now() });

  it("strips every Pro setting on Free and names each one", () => {
    const doc = docWith({
      settings: {
        branding: { hidePoweredBy: true },
        duplicates: { strategy: "ip_daily" },
        onComplete: { redirectUrl: "https://example.com/thanks", autoReplyEmail: { enabled: true } },
        meta: { ogTitle: "Custom", noIndex: true },
        agent: { personaPrompt: "Be terse", goal: "Qualify the lead", knowledge: [{ id: "kb_0001", title: "Pricing", body: "$24" }] },
      },
      theme: { brandName: "Acme", logoUrl: "https://cdn/x.png", fontHeading: "Playfair Display" },
    });
    const { doc: out, stripped } = stripForPublish(doc, entFor("free"));
    const features = new Set(stripped.map((s) => s.feature));
    for (const f of ["remove_branding", "brand_logo", "custom_fonts", "duplicate_prevention", "completion_redirect", "auto_reply_email", "form_metadata", "agent_persona", "agent_knowledge"]) {
      expect(features.has(f as never), f).toBe(true);
    }
    expect(out.settings.branding.hidePoweredBy).toBe(false);
    expect(out.theme.logoUrl).toBeNull();
    expect(out.settings.onComplete.redirectUrl).toBeUndefined();
    expect(out.settings.agent.knowledge).toEqual([]);
  });

  it("leaves the input document untouched", () => {
    const doc = docWith({ settings: { branding: { hidePoweredBy: true } } });
    stripForPublish(doc, entFor("free"));
    // The working document must survive so an upgrade needs no re-authoring.
    expect(doc.settings.branding.hidePoweredBy).toBe(true);
  });

  it("strips nothing a Pro plan includes", () => {
    const doc = docWith({
      settings: { branding: { hidePoweredBy: true }, onComplete: { redirectUrl: "https://example.com" } },
      theme: { brandName: "Acme" },
    });
    expect(stripForPublish(doc, entFor("pro")).stripped).toEqual([]);
  });

  it("turns a verification gate off rather than leaving it unusable", () => {
    // A respondent must never meet a sign-in step the plan cannot complete.
    const doc = docWith({ settings: { requireAuth: { enabled: true, methods: ["phone"], onePerIdentity: true } } });
    const { doc: pro } = stripForPublish(doc, entFor("pro"));
    expect(pro.settings.requireAuth.enabled).toBe(false);
    const { doc: biz, stripped } = stripForPublish(doc, entFor("business"));
    expect(biz.settings.requireAuth.enabled).toBe(true);
    expect(biz.settings.requireAuth.onePerIdentity).toBe(true);
    expect(stripped).toEqual([]);
  });

  it("truncates a knowledge base to the plan's character budget", () => {
    // The 20-entry cap is already enforced by the document schema, so what the plan layer
    // has to police is the character budget: twenty entries can still be far too large.
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: `kb_${String(i).padStart(4, "0")}`,
      title: `T${i}`,
      body: "x".repeat(2_000),
    }));
    const doc = docWith({ settings: { agent: { knowledge: entries } } });
    const { doc: out, stripped } = stripForPublish(doc, entFor("pro"));
    const total = out.settings.agent.knowledge.reduce((n, e) => n + e.title.length + e.body.length, 0);
    expect(out.settings.agent.knowledge.length).toBeLessThan(20);
    expect(total).toBeLessThanOrEqual(PLANS.pro.limits.knowledge_chars!);
    expect(stripped.some((s) => s.feature === "agent_knowledge")).toBe(true);
  });

  it("keeps a knowledge base that fits", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ id: `kb_${String(i).padStart(4, "0")}`, title: `T${i}`, body: "x".repeat(50) }));
    const doc = docWith({ settings: { agent: { knowledge: entries } } });
    const { doc: out, stripped } = stripForPublish(doc, entFor("pro"));
    expect(out.settings.agent.knowledge).toHaveLength(5);
    expect(stripped).toEqual([]);
  });

  it("drops a model override below Business", () => {
    const doc = docWith({ settings: { agent: { model: "anthropic/claude-opus-4" } } });
    expect(stripForPublish(doc, entFor("pro")).doc.settings.agent.model).toBeUndefined();
    expect(stripForPublish(doc, entFor("business")).doc.settings.agent.model).toBe("anthropic/claude-opus-4");
  });
});

describe("clampForRuntime", () => {
  const entFor = (planId: PlanId) => resolve({ planId, status: planId === "free" ? "none" : "active", now: Date.now() });

  it("caps turns and tokens instead of refusing to load", () => {
    const doc = FormDoc.parse({
      ...minimalDoc("clamp"),
      settings: { agent: { guardrails: { maxTurns: 200 }, sessionTokenBudget: 100_000 } },
    });
    const free = clampForRuntime(doc, entFor("free"));
    expect(free.settings.agent.guardrails.maxTurns).toBe(PLANS.free.limits.agent_max_turns);
    expect(free.settings.agent.sessionTokenBudget).toBe(PLANS.free.limits.agent_token_budget);
    // A form authored on Business keeps its authored values there.
    expect(clampForRuntime(doc, entFor("business")).settings.agent.guardrails.maxTurns).toBe(200);
  });

  it("never raises an authored value", () => {
    const doc = FormDoc.parse({ ...minimalDoc("clamp2"), settings: { agent: { guardrails: { maxTurns: 10 } } } });
    expect(clampForRuntime(doc, entFor("business")).settings.agent.guardrails.maxTurns).toBe(10);
  });

  it("drops a verification step a lapsed plan can no longer complete", () => {
    // The published version still says `enabled: true`; deriving it on read is what makes
    // a lapse take effect without anyone republishing.
    const doc = FormDoc.parse({
      ...minimalDoc("clamp3"),
      settings: { requireAuth: { enabled: true, methods: ["google"] } },
    });
    expect(clampForRuntime(doc, entFor("business")).settings.requireAuth.enabled).toBe(true);
    expect(clampForRuntime(doc, entFor("free")).settings.requireAuth.enabled).toBe(false);
  });
});

describe("brandingHiddenFor", () => {
  const entFor = (planId: PlanId) => resolve({ planId, status: planId === "free" ? "none" : "active", now: Date.now() });

  it("needs both the setting and the entitlement", () => {
    const on = FormDoc.parse({ ...minimalDoc("b1"), settings: { branding: { hidePoweredBy: true } } });
    const off = FormDoc.parse({ ...minimalDoc("b2"), settings: { branding: { hidePoweredBy: false } } });
    expect(brandingHiddenFor(on, entFor("free"))).toBe(false);
    expect(brandingHiddenFor(on, entFor("pro"))).toBe(true);
    // Entitled but not asked for: the footer stays, which is the default.
    expect(brandingHiddenFor(off, entFor("pro"))).toBe(false);
  });
});

describe("checkDocLimits", () => {
  it("refuses a publish over the question cap rather than truncating it", () => {
    // Silently dropping someone's 101st question would be data loss.
    const blocks = Array.from({ length: 120 }, (_, i) => ({
      id: `blk_${String(i).padStart(6, "0")}`,
      ref: `q_${i}`,
      type: "short_text",
      title: `Q${i}`,
      required: false,
    }));
    const doc = FormDoc.parse({ ...minimalDoc("lim"), blocks });
    const ent = resolve({ planId: "free", status: "none", now: Date.now() });
    const problems = checkDocLimits(doc, ent);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ limitKey: "blocks_per_form", used: 120, limit: 100 });
    expect(checkDocLimits(doc, resolve({ planId: "pro", status: "active", now: Date.now() }))).toEqual([]);
  });
});

describe("entitlements after a lapse", () => {
  it("keeps every response readable — data is never taken away", async () => {
    await seedSubmissions(org.formId, ["completed", "completed", "abandoned"]);
    await setPlan(org.orgId, "pro");
    expect((await fetchApi(`/api/forms/${org.formId}/submissions?status=abandoned`, { headers: auth(org) })).status).toBe(200);

    await setPlan(org.orgId, "free");
    // The partials are behind glass, not gone…
    expect((await fetchApi(`/api/forms/${org.formId}/submissions?status=abandoned`, { headers: auth(org) })).status).toBe(402);
    // …and the completed ones are still entirely theirs.
    const res = await fetchApi(`/api/forms/${org.formId}/submissions?status=completed`, { headers: auth(org) });
    expect(await res.json<unknown[]>()).toHaveLength(2);
    // Nothing was deleted from the database either.
    const count = await DB()
      .DB.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?`)
      .bind(org.formId)
      .first<{ n: number }>();
    expect(count?.n).toBe(3);
  });

  it("reports the plan that is actually in force", async () => {
    await setPlan(org.orgId, "business");
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("business");
    await setPlan(org.orgId, "free");
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("free");
  });
});
