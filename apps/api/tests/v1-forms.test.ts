import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * Forms over HTTP.
 *
 * The point of this surface is that a customer's own tooling can build and ship
 * a form without a person in a browser — so the assertions that matter are the
 * ones that prove it goes through the same validation and the same plan gates
 * the builder does, rather than a looser path around them.
 */

let t: Tenant;
let key: string;

const GOOD_DOC = {
  title: "Programmatic",
  blocks: [
    { id: "blk_pgemail1", ref: "q_email", type: "email", title: "Email?", required: true },
  ],
  endings: [{ id: "end_pg00001", ref: "end_thanks", title: "Thanks!" }],
};

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
    .bind(`sub_fm_${orgId}`, orgId, `dodo_fm_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1forms");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "v1formskey", {
    scopes: { form: ["read", "write", "publish"], response: ["read"], session: ["create", "write", "read"] },
  })).raw;
});

describe("create and edit", () => {
  it("creates a draft with a real document, not an empty shell", async () => {
    const res = await api("/v1/forms", { method: "POST", body: JSON.stringify({ title: "From the API" }) });
    expect(res.status).toBe(201);
    const form = (await res.json()) as { id: string; status: string; slug: string };
    expect(form.status).toBe("draft");

    // Storing an unvalidated shell is what once made every consumer reading
    // nested settings crash, so a blank form is still materialised through the
    // schema.
    const doc = await api(`/v1/forms/${form.id}?view=document`);
    const body = (await doc.json()) as { doc: { settings: { branding: unknown }; blocks: unknown[] } };
    expect(body.doc.settings.branding).toBeTruthy();
    expect(body.doc.blocks.length).toBeGreaterThan(0);
  });

  it("refuses a document the schema rejects", async () => {
    const res = await api("/v1/forms", {
      method: "POST",
      body: JSON.stringify({ title: "Bad", doc: { title: "Bad", blocks: [{ type: "nonsense" }], endings: [] } }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_doc");
  });

  it("saves a draft with lint problems, and reports them", async () => {
    const created = (await (await api("/v1/forms", { method: "POST", body: JSON.stringify({ title: "Lint me" }) })).json()) as { id: string };
    const res = await api(`/v1/forms/${created.id}/doc`, {
      method: "PUT",
      body: JSON.stringify({
        doc: {
          ...GOOD_DOC,
          logic: [
            { id: "rl_dangling", action_kind: "goto", from: "q_email", when: null, target: "q_nope", targetKind: "block" },
          ],
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { issues: { code: string }[] };
    // Building a form means passing through invalid states; publishing is where
    // they become errors.
    expect(body.issues.some((i) => i.code === "dangling_target")).toBe(true);
  });
});

describe("publish", () => {
  it("refuses to publish a document with lint errors", async () => {
    const created = (await (await api("/v1/forms", { method: "POST", body: JSON.stringify({ title: "Broken" }) })).json()) as { id: string };
    await api(`/v1/forms/${created.id}/doc`, {
      method: "PUT",
      body: JSON.stringify({
        doc: {
          ...GOOD_DOC,
          logic: [
            { id: "rl_dangling", action_kind: "goto", from: "q_email", when: null, target: "q_nope", targetKind: "block" },
          ],
        },
      }),
    });

    const res = await api(`/v1/forms/${created.id}/publish`, { method: "POST" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("lint_failed");
  });

  it("publishes a clean document and serves it publicly", async () => {
    const created = (await (await api("/v1/forms", { method: "POST", body: JSON.stringify({ title: "Shippable" }) })).json()) as { id: string };
    await api(`/v1/forms/${created.id}/doc`, { method: "PUT", body: JSON.stringify({ doc: GOOD_DOC }) });

    const res = await api(`/v1/forms/${created.id}/publish`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; versionId: string };
    expect(body.version).toBe(1);

    // And it is now openable, which is the whole point of publishing.
    const config = await api(`/v1/forms/${created.id}`);
    expect(config.status).toBe(200);
    const session = await api(`/v1/forms/${created.id}/sessions`, { method: "POST", body: "{}" });
    expect(session.status).toBe(200);
  });
});

describe("scopes", () => {
  it("refuses to publish with a key that may only write", async () => {
    const writeOnly = (await seedKey(t, "v1formswrite", { scopes: { form: ["read", "write"] } })).raw;
    const created = (await (await api("/v1/forms", { method: "POST", body: JSON.stringify({ title: "Scoped" }) })).json()) as { id: string };

    const res = await fetchApi(`/v1/forms/${created.id}/publish`, {
      method: "POST",
      headers: { "x-api-key": writeOnly, "content-type": "application/json" },
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { required: string } }).error.required).toBe("form:publish");
  });

  it("hides forms outside a pinned key's list", async () => {
    const created = (await (await api("/v1/forms", { method: "POST", body: JSON.stringify({ title: "Pinned out" }) })).json()) as { id: string };
    const pinned = (await seedKey(t, "v1formspin", { formIds: [t.formId] })).raw;

    // 404 rather than 403: a pinned key must not learn which ids exist.
    const res = await fetchApi(`/v1/forms/${created.id}`, { headers: { "x-api-key": pinned } });
    expect(res.status).toBe(404);

    const list = await fetchApi("/v1/forms?status=all", { headers: { "x-api-key": pinned } });
    const body = (await list.json()) as { data: { id: string }[] };
    expect(body.data.every((f) => f.id === t.formId)).toBe(true);
  });
});

describe("delete", () => {
  it("is soft, so responses stay readable", async () => {
    const created = (await (await api("/v1/forms", { method: "POST", body: JSON.stringify({ title: "Bye" }) })).json()) as { id: string };
    expect((await api(`/v1/forms/${created.id}`, { method: "DELETE" })).status).toBe(200);

    const row = await env.DB.prepare(`SELECT deleted_at, status FROM forms WHERE id = ?`)
      .bind(created.id)
      .first<{ deleted_at: number; status: string }>();
    expect(row!.deleted_at).toBeGreaterThan(0);
    expect(row!.status).toBe("archived");

    // Deleting twice is not found, not a second delete.
    expect((await api(`/v1/forms/${created.id}`, { method: "DELETE" })).status).toBe(404);
  });
});
