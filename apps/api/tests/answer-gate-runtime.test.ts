import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi } from "./helpers.js";
import type { SessionDO } from "../src/do/session-do.js";

/**
 * The answer gate inside a running conversation, per interview style.
 *
 * Jev and the chat model are both answered by a fake `fetch`: Jev by a script
 * keyed on the reply, and chat completions by an error, so an agent turn shows up
 * as an attempted call that fails over to the deterministic path. That makes
 * the one thing Hybrid exists for observable: a plain answer costs one Jev
 * call and no chat call, and the next question arrives in the author's words.
 */

const SYSTEM_ONE = "https://openrouter.ai/api/v1/systemone";

// The agent path makes real (stubbed) SDK calls with their own retries; under a
// loaded `pnpm check` the default five seconds is too tight for them.
vi.setConfig({ testTimeout: 20_000 });

/** What the fake Jev says for each reply it is sent. */
const JEV: Record<string, Record<string, unknown>> = {
  Priya: { direct: { type: "noul", noul: 0.98 }, span: { type: "choice", choice: "s1", probabilities: {}, confidence: 0.97 } },
  "banana bread": { direct: { type: "noul", noul: 0.05 }, span: { type: "choice", choice: "none", probabilities: {}, confidence: 0.9 } },
  "I play the violin": {
    direct: { type: "noul", noul: 0.96 },
    pick: { type: "choice", choice: "other", probabilities: {}, confidence: 0.99 },
    other_text: { type: "choice", choice: "VIOLIN", probabilities: {}, confidence: 0.95 },
  },
  "keys mostly": {
    direct: { type: "noul", noul: 0.95 },
    pick: { type: "choice", choice: "o2", probabilities: {}, confidence: 0.93 },
    other_text: { type: "choice", choice: "none", probabilities: {}, confidence: 0.9 },
  },
};

const calls: { url: string; reply?: string }[] = [];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === SYSTEM_ONE) {
      const body = JSON.parse(String(init?.body)) as { state: { reply: string }; questions: Record<string, { criteria?: Record<string, string> }> };
      calls.push({ url, reply: body.state.reply });
      const answers = structuredClone(JEV[body.state.reply] ?? {});
      // "VIOLIN" names the span by its text; find the key code gave it.
      const other = answers.other_text as { choice: string } | undefined;
      if (other?.choice === "VIOLIN") {
        const spans = body.questions.other_text!.criteria!;
        other.choice = Object.keys(spans).find((k) => spans[k] === "violin")!;
      }
      return Response.json({ id: "gen-dec-t", model: "typesafe/jev-1.13-20260917", answers, usage: { input_tokens: 200, output_tokens: 30, cost: 0.0000084 } });
    }
    if (url.startsWith("https://openrouter.ai/")) {
      calls.push({ url });
      // A 400, not a 500: the AI SDK retries a 500 with backoff, which only makes this slow.
      return new Response(JSON.stringify({ error: { message: "model down" } }), { status: 400 });
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
  { id: "blk_ag000001", ref: "q_name", type: "short_text", title: "What's your name?", required: true },
  {
    id: "blk_ag000002",
    ref: "q_instrument",
    type: "single_select",
    title: "Which instrument do you play?",
    required: true,
    allowOther: true,
    options: [
      { id: "opt_guitar01", label: "Guitar" },
      { id: "opt_piano001", label: "Piano" },
    ],
  },
  { id: "blk_ag000003", ref: "q_last", type: "short_text", title: "Anything else you want to tell us?", required: true },
];

