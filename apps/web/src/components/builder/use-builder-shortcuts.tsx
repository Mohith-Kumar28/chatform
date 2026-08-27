"use client";

import { useEffect, useMemo, useState } from "react";
import { useBuilderStore } from "@/stores/builder-store";

/**
 * The builder's keyboard layer.
 *
 * One registry rather than handlers scattered through components, for a reason
 * that matters more than tidiness: the help overlay is generated from this
 * list, so it cannot drift from what the keys actually do. A shortcut sheet
 * that lies is worse than none.
 *
 * Two rules hold throughout. Nothing fires while the caret is in a text field —
 * a builder typing a question title is typing, not commanding. And nothing here
 * destroys anything: delete has no binding, because a keystroke that removes a
 * question and its rules is not a shortcut, it is an accident waiting for a
 * misplaced finger.
 */

export interface Shortcut {
  /** Rendered in the overlay, e.g. "⌥↑". */
  keys: string;
  label: string;
  group: "Move around" | "Edit" | "The form";
  /** Matches the event. Modifiers are checked here, not inferred. */
  match: (e: KeyboardEvent) => boolean;
  run: () => void;
}

const isMac = () =>
  typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

/** The platform's modifier, so the sheet matches the keyboard in front of you. */
export const modLabel = () => (isMac() ? "⌘" : "Ctrl");

function typingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

const plain = (e: KeyboardEvent) => !e.metaKey && !e.ctrlKey && !e.altKey;

export function useBuilderShortcuts(actions: {
  onPreview: () => void;
  onPublish: () => void;
  onSave: () => void;
}): { shortcuts: Shortcut[]; helpOpen: boolean; setHelpOpen: (open: boolean) => void } {
  const [helpOpen, setHelpOpen] = useState(false);

  const doc = useBuilderStore((s) => s.doc);
  const selectedRef = useBuilderStore((s) => s.selectedRef);
  const select = useBuilderStore((s) => s.select);
  const moveBlock = useBuilderStore((s) => s.moveBlock);
  const duplicateBlock = useBuilderStore((s) => s.duplicateBlock);
  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);

  const shortcuts = useMemo<Shortcut[]>(() => {
    const blocks = doc?.blocks ?? [];
    const index = selectedRef ? blocks.findIndex((b) => b.ref === selectedRef) : -1;

    /** Step the selection, clamped — wrapping around surprises people. */
    const step = (delta: number) => {
      if (blocks.length === 0) return;
      const next = index === -1 ? 0 : Math.min(blocks.length - 1, Math.max(0, index + delta));
      const target = blocks[next];
      if (target) select(target.ref);
    };

    /** Move the selected question, taking the flow with it (see `repairFlow`). */
    const shift = (delta: number) => {
      if (index === -1) return;
      const to = index + delta;
      if (to < 0 || to >= blocks.length) return;
      moveBlock(index, to);
    };

    return [
      {
        keys: "↓",
        label: "Next question",
        group: "Move around",
        match: (e) => plain(e) && (e.key === "ArrowDown" || e.key === "j"),
        run: () => step(1),
      },
      {
        keys: "↑",
        label: "Previous question",
        group: "Move around",
        match: (e) => plain(e) && (e.key === "ArrowUp" || e.key === "k"),
        run: () => step(-1),
      },
      {
        keys: `${modLabel()}K`,
        label: "Search and jump anywhere",
        group: "Move around",
        // Owned by the command palette; listed so the sheet is complete.
        match: () => false,
        run: () => {},
      },
      {
        keys: "⌥↓",
        label: "Move this question down",
        group: "Edit",
        match: (e) => e.altKey && !e.metaKey && !e.ctrlKey && e.key === "ArrowDown",
        run: () => shift(1),
      },
      {
        keys: "⌥↑",
        label: "Move this question up",
        group: "Edit",
        match: (e) => e.altKey && !e.metaKey && !e.ctrlKey && e.key === "ArrowUp",
        run: () => shift(-1),
      },
      {
        keys: `${modLabel()}D`,
        label: "Duplicate this question",
        group: "Edit",
        match: (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "d",
        run: () => {
          if (selectedRef) duplicateBlock(selectedRef);
        },
      },
      {
        keys: `${modLabel()}Z`,
        label: "Undo",
        group: "Edit",
        match: (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z",
        run: undo,
      },
      {
        keys: `⇧${modLabel()}Z`,
        label: "Redo",
        group: "Edit",
        match: (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z",
        run: redo,
      },
      {
        keys: `${modLabel()}S`,
        label: "Save now",
        group: "The form",
        // Autosave already handles this; the binding exists because people press
        // it anyway, and the browser's save dialog is not what they wanted.
        match: (e) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s",
        run: actions.onSave,
      },
      {
        keys: `${modLabel()}↵`,
        label: "Preview the conversation",
        group: "The form",
        match: (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "Enter",
        run: actions.onPreview,
      },
      {
        keys: `⇧${modLabel()}P`,
        label: "Publish",
        group: "The form",
        match: (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p",
        run: actions.onPublish,
      },
      {
        keys: "?",
        label: "Show this list",
        group: "The form",
        match: (e) => plain(e) && e.key === "?",
        run: () => setHelpOpen(true),
      },
    ];
  }, [doc, selectedRef, select, moveBlock, duplicateBlock, undo, redo, actions]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Escape closes the sheet from anywhere, including a field.
      if (e.key === "Escape" && helpOpen) {
        setHelpOpen(false);
        return;
      }
      if (typingInto(e.target)) return;
      for (const s of shortcuts) {
        if (!s.match(e)) continue;
        e.preventDefault();
        s.run();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, helpOpen]);

  return { shortcuts, helpOpen, setHelpOpen };
}
