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
 * A timestamp as a distance: `today`, `3d ago`, `14 Aug`.
 *
 * Recent things get a distance because that is how they are reasoned about
 * ("failed yesterday"); anything past a fortnight gets a date, because "47d ago"
 * is a number you have to do arithmetic on.
 */
export function relativeDay(ms: number | null | undefined): string {
  if (!ms) return "never";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d ago`;
  const d = new Date(ms);
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}${year}`;
}
