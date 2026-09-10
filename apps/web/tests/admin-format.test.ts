import { describe, it, expect } from "vitest";
import { deltaLabel, relativeDay, money, usd, compact } from "@/components/admin/format";

const DAY = 86_400_000;

/**
 * `relativeDay` is used for both directions — when a payment failed, and when a
 * subscription renews — and the first version only handled the past, flooring
 * every future date to "today". A grace period ending on Friday read as already
 * over. These are the cases that were wrong.
 */
describe("relativeDay", () => {
  it("reads forwards as well as backwards", () => {
    expect(relativeDay(Date.now() + 3 * DAY)).toBe("in 3d");
    expect(relativeDay(Date.now() - 3 * DAY)).toBe("3d ago");
    expect(relativeDay(Date.now() + DAY)).toBe("tomorrow");
    expect(relativeDay(Date.now() - DAY)).toBe("yesterday");
    expect(relativeDay(Date.now())).toBe("today");
  });

  it("falls back to a date beyond a fortnight, either way", () => {
    // Far enough out that a day count stops being readable.
    expect(relativeDay(Date.now() + 40 * DAY)).toMatch(/^\d{1,2} \w{3}/);
    expect(relativeDay(Date.now() - 40 * DAY)).toMatch(/^\d{1,2} \w{3}/);
  });

  it("says never rather than inventing a date", () => {
    expect(relativeDay(null)).toBe("never");
    expect(relativeDay(0)).toBe("never");
    expect(relativeDay(undefined)).toBe("never");
  });
});

describe("money formatting", () => {
  it("renders cents as whole dollars", () => {
    expect(money(2400)).toBe("$24");
    expect(money(66000)).toBe("$660");
    expect(money(0)).toBe("$0");
  });

  /** A sub-cent AI call must not round away to "$0" and read as free. */
  it("keeps tiny AI costs visible", () => {
    expect(usd(0)).toBe("$0");
    expect(usd(25_272)).toBe("$0.03");
    expect(usd(1_404)).toBe("$0.0014");
  });

  it("compacts large counts", () => {
    expect(compact(61_306)).toBe("61.3K");
    expect(compact(42)).toBe("42");
  });
});

/**
 * The tile used to read "new vs previous" on a zero baseline — two half-written
 * comparisons run together, naming neither the thing that is new nor the period
 * being compared against. These are the four cases it has to get right.
 */
describe("deltaLabel", () => {
  it("says nothing when there is no baseline to compare against", () => {
    expect(deltaLabel(26, undefined, "prev 30 days")).toBeNull();
  });

  it("says nothing when the number has not moved", () => {
    expect(deltaLabel(12, 12, "prev 30 days")).toBeNull();
  });

  /*
    Every line on the row is a percentage, including the first period.

    This used to print the raw move against a zero baseline, on the grounds
    that a percentage of nothing is invented. It is — but the console's whole
    top row sits at a zero baseline until the product has two periods of
    history, so the exception was the rule, and each of those tiles printed the
    number already set above it in larger type instead of a growth figure.
  */
  it("counts a first period as the whole of it", () => {
    expect(deltaLabel(3, 0, "prev 30 days")?.change).toBe("+100%");
    expect(deltaLabel(13, 0, "prev 30 days")?.change).toBe("+100%");
  });

  it("keeps the raw move and the zero baseline on the tooltip", () => {
    // The percentage is what you scan; the move is what you check it against,
    // and "(was 0)" is what stops +100% reading as arithmetic it is not.
    expect(deltaLabel(13, 0, "prev 30 days")?.against).toBe("+13 vs prev 30 days (was 0)");
  });

  it("reads the same kind of figure whatever the baseline", () => {
    // The bug this replaces: "+3" beside "+50%" on the same row, differing by
    // a baseline the reader cannot see.
    expect(deltaLabel(3, 0, "yesterday")?.change).toMatch(/%$/);
    expect(deltaLabel(3, 2, "yesterday")?.change).toMatch(/%$/);
  });

  it("puts the move in the tile's own units on the tooltip", () => {
    expect(deltaLabel(10_900, 0, "prev 30 days", money)).toEqual({
      change: "+100%",
      against: "+$109 vs prev 30 days (was 0)",
    });
  });

  it("names the window it is comparing against", () => {
    expect(deltaLabel(120, 100, "prev 30 days")).toEqual({ change: "+20%", against: "+20 vs prev 30 days" });
    expect(deltaLabel(80, 100, "yesterday")).toEqual({ change: "-20%", against: "-20 vs yesterday" });
  });

  it("lets growth past doubling read as more than 100%", () => {
    // The zero-baseline convention caps at +100%; a real baseline must not.
    expect(deltaLabel(13, 1, "prev 30 days")?.change).toBe("+1200%");
  });
});
