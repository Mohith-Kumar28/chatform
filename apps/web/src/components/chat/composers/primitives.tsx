"use client";

import { SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InputSemantics } from "./input-semantics";

/**
 * Chat composer primitives, themed entirely from the runtime `--cf-*` variables
 * so a form's palette applies without any component knowing about ThemeDoc.
 */

/**
 * A key, drawn the same everywhere in the runtime — the `--cf-*` twin of
 * `ui/kbd`, which is painted in dashboard tokens a form's palette never
 * reaches.
 *
 * `kbd-hint` is what decides whether it is drawn at all — the one rule in
 * `globals.css` that every key in the app is gated on, dashboard chips
 * included: hints only make sense where there is a keyboard, and that is a
 * `(hover: hover) and (pointer: fine)` question, not a width one.
 */
export function KeyHint({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  /**
   * `accent` for keys sitting on an accent-filled control, `inverse` for one
   * drawn *on* the accent, `outline` for a key inside an accent-outlined pill.
   */
  tone?: "default" | "accent" | "inverse" | "outline";
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "kbd-hint size-4 shrink-0 place-items-center rounded font-sans text-[0.625rem] leading-none font-medium tabular-nums",
        tone === "accent"
          ? "bg-[var(--cf-accent)] text-[var(--cf-accent-text)]"
          : tone === "inverse"
            ? "bg-[color-mix(in_oklch,var(--cf-accent-text)_25%,transparent)] text-[var(--cf-accent-text)]"
            : tone === "outline"
              ? "bg-[color-mix(in_oklch,var(--cf-accent)_18%,transparent)] text-[var(--cf-accent)]"
              : "bg-[var(--cf-chip-border)]/40",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * A button that must not take the caret off the message box.
 *
 * Send and Skip both finish the current question and hand straight back to the
 * box for the next one, so the browser's default — focus follows the mousedown
 * — is a keyboard torn down and rebuilt between every pair of questions. The
 * affordance does the same thing for its chips; see `keepComposerFocus`.
 */
export function keepFocus(e: React.MouseEvent) {
  e.preventDefault();
}

export function Chip({
  children,
  onClick,
  selected,
  disabled,
  shortcut,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  selected?: boolean;
  disabled?: boolean;
  /** 1–9 keyboard hint, shown wherever there is a keyboard to press. */
  shortcut?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm",
        "transition-[background-color,border-color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)]",
        "active:scale-[0.97] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50",
        // Minimum 44px touch target on coarse pointers.
        "min-h-[2.75rem] sm:min-h-0",
        /*
         * Selected reads as an outline, not a fill.
         *
         * A filled chip is the same shape, colour and weight as the Continue
         * button sitting directly under it, so a multi-select with two picks
         * showed three accent-filled pills and nothing saying which one
         * finishes the question. A pick is now the accent *edge* plus a wash
         * of it; the only filled thing on screen is the action.
         */
        selected
          ? "border-[var(--cf-accent)] bg-[color-mix(in_oklch,var(--cf-accent)_10%,var(--cf-chip-bg))] shadow-[inset_0_0_0_1px_var(--cf-accent)]"
          : "border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] hover:border-[var(--cf-accent)]",
        className,
      )}
    >
      {shortcut !== undefined && shortcut <= 9 && (
        <KeyHint tone={selected ? "accent" : "default"}>{shortcut}</KeyHint>
      )}
      {children}
    </button>
  );
}

export function ComposerShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}

/**
 * "Skip", beside Send rather than above it.
 *
 * The history is worth keeping, because this has now been wrong in both
 * directions. It began as a 12px grey link at 50% opacity under the input and
 * nobody saw it — optionality is a promise the form makes, and a promise
 * whispered under the composer is not made. The fix overcorrected: a
 * full-width accent-tinted bar on its own row reading "Skip this question",
 * which put a second accent-coloured control directly above the one that
 * finishes the question and made passing on a question the most prominent
 * thing on screen.
 *
 * One word, at Send's height and keeping the accent outline it had above the
 * input: unmissable next to the action, and still an outline against Send's
 * fill so the two read as "the action, and the way past it" rather than two
 * equal buttons. Same 44px target, so it stays real on a phone.
 *
 * Only rendered when the question can actually be skipped — `allowSkip` on the
 * form and `required: false` on the block — which is what keeps it from
 * becoming furniture people stop seeing.
 */
