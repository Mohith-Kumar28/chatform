import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi } from "./helpers.js";
import type { SessionDO } from "../src/do/session-do.js";
import { classifyAiError } from "../src/lib/ai-failure.js";
import { verifyTurnstile } from "../src/lib/open-session.js";
import { finalizeResponse, openResponse, type ResponseOwner } from "../src/lib/submissions.js";
import { computeAnalytics } from "../src/lib/analytics-service.js";

/**
 * A form keeps working when the AI does not.
 *
 * Every model call is answered here by OpenRouter's "insufficient credits"
 * 402 — the outage this was written after — and the conversation is walked
 * to the end regardless: the answers are recorded, the response is filed as
 * completed, and each failure is written down with its reason.
 */

vi.setConfig({ testTimeout: 20_000 });

const SYSTEM_ONE = "https://openrouter.ai/api/v1/systemone";
const chatCalls: string[] = [];
let jevCalls = 0;
/** Holds a chat call open this long before failing it, for the concurrency case. */
let chatDelayMs = 0;
/** What the fake siteverify answers. */
let cloudflareSays: Record<string, unknown> = { success: true };
const realFetch = globalThis.fetch;

const noCredits = () =>
  new Response(JSON.stringify({ error: { code: 402, message: "Insufficient credits" } }), {
    status: 402,
    headers: { "content-type": "application/json" },
  });

beforeAll(async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://challenges.cloudflare.com/")) return Response.json(cloudflareSays);
    if (url === SYSTEM_ONE) {
      jevCalls += 1;
      return noCredits();
    }
    if (url.startsWith("https://openrouter.ai/")) {
      chatCalls.push(url);
      if (chatDelayMs) await new Promise((r) => setTimeout(r, chatDelayMs));
      return noCredits();
    }
    return realFetch(input, init);
  });
  (env as unknown as Record<string, unknown>).OPENROUTER_API_KEY = "sk-test";
  await applySchema();
});

afterAll(() => {
  vi.restoreAllMocks();
  (env as unknown as Record<string, unknown>).OPENROUTER_API_KEY = "";
});

const blocks = [
  { id: "blk_ao000001", ref: "q_name", type: "short_text", title: "What's your name?", required: true },
  { id: "blk_ao000002", ref: "q_city", type: "short_text", title: "Which city are you in?", required: true },
];

async function seedForm(label: string, mode: "ai" | "hybrid"): Promise<{ slug: string; formId: string }> {
  const t = await seedTenant(label);
  const slug = `outage-${label}`;
  const json = JSON.stringify({
    schemaVersion: 6,
    title: "Outage",
    blocks,
    endings: [{ id: "end_ao000001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
    logic: [],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    layout: {},
    settings: { agent: { mode }, onComplete: { requireSubmit: false } },
    theme: {},
  });
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(`ver_${label}`, t.formId, json, now, t.userId),
    env.DB.prepare(`UPDATE forms SET status = 'published', slug = ?1, working_schema = ?2, active_version_id = ?3 WHERE id = ?4`).bind(
      slug,
      json,
      `ver_${label}`,
      t.formId,
    ),
  ]);
  return { slug, formId: t.formId };
}

const stubFor = (sid: string) => env.SESSION_DO.get(env.SESSION_DO.idFromName(sid)) as unknown as DurableObjectStub<SessionDO>;

async function open(slug: string) {
  const res = await fetchApi(`/p/forms/${slug}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(res.ok).toBe(true);
  return (await res.json()) as { sessionId: string; respondentToken: string };
}

function post(s: { sessionId: string; respondentToken: string }, text: string, turnId = crypto.randomUUID()) {
  return fetchApi(`/p/sessions/${s.sessionId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-respondent-token": s.respondentToken },
    body: JSON.stringify({ type: "text", text, turnId }),
  });
}

/** Usage rows are written off the hot path; give `waitUntil` a moment. */
async function failures(formId: string, kind: string) {
  for (let i = 0; i < 20; i++) {
    const rows = await env.DB.prepare(
      `SELECT error_code, error_message FROM ai_generations WHERE form_id = ? AND kind = ? AND status = 'error'`,
    )
      .bind(formId, kind)
      .all<{ error_code: string | null; error_message: string | null }>();
    if ((rows.results ?? []).length > 0) return rows.results!;
    await new Promise((r) => setTimeout(r, 50));
  }
  return [];
}

