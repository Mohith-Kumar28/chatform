import type { Bindings } from "../env.js";

/**
 * How long one respondent turn kept them waiting, and what it did meanwhile.
 *
 * The session fills this in as the turn runs (marks are set from `emit`, so
 * they are the moments the events actually left) and writes it once, off the
 * hot path, when the turn ends. The browser reports its own wait separately —
 * see `recordClientTiming` — because the server cannot see the network.
 */
export interface TurnTiming {
  turnId: string;
  kind: "answer" | "action";
  started: number;
  blockType: string | null;
  gateMs: number | null;
  /** Any model turn ran. Decides `path` along with `gateMs`. */
  agent: boolean;
  firstWordMs: number | null;
  nextCardMs: number | null;
  /** The turn reached an ending or the review step. */
  isFinal: boolean;
  steps: number;
  tools: string[];
  inputTokens: number;
  cacheReadTokens: number;
  /** For actions: which one (`submit`, `skip`, …). */
  action?: string;
}

export function startTurnTiming(turnId: string, kind: TurnTiming["kind"], blockType: string | null): TurnTiming {
  return {
    turnId,
    kind,
    started: Date.now(),
    blockType,
    gateMs: null,
    agent: false,
    firstWordMs: null,
    nextCardMs: null,
    isFinal: false,
    steps: 0,
    tools: [],
    inputTokens: 0,
    cacheReadTokens: 0,
  };
}

/** Which road the turn took: a model turn, the answer gate alone, or neither. */
export function turnPath(t: TurnTiming): string {
  if (t.kind === "action") return `action:${t.action ?? "unknown"}`;
  if (t.agent) return "agent";
  if (t.gateMs !== null) return "gate";
  return "deterministic";
}

/** Never throws: a lost timing row must not fail the turn it describes. */
export async function writeTurnTiming(
  env: Pick<Bindings, "DB">,
  t: TurnTiming,
  row: {
    sessionId: string;
    organizationId: string;
    formId: string;
    isTest: boolean;
    mode: string;
    device: string | null;
    browser: string | null;
    os: string | null;
    country: string | null;
  },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO chat_turn_timings
         (session_id, turn_id, organization_id, form_id, created_at, is_test, kind, mode, path, is_final,
          block_type, gate_ms, first_word_ms, next_card_ms, total_ms, steps, tools, input_tokens,
          cache_read_tokens, device, browser, os, country)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (session_id, turn_id) DO UPDATE SET
         organization_id = excluded.organization_id, form_id = excluded.form_id,
         created_at = excluded.created_at, is_test = excluded.is_test, kind = excluded.kind,
         mode = excluded.mode, path = excluded.path, is_final = excluded.is_final,
         block_type = excluded.block_type, gate_ms = excluded.gate_ms,
         first_word_ms = excluded.first_word_ms, next_card_ms = excluded.next_card_ms,
         total_ms = excluded.total_ms, steps = excluded.steps, tools = excluded.tools,
         input_tokens = excluded.input_tokens, cache_read_tokens = excluded.cache_read_tokens,
         device = excluded.device, browser = excluded.browser, os = excluded.os, country = excluded.country`,
    )
      .bind(
        row.sessionId,
        t.turnId,
        row.organizationId,
        row.formId,
        t.started,
        row.isTest ? 1 : 0,
        t.kind,
        row.mode,
        turnPath(t),
        t.isFinal ? 1 : 0,
        t.blockType,
        t.gateMs,
        t.firstWordMs,
        t.nextCardMs,
        Date.now() - t.started,
        t.agent ? t.steps : null,
        t.tools.length ? t.tools.join(",") : null,
        t.agent ? t.inputTokens : null,
        t.agent ? t.cacheReadTokens : null,
        row.device,
        row.browser,
        row.os,
        row.country,
      )
      .run();
  } catch (err) {
    console.error("turn_timing_write_failed", { sessionId: row.sessionId, message: String(err) });
  }
}

/** The ceiling on a reported wait. Anything above it is a tab that slept, not a slow reply. */
const CLIENT_MS_CAP = 120_000;

/**
 * The wait the respondent's browser measured, from pressing send to the first
 * sign of a reply. May arrive before the session has written its half.
 */
export async function recordClientTiming(
  env: Pick<Bindings, "DB">,
  sessionId: string,
  turnId: string,
  clientMs: number,
): Promise<void> {
  const ms = Math.round(Math.min(Math.max(clientMs, 0), CLIENT_MS_CAP));
  await env.DB.prepare(
    `INSERT INTO chat_turn_timings (session_id, turn_id, created_at, client_ms)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (session_id, turn_id) DO UPDATE SET client_ms = excluded.client_ms`,
  )
    .bind(sessionId, turnId, Date.now(), ms)
    .run();
}
