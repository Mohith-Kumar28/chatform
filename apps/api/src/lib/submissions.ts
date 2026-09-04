import type { Bindings } from "../env.js";
import type { AnswerMap, RespondentIdentity } from "@repo/form-schema";

/**
 * Every write to `submissions` and `submission_answers`, in one place.
 *
 * Two things now produce responses: the interview Durable Object, and the
 * developer API. They must produce *the same rows* — same `value_number`
 * extraction, same `search_text`, same status transitions — or the drop-off
 * funnel, the Summary distributions and the exports start meaning two different
 * things depending on which surface a respondent came through. Keeping the SQL
 * in one module makes that structural rather than a matter of discipline;
 * `tests/submissions-writer.test.ts` asserts the two paths agree.
 *
 * The DO is the first caller and its behaviour is unchanged: these functions are
 * lifted from it verbatim, with the additions each carrying its own comment.
 */

export type ResponseSource = "chat" | "embed" | "api";

export interface ResponseOwner {
  env: Bindings;
  formId: string;
  /**
   * `"preview"` short-circuits every write in this module.
   *
   * A builder preview runs the real runtime against the working draft, so it
   * reaches all of this code — and must leave no trace in the customer's data.
   */
  formVersionId: string;
  organizationId: string;
  /** Null for a response driven straight through the API with no chat session. */
  sessionId: string | null;
  source: ResponseSource;
  /** Written by a `*_test_` API key: real rows, excluded from every count. */
  isTest?: boolean;
}

export function isPreview(o: ResponseOwner): boolean {
  return o.formVersionId === "preview";
}

export function newResponseId(): string {
  return `sbm_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export interface OpenResponseArgs {
  /** Supply one to make the insert idempotent against a caller-held id. */
  responseId?: string;
  hiddenFields: Record<string, string>;
  variables: Record<string, string | number>;
  userAgent: string | null;
  country: string | null;
  startedAt: number;
  /** Null means "no deadline": the chat path's DO alarm owns abandonment. */
  expiresAt?: number | null;
  apiKeyId?: string | null;
}

/**
 * Create the `submissions` row, or return the one that is already there.
 *
 * `ON CONFLICT DO NOTHING` rather than a read-then-insert: two answers arriving
 * at once on the API path would otherwise race to create two rows for one id.
 */
export async function openResponse(o: ResponseOwner, a: OpenResponseArgs): Promise<string> {
  const id = a.responseId ?? newResponseId();
  if (isPreview(o)) return id;
  await o.env.DB.prepare(
    `INSERT INTO submissions
       (id, form_id, form_version_id, organization_id, session_id, source, is_test, status,
        hidden_fields, meta, started_at, updated_at, expires_at, api_key_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  )
    .bind(
      id,
      o.formId,
      o.formVersionId,
      o.organizationId,
      o.sessionId,
      o.source,
      o.isTest ? 1 : 0,
      JSON.stringify(a.hiddenFields),
      JSON.stringify({ userAgent: a.userAgent, country: a.country, variables: a.variables }),
      a.startedAt,
      // Seeded at creation so the recency cursor and `updated_since` have a value
      // for a response that has not been answered yet.
      a.startedAt,
      a.expiresAt ?? null,
      a.apiKeyId ?? null,
    )
    .run();
  return id;
}

export interface RecordAnswerArgs {
  responseId: string;
  block: { ref: string; type: string };
  value: unknown;
  at?: number;
}

/**
 * Upsert one answer row and bump the parent's `updated_at`.
 *
 * `value_number` is what makes the numeric halves of the Summary tab work, so it
 * is extracted here exactly as the DO extracted it. The `updated_at` bump is the
 * new part: without it a partial has no "last touched", and neither the read
 * API's `updated_since` nor the settled-partial webhook throttle can exist.
 */
export async function recordAnswerRow(o: ResponseOwner, a: RecordAnswerArgs): Promise<void> {
  if (isPreview(o)) return;
  const at = a.at ?? Date.now();
  await o.env.DB.batch([
    o.env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, value_number, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (submission_id, block_ref) DO UPDATE SET value_json = excluded.value_json, value_number = excluded.value_number, updated_at = excluded.updated_at`,
    ).bind(
      `ans_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
      a.responseId,
      o.formId,
      a.block.ref,
      a.block.type,
      JSON.stringify(a.value),
      typeof a.value === "number" ? a.value : null,
      at,
    ),
    o.env.DB.prepare(`UPDATE submissions SET updated_at = ? WHERE id = ?`).bind(at, a.responseId),
  ]);
}

