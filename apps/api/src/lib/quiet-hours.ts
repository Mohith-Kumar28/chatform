/**
 * When a reminder is allowed to land, in the respondent's own day.
 *
 * A nudge that arrives at three in the morning is read at breakfast as a mail
 * already dismissed, and is reported as spam more often than one that arrives
 * at nine. So the sequence the author wrote in hours is held out of the
 * recipient's night — their night, not ours, and not the datacentre's.
 *
 * Pure arithmetic, no database and no bindings. Everything here is a fact about
 * a clock; the decisions about *whether* to send live in `followups.ts` and
 * `sweeps.ts`. The one thing this file owns is the promise that its answer is
 * never earlier than the time it was given.
 *
 * `Intl` is the only dependency, and it is the first use of it in this Worker —
 * see `tests/quiet-hours.test.ts`, whose first case exists to prove workerd
 * carries the timezone database at all.
 */

/** Nothing sends from this hour, local, until `QUIET_END_HOUR` the next morning. */
export const QUIET_START_HOUR = 21;
/** The hour a held reminder is released, local. */
export const QUIET_END_HOUR = 9;

/**
 * How far apart two reminders squeezed out of the same night must land.
 *
 * A night swallows every step that fell inside it, so a sequence written as
 * "22:00, then 02:00" resolves to nine o'clock twice and arrives as a pair.
 * Two hours is the shortest gap the builder itself offers, so the result is a
 * cadence the author could have chosen deliberately — and with three steps the
 * worst case is 09:00, 11:00, 13:00, still inside the same morning rather than
 * stretched across another day.
 */
export const QUIET_MIN_SPACING_MS = 2 * 3_600_000;

/**
 * A zone id we are willing to do arithmetic in, canonicalised, or null.
 *
 * The regex is a prefilter, not the check: it is there so a megabyte of
 * attacker-chosen text never reaches ICU, and so an offset string — `+05:30`,
 * which newer V8 accepts as a `timeZone` — is refused. An offset cannot answer
 * "is it three in the morning there in March", which is the only question this
 * module asks of a zone.
 *
 * The construction is the real check, and it canonicalises on the way through:
 * a browser reporting `Asia/Calcutta` and Cloudflare reporting `Asia/Kolkata`
 * become one stored value and one cache key instead of two. `supportedValuesOf`
 * would have been the obvious alternative and is the wrong one — it returns the
 * canonical set only, so it rejects every legacy alias real browsers still send.
 */
const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]{0,24}(\/[A-Za-z0-9_+-]{1,24}){0,2}$/;

