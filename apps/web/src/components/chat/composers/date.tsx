"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import {
  addMonths,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  addDays,
} from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Date composer.
 *
 * `date` blocks previously fell through to a plain text input, so a respondent
 * had to guess the expected format and the answer failed validation if they
 * guessed wrong. This is a real calendar that respects the block's min/max and
 * `disablePast`, plus quick options for the common cases.
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
  const [cursor, setCursor] = useState(() => startOfMonth(today));
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
    const fromMin = min ? startOfDay(new Date(min)) : null;
    if (disablePast) return fromMin && isAfter(fromMin, today) ? fromMin : today;
    return fromMin;
  }, [min, disablePast, today]);

  const upperBound = useMemo(() => (max ? startOfDay(new Date(max)) : null), [max]);

  function disabled(day: Date) {
    if (lowerBound && isBefore(day, lowerBound)) return true;
    if (upperBound && isAfter(day, upperBound)) return true;
    return false;
  }

  // Six weeks from the Monday on or before the 1st — a stable grid, so the
  // calendar never changes height between months.
  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const monthEnd = endOfMonth(cursor);

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

  if (includeTime && chosenDay) {
    const open = slots.filter((t) => !slotPassed(chosenDay, t));
    return (
      <div className="w-full max-w-[19rem] rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] p-3">
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
            Pick a time
          </span>
        </div>

        {open.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs opacity-60">
            No times left on that day — pick another one.
          </p>
        ) : (
          <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto">
            {open.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  onPick(
                    `${format(chosenDay, "yyyy-MM-dd")}T${t}`,
                    `${format(chosenDay, "EEE d MMM yyyy")} at ${formatSlot(t)}`,
                  )
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
    <div className="w-full max-w-[19rem] rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setCursor((c) => addMonths(c, -1))}
          className="grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--cf-chip-border)]/30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium">{format(cursor, "MMMM yyyy")}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--cf-chip-border)]/30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[0.625rem] opacity-50">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const outside = isBefore(day, startOfMonth(cursor)) || isAfter(day, monthEnd);
          const isDisabled = disabled(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => choose(day)}
              aria-label={format(day, "EEEE d MMMM yyyy")}
              className={cn(
                "grid h-9 place-items-center rounded-lg text-xs transition-colors duration-[var(--duration-micro)]",
                outside && "opacity-25",
                isDisabled && "cursor-not-allowed opacity-20",
                !isDisabled && "hover:bg-[var(--cf-accent)] hover:text-[var(--cf-accent-text)]",
                isToday(day) && "font-semibold ring-1 ring-[var(--cf-accent)] ring-inset",
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      {!lowerBound || !isAfter(lowerBound, today) ? (
        <div className="mt-2 flex gap-1.5 border-t border-[var(--cf-chip-border)] pt-2">
          {[
            { label: "Today", date: today },
            { label: "Tomorrow", date: addDays(today, 1) },
            { label: "Next week", date: addDays(today, 7) },
          ]
            .filter((q) => !disabled(q.date))
            .map((q) => (
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
      ) : null}
    </div>
  );
}

/** 24h in, human out — "14:30" reads as "2:30 pm" to most respondents. */
function formatSlot(hhmm: string): string {
  const [h = "0", m = "00"] = hhmm.split(":");
  const hour = Number(h);
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${suffix}`;
}
