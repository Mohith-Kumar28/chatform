/**
 * Moving around the responses of a paginated table.
 *
 * The results table is paginated — 25, 50 or 100 rows of a table that may hold
 * thousands — and the detail panel over it walks the responses one at a time.
 * Those two facts were not talking to each other: the panel stepped through the
 * *array it had been handed*, which is one page, so on a form with 72 responses
 * at 50 a page it counted "50/50" and greyed out Next on the fiftieth. The other
 * 22 were reachable only by closing the panel, turning the page by hand, and
 * opening one.
 *
 * Everything here is in **table coordinates**: a response is identified by its
 * index into the whole filtered table, not into the page on screen. That is the
 * one idea that makes a step and a jump the same operation — "open response 63"
 * does not care whether 63 is on this page, and neither does "open the next
 * one".
 *
 * The arithmetic lives here rather than in the component because it is the part
 * that is easy to get quietly wrong — the last page is short, the first page has
 * nothing behind it, a typed page number can be anything — and none of it needs
 * React to be checked.
 */

/** What a move should do. */
export type StepPlan =
  /** Already on this page: open the row at this index *within the page*. */
  | { kind: "same-page"; index: number }
  /**
   * Somewhere else: ask for the page at `offset`, then open table row `want`.
   *
   * `want` is a table index rather than an index into the page being fetched,
   * because the page has not arrived yet — its length is not known here, and on
   * the last page it is not `limit`. The component subtracts the offset once the
   * rows land.
   */
  | { kind: "turn-page"; offset: number; want: number }
  /** Outside the table, or nothing open. The control should be disabled. */
  | { kind: "none" };

/** Where the table is, as far as any of this is concerned. */
export interface PageView {
  /** The page's first row, as an index into the whole table. */
  offset: number;
  /** Rows per page. */
  limit: number;
  /** How many rows this page actually has — shorter than `limit` on the last one. */
  rowCount: number;
  /** How many responses the current status filter matches, page aside. */
  total: number;
  /** False when the table is rendered without a pager and one page is all there is. */
  canTurnPage: boolean;
}

/** The first row of the page holding table row `index`. */
export function pageStart(index: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.floor(index / limit) * limit;
}

/** Which page, one-based, table row `index` falls on. */
export function pageNumber(index: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.floor(index / limit) + 1;
}

/** How many pages the table has. Always at least one, so "1 of 1" reads sanely. */
export function pageCount(total: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.max(1, Math.ceil(total / limit));
}

/**
 * Open a response by its place in the table.
 *
 * The one entry point: `planStep` is this with the target worked out from a
 * direction. Rows on the current page open without a fetch even when a page
 * turn would have landed on the same row, which is what keeps a typed page
 * number that resolves to where we already are from costing a round trip.
 */
export function planJump(want: number, view: PageView): StepPlan {
  const { offset, limit, rowCount, total, canTurnPage } = view;
  if (!Number.isInteger(want) || want < 0 || want >= total) return { kind: "none" };

  if (want >= offset && want < offset + rowCount) return { kind: "same-page", index: want - offset };

  if (!canTurnPage || limit <= 0) return { kind: "none" };
  return { kind: "turn-page", offset: pageStart(want, limit), want };
}

/**
 * One step from where we are.
 *
 * `index` is the open response's position *within the page* — which is what the
 * component has, having found it by id in the rows it was handed — so the table
 * coordinate is `offset + index`. Off either end of the table this is `none`,
 * which is what the disabled arrows already say.
 */
export function planStep(index: number, delta: number, view: PageView): StepPlan {
  if (index < 0 || !Number.isInteger(delta) || delta === 0) return { kind: "none" };
  return planJump(view.offset + index + delta, view);
}

/**
 * What the "51/72" counter reads, including mid-turn.
 *
 * While a page is being turned the two halves of the sum disagree: the rows on
 * screen are still the old page (the query keeps them there rather than blanking
 * the table), while the offset is already the new one. Adding them would flash
 * `50 + 49 = "100/72"` for the length of the round trip.
 *
 * A turn in flight already knows where it is going, so during one the answer is
 * simply its destination.
 *
 * Returns a table index, or -1 when nothing is open.
 */
export function positionInTable({
  index,
  offset,
  crossing,
}: {
  /** Where the open response sits within the page, or -1. */
  index: number;
  /** The page's first row, as an index into the whole table. */
  offset: number;
  /** A turn in flight, from a `turn-page` plan that has not landed yet. */
  crossing: { offset: number; want: number } | null;
}): number {
  if (crossing) return crossing.want;
  return index >= 0 ? offset + index : -1;
}
