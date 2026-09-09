"use client";

import { useEffect, useRef } from "react";

/**
 * The one keyboard shortcut implementation the runtime's composers share.
 *
 * It used to live inside `question-affordance`, private to the chip-shaped
 * blocks. `ranking` renders its own composer, so it inherited none of this —
 * and drew a badge on every unranked chip anyway, which read as a key that
 * did nothing.
 */
export interface Choice {
  id: string;
  label: string;
  value: unknown;
  /** The character that picks it. Absent when there is no single key for it. */
  key?: string;
}

/**
 * Digit keys pick a choice, and they win over the message box.
 *
 * The composer takes focus on every question, so a shortcut that yielded to
 * "the event came from an INPUT" was a shortcut that never fired. Hijacking a
 * keystroke inside a text field is safe exactly while the field is empty —
 * someone typing "1 or 2 a week" keeps their digits — and only for a question
 * that has numbered choices on offer, which is why a `number`, `rating` or
 * `nps` answer is untouched.
 */
export function useChoiceKeys(
  choices: Choice[],
  onPick: (choice: Choice) => void,
  onEnter?: () => void,
) {
  const latest = useRef({ choices, onPick, onEnter });
  useEffect(() => {
    latest.current = { choices, onPick, onEnter };
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      // Safe only while the box is empty: someone writing "1 or 2 a week"
      // keeps their digits.
      if (inField && (target as HTMLInputElement).value !== "") return;
      /*
       * Enter finishes a multi-select, and has to win against the chip.
       *
       * Picking the last option leaves that chip focused, so the browser's own
       * "Enter activates the focused button" would un-pick what was just
       * picked — the exact opposite of what the ⏎ on the Continue button now
       * promises. Inside the affordance we take the key and preventDefault so
       * the chip never sees the click; Space still toggles. Outside it — the
       * skip link, the send button — the focused control keeps its Enter.
       */
      if (e.key === "Enter") {
        if (!latest.current.onEnter) return;
        if (tag === "BUTTON" && !target?.closest("[data-affordance]")) return;
        e.preventDefault();
        latest.current.onEnter();
        return;
      }
      const hit = latest.current.choices.find((c) => c.key === e.key);
      if (!hit) return;
      e.preventDefault();
      latest.current.onPick(hit);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
