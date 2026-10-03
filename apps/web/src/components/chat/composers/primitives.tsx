"use client";

import { useLayoutEffect, useRef } from "react";
import { Mic, SendHorizontal, SkipForward, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InputSemantics } from "./input-semantics";
import { useT } from "../i18n";

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
 * The platform's own name for the modifier, so the hint matches the keyboard.
 *
 * Beside `KeyHint` rather than inside the one screen that first needed it: the
 * review card, and now the feedback panel, both print `⌘↵` on their action, and
 * a second copy of this test is how one of them ends up teaching a Windows
 * respondent a key their keyboard does not have.
 */
export function modKeyLabel(): string {
  if (typeof navigator === "undefined") return "⌘";
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
}

/**
 * The dictation shortcut: M, whenever the respondent is not typing.
 *
 * Plain M, because it is the one people guess. It stands down inside any text
 * field (or anything editable), where an M is a letter of the answer, and with
 * a modifier held, so Cmd+M and friends keep meaning what the system says.
 */
export function isDictateShortcut(e: KeyboardEvent): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return false;
  if (e.code !== "KeyM" && e.key.toLowerCase() !== "m") return false;
  const el = e.target as HTMLElement | null;
  if (el?.isContentEditable) return false;
  const tag = el?.tagName;
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
}

