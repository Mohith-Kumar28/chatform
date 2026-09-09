import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import type { SessionDO } from "../src/do/session-do.js";

/**
 * What has to survive a bad network.
 *
 * A respondent whose answer reaches the server and whose reply does not reach
 * them back is the failure this file exists for. The browser cannot tell that
 * case apart from an answer that never arrived, so it has to be free to send
 * again — and everything below is what makes sending again safe, and what
 * makes the state it is sending against recoverable afterwards:
 *
 *   `turnId`            a resent answer is recognised, not taken twice
 *   token coalescing    a reconnect replays messages, not keystrokes
 *   answer reconciliation  an answer the results table lost is put back
 *
 * Template mode throughout: no model call, so every event under test is the
 * flow's own and the assertions are about durability rather than phrasing.
 */

let t: Tenant;
const SLUG = "turn-durability";

const blocks = [
  {
    id: "blk_td000001",
    ref: "q_one",
    type: "short_text",
    // Deliberately long: the template streamer chunks at twelve characters, so
    // a short title would arrive as a single token and prove nothing about the
    // coalescing below.
    title: "Which tools have you used in the past to collect answers from people?",
    required: true,
    minLength: 0,
    maxLength: 200,
  },
  {
    id: "blk_td000002",
    ref: "q_two",
    type: "short_text",
    title: "And what is the most annoying thing about the way you collect them today?",
    required: true,
    minLength: 0,
    maxLength: 200,
  },
];

const doc = {
  schemaVersion: 6,
  title: "Durability",
  blocks,
  endings: [{ id: "end_td000001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: false } },
  theme: {},
};

const stubFor = (sid: string) =>
  env.SESSION_DO.get(env.SESSION_DO.idFromName(sid)) as unknown as DurableObjectStub<SessionDO>;

interface Opened {
  sessionId: string;
  respondentToken: string;
}

const open = async (): Promise<Opened> =>
  (await (
    await fetchApi(`/p/forms/${SLUG}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
  ).json()) as Opened;

const say = (s: Opened, body: Record<string, unknown>) =>
  fetchApi(`/p/sessions/${s.sessionId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-respondent-token": s.respondentToken },
    body: JSON.stringify(body),
  });

/**
 * The replay a reconnecting browser would receive, parsed back into frames.
 *
 * Read with a deadline rather than to completion: the stream stays open by
 * design, so `getReader` would otherwise sit on the keep-alive forever.
 */
async function replay(sessionId: string): Promise<{ type: string; data: Record<string, unknown> }[]> {
  const res = await stubFor(sessionId).stream();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + 2000;
  for (;;) {
    const next = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), 250)),
    ]);
    if (next.done || Date.now() > deadline) break;
    buf += decoder.decode(next.value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return buf
    .split("\n\n")
    .map((chunk) => {
      const type = /^event: (.+)$/m.exec(chunk)?.[1];
      const data = /^data: (.+)$/m.exec(chunk)?.[1];
      return type && data ? { type, data: JSON.parse(data) as Record<string, unknown> } : null;
    })
    .filter((e): e is { type: string; data: Record<string, unknown> } => e !== null);
}

/** Poll until a query returns something, or give up. For `waitUntil` writes. */
async function until<T>(read: () => Promise<T | null>, tries = 40): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const got = await read();
    if (got) return got;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("turndur");
  const json = JSON.stringify(doc);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES ('ver_td', ?1, 1, ?2, 'ck', ?3, ?4, ?3)`,
    ).bind(t.formId, json, now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', slug = ?1, working_schema = ?2, active_version_id = 'ver_td' WHERE id = ?3`,
    ).bind(SLUG, json, t.formId),
  ]);
});

describe("a resent answer", () => {
  it("is taken once, however many times it arrives", async () => {
    const s = await open();
    const turnId = crypto.randomUUID();
    const body = { type: "text", text: "Typeform, Tally", turnId };

    const first = await say(s, body);
    expect(first.status).toBe(202);

    // The browser never saw that response and sends the same turn again.
    const second = await say(s, body);
    // Accepted, because it *was* accepted — telling the client otherwise would
    // put an error over a turn that succeeded.
    expect(second.status).toBe(202);

    const state = await stubFor(s.sessionId).getStatus();
    expect(state.answers.q_one).toBe("Typeform, Tally");
    // One user message, not two: the resend must not double the transcript.
    const frames = await replay(s.sessionId);
    const said = frames.filter((f) => f.type === "user_message" && f.data.text === "Typeform, Tally");
    expect(said).toHaveLength(1);
    // And the conversation moved on exactly one question.
    expect(state.currentRef).toBe("q_two");
  });

  it("still takes a genuinely new answer that carries its own id", async () => {
    const s = await open();
    await say(s, { type: "text", text: "Typeform, Tally", turnId: crypto.randomUUID() });
    await say(s, { type: "text", text: "People don't finish", turnId: crypto.randomUUID() });
    const state = await stubFor(s.sessionId).getStatus();
    expect(state.answers.q_one).toBe("Typeform, Tally");
    expect(state.answers.q_two).toBe("People don't finish");
  });

  it("takes an answer sent without an id, as the headless API and older pages do", async () => {
    const s = await open();
    expect((await say(s, { type: "text", text: "Tally only" })).status).toBe(202);
    expect((await stubFor(s.sessionId).getStatus()).answers.q_one).toBe("Tally only");
  });
});

