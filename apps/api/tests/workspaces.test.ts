import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import { PLANS } from "@repo/entitlements";
import { invalidateEntitlements } from "../src/lib/entitlements.js";

/**
 * Workspaces — the second level, and the tenancy hole that opened when it
 * became reachable.
 *
 * `workspaces` and `forms.workspace_id` shipped with the first migration, but
 * nothing created a second row and nothing displayed the first, so
 * `requireWorkspace` took a caller-supplied id and inserted it unchecked. That
 * was inert only for as long as no client sent the field. These tests are the
 * reason it stays closed.
 */

let alice: Tenant;
let bob: Tenant;

async function seedPlan(id: "free" | "pro"): Promise<void> {
  const plan = PLANS[id];
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, 1, 0) ON CONFLICT (id) DO UPDATE SET limits_json = excluded.limits_json`,
  )
    .bind(id, id, plan.name, plan.priceMonthlyCents, plan.priceYearlyCents, JSON.stringify(plan.features), JSON.stringify(plan.limits))
    .run();
}

async function subscribe(orgId: string, planId: "pro"): Promise<void> {
  await seedPlan(planId);
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'monthly', 'active', ?, ?, 1, ?, ?) ON CONFLICT (dodo_subscription_id) DO NOTHING`,
  )
    .bind(`sub_ws_${orgId}`, orgId, planId, `dodo_ws_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const auth = (t: Tenant) => ({ cookie: t.cookie });
const json = (t: Tenant) => ({ cookie: t.cookie, "content-type": "application/json" });

beforeAll(async () => {
  await applySchema();
  await seedPlan("free");
  alice = await seedTenant("wsalice");
  bob = await seedTenant("wsbob");
});

describe("workspace CRUD", () => {
  it("lists the workspace the tenant was seeded with, and counts its forms", async () => {
    const res = await fetchApi("/api/workspaces", { headers: auth(alice) });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ id: string; slug: string; formCount: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(alice.workspaceId);
    expect(rows[0]!.formCount).toBe(1);
  });

  it("creates one, and derives a slug from the name", async () => {
    await subscribe(alice.orgId, "pro");
    const res = await fetchApi("/api/workspaces", {
      method: "POST",
      headers: json(alice),
      body: JSON.stringify({ name: "Product Research" }),
    });
    expect(res.status).toBe(200);
    const ws = (await res.json()) as { id: string; slug: string; formCount: number };
    expect(ws.slug).toBe("product-research");
    expect(ws.formCount).toBe(0);
  });

  it("counts up rather than colliding on a duplicate name", async () => {
    const res = await fetchApi("/api/workspaces", {
      method: "POST",
      headers: json(alice),
      body: JSON.stringify({ name: "Product Research" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { slug: string }).slug).toBe("product-research-2");
  });

  it("renames, and re-slugs with it", async () => {
    const list = (await (await fetchApi("/api/workspaces", { headers: auth(alice) })).json()) as Array<{ id: string; slug: string }>;
    const target = list.find((w) => w.slug === "product-research-2")!;
    const res = await fetchApi(`/api/workspaces/${target.id}`, {
      method: "PATCH",
      headers: json(alice),
      body: JSON.stringify({ name: "Sales" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { slug: string }).slug).toBe("sales");
  });

  it("refuses to delete a workspace that still holds forms", async () => {
    const res = await fetchApi(`/api/workspaces/${alice.workspaceId}`, { method: "DELETE", headers: auth(alice) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("workspace_not_empty");
  });

  it("deletes an empty one", async () => {
    const list = (await (await fetchApi("/api/workspaces", { headers: auth(alice) })).json()) as Array<{ id: string; slug: string }>;
    const target = list.find((w) => w.slug === "sales")!;
    const res = await fetchApi(`/api/workspaces/${target.id}`, { method: "DELETE", headers: auth(alice) });
    expect(res.status).toBe(200);
    const after = (await (await fetchApi("/api/workspaces", { headers: auth(alice) })).json()) as unknown[];
    expect(after).toHaveLength(2);
  });

  it("refuses to delete the last workspace in an organization", async () => {
    // bob has exactly one, and it holds a form — so empty it first to prove the
    // refusal is about being last rather than about being non-empty.
    await env.DB.prepare(`UPDATE forms SET deleted_at = ? WHERE workspace_id = ?`).bind(Date.now(), bob.workspaceId).run();
    const res = await fetchApi(`/api/workspaces/${bob.workspaceId}`, { method: "DELETE", headers: auth(bob) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("last_workspace");
  });
});

describe("workspace scoping", () => {
  it("lists only the forms in the workspace named by ?ws=", async () => {
    const created = (await (
      await fetchApi("/api/workspaces", {
        method: "POST",
        headers: json(alice),
        body: JSON.stringify({ name: "Marketing" }),
      })
    ).json()) as { id: string; slug: string };

    const empty = (await (await fetchApi(`/api/forms?ws=${created.slug}`, { headers: auth(alice) })).json()) as unknown[];
    expect(empty).toHaveLength(0);

    const seeded = (await (await fetchApi("/api/forms", { headers: auth(alice) })).json()) as unknown[];
    expect(seeded).toHaveLength(1);
  });

  it("creates a form into the workspace it was told, and moves it back out", async () => {
    const list = (await (await fetchApi("/api/workspaces", { headers: auth(alice) })).json()) as Array<{ id: string; slug: string }>;
    const marketing = list.find((w) => w.slug === "marketing")!;

    const created = await fetchApi("/api/forms", {
      method: "POST",
      headers: json(alice),
      body: JSON.stringify({ title: "Campaign survey", workspaceId: marketing.id }),
    });
    expect(created.status).toBe(200);
    const form = (await created.json()) as { id: string };

    expect((await (await fetchApi(`/api/forms?ws=marketing`, { headers: auth(alice) })).json()) as unknown[]).toHaveLength(1);

    const moved = await fetchApi(`/api/forms/${form.id}/workspace`, {
      method: "PATCH",
      headers: json(alice),
      body: JSON.stringify({ workspaceId: alice.workspaceId }),
    });
    expect(moved.status).toBe(200);
    expect((await (await fetchApi(`/api/forms?ws=marketing`, { headers: auth(alice) })).json()) as unknown[]).toHaveLength(0);
  });

  it("404s on a workspace belonging to another organization", async () => {
    const res = await fetchApi(`/api/forms?ws=${bob.workspaceId}`, { headers: auth(alice) });
    expect(res.status).toBe(404);
  });

  /**
   * The bug this file exists for. `POST /forms` took `workspaceId` from the
   * body and `requireWorkspace` inserted it without asking whose it was, so a
   * form could be planted in another tenant's workspace.
   */
  it("refuses to create a form in another organization's workspace, and writes nothing", async () => {
    const before = await env.DB.prepare(`SELECT COUNT(*) AS n FROM forms WHERE workspace_id = ?`)
      .bind(bob.workspaceId)
      .first<{ n: number }>();

    const res = await fetchApi("/api/forms", {
      method: "POST",
      headers: json(alice),
      body: JSON.stringify({ title: "Trespass", workspaceId: bob.workspaceId }),
    });
    expect(res.status).toBe(404);

    const after = await env.DB.prepare(`SELECT COUNT(*) AS n FROM forms WHERE workspace_id = ?`)
      .bind(bob.workspaceId)
      .first<{ n: number }>();
    expect(after!.n).toBe(before!.n);
  });

  it("refuses to move a form into another organization's workspace", async () => {
    const res = await fetchApi(`/api/forms/${alice.formId}/workspace`, {
      method: "PATCH",
      headers: json(alice),
      body: JSON.stringify({ workspaceId: bob.workspaceId }),
    });
    expect(res.status).toBe(404);
    const row = await env.DB.prepare(`SELECT workspace_id FROM forms WHERE id = ?`)
      .bind(alice.formId)
      .first<{ workspace_id: string }>();
    expect(row!.workspace_id).toBe(alice.workspaceId);
  });
});

describe("the plan limit now counts workspaces", () => {
  /**
   * Free sells one workspace. Before this change the gauge counted
   * organizations the person owned, so it read "1 of 1" on every account
   * forever and the switcher happily made a second — which was a whole new
   * organization on the free plan, not a workspace at all.
   */
  it("refuses a second workspace on Free with an upgrade prompt, not a 403", async () => {
    const carol = await seedTenant("wscarol");
    const res = await fetchApi("/api/workspaces", {
      method: "POST",
      headers: json(carol),
      body: JSON.stringify({ name: "Second" }),
    });
    expect(res.status).toBe(402);
    const { error } = (await res.json()) as { error: { code: string; limit: number; used: number; requiredPlan: string | null } };
    expect(error.code).toBe("limit_reached");
    expect(error.limit).toBe(PLANS.free.limits.workspaces_count);
    expect(error.used).toBe(1);
    // The refusal must offer the tier that actually fixes it, or the gate is a
    // dead end rather than an upsell.
    expect(error.requiredPlan).toBe("pro");
  });

  it("reports the real workspace count on /billing/entitlements", async () => {
    const res = await fetchApi("/api/billing/entitlements", { headers: auth(alice) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gauges: { workspaces_count: number } };
    const actual = await env.DB.prepare(`SELECT COUNT(*) AS n FROM workspaces WHERE organization_id = ?`)
      .bind(alice.orgId)
      .first<{ n: number }>();
    expect(body.gauges.workspaces_count).toBe(actual!.n);
    expect(body.gauges.workspaces_count).toBeGreaterThan(1);
  });
});