export function canonicalZone(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 64 || !ZONE_SHAPE.test(raw)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * Whose clock, in the order we trust them.
 *
 * The respondent's own browser first: it is the only source that knows where
 * the person is sitting rather than where their packets came out. Then the
 * form's, which is the author's zone captured when they switched quiet hours
 * on — a poor guess for a respondent abroad and a far better one than UTC for
 * a form whose audience is local, which is most forms.
 *
 * UTC last, and it is genuinely the worst of the three: a nine-to-nine UTC hold
 * applied to somebody in India suppresses their afternoon and releases the mail
 * at two in the afternoon local. It is reachable only for a form whose author
 * enabled quiet hours through a raw document PUT rather than the builder, and
 * for a headless `/v1` session with no browser to ask.
 */
export function resolveZone(
  respondent: string | null | undefined,
  formFallback: string | null | undefined,
): string {
  return canonicalZone(respondent) ?? canonicalZone(formFallback) ?? "UTC";
}

/**
 * One formatter per zone, for the life of the isolate.
 *
 * Constructing one is an ICU lookup and costs orders of magnitude more than
 * using one; a catch-up chunk of twenty responses across three steps asks for
 * one up to sixty times. Unbounded deliberately: the key space is the IANA zone
 * list, about six hundred entries, and `canonicalZone` is the only door in — so
 * a caller cannot grow this map with invented strings.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(tz);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    /**
     * `hourCycle: "h23"`, not `hour12: false`.
     *
     * The two look equivalent and are not: with `hour12: false` V8 formats
     * midnight as hour "24", and every date derived from that reading lands a
     * day out — a bug that only shows up for respondents whose reminder falls
     * in the one hour after midnight, which is exactly the population this
     * module exists to serve.
     */
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  FORMATTERS.set(tz, made);
  return made;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock reading in `tz` at this instant. */
export function partsIn(tz: string, ms: number): LocalParts {
  const parts = formatterFor(tz).formatToParts(new Date(ms));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * How far ahead of UTC this zone is at this instant, in milliseconds.
 *
 * Derived rather than tabulated: the wall-clock reading is taken in the zone,
 * then re-read *as if it were UTC*, and the difference between that and the
 * instant is the offset. This one trick is what makes everything below
 * offset-agnostic — nothing here assumes whole hours, which is what keeps India
 * (+5:30), Nepal (+5:45), Chatham (+12:45) and Lord Howe's thirty-minute
 * daylight saving correct without a line of special-casing.
 *
 * The instant is floored to the second first. `formatToParts` reports whole
 * seconds, so a millisecond remainder would be counted as offset and every time
 * computed from it would drift by up to 999ms.
 */
function offsetMs(tz: string, ms: number): number {
  const floored = Math.floor(ms / 1000) * 1000;
  const p = partsIn(tz, floored);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - floored;
}

/** Is this instant inside the respondent's waking window? */
export function inWindow(atMs: number, tz: string): boolean {
  const hour = partsIn(tz, atMs).hour;
  return hour >= QUIET_END_HOUR && hour < QUIET_START_HOUR;
}

/**
 * Move an instant out of the respondent's night, or leave it exactly alone.
 *
 * Past nine in the evening the message waits for nine the following local
 * morning; before nine in the morning it waits for nine that same morning.
 * Anything already inside the window is returned untouched, and nothing is ever
 * moved backwards — a reminder pulled into the past would be sent by the very
 * next sweep, which is the opposite of holding it.
 */
export function shiftIntoWindow(atMs: number, tz: string): number {
  const p = partsIn(tz, atMs);
  if (p.hour >= QUIET_END_HOUR && p.hour < QUIET_START_HOUR) return atMs;

  /*
   * The target as a local calendar date first, then as an instant — in that
   * order, and never by adding 86,400,000ms to the source.
   *
   * A day is not twenty-four hours in a zone that changed its offset overnight,
   * which is precisely the night this function exists to handle. `Date.UTC`
   * normalises a day of 32 into the first of the next month, so the rollover
   * across a month, a year and a leap day is arithmetic rather than branches.
   */
  const wantUTC = Date.UTC(
    p.year,
    p.month - 1,
    p.day + (p.hour >= QUIET_START_HOUR ? 1 : 0),
    QUIET_END_HOUR,
    0,
    0,
    0,
  );

  /*
   * Converting a wall-clock reading back to an instant, settled once.
   *
   * The offset at the *source* instant is not the offset at the *target* one —
   * that is the whole of the daylight-saving problem, and using the first would
   * put a spring-forward message an hour late and a fall-back message an hour
   * early. So: guess using the offset at the target's naive position, then
   * re-read the offset at that guess and correct.
   *
   * A second correction would be needed only if the true answer and the first
   * guess straddled a transition, which requires the transition to fall within
   * an hour or two of nine in the morning. No zone in tzdata transitions
   * between eight and ten; they cluster around midnight to four, and the
   * late-evening outliers are all far from the morning. If one ever does, the
   * answer is an hour out and still inside the window, which is the invariant
   * that matters.
   */
  const naiveOffset = offsetMs(tz, wantUTC);
  const guess = wantUTC - naiveOffset;
  const settledOffset = offsetMs(tz, guess);
  const settled = settledOffset === naiveOffset ? guess : wantUTC - settledOffset;

  /*
   * The floor, for the two readings the arithmetic cannot make exact.
   *
   * A local nine o'clock that does not exist — a zone that skipped a whole day,
   * as Apia did in 2011 — settles onto the nearest instant that does, which may
   * be later in the morning. One that exists twice settles onto one of the two.
   * Both are inside the window and both are acceptable; what is not acceptable
   * is landing at or before where we started, which would schedule a message
   * into the past.
   */
  return settled > atMs ? settled : atMs;
}
