"use client";

import * as React from "react";
import { HoverCard as HoverCardPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * A panel that opens on hover, on the ordinary surface.
 *
 * Not a tooltip. A tooltip is a phrase drawn on `--foreground` — inverted, so
 * every colour inside it has to be restated against the opposite ground, which
 * is why one has never carried anything but text here. A hover card is a small
 * popover: same tokens as the rest of the app, so a status colour, a border or
 * a rule means in it exactly what it means everywhere else, and a component
 * can be shown in one without being redrawn for it.
 *
 * Hover only, and by design: everything inside one must also be reachable
 * somewhere a touch device and a keyboard can get to it. Radix opens it on
 * focus as well, which covers the keyboard; the other half is the caller's job.
 */
function HoverCard({ openDelay = 120, closeDelay = 80, ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" openDelay={openDelay} closeDelay={closeDelay} {...props} />;
}

function HoverCardTrigger({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

function HoverCardContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-[var(--z-popover)] w-72 origin-(--radix-hover-card-content-transform-origin) rounded-lg border bg-popover p-3 text-popover-foreground shadow-md outline-hidden",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
