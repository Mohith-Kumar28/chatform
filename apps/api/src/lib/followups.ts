import { readFormDoc, type FormDoc } from "@repo/form-schema";
import { can } from "@repo/entitlements";
import type { Bindings } from "../env.js";
import { getEntitlements } from "./entitlements.js";
import { resolveRespondentAddress, type AddressSource } from "./respondent-address.js";

/**
 * Scheduling and cancelling the nudges sent to someone who walked away.
 *
 * The sending half lives in `sweeps.ts` (which decides *when*) and
 * `mail-jobs.ts` (which decides *what*). This file only decides *whether*, and
 * it is deliberately the pessimistic half: every early return here is a message
 * we chose not to send to somebody who never asked to hear from us.
 */

export function newFollowUpId(): string {
  return `flw_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** Where a resume link stays valid. Long, because a nudge is read whenever the inbox is. */
export const RESUME_TTL_DAYS = 30;
/** Unsubscribe outlives every sequence, because an opt-out that expires is not an opt-out. */
export const UNSUB_TTL_DAYS = 365;

export interface ScheduleInput {
  env: Bindings;
  submissionId: string;
  formId: string;
  organizationId: string;
  /**
   * When the respondent last answered, not when we noticed they had gone.
   *
   * The two are half an hour apart on the chat path — that is the Durable
   * Object's idle alarm — and every delay in the sequence is measured from
   * here, so using the later of the two silently lengthened each one.
   */
  abandonedAt: number;
  isTest?: boolean;
}

interface FormRow {
  schema_json: string;
  close_at: number | null;
}

interface SubRow {
  respondent_email: string | null;
  hidden_fields: string | null;
  opted_out: number;
}

/**
 * Is this address on a suppression list that covers this organization?
 *
 * Two rows can suppress: one scoped to the org, and one global. The global rows
 * are bounces and complaints, which are facts about the address rather than
 * preferences about a customer, so they apply everywhere.
 */
export async function isSuppressed(env: Bindings, orgId: string, address: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS hit FROM email_suppressions
      WHERE address = ?1 AND (organization_id IS NULL OR organization_id = ?2)
      LIMIT 1`,
  )
    .bind(address.toLowerCase(), orgId)
    .first<{ hit: number }>();
  return !!row;
}

