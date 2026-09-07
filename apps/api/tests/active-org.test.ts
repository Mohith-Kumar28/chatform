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
});
