import type { Bindings } from "../env.js";

/**
 * "Report a bug" — the one thing on a respondent's screen that is addressed to
 * us rather than to the customer whose form they are filling in.
 *
 * See `respondent_feedback` in the schema for why the row is not scoped to an
 * organization. This file owns the two rules that surround writing it: how many
 * a person may send, and who a report is attributed to.
 */

export function newFeedbackId(): string {
  return `fbk_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/**
 * Three a day, per person.
 *
 * Not a rate limit in the `lib/ratelimit` sense — that one protects the worker
 * from a script, and this protects the console from a human. The reader of this
 * table is a person scanning what respondents said; one upset respondent firing
 * off forty notes makes every other report harder to find, and the fortieth
 * note says nothing the third one did not.
 *
 * Deliberately generous enough for the case that matters: somebody hits a bug,
 * reports it, finds a second one, and comes back.
 */
export const FEEDBACK_DAILY_CAP = 3;

/**
 * A rolling twenty-four hours, not a calendar day.
 *
 * A calendar day needs a timezone to be a day in, and the only honest candidate
 * — the respondent's browser clock — is theirs to set. Rolling is the same
 * promise in every timezone and cannot be reset by changing one.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface FeedbackInput {
  /** Null when the visit offered nothing to recognise anybody by. */
  respondentId: string | null;
  sessionId: string;
  formId: string | null;
  organizationId: string | null;
  rating: number;
  message: string | null;
  source: string;
  userAgent: string | null;
}

export type FeedbackResult = { ok: true; id: string } | { ok: false; reason: "capped" };

/**
 * How many this person has already sent inside the window.
 *
 * Keyed on the respondent when there is one, and on the session when there is
 * not. The fallback is weaker — a new session is a new allowance — and it is
 * the right weakness to accept: the respondents it applies to are the ones
 * whose browser hands us nothing to recognise them by, which is exactly the
 * setup most likely to have found the bug they are trying to report. Opening a
 * session is itself rate limited, so the loophole costs more than it is worth.
 */
async function sentSince(env: Bindings, input: FeedbackInput, since: number): Promise<number> {
  const row = input.respondentId
    ? await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM respondent_feedback WHERE respondent_id = ?1 AND created_at >= ?2`,
      )
        .bind(input.respondentId, since)
        .first<{ n: number }>()
    : await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM respondent_feedback WHERE session_id = ?1 AND created_at >= ?2`,
      )
        .bind(input.sessionId, since)
        .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Record one report, unless this person has already had their three. */
export async function recordFeedback(env: Bindings, input: FeedbackInput): Promise<FeedbackResult> {
  const now = Date.now();
  if ((await sentSince(env, input, now - WINDOW_MS)) >= FEEDBACK_DAILY_CAP) {
    return { ok: false, reason: "capped" };
  }

  const id = newFeedbackId();
  await env.DB.prepare(
    `INSERT INTO respondent_feedback
       (id, respondent_id, session_id, form_id, organization_id, rating, message, source, user_agent, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
  )
    .bind(
      id,
      input.respondentId,
      input.sessionId,
      input.formId,
      input.organizationId,
      input.rating,
      input.message,
      input.source,
      input.userAgent,
      now,
    )
    .run();
  return { ok: true, id };
}
