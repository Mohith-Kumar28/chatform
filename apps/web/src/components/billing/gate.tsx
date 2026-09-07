"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import {
  FEATURES,
  LIMITS,
  PLANS,
  minPlanFor,
  nextPlanWithMore,
  seatLimit,
  type FeatureKey,
  type LimitKey,
  type PlanId,
} from "@repo/entitlements";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePaywall } from "@/stores/paywall-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The gate primitives.
 *
 * One rule runs through all of them: **show, don't hide.** Every locked control stays
 * visible, in place, switched off, with a chip naming the plan. A feature a user never
 * sees is a feature they will never want, and a control that vanishes on a downgrade
 * reads as a bug rather than a price.
 */

/**
 * Why a control is locked.
 *
 * Two shapes, because the product locks things for two different reasons, and
 * they were only ever expressible as one. A **feature** is absent from the plan
 * — API access, webhooks — and entitlements alone can answer it. A **limit** is
 * present but spent, which entitlements cannot answer on their own: only the
 * caller knows how many seats are taken.
 *
 * Everything downstream of this type is identical for both. Same padlock chip,
 * same inert treatment, same paywall on click. That is the point of naming the
 * reason rather than the treatment: seats used to be the one gate in the
 * product with a look of its own, because there was nowhere to say "locked by a
 * limit" and someone reached for a different component instead.
 */
export type LockReason =
  | { feature: FeatureKey; limit?: never; used?: never }
  | { limit: LimitKey; feature?: never; used?: number | null };

/** The plan that would lift this lock, or `null` when nothing above does. */
function requiredPlanFor(reason: LockReason, from: PlanId): PlanId | null {
  return reason.feature ? minPlanFor(reason.feature) : nextPlanWithMore(reason.limit!, from);
}

/** What the lock is about, in the reader's words. */
function lockLabel(reason: LockReason): string {
  return reason.feature ? FEATURES[reason.feature].label : LIMITS[reason.limit!].label;
}

/**
 * Open the paywall for a lock, from a click rather than a failed request.
 *
 * The gate it builds is deliberately the same shape the *server* sends when it
 * refuses the same thing — `feature_locked` for a feature, `limit_reached` for
 * a limit — so the dialog cannot say one thing when the user presses the
 * padlock and another when they push past it and the API answers.
 */
export function useUpgrade() {
  const open = usePaywall((s) => s.open);
  const { data } = useEntitlements();
  const plan: PlanId = data?.planId ?? "free";

  return (reason: LockReason, context: Record<string, unknown> = {}) => {
    const limitValue = reason.limit ? (data?.limits?.[reason.limit] ?? null) : null;

    /*
      Seats get the server's own builder, not a lookalike.

      `seatLimit` is what the API returns when it refuses an invite for want of
      a seat, right down to `code: "seat_limit"` — which is the code the dialog
      keys its headline off. Rebuilding the object by hand here produced
      `limit_reached` instead, and `limit_reached` renders "You've used this
      month's seats", which is the copy for a monthly allowance. Seats are a
      gauge; you do not get a fresh three in February. Calling the same function
      the server calls is the only version of "the same dialog either way" that
      cannot drift.
    */
    if (reason.limit === "seats" && limitValue !== null) {
      open(seatLimit(plan, reason.used ?? 0, limitValue).error, "click");
      return;
    }

    const requiredPlan = requiredPlanFor(reason, plan);
    const label = lockLabel(reason);
    open(
      {
        code: reason.feature ? "feature_locked" : "limit_reached",
        message: reason.feature
          ? `${label} is a ${requiredPlan ? PLANS[requiredPlan].name : "paid"} feature.`
          : `${PLANS[plan].name} includes ${limitValue ?? "a limited number of"} ${label.toLowerCase()}.`,
        feature: reason.feature ?? null,
        metric: reason.limit ?? null,
        used: reason.used ?? null,
        limit: limitValue,
        plan,
        requiredPlan,
        resetsAt: null,
        context,
        upgradeUrl: `/usage${requiredPlan ? `?plan=${requiredPlan}` : ""}`,
      },
      "click",
    );
  };
}

interface GateProps {
  feature: FeatureKey;
  children: ReactNode;
  /** Rendered instead of `children` when locked. Omit to render children disabled. */
  fallback?: ReactNode;
}

/** Renders `children` when the plan includes `feature`, otherwise `fallback`. */
export function Gate({ feature, children, fallback = null }: GateProps) {
  const { can } = useEntitlements();
  return <>{can(feature) ? children : fallback}</>;
}

