import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi } from "./helpers.js";
import type { SessionDO } from "../src/do/session-do.js";
import { sessionObjectId } from "../src/lib/session-location.js";

/**
 * Where an agent turn's model calls go, and how many it makes.
 *
 * The chat model is a fake `fetch` that streams whatever each test queues, so a
 * turn runs end to end: which provider and model each call asked for, what
 * happens when one says nothing, and what the turn's timing row says after.
 */

const SYSTEM_ONE = "https://openrouter.ai/api/v1/systemone";
const CHAT = "https://openrouter.ai/api/v1/chat/completions";

vi.setConfig({ testTimeout: 20_000 });

interface ChatBody {
  model: string;
  models?: string[];
  provider?: { order?: string[]; sort?: string };
}

/** One queued answer: a provider name and what it streams back, or a call that never answers. */
type Reply = { provider: string; text?: string; record?: { ref: string; value: string } } | "hang";

const sent: ChatBody[] = [];
let queue: Reply[] = [];
let generation = 0;
const realFetch = globalThis.fetch;

function sse(reply: Exclude<Reply, "hang">, model: string): Response {
  const id = `gen-${++generation}`;
  const delta: Record<string, unknown> = { role: "assistant", content: reply.text ?? "" };
  if (reply.record) {
    delta.tool_calls = [
      {
        index: 0,
        id: `call_${generation}`,
        type: "function",
        function: { name: "record_answer", arguments: JSON.stringify(reply.record) },
      },
    ];
  }
  const head = { id, model, provider: reply.provider };
  const frames = [
    { ...head, choices: [{ index: 0, delta, finish_reason: null }] },
    {
      ...head,
      choices: [{ index: 0, delta: {}, finish_reason: reply.record ? "tool_calls" : "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 20, total_tokens: 1020, cost: 0.0004 },
    },
  ];
  const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

beforeAll(async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === SYSTEM_ONE) {
      // Never "simply the answer", so Hybrid always hands the reply to the agent.
      return Response.json({
        id: "gen-jev",
        model: "typesafe/jev-1.13-20260917",
        answers: { direct: { type: "noul", noul: 0.05 } },
        usage: { input_tokens: 200, output_tokens: 30, cost: 0.0000084 },
      });
    }
    if (url === CHAT) {
      const body = JSON.parse(String(init?.body)) as ChatBody;
      sent.push(body);
      const reply = queue.shift();
      if (!reply) return new Response(JSON.stringify({ error: { message: "nothing queued" } }), { status: 400 });
      if (reply === "hang") {
        // Accepted and then silent, which is how a stuck provider looks through OpenRouter.
        const signal = init?.signal;
        const silent = new ReadableStream({
          start: (c) => signal?.addEventListener("abort", () => c.error(signal.reason)),
        });
        return new Response(silent, { headers: { "content-type": "text/event-stream" } });
      }
      return sse(reply, body.model);
    }
    return realFetch(input, init);
  });
  const e = env as unknown as Record<string, unknown>;
  e.OPENROUTER_API_KEY = "sk-test";
  e.AI_STALL_MS = "200";
  await applySchema();
});

afterAll(() => {
  vi.restoreAllMocks();
  const e = env as unknown as Record<string, unknown>;
  e.OPENROUTER_API_KEY = "";
  delete e.AI_STALL_MS;
});

beforeEach(() => {
  sent.length = 0;
  queue = [];
});

const blocks = [
  { id: "blk_ar000001", ref: "q_name", type: "short_text", title: "What's your name?", required: true },
  { id: "blk_ar000002", ref: "q_city", type: "short_text", title: "Which city are you in?", required: true },
  { id: "blk_ar000003", ref: "q_last", type: "short_text", title: "Anything else you want to tell us?", required: true },
];

