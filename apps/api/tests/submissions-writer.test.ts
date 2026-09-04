import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import { openResponse, recordAnswerRow, finalizeResponse, type ResponseOwner } from "../src/lib/submissions.js";

/**
 * The two response writers must agree.
 *
 * A conversation and a programmatic response are produced by completely
 * different code — a Durable Object running an interview FSM, and a REST
 * handler replaying a flow — but they write the same two tables, and the
 * dashboard reads those tables without caring which produced a row. The moment
 * the two drift, the drop-off funnel, the Summary distributions and every
 * export start meaning something different depending on where a respondent came
 * from, and nothing fails loudly enough to notice.
 *
 * So this drives one of each end to end and asserts the rows are identical
 * apart from the things that are *supposed* to differ: the ids, the timing, and
 * the source. It is the reason `lib/submissions.ts` exists as a module rather
 * than as a convention.
 */

let t: Tenant;

const DOC = {
  schemaVersion: 4,
  title: "Writer parity",
  blocks: [
    { id: "blk_wparity1", ref: "q_email", type: "email", title: "Email?", required: true },
    { id: "blk_wparity2", ref: "q_rating", type: "rating", title: "Rate us", required: true, scale: 5 },
  ],
  endings: [{ id: "end_wparity", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  // requireSubmit defaults true, which would park the conversation on a review
  // step waiting for an explicit submit. This test is about the writer, not the
  // review affordance, so the conversation is allowed to finish on its own.
  settings: {
    // Template mode keeps the turn deterministic and model-free; requireSubmit
    // off lets the conversation finish without a review step, which this suite
    // is not about.
    agent: { mode: "template" },
    onComplete: { requireSubmit: false },
  },
  theme: {},
};

const SLUG = "writer-parity";
const VERSION_ID = "ver_wparity";

interface Row {
  id: string;
  status: string;
  source: string;
  is_test: number;
  search_text: string | null;
  duration_ms: number | null;
  meta: string | null;
  hidden_fields: string | null;
  form_id: string;
  organization_id: string;
  form_version_id: string | null;
  completed_at: number | null;
  updated_at: number | null;
}

async function rowFor(id: string): Promise<Row> {
  const row = await env.DB.prepare(`SELECT * FROM submissions WHERE id = ?`).bind(id).first<Row>();
  if (!row) throw new Error(`no submission ${id}`);
  return row;
}

async function answersFor(id: string) {
  const res = await env.DB.prepare(
    `SELECT block_ref, block_type, value_json, value_number FROM submission_answers WHERE submission_id = ? ORDER BY block_ref`,
  )
    .bind(id)
    .all<{ block_ref: string; block_type: string; value_json: string; value_number: number | null }>();
  return res.results ?? [];
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("wparity");

  const now = Date.now();
  // seedTenant already made this form; publish it with the doc this suite needs
  // rather than inserting a second one.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(VERSION_ID, t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', slug = ?1, working_schema = ?2, active_version_id = ?3 WHERE id = ?4`,
    ).bind(SLUG, JSON.stringify(DOC), VERSION_ID, t.formId),
  ]);
});

