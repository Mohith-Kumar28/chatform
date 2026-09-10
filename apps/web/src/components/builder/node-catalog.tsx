"use client";

import { cn } from "@/lib/utils";
import {
  CATALOG,
  CATALOG_GROUPS,
  filterCatalog,
  type CatalogItem,
} from "./block-library";

/**
 * The one palette, in two densities.
 *
 * The Questions picker and the Flow node library are the same question asked
 * twice — "what can go in this form?" — and they used to answer it with two
 * hand-written lists in two orders, one of which had never heard of endings.
 * One component, one order, both places.
 *
 * `compact` is the canvas palette: a tinted draggable row per item, sized to a
 * 15rem sidebar. `detailed` is the picker: an icon chip, the name, and what it
 * is for, because the picker is where you go when you do not already know.
 */
export function NodeCatalog({
  query = "",
  variant,
  onPick,
  onDragStart,
  reason,
  className,
}: {
  /** Search text; empty shows everything. */
  query?: string;
  variant: "compact" | "detailed";
  onPick?: (item: CatalogItem) => void;
  onDragStart?: (item: CatalogItem) => void;
  /** Why an item cannot be used here. A reason disables the row and titles it. */
  reason?: (item: CatalogItem) => string | undefined;
  className?: string;
}) {
  const matches = filterCatalog(query);

  if (matches.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Nothing matches “{query.trim()}”.
      </p>
    );
  }

  return (
    <div className={className}>
      {CATALOG_GROUPS.map((group) => {
        const items = matches.filter((i) => i.group === group);
        if (!items.length) return null;
        return (
          <div key={group} className={variant === "compact" ? "mb-4" : "mb-2"}>
            <p
              className={cn(
                "text-muted-foreground font-medium tracking-wide uppercase",
                variant === "compact" ? "mb-1.5 text-[10px] font-semibold" : "text-micro px-2 py-1",
              )}
            >
              {group}
            </p>
            <div className={variant === "compact" ? "space-y-1" : undefined}>
              {items.map((item) => (
                <CatalogRow
                  key={item.id}
                  item={item}
                  variant={variant}
                  disabledReason={reason?.(item)}
                  onPick={onPick}
                  onDragStart={onDragStart}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CatalogRow({
  item,
  variant,
  disabledReason,
  onPick,
  onDragStart,
}: {
  item: CatalogItem;
  variant: "compact" | "detailed";
  disabledReason?: string | undefined;
  onPick?: (item: CatalogItem) => void;
  onDragStart?: (item: CatalogItem) => void;
}) {
  const draggable = !!onDragStart && !disabledReason;

  if (variant === "compact") {
    return (
      <div
        draggable={draggable}
        onDragStart={draggable ? () => onDragStart!(item) : undefined}
        onClick={disabledReason ? undefined : () => onPick?.(item)}
        title={disabledReason ?? item.description}
        aria-disabled={disabledReason ? true : undefined}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs",
          "transition-opacity duration-[var(--duration-micro)]",
          item.toneClass,
          disabledReason
            ? "cursor-not-allowed opacity-40"
            : cn("opacity-[0.82] hover:opacity-100", draggable && "cursor-grab active:cursor-grabbing"),
        )}
      >
        <item.icon className="size-3.5 shrink-0" strokeWidth={2} />
        {item.label}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!!disabledReason}
      onClick={() => onPick?.(item)}
      title={disabledReason}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
        disabledReason ? "cursor-not-allowed opacity-45" : "hover:bg-muted/70",
      )}
    >
      <div className={cn("grid size-7 shrink-0 place-items-center rounded-lg", item.toneClass)}>
        <item.icon className="size-3.5" strokeWidth={1.75} />
      </div>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{item.label}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {disabledReason ?? item.description}
        </span>
      </span>
    </button>
  );
}

/** The first item a search would pick, for ↵ in the picker's search box. */
export function firstCatalogMatch(query: string): CatalogItem | undefined {
  const matches = filterCatalog(query);
  for (const group of CATALOG_GROUPS) {
    const hit = matches.find((i) => i.group === group);
    if (hit) return hit;
  }
  return CATALOG[0];
}
