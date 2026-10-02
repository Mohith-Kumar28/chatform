import { describe, expect, it } from "vitest";
import { Block, slotsOnDay, validateAnswer, zonedToUtc } from "../src/index";

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

/**
 * The author's working hours, offered on each respondent's clock.
 *
 * An author in India opens 10:00 to 18:00. Someone in New York must be offered
 * those same moments (00:30 to 08:30 their time), not 10 am to 6 pm their time,
 * which is the middle of the author's night.
 */
describe("a time window on the author's clock", () => {
  const block = Block.parse({
    id: "blk_00000003", ref: "q_slot", type: "date", title: "When?",
    includeTime: true, timeMin: "10:00", timeMax: "18:00", timeStepMinutes: 30, timeZone: "Asia/Kolkata",
  });
  const iso = (ms: number) => new Date(ms).toISOString();

  it("offers India's hours to New York as New York times", () => {
    const slots = slotsOnDay("2026-10-05", block as never, "America/New_York");
    expect(iso(slots[0]!)).toBe("2026-10-05T04:30:00.000Z"); // 00:30 EDT = 10:00 IST
    expect(iso(slots[slots.length - 1]!)).toBe("2026-10-05T12:30:00.000Z"); // 08:30 EDT = 18:00 IST
    expect(slots).toHaveLength(17);
  });

  it("splits the window across two of the viewer's days when it straddles their midnight", () => {
    // Sydney is 4.5 h ahead of India in October: 10:00 to 18:00 IST is 14:30 to 22:30 there, one day.
    expect(slotsOnDay("2026-10-05", block as never, "Australia/Sydney")).toHaveLength(17);
    // Honolulu is 15.5 h behind: 10:00 to 18:00 IST is 18:30 to 02:30 there. Their 5 October
    // holds the end of India's 5th (00:00 to 02:30) and the start of India's 6th (18:30 to 23:30).
    const day = slotsOnDay("2026-10-05", block as never, "Pacific/Honolulu");
    expect(iso(day[0]!)).toBe("2026-10-05T10:00:00.000Z"); // 00:00 HST = 15:30 IST on the 5th
    expect(iso(day[day.length - 1]!)).toBe("2026-10-06T09:30:00.000Z"); // 23:30 HST = 15:00 IST on the 6th
    expect(day).toHaveLength(17);
  });

  it("accepts a New York booking inside India's hours and refuses one outside them", () => {
    expect(validateAnswer(block, "2026-10-05T07:00", { timeZone: "America/New_York" }).value).toBe(
      "2026-10-05T11:00:00.000Z",
    );
    const late = validateAnswer(block, "2026-10-05T15:00", { timeZone: "America/New_York" });
    expect(late.code).toBe("time_out_of_range");
    // Told the window on their own clock, not India's.
    expect(late.hint).toBe("Please pick a time between 12:30 am and 8:30 am EDT.");
  });

  it("names the author's zone when the respondent's is unknown", () => {
    expect(validateAnswer(block, "2026-10-05T03:00:00.000Z").hint).toBe(
      "Please pick a time between 10:00 am and 6:00 pm GMT+5:30.",
    );
  });

  it("keeps the respondent's own clock when the block names no zone", () => {
    const own = Block.parse({ ...block, timeZone: undefined });
    expect(validateAnswer(own, "2026-10-05T15:00", { timeZone: "America/New_York" }).ok).toBe(true);
  });
});
