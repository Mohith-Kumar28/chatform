/**
 * How the console writes numbers.
 *
 * Shared rather than inlined, because a page that shows revenue in three
 * different roundings is a page whose numbers get double-checked instead of
 * acted on.
 */

/** Cents → `$1,240`. Whole dollars: nobody makes a decision on the cents. */
export function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/** USD micros → `$12.40`, or `$0.0031` when the figure is genuinely tiny. */
export function usd(micro: number): string {
  const dollars = micro / 1_000_000;
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toPrecision(2)}`;
  return `$${dollars.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** `1_240_000` → `1.24M`. For axis ticks and table cells, never for money. */
export function compact(n: number): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/**
 * A timestamp as a distance: `today`, `3d ago`, `in 20d`, `14 Aug`.
 *
 * Recent things get a distance because that is how they are reasoned about
 * ("failed yesterday"); anything more than a fortnight away in either direction
 * gets a date, because "47d ago" is a number you have to do arithmetic on.
 *
 * **Both directions**, and that is not a nicety. This started out subtracting
 * one way and flooring at zero, so every future date rendered as "today" — a
 * subscription renewing in three weeks read as renewing this morning, a comp
 * expiring in a month read as expiring now, and a grace period ending on Friday
 * read as already over. Each of those is a wrong number that prompts the wrong
 * action, and all three come from the same line.
 */
export function relativeDay(ms: number | null | undefined): string {
  if (!ms) return "never";
  const diff = ms - Date.now();
  const days = Math.round(diff / 86_400_000);

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0 && days < 14) return `in ${days}d`;
  if (days < 0 && days > -14) return `${-days}d ago`;

  const d = new Date(ms);
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}${year}`;
}

/**
 * What the line under a KPI says about how the number moved.
 *
 * **The line is always a percentage.** It used to print the raw move on a zero
 * baseline — "+13" beside another tile's "+40%" — on the reasoning that a
 * percentage of nothing is made up. That reasoning is right about the
 * arithmetic and wrong about the tile: on a young product almost every
 * baseline is zero, so the rule that was meant for an edge case governed the
 * whole row, and six tiles that were supposed to show growth showed six copies
 * of the number already printed above them in larger type. A row where each
 * line means something different depending on a baseline the reader cannot see
 * is a row nobody can read across.
 *
 * So a first period counts as **+100%** — the whole of what is there arrived in
 * it — and the tooltip says `(was 0)` so the convention is one hover from
 * visible rather than silently baked in.
 *
 * The raw move did not disappear; it moved into the tooltip. "+13 vs prev 30
 * days" is what the line used to be, and it is still the thing you want when a
 * percentage looks implausible, so it rides on the hover with the window it is
 * measured against.
 *
 * Two cases still say nothing at all:
 *
 *   - **No baseline** (a standing total like "block types in use"): no delta,
 *     because inventing one would be inventing a number.
 *   - **No movement**: the tile spends the line on its hint instead.
 */
export function deltaLabel(
  value: number,
  previous: number | undefined,
  comparedTo: string,
  format: (n: number) => string = (n) => n.toLocaleString(),
): { change: string; against: string } | null {
  if (previous === undefined) return null;
  const delta = value - previous;
  if (delta === 0) return null;

  const sign = delta > 0 ? "+" : "";
  // The absolute move, in the tile's own units, kept for the tooltip — a
  // percentage is what you scan, but it is not what you check.
  const moved = `${sign}${format(delta)} vs ${comparedTo}`;

  /*
    A first period is the whole of it.

    Dividing by zero gives Infinity and dividing by a negative flips the sign,
    so neither goes near the arithmetic: a zero baseline is answered by
    convention, and `Math.abs` makes the sign of the percentage follow the
    movement rather than the baseline it is measured from.
  */
  if (previous === 0) return { change: `${sign}100%`, against: `${moved} (was 0)` };

  const pct = Math.round((delta / Math.abs(previous)) * 1000) / 10;
  return { change: `${sign}${pct}%`, against: moved };
}
