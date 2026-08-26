"use client";

import { cn } from "@/lib/utils";

/**
 * Chat composer primitives, themed entirely from the runtime `--cf-*` variables
 * so a form's palette applies without any component knowing about ThemeDoc.
 */

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
  /** 1–9 keyboard hint, shown on wider screens. */
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
        selected
          ? "border-transparent bg-[var(--cf-accent)] text-[var(--cf-accent-text)]"
          : "border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] hover:border-[var(--cf-accent)]",
        className,
      )}
    >
      {shortcut !== undefined && shortcut <= 9 && (
        <kbd
          className={cn(
            "hidden size-4 place-items-center rounded text-[0.625rem] font-medium sm:grid",
            selected ? "bg-white/20" : "bg-[var(--cf-chip-border)]/40",
          )}
        >
          {shortcut}
        </kbd>
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

export function SendRow({
  children,
  onSend,
  disabled,
  label = "Send",
}: {
  children: React.ReactNode;
  onSend: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onSend}
        disabled={disabled}
        className={cn(
          "h-11 shrink-0 rounded-full px-4 text-sm font-medium",
          "bg-[var(--cf-accent)] text-[var(--cf-accent-text)]",
          "transition-transform duration-[var(--duration-micro)] active:scale-[0.97]",
          "motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        {label}
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
