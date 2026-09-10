"use client";

import { cn } from "@/lib/utils";

/**
 * Chat composer primitives, themed entirely from the runtime `--cf-*` variables
 * so a form's palette applies without any component knowing about ThemeDoc.
 */

/**
 * A key, drawn the same everywhere in the runtime — the `--cf-*` twin of
 * `ui/kbd`, which is painted in dashboard tokens a form's palette never
 * reaches.
 *
 * `cf-key-hint` is what decides whether it is drawn at all: hints only make
 * sense where there is a keyboard, and that is a `(hover: hover) and (pointer:
 * fine)` question, not a width one.
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
        "cf-key-hint size-4 shrink-0 place-items-center rounded font-sans text-[0.625rem] leading-none font-medium tabular-nums",
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
 * Skip, sat next to Send, in the accent and at the same height.
 *
 * It was a 12px grey link at 50% opacity under the input, and the honest
 * summary is that nobody saw it: three of this form's eight questions are
 * optional and a respondent had no way of knowing, so an upload they did not
 * want to make read as a wall. Optionality is a promise the form makes, and a
 * promise whispered under the composer is not made.
 *
 * Outlined rather than filled, because Send is filled: the pair has to read as
 * "the action, and the way past it", not as two equal buttons. Same 44px
 * height as Send and the chips, so it is a real target on a phone.
 *
 * Only drawn when the current question can actually be skipped — `allowSkip`
 * on the form and `required: false` on the block — which is what keeps it from
 * becoming furniture people stop seeing.
 */
function SkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium",
        "border-[var(--cf-accent)] bg-[color-mix(in_oklch,var(--cf-accent)_8%,transparent)] text-[var(--cf-accent)]",
        "transition-[background-color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)]",
        "hover:bg-[color-mix(in_oklch,var(--cf-accent)_16%,transparent)]",
        "active:scale-[0.97] motion-reduce:active:scale-100",
      )}
    >
      Skip
      {/* Esc, not a letter: the composer is focused on every question, so a
          one-letter shortcut would eat the first character of an answer that
          starts with it. `cf-key-hint` hides this where there is no keyboard. */}
      <KeyHint tone="outline" className="w-auto min-w-4 px-1">
        esc
      </KeyHint>
    </button>
  );
}

export function SendRow({
  children,
  onSend,
  onSkip,
  disabled,
  label = "Send",
}: {
  children: React.ReactNode;
  onSend: () => void;
  /** Given only when this question is optional; draws the Skip pill. */
  onSkip?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      {onSkip && <SkipButton onSkip={onSkip} />}
      <button
        type="button"
        onClick={onSend}
        disabled={disabled}
        className={cn(
          "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium",
          "bg-[var(--cf-accent)] text-[var(--cf-accent-text)]",
          "transition-transform duration-[var(--duration-micro)] active:scale-[0.97]",
          "motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        {label}
        {/* Says Enter sends, in the same key chip the choice chips use. The
            icon this replaces was hidden below `sm`, which is the width proxy
            `cf-key-hint` exists to avoid: an embedded form in a 400px frame on
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
  type = "text",
  autoFocus,
  multiline,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  multiline?: boolean;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric" | "decimal";
}) {
  const shared =
    "w-full rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] px-4 py-3 text-[0.9375rem] outline-none transition-colors placeholder:opacity-50 focus:border-[var(--cf-accent)]";

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
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
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
      placeholder={placeholder}
      type={type}
      inputMode={inputMode}
      autoFocus={autoFocus}
      className={cn(shared, "h-11 py-0")}
    />
  );
}
