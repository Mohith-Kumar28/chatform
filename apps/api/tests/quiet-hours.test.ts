import { describe, expect, it } from "vitest";
import {
  QUIET_END_HOUR,
  QUIET_MIN_SPACING_MS,
  QUIET_START_HOUR,
  canonicalZone,
  inWindow,
  partsIn,
  resolveZone,
  shiftIntoWindow,
} from "../src/lib/quiet-hours.js";

/**
 * The arithmetic behind "not in the middle of their night".
 *
 * Run in the Workers pool rather than in Node, and deliberately so: the
 * question these tests answer is what `workerd` does with `Intl`, not what the
 * V8 on a developer's laptop does. `apps/api` had no `Intl` usage at all before
 * this module, so the first case below is a go/no-go on the whole feature —
 * a runtime shipped without the timezone database would fail it and every
 * expectation after it would be meaningless.
 *
 * Times are asserted as exact epoch milliseconds wherever daylight saving is
 * involved. An assertion like "the hour is 9" passes just as happily when the
 * date is a day out, which is the failure this module is most likely to have.
 */

/** 2026-06-15T12:00:00Z — a northern summer afternoon, no transition near it. */
const SUMMER = Date.UTC(2026, 5, 15, 12, 0, 0);

describe("ICU availability", () => {
  it("carries the timezone database", () => {
    // If this fails, nothing else in this file means anything: workerd would be
    // resolving every zone to UTC rather than refusing it, and every reminder
    // would be held against the wrong clock without a single error.
    expect(partsIn("Asia/Kolkata", Date.UTC(2026, 0, 1, 0, 0))).toMatchObject({
      year: 2026,
      month: 1,
      day: 1,
      hour: 5,
      minute: 30,
    });
  });

  it("reads midnight as hour zero, not twenty-four", () => {
    // The `hour12: false` trap. A zone reading "24:00" would push every date
    // derived from it a day forward.
    expect(partsIn("UTC", Date.UTC(2026, 5, 15, 0, 30)).hour).toBe(0);
    expect(partsIn("Asia/Kolkata", Date.UTC(2026, 5, 14, 18, 30)).hour).toBe(0);
  });
});

describe("canonicalZone", () => {
  /**
   * Both spellings collapse to one value — and deliberately not to a named one.
   *
   * workerd's ICU canonicalises `Asia/Kolkata` *to* `Asia/Calcutta`, which is
   * the opposite direction from the browsers that will be sending us these
   * strings. That is fine and it is why nothing stores a hardcoded zone name:
   * every read goes back through `canonicalZone` on the same runtime, so a
   * value written under one spelling still resolves years later. Asserting the
   * literal would be asserting a property of this month's ICU build.
   */
  it("collapses a legacy alias and its modern spelling onto one value", () => {
    const alias = canonicalZone("Asia/Calcutta");
    expect(alias).toBeTruthy();
    expect(canonicalZone("Asia/Kolkata")).toBe(alias);
  });

  it("accepts the zones we actually see", () => {
    for (const zone of ["UTC", "Asia/Kolkata", "America/New_York", "Australia/Lord_Howe"]) {
      expect(canonicalZone(zone)).toBeTruthy();
    }
  });

  it("refuses anything that is not a zone", () => {
    for (const junk of [
      "",
      null,
      undefined,
      "Mars/Olympus",
      "+05:30",
      "-0500",
      "'; DROP TABLE forms --",
      "a".repeat(200),
      "../../etc/passwd",
    ]) {
      expect(canonicalZone(junk)).toBeNull();
    }
  });
});

describe("resolveZone", () => {
  it("prefers the respondent, then the form, then UTC", () => {
    expect(resolveZone("America/New_York", "Asia/Kolkata")).toBe("America/New_York");
    expect(resolveZone(null, "Asia/Kolkata")).toBe(canonicalZone("Asia/Kolkata"));
    expect(resolveZone(null, null)).toBe("UTC");
  });

  it("falls through a zone it cannot read rather than throwing", () => {
    expect(resolveZone("Mars/Olympus", "Asia/Kolkata")).toBe(canonicalZone("Asia/Kolkata"));
    expect(resolveZone("Mars/Olympus", "Also/Nonsense")).toBe("UTC");
  });
});

