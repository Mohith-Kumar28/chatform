"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useUpgrade } from "@/components/billing/gate";
import { Button } from "@/components/ui/button";
import { statusSentence, statusTone } from "@/lib/usage/copy";
import type { MeterRowData } from "@/lib/usage/meters";

/**
 * "Am I okay?" — answered before a single number is read.
 *
 * A usage page is not read the way a dashboard is. Almost nobody arrives wanting to audit
 * nine figures; they arrive with one question, and it is nearly always this one. The old
 * page made them derive the answer by scanning every meter for a colour, which is work
 * the page can simply do for them.
 *
 * So one sentence, always present, about whichever limit is closest to biting — and it
 * names the consequence and the remedy rather than describing the problem, because "164
 * of 200 used" is a fact and "past the cap it keeps running at reduced quality" is the
 * thing that decides whether you act.
 *
 * The calm state is not skipped. A page that only speaks up when something is wrong
 * leaves the reader unsure whether silence means fine or means unread.
 */
export function UsageHeadline({
  pressured,
  resets,
  gradient,
  canManage,
}: {
  /** The closest limit to its ceiling, or `null` when nothing is enforced. */
  pressured: MeterRowData | null;
  resets: string;
  /** Whether this screen's single gradient belongs here rather than in the header. */
  gradient: boolean;
  canManage: boolean;
}) {
  const upgrade = useUpgrade();
  const tone = statusTone(pressured);
  const sentence = statusSentence(pressured, resets);

  const Icon = tone === "ok" ? CircleCheck : TriangleAlert;

  /*
    Soft ground, soft ink — always as a pair.

    Mixing a saturated `--destructive` with a `--destructive-soft` ground is the 1.4:1
    combination this codebase has already shipped once, and it only shows up in dark mode,
    where the soft token is a deep tint rather than a pale one.
  */
  const skin =
    tone === "danger"
      ? "bg-[var(--destructive-soft)] text-[var(--destructive-soft-foreground)]"
      : tone === "warning"
        ? "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]"
        : "bg-muted text-muted-foreground";

  // The ask only exists where there is something to ask about. Below `near`, an upgrade
  // button here would be a prompt with no event behind it.
  const showCta = canManage && pressured !== null && tone !== "ok";

  return (
    <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm ${skin}`}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-pretty">{sentence}</p>
      {showCta && (
        <Button
          size="sm"
          variant={gradient ? "gradient" : "default"}
          shape={gradient ? "pill" : "default"}
          /* Attached to the limit that is actually running out, so the dialog opens on
             the plan that raises *that* number rather than a generic tier. */
          onClick={() =>
            upgrade(
              { limit: pressured.limitKey, used: pressured.used },
              { surface: "usage-headline", metric: pressured.metric ?? null },
            )
          }
        >
          Raise the limit
        </Button>
      )}
    </div>
  );
}
