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
