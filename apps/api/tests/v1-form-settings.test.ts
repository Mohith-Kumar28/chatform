import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { resolve } from "@repo/entitlements";
import { FormDoc, leadFormFixture } from "@repo/form-schema";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import { describeSettings, patchSettings } from "../src/lib/form-settings-service.js";

/**
 * A form's settings by key, over `/v1`.
 *
 * What matters: the same parsing and plan gates the builder chat uses, a
 * refused value that says why, a locked setting reported and not applied, and
 * a pinned key that cannot reach another form's settings.
 */

let t: Tenant;
let key: string;
let readOnly: string;

const api = (path: string, init: RequestInit = {}, useKey = key) =>
  fetchApi(path, { ...init, headers: { "x-api-key": useKey, "content-type": "application/json" } });

const patch = (changes: { key: string; value: string }[], extra: Record<string, unknown> = {}) =>
  api(`/v1/forms/${t.formId}/settings`, { method: "PATCH", body: JSON.stringify({ changes, ...extra }) });

/** `/v1` itself is a Pro feature (`api_access`). */
async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?) ON CONFLICT (dodo_subscription_id) DO NOTHING`,
  )
    .bind(`sub_st_${orgId}`, orgId, `dodo_st_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1settings");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "v1settingskey", { scopes: { form: ["read", "write"] } })).raw;
  readOnly = (await seedKey(t, "v1settingsro", { scopes: { form: ["read"] } })).raw;
});

describe("GET /v1/forms/:id/settings", () => {
  it("lists every setting with its label, value and lock", async () => {
    const res = await api(`/v1/forms/${t.formId}/settings`);
    expect(res.status).toBe(200);
    const { settings } = (await res.json()) as { settings: { key: string; label: string; value: unknown; locked?: { plan: string } }[] };
    const tone = settings.find((s) => s.key === "settings.agent.tone")!;
    expect(tone).toMatchObject({ label: "Tone", value: "friendly" });
    expect(settings.find((s) => s.key === "settings.branding.hidePoweredBy")?.locked).toBeUndefined();
    expect(settings.find((s) => s.key === "settings.password.value")).toBeUndefined();
  });

  it("404s for a form the key's organization does not own", async () => {
    expect((await api(`/v1/forms/frm_nobody/settings`)).status).toBe(404);
  });
});

describe("PATCH /v1/forms/:id/settings", () => {
  it("applies what parses, reports what does not, and saves", async () => {
    const res = await patch([
      { key: "settings.closeRules.maxSubmissions", value: "200" },
      { key: "settings.closeRules.closeAt", value: "2020-01-01" },
    ]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changes: { key: string; after: unknown }[]; rejected: string[] };
    expect(body.changes).toMatchObject([{ key: "settings.closeRules.maxSubmissions", after: 200 }]);
    expect(body.rejected[0]).toMatch(/has already passed/);
    const row = await env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`).bind(t.formId).first<{ working_schema: string }>();
    expect(JSON.parse(row!.working_schema).settings.closeRules.maxSubmissions).toBe(200);
  });

  it("applies a paid setting on a plan that has it", async () => {
    const res = await patch([{ key: "settings.branding.hidePoweredBy", value: "true" }]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changes: { locked?: unknown }[] };
    expect(body.changes[0]?.locked).toBeUndefined();
    const row = await env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`).bind(t.formId).first<{ working_schema: string }>();
    expect(JSON.parse(row!.working_schema).settings.branding.hidePoweredBy).toBe(true);
  });

  it("422s when nothing in the call could be applied", async () => {
    const res = await patch([{ key: "theme.accent", value: "url(evil)" }, { key: "settings.password.value", value: "x" }]);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_settings");
    expect(body.error.message).toContain("settings.password.value: not a setting");
  });

  it("needs form:write", async () => {
    const res = await api(`/v1/forms/${t.formId}/settings`, { method: "PATCH", body: JSON.stringify({ changes: [{ key: "settings.agent.tone", value: "playful" }] }) }, readOnly);
    expect(res.status).toBe(403);
  });
});

describe("the service, on a plan without the feature", () => {
  const free = resolve({ planId: "free", status: "none", now: Date.now() });
  const doc = () => FormDoc.parse(structuredClone(leadFormFixture));

  it("marks a paid setting locked, with the plan that has it", () => {
    expect(describeSettings(doc(), free).find((s) => s.key === "settings.branding.hidePoweredBy")?.locked).toEqual({ feature: "remove_branding", plan: "Pro" });
  });

  it("reports a locked change and does not apply it", () => {
    const out = patchSettings(doc(), [{ key: "settings.branding.hidePoweredBy", value: "true" }], free, {});
    expect(out.changes[0]?.locked).toEqual({ feature: "remove_branding" });
    expect(out.doc.settings.branding.hidePoweredBy).toBe(false);
  });
});