export function SkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      onMouseDown={keepFocus}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
        "border-[var(--cf-accent)] bg-[color-mix(in_oklch,var(--cf-accent)_8%,transparent)] text-[var(--cf-accent)]",
        "transition-[background-color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)]",
        "hover:bg-[color-mix(in_oklch,var(--cf-accent)_16%,transparent)]",
        "active:scale-[0.97] motion-reduce:active:scale-100",
      )}
    >
      <SkipForward className="size-4" strokeWidth={2} />
      Skip
      {/* Esc, not a letter: the composer is focused on every question, so a
          one-letter shortcut would eat the first character of an answer that
          starts with it. `kbd-hint` hides this where there is no keyboard. */}
      <KeyHint tone="outline" className="w-auto min-w-4 px-1">
        esc
      </KeyHint>
    </button>
  );
}

export function SendRow({
  children,
  onSend,
  disabled,
  label = "Send",
  canSkip = false,
  onSkip,
}: {
  children: React.ReactNode;
  onSend: () => void;
  disabled?: boolean;
  label?: string;
  /** Whether this question may be passed on. Drives the width animation below. */
  canSkip?: boolean;
  onSkip?: () => void;
}) {
  return (
    <div className="flex items-end">
      <div className="min-w-0 flex-1">{children}</div>
      {/*
        Always mounted, animated from nothing.

        Skip appears and disappears question to question, and mounting it would
        snap the message box to a new width mid-conversation — the one element
        that has to hold still while somebody is typing into it. Animating
        `max-width` on a wrapper that is always present means the box grows and
        shrinks into the space instead, and the gap lives inside the wrapper so
        a collapsed Skip leaves none behind.
      */}
      <div
        aria-hidden={!canSkip}
        className={cn(
          "shrink-0 overflow-hidden",
          "transition-[max-width,opacity] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none",
          canSkip ? "max-w-[9rem] opacity-100" : "pointer-events-none max-w-0 opacity-0",
        )}
      >
        <div className="pl-2">{onSkip && <SkipButton onSkip={onSkip} />}</div>
      </div>
      <button
        type="button"
        onClick={onSend}
        onMouseDown={keepFocus}
        disabled={disabled}
        className={cn(
          "ml-2 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium",
          "bg-[var(--cf-accent)] text-[var(--cf-accent-text)]",
          "transition-transform duration-[var(--duration-micro)] active:scale-[0.97]",
          "motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        {label}
        {/* Says Enter sends, in the same key chip the choice chips use. The
            icon this replaces was hidden below `sm`, which is the width proxy
            `kbd-hint` exists to avoid: an embedded form in a 400px frame on
            a desktop has a keyboard and was told nothing. */}
        <KeyHint tone="inverse">↵</KeyHint>
      </button>
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  semantics,
  autoFocus,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /**
   * What this question is asking for, in the browser's own vocabulary — the
   * keyboard, the autofill token, whether to capitalise. See
   * `input-semantics.ts`.
   */
  semantics: InputSemantics;
  autoFocus?: boolean;
  multiline?: boolean;
}) {
  const shared =
    "w-full rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] px-4 py-3 text-[0.9375rem] outline-none transition-colors placeholder:opacity-50 focus:border-[var(--cf-accent)]";

  /* Enter sends here, so the phone's return key should say so rather than
     drawing a newline it will not insert. */
  const shell = {
    placeholder,
    autoFocus,
    enterKeyHint: "send" as const,
    autoComplete: semantics.autoComplete,
    autoCapitalize: semantics.autoCapitalize,
    autoCorrect: semantics.autoCorrect,
    spellCheck: semantics.spellCheck,
    name: semantics.name,
  };

  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter breaks the line — the convention every
          // chat app uses. Cmd+Enter also sends for muscle memory.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={3}
        inputMode={semantics.inputMode}
        {...shell}
        className={cn(shared, "resize-none")}
      />
    );
  }

  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSubmit();
        }
      }}
      type={semantics.type}
      inputMode={semantics.inputMode}
      {...shell}
      className={cn(shared, "h-11 py-0")}
    />
  );
}
