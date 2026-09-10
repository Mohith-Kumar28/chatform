import { describe, it, expect } from "vitest";
import { saveDelay, IDLE_MS, CEILING_MS } from "@/lib/save-timing";

/**
 * The autosave cadence.
 *
 * Two failures are being guarded against at once, and they pull in opposite
 * directions: saving too eagerly submits half-typed values for validation, and
 * saving only on silence means someone who types continuously is never saved at
 * all. The first is what produced "Invalid email address" after two letters; the
 * second is the one nobody had noticed yet.
 */
describe("saveDelay", () => {
  const T = 1_000_000;

  it("waits the full idle gap when nothing is outstanding", () => {
    expect(saveDelay(null, T)).toBe(IDLE_MS);
  });

  it("waits the full idle gap for an edit just made", () => {
    expect(saveDelay(T, T)).toBe(IDLE_MS);
  });

  it("is long enough to survive a pause mid-word", () => {
    // The old value was 800ms, which is not.
    expect(IDLE_MS).toBeGreaterThanOrEqual(2_000);
  });

  it("shortens as the oldest unsent edit approaches the ceiling", () => {
    // 8s in: 2s of ceiling left, which is less than a fresh idle gap.
    expect(saveDelay(T - 8_000, T)).toBe(2_000);
  });

  it("does not shorten while the ceiling is further off than the idle gap", () => {
    expect(saveDelay(T - 5_000, T)).toBe(IDLE_MS);
  });

  it("fires immediately once the ceiling is reached", () => {
    expect(saveDelay(T - CEILING_MS, T)).toBe(0);
  });

  it("never returns a negative delay for an edit that outran the ceiling", () => {
    // Reachable whenever the tab was suspended: the clock moves, the timer does not.
    expect(saveDelay(T - 60_000, T)).toBe(0);
  });

  it("bounds continuous editing to the ceiling rather than to nothing", () => {
    // Someone typing without pause for thirty seconds, asked every 500ms. The
    // answer must keep falling to zero rather than resetting to the idle gap, so
    // the work checkpoints on the ceiling — three times, not never.
    let dirtySince: number | null = T;
    let saved = 0;
    for (let now = T; now <= T + 30_000; now += 500) {
      if (saveDelay(dirtySince, now) === 0) {
        saved += 1;
        dirtySince = now;
      }
    }
    expect(saved).toBe(3);
  });
});
