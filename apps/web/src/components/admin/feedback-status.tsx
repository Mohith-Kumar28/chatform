"use client";

import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A report is either dealt with or it is not.
 *
 * Two states, stored as `new` and `resolved`. There was a third, spam, behind a
 * three-way control that read as tabs; one button that says what it does is
 * the whole of triage for a queue read by one or two people.
 */

export const isResolved = (status: string) => status === "resolved";

/** A dot and a word, for a table cell. */
export function StatusLabel({ status, className }: { status: string; className?: string }) {
  const done = isResolved(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", !done && "text-muted-foreground", className)}>
      <span
        className={cn("size-2 shrink-0 rounded-full", done ? "bg-[var(--success)]" : "bg-[var(--warning)]")}
        aria-hidden
      />
      {done ? "Resolved" : "Unresolved"}
    </span>
  );
}

/**
 * The one thing you do to a report.
 *
 * Unresolved: a primary "Mark resolved". Resolved: the status itself, said
 * plainly, with a separate quiet "Reopen" — never one button whose label swaps
 * on hover, which changes what a control *is* while the pointer is on it.
 */
export function ResolveButton({
  status,
  disabled,
  onChange,
}: {
  status: string;
  disabled?: boolean;
  onChange: (next: "new" | "resolved") => void;
}) {
  if (isResolved(status)) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex h-8 items-center gap-1.5 px-2 text-sm font-medium">
          <Check className="size-4 text-[var(--success)]" aria-hidden />
          Resolved
        </span>
        <Button variant="ghost" size="sm" shape="pill" disabled={disabled} onClick={() => onChange("new")}>
          <RotateCcw className="size-3.5" />
          Reopen
        </Button>
      </span>
    );
  }
  return (
    <Button size="sm" shape="pill" disabled={disabled} onClick={() => onChange("resolved")}>
      <Check className="size-3.5" />
      Mark resolved
    </Button>
  );
}
