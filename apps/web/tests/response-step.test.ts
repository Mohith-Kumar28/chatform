import { describe, expect, it } from "vitest";
import {
  pageCount,
  pageNumber,
  pageStart,
  planJump,
  planStep,
  positionInTable,
  type PageView,
} from "@/components/builder/response-step";

/**
 * The table this is written against: 72 responses, 50 to a page. It is the
 * shape the bug was reported on and the one that breaks every off-by-one — page
 * one is full, page two is short, and the boundary between them is where the
 * detail panel used to stop dead at "50/50" with 22 responses still to go.
 */
const TOTAL = 72;
const LIMIT = 50;

/** The view of that table from whichever page holds `offset`. */
const at = (offset: number, limit = LIMIT, total = TOTAL): PageView => ({
  offset,
  limit,
  rowCount: Math.min(limit, total - offset),
  total,
  canTurnPage: true,
});

/** Page one: rows 1–50 at offset 0. Page two: rows 51–72, so 22 rows at offset 50. */
const page1 = at(0);
const page2 = at(50);

describe("page arithmetic", () => {
  it("finds the page a row is on", () => {
    expect(pageStart(0, 50)).toBe(0);
    expect(pageStart(49, 50)).toBe(0);
    expect(pageStart(50, 50)).toBe(50);
    expect(pageStart(71, 50)).toBe(50);
  });

  it("numbers pages from one", () => {
    expect(pageNumber(0, 50)).toBe(1);
    expect(pageNumber(49, 50)).toBe(1);
    expect(pageNumber(50, 50)).toBe(2);
  });

  it("counts a short final page", () => {
    expect(pageCount(72, 50)).toBe(2);
    expect(pageCount(100, 50)).toBe(2);
    expect(pageCount(101, 50)).toBe(3);
    expect(pageCount(72, 25)).toBe(3);
  });

  /** "1 of 1" has to read sanely on a form nobody has answered yet. */
  it("says one page for an empty table", () => {
    expect(pageCount(0, 50)).toBe(1);
  });
});

describe("planStep — inside a page", () => {
  it("walks forward a row at a time", () => {
    expect(planStep(0, 1, page1)).toEqual({ kind: "same-page", index: 1 });
    expect(planStep(17, 1, page1)).toEqual({ kind: "same-page", index: 18 });
  });

  it("walks back a row at a time", () => {
    expect(planStep(18, -1, page1)).toEqual({ kind: "same-page", index: 17 });
  });

  it("does nothing when no response is open", () => {
    expect(planStep(-1, 1, page1)).toEqual({ kind: "none" });
    expect(planStep(-1, -1, page1)).toEqual({ kind: "none" });
  });
});

describe("planStep — over the boundary", () => {
  /**
   * The reported bug, in one assertion. Response 50 is the last row of page one
   * and Next has to become a page turn, not a dead arrow.
   */
  it("turns the page forward off the last row of page one", () => {
    expect(planStep(49, 1, page1)).toEqual({ kind: "turn-page", offset: 50, want: 50 });
  });

  it("turns the page back off the first row of page two, landing on its last row", () => {
    expect(planStep(0, -1, page2)).toEqual({ kind: "turn-page", offset: 0, want: 49 });
  });

  /**
   * `want` is a table index, not an index into the page being fetched: that page
   * has not arrived, and on the last page its length is not `limit`. The
   * component subtracts the offset once the rows land.
   */
  it("names the target in table coordinates", () => {
    const plan = planStep(0, -1, page2);
    expect(plan).toMatchObject({ want: 49, offset: 0 });
  });
});

describe("planStep — the ends of the table", () => {
  it("stops on the last row of the last page, short as it is", () => {
    // Row 72: index 21 of a 22-row page two. There is no page three.
    expect(planStep(21, 1, page2)).toEqual({ kind: "none" });
  });

  it("stops on the very first row", () => {
    expect(planStep(0, -1, page1)).toEqual({ kind: "none" });
  });

  it("stops at both ends of a single-page table", () => {
    const short = at(0, 50, 30);
    expect(planStep(29, 1, short)).toEqual({ kind: "none" });
    expect(planStep(0, -1, short)).toEqual({ kind: "none" });
  });

  /** A table rendered without a pager steps within its rows and no further. */
  it("never turns a page it was not given a pager for", () => {
    const unpaged = { ...page1, canTurnPage: false };
    expect(planStep(49, 1, unpaged)).toEqual({ kind: "none" });
    expect(planStep(4, 1, unpaged)).toEqual({ kind: "same-page", index: 5 });
  });
});

describe("planStep — the other page sizes", () => {
  /**
   * 25 and 100 are the other two choices in the rows-per-page control, and the
   * endpoint's own default is 50. All three have to cross the same way, or the
   * bug comes back the moment somebody changes the dropdown.
   */
  it("crosses at 25 a page", () => {
    expect(planStep(24, 1, at(0, 25))).toEqual({ kind: "turn-page", offset: 25, want: 25 });
    expect(planStep(24, 1, at(25, 25))).toEqual({ kind: "turn-page", offset: 50, want: 50 });
    // Page three is rows 51–72: 22 of them, and the end of the table.
    expect(planStep(21, 1, at(50, 25))).toEqual({ kind: "none" });
  });

  it("has nothing to cross at 100 a page", () => {
    const at100 = at(0, 100);
    expect(planStep(71, 1, at100)).toEqual({ kind: "none" });
    expect(planStep(70, 1, at100)).toEqual({ kind: "same-page", index: 71 });
  });
});