/**
 * A small "Pro"/"Business" chip. Clicking it opens the paywall.
 *
 * Deliberately an interactive element rather than decoration: a padlock the user cannot
 * click is a dead end, and the moment they touch it is the moment they are curious.
 */
export function LockChip({
  reason,
  className,
  context,
}: {
  reason: LockReason;
  className?: string;
  context?: Record<string, unknown>;
}) {
  const upgrade = useUpgrade();
  const { data } = useEntitlements();
  const requiredPlan = requiredPlanFor(reason, data?.planId ?? "free");
  const label = lockLabel(reason);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        upgrade(reason, context ?? {});
      }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium",
        "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)] transition-opacity hover:opacity-80",
        className,
      )}
      title={`${label} — ${requiredPlan ? PLANS[requiredPlan].name : "a higher plan"}`}
    >
      <Lock className="size-2.5" aria-hidden />
      {requiredPlan ? PLANS[requiredPlan].name : "Upgrade"}
    </button>
  );
}

/**
 * Wraps a control that is visible but not usable on this plan.
 *
 * Keeps the control rendered and legible, kills its interactivity, and puts a chip beside
 * the label. Uses `inert` rather than only CSS so keyboard users cannot tab into something
 * that will refuse them.
 *
 * Three states, not two. The middle one is the point:
 *
 * - **unknown** — entitlements have not arrived. The control is rendered in
 *   place, dimmed slightly and inert, with the chip's slot reserved but empty.
 * - **allowed** — rendered plainly.
 * - **locked** — inert, with the chip.
 *
 * This used to have only the last two, and treated unknown as allowed. That
 * produced exactly the thing that looks like a bug: a switch renders live, you
 * flip it, and a moment later a "Pro" chip appears over a control you have
 * already used. Worse, the write went through — the server clamps the value
 * when it serves the form, so the setting saved and then silently did nothing.
 *
 * Holding it inert is not a security measure; the server is the boundary and
 * always was. It is a correctness one: a control must not accept a click whose
 * outcome we cannot yet name. And because the layout is identical in all three
 * states, nothing moves when the answer lands.
 */
export function LockedControl({
  feature,
  limit,
  used,
  locked: lockedByCaller,
  chip = "overlay",
  children,
  className,
}: {
  /** Locked because the plan lacks a feature. Entitlements decide. */
  feature?: FeatureKey;
  /** Locked because a limit is spent. The caller decides, via `locked`. */
  limit?: LimitKey;
  /** How many are already used, for the paywall's copy. Limit mode only. */
  used?: number | null;
  /**
   * Limit mode only, and required there.
   *
   * A feature lock is a property of the plan and this component can read it. A
   * limit lock is a property of the *data* — how many seats are taken, how many
   * forms exist — which lives with whoever rendered the control. Passing it in
   * is what lets both kinds share one component instead of one of them growing
   * a look of its own.
   */
  locked?: boolean;
  /**
   * Where the padlock chip sits.
   *
   * `overlay` pins it to the control's top-right corner, which is right for a
   * panel or a card — something with room to spare. On a *button* it lands on
   * the label: "Invite member" read as "Invite me…" with a chip over the rest,
   * and "Create key" as "Create…". `inline` puts the chip beside the control
   * instead, so both the thing you cannot press and the reason are legible.
   */
  chip?: "overlay" | "inline";
  children: ReactNode;
  className?: string;
}) {
  const { can, ready } = useEntitlements();

  const reason: LockReason = feature ? { feature } : { limit: limit!, used };
  const locked = feature ? ready && !can(feature) : Boolean(lockedByCaller);
  const settled = feature ? ready : true;

  if (settled && !locked) return <>{children}</>;

  if (chip === "inline") {
    return (
      <div className={cn("flex items-center gap-2", className)} aria-busy={!settled || undefined}>
        <div className={cn("select-none", locked ? "pointer-events-none opacity-55" : "pointer-events-none opacity-80")} inert>
          {children}
        </div>
        {locked && <LockChip reason={reason} />}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)} aria-busy={!settled || undefined}>
      <div
        className={cn(
          "select-none",
          // Dimmed further once we know it is locked, so the resolved state is
          // distinguishable from the waiting one rather than identical to it.
          locked ? "pointer-events-none opacity-55" : "pointer-events-none opacity-80",
        )}
        /*
          `inert={true}`, not `inert=""`.

          React 19 reads an empty string on a boolean attribute as *false* and
          logs a warning for it, so the cast that was here did not merely look
          odd — it plausibly left the subtree tabbable, which is the one thing
          this attribute is here to prevent. React 19 takes the boolean
          directly and needs no cast at all.
        */
        inert
      >
        {children}
      </div>
      {/*
        The slot is always present and always the same size, so the chip does
        not push anything around when it arrives. Only its contents change.
      */}
      <div className="absolute inset-0 z-10 flex items-start justify-end p-1">
        {locked && <LockChip reason={reason} />}
      </div>
    </div>
  );
}

