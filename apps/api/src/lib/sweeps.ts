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

/**
 * Send the follow-ups that have come due.
 *
 * Every precondition is re-checked here rather than trusted from scheduling
 * time, because hours or days have passed and any of them may have changed: the
 * respondent may have finished, the form may have closed, the plan may have
 * lapsed, the address may have unsubscribed, the month's quota may be spent.
 * Scheduling decided this nudge was a good idea once; this decides whether it
 * still is.
 *
 * The actual send is enqueued rather than performed inline, so the cron stays
 * fast and each message inherits the queue's retries and dead-letter handling.
 */
export async function sweepFollowUps(env: Bindings, limit = 100): Promise<number> {
  const now = Date.now();
  const due = await env.DB.prepare(
    `SELECT f.id, f.submission_id, f.organization_id, f.address, f.step,
            s.status AS sub_status
       FROM followups f
       JOIN submissions s ON s.id = f.submission_id
      WHERE f.status = 'scheduled' AND f.scheduled_at < ?
      LIMIT ?`,
  )
    .bind(now, limit)
    .all<{
      id: string;
      submission_id: string;
      organization_id: string;
      address: string;
      step: number;
      sub_status: string;
    }>();

  const rows = due.results ?? [];
  if (rows.length === 0) return 0;

  const { isSuppressed } = await import("./followups.js");
  const { getEntitlements, checkQuota } = await import("./entitlements.js");
  const { can } = await import("@repo/entitlements");

  let sent = 0;
  for (const row of rows) {
    const skip = async (reason: string) => {
      await env.DB.prepare(`UPDATE followups SET status = 'skipped', reason = ?2 WHERE id = ?1`)
        .bind(row.id, reason)
        .run();
    };

    /**
     * The race this exists for: the respondent finished, or was screened out,
     * in the window between scheduling and now. `cancelFollowUps` already runs
     * on that path, but a cancel that lost a race is not a reason to mail
     * somebody who has already completed the form.
     */
    if (row.sub_status !== "abandoned" && row.sub_status !== "in_progress") {
      await skip("response_settled");
      continue;
    }

    if (await isSuppressed(env, row.organization_id, row.address)) {
      await skip("suppressed");
      continue;
    }

    const ent = await getEntitlements(env, row.organization_id);
    if (!can(ent, "followup_email")) {
      await skip("not_entitled");
      continue;
    }

    const quota = await checkQuota(env, row.organization_id, "emails_sent", ent);
    if (!quota.ok) {
      await skip("email_quota");
      continue;
    }

    /**
     * The shared-domain cap. It only applies while the customer is sending
     * from our domain — once they have verified their own, their volume is
     * their own reputation to spend.
     */
    if (!(await hasVerifiedSendingDomain(env, row.organization_id))) {
      const shared = await checkQuota(env, row.organization_id, "followups_shared_domain", ent);
      if (!shared.ok) {
        await skip("shared_domain_cap");
        continue;
      }
    }

    await env.Q_EMAIL.send({ kind: "followup", followupId: row.id });
    /**
     * `queued`, not `sent` — the message has been handed to a queue, which is
     * not the same as having reached anybody.
     *
     * Marketing mail takes the Resend path or no path at all (see `MailClass`),
     * and it sends from a different subdomain than transactional mail does. An
     * unverified sending domain therefore fails every follow-up while leaving
     * password resets working, five retries deep into the dead-letter queue —
     * and the row used to say `sent` throughout. The results table is about to
     * show this state to authors, so it has to be true: `runFollowUpJob` moves
     * it to `sent` once the send actually returns, and the queue consumer moves
     * it to `failed` when the retries are exhausted.
     *
     * Safe against a double send: the query above selects `status = 'scheduled'`
     * only, so a `queued` row is never picked up again.
     */
    await env.DB.prepare(`UPDATE followups SET status = 'queued', reason = NULL WHERE id = ?1`)
      .bind(row.id)
      .run();
    sent++;
  }
  return sent;
}

/**
 * Has this organization verified a sending domain of its own?
 *
 * A stub with a real signature, because `custom_domain` is priced but not yet
 * built. Everything downstream is written against the answer rather than the
 * mechanism, so the day domain verification ships this becomes a lookup and
 * nothing else moves. Answering `false` for everyone today is also the safe
 * answer: it keeps every tenant under the shared-domain cap.
 */
async function hasVerifiedSendingDomain(_env: Bindings, _orgId: string): Promise<boolean> {
  return false;
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
