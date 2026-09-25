"use client";

import { Angry, Frown, Laugh, Meh, Smile } from "lucide-react";
import { FEEDBACK_LABELS } from "@repo/form-schema";
import { cn } from "@/lib/utils";

/**
 * Five faces, and a word under the one picked.
 *
 * Shared by the respondent's "Report a bug" panel in the chat runtime and the
 * builder's feedback panel, so the two cannot drift. The only difference is
 * where the colours come from: the runtime themes from the form's `--cf-*`
 * variables, the app from its own `--rating-*` ramp.
 *
 * Lucide rather than emoji: emoji are drawn by the operating system, so the same
 * five characters are a different set of faces, sometimes a different sentiment,
 * on a phone, a Mac and a Windows machine. The words come from
 * `@repo/form-schema` because the API says them back in the founders' mail.
 */
export const FACES = [
  { rating: 1, label: FEEDBACK_LABELS[1], Icon: Angry },
  { rating: 2, label: FEEDBACK_LABELS[2], Icon: Frown },
  { rating: 3, label: FEEDBACK_LABELS[3], Icon: Meh },
  { rating: 4, label: FEEDBACK_LABELS[4], Icon: Smile },
  { rating: 5, label: FEEDBACK_LABELS[5], Icon: Laugh },
] as const;

export function FaceRating({
  value,
  onChange,
  ramp = "--rating",
  pickedGround = "transparent",
  className,
}: {
  value: number | null;
  onChange: (rating: number) => void;
  /** The colour variables' prefix: `--cf-rating` in the runtime, `--rating` in the app. */
  ramp?: string;
  /** What the picked face's wash is mixed into; see-through by default, so it tints whatever it sits on. */
  pickedGround?: string;
  className?: string;
}) {
  const picked = FACES.find((f) => f.rating === value);
  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-1.5" role="radiogroup" aria-label="How is it going?">
        {FACES.map(({ rating, label, Icon }) => {
          const on = value === rating;
          return (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(rating)}
              aria-label={label}
              /*
                Each face wears its own step of the ramp, red for terrible through
                green for great, so the scale reads as a scale before a word is
                read. The picked one gets a wash of its own colour, never the
                brand's: "terrible" in the accent says something nobody meant.
              */
              style={
                {
                  "--face": `var(${ramp}-${rating})`,
                  color: "var(--face)",
                  background: on ? `color-mix(in oklch, var(--face) 14%, ${pickedGround})` : undefined,
                } as React.CSSProperties
              }
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-2.5",
                "transition-[background-color,border-color,transform,opacity] duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                "active:scale-[0.96] motion-reduce:active:scale-100",
                on ? "border-[var(--face)]" : "border-transparent opacity-50 hover:opacity-100",
              )}
            >
              <Icon className="size-7" strokeWidth={on ? 2 : 1.75} />
            </button>
          );
        })}
      </div>
      {/* Always there, so the first tap does not push everything below it down a row. */}
      <p className="mt-1.5 h-4 text-center text-xs font-medium opacity-70">{picked?.label ?? ""}</p>
    </div>
  );
}
