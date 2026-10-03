"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Settings that belong to a switch, shown while the switch is off.
 *
 * Hiding them until the switch is on leaves an author with no idea what the
 * switch would give them. They stay on screen instead, greyed and out of reach,
 * and hovering anywhere over them says which switch to turn on.
 *
 * The tree is the same shape either way, so a box somebody was typing in is
 * not remounted when the switch flips.
 */
export function BlockedUntilOn({
  blocked,
  message,
  className,
  children,
}: {
  blocked: boolean;
  /** Names the switch, e.g. "Turn on Send follow-up emails first". */
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip open={blocked ? undefined : false}>
        <TooltipTrigger asChild>
          <div className={cn(blocked && "cursor-not-allowed", className)}>
            <div
              inert={blocked}
              className={cn(
                className,
                "transition-opacity duration-[var(--duration-micro)]",
                blocked && "pointer-events-none opacity-45 select-none",
              )}
            >
              {children}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">{message}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