describe("shiftIntoWindow", () => {
  it("leaves the middle of the day alone", () => {
    for (const zone of ["UTC", "Asia/Kolkata", "America/New_York"]) {
      const at = Date.UTC(2026, 5, 15, 12, 0) - 0;
      const local = partsIn(zone, at);
      if (local.hour >= QUIET_END_HOUR && local.hour < QUIET_START_HOUR) {
        expect(shiftIntoWindow(at, zone)).toBe(at);
      }
    }
  });

  it("holds the boundaries exactly", () => {
    // 20:59 UTC is the last minute that sends; 21:00 is the first that waits.
    expect(shiftIntoWindow(Date.UTC(2026, 5, 15, 20, 59), "UTC")).toBe(
      Date.UTC(2026, 5, 15, 20, 59),
    );
    expect(shiftIntoWindow(Date.UTC(2026, 5, 15, 21, 0), "UTC")).toBe(Date.UTC(2026, 5, 16, 9, 0));
    // 08:59 waits for this morning, not tomorrow's.
    expect(shiftIntoWindow(Date.UTC(2026, 5, 15, 8, 59), "UTC")).toBe(Date.UTC(2026, 5, 15, 9, 0));
    expect(shiftIntoWindow(Date.UTC(2026, 5, 15, 9, 0), "UTC")).toBe(Date.UTC(2026, 5, 15, 9, 0));
  });

  it("does not drift on a sub-second remainder", () => {
    const at = Date.UTC(2026, 5, 15, 23, 0);
    expect(shiftIntoWindow(at + 999, "Asia/Kolkata")).toBe(shiftIntoWindow(at, "Asia/Kolkata"));
  });

  it("rolls over a month, a year and a leap day", () => {
    expect(shiftIntoWindow(Date.UTC(2026, 0, 31, 22, 0), "UTC")).toBe(Date.UTC(2026, 1, 1, 9, 0));
    expect(shiftIntoWindow(Date.UTC(2026, 11, 31, 23, 0), "UTC")).toBe(Date.UTC(2027, 0, 1, 9, 0));
    expect(shiftIntoWindow(Date.UTC(2028, 1, 28, 22, 0), "UTC")).toBe(Date.UTC(2028, 1, 29, 9, 0));
  });

  /**
   * The daylight-saving cases, each asserted to the millisecond.
   *
   * These are the ones a "just add a day" implementation gets wrong, and it
   * gets them wrong by exactly one hour — small enough to look like a rounding
   * quirk in a log and large enough to put mail outside the window it was held
   * for.
   */
  it("crosses a spring-forward night", () => {
    // 2027-03-13 23:00 EST (-5) → 2027-03-14 09:00 EDT (-4), the morning the
    // clocks went forward.
    expect(shiftIntoWindow(Date.UTC(2027, 2, 14, 4, 0), "America/New_York")).toBe(
      Date.UTC(2027, 2, 14, 13, 0),
    );
  });

  it("crosses a fall-back night", () => {
    // 2027-11-06 23:00 EDT (-4) → 2027-11-07 09:00 EST (-5).
    expect(shiftIntoWindow(Date.UTC(2027, 10, 7, 3, 0), "America/New_York")).toBe(
      Date.UTC(2027, 10, 7, 14, 0),
    );
  });

  it("crosses a southern-hemisphere transition", () => {
    // 2027-10-02 23:00 AEST (+10) → 2027-10-03 09:00 AEDT (+11).
    expect(shiftIntoWindow(Date.UTC(2027, 9, 2, 13, 0), "Australia/Sydney")).toBe(
      Date.UTC(2027, 9, 2, 22, 0),
    );
  });

  it("handles a half-hour offset", () => {
    // 2026-06-15 22:00 IST → 2026-06-16 09:00 IST = 03:30Z.
    expect(shiftIntoWindow(Date.UTC(2026, 5, 15, 16, 30), "Asia/Kolkata")).toBe(
      Date.UTC(2026, 5, 16, 3, 30),
    );
  });

  it("handles three-quarter-hour offsets", () => {
    // Kathmandu, +5:45 year round. 22:00 NPT → next 09:00 NPT = 03:15Z.
    expect(shiftIntoWindow(Date.UTC(2026, 5, 15, 16, 15), "Asia/Kathmandu")).toBe(
      Date.UTC(2026, 5, 16, 3, 15),
    );
    // Chatham, +12:45 in the southern winter. 22:00 → next 09:00 = 20:15Z the
    // previous UTC day, which is the case a UTC-shaped implementation mangles.
    expect(shiftIntoWindow(Date.UTC(2026, 5, 15, 9, 15), "Pacific/Chatham")).toBe(
      Date.UTC(2026, 5, 15, 20, 15),
    );
  });

  it("handles a thirty-minute daylight saving shift", () => {
    // Lord Howe moves by half an hour, not a whole one — the case that catches
    // any implementation assuming DST is always ±60 minutes.
    // 2027-10-02 23:00 (+10:30) → 2027-10-03 09:00 (+11).
    expect(shiftIntoWindow(Date.UTC(2027, 9, 2, 12, 30), "Australia/Lord_Howe")).toBe(
      Date.UTC(2027, 9, 2, 22, 0),
    );
    // 2027-04-03 23:00 (+11) → 2027-04-04 09:00 (+10:30).
    expect(shiftIntoWindow(Date.UTC(2027, 3, 3, 12, 0), "Australia/Lord_Howe")).toBe(
      Date.UTC(2027, 3, 3, 22, 30),
    );
  });

  /**
   * The test that catches whatever the cases above did not think of.
   *
   * Two properties, over a year of instants in a spread of zones: the answer is
   * never earlier than the question, and the answer is always inside the
   * window. Everything else about this module is a detail; these two are the
   * contract `followups.ts` relies on.
   */
  it("never moves backwards and always lands inside the window", () => {
    const zones = [
      "UTC",
      "Asia/Kolkata",
      "Asia/Kathmandu",
      "America/New_York",
      "America/Santiago",
      "Europe/London",
      "Australia/Sydney",
      "Australia/Lord_Howe",
      "Pacific/Chatham",
      "Pacific/Apia",
    ];
    const start = Date.UTC(2026, 0, 1, 0, 0);
    const step = 6 * 3_600_000;
    for (const zone of zones) {
      for (let at = start; at < start + 365 * 86_400_000; at += step) {
        const out = shiftIntoWindow(at, zone);
        expect(out).toBeGreaterThanOrEqual(at);
        const hour = partsIn(zone, out).hour;
        expect(hour).toBeGreaterThanOrEqual(QUIET_END_HOUR);
        expect(hour).toBeLessThan(QUIET_START_HOUR);
      }
    }
  });

  it("is a fixpoint for a time already pushed inside the window", () => {
    // The property the spacing rule in `scheduleOne` leans on: pushing a held
    // step two hours later cannot drag it back out of the window, so one extra
    // shift settles it rather than starting an argument.
    const nine = shiftIntoWindow(Date.UTC(2026, 5, 15, 23, 0), "Asia/Kolkata");
    const eleven = nine + QUIET_MIN_SPACING_MS;
    expect(shiftIntoWindow(eleven, "Asia/Kolkata")).toBe(eleven);
    expect(inWindow(eleven, "Asia/Kolkata")).toBe(true);
  });
});

describe("inWindow", () => {
  it("agrees with the shift", () => {
    for (const zone of ["UTC", "Asia/Kolkata", "America/New_York"]) {
      for (let h = 0; h < 24; h += 1) {
        const at = SUMMER - (SUMMER % 86_400_000) + h * 3_600_000;
        expect(inWindow(at, zone)).toBe(shiftIntoWindow(at, zone) === at);
      }
    }
  });
});
