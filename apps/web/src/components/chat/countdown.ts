/**
 * The two places the form counts down before doing something on a respondent's
 * behalf: sending the response, and moving them on to whatever comes after it.
 *
 * The first of them, and the reason a finished response can still end up
 * unfinished.
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
 * Five seconds. Three is enough time to read "Cancel auto-submit" or to move a
 * thumb to it, but not both — and being carried past a submission you meant to
 * stop is the one failure this can cause that a plain button could not. Five
 * covers both with a second to spare, and stops the wait from reading as the
 * form having hung on a card the respondent is already finished with.
 */
export const AUTO_SUBMIT_MS = 5_000;

/** How often the countdown re-reads the clock. Also the fill's step size. */
export const AUTO_SUBMIT_TICK_MS = 100;

export interface AutoSubmitTick {
  /** The number on the button: 5, 4, 3 … 1 — never 0 while it is still counting. */
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

/**
 * The digit for a plain countdown: how many whole seconds are left to run.
 *
 * The ending's redirect had one of these written into the copy as a constant —
 * "opening the next step in 5s…", printed once and never touched again, while
 * the timeout it was describing ran down behind it. Anybody who read it after
 * the first second was reading a number that was no longer true, and on a
 * screen where the very next thing that happens is the page moving, that is the
 * one number worth getting right.
 *
 * A ceiling, and floored at zero, for the same reasons as `autoSubmitTick`: it
 * opens on the full count and never shows a bare 0 with time still to go.
 */
export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