export const DICTATE_KEY = "M";

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
        "group inline-flex items-center gap-1.5 rounded-[var(--cf-radius-control)] border px-3.5 py-2 text-left text-sm",
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
  const t = useT();
  return (
    <button
      type="button"
      onClick={onSkip}
      onMouseDown={keepFocus}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--cf-radius-control)] border px-3.5 text-sm font-medium",
        "border-[var(--cf-accent)] bg-[color-mix(in_oklch,var(--cf-accent)_8%,var(--cf-bg))] text-[var(--cf-accent)]",
        "transition-[background-color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)]",
        "hover:bg-[color-mix(in_oklch,var(--cf-accent)_16%,var(--cf-bg))]",
        "active:scale-[0.97] motion-reduce:active:scale-100",
      )}
    >
      <SkipForward className="size-4" strokeWidth={2} />
      {t("Skip")}
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
  label: givenLabel,
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
  const t = useT();
  const label = givenLabel ?? t("Send");
  return (
    <div className="relative flex items-end">
      <div className="min-w-0 flex-1">{children}</div>
      {/*
        On a phone Skip floats above Send, over the conversation, instead of
        taking space in the composer. Every in-flow placement cost something:
        beside Send the two pills squeezed the message box to a sliver;
        stacked in Send's column, the column took Skip's width and left a gap
        beside the box; on its own row it added a band of height that cropped
        whatever the question was showing. Floating, it costs neither, and
        the messages scroll behind it, which is why its fill is opaque. From
        `sm` up there is room for it in the row.

        Always mounted, animated from nothing: Skip comes and goes question to
        question, and mounting it would snap the message box to a new size
        while somebody is typing into it. In the row, `max-width` eases the box
        into the space and the gap lives inside the wrapper, so a collapsed
        Skip leaves none behind.
      */}
      <div
        aria-hidden={!canSkip}
        className={cn(
          "absolute right-0 bottom-full z-10 pb-2 sm:static sm:z-auto sm:shrink-0 sm:overflow-hidden sm:pb-0",
          "transition-[max-width,opacity,transform] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none",
          canSkip
            ? "opacity-100 sm:max-w-[9rem]"
            : "pointer-events-none translate-y-1 opacity-0 sm:max-w-0 sm:translate-y-0",
        )}
      >
        <div className="sm:pl-2">{onSkip && <SkipButton onSkip={onSkip} />}</div>
      </div>
      {/*
        An icon, not a labelled pill. "Send" plus its Enter chip cost the
        message box about 60px, which on a phone or a narrow embed is where
        a typed email address runs out of room. The paper plane is the one
        every messaging app has taught; Enter still sends, and the tooltip
        says so to anyone with a pointer to hover.
      */}
      <button
        type="button"
        onClick={onSend}
        onMouseDown={keepFocus}
        disabled={disabled}
        aria-label={label}
        title={`${label} (Enter)`}
        className={cn(
          "ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--cf-radius-control)]",
          "bg-[var(--cf-accent)] text-[var(--cf-accent-text)]",
          "transition-transform duration-[var(--duration-micro)] active:scale-[0.94]",
          "motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        <SendHorizontal className="size-5 translate-x-px" strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}

/**
 * Speak the answer instead of typing it.
 *
 * Sits inside the message box rather than beside Send: it is a way of filling
 * the box, not a way of finishing the question, and a third pill in the send
 * row would compete with the one control that does. The words land in the box
 * to be read back before they go — see `useDictation`.
 */
export function DictateButton({
  listening,
  onToggle,
  shortcut,
  className,
}: {
  listening: boolean;
  onToggle: () => void;
  /** The key that toggles it, drawn beside the mic where there is a keyboard. */
  shortcut?: string;
  className?: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseDown={keepFocus}
      aria-pressed={listening}
      aria-label={listening ? t("Stop dictating") : t("Dictate your answer")}
      aria-keyshortcuts={shortcut ? DICTATE_KEY : undefined}
      title={shortcut ? `${listening ? t("Stop dictating") : t("Dictate")} (${shortcut})` : undefined}
      className={cn(
        // One pill, key and mic together, so the M reads as this button's key
        // rather than a stray label beside it. Where `kbd-hint` draws nothing
        // (no keyboard), `min-w-9` keeps it the round 36px button it was.
        "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2",
        "transition-[background-color,opacity] duration-[var(--duration-micro)] ease-[var(--ease-out)]",
        listening
          ? "bg-[color-mix(in_oklch,var(--cf-accent)_14%,transparent)] text-[var(--cf-accent)]"
          : "opacity-55 hover:bg-[var(--cf-chip-bg)] hover:opacity-100",
        className,
      )}
    >
      {shortcut && <KeyHint className="w-auto min-w-4 px-1">{shortcut}</KeyHint>}
      {listening ? (
        <span className="relative flex size-4 items-center justify-center">
          {/* The one thing in the composer that moves on its own: an open
              microphone has to be visible from the corner of the eye. */}
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[color-mix(in_oklch,var(--cf-accent)_30%,transparent)] motion-reduce:animate-none" />
          <Square className="size-3 fill-current" />
        </span>
      ) : (
        <Mic className="size-[1.125rem]" />
      )}
    </button>
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
  trailing,
  trailingHasHint,
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
  /** A control drawn inside the box at its trailing edge — the mic. */
  trailing?: React.ReactNode;
  /** The trailing control also shows a key hint, so it is wider where hints are drawn. */
  trailingHasHint?: boolean;
}) {
  const growRef = useAutoGrow(multiline ? value : null);
  const shared = cn(
    "w-full rounded-[var(--cf-radius-card)] border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] px-4 py-3 text-[0.9375rem] outline-none transition-colors placeholder:text-[var(--cf-placeholder)] placeholder:opacity-100 focus:border-[var(--cf-accent)]",
    // Room for the trailing control, so text never runs underneath it. Wider
    // exactly where `kbd-hint` draws the key beside the mic.
    trailing && "pr-12",
    trailing && trailingHasHint && "[@media(hover:hover)_and_(pointer:fine)]:pr-[4.5rem]",
  );

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
    const box = (
      <textarea
        ref={growRef}
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
        /*
          One line to start, the same height as every other answer box, and
          taller only as the words need it. It opened at three rows, which
          made a long-text question look unlike every other one and left Skip
          and Send floating level with its bottom edge rather than its text.
        */
        rows={1}
        inputMode={semantics.inputMode}
        {...shell}
        className={cn(shared, "block max-h-48 min-h-11 resize-none py-[0.6875rem] leading-[1.375rem]")}
      />
    );
    if (!trailing) return box;
    // Pinned to the last line, beside where the words are landing. Four pixels
    // from the bottom centres the 36px mic in the 44px single-line box.
    return (
      <div className="relative">
        {box}
        <div className="absolute right-1 bottom-1">{trailing}</div>
      </div>
    );
  }

  const box = (
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
  if (!trailing) return box;
  return (
    <div className="relative">
      {box}
      <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>
    </div>
  );
}

/**
 * A textarea that is as tall as its text, up to its CSS `max-height`.
 *
 * Measured rather than `field-sizing: content`, which Firefox and older Safari
 * ignore and would leave at one row with a scrollbar.
 */
function useAutoGrow(value: string | null) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value === null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [value]);
  return ref;
}
