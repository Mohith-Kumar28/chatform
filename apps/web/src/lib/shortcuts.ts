"use client";

import { useEffect } from "react";
import { useClientValue } from "@/hooks/use-client-value";

/**
 * The pieces every keyboard layer in the app shares.
 *
 * There are two of them — the builder's and the app shell's — and they were
 * about to grow their own copies of "is this a Mac", "is the caret in a field"
 * and the keydown loop itself. They agree on those by importing them.
 */

export interface Shortcut {
  /** Rendered in the sheet and in tooltips, e.g. "⌥↑". */
  keys: string;
  label: string;
  /** Heading in the shortcut sheet. Order of first appearance wins. */
  group: string;
  /** Matches the event. Modifiers are checked here, not inferred. */
  match: (e: KeyboardEvent) => boolean;
  run: () => void;
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return true;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

/** The platform's modifier, so the sheet matches the keyboard in front of you. */
export const modLabel = (): string => (isMac() ? "⌘" : "Ctrl");

/**
 * The same thing, for chrome that is on screen before anyone presses anything.
 *
 * `modLabel()` reads `navigator`, which the server does not have — fine inside
 * a tooltip or a dialog, which only exist once opened, and a hydration mismatch
 * anywhere that renders on first paint.
 */
export function useModLabel(): string {
  return useClientValue(modLabel, "⌘");
}

/** The modifier as the event reports it — ⌘ on a Mac, Ctrl everywhere else. */
export const mod = (e: KeyboardEvent): boolean => e.metaKey || e.ctrlKey;

/** No modifier held. Shift is allowed: "?" is a shifted key. */
export const plain = (e: KeyboardEvent): boolean => !e.metaKey && !e.ctrlKey && !e.altKey;

/**
 * True while the caret is somewhere that a bare letter means the letter.
 *
 * Someone typing a question title is typing, not commanding — this is what
 * makes single-key bindings like `n` or `1` safe to have at all.
 */
export function typingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

/**
 * True when Enter or Space on this element already means "press me".
 *
 * Without this, a bare-Enter binding quietly breaks keyboard operation of every
 * button and link in the app: focus lands on a control, the registry matches
 * first, and `preventDefault` swallows the activation. Tabbing through the UI
 * would stop working — the exact people a keyboard layer is for.
 */
export function activatingElement(e: KeyboardEvent): boolean {
  // ⌘↵ is not "press this button", so a held modifier means this is not that.
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key !== "Enter" && e.key !== " ") return false;
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("a, button, summary, [role='button'], [role='link'], [role='menuitem']"));
}

/**
 * True for a bare key pressed inside a dialog, sheet or palette.
 *
 * Navigating away from underneath an open overlay is never what someone meant
 * by pressing "3" — they are looking at the overlay. Modified keys still pass:
 * ⌘Z inside the design sheet is undo, and that is exactly right.
 */
export function insideOverlay(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey) return false;
  const el = e.target as HTMLElement | null;
  return Boolean(el?.closest('[role="dialog"], [role="alertdialog"], [cmdk-root]'));
}

/**
 * Bind a registry to the window.
 *
 * First match wins and stops, so a registry is read in priority order rather
 * than by how specific each matcher happens to be.
 */
export function useShortcutRunner(shortcuts: Shortcut[]): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (typingInto(e.target) || activatingElement(e) || insideOverlay(e)) return;
      for (const s of shortcuts) {
        if (!s.match(e)) continue;
        e.preventDefault();
        s.run();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);
}

/**
 * Move focus to an element that opted in with `data-shortcut-target`.
 *
 * The alternative was threading a ref from the builder shell down through the
 * tab, the panel and two wrappers to reach one textarea — plumbing that exists
 * only so a key can land somewhere. The attribute is the contract instead, and
 * it is declared next to the field it names.
 */
export function focusTarget(name: string): boolean {
  const el = document.querySelector<HTMLElement>(`[data-shortcut-target="${name}"]`);
  if (!el) return false;
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
  return true;
}
