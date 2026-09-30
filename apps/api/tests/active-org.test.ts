import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi, seedTenant } from "./helpers.js";

/**
 * A session has to know which organization it is in.
 *
 * `/team` asks Better Auth for the active organization rather than resolving one
 * from `members` the way the API does, so a session with a null
 * `active_organization_id` showed "No organization is active" to a user whose
 * workspace was named in the nav bar directly above it. Signup creates the org
 * and the membership; this asserts the session that follows points at it.
 *
 * "The session that follows" is now the one from sign-in rather than the one
 * from sign-up: with `requireEmailVerification` on, creating the account no
 * longer creates a session at all. The property under test is unchanged — the
 * first session a new account gets lands in the org signup made for it.
 */
describe("session active organization", () => {
  beforeAll(applySchema);

  it("points a new account's first session at the org signup created", async () => {
    const email = "activeorg@example.com";
    const password = "supersecret123";
    const res = await fetchApi("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: "Active Org" }),
    });
    expect(res.ok).toBe(true);

    const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
      .bind(email)
      .first<{ id: string }>();
    expect(user).toBeTruthy();

    const member = await env.DB.prepare(
      `SELECT organization_id AS org FROM members WHERE user_id = ?`,
    )
      .bind(user!.id)
      .first<{ org: string }>();
    expect(member?.org).toBeTruthy();

    // Stand in for a redeemed code. `email-verification.test.ts` is what proves
    // the gate itself; here it is only the precondition for having a session.
    await env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(user!.id).run();
    const signin = await fetchApi("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(signin.ok).toBe(true);

    const session = await env.DB.prepare(
      `SELECT active_organization_id AS active FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(user!.id)
      .first<{ active: string | null }>();

    expect(session?.active).toBe(member!.org);
  });

  it("opens a new account in its own named org and workspace", async () => {
    const email = "firstworkspace@example.com";
    const res = await fetchApi("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "supersecret123", name: "Priya Sharma" }),
    });
    expect(res.ok).toBe(true);

    const row = await env.DB.prepare(
      `SELECT o.name AS org, w.name AS ws, w.slug AS slug
         FROM users u JOIN members m ON m.user_id = u.id
         JOIN organizations o ON o.id = m.organization_id
         JOIN workspaces w ON w.organization_id = o.id
        WHERE u.email = ?`,
    )
      .bind(email)
      .all<{ org: string; ws: string; slug: string }>();
    // Exactly one workspace: the "Name your workspace" screen is not a new
    // account's first stop any more.
    expect(row.results).toEqual([{ org: "Priya's Org", ws: "Priya's Workspace", slug: "priya-s-workspace" }]);
  });

  it("gives an organization made from the switcher a workspace too", async () => {
    const t = await seedTenant("neworgws");
    const res = await fetchApi("/api/auth/organization/create", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: t.cookie, origin: "http://localhost" },
      body: JSON.stringify({ name: "Acme", slug: "acme-neworgws" }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const { id } = (await res.json()) as { id: string };
    const ws = await env.DB.prepare(`SELECT name FROM workspaces WHERE organization_id = ?`).bind(id).all<{ name: string }>();
    expect(ws.results).toEqual([{ name: "neworgws's Workspace" }]);
  });
});
