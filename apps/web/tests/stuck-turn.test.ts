import { describe, expect, it } from "vitest";
import {
  stuckTurnStep,
  MAX_RECOVERY_ATTEMPTS,
  RESYNC_AFTER_MS,
  THINKING_STALE_MS,
  type StuckTurnState,
} from "../src/components/chat/stuck-turn";

/**
 * The way out of typing dots that are never coming down.
 *
 * This is the ladder a respondent actually met when a turn went quiet: the
 * form sat on the dots, tried to recover, failed, and put a red banner over a
 * conversation the server had already finished. What follows pins the two
 * things that were wrong about it — that it never reopened the stream, and
 * that it therefore gave up well before the connection could heal itself.
 */

const armed = (over: Partial<StuckTurnState> = {}): StuckTurnState => ({
  now: 0,
  armedAt: 0,
  lastEventAt: 0,
  lastAttemptAt: 0,
  attempts: 0,
  answering: true,
  actionable: false,
  ...over,
});

/** Run the ladder forward, recording what it did at each rung. */
function ladder(state: Partial<StuckTurnState> = {}): string[] {
  const s = armed(state);
  const acted: string[] = [];
  for (let now = 0; now <= 120_000 && acted.at(-1) !== "giveUp"; now += 1000) {
    const step = stuckTurnStep({ ...s, now });
    if (step === "wait") continue;
    acted.push(step);
    if (step === "settle" || step === "giveUp") break;
    s.attempts += 1;
    s.lastAttemptAt = now;
  }
  return acted;
}

describe("a turn that has gone quiet", () => {
  it("reopens the stream before it gives up on it", () => {
    const steps = ladder();
    expect(steps).toContain("reconnect");
    // And it happens early enough to matter: before the banner, not after it.
    expect(steps.indexOf("reconnect")).toBeLessThan(steps.indexOf("giveUp"));
  });

  it("does not spend every rung asking down the same pipe", () => {
    // The old ladder was three resyncs and an error. If the stream itself is
    // the fault, all three are answered and none of them reach the screen.
    const steps = ladder().filter((s) => s !== "giveUp");
    expect(steps).toEqual(["resync", "reconnect", "resync", "resync"]);
    expect(steps).toHaveLength(MAX_RECOVERY_ATTEMPTS);
  });

  it("says nothing at all while the stream is still talking", () => {
    // A keep-alive ping is the server saying the connection is real, and the
    // agent may legitimately be thinking for a while.
    const step = stuckTurnStep(armed({ now: 60_000, lastEventAt: 59_000 }));
    expect(step).toBe("wait");
  });

  it("holds off until the dots have been up long enough to be wrong", () => {
    expect(stuckTurnStep(armed({ now: THINKING_STALE_MS - 1 }))).toBe("wait");
    expect(stuckTurnStep(armed({ now: RESYNC_AFTER_MS - 1 }))).toBe("wait");
    expect(stuckTurnStep(armed({ now: RESYNC_AFTER_MS }))).toBe("resync");
  });

  it("just puts the controls back when nothing was ever outstanding", () => {
    // Dots armed by something that had already landed — a branch jump, a
    // sign-in round trip — over a screen that has a question on it. No round
    // trip is needed to know the dots are simply wrong.
    const step = stuckTurnStep(armed({ now: 10_000, answering: false, actionable: true }));
    expect(step).toBe("settle");
  });

  it("spaces its attempts rather than hammering a struggling server", () => {
    const step = stuckTurnStep(armed({ now: 20_000, attempts: 1, lastAttemptAt: 19_000 }));
    expect(step).toBe("wait");
  });

  it("gives up eventually, rather than leaving the dots up forever", () => {
    expect(ladder().at(-1)).toBe("giveUp");
  });
});
