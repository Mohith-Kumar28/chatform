/**
 * The last button on a chat form, and the reason a finished response can still
 * end up unfinished.
 *
 * A respondent who has answered every question is done in every sense that
 * matters to them — the conversation said so, the review card lists what they
 * said, and the phone goes back in the pocket. The one thing standing between
 * that and a submission is a button nobody told them about. Those responses
 * are not abandoned, they are complete and unsent, and they are invisible to
 * the author except as a suspiciously high drop-off on the last step.
 *
 * So the review card sends itself, and the button becomes the way to *stop*
 * that rather than the way to start it. The arithmetic lives here, away from
 * the component, because the two things worth being sure about — that the
 * digit a respondent reads matches the time they actually have, and that the
 * bar is full at the instant it fires — are properties of a clock, not of a
 * React tree.
 */

/**
 * How long the respondent has to catch it.
 *
 * Five seconds, and the number was chosen against two different people. Three
 * is enough time to read "Cancel auto-submit" or to move a thumb to it, but
 * not both, and being carried past a submission you meant to stop is the one
 * failure this feature can cause that the old button could not. Ten is long
 * enough that the person who *is* watching starts to wonder whether something
 * has hung, which trades the forgetful respondent's problem for everybody
 * else's. Five reads, moves and fires before it feels like waiting.
 */
export const AUTO_SUBMIT_MS = 5_000;

/** How often the countdown re-reads the clock. Also the fill's step size. */
export const AUTO_SUBMIT_TICK_MS = 100;

export interface AutoSubmitTick {
  /** The number on the button: 5, 4, 3, 2, 1 — never 0 while it is still counting. */
  secondsLeft: number;
  /** How much of the button is filled, 0 → 1. */
  filled: number;
  /** The moment it sends. */
  done: boolean;
}

/**
 * Where the countdown stands, read from the clock rather than counted down.
 *
 * Counting — a variable decremented once per tick — is wrong here for the same
 * reason it is wrong in the closing notice: a backgrounded tab has its timers
 * throttled to about once a second, so a counter comes back having lost the
 * seconds it slept through and fires late by however long the respondent was
 * away. Reading the clock makes the sleep irrelevant: the first tick after
 * waking sees the deadline has passed and sends.
 *
 * `secondsLeft` is a ceiling, so the first frame says 5 rather than 4 and the
 * last whole second still says 1. It reaches 0 only together with `done`,
 * which means the button never shows a countdown that has nothing left to
 * count.
 */
export function autoSubmitTick(startedAt: number, now: number): AutoSubmitTick {
  const elapsed = Math.max(0, now - startedAt);
  const remaining = Math.max(0, AUTO_SUBMIT_MS - elapsed);
  return {
    secondsLeft: Math.ceil(remaining / 1000),
    filled: Math.min(1, elapsed / AUTO_SUBMIT_MS),
    done: remaining === 0,
  };
}
