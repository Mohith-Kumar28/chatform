"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, X } from "lucide-react";
import { Chip } from "./primitives";

/** The server keeps up to this many characters of an "Other" answer. */
export const MAX_OTHER_LENGTH = 200;

/**
 * "Other", where the author allowed it: a chip that opens a box for the
 * respondent's own answer, the way Google Forms does it.
 *
 * Controlled, because a multi-select sends it together with the picked chips
 * while a single select sends it on its own. `value` is `null` while closed.
 *
 * `data-own-keys` keeps the digit and Enter shortcuts out of the box: they fire
 * in an empty text field by design (see `useChoiceKeys`), which here would pick
 * option 1 when someone started typing "1990s synth".
 */
export function OtherOption({
  value,
  onChange,
  onSubmit,
  disabled,
  submitLabel,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Enter, or the send button. Omitted on a multi-select, where Continue sends everything. */
  onSubmit?: (text: string) => void;
  disabled?: boolean;
  submitLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const open = value !== null;
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <Chip disabled={disabled} onClick={() => onChange("")}>
        Other…
      </Chip>
    );
  }

  const text = value.trim();
  return (
    <div
      data-own-keys
      className="inline-flex min-h-[2.75rem] w-full max-w-sm items-center gap-1 rounded-full border border-[var(--cf-accent)] bg-[var(--cf-chip-bg)] py-1 pr-1 pl-3.5 sm:min-h-0"
    >
      <input
        ref={input}
        value={value}
        maxLength={MAX_OTHER_LENGTH}
        disabled={disabled}
        aria-label="Your own answer"
        placeholder="Type your answer"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange(null);
          if (e.key === "Enter" && onSubmit && text) {
            e.preventDefault();
            onSubmit(text);
          }
        }}
        // 16px on phones: iOS zooms into any field smaller than that.
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:opacity-50 sm:text-sm"
      />
      {onSubmit ? (
        <button
          type="button"
          disabled={disabled || !text}
          aria-label={submitLabel ?? "Send"}
          onClick={() => onSubmit(text)}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--cf-accent)] text-[var(--cf-accent-text)] disabled:opacity-40"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Remove your own answer"
          onClick={() => onChange(null)}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full opacity-60 hover:opacity-100"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
