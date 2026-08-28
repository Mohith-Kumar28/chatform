"use client";

import { useMemo, useState } from "react";
import {
  GitBranch,
  CornerDownRight,
  Copy,
  Flag,
  GripVertical,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipHint } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBuilderStore } from "@/stores/builder-store";
import { computeQuestionFlow, type QuestionFlow } from "./branch-layout";
import {
  ConditionRow,
  choicesFor,
  conditionalRule,
  deciderFor,
  opsFor,
  type DraftCondition,
} from "./condition-row";
import { BLOCK_GROUPS, BLOCK_LIBRARY, blockMeta, TONE_ACCENT, TONE_CLASSES } from "./block-library";
import { defaultBlock } from "./default-block";
import { KEY } from "./use-builder-shortcuts";
import { cn } from "@/lib/utils";

/**
 * Left pane: the ordered blocks, then the endings.
 *
 * The previous list rendered its delete control as a bare `<svg onClick>` —
 * not focusable, not announced, and destructive without confirmation. Row
 * actions here are real buttons, and insertion points appear between rows on
 * hover the way Youform's do.
 */
export function BlockList() {
  const doc = useBuilderStore((s) => s.doc);
  const selectedRef = useBuilderStore((s) => s.selectedRef);
  const selectedEndingRef = useBuilderStore((s) => s.selectedEndingRef);
  const select = useBuilderStore((s) => s.select);
  const selectEnding = useBuilderStore((s) => s.selectEnding);
  const moveBlock = useBuilderStore((s) => s.moveBlock);
  const addBlock = useBuilderStore((s) => s.addBlock);
  const duplicateBlock = useBuilderStore((s) => s.duplicateBlock);
  const removeBlock = useBuilderStore((s) => s.removeBlock);
  /**
   * The picker is store state now, not local state, because `N` opens it from
   * the keyboard layer in the shell — which cannot reach a `useState` in here.
   */
  const pickerIndex = useBuilderStore((s) => s.pickerIndex);
  const openPicker = useBuilderStore((s) => s.openPicker);
  const closePicker = useBuilderStore((s) => s.closePicker);

  // Which questions split the flow, and which are not asked of everyone.
  const flow = useMemo(
    () => (doc ? computeQuestionFlow(doc) : new Map<string, QuestionFlow>()),
    [doc],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!doc) return null;

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id || !doc) return;
    const from = doc.blocks.findIndex((b) => b.ref === active.id);
    const to = doc.blocks.findIndex((b) => b.ref === over.id);
    if (from !== -1 && to !== -1) moveBlock(from, to);
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <span className="text-muted-foreground text-micro font-medium tracking-wide uppercase">
            {doc.blocks.length} question{doc.blocks.length === 1 ? "" : "s"}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Add a question"
                onClick={() => openPicker()}
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <TooltipHint label="Add a question" keys={KEY.addQuestion} />
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={doc.blocks.map((b) => b.ref)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="space-y-0.5">
                {doc.blocks.map((block, i) => (
                  <li key={block.ref}>
                    <InsertPoint onClick={() => openPicker(i)} />
                    <SortableRow
                      block={block}
                      index={i}
                      selected={selectedRef === block.ref}
                      flow={flow.get(block.ref)}
                      onSelect={() => select(block.ref)}
                      onDuplicate={() => duplicateBlock(block.ref)}
                      onDelete={() => removeBlock(block.ref)}
                    />
                  </li>
                ))}
              </ol>
            </SortableContext>
          </DndContext>

          <InsertPoint onClick={() => openPicker()} />

          {/* Endings were only reachable from the workflow canvas before. */}
          <div className="mt-4">
            <p className="text-muted-foreground text-micro px-2 pb-1.5 font-medium tracking-wide uppercase">
              Ending
            </p>
            <ol className="space-y-0.5">
              {doc.endings.map((ending) => (
                <li key={ending.ref}>
                  <button
                    type="button"
                    onClick={() => selectEnding(ending.ref)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left",
                      "bg-primary-soft text-primary transition-opacity duration-[var(--duration-micro)]",
                      selectedEndingRef === ending.ref ? "opacity-100" : "opacity-[0.82] hover:opacity-100",
                    )}
                    style={
                      selectedEndingRef === ending.ref
                        ? { boxShadow: "inset 3px 0 0 0 var(--primary)" }
                        : undefined
                    }
                  >
                    <Flag className="size-3.5 shrink-0" strokeWidth={2} />
                    <span className="line-clamp-1 min-w-0 flex-1 text-xs">{ending.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {pickerIndex !== null && (
          <BlockPicker
            onClose={closePicker}
            decider={deciderFor(doc.blocks, pickerIndex)}
            onPick={(type, condition) => {
              const refs = new Set(doc.blocks.map((b) => b.ref));
              const block = defaultBlock(type, refs);
              const decider = condition ? deciderFor(doc.blocks, pickerIndex) : null;
              // Only the positive branch is written. `repairFlow`, which every
              // structural edit runs through, derives the complement that skips
              // the question when the condition fails — the half that actually
              // does the skipping, and the half people forget.
              const rule =
                condition && decider ? conditionalRule(decider, condition, block.ref) : undefined;
              addBlock(block, pickerIndex, rule);
              closePicker();
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

/** A thin hover target between rows, so you can add exactly where you mean to. */
function InsertPoint({ onClick }: { onClick: () => void }) {
  return (
    <div className="group relative h-1.5">
      <button
        type="button"
        onClick={onClick}
        aria-label="Insert block here"
        className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <span className="bg-primary/30 h-px flex-1" />
        <span className="bg-primary text-primary-foreground mx-1 grid size-3.5 place-items-center rounded-full">
          <Plus className="size-2.5" />
        </span>
        <span className="bg-primary/30 h-px flex-1" />
      </button>
    </div>
  );
}

function SortableRow({
  block,
  index,
  selected,
  flow,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  block: Block;
  index: number;
  selected: boolean;
  /** What this row can say about itself: see `computeQuestionFlow`. */
  flow: QuestionFlow | undefined;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.ref,
  });
  const meta = blockMeta(block.type);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // The selected row gets a saturated spine in its family colour instead
        // of a border, so the list reads as coloured cards rather than a ruled
        // table.
        boxShadow: selected ? `inset 3px 0 0 0 ${TONE_ACCENT[meta.tone]}` : undefined,
      }}
      className={cn(
        "group relative flex items-start gap-1.5 overflow-hidden rounded-xl py-2 pr-1.5 pl-1",
        "transition-[background-color,box-shadow] duration-[var(--duration-micro)] ease-[var(--ease-out)]",
        TONE_CLASSES[meta.tone],
        selected ? "ring-0" : "opacity-[0.82] hover:opacity-100",
        isDragging && "shadow-md z-10 opacity-100",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${block.title}`}
        className="mt-0.5 shrink-0 cursor-grab touch-none opacity-0 transition-opacity group-hover:opacity-40 hover:!opacity-80 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>

      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-start gap-2 pr-5 text-left">
        <span className="mt-px flex shrink-0 items-center gap-1.5">
          <meta.icon className="size-3.5" strokeWidth={2} />
          <span className="tabular text-[0.625rem] opacity-60">{index + 1}</span>
        </span>
        <span className="min-w-0 flex-1">
          {/* Two lines before the ellipsis: one line truncated after ~three
              words made the list unreadable. */}
          <span className={cn("line-clamp-2 text-xs leading-snug", selected && "font-semibold")}>
            {block.title || meta.label}
          </span>
          {/*
            Said on the row it is true of, rather than by indenting the row
            under a parent. A question can be reached from more than one branch,
            so it has no parent to indent under — see `computeQuestionFlow`.

            Drawn as a tinted monospace chip with a child-branch glyph, not as a
            line of grey text: sitting directly under the wording, prose reads as
            a description of the question. An expression in another typeface
            cannot be mistaken for one.
          */}
          {flow?.conditional && (
            <span
              className={cn(
                "mt-1 inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5",
                "font-mono text-[0.625rem] leading-none",
                "bg-[color-mix(in_oklch,currentColor_14%,transparent)]",
              )}
            >
              <CornerDownRight className="size-2.5 shrink-0 opacity-60" strokeWidth={2.5} />
              <span className="truncate opacity-85">
                {flow.condition ?? "sometimes asked"}
              </span>
            </span>
          )}
        </span>
        {/* This question sends different answers different ways. */}
        {flow?.branches && <GitBranch className="mt-0.5 size-3 shrink-0 opacity-45" aria-label="Branches" />}
      </button>

      {/* Required marker, pinned top-right and always red — it is the one
          signal in this list that is not about block type, so it should not
          take the row's family colour. */}
      {block.required && (
        <span
          className="text-destructive pointer-events-none absolute top-1.5 right-2 text-sm leading-none font-medium"
          aria-label="Required"
        >
          *
        </span>
      )}

      {/* Row actions float over the text on hover instead of reserving a
          column for themselves. The strip carries the row's own colour and is
          masked to fade left, so the title slides out from under it. */}
      {block.type !== "welcome" && (
        <div
          className={cn(
            "absolute inset-y-0 right-0 flex items-center gap-0.5 pr-1.5 pl-6",
            "opacity-0 transition-opacity duration-[var(--duration-micro)]",
            "group-hover:opacity-100 focus-within:opacity-100",
            TONE_CLASSES[meta.tone],
          )}
          style={{
            maskImage: "linear-gradient(to left, black 72%, transparent)",
            WebkitMaskImage: "linear-gradient(to left, black 72%, transparent)",
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Duplicate block" onClick={onDuplicate}>
                <Copy className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <TooltipHint label="Duplicate" keys={KEY.duplicate()} />
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete block"
                onClick={onDelete}
                className="hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            </TooltipTrigger>
            {/* No key: see the note at the foot of the shortcut sheet. */}
            <TooltipContent side="right">Delete</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

/**
 * Block picker. All 25 addable types, grouped and searchable — the old palette
 * was a cramped scrolling grid of 16 tiny buttons pinned to the bottom of the
 * sidebar, and nine schema types had no entry at all.
 */
function BlockPicker({
  onPick,
  onClose,
  decider,
}: {
  onPick: (type: Block["type"], condition: DraftCondition | null) => void;
  onClose: () => void;
  /**
   * The question directly above the insertion point, when there is one that
   * could decide whether the new question is asked at all.
   */
  decider: Block | null;
}) {
  const [query, setQuery] = useState("");
  const [conditional, setConditional] = useState(false);
  const [condition, setCondition] = useState<DraftCondition | null>(null);

  // Default the condition to the decider's first answer, which is the one
  // people mean nine times out of ten.
  const draft: DraftCondition =
    condition ??
    (decider
      ? { ref: decider.ref, op: opsFor(decider)[0]!.value, value: choicesFor(decider)[0]?.value ?? "" }
      : { ref: "", op: "is_not_empty", value: "" });

  const pick = (type: Block["type"]) => onPick(type, conditional && decider ? draft : null);
  const q = query.trim().toLowerCase();
  const matches = BLOCK_LIBRARY.filter(
    (b) => !q || b.label.toLowerCase().includes(q) || b.description.toLowerCase().includes(q),
  );

  return (
    <div
      className="bg-background/60 fixed inset-0 z-[var(--z-modal)] flex items-start justify-center p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card shadow-xl flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-muted/40 flex items-center gap-2 px-3 py-2.5">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && matches[0]) pick(matches[0].type);
            }}
            placeholder="Search blocks…"
            className="h-8 border-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {matches.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No block type matches “{query}”.
            </p>
          ) : (
            BLOCK_GROUPS.map((group) => {
              const items = matches.filter((b) => b.group === group);
              if (!items.length) return null;
              return (
                <div key={group} className="mb-2">
                  <p className="text-muted-foreground text-micro px-2 py-1 font-medium tracking-wide uppercase">
                    {group}
                  </p>
                  {items.map((b) => (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => pick(b.type)}
                      className="hover:bg-muted/70 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors"
                    >
                      <div className={cn("grid size-7 shrink-0 place-items-center rounded-lg", TONE_CLASSES[b.tone])}>
                        <b.icon className="size-3.5" strokeWidth={1.75} />
                      </div>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{b.label}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {b.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/*
          The condition lives with the insert, not in a second dialog.
          Making a question conditional after the fact meant going to the Flow
          view, finding the node and wiring an edge — so in practice questions
          got added unconditionally and the branching was fixed up later, or
          not at all.
        */}
        {decider && (
          <div className="bg-muted/40 space-y-2 px-3 py-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={conditional}
                onChange={(e) => setConditional(e.target.checked)}
                className="accent-[var(--primary)]"
              />
              <GitBranch className="text-muted-foreground size-3.5" />
              Only ask this sometimes
            </label>
            {conditional && (
              <>
                <ConditionRow decider={decider} condition={draft} onChange={setCondition} />
                <p className="text-muted-foreground text-xs">
                  Everyone else skips straight past it.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
