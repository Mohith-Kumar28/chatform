/**
 * Dates, times and durations, in one place.
 *
 * Two rules, both learned from the results table.
 *
 * The clock is 24-hour, always. `toLocaleString` with no `hour12` follows the
 * viewer's locale, so the same response read "1:41 pm" for one person and
 * "13:41" for another, and a table of timestamps in a product used across time
 * zones is exactly where that ambiguity costs something. The date still follows
 * the locale — the order of day and month is a genuine convention; a twelve-hour
 * clock in a data table is not.
 *
 * And a duration is said the way a person would say it. "took 2389s" is a
 * number nobody converts in their head.
 */

const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };

/** "7 Sept 2026, 13:41" — the full stamp, for a detail view. */
export function formatDateTime(ts: number | string | Date): string {
  return new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", ...TIME });
}

/** "7 Sept, 13:41" — the same moment, for a table cell. */
export function formatShortDateTime(ts: number | string | Date): string {
  return new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", ...TIME });
}

/** "13:41" — when the date is already known from context. */
export function formatTime(ts: number | string | Date): string {
  return new Date(ts).toLocaleTimeString(undefined, TIME);
}

/** Seconds, minutes and hours, the way a person would say them. */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 === 0 ? `${m}m` : `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}

/** "3 hours ago", "in 2 days" — relative, for a stamp that is also shown in full. */
export function formatRelative(at: number | string | Date): string {
  const diff = new Date(at).getTime() - Date.now();
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, span] of units) {
    if (Math.abs(diff) >= span) return fmt.format(Math.round(diff / span), unit);
  }
  return fmt.format(0, "minute");
}
