"use client";

import { MessageSquareOff, Inbox } from "lucide-react";
import type { FeatureKey, LimitKey, MetricKey } from "@repo/entitlements";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useUpgrade } from "@/components/billing/gate";
import { Button } from "@/components/ui/button";

/**
 * The two limits an owner needs warning about before they bite.
 *
 * The AI cap degrades rather than refuses, and that only works if the owner is told —
 * otherwise the product quietly gets worse and they blame the product. The response
 * ceiling *does* refuse, and a respondent seeing a closed form is the one failure that
 * costs reputation rather than money, so it is worth shouting about early.
 *
 * Nothing renders below 80%. The rule everywhere is never to sell before there is data.
 */
interface Warning {
  metric: MetricKey;
  limit: LimitKey;
  feature: FeatureKey;
  icon: typeof MessageSquareOff;
  /** Copy for 80–99%. */
  approaching: (used: number, limit: number) => string;
  /** Copy at 100%. */
  reached: (used: number, limit: number, resets: string) => string;
}

const WARNINGS: Warning[] = [
  {
    metric: "responses",
    limit: "responses_ceiling_per_month",
    feature: "partial_responses",
    icon: Inbox,
    approaching: (used, limit) =>
      `${used.toLocaleString()} of ${limit.toLocaleString()} responses this month. Past the ceiling your forms stop accepting new ones.`,
    reached: (used, limit, resets) =>
      `Your forms have reached ${limit.toLocaleString()} responses this month and are showing your closed message. Resets ${resets}.`,
  },
  {
    metric: "ai_conversations",
    limit: "ai_conversations_per_month",
    feature: "agent_persona",
    icon: MessageSquareOff,
    approaching: (used, limit) =>
      `${used.toLocaleString()} of ${limit.toLocaleString()} AI conversations used this month. Past the cap your forms keep collecting, just without the conversation.`,
    reached: (used, limit, resets) =>
      `${used.toLocaleString()}/${limit.toLocaleString()} AI conversations used. Your forms are still collecting — they're asking their questions directly instead of conversationally. Resets ${resets}.`,
  },
];

export function AiCapBanner() {
  const ent = useEntitlements();
  const upgrade = useUpgrade();

  if (!ent.data) return null;

  const resets = new Date(ent.data.periodResetsAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });

  /**
   * Only the most urgent one is shown.
   *
   * Two stacked banners on a dashboard read as noise and get dismissed as a set, which is
   * the opposite of what either is for.
   */
  const active = WARNINGS.map((w) => {
    const limit = ent.limit(w.limit);
    const used = ent.usage(w.metric);
    return limit ? { w, used, limit, ratio: used / limit } : null;
  })
    .filter((x): x is { w: Warning; used: number; limit: number; ratio: number } => x !== null && x.ratio >= 0.8)
    .sort((a, b) => b.ratio - a.ratio)[0];

  if (!active) return null;

  const { w, used, limit, ratio } = active;
  const reached = ratio >= 1;
  const Icon = w.icon;

  return (
    <div
      className={
        reached
          ? "flex flex-wrap items-center gap-3 rounded-xl bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning-soft-foreground)]"
          : "text-muted-foreground bg-muted flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm"
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{reached ? w.reached(used, limit, resets) : w.approaching(used, limit)}</p>
      <Button
        size="sm"
        variant={reached ? "default" : "outline"}
        onClick={() => upgrade(w.feature, { surface: "usage-banner", metric: w.metric, used, limit })}
      >
        Raise the limit
      </Button>
    </div>
  );
}
