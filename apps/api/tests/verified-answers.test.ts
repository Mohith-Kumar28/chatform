import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import type { SessionDO } from "../src/do/session-do.js";

/**
 * An answer that has to prove itself.
 *
 * Driven over `/v1` rather than against the Durable Object directly, because
 * the property that matters is the one a caller sees: the answer is *not* in
 * the response until the code comes back, and a wrong code changes nothing.
 *
 * The email channel throughout. It leaves through the mail queue, which is
 * bound in the test runtime — the SMS path would need Twilio credentials and an
 * outbound call to Twilio, which is not a thing a test run should be able to
 * make. The two share one implementation (`startOtpChallenge`), and the scoping
 * that keeps them apart is pinned in `respondent-auth.test.ts`.
 */

let t: Tenant;
let key: string;

const DOC = {
  schemaVersion: 6,
  title: "Verified",
  blocks: [
    {
      id: "blk_vaemail1",
      ref: "q_email",
      type: "email",
      title: "Email?",
      required: true,
      verify: true,
    },
    { id: "blk_vaname01", ref: "q_name", type: "short_text", title: "Name?", required: false, minLength: 0, maxLength: 80 },
  ],
  endings: [{ id: "end_va00001", ref: "end_thanks", title: "All done!", bodyMd: "Thanks." }],
  logic: [], endingRules: [], variables: [], hiddenFields: [], layout: {},
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: false } },
  theme: {},
};

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

async function subscribe(orgId: string, plan: "pro" | "business"): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  const p = PLANS[plan];
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES (?1, ?1, ?2, ?3, ?4, 'USD', ?5, ?6, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(plan, p.name, p.priceMonthlyCents, p.priceYearlyCents, JSON.stringify(p.features), JSON.stringify(p.limits))
    .run();
  // Replaced rather than upserted: the plan is switched back and forth to test
  // what a downgrade does, and one row per org is the whole state.
  await env.DB.prepare(`DELETE FROM subscriptions WHERE organization_id = ?1`).bind(orgId).run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'monthly', 'active', ?5, ?6, 1, ?7, ?7)`,
  )
    .bind(`sub_va_${orgId}_${plan}`, orgId, plan, `dodo_va_${orgId}_${plan}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

async function publish(doc: unknown, versionId: string, formId: string, userId: string): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4) ON CONFLICT (id) DO UPDATE SET schema_json = excluded.schema_json`,
    ).bind(versionId, formId, JSON.stringify(doc), now, userId),
    env.DB.prepare(`UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`).bind(
      JSON.stringify(doc),
      versionId,
      formId,
    ),
  ]);
}

/**
 * Plant a code we know.
 *
 * The runtime only hands back the generated code in development, and the test
 * runtime is not development — deliberately, since that guard is what stops a
 * misconfigured production from printing codes. So the challenge row's hash is
 * replaced with the hash of a code of our choosing, computed exactly as the
 * verifier will compute it.
 */
async function plantCode(sessionId: string, ref: string, code: string): Promise<void> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${sessionId}:${code}`));
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const res = await env.DB.prepare(
    `UPDATE otp_challenges SET code_hash = ?3, attempts = 0
      WHERE session_id = ?1 AND scope = ?2 AND consumed_at IS NULL`,
  )
    .bind(sessionId, `block:${ref}`, hash)
    .run();
  expect(res.meta.changes, "no outstanding challenge to plant a code into").toBeGreaterThan(0);
}

interface TurnBody {
  accepted: boolean;
  question: { ref: string } | null;
  events: { type: string; data: Record<string, unknown> }[];
  answers: Record<string, unknown>;
  validation: { ref: string; code: string; message: string } | null;
  pendingVerification: { ref: string; channel: string; sentTo: string } | null;
}

const open = async (): Promise<string> =>
  ((await (await api(`/v1/forms/${t.formId}/sessions`, { method: "POST", body: "{}" })).json()) as { sessionId: string })
    .sessionId;

const answer = async (sessionId: string, ref: string, value: unknown): Promise<TurnBody> =>
  (await (
    await api(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref, value }),
    })
  ).json()) as TurnBody;

const say = async (sessionId: string, text: string): Promise<TurnBody> =>
  (await (
    await api(`/v1/sessions/${sessionId}/messages`, { method: "POST", body: JSON.stringify({ type: "text", text }) })
  ).json()) as TurnBody;

const act = async (sessionId: string, action: string): Promise<TurnBody> =>
  (await (
    await api(`/v1/sessions/${sessionId}/actions`, { method: "POST", body: JSON.stringify({ action }) })
  ).json()) as TurnBody;

const types = (b: TurnBody) => b.events.map((e) => e.type);

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("verans");
  await subscribe(t.orgId, "business");
  key = (await seedKey(t, "veranskey")).raw;
  await publish(DOC, "ver_verans", t.formId, t.userId);
});

