"use client";

import { MessageSquareOff, Inbox } from "lucide-react";
import type { LimitKey } from "@repo/entitlements";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useUpgrade } from "@/components/billing/gate";
import { Button } from "@/components/ui/button";
import { monthlyRows, mostPressured } from "@/lib/usage/meters";
import { statusSentence, statusTone } from "@/lib/usage/copy";

/**
 * The two limits an owner needs warning about before they bite.
 *
 * The AI cap degrades rather than refuses, and that only works if the owner is told —
 * otherwise the product quietly gets worse and they blame the product. The response
 * ceiling *does* refuse, and a respondent seeing a closed form is the one failure that
 * costs reputation rather than money, so it is worth shouting about early.
 *
 * Nothing renders below 80%. The rule everywhere is never to sell before there is data.
 *
 * ## Why the sentences are not written here any more
 *
 * They were, in four hand-written lambdas — and the usage page had its own wording for
 * the same two caps, in a popover. Two surfaces describing one event in two voices is a
 * drift waiting to happen, and the one that mattered ("your forms keep collecting, they
 * just stop being conversational") was the one buried behind an icon. Both now read from
 * `lib/usage/copy`, which derives the sentence from the limit's enforcement mode, so
 * neither can quietly disagree with the other.
 */
const WATCHED: LimitKey[] = ["responses_ceiling_per_month", "ai_conversations_per_month"];

const ICONS: Partial<Record<LimitKey, typeof Inbox>> = {
  responses_ceiling_per_month: Inbox,
  ai_conversations_per_month: MessageSquareOff,
};

export function AiCapBanner() {
  const ent = useEntitlements();
  const upgrade = useUpgrade();

  if (!ent.data) return null;

  const resets = new Date(ent.data.periodResetsAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });

  /*
    Only the most urgent one is shown. Two stacked banners on a dashboard read as noise
    and get dismissed as a set, which is the opposite of what either is for.
  */
  const row = mostPressured(monthlyRows(ent.data).filter((r) => WATCHED.includes(r.limitKey)));
  const tone = statusTone(row);
  if (!row || tone === "ok") return null;

  const Icon = ICONS[row.limitKey] ?? Inbox;
  const reached = row.state === "at" || row.state === "over";

  return (
    <div
      className={
        reached
          ? "flex flex-wrap items-center gap-3 rounded-xl bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning-soft-foreground)]"
          : "text-muted-foreground bg-muted flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm"
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-pretty">{statusSentence(row, resets)}</p>
      <Button
        size="sm"
        variant={reached ? "default" : "outline"}
        onClick={() =>
          upgrade(
            { limit: row.limitKey, used: row.used },
            { surface: "usage-banner", metric: row.metric ?? null, used: row.used, limit: row.limit },
          )
        }
      >
        Raise the limit
      </Button>
    </div>
  );
}
