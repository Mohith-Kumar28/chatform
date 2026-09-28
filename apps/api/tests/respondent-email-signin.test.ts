import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, app, type Tenant } from "./helpers.js";
import { mintEmailToken } from "../src/lib/signed-url.js";
import { RESUME_TTL_DAYS } from "../src/lib/followups.js";
import { PLANS } from "@repo/entitlements";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import type { Bindings } from "../src/env.js";

/**
 * Signing in to a form with a code sent to an email address.
 *
 * The third door beside Google and phone. What is worth pinning: the code only
 * goes out for a form that asks for it, the right code clears the gate as an
 * identity filed under the address, a wrong one does not, and the address is a
 * verified one, so everything keyed on a verified email (reminders, resume
 * links) treats it as such.
 */

let t: Tenant;
const VERSION_ID = "ver_esi01";
const SLUG = "email-signin-form";

const DOC = {
  schemaVersion: 6,
  title: "Email sign-in",
  blocks: [
    { id: "blk_esi00001", ref: "q_name", type: "short_text", title: "Your name?", required: true, minLength: 0, maxLength: 80 },
    { id: "blk_esi00002", ref: "q_team", type: "short_text", title: "Team size?", required: true, minLength: 0, maxLength: 80 },
  ],
  endings: [{ id: "end_esi00001", ref: "end_thanks", title: "All done!", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  theme: {},
};

async function publish(method: "email" | "google" = "email"): Promise<void> {
  const settings = {
    agent: { mode: "template" },
    followUp: { enabled: true },
    requireAuth: { enabled: true, method, afterBlocks: 0 },
  };
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR REPLACE INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(VERSION_ID, t.formId, JSON.stringify({ ...DOC, settings }), now, t.userId),
    env.DB.prepare(`UPDATE forms SET slug = ?, status = 'published', active_version_id = ? WHERE id = ?`).bind(
      SLUG,
      VERSION_ID,
      t.formId,
    ),
  ]);
}

// Development, so the code comes back in the response rather than only by mail.
const bindings = () => ({ ...(env as unknown as Bindings), ENVIRONMENT: "development" }) as Bindings;
const call = (path: string, init: RequestInit) => app.fetch(new Request(`http://localhost${path}`, init), bindings());

type Session = { sessionId: string; respondentToken: string };

async function open(body: Record<string, unknown> = {}): Promise<Session> {
  const res = await call(`/p/forms/${SLUG}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Session;
}

const post = (s: Session, path: string, body: unknown) =>
  call(`/p/sessions/${s.sessionId}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-respondent-token": s.respondentToken },
    body: JSON.stringify(body),
  });

/**
 * The response row, once it exists. Answers are projected to D1 alongside the
 * turn rather than inside it, so the row lands a moment after the 202.
 */
