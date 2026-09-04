"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { FEATURES, PLANS, minPlanFor, type FeatureKey } from "@repo/entitlements";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePaywall } from "@/stores/paywall-store";
import { cn } from "@/lib/utils";

/**
 * The gate primitives.
 *
 * One rule runs through all of them: **show, don't hide.** Every locked control stays
 * visible, in place, switched off, with a chip naming the plan. A feature a user never
 * sees is a feature they will never want, and a control that vanishes on a downgrade
 * reads as a bug rather than a price.
 */

/** Open the paywall for a feature, from a click rather than a failed request. */
export function useUpgrade() {
  const open = usePaywall((s) => s.open);
  return (feature: FeatureKey, context: Record<string, unknown> = {}) => {
    const requiredPlan = minPlanFor(feature);
    open(
      {
        code: "feature_locked",
        message: `${FEATURES[feature].label} is a ${PLANS[requiredPlan].name} feature.`,
        feature,
        metric: null,
        used: null,
        limit: null,
        plan: "free",
        requiredPlan,
        resetsAt: null,
        context,
        upgradeUrl: `/billing?plan=${requiredPlan}&from=${feature}`,
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
  feature,
  className,
  context,
}: {
  feature: FeatureKey;
  className?: string;
  context?: Record<string, unknown>;
}) {
  const upgrade = useUpgrade();
  const plan = PLANS[minPlanFor(feature)];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        upgrade(feature, context ?? {});
      }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium",
        "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)] transition-opacity hover:opacity-80",
        className,
      )}
      title={`${FEATURES[feature].label} — ${plan.name}`}
    >
      <Lock className="size-2.5" aria-hidden />
      {plan.name}
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
  children,
  className,
}: {
  feature: FeatureKey;
  children: ReactNode;
  className?: string;
}) {
  const { can, ready } = useEntitlements();
  if (ready && can(feature)) return <>{children}</>;

  const locked = ready;
  return (
    <div className={cn("relative", className)} aria-busy={!ready || undefined}>
      <div
        className={cn(
          "select-none",
          // Dimmed further once we know it is locked, so the resolved state is
          // distinguishable from the waiting one rather than identical to it.
          locked ? "pointer-events-none opacity-55" : "pointer-events-none opacity-80",
        )}
        {...({ inert: "" } as Record<string, string>)}
      >
        {children}
      </div>
      {/*
        The slot is always present and always the same size, so the chip does
        not push anything around when it arrives. Only its contents change.
      */}
      <div className="absolute inset-0 z-10 flex items-start justify-end p-1">
        {locked && <LockChip feature={feature} />}
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
        {...({ inert: "" } as Record<string, string>)}
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

          <button
            type="button"
            onClick={() => upgrade(feature, { count, ...context })}
            className="mt-4 inline-flex h-9 items-center rounded-lg bg-[var(--primary)] px-3.5 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
          >
            Unlock with {plan.name}
          </button>

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
