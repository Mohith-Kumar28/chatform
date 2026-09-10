import type { RespondentIdentity } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import type { RespondentKeySource } from "./respondent-key.js";

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
  /**
   * Which of the two terminal states this is.
   *
   * They are both "finished" to every gate that counts responses, and they are
   * nothing alike to the person who left them. `completed` is a response the
   * form accepted; `disqualified` is one it refused. Telling somebody the form
   * turned away that they "already answered it" is not a rounding error in the
   * wording — it is the wrong fact, and it is the one they will argue with.
   */
  status: "completed" | "disqualified";
  /** The ending they reached, so a refusal can say why it refused. */
  endingRef: string | null;
  /** Their answers, so a return visit has a transcript rather than a blank screen. */
  answers: Record<string, unknown>;
}

export interface ResumableResponse {
  submissionId: string;
  answers: Record<string, unknown>;
  /**
   * Always null here. A device match never carries an identity — that is the
   * point of the `respondent_subject IS NULL` filter below — and the field
   * exists so this is interchangeable with the resume-link path, which does.
   */
  identity?: null;
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
        `SELECT id, completed_at, status, json_extract(meta, '$.endingRef') AS ending_ref
           FROM submissions
          WHERE form_id = ?1 AND respondent_provider = ?2 AND respondent_subject = ?3
            AND status IN ('completed', 'disqualified') AND is_test = 0
            AND (session_id IS NULL OR session_id != ?4)
          ORDER BY completed_at DESC LIMIT 1`,
      )
        .bind(formId, identity.provider, identity.subject, currentSessionId)
        .first<{ id: string; completed_at: number | null; status: string; ending_ref: string | null }>(),

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

    /*
     * The answers come back with it, and they are the respondent's own — this
     * lookup is only ever reached by somebody who has just proved the identity
     * the rows are filed under. A return visit that says "you have already
     * been here" and shows an empty screen is the thing this is for: the
     * answers are the only evidence the respondent has that their work was not
     * thrown away.
     */
    const finished: PriorResponse | null = finishedRow
      ? {
          submissionId: finishedRow.id,
          completedAt: finishedRow.completed_at,
          status: finishedRow.status === "disqualified" ? "disqualified" : "completed",
          endingRef: finishedRow.ending_ref,
          answers: (await loadAnswers(env, finishedRow.id)).answers,
        }
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

/**
 * The unfinished response belonging to this *device*, for a respondent who has
 * not signed in.
 *
 * This is the case `localStorage` cannot cover: the same person, the same
 * machine, but the session id is gone — they cleared their data, or opened the
 * form in a private window, or it is embedded in a frame whose storage the
 * browser partitions per top-level site.
 *
 * Two rules make it safe to hand answers back on a signal the browser computed
 * and could have made up.
 *
 * It must be a *device* key, never the IP fallback. A hashed IP is shared by
 * everyone in an office, so resuming on one would routinely open one person's
 * half-finished response in front of a colleague. The device signal collides
 * far more rarely — rarely enough for a de-duplication hint, which is what this
 * is.
 *
 * And the response must carry no verified identity. Once somebody has signed in
 * their response belongs to them, and `findIdentityHistory` is the only thing
 * that may hand it back. Otherwise a guessed signal would be a way past the
 * sign-in gate to a named person's answers.
 */
export async function findDeviceResumable(
  env: Bindings,
  formId: string,
  key: { value: string; source: RespondentKeySource },
): Promise<ResumableResponse | null> {
  if (key.source !== "device" || !key.value) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT id FROM submissions
        WHERE form_id = ?1 AND fingerprint = ?2
          AND status IN ('in_progress', 'abandoned') AND is_test = 0
          AND respondent_subject IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(formId, key.value)
      .first<{ id: string }>();
    return row ? { ...(await loadAnswers(env, row.id)), identity: null } : null;
  } catch (err) {
    console.error("device_resumable_failed", formId, err);
    return null;
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

/**
 * The open response this person already has on this form, if any.
 *
 * A person can hold many *finished* responses on a form that allows more than
 * one — that is the author's setting and it is none of this function's
 * business. What they cannot coherently have is two responses in progress at
 * once. "Half-finished" is a state of the person's relationship with the form,
 * not of a browser tab, and every extra open row is the same draft written down
 * twice: it splits their answers across rows, shows the author duplicates that
 * represent one person's single attempt, and makes each copy independently
 * eligible for its own reminder email.
 *
 * They were being created routinely. A row is not written until the first
 * answer is projected — or, for a session that only signed in, not until the
 * idle alarm fires half an hour later — so a respondent who opened the form
 * again inside that window found nothing to carry on with, because nothing had
 * been written yet. Every visit therefore opened its own.
 *
 * This is the check at the one place rows are created, so the invariant holds
 * regardless of what any session did or did not manage to recognise.
 *
 * Two ways to be the same person, and the weaker one is fenced exactly as it is
 * in `findDeviceResumable`. A verified identity is definitive. A device key is a
 * guess, so it is only honoured when it came from a real device signal — never
 * the hashed-IP fallback, which a whole office shares and which would have
 * colleagues writing into one another's drafts — and never against a row that
 * carries an identity, which would be a way past the sign-in gate to a named
 * person's answers.
 *
 * Never throws: failing to find a row to reuse must cost a duplicate, not the
 * response itself.
 */
export async function findOpenResponseId(
  env: Bindings,
  formId: string,
  who: {
    identity?: RespondentIdentity | null;
    fingerprint?: string | null;
    /** Only `"device"` is trusted for this; see above. */
    fingerprintSource?: RespondentKeySource | null;
    isTest: boolean;
    /** Excluded, so a session cannot match a row it opened itself. */
    sessionId: string;
  },
): Promise<string | null> {
  const open = `status IN ('in_progress', 'abandoned') AND is_test = ?2
                AND (session_id IS NULL OR session_id != ?3)`;
  try {
    if (who.identity?.provider && who.identity.subject) {
      const row = await env.DB.prepare(
        `SELECT id FROM submissions
          WHERE form_id = ?1 AND ${open}
            AND respondent_provider = ?4 AND respondent_subject = ?5
          ORDER BY updated_at DESC LIMIT 1`,
      )
        .bind(formId, who.isTest ? 1 : 0, who.sessionId, who.identity.provider, who.identity.subject)
        .first<{ id: string }>();
      if (row) return row.id;
    }

    if (who.fingerprintSource === "device" && who.fingerprint) {
      const row = await env.DB.prepare(
        `SELECT id FROM submissions
          WHERE form_id = ?1 AND ${open}
            AND fingerprint = ?4 AND respondent_subject IS NULL
          ORDER BY updated_at DESC LIMIT 1`,
      )
        .bind(formId, who.isTest ? 1 : 0, who.sessionId, who.fingerprint)
        .first<{ id: string }>();
      if (row) return row.id;
    }
    return null;
  } catch (err) {
    console.error("open_response_lookup_failed", formId, err);
    return null;
  }
}