describe("planJump — straight to a response", () => {
  /** Already here: no fetch, however far the number looks from the offset. */
  it("opens a response on this page without turning it", () => {
    expect(planJump(0, page1)).toEqual({ kind: "same-page", index: 0 });
    expect(planJump(49, page1)).toEqual({ kind: "same-page", index: 49 });
    expect(planJump(71, page2)).toEqual({ kind: "same-page", index: 21 });
  });

  it("turns to the page holding a response that is elsewhere", () => {
    expect(planJump(63, page1)).toEqual({ kind: "turn-page", offset: 50, want: 63 });
    expect(planJump(3, page2)).toEqual({ kind: "turn-page", offset: 0, want: 3 });
  });

  /**
   * Out of range is refused rather than clamped: someone who types 400 into a
   * table of 72 has the wrong table in mind, and landing them on 72 would answer
   * a question they did not ask.
   */
  it("refuses a response the table does not have", () => {
    expect(planJump(72, page1)).toEqual({ kind: "none" });
    expect(planJump(-1, page1)).toEqual({ kind: "none" });
    expect(planJump(5000, page1)).toEqual({ kind: "none" });
  });

  it("refuses a number that is not one", () => {
    expect(planJump(12.5, page1)).toEqual({ kind: "none" });
    expect(planJump(Number.NaN, page1)).toEqual({ kind: "none" });
    expect(planJump(Number.POSITIVE_INFINITY, page1)).toEqual({ kind: "none" });
  });

  it("reaches every response in the table from either page", () => {
    for (let i = 0; i < TOTAL; i++) {
      for (const view of [page1, page2]) {
        const plan = planJump(i, view);
        const landedOn =
          plan.kind === "same-page" ? view.offset + plan.index : plan.kind === "turn-page" ? plan.want : -1;
        expect(landedOn).toBe(i);
      }
    }
  });
});

describe("walking the whole table", () => {
  /**
   * The claim the feature makes, checked end to end rather than at its edges:
   * starting on the first response and pressing Next until it stops visits all
   * 72 exactly once, in order, and turns the page exactly once on the way.
   */
  it("reaches response 72 from response 1, turning the page once", () => {
    let offset = 0;
    let index = 0;
    const visited = [0];
    let turns = 0;

    for (let guard = 0; guard < 200; guard++) {
      const plan = planStep(index, 1, at(offset));
      if (plan.kind === "none") break;
      if (plan.kind === "same-page") {
        index = plan.index;
      } else {
        turns++;
        offset = plan.offset;
        index = plan.want - plan.offset;
      }
      visited.push(offset + index);
    }

    expect(visited).toEqual([...Array(72).keys()]);
    expect(turns).toBe(1);
  });

  it("walks back from response 72 to response 1 the same way", () => {
    let offset = 50;
    let index = 21;
    const visited = [71];

    for (let guard = 0; guard < 200; guard++) {
      const plan = planStep(index, -1, at(offset));
      if (plan.kind === "none") break;
      if (plan.kind === "same-page") {
        index = plan.index;
      } else {
        offset = plan.offset;
        index = plan.want - plan.offset;
      }
      visited.push(offset + index);
    }

    expect(visited).toEqual([...Array(72).keys()].reverse());
  });

  /** Three page turns at 25 a page, and still every response exactly once. */
  it("walks the whole table at 25 a page", () => {
    let offset = 0;
    let index = 0;
    const visited = [0];
    let turns = 0;

    for (let guard = 0; guard < 200; guard++) {
      const plan = planStep(index, 1, at(offset, 25));
      if (plan.kind === "none") break;
      if (plan.kind === "same-page") {
        index = plan.index;
      } else {
        turns++;
        offset = plan.offset;
        index = plan.want - plan.offset;
      }
      visited.push(offset + index);
    }

    expect(visited).toEqual([...Array(72).keys()]);
    expect(turns).toBe(2);
  });
});

describe("positionInTable", () => {
  it("counts from the table, not from the page", () => {
    // Row 1 of page two is response 51 — displayed as 51/72 after the +1.
    expect(positionInTable({ index: 0, offset: 50, crossing: null })).toBe(50);
    expect(positionInTable({ index: 21, offset: 50, crossing: null })).toBe(71);
  });

  it("is -1 when nothing is open", () => {
    expect(positionInTable({ index: -1, offset: 50, crossing: null })).toBe(-1);
  });

  /**
   * Mid-turn the rows on screen are still the old page while the offset is
   * already the new one. Adding them would read 100 on a table of 72 — a
   * counter that is briefly impossible, on the exact press this feature exists
   * to make work.
   */
  it("reads the destination while a page is being turned", () => {
    expect(positionInTable({ index: 49, offset: 50, crossing: { offset: 50, want: 50 } })).toBe(50);
    expect(positionInTable({ index: 0, offset: 0, crossing: { offset: 0, want: 49 } })).toBe(49);
  });

  /** Including a jump, which may be many pages from where the rows still are. */
  it("reads the destination of a long jump", () => {
    expect(positionInTable({ index: 3, offset: 0, crossing: { offset: 50, want: 63 } })).toBe(63);
  });

  it("never exceeds the total it is displayed against", () => {
    const shown = positionInTable({ index: 49, offset: 50, crossing: { offset: 50, want: 50 } });
    expect(shown + 1).toBeLessThanOrEqual(72);
  });
});
