"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { Flag, ShieldAlert } from "lucide-react";
import type { FormDoc } from "@repo/form-schema";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, blockMeta } from "./block-library";

/**
 * "Go to …", as something you can find by typing.
 *
 * A flow picks its destination from every question and every ending the form
 * has, which on a real form is twenty-odd rows of title — and titles are
 * sentences, so the list read as a wall of prose with nothing to scan by. The
 * only way to pick the fourth question was to recognise its wording, truncated
 * at 40 characters, in a column of other wordings. Authors were routing to the
 * wrong question and finding out from the canvas.
 *
 * Three things fix that, and they are the three things this adds over the
 * plain select it replaces:
 *
 *   - **Type at it.** The search box filters as you type, so "referral" beats
 *     scrolling. This is the one that matters on a long form.
 *   - **The question's own icon**, in its family colour — the same chip the
 *     block list, the palette and the results columns draw. A number question
 *     is recognisable as a number question before its title is read at all.
 *   - **Its position.** "Q4" is how the Questions list, the canvas node and
 *     this row all name the same question, so a position carried over from
 *     either of the other two views lands on the right row here.
 *
 * Endings keep the flag/shield pair and the green/red the canvas gives them,
 * because "which ending" is the choice most worth getting right: a failing
 * answer pointed at the success ending is a form that congratulates the people
 * it just turned away.
 */

export type TargetKind = "block" | "ending";

interface TargetItem {
  ref: string;
  label: string;
  kind: TargetKind;
  /** Block position, 1-based, as every other view numbers it. */
  position?: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Tailwind classes for the icon chip: family tint, or an outcome colour. */
  chip: string;
}

interface TargetGroup {
  value: string;
  items: TargetItem[];
}

function itemsFor(doc: FormDoc, include: "all" | "blocks"): TargetGroup[] {
  const groups: TargetGroup[] = [];
  const questions = doc.blocks.map((b, i): TargetItem => {
    const meta = blockMeta(b.type);
    return {
      ref: b.ref,
      label: b.title || b.ref,
      kind: "block",
      position: i + 1,
      icon: meta.icon,
      chip: TONE_CLASSES[meta.tone],
    };
  });
  if (questions.length > 0) groups.push({ value: "Questions", items: questions });

  if (include === "all" && doc.endings.length > 0) {
    groups.push({
      value: "Endings",
      items: doc.endings.map((e): TargetItem => {
        const screenOut = e.kind === "screen_out";
        return {
          ref: e.ref,
          label: e.title || e.ref,
          kind: "ending",
          icon: screenOut ? ShieldAlert : Flag,
          chip: screenOut
            ? "bg-[var(--destructive-soft)] text-[var(--destructive-soft-foreground)]"
            : "bg-[var(--success-soft)] text-[var(--success-soft-foreground)]",
        };
      }),
    });
  }
  return groups;
}

function Chip({ item }: { item: TargetItem }) {
  const Icon = item.icon;
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-[5px]", item.chip)}>
      <Icon className="size-3" strokeWidth={2} />
    </span>
  );
}

