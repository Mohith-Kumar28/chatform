import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import { respondentKey } from "../src/lib/respondent-key.js";
import { PLANS } from "@repo/entitlements";
import type { Bindings } from "../src/env.js";

/**
 * "Start over" means start over.
 *
 * The button clears the screen and opens a session that declines the device
 * match — and that used to be the whole of it, which was enough only for a form
 * nobody signs into. A gated form does not learn who its respondent is until
 * they verify, several turns later, and the lookup that runs at that moment
 * found the very response they had just asked to leave and adopted it. The
 * respondent watched the conversation empty itself, sign them in, and then say
 * "you'd already answered 4 questions" while putting all four back.
 *
 * Two moments, minutes apart, in different code. These pin the note that
 * carries the intent from the first to the second.
 */

let t: Tenant;
const VERSION_ID = "ver_startover";
const SLUG = "start-over-form";
const CLIENT_ID = "1234.apps.googleusercontent.com";
const SUBJECT = "google-sub-startover";

const DOC = {
  schemaVersion: 4,
  title: "Start over",
  blocks: [
    { id: "blk_so000001", ref: "q_name", type: "short_text", title: "Your name?", required: true, minLength: 0, maxLength: 80 },
    { id: "blk_so000002", ref: "q_team", type: "short_text", title: "Team size?", required: true, minLength: 0, maxLength: 80 },
  ],
  endings: [{ id: "end_so000001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  theme: {},
};

/**
 * A sign-in gate is the whole point of these tests: it is what leaves the
 * conversation waiting, so identity — not the device — is what recognises a
 * returning respondent. `requireAuth` is a business-plan feature and
 * `clampForRuntime` would switch it back off on anything less.
 */
const GATED = { agent: { mode: "template" }, requireAuth: { enabled: true, method: "google" } };

async function publish(settings: Record<string, unknown>): Promise<void> {
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

/** A response this person left half-finished, found only by who they are. */
async function seedTheirs(
  id: string,
  opts: { status?: string; anonymous?: boolean; fingerprint?: string } = {},
): Promise<string> {
  const now = Date.now();
  const status = opts.status ?? "in_progress";
  await env.DB.prepare(
    `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, source, is_test,
                              started_at, updated_at, completed_at, fingerprint,
                              respondent_provider, respondent_subject, respondent_email)
     VALUES (?, ?, ?, ?, NULL, ?, 'chat', 0, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      t.formId,
      VERSION_ID,
      t.orgId,
      status,
      now - 600_000,
      now - 600_000,
      status === "completed" ? now - 600_000 : null,
      opts.fingerprint ?? null,
      opts.anonymous ? null : "google",
      opts.anonymous ? null : SUBJECT,
      opts.anonymous ? null : "me@northwind.example",
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
     VALUES (?, ?, ?, 'q_name', 'short_text', ?, ?)`,
  )
    .bind(`ans_${id}`, id, t.formId, JSON.stringify("Maya"), now - 600_000)
    .run();
  return id;
}

const open = (body: Record<string, unknown> = {}) =>
  fetchApi(`/p/forms/${SLUG}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// ───────────────────── a real Google credential ─────────────────────

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

let keyPair: CryptoKeyPair;
let jwks: { keys: unknown[] };
const KID = "start-over-key";
const realFetch = globalThis.fetch;

/**
 * Signed by a key we publish through a stubbed JWKS endpoint, so the token the
 * route verifies is a real one and the sign-in path under test is the shipped
 * one rather than a stub of it.
 */
async function googleToken(): Promise<string> {
  const header = b64urlJson({ alg: "RS256", kid: KID, typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlJson({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: SUBJECT,
    email: "me@northwind.example",
    email_verified: true,
    name: "Maya",
    iat: now,
    exp: now + 3600,
  });
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

/** Open a session, sign in on it, and report what the gate decided. */
async function signIn(body: Record<string, unknown> = {}): Promise<{
  sessionId: string;
  status: number;
  body: {
    resumed?: boolean;
    error?: {
      code?: string;
      message?: string;
      outcome?: string;
      ending?: { ref: string; kind: string; title: string; requirements: string[] } | null;
      answers?: { ref: string; title: string; display: string }[];
    };
  };
}> {
  const opened = await open(body);
  expect(opened.status).toBe(200);
  const { sessionId, respondentToken } = (await opened.json()) as {
    sessionId: string;
    respondentToken: string;
  };
  const res = await fetchApi(`/p/sessions/${sessionId}/auth/google`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-respondent-token": respondentToken },
    body: JSON.stringify({ idToken: await googleToken() }),
  });
  return { sessionId, status: res.status, body: (await res.json()) as Awaited<ReturnType<typeof signIn>>["body"] };
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("startover");

  // Business: `requireAuth` and `onePerIdentity` are both plan-gated, and a
  // clamped-off gate would make every one of these tests pass for no reason.
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('business', 'business', 'Business', ?, ?, 'USD', ?, ?, 1, 2) ON CONFLICT (id) DO NOTHING`,
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
     VALUES (?, ?, 'business', ?, 'monthly', 'active', ?, ?, 1, ?, ?)`,
  )
    .bind(
      `sub_so_${t.orgId}`,
      t.orgId,
      `dodo_so_${t.orgId}`,
      Date.now() - 1000,
      Date.now() + 86_400_000 * 20,
      Date.now(),
      Date.now(),
    )
    .run();
  await invalidateEntitlements(env as unknown as Bindings, t.orgId);
  await publish(GATED);

  (env as unknown as Record<string, string>).GOOGLE_RESPONDENT_CLIENT_ID = CLIENT_ID;
  keyPair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  jwks = { keys: [{ ...pub, kid: KID, alg: "RS256", use: "sig" }] };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
      return new Response(JSON.stringify(jwks), { headers: { "content-type": "application/json" } });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

beforeEach(async () => {
  await env.DB.prepare(`DELETE FROM submission_answers`).run();
  await env.DB.prepare(`DELETE FROM submissions`).run();
  await env.DB.prepare(`DELETE FROM chat_sessions`).run();
});

describe("the intent survives the session it was pressed in", () => {
  it("writes it down, because sign-in happens long after this", async () => {
    const res = await open({ fresh: true });
    const { sessionId } = (await res.json()) as { sessionId: string };
    const row = await env.DB.prepare(`SELECT started_over FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ started_over: number }>();
    expect(row?.started_over).toBe(1);
  });

  it("leaves an ordinary session unmarked", async () => {
    const res = await open();
    const { sessionId } = (await res.json()) as { sessionId: string };
    const row = await env.DB.prepare(`SELECT started_over FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ started_over: number }>();
    expect(row?.started_over).toBe(0);
  });
});

describe("signing in after Start over", () => {
  /**
   * The control. Without it the test below would pass on a form where nothing
   * was ever resumable, and prove nothing about the fix.
   */
  it("an ordinary session still picks their response back up", async () => {
    const id = await seedTheirs("sbm_so_plain");
    const { status, body } = await signIn();
    expect(status).toBe(200);
    expect(body.resumed).toBe(true);
    // Still one response: they carried on with it rather than starting a second.
    const subs = await env.DB.prepare(`SELECT id FROM submissions`).all<{ id: string }>();
    expect(subs.results?.map((r) => r.id)).toEqual([id]);
  });

  it("does not hand back the response they just asked to leave", async () => {
    await seedTheirs("sbm_so_fresh");
    const { status, body } = await signIn({ fresh: true });
    expect(status).toBe(200);
    expect(body.resumed).toBe(false);
  });

  /**
   * Starting over is the respondent's decision about their own attempt. How
   * many responses one person may leave is the author's, and no button on the
   * page is a way around it.
   */
  it("still refuses somebody who has already finished", async () => {
    await publish({ ...GATED, allowResubmissions: false });
    await seedTheirs("sbm_so_done", { status: "completed" });
    const { status, body } = await signIn({ fresh: true });
    expect(status).toBe(409);
    expect(body.error?.code).toBe("already_answered");
    await publish(GATED);
  });
});

/**
 * Where the two keys hand over.
 *
 * On Business with a sign-in gate the verified identity is the key, and the
 * device check in `openSession` must not also run. Running both is not
 * belt-and-braces: the device check fires at the door, before anybody can
 * prove who they are, so two people sharing a machine ends with the second
 * refused for a response the first one left — by a rule the identity check
 * would have let them past.
 */
describe("one response per person, on a form that knows who people are", () => {
  const SIGNAL = "sharedlabpc1";

  it("does not refuse a second person at the door on a shared machine", async () => {
    await publish({ ...GATED, allowResubmissions: false });
    const salt = await env.DB.prepare(`SELECT fingerprint_salt FROM forms WHERE id = ?`)
      .bind(t.formId)
      .first<{ fingerprint_salt: string }>();
    const key = respondentKey({ signal: SIGNAL, ip: "", salt: salt!.fingerprint_salt });

    // Somebody already finished on this machine.
    await env.DB.prepare(
      `INSERT INTO chat_sessions (id, form_id, form_version_id, organization_id, respondent_token_hash,
                                  status, hidden_fields, ip_hash, fingerprint, source, is_test,
                                  created_at, last_activity_at)
       VALUES ('chs_so_shared', ?1, ?2, ?3, 'hash', 'completed', '{}', '', ?4, 'chat', 0, ?5, ?5)`,
    )
      .bind(t.formId, VERSION_ID, t.orgId, key.value, Date.now())
      .run();

    const res = await open({ deviceSignal: SIGNAL });
    expect(res.status).toBe(200);
    await publish(GATED);
  });
});

describe("the device match", () => {
  const SIGNAL = "abcdefgh1234";

  /** The half of "Start over" that already worked, pinned so it stays working. */
  it("is declined too, so the same response cannot come back by the other door", async () => {
    const salt = await env.DB.prepare(`SELECT fingerprint_salt FROM forms WHERE id = ?`)
      .bind(t.formId)
      .first<{ fingerprint_salt: string }>();
    const key = respondentKey({ signal: SIGNAL, ip: "", salt: salt!.fingerprint_salt });
    await seedTheirs("sbm_so_device", { anonymous: true, fingerprint: key.value });

    const resumed = await open({ deviceSignal: SIGNAL });
    const a = (await resumed.json()) as { sessionId: string };
    const withDevice = await env.DB.prepare(`SELECT submission_id FROM chat_sessions WHERE id = ?`)
      .bind(a.sessionId)
      .first<{ submission_id: string | null }>();
    expect(withDevice?.submission_id).toBe("sbm_so_device");

    const fresh = await open({ deviceSignal: SIGNAL, fresh: true });
    const b = (await fresh.json()) as { sessionId: string };
    const started = await env.DB.prepare(`SELECT submission_id FROM chat_sessions WHERE id = ?`)
      .bind(b.sessionId)
      .first<{ submission_id: string | null }>();
    expect(started?.submission_id).toBeNull();
  });
});

/**
 * Coming back to a form that turned you away.
 *
 * `onePerIdentity` refuses the second attempt, and it is right to: a
 * screen-out that could be undone by signing in again and answering
 * differently is not a screen-out. What it must not do is lie about which of
 * the two things happened. The refusal used to come back word for word the
 * same as a completion — "you have already answered this" — over a blank
 * screen, so somebody stopped at the last question of an eleven-answer
 * registration was told they had submitted it and shown nothing to prove
 * anything had survived.
 */
describe("returning after being screened out", () => {
  /*
   * One setting, not two. `allowResubmissions: false` is the whole of "one
   * response per person"; the sign-in gate above it is what makes the
   * verified identity the key rather than the browser.
   */
  const SCREEN_OUT = { ...GATED, allowResubmissions: false };
  const DOC_WITH_REFUSAL = {
    endings: [
      { id: "end_so000001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." },
      {
        id: "end_so000002",
        ref: "end_ineligible",
        title: "Team composition requirement not met",
        bodyMd: "At least two women per team.",
        kind: "screen_out",
        requirements: [{ id: "req_so000001", label: "Minimum of 2 female participants per team" }],
      },
    ],
  };

  const publishWithRefusal = async () => {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    )
      .bind(
        VERSION_ID,
        t.formId,
        JSON.stringify({ ...DOC, ...DOC_WITH_REFUSAL, settings: SCREEN_OUT }),
        now,
        t.userId,
      )
      .run();
  };

  /** A response the form refused, filed under this person. */
  const seedRefused = async (id: string) => {
    await seedTheirs(id, { status: "disqualified" });
    await env.DB.prepare(
      `UPDATE submissions
          SET completed_at = ?1,
              meta = json_set(coalesce(meta,'{}'), '$.endingRef', 'end_ineligible')
        WHERE id = ?2`,
    )
      .bind(Date.now() - 600_000, id)
      .run();
  };

  beforeEach(publishWithRefusal);
  afterAll(() => publish(GATED));

  it("is still refused a second response, because that is the author's rule", async () => {
    await seedRefused("sbm_so_out1");
    const { status, body } = await signIn();
    expect(status).toBe(409);
    expect(body.error?.code).toBe("already_answered");
  });

  it("is told it was refused, not that it was answered", async () => {
    await seedRefused("sbm_so_out2");
    const { body } = await signIn();
    expect(body.error?.outcome).toBe("screened_out");
    expect(body.error?.message).not.toMatch(/already answered/i);
  });

  it("gets the ending that refused them, with its requirements", async () => {
    await seedRefused("sbm_so_out3");
    const { body } = await signIn();
    // The reason is the whole content of the screen they came back to read.
    expect(body.error?.ending?.ref).toBe("end_ineligible");
    expect(body.error?.ending?.kind).toBe("screen_out");
    expect(body.error?.ending?.requirements).toEqual(["Minimum of 2 female participants per team"]);
  });

  it("gets their answers back, so the screen is not blank", async () => {
    await seedRefused("sbm_so_out4");
    const { body } = await signIn();
    expect(body.error?.answers).toEqual([{ ref: "q_name", title: "Your name?", display: "Maya" }]);
  });

  it("still calls a completion a completion", async () => {
    await seedTheirs("sbm_so_done2", { status: "completed" });
    const { status, body } = await signIn();
    expect(status).toBe(409);
    expect(body.error?.outcome).toBe("completed");
    expect(body.error?.message).toMatch(/already answered/i);
  });

  /**
   * A completion is a blank screen too, without this.
   *
   * The same 409 carries both outcomes, and the reason the accepted
   * respondent saw one grey line on returning is the reason the refused one
   * did: nothing but a code and a timestamp came back with it.
   */
  it("hands a completed respondent their answers and their thank-you back", async () => {
    await seedTheirs("sbm_so_done3", { status: "completed" });
    await env.DB.prepare(
      `UPDATE submissions SET meta = json_set(coalesce(meta,'{}'), '$.endingRef', 'end_thanks') WHERE id = ?`,
    )
      .bind("sbm_so_done3")
      .run();

    const { body } = await signIn();
    expect(body.error?.answers).toEqual([{ ref: "q_name", title: "Your name?", display: "Maya" }]);
    expect(body.error?.ending?.ref).toBe("end_thanks");
    expect(body.error?.ending?.kind).toBe("success");
  });
});
