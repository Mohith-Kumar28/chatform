"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useBuilderStore } from "@/stores/builder-store";
import {
  activatingElement,
  focusTarget,
  insideOverlay,
  mod,
  modLabel,
  plain,
  typingInto,
  type Shortcut,
} from "@/lib/shortcuts";
import { BUILDER_TABS } from "./builder-tabs";

/**
 * The builder's keyboard layer.
 *
 * One registry rather than handlers scattered through components, for a reason
 * that matters more than tidiness: the help overlay and every tooltip that
 * names a key are generated from this list, so they cannot drift from what the
 * keys actually do. A shortcut sheet that lies is worse than none.
 *
 * Two rules hold throughout. Nothing fires while the caret is in a text field —
 * a builder typing a question title is typing, not commanding. And nothing here
 * destroys anything: delete has no binding, because a keystroke that removes a
 * question and its rules is not a shortcut, it is an accident waiting for a
 * misplaced finger.
 *
 * Section switching is bare digits rather than ⌘1–⌘6, which browsers keep for
 * their own tabs and will not surrender to preventDefault.
 */

/** Keys named by the sheet and by tooltips. One spelling, one source. */
export const KEY = {
  addQuestion: "N",
  editQuestion: "E",
  askAi: "/",
  design: "D",
  flow: "F",
  duplicate: () => `${modLabel()}D`,
  preview: () => `${modLabel()}↵`,
  publish: () => `⇧${modLabel()}P`,
  copyLink: () => `⇧${modLabel()}C`,
  undo: () => `${modLabel()}Z`,
  redo: () => `⇧${modLabel()}Z`,
  palette: () => `${modLabel()}K`,
  help: "?",
  /** The section tabs are numbered by their position in BUILDER_TABS. */
  tab: (segment: string) => {
    const i = BUILDER_TABS.findIndex((t) => t.segment === segment);
    return i === -1 ? undefined : String(i + 1);
  },
} as const;

