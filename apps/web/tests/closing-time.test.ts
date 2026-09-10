import { describe, expect, it } from "vitest";
import { describeClosing, isUrgent } from "../src/components/chat/closing-time";

/**
 * A fixed instant, so "9d left" means the same thing on every machine that runs
 * this. The zone is pinned too: the tiers are computed from a duration and are
 * zone-free, but the two tiers that print a *date* are not, and a test that
 * passes in London and fails in Kolkata is worse than no test.
 */
const NOW = Date.parse("2026-09-10T12:00:00.000Z");
const OPTS = { locale: "en-GB", timeZone: "UTC" } as const;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `closeAt` for a deadline `ms` from NOW. */
function at(ms: number): string {
  return new Date(NOW + ms).toISOString();
}

function describe_(ms: number, started = false) {
  const d = describeClosing(at(ms), NOW, { ...OPTS, started });
  if (!d) throw new Error("expected a description");
  return d;
}

describe("describeClosing", () => {
  it("says nothing without a usable close date", () => {
    expect(describeClosing(undefined, NOW, OPTS)).toBeNull();
    expect(describeClosing("", NOW, OPTS)).toBeNull();
    expect(describeClosing("whenever", NOW, OPTS)).toBeNull();
  });

  describe("tier boundaries", () => {
    /*
     * Each boundary from both sides. These are the only places the output can
     * be wrong in a way nobody notices: the middle of a tier is obvious on
     * sight, the edges are not.
     */
    it("is imminent below an hour and hours at exactly an hour", () => {
      expect(describe_(HOUR - SECOND).tier).toBe("imminent");
      expect(describe_(HOUR).tier).toBe("hours");
    });

    it("is hours below a day and days at exactly a day", () => {
      expect(describe_(DAY - SECOND).tier).toBe("hours");
      expect(describe_(DAY).tier).toBe("days");
    });

    it("is days below two days and distant at exactly two", () => {
      expect(describe_(2 * DAY - SECOND).tier).toBe("days");
      expect(describe_(2 * DAY).tier).toBe("distant");
    });

    it("is passed at zero, not a second before", () => {
      expect(describe_(SECOND).tier).toBe("imminent");
      expect(describe_(0).tier).toBe("passed");
      expect(describe_(-1).tier).toBe("passed");
    });
  });

  describe("what it reads", () => {
    it("drops the hours field under an hour", () => {
      expect(describe_(40 * MINUTE + 19 * SECOND).text).toBe("Closes in 40:19");
      expect(describe_(9 * SECOND).text).toBe("Closes in 00:09");
    });

    it("shows a full clock inside the last day", () => {
      expect(describe_(5 * HOUR + 12 * MINUTE + 44 * SECOND).text).toBe("Closes in 05:12:44");
    });

    it("shows a day and hours between one and two days", () => {
      expect(describe_(DAY + 6 * HOUR).text).toBe("Closes in 1d 06h");
    });

    it("drops a zero hours field rather than printing 1d 00h", () => {
      expect(describe_(DAY).text).toBe("Closes in 1d");
      expect(describe_(DAY + 30 * MINUTE).text).toBe("Closes in 1d");
    });

    it("shows a date and a day count further out", () => {
      // 2026-09-10 + 9 days = Saturday 19 September. "Sept" rather than "Sep"
      // is en-GB's own abbreviation — the date is formatted in the
      // respondent's locale, so this is `Intl` being right, not a typo.
      expect(describe_(9 * DAY).text).toBe("Closes Sat 19 Sept · 9d left");
    });
  });

  describe("the tick interval", () => {
    it("counts seconds only inside the last day", () => {
      expect(describe_(HOUR - SECOND).tickMs).toBe(SECOND);
      expect(describe_(DAY - SECOND).tickMs).toBe(SECOND);
    });

    it("drops to a minute once seconds stop showing", () => {
      expect(describe_(DAY).tickMs).toBe(MINUTE);
      expect(describe_(9 * DAY).tickMs).toBe(MINUTE);
    });

    it("stops entirely once the deadline has passed", () => {
      expect(describe_(0).tickMs).toBeNull();
    });
  });

  describe("after the deadline", () => {
    /*
     * The distinction the whole zero-state rests on. The close date is checked
     * when a session opens and nowhere else, so a conversation that was already
     * open survives it — telling that respondent the form has closed would be
     * telling them their answers are lost when they are not.
     */
    it("tells someone who has not started that the form is closed", () => {
      expect(describe_(-MINUTE, false).text).toBe("This form has closed.");
    });

    it("tells someone mid-conversation they can still finish", () => {
      expect(describe_(-MINUTE, true).text).toBe(
        "Closing time passed — you can still finish this response.",
      );
    });

    it("does not vary before the deadline", () => {
      expect(describe_(HOUR, true).text).toBe(describe_(HOUR, false).text);
    });
  });

  describe("what a screen reader gets", () => {
    it("is an absolute time, not the ticking clock", () => {
      const d = describe_(5 * HOUR + 12 * MINUTE);
      expect(d.srText).not.toContain(":12:");
      expect(d.srText).toBe("This form closes on 10 September 2026 at 17:12.");
    });

    it("is the same sentence as the visible one once it has passed", () => {
      const d = describe_(-MINUTE);
      expect(d.srText).toBe(d.text);
    });
  });
});

describe("isUrgent", () => {
  it("colours the last hour and nothing earlier", () => {
    expect(isUrgent("distant")).toBe(false);
    expect(isUrgent("days")).toBe(false);
    expect(isUrgent("hours")).toBe(false);
    expect(isUrgent("imminent")).toBe(true);
    expect(isUrgent("passed")).toBe(true);
  });
});
