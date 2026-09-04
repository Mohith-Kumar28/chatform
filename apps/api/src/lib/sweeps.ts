import type { Bindings } from "../env.js";
import { pruneIdempotencyKeys } from "./idempotency.js";

/**
 * Periodic work, from the cron that already runs every five minutes.
 *
 * Three of these exist because the API path has no Durable Object watching it:
 * a conversation is abandoned by its session object's idle alarm, and a
 * programmatic response has nothing equivalent.
 */

/**
 * Abandon API responses past their deadline.
 *
 * Scoped to `source != 'chat'` deliberately: a conversation's abandonment is its
 * own object's decision, and two writers racing to finalise one response would
 * mean two webhooks and two analytics points for it. `finalizeResponse` guards
 * on status as a second line of defence.
 */
export async function sweepExpiredResponses(env: Bindings, limit = 200): Promise<number> {
  const due = await env.DB.prepare(
    `SELECT id, form_id, form_version_id, organization_id, session_id, source, is_test, started_at
       FROM submissions
      WHERE status = 'in_progress' AND source != 'chat' AND expires_at IS NOT NULL AND expires_at < ?
      LIMIT ?`,
  )
    .bind(Date.now(), limit)
    .all<{
      id: string;
      form_id: string;
      form_version_id: string | null;
      organization_id: string;
      session_id: string | null;
      source: string;
      is_test: number;
      started_at: number;
    }>();

  const { finalizeResponse } = await import("./submissions.js");
  let n = 0;
  for (const row of due.results ?? []) {
    const answers = await env.DB.prepare(
      `SELECT block_ref, value_json FROM submission_answers WHERE submission_id = ?`,
    )
      .bind(row.id)
      .all<{ block_ref: string; value_json: string }>();
    const map: Record<string, unknown> = {};
    for (const a of answers.results ?? []) {
      try {
        map[a.block_ref] = JSON.parse(a.value_json);
      } catch {
        // one unparseable answer must not stop the sweep
      }
    }

    const { changed } = await finalizeResponse(
      {
        env,
        formId: row.form_id,
        formVersionId: row.form_version_id ?? "",
        organizationId: row.organization_id,
        sessionId: row.session_id,
        source: row.source as "api" | "embed" | "chat",
        isTest: row.is_test === 1,
      },
      {
        responseId: row.id,
        status: "abandoned",
        endingRef: null,
        abandonReason: "expired",
        answers: map as never,
        startedAt: row.started_at,
        collectedCount: Object.keys(map).length,
      },
    );
    if (changed) n++;
  }
  return n;
}

/** Expire respondent tokens whose session outlived its deadline. */
export async function sweepExpiredSessions(env: Bindings, limit = 500): Promise<number> {
  const res = await env.DB.prepare(
    `UPDATE chat_sessions SET status = 'expired'
      WHERE id IN (
        SELECT id FROM chat_sessions
         WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < ?
         LIMIT ?
      )`,
  )
    .bind(Date.now(), limit)
    .run();
  return res.meta?.changes ?? 0;
}

/**
 * Tell integrations about responses that have stalled part-way.
 *
 * Nothing told an integrator about a response in progress until it was abandoned
 * half an hour later, so a half-finished lead was invisible for exactly as long
 * as it was worth following up.
 *
 * "Settled" is the whole design: a response still being written to is not
 * interesting yet, and the five-minute cron interval is the throttle — no
 * timers, no debounce state, no extra storage.
 */
const SETTLED_MS = 60_000;

export async function sweepPartialNotifications(env: Bindings, limit = 200): Promise<number> {
  const now = Date.now();
  const due = await env.DB.prepare(
    `SELECT s.id, s.form_id, s.organization_id, s.session_id, s.source, s.is_test
       FROM submissions s
      WHERE s.status = 'in_progress'
        AND s.is_test = 0
        AND s.updated_at IS NOT NULL
        AND s.updated_at < ?
        AND (s.partial_notified_at IS NULL OR s.partial_notified_at < s.updated_at)
      LIMIT ?`,
  )
    .bind(now - SETTLED_MS, limit)
    .all<{
      id: string;
      form_id: string;
      organization_id: string;
      session_id: string | null;
      source: string;
      is_test: number;
    }>();

  let n = 0;
  for (const row of due.results ?? []) {
    await env.Q_WEBHOOKS.send({
      event: "response.partial",
      organizationId: row.organization_id,
      formId: row.form_id,
      submissionId: row.id,
      ...(row.session_id ? { sessionId: row.session_id } : {}),
      source: row.source,
      isTest: false,
    });
    await env.DB.prepare(`UPDATE submissions SET partial_notified_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();
    n++;
  }
  return n;
}

/** Test data is real data, and it is not kept. */
const TEST_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function pruneTestData(env: Bindings, limit = 500): Promise<number> {
  const cutoff = Date.now() - TEST_RETENTION_MS;
  // submission_answers cascade on the FK, so the parent rows are enough.
  const res = await env.DB.prepare(
    `DELETE FROM submissions WHERE id IN (
       SELECT id FROM submissions WHERE is_test = 1 AND started_at < ? LIMIT ?
     )`,
  )
    .bind(cutoff, limit)
    .run();
  await env.DB.prepare(
    `DELETE FROM chat_sessions WHERE id IN (
       SELECT id FROM chat_sessions WHERE is_test = 1 AND created_at < ? LIMIT ?
     )`,
  )
    .bind(cutoff, limit)
    .run();
  return res.meta?.changes ?? 0;
}

export { pruneIdempotencyKeys };