describe("chat and API writers agree", () => {
  it("produces column-identical rows from a conversation and a direct write", async () => {
    // ── the chat path: a real session through the Durable Object ──────────────
    const created = await fetchApi(`/p/forms/${SLUG}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hiddenFields: { utm_source: "parity" } }),
    });
    expect(created.status).toBe(200);
    const { sessionId, respondentToken } = (await created.json()) as {
      sessionId: string;
      respondentToken: string;
    };

    const answer = (ref: string, value: unknown) =>
      fetchApi(`/p/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-respondent-token": respondentToken },
        body: JSON.stringify({ type: "structured", ref, value }),
      });

    expect((await answer("q_email", "maya@northwind.co")).status).toBe(202);
    expect((await answer("q_rating", 4)).status).toBe(202);

    /**
     * `/p/.../messages` answers 202: the turn runs inside the Durable Object and
     * its D1 projection is handed to `waitUntil`, so the row is not there the
     * instant the POST returns. Poll for the terminal state rather than sleep a
     * guessed number of milliseconds.
     */
    let chatRow: { id: string } | null = null;
    for (let i = 0; i < 100 && !chatRow; i++) {
      chatRow = await env.DB.prepare(
        `SELECT id FROM submissions WHERE session_id = ? AND status = 'completed'`,
      )
        .bind(sessionId)
        .first<{ id: string }>();
      if (!chatRow) await scheduler.wait(50);
    }
    expect(chatRow, "the conversation should have produced a completed response row").toBeTruthy();
    const chat = await rowFor(chatRow!.id);

    // ── the API path: the same two answers, straight through the writer ───────
    const owner: ResponseOwner = {
      env: env as never,
      formId: t.formId,
      formVersionId: VERSION_ID,
      organizationId: t.orgId,
      sessionId: null,
      source: "api",
    };
    const startedAt = Date.now();
    const apiId = await openResponse(owner, {
      hiddenFields: { utm_source: "parity" },
      variables: {},
      userAgent: null,
      country: null,
      startedAt,
    });
    await recordAnswerRow(owner, {
      responseId: apiId,
      block: { ref: "q_email", type: "email" },
      value: "maya@northwind.co",
    });
    await recordAnswerRow(owner, {
      responseId: apiId,
      block: { ref: "q_rating", type: "rating" },
      value: 4,
    });
    const fin = await finalizeResponse(owner, {
      responseId: apiId,
      status: "completed",
      endingRef: "end_thanks",
      answers: { q_email: "maya@northwind.co", q_rating: 4 },
      variables: {},
      startedAt,
      collectedCount: 2,
    });
    expect(fin.changed).toBe(true);

    const api = await rowFor(apiId);

    // ── the comparison ───────────────────────────────────────────────────────
    expect(api.status).toBe(chat.status);
    expect(api.form_id).toBe(chat.form_id);
    expect(api.organization_id).toBe(chat.organization_id);
    expect(api.form_version_id).toBe(chat.form_version_id);
    expect(api.hidden_fields).toBe(chat.hidden_fields);
    expect(api.is_test).toBe(chat.is_test);
    // The same answers must flatten to the same haystack — this is what keeps
    // dashboard search finding API responses.
    expect(api.search_text).toBe(chat.search_text);
    expect(JSON.parse(api.meta!).endingRef).toBe(JSON.parse(chat.meta!).endingRef);
    expect(api.completed_at).toBeTruthy();
    expect(chat.completed_at).toBeTruthy();
    expect(api.updated_at).toBeTruthy();
    expect(chat.updated_at).toBeTruthy();

    // The differences that are supposed to exist, asserted so a future change
    // that erases them is caught too.
    expect(chat.source).toBe("chat");
    expect(api.source).toBe("api");

    // ── the answer rows ──────────────────────────────────────────────────────
    const chatAnswers = await answersFor(chat.id);
    const apiAnswers = await answersFor(api.id);
    expect(apiAnswers).toEqual(chatAnswers);
    // value_number is what the Summary tab's averages read; a null here would
    // silently empty the numeric distributions for API responses only.
    expect(apiAnswers.find((a) => a.block_ref === "q_rating")?.value_number).toBe(4);
  }, 30_000);

  it("refuses to finalize the same response twice", async () => {
    const owner: ResponseOwner = {
      env: env as never,
      formId: t.formId,
      formVersionId: VERSION_ID,
      organizationId: t.orgId,
      sessionId: null,
      source: "api",
    };
    const startedAt = Date.now();
    const id = await openResponse(owner, {
      hiddenFields: {},
      variables: {},
      userAgent: null,
      country: null,
      startedAt,
    });

    const first = await finalizeResponse(owner, {
      responseId: id,
      status: "completed",
      endingRef: "end_thanks",
      answers: {},
      startedAt,
      collectedCount: 0,
    });
    // The abandon sweep arriving late on a response someone just completed.
    const second = await finalizeResponse(owner, {
      responseId: id,
      status: "abandoned",
      endingRef: null,
      abandonReason: "idle_timeout",
      answers: {},
      startedAt,
      collectedCount: 0,
    });

    expect(first.changed).toBe(true);
    expect(second.changed, "a second finalize must not fire a second webhook").toBe(false);
    expect((await rowFor(id)).status).toBe("completed");
  });

  it("writes nothing at all for a preview session", async () => {
    const owner: ResponseOwner = {
      env: env as never,
      formId: t.formId,
      formVersionId: "preview",
      organizationId: t.orgId,
      sessionId: null,
      source: "chat",
    };
    const id = await openResponse(owner, {
      hiddenFields: {},
      variables: {},
      userAgent: null,
      country: null,
      startedAt: Date.now(),
    });
    await recordAnswerRow(owner, { responseId: id, block: { ref: "q_email", type: "email" }, value: "x@y.co" });

    const row = await env.DB.prepare(`SELECT id FROM submissions WHERE id = ?`).bind(id).first();
    expect(row, "a builder preview must leave no trace in customer data").toBeNull();
  });
});
