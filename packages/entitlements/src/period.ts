/**
 * Usage periods.
 *
 * `YYYY-MM` in UTC on every plan. Anchoring to the subscription's
 * `current_period_start` is arguably more correct but materially harder to get right —
 * mid-cycle upgrades, 31st-of-the-month anchors, proration — and calendar months are
 * what the usage page shows and what people expect when they read "this month".
 * Deliberate, and revisited only if it generates support load.
 */

export function periodKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

/** Start of the month after `now`, in ms — when a monthly counter resets to zero. */
export function periodResetsAt(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0);
}

/** The previous period key, for month-over-month comparisons on the usage page. */
export function previousPeriodKey(now: number): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}
