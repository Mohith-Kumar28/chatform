"use client";

import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/*
  An icon until it is wanted. The field is always mounted, just
  narrow and transparent, so the click that opens it can focus it in
  the same tick; it closes again on blur once it is empty, and Escape
  clears it. A query keeps it open, because a filtered grid with its
  filter hidden reads as forms gone missing.
*/
export function ExpandingSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const searchExpanded = open || value !== "";
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={cn(
        "relative h-9 min-w-0 transition-[width] duration-[var(--duration-standard)] ease-[var(--ease-out)] motion-reduce:transition-none",
        searchExpanded ? "w-56 sm:w-72" : "w-9",
      )}
    >
      <button
        type="button"
        aria-label="Search forms"
        tabIndex={searchExpanded ? -1 : 0}
        onClick={() => {
          setOpen(true);
          searchRef.current?.focus();
        }}
        className={cn(
          "text-muted-foreground hover:text-foreground hover:bg-accent absolute inset-y-0 left-0 z-10 grid w-9 place-items-center rounded-full transition-colors",
          searchExpanded && "pointer-events-none",
        )}
      >
        <Search className="size-4" />
      </button>
      <Input
        ref={searchRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            e.currentTarget.blur();
          }
        }}
        tabIndex={searchExpanded ? 0 : -1}
        aria-hidden={!searchExpanded}
        placeholder="Search forms…"
        className={cn(
          "h-9 w-full rounded-full pl-9 transition-opacity duration-[var(--duration-micro)]",
          !searchExpanded && "pointer-events-none border-transparent opacity-0 shadow-none",
        )}
      />
    </div>
  );
}
