"use client";

import { useEffect, useState } from "react";
import { Check, Crown } from "lucide-react";
import type { PollResult } from "./use-chat";

/**
 * What everybody else said, drawn under the answer that earned it.
 *
 * The one place in the product where a respondent gets something back for
 * answering, so it gets a card of its own rather than a row of hairlines: each
 * option is a pill with its share filling in behind the label, the way a poll
 * looks in every chat app people already use. Their own pick is checked,
 * because the first thing anybody does with a poll result is look for
 * themselves in it, and the leader wears a crown.
 *
 * Everything it needs arrives in the `poll_result` event, labels included. It
 * never joins against the form's blocks: that lookup renders an empty chart
 * the day a question is edited between two people answering it.
 *
 * The fills grow in on mount, staggered, and the percentages count up with
 * them. Kept under a second end to end so the reveal is the payoff, not a
 * wait. Mount only: the card is keyed to its message, so scrolling back does
 * not replay it. Reduced motion lands on the final numbers at once.
 */
export function PollResultCard({ result }: { result: PollResult }) {
  const { total, options, picked } = result;

  /*
   * Below the reveal floor there are no bars to draw, and saying so plainly
   * beats drawing a chart of one: "you're the first" is a better line than a
   * 100% bar, which is both true and useless.
   */
  if (!options || options.length === 0) {
    return (
      <div
        className="animate-message-in mt-2 mb-6 inline-flex max-w-[85%] items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs"
        style={{
          background: "var(--cf-bot-bubble)",
          color: "var(--cf-bot-bubble-text)",
          borderColor: "var(--cf-bot-bubble-border)",
        }}
      >
        <span className="size-1.5 rounded-full" style={{ background: "var(--cf-accent)" }} />
        {/*
          Zero is the builder's preview, where the vote was never counted and
          claiming they were first would be a small lie about a real number.
        */}
        {total === 0
          ? "No answers yet."
          : total === 1
            ? "You're the first to answer this one."
            : `${total} answers so far. Results open up shortly.`}
      </div>
    );
  }

  const top = Math.max(...options.map((o) => o.count));

  return (
    <div
      className="animate-message-in mt-2.5 mb-6 w-full max-w-[85%] rounded-2xl border p-3.5 shadow-sm sm:max-w-sm"
      style={{
        background: "var(--cf-bot-bubble)",
        color: "var(--cf-bot-bubble-text)",
        borderColor: "var(--cf-bot-bubble-border)",
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-0.5 text-xs">
        <span className="flex items-center gap-2 font-medium">
          <span className="relative flex size-2">
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-60 [animation-iteration-count:3]"
              style={{ background: "var(--cf-accent)" }}
            />
            <span className="relative size-2 rounded-full" style={{ background: "var(--cf-accent)" }} />
          </span>
          Results
        </span>
        <span className="tabular-nums opacity-55">
          {total} {total === 1 ? "vote" : "votes"}
        </span>
      </div>

      <ul className="space-y-2">
        {options.map((option, i) => {
          const share = total > 0 ? Math.round((option.count / total) * 100) : 0;
          const mine = option.id === picked;
          const leader = option.count > 0 && option.count === top;
          return (
            <PollRow key={option.id} label={option.label} share={share} mine={mine} leader={leader} index={i} />
          );
        })}
      </ul>
    </div>
  );
}

const GROW_MS = 850;
const STAGGER_MS = 90;

function PollRow({
  label,
  share,
  mine,
  leader,
  index,
}: {
  label: string;
  share: number;
  mine: boolean;
  leader: boolean;
  index: number;
}) {
  const delay = 120 + index * STAGGER_MS;
  const shown = useCountUp(share, GROW_MS, delay);

  return (
    <li
      className="relative overflow-hidden rounded-xl border"
      style={{
        borderColor: mine ? "var(--cf-accent)" : "var(--cf-chip-border)",
        background: "color-mix(in srgb, var(--cf-accent) 4%, transparent)",
      }}
    >
      {/* The fill. Width is the share of everyone who answered, so the pills
          read as slices of one crowd; scaleX does the growing so it stays on
          the compositor. */}
      <span
        aria-hidden
        className="poll-fill absolute inset-y-0 left-0 origin-left"
        style={{
          width: `${share}%`,
          background: mine
            ? "color-mix(in srgb, var(--cf-accent) 30%, transparent)"
            : leader
              ? "color-mix(in srgb, var(--cf-accent) 20%, transparent)"
              : "color-mix(in srgb, var(--cf-accent) 12%, transparent)",
          animationDelay: `${delay}ms`,
          animationDuration: `${GROW_MS}ms`,
        }}
      />
      <div className="relative flex min-h-11 items-center gap-2.5 px-3 py-2 text-sm">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full"
          style={
            mine
              ? { background: "var(--cf-accent)", color: "var(--cf-accent-text)" }
              : { border: "1.5px solid var(--cf-chip-border)" }
          }
        >
          {mine && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className={mine || leader ? "min-w-0 flex-1 font-medium" : "min-w-0 flex-1 opacity-80"}>{label}</span>
        {leader && (
          <Crown
            className="poll-crown size-3.5 shrink-0"
            style={{ color: "var(--cf-accent)", animationDelay: `${delay + GROW_MS - 150}ms` }}
            aria-label="Most picked"
          />
        )}
        <span className={mine || leader ? "shrink-0 font-semibold tabular-nums" : "shrink-0 tabular-nums opacity-70"}>
          {shown}%
        </span>
      </div>
    </li>
  );
}

/** Counts from 0 to `target` alongside the bar, easing out the same way it does. */
function useCountUp(target: number, duration: number, delay: number) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = still ? 1 : Math.min(1, Math.max(0, (now - start) / duration));
      // easeOutExpo, to match the fill's cubic-bezier(0.16, 1, 0.3, 1).
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, delay]);

  return value;
}
