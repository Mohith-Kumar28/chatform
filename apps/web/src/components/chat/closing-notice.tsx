"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeCapacity, describeClosing, isUrgent } from "./closing-time";

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
  capacity,
  started,
}: {
  closeAt?: string;
  /** Places against the cap, when the author asked for them to be shown. */
  capacity?: { max: number; taken: number };
  /** Whether this respondent has already answered something. */
  started: boolean;
}) {
  /**
   * The clock as an external store rather than state on a timer.
   *
   * Three things fall out of it that the obvious `useState` + `useEffect`
   * version had to fight for. Nothing calls `Date.now()` during render, which
   * is a purity rule and not a style preference — a component that reads the
   * clock while rendering produces a different answer every time React happens
   * to re-render it. Nothing calls `setState` inside an effect body, so there
   * is no cascading render on mount. And the server snapshot is `0`, so the
   * first paint is empty on both sides and the locale-formatted time — which
   * is formatted in the *respondent's* zone and would never match the
   * server's — cannot tear during hydration.
   */
  const nowRef = useRef(0);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const read = () => {
        nowRef.current = Date.now();
        onStoreChange();
        /*
         * The next wake-up is decided by the line we just wrote, not by a
         * fixed interval: seconds inside the last day, minutes above it, and
         * nothing at all once the deadline has passed. So the countdown speeds
         * up as it crosses each tier without anyone having to notice, and a
         * deadline three weeks out costs one wake-up a minute rather than
         * sixty.
         */
        const next = describeClosing(closeAt, nowRef.current, { started })?.tickMs;
        if (next != null) timer = setTimeout(read, next);
      };

      /*
       * A backgrounded tab has its timers throttled to about once a minute, so
       * a second-by-second countdown comes back visibly stale. The clock is
       * read rather than counted, so one read on return is the whole repair.
       */
      const onVisible = () => {
        if (document.visibilityState === "visible") {
          clearTimeout(timer);
          read();
        }
      };

      read();
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
      };
    },
    [closeAt, started],
  );

  const now = useSyncExternalStore(
    subscribe,
    () => nowRef.current,
    () => 0,
  );

  const desc = now === 0 ? null : describeClosing(closeAt, now, { started });
  /**
   * Places left stops being a fact the moment the deadline passes.
   *
   * Nobody can take them, so "you can still finish this response · 25 spots
   * left" offers a thing that is no longer on offer — and it read as two
   * contradictory sentences stapled together. The count survives only while it
   * still describes something somebody could do.
   */
  const spots = desc?.tier === "passed" ? null : describeCapacity(capacity);
  if (!desc && !spots) return null;

  const timeUrgent = desc ? isUrgent(desc.tier) : false;
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          /*
            `items-start` with the icon outside the text, rather than everything
            in one wrapping flex row.

            All of this is usually a clock a few characters wide, but one string
            is a whole sentence — "you can still finish this response" — and as
            flex children the icon and each span were wrap candidates in their
            own right. On a narrow phone that put the icon alone on the first
            line with the sentence centred underneath, and left the separator
            stranded before the count. The icon is a fixed column now and the
            words are ordinary inline text inside it, so they wrap the way text
            does and the icon stays beside the first line.

            `rounded-2xl` rather than the scroll-to-bottom chip's `rounded-full`
            for the same reason: at two lines a pill looks like a mistake, and
            at one line the two shapes are barely distinguishable at this height.
          */
          "flex max-w-full items-start gap-1.5 rounded-2xl border px-3 py-1.5 text-xs",
          "bg-[var(--cf-chip-bg)]",
          timeUrgent || spots?.urgent
            ? "border-[var(--cf-warning)]/40"
            : "border-[var(--cf-chip-border)]",
        )}
      >
        {/* The clock earns the icon slot; without a deadline the count takes it.
            `mt-px` sits it on the text baseline rather than the box's top. */}
        {desc ? (
          <Clock className="mt-px size-3.5 shrink-0" strokeWidth={2} />
        ) : (
          <Users className="mt-px size-3.5 shrink-0" strokeWidth={2} />
        )}

        <span className="min-w-0 text-center">
          {desc && (
            <>
              {/*
                `tabular-nums` because the digits change once a second and
                proportional figures make the whole row twitch sideways as they
                do.

                Hidden from assistive tech, with the absolute time announced in
                its place — a live counter read out once a second is unusable,
                and the date is the form somebody can act on anyway.
              */}
              <span
                className={cn(
                  "tabular-nums",
                  timeUrgent ? "text-[var(--cf-warning)]" : "text-[var(--cf-muted)]",
                )}
                aria-hidden="true"
              >
                {desc.text}
              </span>
              <span className="sr-only">{desc.srText}</span>
            </>
          )}

          {/*
            Coloured on its own account. Few places left is a reason to hurry
            even when the deadline is a fortnight off, and a deadline in the last
            hour says nothing about how full the form is — so one being urgent
            must not drag the other into a colour its own numbers do not justify.
          */}
          {desc && spots && (
            <span className="text-[var(--cf-muted)]" aria-hidden="true">
              {" · "}
            </span>
          )}
          {spots && (
            <span className={spots.urgent ? "text-[var(--cf-warning)]" : "text-[var(--cf-muted)]"}>
              {spots.text}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
