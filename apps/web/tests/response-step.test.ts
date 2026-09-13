import { describe, expect, it } from "vitest";
import { planStep, positionInTable, type StepInput } from "@/components/builder/response-step";

/**
 * The table this is written against: 72 responses, 50 to a page. It is the
 * shape the bug was reported on and the one that breaks every off-by-one — page
 * one is full, page two is short, and the boundary between them is where the
 * detail panel used to stop dead at "50/50" with 22 responses still to go.
 */
const TABLE = { limit: 50, total: 72, canTurnPage: true } as const;

/** Page one of that table: rows 1–50, offset 0. */
const page1 = (index: number, delta: number): StepInput => ({
  ...TABLE,
  index,
  delta,
  rowCount: 50,
  offset: 0,
});

/** Page two: rows 51–72, so 22 rows at offset 50. */
const page2 = (index: number, delta: number): StepInput => ({
  ...TABLE,
  index,
  delta,
  rowCount: 22,
  offset: 50,
});

describe("planStep — inside a page", () => {
  it("walks forward a row at a time", () => {
    expect(planStep(page1(0, 1))).toEqual({ kind: "same-page", index: 1 });
    expect(planStep(page1(17, 1))).toEqual({ kind: "same-page", index: 18 });
  });

  it("walks back a row at a time", () => {
    expect(planStep(page1(18, -1))).toEqual({ kind: "same-page", index: 17 });
  });

  it("does nothing when no response is open", () => {
    expect(planStep(page1(-1, 1))).toEqual({ kind: "none" });
    expect(planStep(page1(-1, -1))).toEqual({ kind: "none" });
  });
});

describe("planStep — over the boundary", () => {
  /**
   * The reported bug, in one assertion. Response 50 is the last row of page one
   * and Next has to become a page turn, not a dead arrow.
   */
  it("turns the page forward off the last row of page one", () => {
    expect(planStep(page1(49, 1))).toEqual({ kind: "turn-page", offset: 50, edge: "first" });
  });

  it("turns the page back off the first row of page two, landing on its last row", () => {
    expect(planStep(page2(0, -1))).toEqual({ kind: "turn-page", offset: 0, edge: "last" });
  });

  /**
   * `edge: "last"` rather than an index, because the page being turned to has
   * not been fetched yet — the component resolves it against the rows when they
   * arrive. An index computed here would be guessing at a length it cannot see.
   */
  it("names an edge, not an index, for the page it is turning to", () => {
    const plan = planStep(page2(0, -1));
    expect(plan).not.toHaveProperty("index");
  });
});

describe("planStep — the ends of the table", () => {
  it("stops on the last row of the last page, short as it is", () => {
    // Row 72: index 21 of a 22-row page two. There is no page three.
    expect(planStep(page2(21, 1))).toEqual({ kind: "none" });
  });

  it("stops on the very first row", () => {
    expect(planStep(page1(0, -1))).toEqual({ kind: "none" });
  });

  /**
   * A table that fits on one page has no boundary to cross, and asking for
   * offset 50 of a 30-row table would fetch an empty page and strand the panel
   * on a response it could not replace.
   */
  it("stops at both ends of a single-page table", () => {
    const short = { limit: 50, total: 30, rowCount: 30, offset: 0, canTurnPage: true };
    expect(planStep({ ...short, index: 29, delta: 1 })).toEqual({ kind: "none" });
    expect(planStep({ ...short, index: 0, delta: -1 })).toEqual({ kind: "none" });
  });

  /** A table rendered without a pager steps within its rows and no further. */
  it("never turns a page it was not given a pager for", () => {
    expect(planStep({ ...page1(49, 1), canTurnPage: false })).toEqual({ kind: "none" });
    expect(planStep({ ...page1(4, 1), canTurnPage: false })).toEqual({ kind: "same-page", index: 5 });
  });
});

