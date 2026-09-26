import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi } from "./helpers.js";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/**
 * A customer's sign-up and sign-ins carry the same record a response does,
 * from the same function. See `lib/user-context.ts`.
 */
describe("user sign-in context", () => {
  beforeAll(applySchema);

  it("records the sign-up and each sign-in with device and browser details", async () => {
    const email = "usercontext@example.com";
    const password = "supersecret123";
    const client = encodeURIComponent(
      JSON.stringify({
        pageUrl: "https://chatform.in/pricing?utm_source=google&utm_campaign=launch&token=secret",
        referrer: "https://www.google.com/",
        screen: "1440x900",
        timezone: "Europe/Berlin",
      }),
    );
    const headers = {
      "content-type": "application/json",
      "user-agent": CHROME_MAC,
      "accept-language": "en-IN,en;q=0.9",
      "x-chatform-client": client,
    };

    const res = await fetchApi("/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password, name: "User Context" }),
    });
    expect(res.ok).toBe(true);
    const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: string }>();

    await env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(user!.id).run();
    const signin = await fetchApi("/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    });
    expect(signin.ok).toBe(true);

    const rows = await env.DB.prepare(
      `SELECT kind, method, context_json FROM user_sign_ins WHERE user_id = ? ORDER BY created_at ASC`,
    )
      .bind(user!.id)
      .all<{ kind: string; method: string; context_json: string }>();
    expect(rows.results.map((r) => [r.kind, r.method])).toEqual([
      ["sign_up", "email"],
      ["sign_in", "email"],
    ]);

    const context = JSON.parse(rows.results[0]!.context_json);
    expect(context.device).toMatchObject({ type: "desktop", browser: "Chrome", os: "macOS" });
    expect(context.language).toBe("en-IN");
    expect(context.screen).toBe("1440x900");
    expect(context.timezone).toBe("Europe/Berlin");
    expect(context.referrer).toBe("https://www.google.com/");
    expect(context.utm).toEqual({ source: "google", campaign: "launch" });
  });

  it("still signs up when the header is garbage", async () => {
    const res = await fetchApi("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-chatform-client": "%E0%A4%A{not json" },
      body: JSON.stringify({ email: "garbage@example.com", password: "supersecret123", name: "G" }),
    });
    expect(res.ok).toBe(true);
    const row = await env.DB.prepare(
      `SELECT si.kind FROM user_sign_ins si JOIN users u ON u.id = si.user_id WHERE u.email = ?`,
    )
      .bind("garbage@example.com")
      .first<{ kind: string }>();
    expect(row?.kind).toBe("sign_up");
  });
});
