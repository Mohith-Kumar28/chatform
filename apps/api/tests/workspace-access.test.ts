import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import { PLANS } from "@repo/entitlements";

/**
 * Per-workspace access: an organization member opens only the workspaces they
 * were added to, at the role they were given there. Owners and admins open all.
 */

const DB = () => (env as unknown as Bindings).DB;
const auth = (t: { cookie: string }) => ({ cookie: t.cookie, "content-type": "application/json" });
const post = (t: { cookie: string }, path: string, body: unknown, method = "POST") =>
  fetchApi(path, { method, headers: { ...auth(t), origin: "http://localhost" }, body: JSON.stringify(body) });

let owner: Tenant;
/** Workspace A is the owner's seeded one; B is a second workspace in the same org. */
const wsB = "ws_wsaccess_b";
const formB = "frm_wsaccess_b";

async function seedPlans() {
  for (const plan of Object.values(PLANS)) {
    await DB()
      .prepare(
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

/**
 * A second person in the owner's organization: their own signup (so a real
 * session cookie), then a membership row here and the session pointed at it.
 */
async function addTeammate(label: string, orgRole: string, grants: Record<string, "editor" | "viewer">) {
  const t = await seedTenant(label);
  const memberId = `mem_${label}_in_owner`;
  await DB()
    .prepare(`INSERT INTO members (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(memberId, owner.orgId, t.userId, orgRole, Date.now())
    .run();
  for (const [ws, role] of Object.entries(grants)) {
    await DB()
      .prepare(`INSERT INTO workspace_members (id, workspace_id, member_id, role, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(`wm_${label}_${ws}`, ws, memberId, role, Date.now())
      .run();
  }
  await DB().prepare(`UPDATE sessions SET active_organization_id = ? WHERE user_id = ?`).bind(owner.orgId, t.userId).run();
  return { ...t, memberId };
}

beforeAll(async () => {
  await applySchema();
  await seedPlans();
  owner = await seedTenant("wsaccess");
  const now = Date.now();
  await DB().batch([
    DB()
      .prepare(`INSERT INTO workspaces (id, organization_id, name, slug, created_by, created_at) VALUES (?, ?, 'Sales', 'sales', ?, ?)`)
      .bind(wsB, owner.orgId, owner.userId, now + 1),
    DB()
      .prepare(
        `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Sales form', 'wsaccess-sales', 'draft', ?, 'salt', ?, ?)`,
      )
      .bind(formB, owner.orgId, wsB, owner.userId, JSON.stringify(minimalDoc("wsaccess-b")), now, now),
    // Business, so there are seats to invite into.
    DB()
      .prepare(
        `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                    current_period_start, current_period_end, seats, created_at, updated_at)
         VALUES (?, ?, 'business', ?, 'monthly', 'active', ?, ?, 10, ?, ?)`,
      )
      .bind(`sub_wsaccess`, owner.orgId, `dodo_wsaccess`, now - 1000, now + 86_400_000 * 20, now, now),
  ]);
  await invalidateEntitlements(env as unknown as Bindings, owner.orgId);
});

describe("a member added to one workspace", () => {
  let editor: Awaited<ReturnType<typeof addTeammate>>;
  beforeAll(async () => {
    editor = await addTeammate("wsaccess_ed", "member", { [owner.workspaceId]: "editor" });
  });

  it("sees only that workspace in the list", async () => {
    const res = await fetchApi("/api/workspaces", { headers: auth(editor) });
    const list = await res.json<{ id: string; myRole: string; permissions: Record<string, string[]> }[]>();
    expect(list.map((w) => w.id)).toEqual([owner.workspaceId]);
    expect(list[0]!.myRole).toBe("editor");
    expect(list[0]!.permissions.form).toContain("publish");
  });

  it("cannot reach the other workspace, by slug or by any of its forms", async () => {
    expect((await fetchApi("/api/forms?ws=sales", { headers: auth(editor) })).status).toBe(404);
    expect((await fetchApi(`/api/forms/${formB}`, { headers: auth(editor) })).status).toBe(404);
    expect((await fetchApi(`/api/forms/${formB}/submissions`, { headers: auth(editor) })).status).toBe(404);
    expect((await fetchApi(`/api/forms/${formB}/analytics`, { headers: auth(editor) })).status).toBe(404);
    expect((await fetchApi(`/api/forms/${formB}/knowledge`, { headers: auth(editor) })).status).toBe(404);
  });

  it("still works in its own workspace", async () => {
    expect((await fetchApi(`/api/forms/${owner.formId}`, { headers: auth(editor) })).status).toBe(200);
    const list = await fetchApi("/api/forms", { headers: auth(editor) });
    expect((await list.json<{ id: string }[]>()).map((f) => f.id)).toContain(owner.formId);
  });

  it("cannot create a form in, or move one into, a workspace it cannot open", async () => {
    const create = await post(editor, "/api/forms", { title: "x", workspaceId: wsB });
    expect(create.status).toBe(404);
    const move = await post(editor, `/api/forms/${owner.formId}/workspace`, { workspaceId: wsB }, "PATCH");
    expect(move.status).toBe(404);
  });

  it("cannot create workspaces or manage access", async () => {
    expect((await post(editor, "/api/workspaces", { name: "Mine" })).status).toBe(403);
    expect((await fetchApi(`/api/workspaces/${owner.workspaceId}/members`, { headers: auth(editor) })).status).toBe(403);
  });

  it("does not see organization-wide webhooks", async () => {
    await DB()
      .prepare(`INSERT INTO webhooks (id, organization_id, form_id, url, secret, events, active, created_at) VALUES (?, ?, NULL, 'https://example.com/h', 'whsec_x', '["submission.completed"]', 1, ?)`)
      .bind("wh_wsaccess_org", owner.orgId, Date.now())
      .run();
    const list = await (await fetchApi("/api/webhooks", { headers: auth(editor) })).json<{ id: string }[]>();
    expect(list.map((w) => w.id)).not.toContain("wh_wsaccess_org");
    const create = await post(editor, "/api/webhooks", { url: "https://example.com/y", events: ["submission.completed"], formId: null });
    expect(create.status).toBe(403);
  });
});

describe("a viewer in one workspace, editor in another", () => {
  let mixed: Awaited<ReturnType<typeof addTeammate>>;
  beforeAll(async () => {
    mixed = await addTeammate("wsaccess_mix", "member", { [owner.workspaceId]: "viewer", [wsB]: "editor" });
  });

  it("reads but cannot change the form it only views", async () => {
    const read = await fetchApi(`/api/forms/${owner.formId}`, { headers: auth(mixed) });
    expect(read.status).toBe(200);
    // The builder opens read-only from this, rather than failing every save.
    const perms = (await read.json<{ permissions: Record<string, string[]> }>()).permissions;
    expect(perms.form).toEqual(["read"]);
    expect((await post(mixed, `/api/forms/${owner.formId}/publish`, {})).status).toBe(403);
    expect((await fetchApi(`/api/forms/${owner.formId}`, { method: "DELETE", headers: { ...auth(mixed), origin: "http://localhost" } })).status).toBe(403);
  });

  it("edits where it is an editor", async () => {
    const create = await post(mixed, "/api/forms", { title: "Sales intake", workspaceId: wsB });
    expect(create.status).toBe(200);
  });

  it("cannot drop a form into the workspace it only views", async () => {
    const move = await post(mixed, `/api/forms/${formB}/workspace`, { workspaceId: owner.workspaceId }, "PATCH");
    expect(move.status).toBe(403);
  });

  it("cannot create a form in the workspace it only views", async () => {
    const create = await post(mixed, "/api/forms", { title: "x", workspaceId: owner.workspaceId });
    expect(create.status).toBe(403);
  });
});

describe("a member with no workspace", () => {
  it("lands on an empty list, not an auto-created workspace", async () => {
    const none = await addTeammate("wsaccess_none", "member", {});
    expect(await (await fetchApi("/api/workspaces", { headers: auth(none) })).json()).toEqual([]);
    expect(await (await fetchApi("/api/forms", { headers: auth(none) })).json()).toEqual([]);
    const create = await post(none, "/api/forms", { title: "x" });
    // Refused at the role gate: holding no grant anywhere is holding no form rights.
    expect(create.status).toBe(403);
  });
});

describe("admins", () => {
  it("open every workspace without a grant", async () => {
    const admin = await addTeammate("wsaccess_adm", "admin", {});
    const list = await (await fetchApi("/api/workspaces", { headers: auth(admin) })).json<{ id: string }[]>();
    expect(list.map((w) => w.id).sort()).toEqual([owner.workspaceId, wsB].sort());
    expect((await fetchApi(`/api/forms/${formB}`, { headers: auth(admin) })).status).toBe(200);
  });
});

describe("managing access", () => {
  it("adds, lists and removes a member from a workspace", async () => {
    const t = await addTeammate("wsaccess_mgmt", "member", { [owner.workspaceId]: "viewer" });
    expect((await post(owner, `/api/workspaces/${wsB}/members/${t.memberId}`, { role: "editor" }, "PUT")).status).toBe(200);
    const members = await (await fetchApi(`/api/workspaces/${wsB}/members`, { headers: auth(owner) })).json<
      { memberId: string; role: string; viaOrgRole: boolean }[]
    >();
    expect(members.find((m) => m.memberId === t.memberId)?.role).toBe("editor");
    expect(members.find((m) => m.memberId === `mem_wsaccess`)?.viaOrgRole).toBe(true);
    expect((await fetchApi(`/api/forms/${formB}`, { headers: auth(t) })).status).toBe(200);

    const del = await fetchApi(`/api/workspaces/${wsB}/members/${t.memberId}`, { method: "DELETE", headers: { ...auth(owner), origin: "http://localhost" } });
    expect(del.status).toBe(200);
    expect((await fetchApi(`/api/forms/${formB}`, { headers: auth(t) })).status).toBe(404);
  });

  it("sets a person's whole access in one save, and refuses a member with nothing", async () => {
    const t = await addTeammate("wsaccess_set", "member", { [owner.workspaceId]: "editor" });
    const empty = await post(owner, `/api/members/${t.memberId}/access`, { role: "member", workspaces: [] }, "PUT");
    expect(empty.status).toBe(409);

    const set = await post(owner, `/api/members/${t.memberId}/access`, { role: "member", workspaces: [{ workspaceId: wsB, role: "viewer" }] }, "PUT");
    expect(set.status).toBe(200);
    const access = await (await fetchApi("/api/workspace-access", { headers: auth(owner) })).json<{
      members: Record<string, { workspaceId: string; role: string }[]>;
    }>();
    expect(access.members[t.memberId]).toEqual([expect.objectContaining({ workspaceId: wsB, role: "viewer" })]);

    const promote = await post(owner, `/api/members/${t.memberId}/access`, { role: "admin", workspaces: [] }, "PUT");
    expect(promote.status).toBe(200);
    expect((await fetchApi(`/api/forms/${owner.formId}`, { headers: auth(t) })).status).toBe(200);
  });

  it("refuses a workspace from another organization", async () => {
    const t = await addTeammate("wsaccess_x", "member", { [owner.workspaceId]: "editor" });
    const other = await seedTenant("wsaccess_other");
    const res = await post(owner, `/api/members/${t.memberId}/access`, { role: "member", workspaces: [{ workspaceId: other.workspaceId, role: "editor" }] }, "PUT");
    expect(res.status).toBe(404);
  });

  it("drops every grant when the person leaves the organization", async () => {
    const t = await addTeammate("wsaccess_leave", "member", { [owner.workspaceId]: "editor", [wsB]: "viewer" });
    await DB().prepare(`DELETE FROM members WHERE id = ?`).bind(t.memberId).run();
    const left = await DB().prepare(`SELECT COUNT(*) AS n FROM workspace_members WHERE member_id = ?`).bind(t.memberId).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});

describe("inviting into workspaces", () => {
  it("carries the workspaces through to the accepted membership", async () => {
    const invitee = await seedTenant("wsaccess_inv");
    const res = await post(owner, "/api/invitations", {
      email: "wsaccess_inv@example.com",
      role: "member",
      workspaces: [{ workspaceId: wsB, role: "viewer" }],
    });
    expect(res.status).toBe(200);
    const { id } = await res.json<{ id: string }>();

    const preview = await (await fetchApi(`/api/invitation-preview?id=${id}`)).json<{ workspaces: { name: string; role: string }[] }>();
    expect(preview.workspaces).toEqual([{ name: "Sales", role: "viewer" }]);

    const accept = await post(invitee, "/api/auth/organization/accept-invitation", { invitationId: id });
    expect(accept.status).toBe(200);
    await DB().prepare(`UPDATE sessions SET active_organization_id = ? WHERE user_id = ?`).bind(owner.orgId, invitee.userId).run();

    const list = await (await fetchApi("/api/workspaces", { headers: auth(invitee) })).json<{ id: string; myRole: string }[]>();
    expect(list).toEqual([expect.objectContaining({ id: wsB, myRole: "viewer" })]);
  });

  it("refuses a member invitation with no workspace", async () => {
    const res = await post(owner, "/api/invitations", { email: "nobody-ws@example.com", role: "member", workspaces: [] });
    expect(res.status).toBe(409);
  });
});
