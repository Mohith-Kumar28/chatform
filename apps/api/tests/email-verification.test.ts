import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi } from "./helpers.js";

/**
 * An address is not an identity until somebody proves they can read it.
 *
 * Sign-up used to return a working session immediately, which meant the email
 * on an account was only ever a string the person typed — you could open an
 * account on a colleague's address, or on one that does not exist, and every
 * promise that hangs off the address (password reset, invitations, submission
 * notifications) inherited that lie.
 *
 * These are the two halves that matter: creating the account grants nothing,
 * and the door opens once the address is confirmed. The confirmation itself is
 * applied directly rather than by redeeming a real code — Better Auth stores
 * the OTP hashed, so reading it back would assert the plugin's storage format
 * instead of our gate.
 */
describe("email verification gate", () => {
  beforeAll(applySchema);

  const email = "unverified@example.com";
  const password = "supersecret123";

  it("creates the account but issues no session at sign-up", async () => {
    const res = await fetchApi("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: "Unverified" }),
    });
    expect(res.ok).toBe(true);

    const user = await env.DB.prepare(`SELECT id, email_verified AS verified FROM users WHERE email = ?`)
      .bind(email)
      .first<{ id: string; verified: number }>();
    expect(user).toBeTruthy();
    expect(user!.verified).toBe(0);

    const sessions = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`)
      .bind(user!.id)
      .first<{ n: number }>();
    expect(sessions?.n).toBe(0);
  });

  it("refuses sign-in while the address is unconfirmed", async () => {
    const res = await fetchApi("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(res.ok).toBe(false);

    const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
      .bind(email)
      .first<{ id: string }>();
    const sessions = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`)
      .bind(user!.id)
      .first<{ n: number }>();
    expect(sessions?.n).toBe(0);
  });

  it("lets the same credentials through once the address is confirmed", async () => {
    await env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE email = ?`).bind(email).run();

    const res = await fetchApi("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(res.ok).toBe(true);
    expect((res.headers.get("set-cookie") ?? "").length).toBeGreaterThan(0);
  });

  it("does not let a wrong password through a confirmed address", async () => {
    const res = await fetchApi("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "not-the-password" }),
    });
    expect(res.ok).toBe(false);
  });
});
