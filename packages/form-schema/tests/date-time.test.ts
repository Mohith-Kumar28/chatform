import { describe, expect, it } from "vitest";
import { Block, validateAnswer, zonedToUtc } from "../src/index";

/**
 * A date block can also collect a time, which is what turns "when shall we
 * meet?" into an appointment. The answer is stored as the one UTC moment the
 * respondent meant, and the date half keeps every rule it had. The form's time
 * window is checked on the respondent's own clock: it is the clock they saw.
 */
describe("date blocks that also collect a time", () => {
  const timed = (extra: Record<string, unknown> = {}) =>
    Block.parse({
      id: "blk_00000001", ref: "q_when", type: "date", title: "When?",
      includeTime: true, timeMin: "09:00", timeMax: "17:00", ...extra,
    });

  it("stores a time on the respondent's clock as the UTC moment it names", () => {
    const r = validateAnswer(timed(), "2026-10-01T14:30", { timeZone: "Asia/Kolkata" });
    expect(r.ok).toBe(true);
    expect(r.value).toBe("2026-10-01T09:00:00.000Z");
    expect(validateAnswer(timed(), "2026-10-01T14:30", { timeZone: "America/New_York" }).value).toBe(
      "2026-10-01T18:30:00.000Z",
    );
  });

  it("takes the composer's offset as the clock the slot was picked on", () => {
    // 16:30 on the clock it was picked on, inside 09:00 to 17:00, stored as 11:00 UTC.
    const r = validateAnswer(timed(), "2026-10-01T16:30+05:30");
    expect(r.value).toBe("2026-10-01T11:00:00.000Z");
  });

  it("reads a stored UTC moment back on the respondent's clock, so it validates again", () => {
    const r = validateAnswer(timed(), "2026-10-01T09:00:00.000Z", { timeZone: "Asia/Kolkata" });
    expect(r.ok).toBe(true);
    expect(r.value).toBe("2026-10-01T09:00:00.000Z");
  });

  it("reads a zoneless time as UTC when the respondent's zone is unknown", () => {
    expect(validateAnswer(timed(), "2026-10-01T14:30").value).toBe("2026-10-01T14:30:00.000Z");
  });

  it("asks for the time when only a date arrives", () => {
    const r = validateAnswer(timed(), "2026-10-01");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("invalid_time");
    // The hint reaches a person, through the agent: no machine format in it.
    expect(r.hint).not.toMatch(/\d{4}-\d{2}/);
  });

  it("refuses a time outside the window the form offers, on the respondent's clock", () => {
    expect(validateAnswer(timed(), "2026-10-01T08:00").code).toBe("time_out_of_range");
    expect(validateAnswer(timed(), "2026-10-01T19:00").code).toBe("time_out_of_range");
    // 14:00 UTC is 19:30 in India: outside the window there.
    expect(validateAnswer(timed(), "2026-10-01T14:00:00.000Z", { timeZone: "Asia/Kolkata" }).code).toBe(
      "time_out_of_range",
    );
  });

  it("refuses a time that is not a time", () => {
    expect(validateAnswer(timed(), "2026-10-01T25:99").code).toBe("invalid_time");
  });

  it("still applies the date bounds", () => {
    const block = timed({ min: "2026-10-05" });
    expect(validateAnswer(block, "2026-10-01T14:30").code).toBe("too_early");
  });

  it("refuses a moment already gone when past dates are off", () => {
    const block = timed({ disablePast: true, timeMin: "00:00", timeMax: "23:59" });
    expect(validateAnswer(block, "2020-01-01T10:00").code).toBe("past_date");
  });

  it("leaves a plain date block storing a plain date", () => {
    const block = Block.parse({ id: "blk_00000002", ref: "q_d", type: "date", title: "When?" });
    expect(validateAnswer(block, "2026-10-01").value).toBe("2026-10-01");
    // A time on a block that never asked for one is a mistake, not a bonus.
    expect(validateAnswer(block, "2026-10-01T14:30").ok).toBe(false);
  });
});

describe("wall time to UTC across daylight saving", () => {
  it("uses the offset in force on that day", () => {
    // New York: EDT (-4) in July, EST (-5) in January.
    expect(new Date(zonedToUtc({ date: "2026-07-01", time: "09:00" }, "America/New_York")).toISOString()).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(new Date(zonedToUtc({ date: "2026-01-15", time: "09:00" }, "America/New_York")).toISOString()).toBe(
      "2026-01-15T14:00:00.000Z",
    );
  });

  it("lands on the right side of a change made that same day", () => {
    // Clocks went back at 02:00 on 1 Nov 2026 in New York; 09:00 is EST.
    expect(new Date(zonedToUtc({ date: "2026-11-01", time: "09:00" }, "America/New_York")).toISOString()).toBe(
      "2026-11-01T14:00:00.000Z",
    );
  });
});
