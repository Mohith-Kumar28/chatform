"use client"

import * as React from "react"
import { Command as CommandPrimitive, defaultFilter } from "cmdk"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * cmdk's own filter is a subsequence match: a value counts as a hit whenever
 * the typed letters appear in order anywhere inside it, however far apart.
 * Typing "docs" in the palette put seven unrelated templates above the docs
 * pages themselves, because "Customer satisfaction Pro(d)uct csat feedback
 * supp(o)rt bran(c)hing" is a match by that rule — and once tags and category
 * are folded into the searchable string, almost everything is.
 *
 * Requiring each typed word to appear as a real substring throws those out.
 * Ranking is still cmdk's, so the things that genuinely match order as before;
 * the positional fallback only covers words typed out of order, which
 * command-score scores at zero.
 */
function substringFilter(value: string, search: string, keywords?: string[]): number {
  const haystack = (keywords?.length ? `${value} ${keywords.join(" ")}` : value).toLowerCase()
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 1
  let earliest = Number.POSITIVE_INFINITY
  for (const term of terms) {
    const at = haystack.indexOf(term)
    if (at === -1) return 0
    earliest = Math.min(earliest, at)
  }
  return defaultFilter(value, search, keywords) || 1 / (1 + earliest)
}

/**
 * The ⌘K palette hand-styled `cmdk` inline, with the group and item classes
 * kept as two module-level string constants passed to every element. That
 * works exactly once — the moment a second surface wants the same list (a
 * template search, an in-dialog picker) the styling has to be copied.
 *
 * Same visual language as before; it just lives in the primitive now.
 */
function Command({
  className,
  filter = substringFilter,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      filter={filter}
      className={cn(
        // No `h-full`: nothing here wraps the palette in a sized dialog, so
        // that stretched the card to the whole viewport and left a page of
        // empty card hanging below the footer. It hugs its list instead.
        "bg-card text-foreground flex w-full flex-col overflow-hidden rounded-xl",
        className
      )}
      {...props}
    />
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="border-border flex items-center gap-2 border-b px-4">
      <SearchIcon className="text-muted-foreground size-4 shrink-0" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("max-h-80 scroll-py-2 overflow-x-hidden overflow-y-auto p-2", className)}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("text-muted-foreground py-10 text-center text-sm", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground overflow-hidden",
        "[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        "first:[&_[cmdk-group-heading]]:pt-1",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-2 my-1 h-px", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm outline-none select-none",
        "data-[selected=true]:bg-muted data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("text-muted-foreground ml-auto text-xs tracking-widest", className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
}
