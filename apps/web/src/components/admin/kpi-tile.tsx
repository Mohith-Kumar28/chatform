"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { deltaLabel } from "./format";
import { cn } from "@/lib/utils";

/**
 * A number, where it has been, and whether that is good.
 *
 * Three decisions worth stating:
 *
 * **The comparison is to the same length of time immediately before.** Thirty
 * days against the thirty before it, not against a calendar month — so the
 * figure means the same thing on the 3rd as on the 28th.
 *
 * **Up is not automatically green.** `lowerIsBetter` exists because this console
 * shows AI cost next to signups, and a cost tile that turns green as it climbs
 * is worse than no colour at all.
 *
 * **The movement is a percentage; the window and the raw move are a tooltip.**
 * "+13 vs prev 30 days" spent most of the line restating the range picker
 * sitting above it, so the line carries the percentage alone and the hover
 * carries both the absolute move and what it is measured against.
 *
 * **Every tile's line is the same kind of figure**, including a tile whose
 * previous period was zero — that reads as +100%, the whole of it having
 * arrived in this period. Printing the raw move there instead made the row
 * unreadable across: on a young product nearly every baseline is zero, so
 * "+13" beside "+40%" was the common case rather than the edge one, and the
 * "+13" only repeated the 13 already set above it in larger type. See
 * `deltaLabel`.
 */
export function KpiTile({
  label,
  value,
  previous,
  comparedTo = "previous period",
  format = (n: number) => n.toLocaleString(),
  series,
  lowerIsBetter = false,
  hint,
  about,
  sub,
}: {
  label: string;
  value: number;
  /**
   * Omit for a figure that is a standing total rather than a period count.
   *
   * "Block types in use: 26" has nothing to compare against, and inventing a
   * delta for it would be inventing a number. Without this the Product page had
   * to reach for a different component, and the same band of the page came out
   * a different height and a different shape depending which page you were on.
   */
  previous?: number;
  /**
   * What `previous` actually is, named — "prev 30 days", "yesterday".
   *
   * The comparison window is the page's date range, which the tile cannot see;
   * saying "vs previous" instead made the reader guess whether it meant the day
   * before, the month before, or all time.
   */
  comparedTo?: string;
  format?: (n: number) => string;
  series?: number[];
  lowerIsBetter?: boolean;
  hint?: string;
  /**
   * An explanation that is never printed, only hovered.
   *
   * `hint` does two jobs — the caption beside the movement, and the tooltip
   * behind it — and for four or five words that is exactly right: "live, not
   * deleted", "MRR × 12", "3+ fails in a row". It stops being right at sentence
   * length, where the line has about a hundred and forty pixels once the
   * movement has taken its share and the tile prints "Accounts tha…", which is
   * the half that says nothing.
   *
   * Abbreviating the sentence into the slot does not fix that. "Collected or
   * edited" fitted and meant nothing: two transitive verbs with their objects
   * cut off. A definition that needs a sentence needs a sentence, so it goes
   * here and the printed line stays empty.
   */
  about?: string;
  /**
   * A second figure that qualifies the first, beside it — "+8 partial".
   *
   * For the case where the headline number is true but incomplete on its own.
   * "Responses collected: 12" is the finished ones, and read alone it says
   * nobody abandoned anything; the partials belong in the same glance, not on
   * another page. Deliberately not a second tile: it is not a measure of its
   * own, it is the rest of this one.
   */
  sub?: string;
}) {
  const delta = value - (previous ?? value);
  const flat = delta === 0;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  // The wording lives in `format.ts` so it can be tested without a DOM.
  const moved = deltaLabel(value, previous, comparedTo, format);

  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    /**
     * Deliberately compact.
     *
     * Six of these open every page, and at `text-h1` with generous stacking they
     * cost about 300px in two rows — the whole first screen spent on six numbers
     * before a single chart. A KPI is a glance, not a headline: the figure only
     * needs to out-weigh its own label, which 1.75rem does, and the row now fits
     * on one line at desktop width and costs roughly a third of what it did.
     */
    // The whole tile is the hover target for `about`, rather than a few words of
    // caption the reader would have to find first.
    <div className="bg-card shadow-xs rounded-xl px-3.5 py-3" title={about}>
      <p className="text-muted-foreground text-caption truncate" title={label}>
        {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="tabular flex items-baseline gap-1.5 text-[1.75rem] leading-none font-semibold">
          {format(value)}
          {sub && (
            <span className="text-muted-foreground text-micro truncate font-normal" title={sub}>
              {sub}
            </span>
          )}
        </p>
        {series && series.length > 1 && (
          <Sparkline
            values={series}
            width={56}
            height={18}
            color={flat ? "var(--muted-foreground)" : good ? "var(--success)" : "var(--chart-2)"}
          />
        )}
      </div>
      {/*
        A flat tile spends its line on the hint, not on the words "no change".

        Six tiles across a laptop leaves each about 240px, and "— no change 3+
        consecutive failures" truncated to "— no change 3+ con…" — the half that
        survived was the half that said nothing. When a number has not moved,
        the only thing worth the space is what it counts.
      */}
      <p
        className={cn(
          // A notch under `text-micro`: this line is a footnote to the figure
          // above it, and every pixel it gives up is a pixel the caption keeps.
          "mt-1.5 flex items-center gap-1 text-[0.6875rem] leading-[1.45]",
          flat ? "text-muted-foreground" : good ? "text-[var(--success)]" : "text-[var(--warning-soft-foreground)]",
        )}
      >
        {moved === null ? (
          <span className="truncate" title={about ?? hint}>
            {hint ?? (previous !== undefined ? "no change" : "")}
          </span>
        ) : (
          <>
            <Icon className="size-3 shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="tabular shrink-0" title={moved.against}>
              {moved.change}
            </span>
            {/*
              The window is not printed, only hovered.

              "+13 vs prev 30 days" spends most of a 200px line restating the
              range picker that is on screen, three inches above, set by the
              reader a moment ago. Six tiles printed it six times and each one
              truncated. The comparison is still named — it rides in the title
              on the figure — but the line itself is now the movement and, where
              a tile has one, the caption that says what it counts.
            */}
            {hint && (
              <span className="text-muted-foreground truncate" title={about ?? hint}>
                {hint}
              </span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