describe("planStep — the other page sizes", () => {
  /**
   * 25 and 100 are the other two choices in the rows-per-page control, and the
   * endpoint's own default is 50. All three have to cross the same way, or the
   * bug comes back the moment somebody changes the dropdown.
   */
  it("crosses at 25 a page", () => {
    const at25 = { limit: 25, total: 72, canTurnPage: true };
    expect(planStep({ ...at25, rowCount: 25, offset: 0, index: 24, delta: 1 })).toEqual({
      kind: "turn-page",
      offset: 25,
      edge: "first",
    });
    expect(planStep({ ...at25, rowCount: 25, offset: 25, index: 24, delta: 1 })).toEqual({
      kind: "turn-page",
      offset: 50,
      edge: "first",
    });
    // Page three is rows 51–72: 22 of them, and the end of the table.
    expect(planStep({ ...at25, rowCount: 22, offset: 50, index: 21, delta: 1 })).toEqual({
      kind: "none",
    });
  });

  it("has nothing to cross at 100 a page", () => {
    const at100 = { limit: 100, total: 72, rowCount: 72, offset: 0, canTurnPage: true };
    expect(planStep({ ...at100, index: 71, delta: 1 })).toEqual({ kind: "none" });
    expect(planStep({ ...at100, index: 70, delta: 1 })).toEqual({ kind: "same-page", index: 71 });
  });
});

describe("planStep — walking the whole table", () => {
  /**
   * The claim the feature makes, checked end to end rather than at its edges:
   * starting on the first response and pressing Next until it stops visits all
   * 72 exactly once, in order, and turns the page exactly once on the way.
   */
  it("reaches response 72 from response 1, turning the page once", () => {
    const pageOf = (offset: number) => Math.min(50, TABLE.total - offset);
    let offset = 0;
    let index = 0;
    const visited: number[] = [offset + index];
    let turns = 0;

    for (let guard = 0; guard < 200; guard++) {
      const plan = planStep({
        ...TABLE,
        index,
        delta: 1,
        rowCount: pageOf(offset),
        offset,
      });
      if (plan.kind === "none") break;
      if (plan.kind === "same-page") {
        index = plan.index;
      } else {
        turns++;
        offset = plan.offset;
        index = plan.edge === "first" ? 0 : pageOf(offset) - 1;
      }
      visited.push(offset + index);
    }

    expect(visited).toHaveLength(72);
    expect(visited[0]).toBe(0);
    expect(visited.at(-1)).toBe(71);
    expect(visited).toEqual([...Array(72).keys()]);
    expect(turns).toBe(1);
  });

  it("walks back from response 72 to response 1 the same way", () => {
    const pageOf = (offset: number) => Math.min(50, TABLE.total - offset);
    let offset = 50;
    let index = 21;
    const visited: number[] = [offset + index];

    for (let guard = 0; guard < 200; guard++) {
      const plan = planStep({
        ...TABLE,
        index,
        delta: -1,
        rowCount: pageOf(offset),
        offset,
      });
      if (plan.kind === "none") break;
      if (plan.kind === "same-page") {
        index = plan.index;
      } else {
        offset = plan.offset;
        index = plan.edge === "first" ? 0 : pageOf(offset) - 1;
      }
      visited.push(offset + index);
    }

    expect(visited).toHaveLength(72);
    expect(visited.at(-1)).toBe(0);
    expect(visited).toEqual([...Array(72).keys()].reverse());
  });
});

describe("positionInTable", () => {
  it("counts from the table, not from the page", () => {
    // Row 1 of page two is response 51 — displayed as 51/72 after the +1.
    expect(positionInTable({ index: 0, offset: 50, limit: 50, crossing: null })).toBe(50);
    expect(positionInTable({ index: 21, offset: 50, limit: 50, crossing: null })).toBe(71);
  });

  it("is -1 when nothing is open", () => {
    expect(positionInTable({ index: -1, offset: 50, limit: 50, crossing: null })).toBe(-1);
  });

  /**
   * Mid-turn the rows on screen are still the old page while the offset is
   * already the new one. Adding them would read 100 on a table of 72 — a
   * counter that is briefly impossible, on the exact press this feature exists
   * to make work.
   */
  it("reads the destination while a page is being turned forward", () => {
    expect(
      positionInTable({
        index: 49,
        offset: 50,
        limit: 50,
        crossing: { offset: 50, edge: "first" },
      }),
    ).toBe(50);
  });

  it("reads the last row of the page behind when turning back", () => {
    expect(
      positionInTable({
        index: 0,
        offset: 0,
        limit: 50,
        crossing: { offset: 0, edge: "last" },
      }),
    ).toBe(49);
  });

  it("never exceeds the total it is displayed against", () => {
    const shown = positionInTable({
      index: 49,
      offset: 50,
      limit: 50,
      crossing: { offset: 50, edge: "first" },
    });
    expect(shown + 1).toBeLessThanOrEqual(72);
  });
});