describe("classifyAiError", () => {
  it("reads the provider's status through the SDK's wrappers", () => {
    const provider = Object.assign(new Error("Insufficient credits"), { statusCode: 402 });
    const retry = Object.assign(new Error("Failed after 2 attempts"), { name: "AI_RetryError", lastError: provider });
    expect(classifyAiError(retry)).toEqual({ code: "credits_exhausted", message: "Insufficient credits" });
    expect(classifyAiError(Object.assign(new Error("slow down"), { statusCode: 429 })).code).toBe("rate_limited");
    expect(classifyAiError(Object.assign(new Error("bad gateway"), { statusCode: 502 })).code).toBe("provider_error");
    expect(classifyAiError(Object.assign(new Error("t"), { name: "TimeoutError" })).code).toBe("timeout");
    expect(classifyAiError("weird").code).toBe("unknown");
  });
});

describe("Agentic form, AI out of credits", () => {
  it("walks to a completed response in the author's words, and records why", async () => {
    const { slug, formId } = await seedForm("agentic", "ai");
    chatCalls.length = 0;
    const s = await open(slug);
    // The opening question was an agent turn, and it failed over.
    expect(chatCalls.length).toBeGreaterThan(0);

    chatCalls.length = 0;
    expect((await post(s, "Priya")).status).toBe(202);
    // Inside the cooldown: the model is not asked again.
    expect(chatCalls).toEqual([]);
    expect((await post(s, "Pune")).status).toBe(202);

    const state = await stubFor(s.sessionId).getStatus();
    expect(state.status).toBe("completed");
    expect(state.answers).toMatchObject({ q_name: "Priya", q_city: "Pune" });
    const row = await env.DB.prepare(`SELECT status FROM submissions WHERE form_id = ?`).bind(formId).first<{ status: string }>();
    expect(row?.status).toBe("completed");

    const logged = await failures(formId, "interview_turn");
    expect(logged[0]?.error_code).toBe("credits_exhausted");

    const agg = await computeAnalytics(env as never, formId);
    expect(agg.aiFallbacks.calls).toBeGreaterThan(0);
    expect(agg.aiFallbacks.sessions).toBe(1);
    expect(agg.aiFallbacks.reasons[0]?.code).toBe("credits_exhausted");
  });

  it("runs a resent turn once, not twice, while the first is still waiting on the model", async () => {
    const { slug } = await seedForm("resend", "ai");
    const s = await open(slug);
    // Past the cooldown the opening failure started, so this turn asks the model.
    await runInDurableObject(stubFor(s.sessionId), (instance) => {
      (instance as unknown as { aiCooldownUntil: number }).aiCooldownUntil = 0;
    });
    chatCalls.length = 0;
    chatDelayMs = 400;
    try {
      const turnId = crypto.randomUUID();
      const [a, b] = await Promise.all([post(s, "tell me more about this", turnId), post(s, "tell me more about this", turnId)]);
      expect([a.status, b.status].sort()).toEqual([202, 202]);
    } finally {
      chatDelayMs = 0;
    }
    // One agent turn (one retry allowed), not two.
    expect(chatCalls.length).toBeLessThanOrEqual(2);
    const transcript = await stubFor(s.sessionId).getTranscript();
    expect(transcript.filter((m) => m.role === "user" && m.content === "tell me more about this")).toHaveLength(1);
  });
});

