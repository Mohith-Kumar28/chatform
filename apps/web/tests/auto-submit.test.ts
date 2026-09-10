import { describe, expect, it } from "vitest";
import {
  autoSubmitTick,
  AUTO_SUBMIT_MS,
  AUTO_SUBMIT_TICK_MS,
} from "../src/components/chat/auto-submit";

/**
 * The countdown on the last button in the form.
 *
 * Two things have to hold for this to be safe to point at somebody's finished
 * response: the digit they read is the time they actually have, and the bar is
 * full at the instant it fires — not before, which would send while the button
 * still looks like it is waiting.
 */
describe("autoSubmitTick", () => {
  const START = 1_700_000_000_000;

  it("opens on the full count, not one less", () => {
    // A floor here would have shown "4" on the first frame of a five-second
    // countdown, and "0" for the whole of the last second.
    expect(autoSubmitTick(START, START).secondsLeft).toBe(5);
    expect(autoSubmitTick(START, START).filled).toBe(0);
    expect(autoSubmitTick(START, START).done).toBe(false);
  });

  it("counts down one second at a time and never shows a bare zero", () => {
    const digits: number[] = [];
    for (let t = 0; t < AUTO_SUBMIT_MS; t += AUTO_SUBMIT_TICK_MS) {
      const { secondsLeft, done } = autoSubmitTick(START, START + t);
      expect(done).toBe(false);
      if (digits.at(-1) !== secondsLeft) digits.push(secondsLeft);
    }
    expect(digits).toEqual([5, 4, 3, 2, 1]);
  });

  it("fires with the bar full, and not a tick earlier", () => {
    const justBefore = autoSubmitTick(START, START + AUTO_SUBMIT_MS - 1);
    expect(justBefore.done).toBe(false);
    expect(justBefore.filled).toBeLessThan(1);

    const atZero = autoSubmitTick(START, START + AUTO_SUBMIT_MS);
    expect(atZero.done).toBe(true);
    expect(atZero.filled).toBe(1);
    expect(atZero.secondsLeft).toBe(0);
  });

  it("sends on the first read after a backgrounded tab wakes up late", () => {
    // The whole reason this reads the clock instead of decrementing a counter:
    // a phone locked mid-countdown throttles the interval, and the tick that
    // arrives thirty seconds later has to send rather than resume counting.
    const late = autoSubmitTick(START, START + 30_000);
    expect(late.done).toBe(true);
    expect(late.filled).toBe(1);
  });

  it("does not run backwards if the clock is read before it started", () => {
    // `now` is state that lags `startedAt` by one render on arming.
    const early = autoSubmitTick(START, START - 250);
    expect(early.filled).toBe(0);
    expect(early.secondsLeft).toBe(5);
    expect(early.done).toBe(false);
  });
});
