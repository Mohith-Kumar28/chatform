import { create } from "zustand";
import type { Shortcut } from "@/lib/shortcuts";
import { produce } from "immer";
import { repairFlow, type Block, type FormDoc, type Ending, type LogicRuleInput } from "@repo/form-schema";

/**
 * Builder state.
 *
 * The FormDoc used to live in a single `useState` inside a 592-line component
 * and was prop-drilled into eight panels. That made undo/redo, cross-tab state
 * and optimistic AI edits impractical, and it meant switching "tabs" could not
 * become real routes without losing everything.
 *
 * The store is created per-form and provided from the builder layout, so it
 * survives navigation between /build, /agent, /workflow, /design and the rest.
 *
 * Undo/redo is a bounded doc-snapshot ring. Snapshots are cheap relative to
 * how often they are taken (once per committed edit, not per keystroke) and
 * sidestep the correctness problems of inverse-patch stacks.
 */

const HISTORY_LIMIT = 100;
/** Rapid edits to the same target collapse into one undo step. */
const COALESCE_MS = 600;

export type SaveState = "saved" | "dirty" | "saving" | "error" | "offline";

export interface BuilderState {
  formId: string;
  doc: FormDoc | null;
  /** Server doc version this edit is based on, for 409 conflict detection. */
  baseVersion: number | null;

  selectedRef: string | null;
  selectedEndingRef: string | null;

  /**
   * Where the block picker is about to insert, or null when it is closed.
   *
   * This was local state inside the list, which meant the only way to open the
   * picker was to click something inside the list. The keyboard layer lives in
   * the shell and the Design sheet lives in the toolbar, so both intents are
   * held here — one store already shared by everything in the builder — rather
   * than lifted through three components that have no other reason to know.
   */
  pickerIndex: number | null;
  designOpen: boolean;
  /**
   * The keyboard shortcut registry, published by the shell that owns it.
   *
   * Settings renders the list as one of its sections, and the registry is built
   * inside `useBuilderShortcuts` together with the handlers it binds — calling
   * that hook a second time to read it would register every binding twice. So
   * the shell, which already calls it once, puts the result here.
   */
  shortcuts: Shortcut[];

  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;
  /**
   * Does the draft hold anything the live version does not?
   *
   * Distinct from `saveState`, and the distinction is the whole point: autosave answers
   * "is my work safe", this answers "is my work live". On a published form those are
   * routinely different, and the header used to show only the first — so someone who
   * edited a live form five minutes after publishing it could not tell whether
   * respondents were seeing the edit.
   *
   * Seeded from the server, which compares a fingerprint of the draft against the one the
   * live version was published from, and kept honest locally so the indicator moves on the
   * keystroke rather than on the next refetch. Undoing back to the published state leaves
   * it set until the next publish or reload; every editor behaves that way, and the wrong
   * direction to err in is the one that hides an unpublished change.
   */
  editedSincePublish: boolean;
  conflict: { theirs: FormDoc } | null;

  past: FormDoc[];
  future: FormDoc[];
  /** Key of the last coalescing edit, e.g. `title:q_email`. */
  lastEditKey: string | null;
  lastEditAt: number;

  // ── lifecycle ──
  hydrate: (formId: string, doc: FormDoc, baseVersion: number | null, editedSincePublish?: boolean) => void;
  /** Apply a mutation. `coalesceKey` merges rapid edits to one field. */
  edit: (recipe: (draft: FormDoc) => void, coalesceKey?: string) => void;
  markSaving: () => void;
  markSaved: (at: number) => void;
  markError: (message: string) => void;
  /** The draft is now what is live. Called on a successful publish. */
  markPublished: () => void;
  setConflict: (theirs: FormDoc | null) => void;
  setShortcuts: (shortcuts: Shortcut[]) => void;
  /** Discard local edits and adopt the server's document. */
  acceptTheirs: () => void;

  undo: () => void;
  redo: () => void;

  // ── selection ──
  select: (ref: string | null) => void;
  selectEnding: (ref: string | null) => void;

  // ── panels the keyboard can reach ──
  /** Open the picker at `index`; omit for the end of the list. */
  openPicker: (index?: number) => void;
  closePicker: () => void;
  setDesignOpen: (open: boolean) => void;

