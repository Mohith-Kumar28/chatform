/**
 * What to do about typing dots that have outlived their turn.
 *
 * Split out from the hook and kept pure so the ladder can be reasoned about —
 * and tested — without a stream, a server or a React tree. The hook supplies
 * the clock and performs whatever this returns.
 *
 * The rule it encodes, and the bug it exists to prevent: the two recoveries
 * available here fix *different* faults, and neither covers the other.
 *
 *   `resync`     the server re-states where the conversation stands, under
 *                fresh sequence numbers. Fixes a device that saw a state and
 *                lost it. Travels over the existing stream.
 *   `reconnect`  a new stream, replaying everything durable. Fixes a stream
 *                that is no longer being delivered at all.
 *
 * The ladder used to be three resyncs and then an error. When the fault was a
 * half-open socket — a phone that changed network, a proxy that dropped an
 * idle connection — every one of those resyncs was answered, did exactly what
 * it promised, and sent the result down the pipe that was the problem. Nothing
 * reached the screen, and the ladder concluded the server was broken. The
 * reconnect that would have fixed it in one round trip was reachable only by
 * the respondent pressing Retry, or by the 45s silent-stream detector — which
 * fires *after* this ladder has already given up and put an error banner over
 * a conversation that was fine.
 *
 * So the reconnect belongs on the ladder itself, in the middle: ask first
 * (cheap, and the common case), reopen second, ask once more on the new
 * stream, and only then admit defeat.
 */

/** How long the dots may run against a silent stream before this acts at all. */
export const THINKING_STALE_MS = 6000;

/** ...and how long before it stops reasoning about it and asks the server. */
export const RESYNC_AFTER_MS = 12000;

/**
 * Rungs before the error banner.
 *
 * Four, not three, because one of them is now a reconnect rather than another
 * question asked down a pipe that may be the thing at fault.
 */
export const MAX_RECOVERY_ATTEMPTS = 4;

/** Which rung is a reconnect. Second: after one cheap ask, before giving up. */
const RECONNECT_ON_ATTEMPT = 2;

export type StuckAction = "wait" | "settle" | "resync" | "reconnect" | "giveUp";

export interface StuckTurnState {
  now: number;
  /** When the typing indicator went up. */
  armedAt: number;
  /** When the stream last said anything at all, keep-alive pings included. */
  lastEventAt: number;
  /** When this ladder last did something, so it does not hammer. */
  lastAttemptAt: number;
  /** Rungs already used. */
  attempts: number;
  /** Something this device sent is still outstanding. */
  answering: boolean;
  /** The screen already holds something the respondent could act on. */
  actionable: boolean;
}

export function stuckTurnStep(s: StuckTurnState): StuckAction {
  // Something is arriving: the agent really is mid-turn. A keep-alive ping
  // counts — it is the server saying the connection is real.
  if (s.now - s.lastEventAt < THINKING_STALE_MS) return "wait";
  if (s.now - s.armedAt < THINKING_STALE_MS) return "wait";

  // Nothing was sent from here and there are already controls on screen, so no
  // turn is outstanding and the dots are simply wrong. No round trip needed.
  if (!s.answering && s.actionable) return "settle";

  if (s.now - s.armedAt < RESYNC_AFTER_MS) return "wait";
  // Spaced out. Three requests in three seconds is not a retry, it is a client
  // hammering a server that is already having a bad time.
  if (s.now - s.lastAttemptAt < THINKING_STALE_MS) return "wait";
  if (s.attempts >= MAX_RECOVERY_ATTEMPTS) return "giveUp";
  return s.attempts + 1 === RECONNECT_ON_ATTEMPT ? "reconnect" : "resync";
}