async function firstSubmission(): Promise<{
  id: string;
  respondent_provider: string | null;
  respondent_subject: string | null;
  respondent_email: string | null;
}> {
  for (let i = 0; i < 50; i++) {
    const row = await env.DB.prepare(
      `SELECT id, respondent_provider, respondent_subject, respondent_email FROM submissions LIMIT 1`,
    ).first<{ id: string; respondent_provider: string | null; respondent_subject: string | null; respondent_email: string | null }>();
    if (row) return row;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("no response row was written");
}

async function sendCode(s: Session, email: string): Promise<string> {
  const res = await post(s, "auth/email/start", { email });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { sentTo: string; devCode: string };
  expect(body.sentTo).toBe(email.trim().toLowerCase());
  return body.devCode;
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("emailsignin");
  // A paid plan: `requireAuth` is plan-gated, and a gate `clampForRuntime` had
  // switched off would refuse every code for the wrong reason.
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('business', 'business', 'Business', ?1, ?2, 'USD', ?3, ?4, 1, 2)
     ON CONFLICT (id) DO UPDATE SET features_json = excluded.features_json`,
  )
    .bind(
      PLANS.business.priceMonthlyCents,
      PLANS.business.priceYearlyCents,
      JSON.stringify(PLANS.business.features),
      JSON.stringify(PLANS.business.limits),
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?1, ?2, 'business', ?3, 'monthly', 'active', ?4, ?5, 1, ?6, ?6)`,
  )
    .bind(`sub_esi_${t.orgId}`, t.orgId, `dodo_esi_${t.orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now())
    .run();
  await invalidateEntitlements(env as never, t.orgId);
});

beforeEach(async () => {
  await env.DB.prepare(`DELETE FROM submission_answers`).run();
  await env.DB.prepare(`DELETE FROM submissions`).run();
  await env.DB.prepare(`DELETE FROM otp_challenges`).run();
  await env.DB.prepare(`DELETE FROM chat_sessions`).run();
  await publish("email");
});

describe("email sign-in", () => {
  it("signs them in with the code that was sent, as the address", async () => {
    const s = await open();
    const code = await sendCode(s, "  Maya@Northwind.Example ");

    const res = await post(s, "auth/email/verify", { code });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; identity: { provider: string; label: string } };
    expect(body.identity).toMatchObject({ provider: "email", label: "maya@northwind.example" });

    const row = await env.DB.prepare(`SELECT respondent_identity FROM chat_sessions WHERE id = ?`)
      .bind(s.sessionId)
      .first<{ respondent_identity: string }>();
    expect(JSON.parse(row!.respondent_identity)).toMatchObject({
      provider: "email",
      subject: "maya@northwind.example",
      email: "maya@northwind.example",
    });
  });

  it("files answers under the verified address", async () => {
    const s = await open();
    await post(s, "auth/email/verify", { code: await sendCode(s, "maya@northwind.example") });
    const res = await post(s, "messages", { type: "structured", ref: "q_name", value: "Maya" });
    expect(res.status).toBe(202);

    const sub = await firstSubmission();
    expect(sub).toMatchObject({
      respondent_provider: "email",
      respondent_subject: "maya@northwind.example",
      respondent_email: "maya@northwind.example",
    });
  });

  it("refuses a wrong code and keeps the gate shut", async () => {
    const s = await open();
    const code = await sendCode(s, "maya@northwind.example");
    const wrong = code === "000000" ? "111111" : "000000";

    const res = await post(s, "auth/email/verify", { code: wrong });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("wrong_code");
    // Still gated: an answer is turned away.
    expect((await post(s, "messages", { type: "structured", ref: "q_name", value: "Maya" })).status).toBe(400);
  });

  it("will not take a code before one was sent", async () => {
    const s = await open();
    const res = await post(s, "auth/email/verify", { code: "123456" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("no_challenge");
  });

  it("sends nothing for a form that does not sign in by email", async () => {
    await publish("google");
    const s = await open();
    const res = await post(s, "auth/email/start", { email: "maya@northwind.example" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("email_signin_off");
    const sent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM otp_challenges`).first<{ n: number }>();
    expect(sent?.n).toBe(0);
  });

  it("refuses something that is not an address", async () => {
    const s = await open();
    const res = await post(s, "auth/email/start", { email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_email");
  });

  it("gives a returning respondent their open response back", async () => {
    const first = await open();
    await post(first, "auth/email/verify", { code: await sendCode(first, "maya@northwind.example") });
    await post(first, "messages", { type: "structured", ref: "q_name", value: "Maya" });
    const original = await firstSubmission();
    await env.DB.prepare(`UPDATE submissions SET status = 'abandoned'`).run();

    const second = await open();
    const res = await post(second, "auth/email/verify", { code: await sendCode(second, "maya@northwind.example") });
    expect(((await res.json()) as { resumed: boolean }).resumed).toBe(true);
    const rows = await env.DB.prepare(`SELECT id, status FROM submissions`).all<{ id: string; status: string }>();
    expect(rows.results).toEqual([{ id: original!.id, status: "in_progress" }]);
  });

  it("resumes from a reminder link straight away, because the address is verified", async () => {
    const first = await open();
    await post(first, "auth/email/verify", { code: await sendCode(first, "maya@northwind.example") });
    await post(first, "messages", { type: "structured", ref: "q_name", value: "Maya" });
    const original = await firstSubmission();
    await env.DB.prepare(`UPDATE submissions SET status = 'abandoned'`).run();

    const resumeToken = await mintEmailToken(env as unknown as Bindings, "resume", original!.id, RESUME_TTL_DAYS);
    const s = await open({ resumeToken });
    const session = await env.DB.prepare(`SELECT submission_id, held_resume_id FROM chat_sessions WHERE id = ?`)
      .bind(s.sessionId)
      .first<{ submission_id: string | null; held_resume_id: string | null }>();
    expect(session).toEqual({ submission_id: original!.id, held_resume_id: null });
  });
});
