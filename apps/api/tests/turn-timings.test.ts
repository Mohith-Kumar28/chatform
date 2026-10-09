import { beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";

/**
 * Every respondent turn leaves a timing row, and the console reads it back as
 * percentiles.
 *
 * Driven in Scripted mode with no model key, so no model is in the loop: the
 * point is the plumbing — the session's half, the browser's half landing on the
 * same row whichever arrives first, and the admin page's arithmetic.
 */

let admin: Tenant;
let slug: string;

beforeAll(async () => {
  await applySchema();
  (env as unknown as Record<string, string | undefined>).PLATFORM_ADMIN_EMAILS = "timer@example.com";
  admin = await seedTenant("timer");
  const t = await seedTenant("timed");
  slug = "timed-form";
  const json = JSON.stringify({
    schemaVersion: 6,
    title: "Timed",
    blocks: [
      { id: "blk_tt000001", ref: "q_name", type: "short_text", title: "What's your name?", required: true },
      { id: "blk_tt000002", ref: "q_city", type: "short_text", title: "Where are you based?", required: true },
    ],
    endings: [{ id: "end_tt000001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
    logic: [],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    layout: {},
    settings: { agent: { mode: "template" }, onComplete: { requireSubmit: false } },
    theme: {},
  });
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind("ver_timed", t.formId, json, now, t.userId),
    env.DB.prepare(`UPDATE forms SET status = 'published', slug = ?1, working_schema = ?2, active_version_id = ?3 WHERE id = ?4`).bind(
      slug,
      json,
      "ver_timed",
      t.formId,
    ),
  ]);
});

async function open() {
  const res = await fetchApi(`/p/forms/${slug}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1" },
    body: "{}",
  });
  return (await res.json()) as { sessionId: string; respondentToken: string };
}

const post = (s: { sessionId: string; respondentToken: string }, path: string, body: unknown) =>
  fetchApi(`/p/sessions/${s.sessionId}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-respondent-token": s.respondentToken },
    body: JSON.stringify(body),
  });

type TimingRow = {
  turn_id: string;
  path: string | null;
  is_final: number;
  first_word_ms: number | null;
  next_card_ms: number | null;
  client_ms: number | null;
  device: string | null;
  kind: string | null;
};

const rowsFor = async (sessionId: string) =>
  (
    await env.DB.prepare(`SELECT * FROM chat_turn_timings WHERE session_id = ? ORDER BY created_at`)
      .bind(sessionId)
      .all<TimingRow>()
  ).results;

describe("chat_turn_timings", () => {
  it("records each answer, and marks the one that reached the ending", async () => {
    const s = await open();
    expect((await post(s, "messages", { type: "text", text: "Asha", turnId: "turn_timing_01" })).status).toBe(202);
    expect((await post(s, "messages", { type: "text", text: "Pune", turnId: "turn_timing_02" })).status).toBe(202);

    // Written with waitUntil, off the turn's own path.
    await vi.waitFor(async () => expect(await rowsFor(s.sessionId)).toHaveLength(2));
    const [first, last] = await rowsFor(s.sessionId);
    expect(first).toMatchObject({ turn_id: "turn_timing_01", kind: "answer", is_final: 0, device: "mobile" });
    expect(first!.next_card_ms).not.toBeNull();
    expect(first!.first_word_ms).not.toBeNull();
    expect(last).toMatchObject({ turn_id: "turn_timing_02", is_final: 1 });
  });

  it("puts the browser's wait on the same row, whichever half lands first", async () => {
    const s = await open();
    // The browser's report can beat the session's own write.
    expect((await post(s, "timing", { turnId: "turn_early_01", clientMs: 1234.4 })).status).toBe(204);
    await post(s, "messages", { type: "text", text: "Ravi", turnId: "turn_early_01" });
    await vi.waitFor(async () => expect((await rowsFor(s.sessionId))[0]?.path).not.toBeNull());
    expect((await rowsFor(s.sessionId))[0]).toMatchObject({ client_ms: 1234 });

    // And the usual order.
    await post(s, "messages", { type: "text", text: "Delhi", turnId: "turn_late_01" });
    await vi.waitFor(async () => expect(await rowsFor(s.sessionId)).toHaveLength(2));
    await post(s, "timing", { turnId: "turn_late_01", clientMs: 900 });
    expect((await rowsFor(s.sessionId))[1]).toMatchObject({ turn_id: "turn_late_01", client_ms: 900, path: "deterministic" });
  });

  it("refuses a report without the respondent's token", async () => {
    const s = await open();
    const res = await fetchApi(`/p/sessions/${s.sessionId}/timing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turnId: "turn_forged_1", clientMs: 1 }),
    });
    expect(res.status).toBe(401);
  });
});

describe("/api/admin/latency", () => {
  it("reads percentiles back, preferring the browser's wait", async () => {
    const s = await open();
    await post(s, "messages", { type: "text", text: "Meera", turnId: "turn_pct_0001" });
    await vi.waitFor(async () => expect(await rowsFor(s.sessionId)).toHaveLength(1));
    await post(s, "timing", { turnId: "turn_pct_0001", clientMs: 60_000 });

    const res = await fetchApi("/api/admin/latency?range=7d", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totals: { turns: number; p50: number; p99: number };
      breakdowns: { dimension: string; rows: { key: string; turns: number }[] }[];
      slowest: { waitMs: number; formTitle: string | null; device: string | null }[];
      days: string[];
      p50Series: number[];
    };
    expect(body.totals.turns).toBeGreaterThan(0);
    expect(body.totals.p99).toBeGreaterThanOrEqual(body.totals.p50);
    // The browser's minute outranks every server-measured turn in this file.
    expect(body.slowest[0]).toMatchObject({ waitMs: 60_000, formTitle: "timed form", device: "mobile" });
    expect(body.days).toHaveLength(7);
    expect(body.p50Series).toHaveLength(7);
    expect(body.breakdowns.find((b) => b.dimension === "Device")?.rows[0]?.key).toBe("mobile");
  });
  it("splits an AI reply into its parts and its model calls", async () => {
    const calls = [
      { model: "google/gemini-3.7-flash", provider: "Google AI Studio", firstMs: null, ms: 6000, tools: [], id: null, stalled: true },
      { model: "google/gemini-3.7-flash", provider: "Google", firstMs: 1800, ms: 2000, tools: ["record_answer"], id: "gen-a" },
      { model: "google/gemini-3.1-flash-lite", provider: "Google", firstMs: 700, ms: 900, tools: [], id: "gen-b" },
    ];
    await env.DB.prepare(
      `INSERT INTO chat_turn_timings
         (session_id, turn_id, organization_id, form_id, created_at, is_test, kind, mode, path, is_final, gate_ms,
          first_word_ms, next_card_ms, total_ms, steps, tools, client_ms, prep_ms, model_ms, model, provider,
          second_step, stalls, steps_json)
       VALUES ('ses_ai', 'turn_ai_0001', 'org_x', NULL, ?1, 0, 'answer', 'ai', 'agent', 0, 300,
          9000, 9200, 9200, 2, 'record_answer', 9500, 40, 8900, 'google/gemini-3.7-flash', 'Google AI Studio',
          'no_text', 1, ?2)`,
    )
      .bind(Date.now(), JSON.stringify(calls))
      .run();

    const res = await fetchApi("/api/admin/latency?range=7d", { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as {
      totals: { ai: { turns: number; p50: number } };
      aiP50Series: number[];
      parts: { key: string; ms: number; turns: number }[];
      calls: { model: string; provider: string; calls: number; firstP50: number; p50: number; stalls: number }[];
      breakdowns: { dimension: string; rows: { key: string }[] }[];
      slowest: { sessionId: string; stalls: number; calls: { id: string | null; stalled: boolean }[] }[];
    };
    // The browser's wait, as everywhere on this page.
    expect(body.totals.ai).toMatchObject({ turns: 1, p50: 9500 });
    expect(body.aiP50Series.at(-1)).toBe(9500);
    const part = Object.fromEntries(body.parts.map((p) => [p.key, p.ms]));
    // The stalled call was the turn's first, so its wait is the first call's time.
    expect(part).toMatchObject({ gate: 300, prep: 40, first_call: 6000, later_calls: 2900, network: 500 });
    expect(body.calls.find((c) => c.provider === "Google AI Studio")).toMatchObject({ calls: 1, stalls: 1, p50: 0 });
    expect(body.calls.find((c) => c.model === "google/gemini-3.1-flash-lite")).toMatchObject({ calls: 1, firstP50: 700, p50: 900 });
    expect(body.breakdowns.find((b) => b.dimension === "Why a second call")?.rows.map((r) => r.key)).toContain("no_text");
    expect(body.breakdowns.find((b) => b.dimension === "Provider")?.rows.map((r) => r.key)).toContain("Google AI Studio");
    const slow = body.slowest.find((r) => r.sessionId === "ses_ai")!;
    expect(slow.stalls).toBe(1);
    expect(slow.calls.map((c) => [c.id, c.stalled])).toEqual([
      [null, true],
      ["gen-a", false],
      ["gen-b", false],
    ]);
  });
});
