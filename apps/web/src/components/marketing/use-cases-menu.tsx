"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { USE_CASE_GROUPS } from "@/content/use-cases";
import { cn } from "@/lib/utils";

/**
 * The one nav item that opens.
 *
 * A disclosure button and a list of links, not a `DropdownMenu`. Radix's menu
 * gives its children `role="menuitem"`, which tells a screen reader these are
 * commands in an application menu; they are links to pages, and announcing
 * them otherwise costs the one group of people who most need the announcement
 * to be accurate.
 *
 * Opens on hover for a mouse, on click or Enter for everything else, and
 * closes on Escape or on focus leaving the group. The 120ms close delay is
 * what stops the panel vanishing while the pointer crosses the gap between the
 * button and the first link — the single most common way a hover menu becomes
 * unusable.
 */
export function UseCasesMenu({ onWash }: { onWash: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapper = useRef<HTMLLIElement>(null);

  const cancelClose = () => clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <li
      ref={wrapper}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => {
        cancelClose();
        setOpen(true);
      }}
      onBlur={(event) => {
        if (!wrapper.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        className={cn(
          "text-body inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition-colors duration-[var(--duration-micro)]",
          onWash
            ? "opacity-75 hover:bg-black/5 hover:opacity-100"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
        )}
      >
        Use cases
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform duration-[var(--duration-micro)]",
            open && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {/* `hidden` rather than unmounting: the panel is a list of internal links,
          and leaving it in the document lets Next prefetch them and lets a
          crawler that ignores our JS still find them. */}
      <div
        id={panelId}
        hidden={!open}
        /* The ink is reset here. The nav borrows the hero's near-black while it
           sits over the wash, and this panel has its own cream ground under it
           — inheriting that ink would be the only thing on the page reading as
           a colour it did not choose. */
        style={{ color: "var(--color-foreground)" }}
        className="border-border/70 bg-popover absolute top-full left-0 z-[var(--z-dropdown)] mt-2 w-[min(56rem,90vw)] rounded-2xl border p-5 shadow-lg"
      >
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASE_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-micro text-muted-foreground font-semibold tracking-[0.12em] uppercase">
                {group.title}
              </h3>
              <ul className="mt-2 flex flex-col">
                {group.items.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={item.path}
                      onClick={() => setOpen(false)}
                      className="hover:bg-accent/60 -mx-2 block rounded-lg px-2 py-1.5 transition-colors duration-[var(--duration-micro)]"
                    >
                      <span className="text-body block font-medium">{item.name}</span>
                      <span className="text-micro text-muted-foreground block leading-snug">
                        {item.audience}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-border/60 mt-5 border-t pt-4">
          <Link
            href="/use-cases"
            onClick={() => setOpen(false)}
            className="text-caption text-primary font-medium"
          >
            Every guide, with what each one is for →
          </Link>
        </div>
      </div>
    </li>
  );
}