/** Record an opt-out. Idempotent: opting out twice is not an error. */
export async function suppress(
  env: Bindings,
  orgId: string | null,
  address: string,
  reason: "unsubscribe" | "bounce" | "complaint" | "manual" | "at_capture",
): Promise<void> {
  const addr = address.toLowerCase();
  if (orgId === null) {
    /**
     * SQLite treats NULLs as distinct in a UNIQUE index, so `ON CONFLICT` does
     * not deduplicate global rows — hence the explicit check. Cheap, and this
     * path only runs on a bounce or a complaint.
     */
    const existing = await env.DB.prepare(
      `SELECT 1 AS hit FROM email_suppressions WHERE organization_id IS NULL AND address = ? LIMIT 1`,
    )
      .bind(addr)
      .first<{ hit: number }>();
    if (existing) return;
    await env.DB.prepare(
      `INSERT INTO email_suppressions (organization_id, address, reason, created_at) VALUES (NULL, ?, ?, ?)`,
    )
      .bind(addr, reason, Date.now())
      .run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO email_suppressions (organization_id, address, reason, created_at)
     VALUES (?1, ?2, ?3, ?4) ON CONFLICT (organization_id, address) DO NOTHING`,
  )
    .bind(orgId, addr, reason, Date.now())
    .run();
}

/**
 * Decide the follow-up schedule for a response that was just abandoned, and
 * write it down.
 *
 * Never throws. This runs inside `finalizeResponse`, and a response that was
 * correctly recorded must not fail because we could not arrange to nag someone
 * about it later. A dropped schedule is a smaller problem than a 500 on the
 * path that produced it — the same trade `enqueueMail` makes.
 */
export async function scheduleFollowUps(input: ScheduleInput): Promise<number> {
  try {
    return await scheduleInner(input);
  } catch (err) {
    console.error("followup_schedule_failed", input.submissionId, err);
    return 0;
  }
}

/**
 * Why this response is not getting a reminder, written where somebody can read it.
 *
 * Every check below is a reason not to mail a stranger, and each one used to be
 * a bare `return 0`. That was fine while the only question was "should we send
 * this", and useless the moment the question became "why did nothing arrive" —
 * which is the question an author actually asks, with no log access and no row
 * in `followups` to look at, because the whole point is that none was written.
 *
 * On `submissions.meta` rather than a column: it is already JSON, already
 * written with `json_set` by `finalizeResponse`, and this needs no index and no
 * migration. Cleared on the success path so a response that was rescheduled
 * after the author fixed the cause does not still carry the old excuse.
 */
type SkipReason =
  | "unpublished"
  | "unreadable"
  | "disabled"
  | "not_entitled"
  | "no_postal_address"
  | "opted_out"
  | "no_answers"
  | "no_address"
  | "suppressed"
  | "closed";

async function noteSkip(
  env: Bindings,
  submissionId: string,
  reason: SkipReason | null,
): Promise<number> {
  try {
    await env.DB.prepare(
      `UPDATE submissions SET meta = json_set(coalesce(meta,'{}'), '$.followUpSkip', ?2) WHERE id = ?1`,
    )
      .bind(submissionId, reason)
      .run();
  } catch (err) {
    console.error("followup_skip_note_failed", submissionId, err);
  }
  return 0;
}

async function scheduleInner(input: ScheduleInput): Promise<number> {
  const { env, submissionId, formId, organizationId, abandonedAt } = input;

  // Test-mode responses are real rows excluded from every count, and mailing a
  // real person about one would be the exception that proves it wrong.
  if (input.isTest) return 0;

  const form = await env.DB.prepare(
    `SELECT fv.schema_json, f.close_at
       FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
      WHERE f.id = ?1 AND f.organization_id = ?2`,
  )
    .bind(formId, organizationId)
    .first<FormRow>();
  // No published version means nobody could have answered it through the
  // hosted form; nothing to schedule.
  if (!form) return noteSkip(env, submissionId, "unpublished");

  let doc: FormDoc;
  try {
    doc = readFormDoc(JSON.parse(form.schema_json));
  } catch (err) {
    console.error("followup_doc_unreadable", formId, err);
    return noteSkip(env, submissionId, "unreadable");
  }

  const cfg = doc.settings.followUp;
  if (!cfg?.enabled || cfg.steps.length === 0) return noteSkip(env, submissionId, "disabled");

  /**
   * The entitlement is checked here as well as at publish.
   * `stripForPublish` already forces `enabled` false for an org without the
   * feature, but a plan can lapse after a document was published, and the
   * published document does not change when it does.
   */
  const ent = await getEntitlements(env, organizationId);
  if (!can(ent, "followup_email")) return noteSkip(env, submissionId, "not_entitled");

  /**
   * No postal address, no reminders.
   *
   * CAN-SPAM requires the sender's physical address on every commercial
   * message, and this is one. Enforced here rather than only in the builder
   * because the builder can be bypassed — the API publishes documents too — and
   * because the consequence of getting it wrong lands on the customer, not on
   * us. Silent rather than an error: the author is not present at abandonment
   * time, and the settings screen already says the address is required.
   */
  const org = await env.DB.prepare(`SELECT postal_address FROM organizations WHERE id = ?`)
    .bind(organizationId)
    .first<{ postal_address: string | null }>();
  if (!org?.postal_address?.trim()) {
    console.log("followup_skipped_no_postal_address", organizationId);
    return noteSkip(env, submissionId, "no_postal_address");
  }

  /**
   * The opt-out the respondent was offered beside the address question.
   *
   * Joined from the session rather than read off the response because that is
   * where it is recorded — the offer is made while the question is on screen,
   * which can be before the response row exists.
   */
  const sub = await env.DB.prepare(
    `SELECT s.respondent_email, s.hidden_fields,
            COALESCE(cs.followup_opt_out, 0) AS opted_out
       FROM submissions s
       LEFT JOIN chat_sessions cs ON cs.id = s.session_id
      WHERE s.id = ?`,
  )
    .bind(submissionId)
    .first<SubRow>();
  // Nothing to annotate if the row itself has gone.
  if (!sub) return 0;
  if (sub.opted_out) return noteSkip(env, submissionId, "opted_out");

  const answers = await env.DB.prepare(
    `SELECT block_ref, value_json FROM submission_answers WHERE submission_id = ?`,
  )
    .bind(submissionId)
    .all<{ block_ref: string; value_json: string }>();
  const byRef = new Map<string, unknown>();
  for (const a of answers.results ?? []) {
    try {
      byRef.set(a.block_ref, JSON.parse(a.value_json));
    } catch {
      // One unparseable answer must not stop the rest from being read.
    }
  }
  const hidden = parseHidden(sub.hidden_fields);
  const resolved = resolveRespondentAddress(doc, {
    respondentEmail: sub.respondent_email,
    byRef,
    hiddenFields: hidden,
    ...(cfg.addressField ? { addressField: cfg.addressField } : {}),
  });
  if (!resolved) return noteSkip(env, submissionId, "no_address");

  /**
   * Nothing answered — which is only a reason to stay quiet if we do not know
   * who they are.
   *
   * This used to run before the address was resolved, so a respondent who
   * signed in with Google and then left without answering a question was
   * skipped as `no_answers`, even though the sign-in had just handed us a
   * verified address. That is the one abandonment we are best placed to
   * recover: they got through the gate, which is the step people drop at, and
   * then stopped at question one. On a live form it accounted for seven of the
   * twenty responses that never got a reminder.
   *
   * A verified identity only. An address from an answer cannot be here — there
   * are no answers — and one from a hidden field is a parameter on a URL
   * somebody clicked, which is not a person telling us their address. Mailing
   * that on the strength of an opened link is how a nudge becomes spam.
   */
  if (byRef.size === 0 && resolved.source !== "identity") {
    return noteSkip(env, submissionId, "no_answers");
  }

  if (await isSuppressed(env, organizationId, resolved.address)) {
    return noteSkip(env, submissionId, "suppressed");
  }

  /**
   * The holdout.
   *
   * Deterministic in the submission id rather than random, so a retry cannot
   * move a response between arms and the split stays reproducible when someone
   * later asks how the number was computed.
   */
  const held = cfg.holdoutPercent > 0 && bucketOf(submissionId) < cfg.holdoutPercent;

  const closeAt = closingTime(doc, form.close_at);
  const now = Date.now();
  const rows: { step: number; at: number }[] = [];
  cfg.steps.forEach((step, i) => {
    const at = abandonedAt + step.delayHours * 3_600_000;
    // A nudge that lands after the form stops accepting answers is worse than
    // no nudge: it invites somebody to a door we already locked.
    if (closeAt !== null && at >= closeAt) return;
    /**
     * The intended time is stored as-is, even when it is already in the past —
     * which happens whenever a response is abandoned by a sweep that ran long
     * after the respondent actually left. Clamping it forward to `now` would
     * both misreport when the nudge was meant to go and, because the sweep
     * selects on `scheduled_at < now`, hold an already-overdue message back for
     * another tick.
     */
    rows.push({ step: i + 1, at });
  });
  // Every step would land after the form stops accepting answers.
  if (rows.length === 0) return noteSkip(env, submissionId, "closed");

  const stmts = rows.map((r) =>
    env.DB.prepare(
      `INSERT INTO followups
         (id, submission_id, form_id, organization_id, channel, address, address_source,
          step, status, reason, scheduled_at, created_at)
       VALUES (?1, ?2, ?3, ?4, 'email', ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT (submission_id, step) DO NOTHING`,
    ).bind(
      newFollowUpId(),
      submissionId,
      formId,
      organizationId,
      resolved.address.toLowerCase(),
      resolved.source satisfies AddressSource,
      r.step,
      held ? "holdout" : "scheduled",
      held ? "holdout" : null,
      r.at,
      now,
    ),
  );
  await env.DB.batch(stmts);
  // Something was written, so whatever excuse this response was carrying from
  // an earlier attempt no longer applies.
  await noteSkip(env, submissionId, null);
  return held ? 0 : rows.length;
}

/**
 * Stop the rest of a sequence.
 *
 * Called when the respondent finishes, and when they come back through a resume
 * link — continuing to nag somebody who is currently answering the form is the
 * fastest way to earn a spam complaint.
 */
export async function cancelFollowUps(
  env: Bindings,
  submissionId: string,
  reason: string,
): Promise<number> {
  try {
    const res = await env.DB.prepare(
      `UPDATE followups SET status = 'cancelled', reason = ?2
        WHERE submission_id = ?1 AND status = 'scheduled'`,
    )
      .bind(submissionId, reason)
      .run();
    return res.meta?.changes ?? 0;
  } catch (err) {
    console.error("followup_cancel_failed", submissionId, err);
    return 0;
  }
}

/**
 * Somebody opened the resume link in one of our messages.
 *
 * The `fu` parameter that carries the id is public and guessable in principle,
 * so the `submission_id` in the WHERE clause is the check that matters: a
 * follow-up can only be credited by the resume token minted for the very
 * response it was scheduled against, and that token is what proved the caller
 * had the message in the first place.
 *
 * `clicked_at IS NULL` makes this write-once. Somebody who opens the same mail
 * three times over a week is one person coming back, and letting the last visit
 * win would quietly move the click forward in the daily series every time.
 *
 * Never throws: this is bookkeeping hanging off a respondent's first request,
 * and a form that will not open because a stat could not be written is a much
 * worse outcome than a stat that is missing.
 */
export async function recordFollowUpClick(
  env: Bindings,
  followUpId: string,
  submissionId: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE followups SET clicked_at = ?3
        WHERE id = ?1 AND submission_id = ?2 AND clicked_at IS NULL`,
    )
      .bind(followUpId, submissionId, Date.now())
      .run();
  } catch (err) {
    console.error("followup_click_failed", followUpId, err);
  }
}

