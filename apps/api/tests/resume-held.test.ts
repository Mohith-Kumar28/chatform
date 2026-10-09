import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, app, type Tenant } from "./helpers.js";
import { mintEmailToken } from "../src/lib/signed-url.js";
import { RESUME_TTL_DAYS } from "../src/lib/followups.js";
import { PLANS } from "@repo/entitlements";
import { sha256Hex } from "@repo/form-schema";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import type { Bindings } from "../src/env.js";
import type { SessionDO } from "../src/do/session-do.js";
import { sessionObjectId } from "../src/lib/session-location.js";

/**
 * A reminder link for a response nobody proved the inbox of.
 *
 * A reminder goes to the respondent's verified email when there is one and to
 * the address they typed otherwise. A phone sign-in never proves an email, so
 * on a phone-gated form the link can land with a stranger — a typo, or somebody
 * else's address given on purpose. The link used to open the response for
 * whoever clicked, signed in as the person who started it.
 *
 * Now the session holds the response back until somebody signs in, and only the
 * phone number it is filed under gets it. The behaviour worth pinning is both
 * halves: the stranger sees nothing and gets a form of their own, and the real
 * respondent loses nothing the link used to give them.
 */

let t: Tenant;
const VERSION_ID = "ver_held01";
const SLUG = "held-form";
const FIREBASE_PROJECT_ID = "chatform-test";
const OWNER_PHONE = "+917799444494";
const STRANGER_PHONE = "+919812345678";

