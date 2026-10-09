import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi } from "./helpers.js";
import type { SessionDO } from "../src/do/session-do.js";
import { sessionObjectId } from "../src/lib/session-location.js";

/**
 * A contact card typed out as a message instead of filled in.
 *
 * The production bug: "Mohith, kumar, mohith@example.com, +917799444494" typed
 * under a contact card. The agent could not record a card (its tool takes one
 * value), recorded the line as a string anyway, was told "accepted", and asked
 * the next question. The card was then refused and asked again underneath, so
 * the respondent read two questions at once and neither answer was kept.
 *
 * Now the extractor reads the reply into the card's fields before any agent
 * turn. The extractor is a fake here, keyed on the reply; the agent is down, so
 * any turn that reaches it shows up as a failed chat call.
 */

vi.setConfig({ testTimeout: 20_000 });

const EXTRACTED: Record<string, unknown> = {
  "Mohith, kumar, mohith@example.com, +917799444494": {
    value: { first_name: "Mohith", last_name: "Kumar", email: "mohith@example.com", phone: "+917799444494" },
    confident: true,
    note: null,
  },
  "Mohith Kumar, mohith@example.com": {
    value: { first_name: "Mohith", last_name: "Kumar", email: "mohith@example.com" },
    confident: true,
    note: null,
  },
  "banana bread": { value: null, confident: false, note: null },
};

const calls: { kind: "extract" | "agent"; reply?: string }[] = [];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://openrouter.ai/")) {
      const body = String(init?.body ?? "");
      const reply = /Their reply: """([\s\S]*?)"""/.exec(JSON.parse(body).messages?.map((m: { content: unknown }) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join("\n") ?? "")?.[1];
      if (body.includes("You convert a person's free-text reply") && reply !== undefined) {
        calls.push({ kind: "extract", reply });
        const out = EXTRACTED[reply] ?? { value: null, confident: false, note: null };
        return Response.json({
          id: "gen-extract-t",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "google/gemini-3.1-flash-lite",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(out) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        });
      }
      calls.push({ kind: "agent" });
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

async function seedForm(label: string): Promise<string> {
  const t = await seedTenant(label);
  const slug = `card-${label}`;
  const json = JSON.stringify({
    schemaVersion: 6,
    title: "Typed card",
    blocks: [
      {
        id: "blk_tc000001",
        ref: "q_contact",
        type: "contact_info",
        title: "Please enter your name, email, and mobile phone number",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { id: "blk_tc000002", ref: "q_reason", type: "short_text", title: "What is the main reason for your visit?", required: true },
    ],
    endings: [{ id: "end_tc000001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
    logic: [],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    layout: {},
    settings: { agent: { mode: "hybrid" }, onComplete: { requireSubmit: false } },
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

const stubFor = (sid: string) => env.SESSION_DO.get(sessionObjectId(env.SESSION_DO, sid)) as unknown as DurableObjectStub<SessionDO>;

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

type Evt = { seq: number; type: string; data: Record<string, unknown> };

async function lastQuestion(s: { sessionId: string }): Promise<Evt | undefined> {
  const { events } = (await stubFor(s.sessionId).eventsSince(0)) as unknown as { events: Evt[] };
  return events.filter((e) => e.type === "question").at(-1);
}

describe("a contact card typed out as a message", () => {
  let slug: string;
  beforeAll(async () => {
    slug = await seedForm("typed");
  });

  it("is read into the card's fields and recorded, without an agent turn", async () => {
    const s = await open(slug);
    const state = await say(s, "Mohith, kumar, mohith@example.com, +917799444494");
    expect(state.answers.q_contact).toMatchObject({
      first_name: "Mohith",
      last_name: "Kumar",
      email: "mohith@example.com",
      phone: "+917799444494",
    });
    expect(state.currentRef).toBe("q_reason");
    expect(calls).toEqual([{ kind: "extract", reply: "Mohith, kumar, mohith@example.com, +917799444494" }]);
  });

  it("keeps what it could read and asks only for the rest, with the fields filled in", async () => {
    const s = await open(slug);
    const state = await say(s, "Mohith Kumar, mohith@example.com");
    // Never moved on: the phone is required.
    expect(state.answers.q_contact).toBeUndefined();
    expect(state.currentRef).toBe("q_contact");
    const q = await lastQuestion(s);
    expect(q?.data.prefill).toMatchObject({ first_name: "Mohith", last_name: "Kumar", email: "mohith@example.com" });
  });

  it("records nothing and stays on the card when the reply holds no details", async () => {
    const s = await open(slug);
    const state = await say(s, "banana bread");
    expect(calls[0]).toEqual({ kind: "extract", reply: "banana bread" });
    expect(state.answers.q_contact).toBeUndefined();
    expect(state.currentRef).toBe("q_contact");
  });

  it("sends a question straight to the agent, without extracting", async () => {
    const s = await open(slug);
    const state = await say(s, "why do you need my phone number?");
    expect(calls.some((c) => c.kind === "extract")).toBe(false);
    expect(state.currentRef).toBe("q_contact");
  });
});
