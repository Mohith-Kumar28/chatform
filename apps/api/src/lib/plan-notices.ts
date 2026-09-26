import { FEATURES, GRACE_MS, isPlanId, type PlanId } from "@repo/entitlements";
import { readFormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { entitlementsOnFree, getEntitlements, invalidateEntitlements, loadSubscription } from "./entitlements.js";
import { paidFeaturesLost } from "./doc-entitlements.js";
import { enqueueMail, type MailJob } from "./mail.js";
import type { LapsedForm } from "./mail-templates.js";
import { webOrigins } from "./origins.js";

/**
 * Telling an owner their paid plan is ending, before it does and once it has.
 *
 * Nothing downgrades an organization: `effectivePlan` reads the dates on every request, so
 * a plan ends by the clock passing a column. That made the end silent. This sweep watches
 * the same columns from the five-minute cron and mails the owner at three points:
 *
 *   payment_failed  the first time a renewal is declined, with the date grace runs out
 *   ending          seven days before a cancelled or gifted plan ends, two before grace does
 *   ended           once the organization is actually on Free
 *
 * A gift is not a special case. A timed comp is written exactly like a cancelled
 * subscription (`canceled` with a future period end; see `routes/admin/ops.ts`), so it
 * lapses, and is announced, the same way; only the wording names it a gift.
 *
 * Each notice is sent once per subscription, stage and end date, recorded in
 * `plan_notices` before it is queued. The end date is part of the key so a customer who
 * resubscribes, or is gifted again, and lapses again is told again.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far ahead a cancelled or gifted plan's end is announced. */
export const ENDING_LEAD_MS = 7 * DAY_MS;
/** How far ahead the end of a failed payment's grace window is announced. */
export const GRACE_LEAD_MS = 2 * DAY_MS;
/**
 * How long after an end the "now on Free" notice may still go out. Keeps the first run
 * after deploy from mailing about plans that ended months ago.
 */
export const ENDED_WINDOW_MS = 14 * DAY_MS;
/** Forms named in one email; the rest are counted. */
const FORMS_SHOWN = 10;

type Stage = "payment_failed" | "ending" | "ended";
type Reason = "payment" | "cancelled" | "gift";

interface Candidate {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  current_period_end: number | null;
  grace_until: number | null;
  dodo_subscription_id: string;
}

/** Why a subscription is ending and when it stops applying, or null if it is not ending. */
export function lapseOf(row: Candidate): { reason: Reason; endsAt: number; periodEnd: number | null } | null {
  const periodEnd = row.current_period_end;
  if (row.status === "on_hold" || row.status === "past_due") {
    const endsAt = row.grace_until ?? (periodEnd != null ? periodEnd + GRACE_MS : null);
    return endsAt == null ? null : { reason: "payment", endsAt, periodEnd };
  }
  if (periodEnd == null) return null;
  const reason: Reason = row.dodo_subscription_id.startsWith("internal_manual_") ? "gift" : "cancelled";
  return { reason, endsAt: periodEnd, periodEnd };
}

/** Record a notice. True only the first time, which is the caller's licence to send it. */
async function claim(env: Bindings, row: Candidate, stage: Stage, dueAt: number, now: number): Promise<boolean> {
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO plan_notices (subscription_id, kind, due_at, organization_id, sent_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(row.id, stage, dueAt, row.organization_id, now)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function sweepPlanNotices(env: Bindings, now = Date.now(), limit = 200): Promise<number> {
  const since = now - ENDED_WINDOW_MS;
  const res = await env.DB.prepare(
    `SELECT id, organization_id, plan_id, status, current_period_end, grace_until, dodo_subscription_id
       FROM subscriptions
      WHERE plan_id != 'free'
        AND ((status IN ('on_hold', 'past_due') AND COALESCE(grace_until, current_period_end + ?) > ?)
             OR (status IN ('canceled', 'expired') AND current_period_end > ?)
             OR (status IN ('active', 'trialing') AND cancel_at_period_end = 1 AND current_period_end > ?))
      LIMIT ?`,
  )
    .bind(GRACE_MS, since, since, now, limit)
    .all<Candidate>();

  let sent = 0;
  for (const row of res.results ?? []) {
    if (!isPlanId(row.plan_id)) continue;
    const lapse = lapseOf(row);
    if (!lapse) continue;

    // Only the subscription that decides the plan. A lapsing gift on an account that also
    // pays is not ending anything.
    const governing = await loadSubscription(env, row.organization_id);
    if (governing?.id !== row.id) continue;

    const job = (stage: Stage): MailJob => ({
      kind: "plan_lapse",
      organizationId: row.organization_id,
      stage,
      reason: lapse.reason,
      planId: row.plan_id as PlanId,
      endsAt: lapse.endsAt,
    });

    if (now < lapse.endsAt) {
      if (lapse.reason === "payment" && (await claim(env, row, "payment_failed", lapse.endsAt, now))) {
        await enqueueMail(env, job("payment_failed"));
        sent++;
        continue;
      }
      const lead = lapse.reason === "payment" ? GRACE_LEAD_MS : ENDING_LEAD_MS;
      if (lapse.endsAt - now <= lead && (await claim(env, row, "ending", lapse.endsAt, now))) {
        await enqueueMail(env, job("ending"));
        sent++;
      }
      continue;
    }

    if (now - lapse.endsAt > ENDED_WINDOW_MS) continue;
    // Read fresh, not from the five-minute cache, and only announce what is true.
    await invalidateEntitlements(env, row.organization_id);
    if ((await getEntitlements(env, row.organization_id)).planId !== "free") continue;
    // Keyed on the period end rather than the grace end, so a failed payment that Dodo
    // later marks cancelled (which moves the end back to the period) is not announced twice.
    if (await claim(env, row, "ended", lapse.periodEnd ?? lapse.endsAt, now)) {
      await enqueueMail(env, job("ended"));
      sent++;
    }
  }
  return sent;
}

/**
 * The live forms a lapse touches, and what each one loses, for the email.
 *
 * Read when the mail is rendered rather than when it is queued, so a form unpublished
 * in between is not listed.
 */
export async function lapsedForms(
  env: Bindings,
  orgId: string,
  now = Date.now(),
): Promise<{ forms: LapsedForm[]; more: number }> {
  const ent = await entitlementsOnFree(env, orgId, now);
  const res = await env.DB.prepare(
    `SELECT f.id, f.title, fv.schema_json
       FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
      WHERE f.organization_id = ? AND f.status = 'published' AND f.deleted_at IS NULL
      ORDER BY f.updated_at DESC`,
  )
    .bind(orgId)
    .all<{ id: string; title: string; schema_json: string }>();

  const origin = webOrigins(env)[0]!;
  const forms: LapsedForm[] = [];
  for (const row of res.results ?? []) {
    let lost;
    try {
      lost = paidFeaturesLost(readFormDoc(JSON.parse(row.schema_json)), ent);
    } catch {
      continue;
    }
    if (lost.length === 0) continue;
    forms.push({
      title: row.title,
      url: `${origin}/forms/${row.id}`,
      closes: lost.includes("collect_payments"),
      losing: lost.filter((k) => k !== "collect_payments").map((k) => FEATURES[k].label),
    });
  }
  return { forms: forms.slice(0, FORMS_SHOWN), more: Math.max(0, forms.length - FORMS_SHOWN) };
}
