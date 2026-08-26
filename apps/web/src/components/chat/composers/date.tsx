"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isSameDay,
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
  onPick,
}: {
  min?: string;
  max?: string;
  disablePast?: boolean;
  onPick: (iso: string, display: string) => void;
}) {
  const today = startOfDay(new Date());
  const [cursor, setCursor] = useState(() => startOfMonth(today));

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
    onPick(format(day, "yyyy-MM-dd"), format(day, "EEE d MMM yyyy"));
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
