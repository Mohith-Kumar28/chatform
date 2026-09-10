/**
 * What to say about a form's closing time, and how often to say it again.
 *
 * Pure so the tier boundaries can be tested without rendering a clock — the
 * same split as `respondent-hint.ts` and `stuck-turn.ts`.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type ClosingTier = "distant" | "days" | "hours" | "imminent" | "passed";

export interface ClosingDescription {
  tier: ClosingTier;
  /** The line the respondent reads. */
  text: string;
  /**
   * How long until this line is wrong, in ms. Null when nothing will change
   * again, which is the only state where the caller should stop ticking.
   *
   * Seconds are shown — and paid for with a render a second — only inside the
   * last day. A deadline three weeks out that re-rendered the whole notice
   * every second would be spending a frame a second to animate a digit nobody
   * is watching.
   */
  tickMs: number | null;
  /**
   * The stable sentence a screen reader gets instead of the ticking clock.
   *
   * A counter read aloud once a second is unusable, so `text` is hidden from
   * assistive tech and this is announced in its place. It says the same thing
   * as an absolute time, which is the form a reader can act on anyway.
   */
  srText: string;
}

interface Options {
  /**
   * Whether this respondent has already started answering.
   *
   * It changes what "closed" means to them, and getting it wrong tells someone
   * their work is lost when it is not. The close date is enforced when a
   * session opens (`open-session.ts`) and nowhere else — `session-do.ts` gates
   * turns on the session's own status and never reads `closeRules` — so a
   * conversation that was already open when the deadline passed can still be
   * finished and submitted.
   */
  started?: boolean;
  /** Test seams. Undefined means the respondent's own locale and zone. */
  locale?: string;
  timeZone?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Null when there is no usable close date — an absent one, or a string that
 * does not parse. A form whose deadline we cannot read should say nothing
 * rather than guess.
 */
export function describeClosing(
  closeAt: string | undefined,
  now: number,
  opts: Options = {},
): ClosingDescription | null {
  if (!closeAt) return null;
  const at = Date.parse(closeAt);
  if (!Number.isFinite(at)) return null;

  const { started = false, locale, timeZone } = opts;
  const remaining = at - now;

  const absolute = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  }).format(at);

  if (remaining <= 0) {
    const text = started
      ? "Closing time passed — you can still finish this response."
      : "This form has closed.";
    return { tier: "passed", text, tickMs: null, srText: text };
  }

  const srText = `This form closes on ${absolute}.`;

  // Under an hour, the hours field is always zero and printing it wastes the
  // two characters that make the minutes legible at a glance.
  if (remaining < HOUR) {
    const mins = Math.floor(remaining / MINUTE);
    const secs = Math.floor((remaining % MINUTE) / SECOND);
    return {
      tier: "imminent",
      text: `Closes in ${pad(mins)}:${pad(secs)}`,
      tickMs: SECOND,
      srText,
    };
  }

  if (remaining < DAY) {
    const hours = Math.floor(remaining / HOUR);
    const mins = Math.floor((remaining % HOUR) / MINUTE);
    const secs = Math.floor((remaining % MINUTE) / SECOND);
    return {
      tier: "hours",
      text: `Closes in ${pad(hours)}:${pad(mins)}:${pad(secs)}`,
      tickMs: SECOND,
      srText,
    };
  }

  if (remaining < 2 * DAY) {
    const hours = Math.floor((remaining - DAY) / HOUR);
    return {
      tier: "days",
      // "1d 00h" for the one minute either side of the boundary is worse than
      // the day on its own.
      text: hours > 0 ? `Closes in 1d ${pad(hours)}h` : "Closes in 1d",
      tickMs: MINUTE,
      srText,
    };
  }

  const days = Math.floor(remaining / DAY);
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(at);
  return {
    tier: "distant",
    // The date, because that is what someone plans around at this distance,
    // and the count, because "9d left" is the part that reads as pressure.
    text: `Closes ${date} · ${days}d left`,
    tickMs: MINUTE,
    srText,
  };
}

/**
 * Whether this reads as pressure rather than information.
 *
 * The last hour only. A day out is a fact; a countdown in minutes is a prompt
 * to finish, and colouring anything earlier than that spends the one signal we
 * have on a deadline nobody needs to hurry for.
 */
export function isUrgent(tier: ClosingTier): boolean {
  return tier === "imminent" || tier === "passed";
}
