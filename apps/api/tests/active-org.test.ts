import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi } from "./helpers.js";

/**
 * A session has to know which organization it is in.
 *
 * `/team` asks Better Auth for the active organization rather than resolving one
 * from `members` the way the API does, so a session with a null
 * `active_organization_id` showed "No organization is active" to a user whose
 * workspace was named in the nav bar directly above it. Signup creates the org
 * and the membership; this asserts the session that follows points at it.
 */
describe("session active organization", () => {
  beforeAll(applySchema);

  it("points a freshly signed-up session at the org signup created", async () => {
    const email = "activeorg@example.com";
    const res = await fetchApi("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "supersecret123", name: "Active Org" }),
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

    const session = await env.DB.prepare(
      `SELECT active_organization_id AS active FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(user!.id)
      .first<{ active: string | null }>();

    expect(session?.active).toBe(member!.org);
  });
});