describe("a question that verifies its answer", () => {
  it("holds the answer until the code comes back", async () => {
    const sid = await open();

    const given = await answer(sid, "q_email", "  Maya@Northwind.CO ");
    expect(types(given)).toContain("verify_required");
    // Normalized, not as typed: the code went to the address we will store.
    expect(given.pendingVerification).toMatchObject({
      ref: "q_email",
      channel: "email",
      sentTo: "maya@northwind.co",
    });
    // The whole point. Nothing unverified reaches the answers.
    expect(given.answers.q_email).toBeUndefined();
    expect(types(given)).not.toContain("answer_recorded");

    await plantCode(sid, "q_email", "483920");

    const wrong = await say(sid, "111111");
    expect(wrong.validation).toMatchObject({ ref: "q_email", code: "invalid_code" });
    expect(wrong.answers.q_email).toBeUndefined();
    // Still waiting: a wrong code is not a way out of the question.
    expect(wrong.pendingVerification?.ref).toBe("q_email");

    const right = await say(sid, "483920");
    expect(types(right)).toContain("verify_settled");
    expect(right.answers.q_email).toBe("maya@northwind.co");
    expect(right.pendingVerification).toBeNull();
    expect(right.question?.ref).toBe("q_name");
  });

  it("keeps the code out of the transcript", async () => {
    const sid = await open();
    await answer(sid, "q_email", "leak@northwind.co");
    await plantCode(sid, "q_email", "222333");
    await say(sid, "222333");

    const res = await api(`/v1/sessions/${sid}/transcript`);
    const text = res.ok ? await res.text() : "";
    // Whatever this endpoint returns, the one string that must never be in it
    // is the code. A transcript is something the form owner reads back.
    expect(text).not.toContain("222333");
  });

  it("does not spend the code twice", async () => {
    const sid = await open();
    await answer(sid, "q_email", "once@northwind.co");
    await plantCode(sid, "q_email", "445566");
    expect((await say(sid, "445566")).answers.q_email).toBe("once@northwind.co");

    const row = await env.DB.prepare(
      `SELECT consumed_at FROM otp_challenges WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(sid)
      .first<{ consumed_at: number | null }>();
    expect(row?.consumed_at).toBeTruthy();
  });

  it("lets them go back and change what they typed", async () => {
    const sid = await open();
    await answer(sid, "q_email", "typo@northwnid.co");
    const back = await act(sid, "change_answer");
    expect(types(back)).toContain("verify_settled");
    expect(back.pendingVerification).toBeNull();
    // The question is asked again rather than the conversation moving on.
    expect(back.question?.ref).toBe("q_email");

    // And answering it afresh starts a new challenge.
    const second = await answer(sid, "q_email", "right@northwind.co");
    expect(second.pendingVerification?.sentTo).toBe("right@northwind.co");
  });

  it("refuses a resend when nothing is waiting on one", async () => {
    const sid = await open();
    const res = await api(`/v1/sessions/${sid}/actions`, {
      method: "POST",
      body: JSON.stringify({ action: "resend_code" }),
    });
    expect(res.status).toBe(400);
  });

  it("does not ask somebody to confirm an address they signed in with", async () => {
    const sid = await open();
    /*
     * The identity is attached directly: minting a Google ID token the verifier
     * would accept is `respondent-auth.test.ts`'s job, and what is under test
     * here is what the *answer* does once one exists.
     */
    const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sid)) as unknown as DurableObjectStub<SessionDO>;
    await stub.attachIdentity({
      provider: "google",
      subject: "google-sub-verans",
      email: "signed.in@northwind.co",
      phone: null,
      name: "Maya",
      pictureUrl: null,
      verifiedAt: Date.now(),
    });

    const same = await answer(sid, "q_email", "Signed.In@northwind.co");
    expect(types(same)).not.toContain("verify_required");
    expect(same.answers.q_email).toBe("signed.in@northwind.co");
  });

  it("still asks when they type a different address from the one they signed in with", async () => {
    const sid = await open();
    const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sid)) as unknown as DurableObjectStub<SessionDO>;
    await stub.attachIdentity({
      provider: "google",
      subject: "google-sub-verans2",
      email: "signed.in@northwind.co",
      phone: null,
      name: "Maya",
      pictureUrl: null,
      verifiedAt: Date.now(),
    });

    const other = await answer(sid, "q_email", "someone.else@northwind.co");
    expect(types(other)).toContain("verify_required");
    expect(other.answers.q_email).toBeUndefined();
  });
});

describe("what the plan allows", () => {
  it("records the answer as given when the plan does not include verification", async () => {
    // Pro has every collection feature except the verified ones, so the flag on
    // the published document is switched off on the way in and the question
    // behaves exactly as it did before it existed.
    await subscribe(t.orgId, "pro");
    try {
      const sid = await open();
      const given = await answer(sid, "q_email", "pro@northwind.co");
      expect(types(given)).not.toContain("verify_required");
      expect(given.answers.q_email).toBe("pro@northwind.co");
    } finally {
      await subscribe(t.orgId, "business");
    }
  });
});
