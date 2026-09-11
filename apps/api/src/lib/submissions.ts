import type { Bindings } from "../env.js";
import { resolveRespondent } from "./respondents.js";
import type { AnswerMap, RespondentIdentity } from "@repo/form-schema";
import { enqueueMail } from "./mail.js";
import { cancelFollowUps, creditFollowUpRecovery, scheduleFollowUps } from "./followups.js";

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
  /**
   * The salted device key for this respondent, from `lib/respondent-key.ts`.
   *
   * Denormalised onto the response for the same reason the identity is:
   * sessions get pruned, and the duplicate rule has to keep working against
   * responses long after the session that produced them is gone.
   */
  fingerprint?: string | null;
  /**
   * Who this response belongs to, platform-wide. See `lib/respondents.ts`.
   *
   * Resolved when the session opened, because that is where the raw browser
   * fingerprint is. Null for a headless caller who offered nothing to recognise
   * anybody by, and re-stamped by `attachRespondent` if they sign in later.
   */
  respondentId?: string | null;
  /**
   * The verified respondent, when one is already known at creation.
   *
   * Normally they are: the sign-in gate refuses every turn until an identity
   * exists, and this row is opened lazily by the first accepted answer. Passing
   * it here is what stops an `in_progress` row from being anonymous for its
   * whole life — see `attachRespondent` for the case where sign-in comes later.
   */
  identity?: RespondentIdentity | null;
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
        hidden_fields, meta, started_at, updated_at, expires_at, api_key_id, fingerprint,
        respondent_id, respondent_provider, respondent_subject, respondent_email, respondent_phone,
        respondent_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      a.fingerprint || null,
      a.respondentId ?? null,
      a.identity?.provider ?? null,
      a.identity?.subject ?? null,
      a.identity?.email ?? null,
      a.identity?.phone ?? null,
      a.identity?.name ?? null,
    )
    .run();
  return id;
}

/**
 * Stamp a verified respondent onto a response that already exists.
 *
 * For the case `openResponse` cannot cover: somebody who signs in *after* the
 * row was opened, because the form did not require it and they volunteered, or
 * because `requireAuth` was switched on mid-conversation.
 *
 * Until this existed, `finalizeResponse` was the only writer of these columns,
 * which coupled "who answered" to "they stopped answering": every `in_progress`
 * response read as anonymous in the results table, a resumed one made its
 * respondent sign in again — `loadResumable` reads identity off this row — and
 * a Durable Object that lost its storage before finalising lost the identity
 * for good.
 *
 * `respondent_subject IS NULL` makes it write-once. The identity attached to a
 * conversation cannot change (`attachIdentity` is idempotent on the same
 * grounds), so a second writer here is a retry, not a correction, and letting
 * it through would be a way to overwrite one respondent with another.
 *
 * Never throws: this hangs off a sign-in that has already succeeded, and
 * failing the verification because a denormalised copy could not be written
 * would send the respondent back to a gate they have just cleared.
 */