interface LockedOverlayProps {
  feature: FeatureKey;
  /** The real number of rows behind the glass. This is the whole pitch. */
  count?: number | null;
  /** Plural noun for `count`. Defaults to the feature's own. */
  noun?: string;
  /** One line of copy. Written per surface, because a generic line converts nothing. */
  headline?: string;
  /** A blurred stand-in. Never the real data — see below. */
  children: ReactNode;
  className?: string;
  context?: Record<string, unknown>;
}

/**
 * The workhorse: a blurred skeleton with a real number and one call to action.
 *
 * `children` must be a **synthetic** skeleton, never the withheld data. Blurred CSS is not
 * a security boundary — anyone can open devtools — so the server withholds the rows and
 * this only communicates that they exist. The count is fetched separately and is
 * deliberately truthful: "14 people started and didn't finish" is what converts, and
 * inventing that number would be the one dark pattern that actually costs us.
 */
export function LockedOverlay({
  feature,
  count,
  noun,
  headline,
  children,
  className,
  context,
}: LockedOverlayProps) {
  const upgrade = useUpgrade();
  const meta = FEATURES[feature];
  const plan = PLANS[minPlanFor(feature)];
  const thing = noun ?? meta.noun ?? "";

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      <div
        aria-hidden
        className="pointer-events-none blur-[6px] saturate-50 select-none"
        /*
          `inert={true}`, not `inert=""`.

          React 19 reads an empty string on a boolean attribute as *false* and
          logs a warning for it, so the cast that was here did not merely look
          odd — it plausibly left the subtree tabbable, which is the one thing
          this attribute is here to prevent. React 19 takes the boolean
          directly and needs no cast at all.
        */
        inert
      >
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center bg-[var(--background)]/55 p-6 backdrop-blur-[2px]">
        <div className="max-w-sm text-center">
          <div className="bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)] mx-auto mb-3 flex size-9 items-center justify-center rounded-full">
            <Lock className="size-4" aria-hidden />
          </div>

          {typeof count === "number" && count > 0 && (
            <p className="font-display text-2xl font-semibold tracking-tight">
              {count.toLocaleString()} {thing}
            </p>
          )}

          <p className="mt-1 text-sm text-balance">{headline ?? meta.blurb}</p>

          {/* Full-strength brand on a deliberately drained surface — the rows
              behind it are blurred and desaturated, so this is the only colour
              left in the frame. That is the whole composition. */}
          <Button variant="gradient" className="mt-4" onClick={() => upgrade({ feature }, { count, ...context })}>
            Unlock with {plan.name}
          </Button>

          <p className="text-muted-foreground mt-2 text-xs">
            ${(plan.priceMonthlyCents / 100).toFixed(0)}/mo, or $
            {(Math.round(plan.priceYearlyCents / 12) / 100).toFixed(0)}/mo billed yearly
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * A generic blurred stand-in for a table.
 *
 * Rows of varying width so the blur reads as content rather than as a loading state — the
 * distinction matters, because "still loading" invites waiting and "locked" invites
 * clicking.
 */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  const widths = ["72%", "58%", "83%", "46%", "66%", "77%", "52%"];
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="bg-muted h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="bg-muted h-3 rounded" style={{ width: widths[i % widths.length] }} />
            <div className="bg-muted h-2.5 rounded opacity-60" style={{ width: widths[(i + 3) % widths.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A blurred stand-in for a chart. */
export function SkeletonChart({ bars = 7 }: { bars?: number }) {
  const heights = [45, 72, 58, 88, 34, 66, 51, 79, 42];
  return (
    <div className="flex h-48 items-end gap-2 p-4">
      {Array.from({ length: bars }, (_, i) => (
        <div key={i} className="bg-muted flex-1 rounded-t" style={{ height: `${heights[i % heights.length]}%` }} />
      ))}
    </div>
  );
}
