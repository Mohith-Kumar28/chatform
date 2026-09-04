"use client";

import { useState } from "react";
import { Heart, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rating composer.
 *
 * The old one rendered emoji (⭐ / 🧡) with `hover:scale-125` — emoji render
 * differently on every platform, can't be recoloured to the form's theme, and
 * scaled independently so hovering the 4th star did nothing to the first three.
 * These are lucide icons that fill left-to-right on hover, like every rating
 * control people already know.
 */
export function RatingComposer({
  scale,
  shape,
  onPick,
}: {
  scale: number;
  shape: "star" | "heart" | "number";
  onPick: (value: number, display: string) => void;
}) {
  const [hover, setHover] = useState(0);

  if (shape === "number") {
    return (
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Rating">
        {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={false}
            onClick={() => onPick(n, String(n))}
            className={cn(
              "size-11 rounded-full border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] text-sm font-medium",
              "transition-[background-color,border-color,transform] duration-[var(--duration-micro)]",
              "hover:border-[var(--cf-accent)] active:scale-95 motion-reduce:active:scale-100",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }

  const Icon = shape === "heart" ? Heart : Star;

  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-label="Rating"
      onMouseLeave={() => setHover(0)}
    >
      {Array.from({ length: scale }, (_, i) => i + 1).map((n) => {
        const filled = n <= hover;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={false}
            aria-label={`${n} of ${scale}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onClick={() => onPick(n, `${n}/${scale}`)}
            className="grid size-11 place-items-center rounded-full transition-transform duration-[var(--duration-micro)] active:scale-90 motion-reduce:active:scale-100"
          >
            <Icon
              className={cn(
                "size-7 transition-colors duration-[var(--duration-micro)]",
                filled ? "text-[var(--cf-accent)]" : "opacity-30",
              )}
              fill={filled ? "currentColor" : "none"}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * NPS and opinion scales. Anchor labels are shown — the old version rendered
 * bare numbers, so "0" and "10" carried no meaning.
 */
export function ScaleComposer({
  min,
  max,
  labelLow,
  labelHigh,
  onPick,
}: {
  min: number;
  max: number;
  labelLow?: string;
  labelHigh?: string;
  onPick: (value: number, display: string) => void;
}) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    // `w-fit`: the anchor labels are justified against the scale, so the row
    // has to be the width of the scale. Stretched to the column, "Extremely
    // likely" floated off on its own, hundreds of pixels from the 10.
    <div className="w-fit max-w-full space-y-2">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Scale">
        {values.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={false}
            onClick={() => onPick(n, String(n))}
            className={cn(
              "min-w-11 rounded-xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-3 py-2.5 text-sm font-medium",
              "transition-[background-color,border-color,transform] duration-[var(--duration-micro)]",
              "hover:border-[var(--cf-accent)] hover:bg-[var(--cf-accent)] hover:text-[var(--cf-accent-text)]",
              "active:scale-95 motion-reduce:active:scale-100",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {(labelLow || labelHigh) && (
        <div className="flex justify-between gap-4 text-xs opacity-60">
          <span>{labelLow}</span>
          <span>{labelHigh}</span>
        </div>
      )}
    </div>
  );
}