export async function attachRespondent(
  env: Bindings,
  responseId: string,
  identity: RespondentIdentity,
  /** The platform-wide device key, so signing in links this browser to the person. */
  deviceKey?: string | null,
): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE submissions
          SET respondent_provider = ?2, respondent_subject = ?3,
              respondent_email = ?4, respondent_phone = ?5, respondent_name = ?6
        WHERE id = ?1 AND status = 'in_progress' AND respondent_subject IS NULL`,
    )
      .bind(
        responseId,
        identity.provider,
        identity.subject,
        identity.email ?? null,
        identity.phone ?? null,
        identity.name ?? null,
      )
      .run();

    /*
      Signing in is where the identity graph usually learns something.
      
      Until this moment the person was a browser; now they are a verified
      subject and an address, and either of those may already name somebody —
      the same person on their laptop last week. `resolveRespondent` merges the
      two rows if so, and the stamp moves to whichever id survived.

      Written unconditionally rather than only when it changes: the update is a
      single indexed write, and skipping it would need a read to find out
      whether it was needed.
    */
    const respondentId = await resolveRespondent(env, {
      identity: { provider: identity.provider, subject: identity.subject },
      email: identity.email,
      name: identity.name,
      phone: identity.phone,
      deviceKey: deviceKey ?? null,
    });
    if (respondentId) {
      await env.DB.prepare(`UPDATE submissions SET respondent_id = ?2 WHERE id = ?1`)
        .bind(responseId, respondentId)
        .run();
    }
  } catch (err) {
    console.error("respondent_attach_failed", responseId, err);
  }
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

/**
 * "Has anybody already given this answer?"
 *
 * The one rule that cannot live in `validateAnswer`. Everything else that
 * refuses an answer is a property of the answer itself — a length, a pattern, a
 * range — and is decided from the block and the value alone, which is what
 * makes that function pure, synchronous and shared with the SDK. Uniqueness is
 * a fact about the rest of the database, so it is decided here, by the module
 * that already owns every read and write of `submission_answers`, and both
 * writers call it in the same place: immediately after validation passes and
 * before the answer is accepted.
 *
 * What counts as taken:
 * - The same question on the same form. Not the same value anywhere else — two
 *   forms asking for a team name are two competitions.
 * - Case- and whitespace-insensitively. `validateAnswer` has already trimmed
 *   and canonicalized (emails are lowercased there), and `COLLATE NOCASE`
 *   handles the rest; the index in `0011_unique_answers.sql` carries the same
 *   collation so this is a seek.
 * - Not by an abandoned response. Somebody who typed a name and wandered off
 *   should not hold it forever, and a form whose names are exhausted by
 *   drop-offs is worse than one that very occasionally frees a name early.
 * - Not across the test/live boundary. A `*_test_` key writing "Team Alpha"
 *   must not stop a real respondent from claiming it, and testing the rule with
 *   a test key still has to work — so each side only ever sees its own rows.
 *
 * The race is real and deliberately unguarded: two people can pass this check
 * within the same millisecond and both be written. Closing it needs a unique
 * constraint, and there is nowhere to put one — the flag is per question, and
 * this table holds every answer to every question in the account. The window is
 * the round trip between this SELECT and the INSERT that follows it, against a
 * respondent typing; a rare collision that an author resolves in the results
 * table is a better trade than the schema it would take to make it impossible.
 */
export async function findDuplicateAnswer(
  o: ResponseOwner,
  a: { blockRef: string; value: unknown; excludeResponseId: string | null },
): Promise<boolean> {
  // A preview writes nothing, so it has nothing to collide with — and telling a
  // builder testing their own form that their team name is taken, by a row that
  // does not exist, is the worst possible first impression of the feature.
  if (isPreview(o)) return false;
  const row = await o.env.DB.prepare(
    `SELECT 1
       FROM submission_answers a
       JOIN submissions s ON s.id = a.submission_id
      WHERE a.form_id = ?1
        AND a.block_ref = ?2
        AND a.value_json = ?3 COLLATE NOCASE
        AND a.submission_id <> ?4
        -- A response that was abandoned or refused is not one you keep, so it
        -- must not keep a team name, username or seat number reserved either.
        -- Somebody screened out at the last question would otherwise hold the
        -- name they picked forever, against a registration that never happened.
        AND s.status NOT IN ('abandoned', 'disqualified')
        AND s.is_test = ?5
      LIMIT 1`,
  )
    .bind(
      o.formId,
      a.blockRef,
      // The stored form, not the raw one: `recordAnswerRow` writes
      // `JSON.stringify(value)`, so anything else here compares against a shape
      // that is not in the column.
      JSON.stringify(a.value),
      // No response row yet means nothing of this respondent's is stored, so
      // there is nothing to exclude — but the parameter still has to bind.
      a.excludeResponseId ?? "",
      o.isTest ? 1 : 0,
    )
    .first<{ 1: number }>();
  return row !== null;
}

/** Remove a retracted answer. Later answers are deliberately kept, as the chat `edit` action does. */
export async function deleteAnswerRow(o: ResponseOwner, responseId: string, ref: string): Promise<void> {
  if (isPreview(o)) return;
  await o.env.DB.batch([
    o.env.DB.prepare(`DELETE FROM submission_answers WHERE submission_id = ? AND block_ref = ?`).bind(responseId, ref),
    o.env.DB.prepare(`UPDATE submissions SET updated_at = ? WHERE id = ?`).bind(Date.now(), responseId),
  ]);
}

/**
 * Put a screened-out response back to `in_progress`.
 *
 * The mirror of `finalizeResponse` for the one terminal state a respondent is
 * allowed to walk out of. A screen-out is finalized the instant it is reached
 * — the answers are worth keeping and the author's screen-out count has to be
 * true even if the tab closes a second later — but it is also the state people
 * land in by mis-tapping one answer, so it has to be reversible.
 *
 * Guarded on `status = 'disqualified'` and reported through `changed` for the
 * same reason `finalizeResponse` is: a second caller must not resurrect a
 * response that has since been finished properly, and must not clear a
 * completion's `completed_at`.
 *
 * `active_ms` is deliberately left alone. The sitting that ended in the
 * refusal was time the respondent really spent, and the next `finalizeResponse`
 * adds its own on top — the same accumulation a resumed abandonment gets.
 *
 * No webhook. `response.disqualified` has already been delivered and cannot be
 * recalled; whatever this response becomes will announce itself when it gets
 * there. A consumer that saw the refusal and then sees a completion for the
 * same `submissionId` is reading a true sequence of events.
 */
export async function reopenResponse(
  o: ResponseOwner,
  responseId: string,
): Promise<{ changed: boolean }> {
  if (isPreview(o)) return { changed: false };
  const res = await o.env.DB.prepare(
    `UPDATE submissions
        SET status = 'in_progress', completed_at = NULL, updated_at = ?1,
            meta = json_set(coalesce(meta,'{}'), '$.endingRef', NULL, '$.abandonReason', NULL)
      WHERE id = ?2 AND status = 'disqualified'`,
  )
    .bind(Date.now(), responseId)
    .run();
  return { changed: (res.meta?.changes ?? 0) > 0 };
}

/**
 * Put an abandoned response back to `in_progress`, because somebody is writing
 * to it again.
 *
 * Adoption and reopening have to happen together, and for a long time only one
 * of the three adoption paths did both. The resume *link* reopened the row
 * (`routes/public.ts`); signing in did not, and neither did the device match
 * inside `ensureSubmissionRow`. So a respondent who came back after their last
 * sitting timed out carried on answering into a row that every writer below
 * refuses to touch: `finalizeResponse` guards on `status = 'in_progress'`, so
 * their completion was a no-op — no ending, no `completed_at`, no transcript,
 * no webhook, no submission email — and the response sat in the Partial tab
 * with a full set of answers in it. `reopenResponse` then had no `disqualified`
 * row to take back, which is how "I answered that by mistake" came to answer
 * "this conversation has expired".
 *
 * `abandonReason` is cleared as well. The row is live again, and a response
 * that reads as in progress *and* abandoned-for-idle-timeout is a row nothing
 * downstream can describe honestly.
 *
 * `changed` is false when there was nothing to reopen — almost always because
 * the row is already `in_progress`, which is the normal case and not a
 * problem. Callers use it for logging, not for control flow.
 */
export async function reopenAbandonedResponse(
  env: Bindings,
  responseId: string,
): Promise<{ changed: boolean }> {
  const res = await env.DB.prepare(
    `UPDATE submissions
        SET status = 'in_progress', completed_at = NULL, updated_at = ?1,
            meta = json_set(coalesce(meta,'{}'), '$.abandonReason', NULL)
      WHERE id = ?2 AND status = 'abandoned'`,
  )
    .bind(Date.now(), responseId)
    .run();
  return { changed: (res.meta?.changes ?? 0) > 0 };
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
  /**
   * `disqualified` is a response that reached a `screen_out` ending — the form
   * refused it. Terminal and kept, like a completion; not a completion, like an
   * abandonment. So it gets a `completed_at` (it ended at a definite moment)
   * but never the completion webhook and never the submission email.
   */
  status: "completed" | "disqualified" | "abandoned";
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
  if (isPreview(o)) return { changed: false, durationMs: now - a.startedAt };

  /**
   * When the respondent actually stopped, read before the UPDATE below
   * overwrites `updated_at` with `now`.
   *
   * Follow-up delays are measured from this rather than from the moment we
   * noticed. A conversation is not declared abandoned until its Durable Object
   * has been idle for thirty minutes, so scheduling from `now` quietly added
   * that half hour to every delay the author configured: a "2 hours" reminder
   * went out two and a half hours after they left, and the settings screen had
   * no way to say so. `updated_at` is bumped by every answer, on both the chat
   * and API paths, which makes it the same clock the author is thinking about.
   *
   * Only read on the abandon path — it is the only one that has a gap between
   * stopping and being noticed — and it falls back to `now`.
   */
  let lastActivityAt = now;
  if (a.status === "abandoned") {
    const prior = await o.env.DB.prepare(`SELECT updated_at FROM submissions WHERE id = ?`)
      .bind(a.responseId)
      .first<{ updated_at: number | null }>()
      .catch(() => null);
    if (prior?.updated_at) lastActivityAt = prior.updated_at;
  }

  /**
   * How long they spent, which on the abandon path is not how long it took us
   * to notice.
   *
   * The same half hour the schedule above had to subtract was going straight
   * into `duration_ms`, because the clock stopped when the idle alarm fired
   * rather than when the respondent did. Every partial abandoned at the first
   * question therefore read "took 30m 1s" — the timeout and the alarm's own
   * latency, reported as effort — and the figure was identical on all of them,
   * which is what gave it away. Worse than cosmetic: `active_ms` accumulates,
   * so a respondent who came back and finished carried each earlier sitting's
   * phantom half hour into the completion-time analytics.
   *
   * `lastActivityAt` is `now` on every other path, so this is unchanged there.
   */
  const durationMs = Math.max(0, lastActivityAt - a.startedAt);

  const id = a.identity ?? null;
  const stmts = [
    o.env.DB.prepare(
      /**
       * `active_ms` accumulates rather than overwrites, and `duration_ms` is
       * read from it.
       *
       * A response can now be resumed days after it was abandoned, and
       * `now - started_at` would report the whole gap as time spent answering —
       * landing a three-day "completion time" in the analytics a customer pays
       * to read. Adding this sitting's elapsed time to what previous sittings
       * banked keeps the number meaning what it always meant.
       *
       * `abandonReason` is cleared on anything that is not an abandonment,
       * because `json_set` only ever writes and a recovered response would
       * otherwise read as completed *and* abandoned-for-idle-timeout.
       *
       * An abandonment may be finished on top of, which is the whole of the
       * asymmetry in the guard below.
       *
       * `in_progress` alone was the guard, and it silently ate completions. A
       * respondent whose last sitting timed out comes back to a row marked
       * `abandoned`, carries on answering into it — every adoption path now
       * reopens it, but a lost race, an alarm firing a second late, or an
       * orphaned duplicate session can put it back — and the finalize that
       * should have recorded their submission matched nothing. No ending, no
       * `completed_at`, no transcript, no webhook, no submission email: the
       * response stayed a partial with a full set of answers in it, and the
       * respondent was told it had gone through.
       *
       * Nothing is delivered twice by allowing it. `abandoned` fires
       * `response.abandoned`, never a completion, and a row that has already
       * reached `completed` or `disqualified` still matches neither branch —
       * so the second writer is still the no-op this guard exists to make it.
       */
      `UPDATE submissions
          SET status = ?1, completed_at = ?2, updated_at = ?3,
              active_ms = active_ms + ?4,
              duration_ms = active_ms + ?4,
              search_text = ?5,
              meta = json_set(coalesce(meta,'{}'), '$.endingRef', ?6, '$.abandonReason', ?7,
                              '$.variables', json(?8)),
              respondent_provider = ?9, respondent_subject = ?10,
              respondent_email = ?11, respondent_phone = ?12, respondent_name = ?13
        WHERE id = ?14
          AND (status = 'in_progress'
               OR (status = 'abandoned' AND ?1 IN ('completed', 'disqualified')))`,
    ).bind(
      a.status,
      a.status === "abandoned" ? null : now,
      now,
      durationMs,
      buildSearchText(a.answers),
      a.endingRef,
      a.status === "abandoned" ? (a.abandonReason ?? null) : null,
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
  if (!changed) {
    /*
     * Loud on purpose, and only for the two statuses that mean somebody
     * finished something.
     *
     * A lost abandonment is ordinary — the idle alarm reaching a row that has
     * since been completed is exactly what the guard is for. A lost completion
     * is a response that a respondent believes they sent and that this system
     * has no record of, and it went unremarked for as long as it existed. The
     * rate this fires at is the honesty of the responses table.
     */
    if (a.status !== "abandoned") {
      console.error("finalize_lost", {
        responseId: a.responseId,
        sessionId: a.chatSession?.sessionId ?? o.sessionId,
        status: a.status,
        endingRef: a.endingRef,
      });
    }
    return { changed: false, durationMs };
  }

  await o.env.Q_WEBHOOKS.send({
    /**
     * A screen-out gets its own event rather than borrowing either neighbour.
     * `response.completed` on a refused respondent is the damaging one — it is
     * the event wired to "add them to the CRM", "send the welcome sequence",
     * "create the ticket" — and `response.abandoned` would file them with the
     * people who closed the tab, which is a different thing to know.
     */
    event:
      a.status === "completed"
        ? "response.completed"
        : a.status === "disqualified"
          ? "response.disqualified"
          : "response.abandoned",
    organizationId: o.organizationId,
    formId: o.formId,
    submissionId: a.responseId,
    ...(o.sessionId ? { sessionId: o.sessionId } : {}),
    source: o.source,
    isTest: o.isTest === true,
  });

  /**
   * The owner's notification and the respondent's auto-reply.
   *
   * Here rather than in the Durable Object because this is the one place both
   * surfaces meet — a chat completion and an API `complete` must email the same
   * people — and because the `changed` guard above already makes it exactly
   * once. Only completions: an abandoned response is not something to mail
   * anybody about.
   *
   * The job carries identifiers and nothing else; the consumer reads the
   * answers and the published settings itself. See `lib/mail-jobs.ts`.
   *
   * Only completions — an abandoned response is not something to mail the
   * *owner* about. It is now something we may mail the *respondent* about, and
   * that is the branch below.
   */
  if (a.status === "completed") {
    await enqueueMail(o.env, {
      kind: "submission",
      organizationId: o.organizationId,
      formId: o.formId,
      responseId: a.responseId,
      isTest: o.isTest === true,
    });
  }

  /**
   * Follow-ups: schedule on abandonment, stop on anything terminal.
   *
   * Here for the same reason the mail above is here — this is where the chat
   * path and the API path meet, and the `changed` guard has already made it
   * exactly once. Both calls swallow their own errors: a response that was
   * correctly recorded must not fail because we could not arrange to nag
   * someone about it later.
   *
   * A screen-out is deliberately not followed up. The form refused that
   * respondent; inviting them back to finish would be the rudest possible
   * misreading of what just happened.
   */
  if (a.status === "abandoned") {
    await scheduleFollowUps({
      env: o.env,
      submissionId: a.responseId,
      formId: o.formId,
      organizationId: o.organizationId,
      abandonedAt: lastActivityAt,
      ...(o.isTest === true ? { isTest: true } : {}),
    });
  } else {
    await cancelFollowUps(o.env, a.responseId, a.status === "completed" ? "completed" : "disqualified");
    /**
     * A response that a nudge brought back, finished.
     *
     * Only on `completed`: a screen-out is not a recovery, and neither is a
     * response that came back through the link and was abandoned a second time.
     * `creditFollowUpRecovery` credits nothing unless a link was actually
     * clicked, so this is a no-op for the overwhelming majority of completions.
     */
    if (a.status === "completed") await creditFollowUpRecovery(o.env, a.responseId);
  }

  o.env.ANALYTICS.writeDataPoint({
    indexes: [o.formId],
    blobs: [o.sessionId ?? a.responseId, a.endingRef ?? a.abandonReason ?? "", a.country ?? ""],
    doubles: [durationMs, a.collectedCount],
  });

  return { changed: true, durationMs };
}
