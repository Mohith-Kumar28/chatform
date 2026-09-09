import type { RespondentIdentity } from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * What a verified respondent has already done to this form.
 *
 * Everything that recognises a returning respondent used to key on something
 * about their *device* — `chatform:session:<slug>` in localStorage to resume,
 * `chatform:submitted:<slug>` to say "you already answered", a hashed IP to
 * enforce `allowResubmissions`. All three are the same guess wearing different
 * hats, and all three miss the same way: a new browser, a cleared cache, a
 * phone instead of a laptop, or an embed whose third-party storage the browser
 * partitions away.
 *
 * When a form requires sign-in none of that guessing is necessary. The
 * respondent has proved who they are against Google or a phone number, the
 * proof is denormalised onto every response they leave, and
 * `idx_submissions_form_respondent` exists to look it up. This module is that
 * lookup, and it is deliberately the only thing here: what to *do* with a prior
 * response is a policy decision that belongs with the settings, in the route.
 *
 * Scoped to one form. A person who answered one of a customer's forms has said
 * nothing about any other, and joining across them would leak the fact of one
 * response into a form that has no business knowing it.
 */

export interface PriorResponse {
  submissionId: string;
  completedAt: number | null;
}

export interface ResumableResponse {
  submissionId: string;
  answers: Record<string, unknown>;
}

export interface IdentityHistory {
  /**
   * A response they finished, or were screened out of.
   *
   * `disqualified` sits beside `completed` for the same reason it does in the
   * `allowResubmissions` gate: a screen-out that could be undone by signing in
   * again and answering differently is not a screen-out.
   */
  finished: PriorResponse | null;
  /** A response still open — theirs to carry on with rather than start again. */
  resumable: ResumableResponse | null;
}

/**
 * Find what this person has already left on this form.
 *
 * Both halves exclude the session asking the question: it is the caller's own
 * brand-new session, and matching it would have a respondent resuming
 * themselves or being told they had already answered by the very response they
 * are currently writing.
 *
 * Test-mode rows are excluded throughout. They are real rows kept out of every
 * count, and a rehearsal must not lock a real respondent out of a real form or
 * hand them somebody's practice answers.
 *
 * Never throws. Every caller is on the sign-in path, and a lookup that failed
 * must degrade to "we know nothing about you" — which is the behaviour that
 * existed before this module — rather than to a respondent who cannot sign in.
 */
export async function findIdentityHistory(
  env: Bindings,
  formId: string,
  identity: RespondentIdentity,
  currentSessionId: string,
): Promise<IdentityHistory> {
  try {
    const [finishedRow, openRow] = await Promise.all([
      env.DB.prepare(
        `SELECT id, completed_at FROM submissions
          WHERE form_id = ?1 AND respondent_provider = ?2 AND respondent_subject = ?3
            AND status IN ('completed', 'disqualified') AND is_test = 0
            AND (session_id IS NULL OR session_id != ?4)
          ORDER BY completed_at DESC LIMIT 1`,
      )
        .bind(formId, identity.provider, identity.subject, currentSessionId)
        .first<{ id: string; completed_at: number | null }>(),

      /*
       * Most recently touched, not most recently started. Somebody who opened
       * the form twice and carried on in the second sitting should be given
       * back the one they were actually working in.
       */
      env.DB.prepare(
        `SELECT id FROM submissions
          WHERE form_id = ?1 AND respondent_provider = ?2 AND respondent_subject = ?3
            AND status IN ('in_progress', 'abandoned') AND is_test = 0
            AND (session_id IS NULL OR session_id != ?4)
          ORDER BY updated_at DESC LIMIT 1`,
      )
        .bind(formId, identity.provider, identity.subject, currentSessionId)
        .first<{ id: string }>(),
    ]);

    const finished: PriorResponse | null = finishedRow
      ? { submissionId: finishedRow.id, completedAt: finishedRow.completed_at }
      : null;

    /*
     * A finished response outranks an open one.
     *
     * Both can exist — they answered, then opened the form again and wandered
     * off. Handing back the abandoned scrap would be a strange thing to do to
     * somebody whose real answer is already recorded, and it is the finished
     * one that every setting here is about.
     */
    if (finished || !openRow) return { finished, resumable: null };

    return { finished: null, resumable: await loadAnswers(env, openRow.id) };
  } catch (err) {
    console.error("identity_history_failed", formId, err);
    return { finished: null, resumable: null };
  }
}

async function loadAnswers(env: Bindings, submissionId: string): Promise<ResumableResponse> {
  const rows = await env.DB.prepare(
    `SELECT block_ref, value_json FROM submission_answers WHERE submission_id = ?`,
  )
    .bind(submissionId)
    .all<{ block_ref: string; value_json: string }>();

  const answers: Record<string, unknown> = {};
  for (const r of rows.results ?? []) {
    try {
      answers[r.block_ref] = JSON.parse(r.value_json);
    } catch {
      // One unreadable answer must not cost them the rest.
    }
  }
  return { submissionId, answers };
}
