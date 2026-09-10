import { describe, expect, it } from "vitest";
import { withoutSubmissions } from "@/components/builder/submissions-table";

/**
 * The cache write behind the optimistic delete.
 *
 * Deleting responses used to close the dialog and then leave the rows on
 * screen for the length of a mutation plus two refetches, still selected and
 * still offering to delete them again. They now come out of the query cache
 * first; this is the function that takes them out, and what it must not
 * disturb on the way.
 */

function payload(ids: string[], extra: Record<string, unknown> = {}) {
  return { submissions: ids.map((id) => ({ id, status: "completed" })), ...extra };
}

describe("withoutSubmissions", () => {
  it("removes exactly the ids it is given", () => {
    const next = withoutSubmissions(payload(["a", "b", "c"]), new Set(["a", "c"])) as {
      submissions: { id: string }[];
    };
    expect(next.submissions.map((s) => s.id)).toEqual(["b"]);
  });

  /**
   * `retiredColumns` rides in the same envelope and is what lets a deleted
   * question's answers keep rendering. Rebuilding the object around the
   * filtered list rather than spreading it would drop them, and the columns
   * would vanish from the table on an unrelated delete.
   */
  it("keeps everything else in the envelope", () => {
    const next = withoutSubmissions(payload(["a"], { retiredColumns: [{ ref: "q1" }] }), new Set(["a"])) as {
      submissions: unknown[];
      retiredColumns: unknown[];
    };
    expect(next.submissions).toEqual([]);
    expect(next.retiredColumns).toEqual([{ ref: "q1" }]);
  });

  it("does not mutate the snapshot it was handed", () => {
    // The snapshot is the rollback path; mutating it would make a failed
    // delete unrecoverable.
    const original = payload(["a", "b"]);
    const before = JSON.stringify(original);
    withoutSubmissions(original, new Set(["a"]));
    expect(JSON.stringify(original)).toBe(before);
  });

  it("leaves an unrecognised envelope untouched", () => {
    expect(withoutSubmissions(undefined, new Set(["a"]))).toBeUndefined();
    expect(withoutSubmissions({}, new Set(["a"]))).toEqual({});
    const odd = { unexpected: true };
    expect(withoutSubmissions(odd, new Set(["a"]))).toBe(odd);
  });

  /**
   * The counters the footer and the tab badges read.
   *
   * The list is paged, so "of 312" and "Completed 312" come from the server
   * rather than from the array; a delete that took rows out and left the
   * numbers alone would have the page insisting on responses it had just
   * removed until the refetch landed.
   */
  it("brings the totals down with the rows", () => {
    const next = withoutSubmissions(
      {
        submissions: [
          { id: "a", status: "completed" },
          { id: "b", status: "abandoned" },
          { id: "c", status: "completed" },
        ],
        total: 312,
        counts: { total: 312, completed: 300, partial: 12 },
      },
      new Set(["a", "b"]),
    ) as { total: number; counts: { total: number; completed: number; partial: number } };
    expect(next.total).toBe(310);
    expect(next.counts).toEqual({ total: 310, completed: 299, partial: 11 });
  });

  it("never counts a total below zero", () => {
    const next = withoutSubmissions(
      { submissions: [{ id: "a", status: "completed" }], total: 0, counts: { total: 0, completed: 0, partial: 0 } },
      new Set(["a"]),
    ) as { total: number; counts: { completed: number } };
    expect(next.total).toBe(0);
    expect(next.counts.completed).toBe(0);
  });

  it("leaves an envelope with no counters alone", () => {
    // The paramless cache entry, or a response from before the endpoint paged.
    const next = withoutSubmissions(payload(["a", "b"]), new Set(["a"])) as Record<string, unknown>;
    expect("total" in next).toBe(false);
    expect("counts" in next).toBe(false);
  });

  it("is a no-op for ids that are not there", () => {
    const next = withoutSubmissions(payload(["a", "b"]), new Set(["zzz"])) as {
      submissions: { id: string }[];
    };
    expect(next.submissions.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
