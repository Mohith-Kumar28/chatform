import { describe, it, expect } from "vitest";
import { relativeDay, money, usd, compact } from "@/components/admin/format";

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
