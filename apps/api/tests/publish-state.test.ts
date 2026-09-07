import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import { publishFingerprint, hasUnpublishedChanges } from "../src/lib/publish-state.js";
import { PLANS, type PlanId } from "@repo/entitlements";

const DB = () => env as unknown as Bindings;

let org: Tenant;

const auth = (t: Tenant) => ({ cookie: t.cookie, "content-type": "application/json" });

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

async function setPlan(orgId: string, planId: PlanId): Promise<void> {
  await DB()
    .DB.prepare(
      `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status, seats, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'monthly', 'active', 1, ?, ?)
       ON CONFLICT (dodo_subscription_id) DO UPDATE SET plan_id = excluded.plan_id`,
    )
    .bind(`sub_ps_${orgId}`, orgId, planId, `dodo_ps_${orgId}`, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(DB(), orgId);
}

interface FormState {
  activeVersion: number | null;
  publishedAt: number | null;
  hasUnpublishedChanges: boolean;
}

const read = async (): Promise<FormState> =>
  (await fetchApi(`/api/forms/${org.formId}`, { headers: auth(org) })).json<FormState>();

const save = (doc: unknown) =>
  fetchApi(`/api/forms/${org.formId}/doc`, { method: "PUT", headers: auth(org), body: JSON.stringify({ doc }) });

const publish = () => fetchApi(`/api/forms/${org.formId}/publish`, { method: "POST", headers: auth(org) });

beforeAll(async () => {
  await applySchema();
  await seedPlans();
  org = await seedTenant("pubstate");
});

beforeEach(async () => {
  await DB().DB.prepare(`DELETE FROM form_versions WHERE form_id = ?`).bind(org.formId).run();
  await DB()
    .DB.prepare(`UPDATE forms SET status = 'draft', active_version_id = NULL WHERE id = ?`)
    .bind(org.formId)
    .run();
  await DB().DB.prepare(`DELETE FROM subscriptions WHERE organization_id = ?`).bind(org.orgId).run();
  await invalidateEntitlements(DB(), org.orgId);
});

describe("the publish clock", () => {
  it("has nothing to be out of date with before the first publish", async () => {
    await save(minimalDoc("pubstate"));
    const state = await read();
    expect(state).toMatchObject({ activeVersion: null, publishedAt: null, hasUnpublishedChanges: false });
  });

  it("is up to date the moment it publishes", async () => {
    await save(minimalDoc("pubstate"));
    expect((await publish()).status).toBe(200);

    const state = await read();
    expect(state.activeVersion).toBe(1);
    expect(state.publishedAt).toBeGreaterThan(0);
    expect(state.hasUnpublishedChanges).toBe(false);
  });

  it("notices an edit made after publishing", async () => {
    const doc = minimalDoc("pubstate");
    await save(doc);
    await publish();
    expect((await read()).hasUnpublishedChanges).toBe(false);

    await save({ ...doc, title: "Edited after going live" });
    expect((await read()).hasUnpublishedChanges).toBe(true);

    await publish();
    expect((await read()).hasUnpublishedChanges).toBe(false);
  });

  it("does not call a re-save of the same document a change", async () => {
    /*
      The one that decides whether this feature is usable. Autosave fires on a timer and
      the builder rebuilds block objects as people click around, so an untouched form gets
      written back constantly. If key order or a no-op write registered as an edit, every
      live form would sit permanently under an amber "unpublished changes" dot and the
      indicator would mean nothing.
    */
    const doc = minimalDoc("pubstate");
    await save(doc);
    await publish();

    await save(doc);
    expect((await read()).hasUnpublishedChanges).toBe(false);
  });

  it("treats an upgrade as something to publish, because the live form would differ", async () => {
    /*
      A free user authors their logo and brand name, publishes, and gets a version with
      both stripped out. Buying Pro does not change the draft — so a fingerprint over the
      document alone would say "up to date" while the live form still wore our footer, and
      nothing would ever tell them to republish.
    */
    await save({
      ...minimalDoc("pubstate"),
      settings: { branding: { hidePoweredBy: true } },
      theme: { brandName: "Acme", logoUrl: "https://cdn.example/logo.png" },
    });
    await publish();
    expect((await read()).hasUnpublishedChanges).toBe(false);

    await setPlan(org.orgId, "pro");
    expect((await read()).hasUnpublishedChanges).toBe(true);
  });
});

describe("the fingerprint itself", () => {
  it("ignores key order and whitespace", () => {
    const a = JSON.stringify({ title: "x", blocks: [{ id: "b1", type: "text" }] });
    const b = '{\n  "blocks": [ { "type": "text", "id": "b1" } ],\n  "title": "x"\n}';
    expect(publishFingerprint(a, "free")).toBe(publishFingerprint(b, "free"));
  });

  it("separates the plans, so the same draft fingerprints differently", () => {
    const doc = JSON.stringify({ title: "x" });
    expect(publishFingerprint(doc, "free")).not.toBe(publishFingerprint(doc, "pro"));
  });

  it("stays quiet about versions published before checksums meant anything", () => {
    // A pre-existing row holds `crypto.randomUUID().slice(0, 16)`. Reporting those as
    // changed would put a wrong amber dot on every form in every existing account.
    expect(
      hasUnpublishedChanges({ workingSchema: '{"title":"x"}', planId: "free", activeChecksum: "3f2a19c8b7e04d51" }),
    ).toBe(false);
  });

  it("survives a working schema it cannot parse rather than throwing", () => {
    expect(() => publishFingerprint("{not json", "free")).not.toThrow();
  });
});
