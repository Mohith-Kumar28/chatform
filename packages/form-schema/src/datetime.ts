/**
 * Appointments: a date block with `includeTime`, stored as one moment in UTC.
 *
 * "5 pm on 3 October" is not a moment until somebody says whose 5 pm. The
 * respondent picks on their own clock, the answer is stored as the UTC instant
 * that clock meant (`2026-10-03T11:30:00.000Z`), and every reader sees it on
 * theirs: the respondent in their zone, the admin in Results in the admin's.
 *
 * Answers stored before this were a bare `2026-10-03T17:00` with no zone at
 * all. Those are read back exactly as written, because nothing now can say
 * which clock they were on.
 *
 * Plain `Intl`, no timezone library: browsers and the Workers runtime both
 * carry the full zone database.
 */

const APPOINTMENT_RE =
  /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,3})?)?(Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$/;

/** A date and a time of day on some clock, as `YYYY-MM-DD` and `HH:mm`. */
export interface WallTime {
  date: string;
  time: string;
}

export interface Appointment {
  /** The moment, in epoch ms. */
  ms: number;
  /** The same moment on the respondent's clock: what the form's time window and date bounds are checked against. */
  wall: WallTime;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** An IANA zone this runtime can use, or null. Never throws. */
export function usableZone(zone: string | null | undefined): string | null {
  if (!zone) return null;
  try {
    wallFormatter(zone);
    return zone;
  } catch {
    return null;
  }
}

function wallFormatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatters.set(zone, f);
  }
  return f;
}

/** Where `ms` falls on the clock in `zone`. */
export function wallTimeIn(ms: number, zone: string): WallTime {
  const parts: Record<string, string> = {};
  for (const p of wallFormatter(zone).formatToParts(new Date(ms))) parts[p.type] = p.value;
  // Some engines still print midnight as 24 under h23.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

function asUtc({ date, time }: WallTime): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Date.UTC(y!, mo! - 1, d!, h!, mi!);
}

/** How far `zone` is ahead of UTC at `ms`, in ms. */
function offsetAt(ms: number, zone: string): number {
  return asUtc(wallTimeIn(ms, zone)) - Math.floor(ms / 60000) * 60000;
}

/**
 * The moment a clock in `zone` reads `wall`.
 *
 * Two passes, so a wall time on the far side of a daylight-saving change uses
 * that side's offset. A time that a spring-forward skips lands an hour on,
 * which is what a calendar does with it too.
 */
export function zonedToUtc(wall: WallTime, zone: string): number {
  const naive = asUtc(wall);
  const first = naive - offsetAt(naive, zone);
  const second = naive - offsetAt(first, zone);
  return second;
}

/**
 * Read an appointment answer.
 *
 * - `…Z`: already a moment. Its wall time is on `zone` when known, else UTC.
 * - `…+05:30`: a moment and the clock it was picked on, which is the one the
 *   time window is checked against. The composer sends this shape.
 * - bare `2026-10-03T17:00`: a time on the respondent's clock, `zone`. What the
 *   agent and a typed reply produce. With no zone known it is taken as UTC.
 */
export function parseAppointment(raw: string, zone?: string | null): Appointment | null {
  const m = APPOINTMENT_RE.exec(raw.trim());
  if (!m) return null;
  const [, date, hh, mm, suffix] = m;
  const typed: WallTime = { date: date!, time: `${hh}:${mm}` };
  if (Number.isNaN(Date.parse(typed.date))) return null;
  const tz = usableZone(zone);

  if (suffix === "Z") {
    const ms = asUtc(typed);
    return { ms, wall: tz ? wallTimeIn(ms, tz) : typed };
  }
  if (suffix) {
    const sign = suffix.startsWith("-") ? -1 : 1;
    const digits = suffix.slice(1).replace(":", "");
    const offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60000;
    return { ms: asUtc(typed) - offset, wall: typed };
  }
  return { ms: tz ? zonedToUtc(typed, tz) : asUtc(typed), wall: typed };
}

