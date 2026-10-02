"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { DayPicker, type ClassNames } from "react-day-picker";
import { addDays, addYears, format, isAfter, isBefore, isToday, isValid, parseISO, startOfDay, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Date composer.
 *
 * `date` blocks previously fell through to a plain text input, so a respondent
 * had to guess the expected format and the answer failed validation if they
 * guessed wrong. This is a real calendar that respects the block's min/max and
 * `disablePast`, plus quick options for the common cases.
 *
 * The grid is react-day-picker, with month and year dropdowns in the caption.
 * The hand-rolled grid only had arrows, so a date forty years back was 480
 * taps away; a native select is one tap and a scroll wheel on a phone.
 */
export function DateComposer({
  min,
  max,
  disablePast,
  includeTime = false,
  timeStepMinutes = 30,
  timeMin = "09:00",
  timeMax = "18:00",
  onPick,
}: {
  min?: string;
  max?: string;
  disablePast?: boolean;
  /** Ask for a time as well — the difference between a date and an appointment. */
  includeTime?: boolean;
  timeStepMinutes?: number;
  timeMin?: string;
  timeMax?: string;
  onPick: (iso: string, display: string) => void;
}) {
  const today = startOfDay(new Date());
  /**
   * The day chosen so far, when a time is still owed.
   *
   * Without `includeTime` the calendar answers on the first tap, exactly as it
   * always has. With it, the tap picks the day and the pad switches to the
   * times available on that day — one decision at a time, which is how every
   * booking flow people already know works.
   */
  const [chosenDay, setChosenDay] = useState<Date | null>(null);

  const lowerBound = useMemo(() => {
    const fromMin = parseBound(min);
    if (disablePast) return fromMin && isAfter(fromMin, today) ? fromMin : today;
    return fromMin;
  }, [min, disablePast, today]);

  const upperBound = useMemo(() => parseBound(max), [max]);

  function disabled(day: Date) {
    if (lowerBound && isBefore(day, lowerBound)) return true;
    if (upperBound && isAfter(day, upperBound)) return true;
    return false;
  }

  /*
    What the year dropdown spans: the block's own bounds where it has them, and
    otherwise a century and more either side. Nothing here assumes what the
    date is for, so a birthday, a start date and a delivery day all get there
    in one pick.
  */
  const startMonth = startOfMonth(lowerBound ?? addYears(today, -120));
  const endMonth = startOfMonth(upperBound ?? addYears(today, 30));

  // Opens on this month, or on the nearest month the bounds allow.
  const [cursor, setCursor] = useState(() => {
    const now = startOfMonth(today);
    if (isBefore(now, startMonth)) return startMonth;
    if (isAfter(now, endMonth)) return endMonth;
    return now;
  });

  function choose(day: Date) {
    if (disabled(day)) return;
    if (includeTime) {
      setChosenDay(day);
      return;
    }
    onPick(format(day, "yyyy-MM-dd"), format(day, "EEE d MMM yyyy"));
  }

  /** Every slot between the block's opening and closing time, on the step. */
  const slots = useMemo(() => {
    if (!includeTime) return [];
    const toMin = (hhmm: string) => {
      const [h = "0", m = "0"] = hhmm.split(":");
      return Number(h) * 60 + Number(m);
    };
    const start = toMin(timeMin);
    const end = toMin(timeMax);
    const step = Math.max(5, timeStepMinutes);
    const out: string[] = [];
    for (let t = start; t <= end && out.length < 96; t += step) {
      out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
    }
    return out;
  }, [includeTime, timeMin, timeMax, timeStepMinutes]);

  /** A slot already gone by is not a slot — only ever hidden for *today*. */
  function slotPassed(day: Date, hhmm: string): boolean {
    if (!isToday(day)) return false;
    const now = new Date();
    const [h = "0", m = "0"] = hhmm.split(":");
    return Number(h) * 60 + Number(m) <= now.getHours() * 60 + now.getMinutes();
  }

  // Shortcuts for the common near dates, only the ones the bounds allow. A
  // block capped in the past (a birthday) simply gets none.
  const quick = [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "Next week", date: addDays(today, 7) },
  ].filter((q) => !disabled(q.date));

  if (includeTime && chosenDay) {
    const open = slots.filter((t) => !slotPassed(chosenDay, t));
    return (
      <div className="w-full max-w-[19rem] rounded-[var(--cf-radius-card)] border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setChosenDay(null)}
            className="flex items-center gap-1 rounded-full px-1.5 py-1 text-xs opacity-70 transition-opacity hover:opacity-100"
          >
            <ChevronLeft className="size-3.5" />
            {format(chosenDay, "EEE d MMM")}
          </button>
          <span className="flex items-center gap-1 text-xs opacity-50">
            <Clock className="size-3" />
            {zoneLabel(chosenDay) ?? "Pick a time"}
          </span>
        </div>

        {open.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs opacity-60">
            No times left on that day. Pick another one.
          </p>
        ) : (
          <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto">
            {open.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  onPick(slotMoment(chosenDay, t), `${format(chosenDay, "EEE d MMM yyyy")} at ${formatSlot(t)}`)
                }
                className="rounded-lg border border-[var(--cf-chip-border)] px-2 py-2 text-xs transition-colors hover:border-transparent hover:bg-[var(--cf-accent)] hover:text-[var(--cf-accent-text)]"
              >
                {formatSlot(t)}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-[19rem] rounded-[var(--cf-radius-card)] border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] p-3">
      <DayPicker
        mode="single"
        selected={chosenDay ?? undefined}
        onDayClick={(day, modifiers) => {
          if (!modifiers.disabled) choose(day);
        }}
        month={cursor}
        onMonthChange={setCursor}
        startMonth={startMonth}
        endMonth={endMonth}
        captionLayout="dropdown"
        weekStartsOn={1}
        fixedWeeks
        showOutsideDays
        disabled={disabled}
        formatters={{
          formatMonthDropdown: (d) => format(d, "MMM"),
          formatWeekdayName: (d) => format(d, "EEEEE"),
        }}
        classNames={CALENDAR_CLASSES}
        components={{
          Chevron: ({ orientation, className }) =>
            orientation === "left" ? (
              <ChevronLeft className={cn("size-4", className)} />
            ) : orientation === "right" ? (
              <ChevronRight className={cn("size-4", className)} />
            ) : (
              <ChevronDown className={cn("size-3.5 opacity-60", className)} />
            ),
        }}
      />

      {quick.length > 0 && (
        <div className="mt-2 flex gap-1.5 border-t border-[var(--cf-chip-border)] pt-2">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => choose(q.date)}
              className="rounded-full px-2.5 py-1 text-xs opacity-70 transition-opacity hover:opacity-100"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/*
  Unstyled react-day-picker, dressed in the chat theme's variables so it
  follows each form's colours the way the rest of the composers do. Six fixed
  weeks, so the card never changes height between months.

  The dropdowns are the library's native selects laid invisibly over a styled
  label: the picker a phone offers for a select is the fastest way to a year.
*/
const CALENDAR_CLASSES: Partial<ClassNames> = {
  root: "relative w-full",
  months: "relative",
  month: "space-y-2",
  nav: "absolute inset-x-0 top-0 flex items-center justify-between",
  button_previous:
    "grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--cf-chip-border)]/30 disabled:pointer-events-none disabled:opacity-25",
  button_next:
    "grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--cf-chip-border)]/30 disabled:pointer-events-none disabled:opacity-25",
  month_caption: "flex h-8 items-center justify-center px-9",
  dropdowns: "flex items-center gap-1.5 text-sm font-medium",
  dropdown_root:
    "relative rounded-lg border border-[var(--cf-chip-border)] has-focus-visible:border-[var(--cf-accent)]",
  dropdown: "absolute inset-0 w-full cursor-pointer opacity-0",
  caption_label: "flex h-8 items-center gap-1 pr-1.5 pl-2.5 text-sm font-medium select-none",
  month_grid: "w-full border-collapse",
  weekdays: "grid grid-cols-7 gap-0.5",
  weekday: "pb-1 text-center text-[0.625rem] font-normal opacity-50",
  weeks: "grid gap-0.5",
  week: "grid grid-cols-7 gap-0.5",
  day: "p-0 text-center",
  day_button:
    "grid h-9 w-full place-items-center rounded-lg text-xs transition-colors duration-[var(--duration-micro)] enabled:hover:bg-[var(--cf-accent)] enabled:hover:text-[var(--cf-accent-text)] disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--cf-accent)]",
  outside: "opacity-25",
  disabled: "opacity-20",
  today: "font-semibold [&>button]:ring-1 [&>button]:ring-[var(--cf-accent)] [&>button]:ring-inset",
  selected: "[&>button]:bg-[var(--cf-accent)] [&>button]:text-[var(--cf-accent-text)]",
  hidden: "invisible",
};

/** A block's `YYYY-MM-DD` bound as a local day, or nothing when it doesn't parse. */
function parseBound(value?: string): Date | null {
  if (!value) return null;
  const day = parseISO(value);
  return isValid(day) ? startOfDay(day) : null;
}

/**
 * A slot as the moment it names: the time on this browser's clock, with that
 * clock's offset on the day (`2026-10-03T17:00+05:30`). The server stores it in
 * UTC and checks the form's time window against the time they actually saw.
 */
function slotMoment(day: Date, hhmm: string): string {
  const [h = "0", m = "0"] = hhmm.split(":");
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(h), Number(m));
  return format(at, "yyyy-MM-dd'T'HH:mmxxx");
}

/** "Times in GMT+5:30": the times on the pad are theirs, and this says so. */
function zoneLabel(day: Date): string | null {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(day)
      .find((p) => p.type === "timeZoneName")?.value;
    return name ? `Times in ${name}` : null;
  } catch {
    return null;
  }
}

/** 24h in, human out — "14:30" reads as "2:30 pm" to most respondents. */
function formatSlot(hhmm: string): string {
  const [h = "0", m = "00"] = hhmm.split(":");
  const hour = Number(h);
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${suffix}`;
}
