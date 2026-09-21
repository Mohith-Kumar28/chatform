"use client";

import type { PollResult } from "./use-chat";

/**
 * What everybody else said, drawn under the answer that earned it.
 *
 * The one place in the product where a respondent gets something back for
 * answering, so it is worth the bars: a row of percentages reads as a receipt,
 * a bar reads as a crowd. Their own pick is marked, because the first thing
 * anybody does with a poll result is look for themselves in it.
 *
 * Everything it needs arrives in the `poll_result` event, labels included. It
 * never joins against the form's blocks: that lookup renders an empty chart
 * the day a question is edited between two people answering it.
 *
 * No animation on the fill. It is tempting and it is wrong here — the numbers
 * already arrive a beat after the tap, and a bar that then grows for 600ms
 * delays the only thing the respondent is waiting for.
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
      <p className="mt-1.5 px-1 text-xs opacity-60">
        {/*
          Zero is the builder's preview, where the vote was never counted and
          claiming they were first would be a small lie about a real number.
        */}
        {total === 0
          ? "No answers yet."
          : total === 1
            ? "You're the first to answer this one."
            : `${total} answers so far. Results open up shortly.`}
      </p>
    );
  }

  const biggest = Math.max(1, ...options.map((o) => o.count));

  return (
    <div className="mt-2 max-w-[90%] space-y-1.5 px-1">
      {options.map((option) => {
        // The percentage is of everyone who answered; the bar's width is of
        // the biggest option, so a poll split 8/6/1 does not draw three stubs.
        const share = total > 0 ? Math.round((option.count / total) * 100) : 0;
        const width = `${Math.max(2, Math.round((option.count / biggest) * 100))}%`;
        const mine = option.id === picked;
        return (
          <div key={option.id} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className={mine ? "font-medium" : "opacity-75"}>
                {option.label}
                {mine && <span className="ml-1.5 opacity-60">· your pick</span>}
              </span>
              <span className="tabular-nums opacity-60">{share}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--cf-chip-bg)]">
              <div
                className="h-full rounded-full"
                style={{
                  width,
                  background: mine ? "var(--cf-accent)" : "color-mix(in srgb, var(--cf-accent) 28%, transparent)",
                }}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-0.5 text-xs opacity-55">
        {total} {total === 1 ? "answer" : "answers"}
      </p>
    </div>
  );
}