describe("the replay a reconnecting browser gets", () => {
  it("carries each message as one frame rather than one per keystroke", async () => {
    const s = await open();
    await say(s, { type: "text", text: "Typeform, Tally", turnId: crypto.randomUUID() });

    const frames = await replay(s.sessionId);
    const byMessage = new Map<string, number>();
    for (const f of frames) {
      if (f.type !== "token") continue;
      const id = f.data.messageId as string;
      byMessage.set(id, (byMessage.get(id) ?? 0) + 1);
    }
    expect(byMessage.size).toBeGreaterThan(0);
    // Each closed bubble replays as exactly one token frame.
    for (const [, count] of byMessage) expect(count).toBe(1);

    // And it is the whole message, not the first twelve characters of it.
    const text = frames
      .filter((f) => f.type === "token")
      .map((f) => f.data.delta as string)
      .join("");
    expect(text).toContain("most annoying thing");
  });

  it("carries the finished text on message_end, so a half-received bubble can be repaired", async () => {
    const s = await open();
    await say(s, { type: "text", text: "Typeform, Tally", turnId: crypto.randomUUID() });
    const frames = await replay(s.sessionId);

    const ends = frames.filter((f) => f.type === "message_end");
    expect(ends.length).toBeGreaterThan(0);
    for (const end of ends) {
      const id = end.data.messageId as string;
      const streamed = frames
        .filter((f) => f.type === "token" && f.data.messageId === id)
        .map((f) => f.data.delta as string)
        .join("");
      // This is what a device that dropped out mid-message cannot rebuild from
      // replay alone: every token frame is below the mark it already passed,
      // and `message_end` is the one frame above it.
      expect(end.data.text).toBe(streamed);
    }
  });

  it("puts message_end above every token of its own message", async () => {
    // The property the repair above depends on. If a token could outrank its
    // own `message_end`, the ratchet would drop the repair too.
    const s = await open();
    await say(s, { type: "text", text: "Typeform, Tally", turnId: crypto.randomUUID() });
    const res = await stubFor(s.sessionId).eventsSince(0, 500);
    const lastTokenSeq = new Map<string, number>();
    for (const e of res.events) {
      if (e.type !== "token") continue;
      const id = (e.data as { messageId: string }).messageId;
      lastTokenSeq.set(id, Math.max(lastTokenSeq.get(id) ?? 0, e.seq));
    }
    for (const e of res.events) {
      if (e.type !== "message_end") continue;
      const id = (e.data as { messageId: string }).messageId;
      const tok = lastTokenSeq.get(id);
      if (tok !== undefined) expect(e.seq).toBeGreaterThan(tok);
    }
  });

  it("replays the end of a conversation, which is where its state is", async () => {
    const s = await open();
    await say(s, { type: "text", text: "Typeform, Tally", turnId: crypto.randomUUID() });
    const frames = await replay(s.sessionId);
    // The last question is the one thing a reload cannot do without: it is what
    // puts the controls back under the transcript.
    const questions = frames.filter((f) => f.type === "question");
    expect(questions.at(-1)?.data.block).toMatchObject({ ref: "q_two" });
  });
});

describe("an answer the results table lost", () => {
  it("is put back when the response is finalized", async () => {
    // Every response this suite has already left on the form, so the one this
    // test creates can be told apart from them.
    const before = new Set(
      ((await env.DB.prepare(`SELECT id FROM submissions WHERE form_id = ?`).bind(t.formId).all<{ id: string }>())
        .results ?? []).map((r) => r.id),
    );

    const s = await open();
    await say(s, { type: "text", text: "Typeform, Tally", turnId: crypto.randomUUID() });

    // The live projection runs under `waitUntil`, so wait for it rather than
    // racing it — this test is about what happens once the row is lost, and it
    // has to lose a row that was actually there.
    const row = await until(async () => {
      const { results } = await env.DB.prepare(
        `SELECT submission_id FROM submission_answers WHERE form_id = ? AND block_ref = 'q_one'`,
      )
        .bind(t.formId)
        .all<{ submission_id: string }>();
      return (results ?? []).find((r) => !before.has(r.submission_id)) ?? null;
    });
    expect(row).toBeTruthy();

    /**
     * Exactly what a failed `projectAnswer` leaves behind: the DO holds the
     * answer, the results table does not, and nothing in the old code path
     * ever looked again.
     */
    await env.DB.prepare(`DELETE FROM submission_answers WHERE submission_id = ? AND block_ref = 'q_one'`)
      .bind(row!.submission_id)
      .run();

    await say(s, { type: "text", text: "People don't finish", turnId: crypto.randomUUID() });

    const healed = await until(() =>
      env.DB.prepare(`SELECT value_json FROM submission_answers WHERE submission_id = ? AND block_ref = 'q_one'`)
        .bind(row!.submission_id)
        .first<{ value_json: string }>(),
    );
    expect(healed?.value_json).toBe(JSON.stringify("Typeform, Tally"));
  });
});