  // ── block operations ──
  /**
   * Insert a block, optionally with the rule that makes it conditional.
   *
   * The rule travels with the insert rather than in a second call, so adding a
   * conditional question is one edit and therefore one undo — and there is no
   * intermediate state where the question exists but nothing routes to it.
   */
  addBlock: (block: Block, atIndex?: number, rule?: LogicRuleInput) => void;
  updateBlock: (ref: string, patch: Partial<Block>, coalesceKey?: string) => void;
  removeBlock: (ref: string) => void;
  duplicateBlock: (ref: string) => void;
  moveBlock: (fromIndex: number, toIndex: number) => void;

  // ── endings ──
  updateEnding: (ref: string, patch: Partial<Ending>, coalesceKey?: string) => void;
}

/**
 * Keep the flow meaning what the list shows, after the list has changed.
 *
 * Arm membership in the question list is not stored anywhere — it is derived
 * from the branch rules and the order of the blocks. So any edit that changes
 * the order changes the flow, and `moveBlock` was a plain splice that never
 * touched `logic`: dragging the first question of an arm left its branch
 * pointing at wherever it landed, and dragging anything across an arm boundary
 * left the arm-closing jump behind. Neither was visible, because the list is
 * drawn from the same rules that had just gone wrong.
 *
 * `repairFlow` keeps the conditional rules — those are decisions a person made
 * — and re-derives the unconditional ones from the new order. Applied to the
 * immer draft inside the same edit, so it is one undo step.
 */