async function seedForm(label: string, mode: "ai" | "hybrid" | "template"): Promise<string> {
  const t = await seedTenant(label);
  const slug = `gate-${label}`;
  const json = JSON.stringify({
    schemaVersion: 6,
    title: "Gate",
    blocks,
    endings: [{ id: "end_ag000001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
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
  return slug;
}

const stubFor = (sid: string) => env.SESSION_DO.get(env.SESSION_DO.idFromName(sid)) as unknown as DurableObjectStub<SessionDO>;

async function open(slug: string) {
  const res = await fetchApi(`/p/forms/${slug}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  return (await res.json()) as { sessionId: string; respondentToken: string };
}

async function say(s: { sessionId: string; respondentToken: string }, text: string) {
  calls.length = 0;
  const res = await fetchApi(`/p/sessions/${s.sessionId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-respondent-token": s.respondentToken },
    body: JSON.stringify({ type: "text", text, turnId: crypto.randomUUID() }),
  });
  expect(res.status).toBe(202);
  return stubFor(s.sessionId).getStatus();
}

/** The assistant's words since the respondent's last message, from the transcript. */
async function lastAssistant(sessionId: string): Promise<string[]> {
  const res = await stubFor(sessionId).stream();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + 1500;
  for (;;) {
    const next = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), 200)),
    ]);
    if (next.done || Date.now() > deadline) break;
    buf += decoder.decode(next.value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  const frames = buf
    .split("\n\n")
    .map((c) => ({ type: /^event: (.+)$/m.exec(c)?.[1], data: /^data: (.+)$/m.exec(c)?.[1] }))
    .filter((f) => f.type && f.data)
    .map((f) => ({ type: f.type!, data: JSON.parse(f.data!) as Record<string, unknown> }));
  const lastUser = frames.map((f) => f.type).lastIndexOf("user_message");
  return frames
    .slice(lastUser + 1)
    .filter((f) => f.type === "token")
    .map((f) => String(f.data.text ?? f.data.delta ?? ""));
}

describe("Hybrid", () => {
  let slug: string;
  beforeAll(async () => {
    slug = await seedForm("hybrid", "hybrid");
  });

  it("takes a plain answer with one Jev call and no chat call, and asks next in the author's words", async () => {
    const s = await open(slug);
    const state = await say(s, "Priya");
    expect(state.answers.q_name).toBe("Priya");
    expect(state.currentRef).toBe("q_instrument");
    expect(calls).toEqual([{ url: SYSTEM_ONE, reply: "Priya" }]);
    expect((await lastAssistant(s.sessionId)).join("")).toContain("Which instrument do you play?");
  });

  it("records an instrument that is not listed as Other", async () => {
    const s = await open(slug);
    await say(s, "Priya");
    const state = await say(s, "I play the violin");
    expect(state.answers.q_instrument).toBe("violin");
    expect(state.currentRef).toBe("q_last");
  });

  it("maps a paraphrase onto the option it means", async () => {
    const s = await open(slug);
    await say(s, "Priya");
    expect((await say(s, "keys mostly")).answers.q_instrument).toBe("opt_piano001");
  });

  it("hands anything else to the agent, and records nothing from it", async () => {
    const s = await open(slug);
    const state = await say(s, "banana bread");
    // Jev said no, so the agent was asked. It is down here, so it failed over.
    expect(calls[0]).toEqual({ url: SYSTEM_ONE, reply: "banana bread" });
    expect(calls.slice(1).every((c) => c.url.includes("/chat/completions"))).toBe(true);
    expect(calls.length).toBeGreaterThan(1);
    // And with no agent to read it, a reply the gate called no answer is not
    // recorded, however happily a short-text question would have validated it.
    expect(state.answers.q_name).toBeUndefined();
    expect(state.currentRef).toBe("q_name");
  });

  it("sends a question straight to the agent without asking Jev", async () => {
    const s = await open(slug);
    const state = await say(s, "why do you need my name?");
    expect(calls.some((c) => c.url === SYSTEM_ONE)).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
    expect(state.answers.q_name).toBeUndefined();
    expect(state.currentRef).toBe("q_name");
  });
});

describe("Scripted", () => {
  let slug: string;
  beforeAll(async () => {
    slug = await seedForm("scripted", "template");
  });

  it("takes a plain answer through Jev, with no chat call", async () => {
    const s = await open(slug);
    const state = await say(s, "Priya");
    expect(state.answers.q_name).toBe("Priya");
    expect(calls).toEqual([{ url: SYSTEM_ONE, reply: "Priya" }]);
  });

  it("asks the same question again when Jev says it is not an answer, and never calls the agent", async () => {
    const s = await open(slug);
    const state = await say(s, "banana bread");
    // A short-text question validates any string. Before the gate, this was recorded.
    expect(state.answers.q_name).toBeUndefined();
    expect(state.currentRef).toBe("q_name");
    expect(calls).toEqual([{ url: SYSTEM_ONE, reply: "banana bread" }]);
    expect((await lastAssistant(s.sessionId)).join("")).toContain("What's your name?");
  });

  it("answers a question with the aside and asks again, without Jev or the agent", async () => {
    const s = await open(slug);
    const state = await say(s, "why do you need my name?");
    expect(calls).toEqual([]);
    expect(state.currentRef).toBe("q_name");
    expect((await lastAssistant(s.sessionId)).join("")).toContain("What's your name?");
  });

  it("still records a typed option when Jev maps it", async () => {
    const s = await open(slug);
    await say(s, "Priya");
    expect((await say(s, "I play the violin")).answers.q_instrument).toBe("violin");
  });
});

describe("Agentic", () => {
  it("never asks Jev", async () => {
    const slug = await seedForm("agentic", "ai");
    const s = await open(slug);
    await say(s, "Priya");
    expect(calls.some((c) => c.url === SYSTEM_ONE)).toBe(false);
  });
});
