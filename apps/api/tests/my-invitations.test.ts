import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi, seedTenant, type Tenant } from "./helpers.js";

/**
 * The invitations the dashboard prompts a signed-in person with.
 *
 * The bug: someone invited to a workspace signed up without the email link
 * and nothing in the app said they had been invited. The only list lived in
 * Settings, and it offered Accept on invitations that had already lapsed.
 */
describe("my invitations", () => {
  let owner: Tenant;
  let invitee: Tenant;

  beforeAll(async () => {
    await applySchema();
    owner = await seedTenant("myinvowner");
    invitee = await seedTenant("myinvitee");
  });

  const seed = async (id: string, over: { email?: string; status?: string; expiresAt?: number } = {}) => {
    await env.DB.prepare(
      `INSERT INTO invitations (id, organization_id, email, role, status, expires_at, inviter_id, created_at)
       VALUES (?, ?, ?, 'member', ?, ?, ?, ?)`,
    )
      .bind(
        id,
        owner.orgId,
        over.email ?? "MyInvitee@example.com",
        over.status ?? "pending",
        over.expiresAt ?? Date.now() + 86_400_000,
        owner.userId,
        Date.now(),
      )
      .run();
  };

  const list = async (cookie: string) => {
    const res = await fetchApi("/api/me/invitations", { headers: { cookie } });
    expect(res.status).toBe(200);
    return ((await res.json()) as { invitations: { id: string; workspaces: { slug: string }[] }[] }).invitations;
  };

  it("lists a live invite to the person's own address, with its workspaces", async () => {
    await seed("inv_mine");
    await env.DB.prepare(`INSERT INTO invitation_workspaces (invitation_id, workspace_id, role) VALUES (?, ?, 'editor')`)
      .bind("inv_mine", owner.workspaceId)
      .run();

    const mine = await list(invitee.cookie);
    expect(mine.map((i) => i.id)).toEqual(["inv_mine"]);
    expect(mine[0]!.workspaces.map((w) => w.slug)).toEqual(["default"]);
  });

  it("leaves out expired, answered and other people's invites", async () => {
    await seed("inv_lapsed", { expiresAt: Date.now() - 60_000 });
    await seed("inv_revoked", { status: "canceled" });
    await seed("inv_other", { email: "someone@example.com" });

    expect((await list(invitee.cookie)).map((i) => i.id)).toEqual(["inv_mine"]);
    expect(await list(owner.cookie)).toEqual([]);
  });

  it("needs a session", async () => {
    expect((await fetchApi("/api/me/invitations")).status).toBe(401);
  });
});
