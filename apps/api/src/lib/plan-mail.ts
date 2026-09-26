import { PLANS, type PlanId } from "@repo/entitlements";
import type { Bindings } from "../env.js";
import { getEntitlements } from "./entitlements.js";
import { enqueueMail } from "./mail.js";

/**
 * Tell the owner when their organization moves up a plan.
 *
 * Decided by comparing the effective plan before and after a write, never by
 * event type: Dodo fires `subscription.renewed` for plain renewals and for the
 * proration invoice twenty seconds after an upgrade, and `plan_changed` /
 * `updated` for downgrades, pauses and seat edits. Only a strictly higher
 * `sortOrder` is an upgrade, so a renewal (same plan) and a downgrade (lower)
 * never mail, and a replayed event finds the plan already applied and does not
 * mail twice.
 *
 * Call `planBefore` before the write and `notifyIfUpgraded` after it, once the
 * entitlements cache has been invalidated. Neither throws: a plan change must
 * never fail because the mail about it could not be queued.
 */
export async function planBefore(env: Bindings, orgId: string): Promise<PlanId | null> {
  try {
    return (await getEntitlements(env, orgId)).planId;
  } catch (err) {
    console.error("plan_mail_before_failed", { orgId, err: String(err) });
    return null;
  }
}

export async function notifyIfUpgraded(
  env: Bindings,
  orgId: string,
  before: PlanId | null,
  opts: { gifted: boolean; endsAt?: number | null },
): Promise<boolean> {
  if (!before) return false;
  try {
    const after = await getEntitlements(env, orgId);
    if (PLANS[after.planId].sortOrder <= PLANS[before].sortOrder) return false;
    await enqueueMail(env, {
      kind: "plan_upgraded",
      organizationId: orgId,
      planId: after.planId,
      previousPlanId: before,
      cycle: after.cycle,
      endsAt: opts.gifted ? (opts.endsAt ?? null) : null,
      gifted: opts.gifted,
    });
    return true;
  } catch (err) {
    console.error("plan_mail_after_failed", { orgId, err: String(err) });
    return false;
  }
}