function repairLogic(draft: { blocks: unknown; endings: unknown; logic: unknown }): void {
  const repaired = repairFlow({
    blocks: draft.blocks as Block[],
    endings: draft.endings as { ref: string }[],
    logic: draft.logic as LogicRuleInput[],
  });
  draft.logic = repaired.logic;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  formId: "",
  doc: null,
  baseVersion: null,
  selectedRef: null,
  selectedEndingRef: null,
  pickerIndex: null,
  designOpen: false,
  shortcuts: [],
  saveState: "saved",
  saveError: null,
  lastSavedAt: null,
  editedSincePublish: false,
  conflict: null,
  past: [],
  future: [],
  lastEditKey: null,
  lastEditAt: 0,

  hydrate: (formId, doc, baseVersion, editedSincePublish = false) =>
    set({
      formId,
      doc,
      baseVersion,
      editedSincePublish,
      past: [],
      future: [],
      saveState: "saved",
      saveError: null,
      conflict: null,
      // Select the first answerable block so the inspector is never empty on
      // arrival — an empty right pane reads as broken.
      selectedRef: doc.blocks.find((b) => b.type !== "welcome")?.ref ?? doc.blocks[0]?.ref ?? null,
      selectedEndingRef: null,
      pickerIndex: null,
      designOpen: false,
    }),

  edit: (recipe, coalesceKey) =>
    set((state) => {
      if (!state.doc) return state;
      const next = produce(state.doc, recipe);
      if (next === state.doc) return state; // no-op recipe

      const now = Date.now();
      const coalesce =
        coalesceKey !== undefined &&
        coalesceKey === state.lastEditKey &&
        now - state.lastEditAt < COALESCE_MS;

      return {
        doc: next,
        // When coalescing, keep the existing history top so the whole burst of
        // typing undoes as one step rather than character by character.
        past: coalesce ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: [],
        lastEditKey: coalesceKey ?? null,
        lastEditAt: now,
        saveState: "dirty",
        editedSincePublish: true,
        saveError: null,
      };
    }),

  markSaving: () => set({ saveState: "saving" }),
  markSaved: (at) =>
    set((s) => ({
      // A save that lands after further edits must not claim to be clean.
      saveState: s.saveState === "saving" ? "saved" : s.saveState,
      lastSavedAt: at,
      saveError: null,
    })),
  markError: (message) => set({ saveState: "error", saveError: message }),
  markPublished: () => set({ editedSincePublish: false }),
  setConflict: (theirs) => set({ conflict: theirs ? { theirs } : null }),
  acceptTheirs: () =>
    set((s) =>
      s.conflict
        ? {
            doc: s.conflict.theirs,
            conflict: null,
            past: [],
            future: [],
            saveState: "saved",
            saveError: null,
          }
        : s,
    ),

  undo: () =>
    set((s) => {
      const prev = s.past.at(-1);
      if (!prev || !s.doc) return s;
      return {
        doc: prev,
        past: s.past.slice(0, -1),
        future: [s.doc, ...s.future].slice(0, HISTORY_LIMIT),
        saveState: "dirty",
        editedSincePublish: true,
        lastEditKey: null,
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next || !s.doc) return s;
      return {
        doc: next,
        past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        saveState: "dirty",
        editedSincePublish: true,
        lastEditKey: null,
      };
    }),

  select: (ref) => set({ selectedRef: ref, selectedEndingRef: null }),
  selectEnding: (ref) => set({ selectedEndingRef: ref, selectedRef: null }),

  openPicker: (index) =>
    set((s) => ({ pickerIndex: index ?? s.doc?.blocks.length ?? 0, designOpen: false })),
  closePicker: () => set({ pickerIndex: null }),
  setDesignOpen: (open) => set({ designOpen: open }),

  setShortcuts: (shortcuts) => set({ shortcuts }),

  addBlock: (block, atIndex, rule) => {
    get().edit((d) => {
      const i = atIndex ?? d.blocks.length;
      d.blocks.splice(i, 0, block as never);
      if (rule) d.logic.push(rule as never);
      repairLogic(d);
    });
    set({ selectedRef: block.ref, selectedEndingRef: null });
  },

  updateBlock: (ref, patch, coalesceKey) =>
    get().edit((d) => {
      const i = d.blocks.findIndex((b) => b.ref === ref);
      if (i === -1) return;
      Object.assign(d.blocks[i]!, patch);
    }, coalesceKey),

  removeBlock: (ref) => {
    const { doc } = get();
    if (!doc) return;
    const index = doc.blocks.findIndex((b) => b.ref === ref);
    get().edit((d) => {
      d.blocks = d.blocks.filter((b) => b.ref !== ref);
      // Logic pointing at a deleted block would fail lint on publish; drop it
      // here so the builder never holds a doc it cannot publish.
      d.logic = d.logic.filter((r) => {
        if (r.action_kind !== "goto") return true;
        return r.target !== ref && r.from !== ref;
      });
      repairLogic(d);
    });
    // Keep something selected: prefer the block that took its place.
    const after = get().doc;
    if (after && get().selectedRef === ref) {
      const fallback = after.blocks[Math.min(index, after.blocks.length - 1)];
      set({ selectedRef: fallback?.ref ?? null });
    }
  },

  duplicateBlock: (ref) => {
    const { doc } = get();
    if (!doc) return;
    const index = doc.blocks.findIndex((b) => b.ref === ref);
    const source = doc.blocks[index];
    if (!source) return;

    // refs must stay unique — they are the column key in results and the
    // target of every logic rule, and are never renamed once published.
    const existing = new Set(doc.blocks.map((b) => b.ref));
    let candidate = `${source.ref}_copy`;
    let n = 2;
    while (existing.has(candidate)) candidate = `${source.ref}_copy${n++}`;

    const copy = {
      ...structuredClone(source),
      id: `blk_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
      ref: candidate,
    } as Block;
    get().addBlock(copy, index + 1);
  },

  moveBlock: (fromIndex, toIndex) =>
    get().edit((d) => {
      const [moved] = d.blocks.splice(fromIndex, 1);
      if (moved) d.blocks.splice(toIndex, 0, moved);
      repairLogic(d);
    }),

  updateEnding: (ref, patch, coalesceKey) =>
    get().edit((d) => {
      const i = d.endings.findIndex((e) => e.ref === ref);
      if (i === -1) return;
      Object.assign(d.endings[i]!, patch);
    }, coalesceKey),
}));

/** Currently selected block, or null. */
export function useSelectedBlock(): Block | null {
  return useBuilderStore((s) =>
    s.doc && s.selectedRef ? (s.doc.blocks.find((b) => b.ref === s.selectedRef) ?? null) : null,
  );
}

export function useCanUndo(): boolean {
  return useBuilderStore((s) => s.past.length > 0);
}

export function useCanRedo(): boolean {
  return useBuilderStore((s) => s.future.length > 0);
}