describe("A completion D1 would not take", () => {
  it("is retried by the alarm and filed as completed, not abandoned", async () => {
    const { slug, formId } = await seedForm("finalize-retry", "hybrid");
    const s = await open(slug);
    const stub = stubFor(s.sessionId);
    type Finalizing = { finalize: (...a: unknown[]) => Promise<string> };
    let original: Finalizing["finalize"] | null = null;
    await runInDurableObject(stub, (instance) => {
      const i = instance as unknown as Finalizing;
      original = i.finalize;
      i.finalize = async () => {
        throw new Error("D1_ERROR: database is locked");
      };
    });
    expect((await post(s, "Priya")).status).toBe(202);
    expect((await post(s, "Pune")).status).toBe(202);
    // The respondent saw the ending; D1 did not get it.
    expect((await stub.getStatus()).status).toBe("completed");
    const before = await env.DB.prepare(`SELECT status FROM submissions WHERE form_id = ?`).bind(formId).first<{ status: string }>();
    expect(before?.status).not.toBe("completed");

    await runInDurableObject(stub, (instance) => {
      (instance as unknown as Finalizing).finalize = original!;
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const after = await env.DB.prepare(`SELECT status FROM submissions WHERE form_id = ?`).bind(formId).first<{ status: string }>();
    expect(after?.status).toBe("completed");
  });
});

describe("Hybrid form, AI out of credits", () => {
  it("takes the answer on the plain validator and logs the gate's failure", async () => {
    const { slug, formId } = await seedForm("hybrid", "hybrid");
    const s = await open(slug);
    jevCalls = 0;
    expect((await post(s, "Priya")).status).toBe(202);
    expect(jevCalls).toBe(1);
    const state = await stubFor(s.sessionId).getStatus();
    expect(state.answers.q_name).toBe("Priya");
    expect(state.currentRef).toBe("q_city");
    const logged = await failures(formId, "answer_gate");
    expect(logged[0]?.error_code).toBe("credits_exhausted");
  });
});

describe("finalizeResponse", () => {
  it("still sends the owner's email when the webhook queue refuses", async () => {
    const t = await seedTenant("wh-down");
    const mail: unknown[] = [];
    const owner: ResponseOwner = {
      env: {
        ...env,
        Q_WEBHOOKS: { send: async () => { throw new Error("queue unavailable"); } },
        Q_EMAIL: { send: async (m: unknown) => void mail.push(m), sendBatch: async () => {} },
      } as never,
      formId: t.formId,
      formVersionId: null,
      organizationId: t.orgId,
      sessionId: null,
      source: "api",
    };
    const startedAt = Date.now();
    const id = await openResponse(owner, { hiddenFields: {}, variables: {}, userAgent: null, country: null, startedAt });
    const fin = await finalizeResponse(owner, {
      responseId: id,
      status: "completed",
      endingRef: null,
      answers: {},
      startedAt,
      collectedCount: 0,
    });
    expect(fin.changed).toBe(true);
    expect(mail.length).toBeGreaterThan(0);
  });
});

/** Session start against a secret Cloudflare answers with `verdict`. */
async function openWithCaptcha(slug: string, verdict: Record<string, unknown>, token?: string) {
  const e = env as unknown as Record<string, unknown>;
  const before = e.TURNSTILE_SECRET_KEY;
  e.TURNSTILE_SECRET_KEY = "real-looking-secret";
  cloudflareSays = verdict;
  try {
    return await fetchApi(`/p/forms/${slug}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(token ? { turnstileToken: token } : {}),
    });
  } finally {
    e.TURNSTILE_SECRET_KEY = before;
  }
}

describe("the captcha at session start", () => {
  let slug: string;
  beforeAll(async () => {
    slug = (await seedForm("captcha", "hybrid")).slug;
  });

  it("lets a person Cloudflare passes in, marked passed", async () => {
    const res = await openWithCaptcha(slug, { success: true }, "good");
    expect(res.ok).toBe(true);
    const { sessionId } = (await res.json()) as { sessionId: string };
    const row = await env.DB.prepare(`SELECT bot_check FROM chat_sessions WHERE id = ?`).bind(sessionId).first<{ bot_check: string }>();
    expect(row?.bot_check).toBe("passed");
  });

  it("keeps out a bot: a refused token, a replayed one, or none at all", async () => {
    for (const [verdict, token] of [
      [{ success: false, "error-codes": ["invalid-input-response"] }, "forged"],
      [{ success: false, "error-codes": ["timeout-or-duplicate"] }, "replayed"],
      [{ success: true }, undefined],
    ] as const) {
      const res = await openWithCaptcha(slug, verdict, token);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("captcha_required");
    }
  });

  it("never turns anyone away over our own setup or Cloudflare's trouble", async () => {
    // A wrong secret: the 2026-09-28 outage.
    for (const verdict of [
      { success: false, "error-codes": ["invalid-input-secret"] },
      { success: false, "error-codes": ["internal-error"] },
    ]) {
      const res = await openWithCaptcha(slug, verdict, "anything");
      expect(res.ok).toBe(true);
    }
  });
});

describe("verifyTurnstile", () => {
  const answer = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("passes a good token and rejects a bot's", async () => {
    expect(await verifyTurnstile("s", "tok", answer({ success: true }))).toBe("passed");
    expect(await verifyTurnstile("s", "tok", answer({ success: false, "error-codes": ["invalid-input-response"] }))).toBe("rejected");
    expect(await verifyTurnstile("s", "tok", answer({ success: false, "error-codes": ["timeout-or-duplicate"] }))).toBe("rejected");
    expect(await verifyTurnstile("s", undefined, answer({ success: true }))).toBe("rejected");
  });

  it("lets people in, unverified, when the fault is ours or Cloudflare's", async () => {
    expect(await verifyTurnstile("s", "tok", answer({ success: false, "error-codes": ["invalid-input-secret"] }))).toBe("unverified");
    expect(await verifyTurnstile("s", "tok", answer({ success: false, "error-codes": ["internal-error"] }))).toBe("unverified");
    expect(await verifyTurnstile("s", "tok", answer({}, 503))).toBe("unverified");
    const down = (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile("s", "tok", down)).toBe("unverified");
  });
});
