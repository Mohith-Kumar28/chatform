"use client";

import { useId } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";

/** Whether what was typed matches the phrase. Surrounding spaces never count against it. */
export function phraseMatches(typed: string, phrase: string): boolean {
  return typed.trim() === phrase.trim();
}

/**
 * The second confirmation on anything that destroys data: the name of the
 * thing, typed (or copied and pasted) before the button unlocks. A click can
 * be a slip; typing a name cannot.
 */
export function TypeToConfirm({
  phrase,
  value,
  onChange,
  disabled,
}: {
  phrase: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
        Type
        <span className="bg-muted text-foreground inline-flex max-w-full items-center gap-0.5 rounded-md py-0.5 pr-0.5 pl-2 font-mono text-xs font-medium break-all">
          {phrase}
          <CopyButton value={phrase} size="icon-xs" />
        </span>
        to confirm.
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
      />
    </div>
  );
}