const DOC = {
  schemaVersion: 6,
  title: "Held resume",
  blocks: [
    { id: "blk_hld00001", ref: "q_name", type: "short_text", title: "Your name?", required: true, minLength: 0, maxLength: 80 },
    { id: "blk_hld00002", ref: "q_email", type: "email", title: "Your email?", required: true },
    { id: "blk_hld00003", ref: "q_team", type: "short_text", title: "Team size?", required: true, minLength: 0, maxLength: 80 },
  ],
  endings: [{ id: "end_hld00001", ref: "end_thanks", title: "All done!", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  theme: {},
};

type Gate = { enabled: boolean; method?: "google" | "phone"; afterBlocks?: number };

async function publish(gate: Gate, extra: Record<string, unknown> = {}): Promise<void> {
  const settings = {
    // Template mode keeps every turn deterministic and model-free.
    agent: { mode: "template" },
    followUp: { enabled: true },
    requireAuth: { method: "phone", afterBlocks: 0, ...gate },
    ...extra,
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

/**
 * A response that got through two questions and was left, filed under a
 * sign-in. A phone sign-in carries no email; a Google one does.
 */
async function seedAbandoned(
  id: string,
  who: { provider: "phone" | "google"; subject: string; email?: string } = { provider: "phone", subject: OWNER_PHONE },
  status = "abandoned",
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test, started_at,
                              updated_at, completed_at, active_ms, respondent_provider, respondent_subject,
                              respondent_email, respondent_phone)
     VALUES (?1, ?2, ?3, ?4, ?5, 'chat', 0, ?6, ?6, ?7, 60000, ?8, ?9, ?10, ?11)`,
  )
    .bind(
      id,
      t.formId,
      VERSION_ID,
      t.orgId,
      status,
      now - 3_600_000,
      status === "completed" ? now - 7_200_000 : null,
      who.provider,
      who.subject,
      who.email ?? null,
      who.provider === "phone" ? who.subject : null,
    )
    .run();
  const answers: [string, string, unknown][] = [
    ["q_name", "short_text", "Maya"],
    // The typed address the reminder went to, which nobody proved.
    ["q_email", "email", "someone.else@northwind.example"],
  ];
  for (const [ref, type, value] of answers) {
    await env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(`ans_${id}_${ref}`, id, t.formId, ref, type, JSON.stringify(value), now)
      .run();
  }
}

/** One reminder already sent (the one clicked) and one still waiting. */
async function seedFollowUps(submissionId: string): Promise<void> {
  const now = Date.now();
  for (const [id, step, status] of [
    [`flw_${submissionId}_1`, 1, "sent"],
    [`flw_${submissionId}_2`, 2, "scheduled"],
  ] as const) {
    await env.DB.prepare(
      `INSERT INTO followups (id, submission_id, form_id, organization_id, channel, address,
                              address_source, step, status, scheduled_at, sent_at, created_at)
       VALUES (?, ?, ?, ?, 'email', 'someone.else@northwind.example', 'answer', ?, ?, ?, ?, ?)`,
    )
      .bind(id, submissionId, t.formId, t.orgId, step, status, now, status === "sent" ? now : null, now)
      .run();
  }
}

const bindings = () => ({ ...(env as unknown as Bindings), FIREBASE_PROJECT_ID }) as Bindings;
const call = (path: string, init: RequestInit) =>
  app.fetch(new Request(`http://localhost${path}`, init), bindings());

async function openFromLink(
  submissionId: string,
  followUpId?: string,
  deviceSignal?: string,
): Promise<{ sessionId: string; respondentToken: string }> {
  const resumeToken = await mintEmailToken(env as unknown as Bindings, "resume", submissionId, RESUME_TTL_DAYS);
  const res = await call(`/p/forms/${SLUG}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resumeToken, ...(followUpId ? { followUpId } : {}), ...(deviceSignal ? { deviceSignal } : {}) }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { sessionId: string; respondentToken: string };
}

async function signInByPhone(
  s: { sessionId: string; respondentToken: string },
  phone: string,
): Promise<{ status: number; body: { resumed?: boolean; error?: { code: string } } }> {
  const res = await call(`/p/sessions/${s.sessionId}/auth/phone/token`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-respondent-token": s.respondentToken },
    body: JSON.stringify({ idToken: await mintFirebaseToken(phone) }),
  });
  return { status: res.status, body: (await res.json()) as { resumed?: boolean; error?: { code: string } } };
}

async function answer(s: { sessionId: string; respondentToken: string }, ref: string, value: unknown) {
  return call(`/p/sessions/${s.sessionId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-respondent-token": s.respondentToken },
    body: JSON.stringify({ type: "structured", ref, value }),
  });
}

const stubFor = (sid: string) =>
  env.SESSION_DO.get(sessionObjectId(env.SESSION_DO, sid)) as unknown as DurableObjectStub<SessionDO>;

const row = (id: string) =>
  env.DB.prepare(`SELECT status FROM submissions WHERE id = ?`).bind(id).first<{ status: string }>();
const followUps = (submissionId: string) =>
  env.DB.prepare(`SELECT id, status, reason, clicked_at FROM followups WHERE submission_id = ? ORDER BY step`)
    .bind(submissionId)
    .all<{ id: string; status: string; reason: string | null; clicked_at: number | null }>()
    .then((r) => r.results ?? []);
const sessionRow = (sid: string) =>
  env.DB.prepare(`SELECT submission_id, held_resume_id FROM chat_sessions WHERE id = ?`)
    .bind(sid)
    .first<{ submission_id: string | null; held_resume_id: string | null }>();

// ───────────────────────── signed tokens ─────────────────────────

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
const KID = "held-key-1";
let keyPair: CryptoKeyPair;
let jwks: { keys: unknown[] };

async function mintFirebaseToken(phone: string): Promise<string> {
  const header = b64urlJson({ alg: "RS256", kid: KID, typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlJson({
    iss: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    aud: FIREBASE_PROJECT_ID,
    sub: `firebase-uid-${phone}`,
    iat: now,
    exp: now + 3600,
    phone_number: phone,
    firebase: { sign_in_provider: "phone" },
  });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

const realFetch = globalThis.fetch;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("heldresume");
  // A paid plan: `requireAuth` is plan-gated, and a gate `clampForRuntime` had
  // switched off would make every held case pass as an ordinary resume.
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('business', 'business', 'Business', ?1, ?2, 'USD', ?3, ?4, 1, 2) ON CONFLICT (id) DO NOTHING`,
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
    .bind(`sub_hld_${t.orgId}`, t.orgId, `dodo_hld_${t.orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now())
    .run();
  await invalidateEntitlements(env as never, t.orgId);

  keyPair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  jwks = { keys: [{ ...pub, kid: KID, alg: "RS256", use: "sig" }] };
});

beforeEach(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")) {
      return new Response(JSON.stringify(jwks), { headers: { "content-type": "application/json" } });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
  await env.DB.prepare(`DELETE FROM followups`).run();
  await env.DB.prepare(`DELETE FROM submission_answers`).run();
  await env.DB.prepare(`DELETE FROM submissions`).run();
  await env.DB.prepare(`DELETE FROM chat_sessions`).run();
  await publish({ enabled: true });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("a link to a phone-verified response, before anyone signs in", () => {
  it("opens the form without the response in it", async () => {
    await seedAbandoned("sbm_held01");
    await seedFollowUps("sbm_held01");
    const s = await openFromLink("sbm_held01", "flw_sbm_held01_1");

    // Not bound to this session, only noted for the sign-in.
    expect(await sessionRow(s.sessionId)).toEqual({ submission_id: null, held_resume_id: "sbm_held01" });

    const frames = await readFrames(await stubFor(s.sessionId).stream());
    const text = JSON.stringify(frames);
    expect(text).not.toContain("Maya");
    expect(text).not.toContain("someone.else@northwind.example");
    expect(frames.some((f) => f.event === "user_message")).toBe(false);
    expect(frames.some((f) => f.event === "question")).toBe(false);
    expect(frames.some((f) => f.event === "auth_required")).toBe(true);

    const ready = await readReady(await stubFor(s.sessionId).stream());
    expect(ready.identity).toBeNull();
  });

  it("leaves the response and its reminders exactly as they were", async () => {
    await seedAbandoned("sbm_held02");
    await seedFollowUps("sbm_held02");
    await openFromLink("sbm_held02", "flw_sbm_held02_1");

    expect((await row("sbm_held02"))?.status).toBe("abandoned");
    const fus = await followUps("sbm_held02");
    expect(fus.map((f) => [f.status, f.clicked_at])).toEqual([
      ["sent", null],
      ["scheduled", null],
    ]);
  });

  it("refuses an answer sent past the gate", async () => {
    await seedAbandoned("sbm_held03");
    const s = await openFromLink("sbm_held03");
    const res = await answer(s, "q_team", "12");
    expect(res.status).toBe(400);
    const answers = await env.DB.prepare(`SELECT block_ref FROM submission_answers WHERE submission_id = ?`)
      .bind("sbm_held03")
      .all<{ block_ref: string }>();
    expect(answers.results?.map((a) => a.block_ref).sort()).toEqual(["q_email", "q_name"]);
  });
});

describe("the person the response belongs to signs in", () => {
  it("gets the response back, answers and all, on the question they stopped at", async () => {
    await seedAbandoned("sbm_held10");
    const s = await openFromLink("sbm_held10");
    const signIn = await signInByPhone(s, OWNER_PHONE);
    expect(signIn.status).toBe(200);
    expect(signIn.body.resumed).toBe(true);

    expect((await row("sbm_held10"))?.status).toBe("in_progress");
    const frames = await readFrames(await stubFor(s.sessionId).stream());
    const said = frames.filter((f) => f.event === "user_message").map((f) => (f.data as { text: string }).text);
    expect(said).toEqual(["Maya", "someone.else@northwind.example"]);
    const question = frames.findLast((f) => f.event === "question");
    expect((question?.data as { block: { ref: string } }).block.ref).toBe("q_team");
  });

  it("finishes into the same response, not a second one", async () => {
    await seedAbandoned("sbm_held11");
    const s = await openFromLink("sbm_held11");
    await signInByPhone(s, OWNER_PHONE);
    expect((await answer(s, "q_team", "12")).status).toBe(202);

    const subs = await env.DB.prepare(`SELECT id FROM submissions`).all<{ id: string }>();
    expect(subs.results?.map((r) => r.id)).toEqual(["sbm_held11"]);
    const team = await env.DB.prepare(
      `SELECT value_json FROM submission_answers WHERE submission_id = ? AND block_ref = 'q_team'`,
    )
      .bind("sbm_held11")
      .first<{ value_json: string }>();
    expect(team && JSON.parse(team.value_json)).toBe("12");
  });

  it("does everything the link used to do: credits the click and stops the reminders", async () => {
    await seedAbandoned("sbm_held12");
    await seedFollowUps("sbm_held12");
    const s = await openFromLink("sbm_held12", "flw_sbm_held12_1");
    await signInByPhone(s, OWNER_PHONE);

    const [clicked, pending] = await followUps("sbm_held12");
    expect(clicked?.clicked_at).toBeGreaterThan(0);
    expect(clicked?.status).toBe("sent");
    expect(pending).toMatchObject({ status: "cancelled", reason: "resumed" });
  });

  it("is asked to sign in first even when the form lets people answer before the gate", async () => {
    await publish({ enabled: true, afterBlocks: 2 });
    await seedAbandoned("sbm_held13");
    const s = await openFromLink("sbm_held13");

    const before = await readFrames(await stubFor(s.sessionId).stream());
    expect(before.some((f) => f.event === "question")).toBe(false);
    expect(before.some((f) => f.event === "auth_required")).toBe(true);

    expect((await signInByPhone(s, OWNER_PHONE)).body.resumed).toBe(true);
    const after = await readFrames(await stubFor(s.sessionId).stream());
    const question = after.findLast((f) => f.event === "question");
    expect((question?.data as { block: { ref: string } }).block.ref).toBe("q_team");
  });

  it("gets the draft even when they also have a finished response", async () => {
    // The identity lookup alone would answer this sign-in with the earlier
    // submission. The link never did, so neither does the held link.
    await seedAbandoned("sbm_held14_done", { provider: "phone", subject: OWNER_PHONE }, "completed");
    await seedAbandoned("sbm_held14");
    const s = await openFromLink("sbm_held14");
    const signIn = await signInByPhone(s, OWNER_PHONE);
    expect(signIn.status).toBe(200);
    expect(signIn.body.resumed).toBe(true);
    expect((await row("sbm_held14"))?.status).toBe("in_progress");
    expect((await row("sbm_held14_done"))?.status).toBe("completed");
  });
});

describe("somebody else signs in", () => {
  it("gets a form of their own and never sees the response", async () => {
    await seedAbandoned("sbm_held20");
    await seedFollowUps("sbm_held20");
    const s = await openFromLink("sbm_held20", "flw_sbm_held20_1");
    const signIn = await signInByPhone(s, STRANGER_PHONE);
    expect(signIn.status).toBe(200);
    expect(signIn.body.resumed).toBe(false);

    const frames = await readFrames(await stubFor(s.sessionId).stream());
    expect(JSON.stringify(frames)).not.toContain("Maya");
    const question = frames.findLast((f) => f.event === "question");
    expect((question?.data as { block: { ref: string } }).block.ref).toBe("q_name");

    // The owner's response, reminders and click are untouched.
    expect((await row("sbm_held20"))?.status).toBe("abandoned");
    expect((await followUps("sbm_held20")).map((f) => [f.status, f.clicked_at])).toEqual([
      ["sent", null],
      ["scheduled", null],
    ]);
  });

  it("answers into a new response, not the owner's", async () => {
    await seedAbandoned("sbm_held21");
    const s = await openFromLink("sbm_held21");
    await signInByPhone(s, STRANGER_PHONE);
    expect((await answer(s, "q_name", "Stranger")).status).toBe(202);

    const owner = await env.DB.prepare(
      `SELECT value_json FROM submission_answers WHERE submission_id = ? AND block_ref = 'q_name'`,
    )
      .bind("sbm_held21")
      .first<{ value_json: string }>();
    expect(owner && JSON.parse(owner.value_json)).toBe("Maya");
    expect((await row("sbm_held21"))?.status).toBe("abandoned");
  });
});

describe("links that keep working as they always have", () => {
  it("a Google sign-in with a verified email resumes straight away", async () => {
    await publish({ enabled: true, method: "google" });
    await seedAbandoned("sbm_held30", { provider: "google", subject: "sub_maya", email: "maya@northwind.example" });
    const s = await openFromLink("sbm_held30");
    expect(await sessionRow(s.sessionId)).toEqual({ submission_id: "sbm_held30", held_resume_id: null });
    expect((await row("sbm_held30"))?.status).toBe("in_progress");
  });

  it("a phone response on a form whose sign-in is now off resumes straight away", async () => {
    // Nothing is left to check them against, and holding the response back
    // would strand the one person it belongs to.
    await publish({ enabled: false });
    await seedAbandoned("sbm_held31");
    const s = await openFromLink("sbm_held31");
    expect(await sessionRow(s.sessionId)).toEqual({ submission_id: "sbm_held31", held_resume_id: null });
    expect((await row("sbm_held31"))?.status).toBe("in_progress");
  });

  it("a phone response on a form that now asks for Google resumes straight away", async () => {
    await publish({ enabled: true, method: "google" });
    await seedAbandoned("sbm_held32");
    const s = await openFromLink("sbm_held32");
    expect(await sessionRow(s.sessionId)).toEqual({ submission_id: "sbm_held32", held_resume_id: null });
  });

  it("an anonymous response resumes straight away in the browser that started it", async () => {
    await publish({ enabled: false });
    await seedAbandoned("sbm_held33");
    await env.DB.prepare(
      `UPDATE submissions SET respondent_provider = NULL, respondent_subject = NULL, respondent_phone = NULL,
                              fingerprint = ?2 WHERE id = ?1`,
    )
      .bind("sbm_held33", sha256Hex("salt:d:heldbrowser01"))
      .run();
    const s = await openFromLink("sbm_held33", undefined, "heldbrowser01");
    expect(await sessionRow(s.sessionId)).toEqual({ submission_id: "sbm_held33", held_resume_id: null });
    const frames = await readFrames(await stubFor(s.sessionId).stream());
    expect(JSON.stringify(frames)).toContain("Maya");
  });
});

/** The `session_ready` payload, and then let go of the stream. */
async function readReady(res: Response): Promise<{ identity: unknown }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (let i = 0; i < 50; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frame = buf.split("\n\n").find((f) => f.includes("event: session_ready"));
      if (frame) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "))!;
        return JSON.parse(line.slice(6)) as { identity: unknown };
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  throw new Error("no session_ready frame arrived");
}

/** Every frame the stream replays on connect, up to the readiness signal. */
async function readFrames(res: Response): Promise<{ event: string; data: unknown }[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (let i = 0; i < 50; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (buf.includes("event: session_ready")) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return buf
    .split("\n\n")
    .map((frame) => {
      const event = frame.split("\n").find((l) => l.startsWith("event: "))?.slice(7);
      const data = frame.split("\n").find((l) => l.startsWith("data: "))?.slice(6);
      return event && data ? { event, data: JSON.parse(data) as unknown } : null;
    })
    .filter((f): f is { event: string; data: unknown } => f !== null && f.event !== "session_ready");
}
