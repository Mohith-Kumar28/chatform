/**
 * Stepping through responses with the arrows, across page boundaries.
 *
 * The results table is paginated — 25, 50 or 100 rows of a table that may hold
 * thousands — and the detail panel over it has a Previous/Next pair that walks
 * the responses one at a time. Those two facts were not talking to each other:
 * the panel stepped through the *array it had been handed*, which is one page,
 * so on a form with 72 responses at 50 a page it counted "50/50" and greyed out
 * Next on the fiftieth. The remaining 22 were reachable only by closing the
 * panel, turning the page by hand, and opening one.
 *
 * The arithmetic lives here rather than in the component because it is the part
 * that is easy to get quietly wrong — the last page is short, the first page has
 * nothing behind it, and the count in the corner has to stay honest through the
 * round trip that turns the page. None of that needs React to be checked.
 */

/** Which end of the page being turned to the reader is arriving at. */
export type PageEdge = "first" | "last";

/** What a press of an arrow should do. */
export type StepPlan =
  /** Still on this page: open the row at this index within it. */
  | { kind: "same-page"; index: number }
  /** Off the edge: ask for this page, then open the row at `edge` of it. */
  | { kind: "turn-page"; offset: number; edge: PageEdge }
  /** The end of the table, or nothing open. The arrow should be disabled. */
  | { kind: "none" };

export interface StepInput {
  /** Where the open response sits *within the page*, or -1 when none is open. */
  index: number;
  /** -1 for Previous, 1 for Next. */
  delta: number;
  /** How many rows this page actually has — shorter than `limit` on the last one. */
  rowCount: number;
  /** The page's first row, as an index into the whole table. */
  offset: number;
  /** Rows per page. */
  limit: number;
  /** How many responses the current status filter matches, page aside. */
  total: number;
  /** False when the table is rendered without a pager and one page is all there is. */
  canTurnPage: boolean;
}

/**
 * One step, in table coordinates.
 *
 * Inside the page it is an index change. At either edge it becomes a page turn —
 * but only towards a page that exists: `target >= total` is what stops Next on
 * the last row of a short final page, and `target < 0` is what stops Previous on
 * the first row of the first.
 */
export function planStep({
  index,
  delta,
  rowCount,
  offset,
  limit,
  total,
  canTurnPage,
}: StepInput): StepPlan {
  if (index < 0 || delta === 0) return { kind: "none" };

  const within = index + delta;
  if (within >= 0 && within < rowCount) return { kind: "same-page", index: within };

  if (!canTurnPage || limit <= 0) return { kind: "none" };

  const forward = delta > 0;
  const target = forward ? offset + limit : offset - limit;
  if (target < 0 || target >= total) return { kind: "none" };

  return { kind: "turn-page", offset: target, edge: forward ? "first" : "last" };
}

export interface PositionInput {
  /** Where the open response sits within the page, or -1. */
  index: number;
  /** The page's first row, as an index into the whole table. */
  offset: number;
  /** Rows per page. */
  limit: number;
  /** A page turn in flight, from a `turn-page` plan that has not landed yet. */
  crossing: { offset: number; edge: PageEdge } | null;
}

/**
 * What the "51/72" counter reads, including mid-turn.
 *
 * While a page is being turned the two halves of the sum disagree: the rows on
 * screen are still the old page (the query keeps them there rather than blanking
 * the table), while the offset is already the new one. Adding them would flash
 * `50 + 49 = "100/72"` for the length of the round trip.
 *
 * So during a turn the position comes from the destination instead, which is
 * known the moment the arrow is pressed: the first row of the page ahead, or the
 * last of the page behind — and a page behind is always a full one, being an
 * earlier page of the same table.
 *
 * Returns a zero-based index into the table, or -1 when nothing is open.
 */
export function positionInTable({ index, offset, limit, crossing }: PositionInput): number {
  if (crossing) {
    return crossing.edge === "first" ? crossing.offset : crossing.offset + limit - 1;
  }
  return index >= 0 ? offset + index : -1;
}