/** The canonical stored form of an appointment: `2026-10-03T11:30:00.000Z`. */
export function appointmentIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** True for a stored appointment that carries its zone, as opposed to a pre-zone `YYYY-MM-DDTHH:mm`. */
export function isZonedAppointment(value: string): boolean {
  const m = APPOINTMENT_RE.exec(value.trim());
  return Boolean(m && m[4]);
}

/**
 * An appointment as a person reads it, on the clock in `zone`:
 * "Sat 3 Oct 2026 at 5:00 pm GMT+5:30".
 *
 * The zone is always named, because the same answer is read on two clocks. No
 * zone given means UTC, said as such: an export or an email that cannot know
 * whose screen it lands on says which clock it used.
 *
 * Returns null for anything that is not a zoned appointment, so a caller falls
 * back to what it showed before.
 */
export function formatAppointment(value: string, zone?: string | null): string | null {
  if (!isZonedAppointment(value)) return null;
  const parsed = parseAppointment(value);
  if (!parsed) return null;
  const tz = usableZone(zone) ?? "UTC";
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(new Date(parsed.ms))) {
    parts[p.type] = p.value;
  }
  const period = (parts.dayPeriod ?? "").toLowerCase();
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year} at ${parts.hour}:${parts.minute} ${period} ${parts.timeZoneName}`.replace(
    /\s+/g,
    " ",
  );
}

/** A date block's time window: the times offered, on the author's clock when it names one. */
export interface SlotWindow {
  timeMin: string;
  timeMax: string;
  timeStepMinutes: number;
  /** The author's zone. Absent: the window is on each respondent's own clock. */
  timeZone?: string | null;
}

/** Every time the window offers, as `HH:mm` on its own clock. */
export function windowTimes(w: SlotWindow): string[] {
  const toMin = (hhmm: string) => {
    const [h = "0", m = "0"] = hhmm.split(":");
    return Number(h) * 60 + Number(m);
  };
  const step = Math.max(5, w.timeStepMinutes);
  const out: string[] = [];
  for (let t = toMin(w.timeMin); t <= toMin(w.timeMax) && out.length < 288; t += step) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

/** `YYYY-MM-DD` moved by whole days. */
function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/**
 * The slots that fall on `date` on the viewer's clock, as moments in order.
 *
 * The author's 10:00 to 18:00 in India is 00:30 to 08:30 for someone in New
 * York, and for someone in Sydney it straddles midnight, so a viewer's day can
 * hold the end of one of the author's days and the start of the next. All
 * three of the author's days around it are walked, and only what lands on the
 * viewer's `date` is kept.
 */
export function slotsOnDay(date: string, w: SlotWindow, viewerZone: string): number[] {
  const host = usableZone(w.timeZone) ?? viewerZone;
  const times = windowTimes(w);
  const out = new Set<number>();
  for (const days of [-1, 0, 1]) {
    const hostDate = shiftDate(date, days);
    for (const time of times) {
      const ms = zonedToUtc({ date: hostDate, time }, host);
      if (wallTimeIn(ms, viewerZone).date === date) out.add(ms);
    }
  }
  return [...out].sort((a, z) => a - z);
}

/** "5:00 pm" on the clock in `zone`. */
export function clockTimeIn(ms: number, zone: string): string {
  const { time } = wallTimeIn(ms, zone);
  const [h = "0", m = "00"] = time.split(":");
  const hour = Number(h);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${hour < 12 ? "am" : "pm"}`;
}

/** The short name of `zone` at `ms`: "GMT+5:30", "EDT", "UTC". */
export function zoneName(ms: number, zone: string): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
        .formatToParts(new Date(ms))
        .find((p) => p.type === "timeZoneName")?.value ?? zone
    );
  } catch {
    return zone;
  }
}

/** The zone this browser or runtime is on, or null. */
export function localZone(): string | null {
  try {
    return usableZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}