/**
 * A response that a nudge brought back has been completed. Credit it.
 *
 * Exactly one row is credited — the latest step they actually clicked — because
 * the question this answers is "how many responses did follow-ups recover",
 * and a sequence of three messages to one person recovered one response, not
 * three. Which step gets the credit is the last one they acted on, which is the
 * one that did the work.
 *
 * Silent when nothing was clicked. Somebody who was going to finish anyway,
 * and happened to have a scheduled nudge that never landed, is not a recovery,
 * and counting them as one is precisely the self-flattering measurement the
 * holdout exists to protect against.
 */
export async function creditFollowUpRecovery(
  env: Bindings,
  submissionId: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE followups SET recovered_at = ?2
        WHERE id = (
          SELECT id FROM followups
           WHERE submission_id = ?1 AND clicked_at IS NOT NULL AND recovered_at IS NULL
           ORDER BY clicked_at DESC LIMIT 1
        )
          /*
            And only if this response has not already been credited.
            \`finalizeResponse\` runs this once per completion behind its own
            \`changed\` guard, so a second call should be impossible — but the
            subquery alone would happily credit the *next* unrecovered clicked
            step if one ever arrived here twice, turning one person into two
            recoveries in the number this feature is judged by. Cheap insurance
            on a figure that gets quoted.
          */
          AND NOT EXISTS (
            SELECT 1 FROM followups WHERE submission_id = ?1 AND recovered_at IS NOT NULL
          )`,
    )
      .bind(submissionId, Date.now())
      .run();
  } catch (err) {
    console.error("followup_recovery_credit_failed", submissionId, err);
  }
}

/** Cancel every pending nudge queued for one address, across forms. For unsubscribe. */
export async function cancelFollowUpsForAddress(
  env: Bindings,
  orgId: string,
  address: string,
): Promise<number> {
  const res = await env.DB.prepare(
    `UPDATE followups SET status = 'cancelled', reason = 'unsubscribed'
      WHERE organization_id = ?1 AND address = ?2 AND status = 'scheduled'`,
  )
    .bind(orgId, address.toLowerCase())
    .run();
  return res.meta?.changes ?? 0;
}

function parseHidden(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/**
 * When the form stops accepting answers, document first.
 *
 * `forms.close_at` is a denormalised copy the builder does not always write —
 * the same reason `open-session.ts` and `public.ts` both read the doc first.
 */
function closingTime(doc: FormDoc, closeAtColumn: number | null): number | null {
  const scheduled = doc.settings.closeRules.closeAt;
  const fromDoc = scheduled ? Date.parse(scheduled) : NaN;
  const candidates = [Number.isFinite(fromDoc) ? fromDoc : null, closeAtColumn].filter(
    (v): v is number => v !== null,
  );
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** A stable 0–99 bucket for one submission id. */
function bucketOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}