export function FlowTargetCombobox({
  doc,
  value,
  onChange,
  include = "all",
  size = "sm",
  className,
  placeholder = "Pick a destination…",
  ariaLabel = "Go to",
}: {
  doc: FormDoc;
  value: string;
  onChange: (ref: string, kind: TargetKind) => void;
  /** `blocks` for the "from" end of a wire, which cannot start at an ending. */
  include?: "all" | "blocks";
  size?: "sm" | "default";
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const groups = React.useMemo(() => itemsFor(doc, include), [doc, include]);
  const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const selected = flat.find((i) => i.ref === value) ?? null;

  return (
    <ComboboxPrimitive.Root
      items={groups}
      value={selected}
      /*
        Items are objects, and a redraw of the document makes new ones. Matching
        on the ref rather than on identity is what keeps the tick beside the
        current destination across an edit somewhere else on the canvas.
      */
      isItemEqualToValue={(item: TargetItem, current: TargetItem) => item?.ref === current?.ref}
      /*
        Filtering and typeahead read this, so it is the title alone: a search
        box that also matches text the row does not show is a search box that
        returns rows for no visible reason.
      */
      itemToStringLabel={(item: TargetItem) => item.label}
      onValueChange={(item: TargetItem | null) => {
        if (item) onChange(item.ref, item.kind);
      }}
    >
      <ComboboxPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "border-input flex w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-transparent px-2 text-sm shadow-xs transition-[color,box-shadow] outline-none select-none",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "data-[popup-open]:border-ring dark:bg-input/30 dark:hover:bg-input/50",
          size === "sm" ? "h-8" : "h-9",
          className,
        )}
      >
        <ComboboxPrimitive.Value placeholder={placeholder}>
          {(item: TargetItem | null) =>
            item ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Chip item={item} />
                <span className="truncate text-xs">{item.label}</span>
              </span>
            ) : (
              <span className="text-muted-foreground truncate text-xs">{placeholder}</span>
            )
          }
        </ComboboxPrimitive.Value>
        <ComboboxPrimitive.Icon className="text-muted-foreground shrink-0">
          <ChevronIcon />
        </ComboboxPrimitive.Icon>
      </ComboboxPrimitive.Trigger>

      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner
          sideOffset={4}
          align="start"
          className="z-[var(--z-popover)] outline-none"
        >
          <ComboboxPrimitive.Popup
            aria-label={ariaLabel}
            className={cn(
              "bg-popover text-popover-foreground ring-foreground/10 max-h-[22rem] w-(--anchor-width) max-w-(--available-width)",
              "origin-(--transform-origin) overflow-hidden rounded-lg shadow-md ring-1",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              // A short panel on a canvas: never narrower than the popup's own
              // search box, however narrow the inspector row that anchors it.
              "min-w-[16rem]",
            )}
          >
            <div className="p-1 pb-0">
              <ComboboxPrimitive.Input
                placeholder="Search questions and endings…"
                className={cn(
                  "border-input bg-input/30 placeholder:text-muted-foreground h-8 w-full rounded-md border px-2 text-xs",
                  "focus:border-ring focus:ring-ring/40 outline-none focus:ring-[2px]",
                )}
              />
            </div>
            <ComboboxPrimitive.Empty className="text-muted-foreground px-3 py-6 text-center text-xs">
              Nothing matches that.
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List className="max-h-[18rem] scroll-py-1 overflow-y-auto overscroll-contain p-1">
              {(group: TargetGroup) => (
                <ComboboxPrimitive.Group key={group.value} items={group.items} className="pb-1 last:pb-0">
                  <ComboboxPrimitive.GroupLabel className="text-muted-foreground px-2 py-1.5 text-[10px] font-medium tracking-wide uppercase">
                    {group.value}
                  </ComboboxPrimitive.GroupLabel>
                  <ComboboxPrimitive.Collection>
                    {(item: TargetItem) => (
                      <ComboboxPrimitive.Item
                        key={item.ref}
                        value={item}
                        className={cn(
                          "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                          "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-7 pl-2 text-sm outline-hidden select-none",
                        )}
                      >
                        <Chip item={item} />
                        <span className="min-w-0 flex-1 truncate text-xs">{item.label}</span>
                        {item.position !== undefined && (
                          <span className="text-muted-foreground tabular shrink-0 text-[10px]">
                            Q{item.position}
                          </span>
                        )}
                        <ComboboxPrimitive.ItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center">
                          <CheckIcon />
                        </ComboboxPrimitive.ItemIndicator>
                      </ComboboxPrimitive.Item>
                    )}
                  </ComboboxPrimitive.Collection>
                </ComboboxPrimitive.Group>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m2.5 8.5 4 4 7-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
