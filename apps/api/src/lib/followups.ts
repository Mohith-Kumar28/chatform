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
  if (!form) return 0;

  let doc: FormDoc;
  try {
    doc = readFormDoc(JSON.parse(form.schema_json));
  } catch (err) {
    console.error("followup_doc_unreadable", formId, err);
    return 0;
  }

  const cfg = doc.settings.followUp;
  if (!cfg?.enabled || cfg.steps.length === 0) return 0;

  /**
   * The entitlement is checked here as well as at publish.
   * `stripForPublish` already forces `enabled` false for an org without the
   * feature, but a plan can lapse after a document was published, and the
   * published document does not change when it does.
   */
  const ent = await getEntitlements(env, organizationId);
  if (!can(ent, "followup_email")) return 0;

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
  if (!sub) return 0;
  if (sub.opted_out) return 0;

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
  // Nothing answered means nothing to come back to, and no basis for saying
  // negotiations took place. `finalizeResponse` already declines to write a row
  // at all in that case, but an API response can reach here with an identity
  // and no answers.
  if (byRef.size === 0) return 0;

  const hidden = parseHidden(sub.hidden_fields);
  const resolved = resolveRespondentAddress(doc, {
    respondentEmail: sub.respondent_email,
    byRef,
    hiddenFields: hidden,
    ...(cfg.addressField ? { addressField: cfg.addressField } : {}),
  });
  if (!resolved) return 0;

  if (await isSuppressed(env, organizationId, resolved.address)) return 0;

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
  if (rows.length === 0) return 0;

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
