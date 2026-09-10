"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeClosing, isUrgent } from "./closing-notice";

/**
 * When this form stops accepting responses, said before anybody starts.
 *
 * The deadline reached a respondent in exactly one place before this — the
 * share unfurl — so somebody who opened the link an hour late met a generic
 * error screen with no way to tell that lateness was the reason.
 *
 * It sits at the top of the thread rather than in the header, and scrolls away
 * with the conversation. The header is already logo, title, progress, "Start
 * over" and close in one row where the title truncates; there is no space
 * there, and a banner pinned above a conversation somebody is trying to have
 * is a worse answer than one that says its piece and gets out of the way.
 */
export function ClosingNotice({
  closeAt,
  started,
}: {
  closeAt?: string;
  /** Whether this respondent has already answered something. */
  started: boolean;
}) {
  /**
   * Null until mounted, which is deliberate rather than lazy: every string
   * below is formatted in the respondent's own timezone, so rendering it on
   * the server would produce a different one and hydration would tear.
   */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const desc = now === null ? null : describeClosing(closeAt, now, { started });
  const tickMs = desc?.tickMs ?? null;

  useEffect(() => {
    if (tickMs === null) return;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    /*
     * A backgrounded tab has its timers throttled to about once a minute, so a
     * second-by-second countdown comes back visibly stale. The clock is read
     * rather than counted, so one read on return is the whole repair.
     */
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tickMs]);

  if (!desc) return null;

  const urgent = isUrgent(desc.tier);
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          // The scroll-to-bottom chip's shape, which is this thread's
          // established way of saying something that is not a message.
          "flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
          "bg-[var(--cf-chip-bg)]",
          urgent
            ? "border-[var(--cf-warning)]/40 text-[var(--cf-warning)]"
            : "border-[var(--cf-chip-border)] opacity-60",
        )}
      >
        <Clock className="size-3.5 shrink-0" strokeWidth={2} />
        {/*
          `tabular-nums` because the digits change once a second and
          proportional figures make the whole row twitch sideways as they do.

          Hidden from assistive tech, with the absolute time announced in its
          place — a live counter read out once a second is unusable, and the
          date is the form somebody can act on anyway.
        */}
        <span className="tabular-nums" aria-hidden="true">
          {desc.text}
        </span>
        <span className="sr-only">{desc.srText}</span>
      </div>
    </div>
  );
}