/** Remove a retracted answer. Later answers are deliberately kept, as the chat `edit` action does. */
export async function deleteAnswerRow(o: ResponseOwner, responseId: string, ref: string): Promise<void> {
  if (isPreview(o)) return;
  await o.env.DB.batch([
    o.env.DB.prepare(`DELETE FROM submission_answers WHERE submission_id = ? AND block_ref = ?`).bind(responseId, ref),
    o.env.DB.prepare(`UPDATE submissions SET updated_at = ? WHERE id = ?`).bind(Date.now(), responseId),
  ]);
}

/** Every answer flattened into one lowercase haystack for the dashboard's search box. */
export function buildSearchText(answers: AnswerMap): string {
  return Object.entries(answers)
    .map(([k, v]) => `${k} ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ")
    .toLowerCase()
    .slice(0, 5000);
}

export interface FinalizeArgs {
  responseId: string;
  status: "completed" | "abandoned";
  endingRef: string | null;
  abandonReason?: string;
  answers: AnswerMap;
  variables?: Record<string, string | number>;
  identity?: RespondentIdentity | null;
  startedAt: number;
  collectedCount: number;
  /** Present only when a chat session owns this response. */
  chatSession?: { sessionId: string; status: string; turnCount: number };
  country?: string | null;
}

export interface FinalizeResult {
  /** False when the row was already terminal — the caller must not fire side effects twice. */
  changed: boolean;
  durationMs: number;
}

/**
 * Flip a response terminal, once.
 *
 * `WHERE status = 'in_progress'` and the `changed` flag are the guard that makes
 * the second writer safe: an API `complete` and the abandon sweep can reach the
 * same row, and a second finalize would mean a second webhook and a second
 * analytics point for one response. A lost race is now a no-op the caller can
 * see, rather than a duplicate delivery a customer has to deduplicate.
 */
export async function finalizeResponse(o: ResponseOwner, a: FinalizeArgs): Promise<FinalizeResult> {
  const now = Date.now();
  const durationMs = now - a.startedAt;
  if (isPreview(o)) return { changed: false, durationMs };

  const id = a.identity ?? null;
  const stmts = [
    o.env.DB.prepare(
      `UPDATE submissions
          SET status = ?1, completed_at = ?2, updated_at = ?3, duration_ms = ?4, search_text = ?5,
              meta = json_set(coalesce(meta,'{}'), '$.endingRef', ?6, '$.abandonReason', ?7,
                              '$.variables', json(?8)),
              respondent_provider = ?9, respondent_subject = ?10,
              respondent_email = ?11, respondent_phone = ?12, respondent_name = ?13
        WHERE id = ?14 AND status = 'in_progress'`,
    ).bind(
      a.status,
      a.status === "completed" ? now : null,
      now,
      durationMs,
      buildSearchText(a.answers),
      a.endingRef,
      a.abandonReason ?? null,
      JSON.stringify(a.variables ?? {}),
      // The verified respondent is copied onto the response rather than joined
      // from the session: sessions get pruned, and a response has to stay
      // attributable for as long as it is kept.
      id?.provider ?? null,
      id?.subject ?? null,
      id?.email ?? null,
      id?.phone ?? null,
      id?.name ?? null,
      a.responseId,
    ),
  ];
  if (a.chatSession) {
    stmts.push(
      o.env.DB.prepare(
        `UPDATE chat_sessions SET status = ?, current_block_ref = NULL, collected_count = ?, turn_count = ?, submission_id = ?, state_snapshot_json = NULL, respondent_identity = ?, last_activity_at = ? WHERE id = ?`,
      ).bind(
        a.chatSession.status,
        a.collectedCount,
        a.chatSession.turnCount,
        a.responseId,
        id ? JSON.stringify(id) : null,
        now,
        a.chatSession.sessionId,
      ),
    );
  }

  const results = await o.env.DB.batch(stmts);
  const changed = (results[0]?.meta?.changes ?? 0) > 0;
  if (!changed) return { changed: false, durationMs };

  await o.env.Q_WEBHOOKS.send({
    event: a.status === "completed" ? "response.completed" : "response.abandoned",
    organizationId: o.organizationId,
    formId: o.formId,
    submissionId: a.responseId,
    ...(o.sessionId ? { sessionId: o.sessionId } : {}),
    source: o.source,
    isTest: o.isTest === true,
  });

  o.env.ANALYTICS.writeDataPoint({
    indexes: [o.formId],
    blobs: [o.sessionId ?? a.responseId, a.endingRef ?? a.abandonReason ?? "", a.country ?? ""],
    doubles: [durationMs, a.collectedCount],
  });

  return { changed: true, durationMs };
}
