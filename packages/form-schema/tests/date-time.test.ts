import { describe, expect, it } from "vitest";
import { Block, validateAnswer } from "../src/index";

/**
 * A date block can also collect a time, which is what turns "when shall we
 * meet?" into an appointment. The answer becomes `YYYY-MM-DDTHH:mm`, and the
 * date half keeps every rule it had.
 */
describe("date blocks that also collect a time", () => {
  const timed = (extra: Record<string, unknown> = {}) =>
    Block.parse({
      id: "blk_00000001", ref: "q_when", type: "date", title: "When?",
      includeTime: true, timeMin: "09:00", timeMax: "17:00", ...extra,
    });

  it("accepts a date and time inside the offered window", () => {
    const r = validateAnswer(timed(), "2026-10-01T14:30");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("2026-10-01T14:30");
  });

  it("asks for the time when only a date arrives", () => {
    const r = validateAnswer(timed(), "2026-10-01");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("invalid_time");
  });

  it("refuses a time outside the window the form offers", () => {
    expect(validateAnswer(timed(), "2026-10-01T08:00").code).toBe("time_out_of_range");
    expect(validateAnswer(timed(), "2026-10-01T19:00").code).toBe("time_out_of_range");
  });

  it("refuses a time that is not a time", () => {
    expect(validateAnswer(timed(), "2026-10-01T25:99").code).toBe("invalid_time");
  });

  it("still applies the date bounds", () => {
    const block = timed({ min: "2026-10-05" });
    expect(validateAnswer(block, "2026-10-01T14:30").code).toBe("too_early");
  });

  it("leaves a plain date block storing a plain date", () => {
    const block = Block.parse({ id: "blk_00000002", ref: "q_d", type: "date", title: "When?" });
    expect(validateAnswer(block, "2026-10-01").value).toBe("2026-10-01");
    // A time on a block that never asked for one is a mistake, not a bonus.
    expect(validateAnswer(block, "2026-10-01T14:30").ok).toBe(false);
  });
});