export function useBuilderShortcuts(actions: {
  onPreview: () => void;
  onPublish: () => void;
  onSave: () => void;
  onCopyLink: (() => void) | null;
}): { shortcuts: Shortcut[]; helpOpen: boolean; setHelpOpen: (open: boolean) => void } {
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const doc = useBuilderStore((s) => s.doc);
  const formId = useBuilderStore((s) => s.formId);
  const selectedRef = useBuilderStore((s) => s.selectedRef);
  const select = useBuilderStore((s) => s.select);
  const moveBlock = useBuilderStore((s) => s.moveBlock);
  const duplicateBlock = useBuilderStore((s) => s.duplicateBlock);
  const openPicker = useBuilderStore((s) => s.openPicker);
  const setDesignOpen = useBuilderStore((s) => s.setDesignOpen);
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

    const go = (segment: string) => router.push(`/forms/${formId}/${segment}`);

    /**
     * One key for two views, because they are two views of one thing. A
     * separate key each would mean remembering which of them you are on.
     */
    const toggleFlow = () => go(pathname.endsWith("/workflow") ? "build" : "workflow");

    /**
     * Jump to the question's wording without reaching for the mouse.
     *
     * Selection and editing are separate here — the arrows move a highlight,
     * and this commits to it — so stepping through a form does not put the
     * caret in nine fields on the way past.
     */
    const editSelected = () => {
      if (!selectedRef) return;
      if (!pathname.endsWith("/build")) {
        go("build");
        // The field is on the next route; focus once it has rendered.
        setTimeout(() => focusTarget("question-title"), 120);
        return;
      }
      focusTarget("question-title");
    };

    const sectionKeys: Shortcut[] = BUILDER_TABS.map((tab, i) => ({
      keys: String(i + 1),
      label: `Go to ${tab.label}`,
      group: "Move around",
      match: (e) => plain(e) && !e.shiftKey && e.code === `Digit${i + 1}`,
      run: () => go(tab.segment),
    }));

    return [
      ...sectionKeys,
      {
        keys: KEY.flow,
        label: "Switch between Questions and Flow",
        group: "Move around",
        match: (e) => plain(e) && e.key.toLowerCase() === "f",
        run: toggleFlow,
      },
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
        keys: KEY.palette(),
        label: "Search and jump anywhere",
        group: "Move around",
        // Owned by the command palette; listed so the sheet is complete.
        match: () => false,
        run: () => {},
      },
      {
        keys: KEY.addQuestion,
        label: "Add a question",
        group: "Edit",
        match: (e) => plain(e) && e.key.toLowerCase() === "n",
        run: () => {
          // The picker lives on the Build route, so bring it into view first —
          // otherwise the key appears to do nothing from Results or Settings.
          if (!pathname.endsWith("/build")) go("build");
          openPicker();
        },
      },
      {
        keys: KEY.editQuestion,
        label: "Edit the selected question's wording",
        group: "Edit",
        // Not ↵: focus sits on the row button after you click it, where ↵
        // already means "press this", and stealing that breaks the list for
        // anyone driving it from the keyboard.
        match: (e) => plain(e) && e.key.toLowerCase() === "e",
        run: editSelected,
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
        keys: KEY.duplicate(),
        label: "Duplicate this question",
        group: "Edit",
        match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === "d",
        run: () => {
          if (selectedRef) duplicateBlock(selectedRef);
        },
      },
      {
        keys: KEY.askAi,
        label: "Ask AI to make a change",
        group: "Edit",
        match: (e) => plain(e) && e.key === "/",
        run: () => {
          if (!pathname.endsWith("/build")) {
            go("build");
            setTimeout(() => focusTarget("ai-bar"), 120);
            return;
          }
          focusTarget("ai-bar");
        },
      },
      {
        keys: KEY.design,
        label: "Open Design",
        group: "Edit",
        match: (e) => plain(e) && e.key.toLowerCase() === "d",
        run: () => {
          if (!pathname.endsWith("/build")) go("build");
          setDesignOpen(true);
        },
      },
      {
        keys: KEY.undo(),
        label: "Undo",
        group: "Edit",
        match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === "z",
        run: undo,
      },
      {
        keys: KEY.redo(),
        label: "Redo",
        group: "Edit",
        match: (e) => mod(e) && e.shiftKey && e.key.toLowerCase() === "z",
        run: redo,
      },
      {
        keys: `${modLabel()}S`,
        label: "Save now",
        group: "The form",
        // Autosave already handles this; the binding exists because people press
        // it anyway, and the browser's save dialog is not what they wanted.
        match: (e) => mod(e) && e.key.toLowerCase() === "s",
        run: actions.onSave,
      },
      {
        keys: KEY.preview(),
        label: "Preview the conversation",
        group: "The form",
        match: (e) => mod(e) && !e.shiftKey && e.key === "Enter",
        run: actions.onPreview,
      },
      {
        keys: KEY.publish(),
        label: "Publish",
        group: "The form",
        match: (e) => mod(e) && e.shiftKey && e.key.toLowerCase() === "p",
        run: actions.onPublish,
      },
      // Only bound once there is a link to copy: a shortcut that silently does
      // nothing on a draft teaches people it is broken.
      ...(actions.onCopyLink
        ? [
            {
              keys: KEY.copyLink(),
              label: "Copy the public link",
              group: "The form",
              match: (e: KeyboardEvent) => mod(e) && e.shiftKey && e.key.toLowerCase() === "c",
              run: actions.onCopyLink,
            } satisfies Shortcut,
          ]
        : []),
      {
        keys: KEY.help,
        label: "Show this list",
        group: "The form",
        match: (e) => plain(e) && e.key === "?",
        run: () => setHelpOpen(true),
      },
    ];
  }, [
    doc,
    formId,
    pathname,
    router,
    selectedRef,
    select,
    moveBlock,
    duplicateBlock,
    openPicker,
    setDesignOpen,
    undo,
    redo,
    actions,
  ]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Escape closes the sheet from anywhere, including a field.
      if (e.key === "Escape" && helpOpen) {
        setHelpOpen(false);
        return;
      }
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
  }, [shortcuts, helpOpen]);

  return { shortcuts, helpOpen, setHelpOpen };
}