async function seedForm(label: string, mode: "ai" | "hybrid"): Promise<string> {
  const t = await seedTenant(label);
  const slug = `route-${label}`;
  const json = JSON.stringify({
    schemaVersion: 6,
    title: "Route",
    blocks,
    endings: [{ id: "end_ar000001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
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

type Session = { sessionId: string; respondentToken: string };

const stubFor = (sid: string) => env.SESSION_DO.get(sessionObjectId(env.SESSION_DO, sid)) as unknown as DurableObjectStub<SessionDO>;

async function open(slug: string): Promise<Session> {
  const res = await fetchApi(`/p/forms/${slug}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  return (await res.json()) as Session;
}

async function say(s: Session, text: string, replies: Reply[]) {
  sent.length = 0;
  queue = replies;
  const turnId = crypto.randomUUID();
  const res = await fetchApi(`/p/sessions/${s.sessionId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-respondent-token": s.respondentToken },
    body: JSON.stringify({ type: "text", text, turnId }),
  });
  expect(res.status).toBe(202);
  return { state: await stubFor(s.sessionId).getStatus(), turnId };
}

interface TimingRow {
  path: string;
  steps: number | null;
  provider: string | null;
  model: string | null;
  second_step: string | null;
  stalls: number | null;
  model_ms: number | null;
  prep_ms: number | null;
  steps_json: string | null;
}

/** The turn's timing row, which is written after the turn and never awaited by it. */
async function timing(s: Session, turnId: string): Promise<TimingRow> {
  return vi.waitFor(async () => {
    const row = await env.DB.prepare(`SELECT * FROM chat_turn_timings WHERE session_id = ? AND turn_id = ? AND path IS NOT NULL`)
      .bind(s.sessionId, turnId)
      .first<TimingRow>();
    if (!row) throw new Error("no timing row yet");
    return row;
  });
}

const transcript = async (s: Session) => (await stubFor(s.sessionId).getTranscript()).map((m) => m.content);

describe("Hybrid", () => {
  let slug: string;
  beforeAll(async () => {
    slug = await seedForm("hybrid", "hybrid");
  });

  it("stops after the one call that recorded the answer, and asks next in the author's words", async () => {
    const s = await open(slug);
    const { state, turnId } = await say(s, "everyone calls me Sam", [
      { provider: "Google AI Studio", record: { ref: "q_name", value: "Sam" } },
    ]);

    expect(state.answers.q_name).toBe("Sam");
    expect(state.currentRef).toBe("q_city");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.model).toBe("google/gemini-3.7-flash");
    expect(sent[0]!.provider).toEqual({ order: ["google-ai-studio", "google-vertex"] });
    // A second vendor is named on the request, for when Gemini cannot be reached.
    expect(sent[0]!.models).toEqual(["google/gemini-3.7-flash", "anthropic/claude-haiku-4.5"]);
    expect(await transcript(s)).toContain("Which city are you in?");

    const row = await timing(s, turnId);
    expect(row).toMatchObject({ path: "agent", steps: 1, provider: "Google AI Studio", second_step: null, stalls: 0 });
    expect(row.prep_ms).not.toBeNull();
    const calls = JSON.parse(row.steps_json!) as { provider: string; id: string; tools: string[] }[];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ provider: "Google AI Studio", tools: ["record_answer"] });
    expect(calls[0]!.id).toMatch(/^gen-/);
  });

  it("does not print the question twice when the model already asked it", async () => {
    const s = await open(slug);
    await say(s, "everyone calls me Sam", [
      { provider: "Google AI Studio", text: "Thanks, Sam! Which city are you in?", record: { ref: "q_name", value: "Sam" } },
    ]);
    expect(sent).toHaveLength(1);
    const said = await transcript(s);
    expect(said.filter((m) => m.includes("Which city are you in?"))).toHaveLength(1);
  });

  it("asks the other provider when the first says nothing, and starts there next time", async () => {
    const s = await open(slug);
    const first = await say(s, "everyone calls me Sam", ["hang", { provider: "Google", record: { ref: "q_name", value: "Sam" } }]);

    expect(first.state.answers.q_name).toBe("Sam");
    expect(sent.map((b) => b.provider?.order?.[0])).toEqual(["google-ai-studio", "google-vertex"]);
    const row = await timing(s, first.turnId);
    expect(row).toMatchObject({ path: "agent", stalls: 1, steps: 1 });
    const calls = JSON.parse(row.steps_json!) as { provider: string; stalled?: boolean }[];
    expect(calls.map((c) => [c.provider, c.stalled ?? false])).toEqual([
      ["Google AI Studio", true],
      ["Google", false],
    ]);

    await say(s, "somewhere near Pune I think", [{ provider: "Google", record: { ref: "q_city", value: "Pune" } }]);
    expect(sent[0]!.provider?.order?.[0]).toBe("google-vertex");
  });

  it("falls back to the author's wording when no provider answers", async () => {
    const s = await open(slug);
    const { state } = await say(s, "everyone calls me Sam", ["hang", "hang"]);
    // Each provider once, and no third try.
    expect(sent.map((b) => b.provider?.order?.[0])).toEqual(["google-ai-studio", "google-vertex"]);
    // The turn still ends with a question on screen, taken by the scripted path.
    expect(state.status).toBe("active");
    expect(state.currentRef).not.toBeNull();
  });
});

describe("Agentic", () => {
  let slug: string;
  beforeAll(async () => {
    slug = await seedForm("agentic", "ai");
  });

  it("asks its first question on the faster model", async () => {
    queue = [{ provider: "Google AI Studio", text: "Hi! What's your name?" }];
    await open(slug);
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));
    expect(sent[0]!.model).toBe("google/gemini-3.1-flash-lite");
  });

  it("keeps a turn's second call on the provider that answered its first", async () => {
    queue = [{ provider: "Google AI Studio", text: "Hi! What's your name?" }];
    const s = await open(slug);
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));

    const { state, turnId } = await say(s, "everyone calls me Sam", [
      { provider: "Google", record: { ref: "q_name", value: "Sam" } },
      { provider: "Google", text: "Thanks, Sam! Which city are you in?" },
    ]);

    expect(state.answers.q_name).toBe("Sam");
    expect(sent).toHaveLength(2);
    // A typed reply is read by the main model; the sentence after it is written by the faster one.
    expect(sent.map((b) => b.model)).toEqual(["google/gemini-3.7-flash", "google/gemini-3.1-flash-lite"]);
    // The first call asked AI Studio and was answered by Vertex, so the second asks Vertex.
    expect(sent.map((b) => b.provider?.order?.[0])).toEqual(["google-ai-studio", "google-vertex"]);

    const row = await timing(s, turnId);
    expect(row).toMatchObject({ steps: 2, provider: "Google", second_step: "no_text" });
  });

  it("keeps the recorded answer when the second call says nothing", async () => {
    queue = [{ provider: "Google AI Studio", text: "Hi! What's your name?" }];
    const s = await open(slug);
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));

    const { state, turnId } = await say(s, "everyone calls me Sam", [
      { provider: "Google AI Studio", record: { ref: "q_name", value: "Sam" } },
      "hang",
    ]);

    expect(state.answers.q_name).toBe("Sam");
    expect(state.currentRef).toBe("q_city");
    expect(await transcript(s)).toContain("Which city are you in?");
    expect(await timing(s, turnId)).toMatchObject({ stalls: 1, steps: 1 });
  });
});
