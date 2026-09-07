"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The explanation, folded away until it is wanted.
 *
 * A caveat printed under every meter — "unlimited, up to a monthly ceiling for fair
 * use" — is read once and then becomes furniture that the numbers have to be found
 * between. But it still has to exist: a ceiling nobody mentioned is a surprise, and the
 * degraded-AI behaviour past the cap is genuinely something a customer needs to be able
 * to look up.
 *
 * So it lives behind an icon. On by click rather than hover, because a hover-only
 * disclosure is unreachable on a touch screen — which is most of where a usage page gets
 * glanced at.
 */
export function InfoHint({
  children,
  label = "More information",
  align = "end",
  className,
}: {
  children: React.ReactNode;
  /** Named for screen readers, since the trigger is an icon with no text. */
  label?: string;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "text-muted-foreground/60 hover:text-foreground focus-visible:ring-ring/50 grid size-5 shrink-0 place-items-center rounded-full",
            "transition-colors duration-[var(--duration-micro)] focus-visible:ring-2 focus-visible:outline-hidden",
            className,
          )}
        >
          <Info className="size-3.5" strokeWidth={2} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align={align}
        className="text-muted-foreground w-60 rounded-xl p-3 text-xs leading-relaxed text-pretty"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
