"use client";

import Link from "next/link";
import { useEntitlements } from "@/hooks/use-entitlements";
import { cn } from "@/lib/utils";

/**
 * Responses-this-month pill.
 *
 * Reads the shared `useEntitlements` hook rather than fetching `/api/billing/usage`
 * itself. The previous version typed `plan` as an object when the API returns a string,
 * and used a different query key from the usage page — so the same data was fetched and
 * cached twice and the plan name was unusable.
 *
 * Shows the AI conversation count rather than the raw response count when the AI cap is
 * the nearer of the two. Responses are unlimited on every plan, so a responses-only meter
 * would sit near zero forever while the number that actually bites went unwatched.
 */
export function UsagePill() {
  const ent = useEntitlements();
  if (!ent.data) return null;

  const responseRatio = ent.ratio("responses", "responses_ceiling_per_month");
  const aiRatio = ent.ratio("ai_conversations", "ai_conversations_per_month");
  const showAi = aiRatio >= responseRatio;

  const metric = showAi ? "ai_conversations" : "responses";
  const limitKey = showAi ? "ai_conversations_per_month" : "responses_ceiling_per_month";
  const label = showAi ? "AI chats" : "responses";

  const limit = ent.limit(limitKey);
  const used = ent.usage(metric);
  if (!limit) return null;

  const ratio = used / limit;
  return (
    <Link
      href="/billing"
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors md:inline-flex",
        ratio >= 1
          ? "bg-[var(--destructive-soft)] text-destructive"
          : ratio > 0.8
            ? "bg-[var(--warning-soft)] text-[var(--warning-foreground)]"
            : "text-muted-foreground hover:bg-muted",
      )}
      title={
        showAi
          ? `${used} of ${limit} AI conversations used this month. Past the cap your forms keep collecting, asking questions directly.`
          : `${used} of ${limit} responses this month`
      }
    >
      <span className="tabular">
        {used.toLocaleString()}/{limit.toLocaleString()}
      </span>
      <span className="opacity-60">{label}</span>
    </Link>
  );
}
