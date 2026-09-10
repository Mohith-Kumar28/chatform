"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Asterisk,
  GitBranch,
  CornerDownRight,
  Copy,
  Flag,
  ShieldAlert,
  GripVertical,
  Hash,
  Plus,
  Search,
  SquarePen,
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
import { toast } from "sonner";
import type { Block } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { blockMeta, TONE_ACCENT, TONE_CLASSES, type CatalogItem } from "./block-library";
import { NodeCatalog, firstCatalogMatch } from "./node-catalog";
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
  const addEnding = useBuilderStore((s) => s.addEnding);
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
                      total={doc.blocks.length}
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
              {/*
                Green accepts, red refuses — the same pairing the canvas node
                and the ending inspector use. Every ending was the same orange
                flag here, so the row that turns people away looked exactly
                like the one that thanks them.
              */}
              {doc.endings.map((ending) => {
                const screenOut = ending.kind === "screen_out";
                const isSelected = selectedEndingRef === ending.ref;
                const accent = screenOut ? "var(--destructive)" : "var(--success)";
                const Icon = screenOut ? ShieldAlert : Flag;
                return (
                  <li key={ending.ref}>
                    <button
                      type="button"
                      onClick={() => selectEnding(ending.ref)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left",
                        "transition-opacity duration-[var(--duration-micro)]",
                        isSelected ? "opacity-100" : "opacity-[0.82] hover:opacity-100",
                      )}
                      style={{
                        background: screenOut ? "var(--destructive-soft)" : "var(--success-soft)",
                        color: screenOut
                          ? "var(--destructive-soft-foreground)"
                          : "var(--success-soft-foreground)",
                        boxShadow: isSelected ? `inset 3px 0 0 0 ${accent}` : undefined,
                      }}
                    >
                      <Icon className="size-3.5 shrink-0" strokeWidth={2} style={{ color: accent }} />
                      <span className="line-clamp-1 min-w-0 flex-1 text-xs">{ending.title}</span>
                      <span className="text-micro shrink-0 font-medium tracking-wide uppercase opacity-70">
                        {screenOut ? "Can't submit" : "Done"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {pickerIndex !== null && (
          <BlockPicker
            onClose={closePicker}
            branchFrom={doc.blocks[pickerIndex - 1] ?? null}
            onPick={(item) => {
              if (item.kind === "ending") {
                addEnding();
              } else if (item.blockType) {
                const refs = new Set(doc.blocks.map((b) => b.ref));
                addBlock(defaultBlock(item.blockType, refs), pickerIndex);
              }
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
  total,
  selected,
  flow,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  block: Block;
  index: number;
  /** How many questions there are, so the row knows when it cannot move down. */
  total: number;
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
  const moveBlock = useBuilderStore((s) => s.moveBlock);
  const updateBlock = useBuilderStore((s) => s.updateBlock);
  const openPicker = useBuilderStore((s) => s.openPicker);

  return (
    <RowMenu
      block={block}
      index={index}
      total={total}
      onSelect={onSelect}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onInsertAbove={() => openPicker(index)}
      onInsertBelow={() => openPicker(index + 1)}
      onMoveUp={() => moveBlock(index, index - 1)}
      onMoveDown={() => moveBlock(index, index + 1)}
      onToggleRequired={() => updateBlock(block.ref, { required: !block.required } as Partial<Block>)}
    >
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
    </RowMenu>
  );
}

/**
 * Right-click on a question in the list.
 *
 * The row already carries duplicate and delete, on hover, in a strip that
 * fades in over the title — which is the right amount of chrome for a list this
 * dense and the wrong place to put the other six things you might want. Moving
 * a question meant dragging it, inserting one meant finding the hairline
 * between two rows, and making one required meant opening the inspector.
 *
 * All of it is here, on the gesture that costs nothing to try. Built on
 * `@/components/ui/context-menu` — shadcn's, over Radix's — so it behaves like
 * every other menu in the app rather than like a bespoke popover.
 *
 * The welcome block gets a shorter menu for the same reason it has no hover
 * actions: it cannot be duplicated, moved or deleted, and offering to do so
 * would be a menu of disabled rows.
 */
function RowMenu({
  block,
  index,
  total,
  onSelect,
  onDuplicate,
  onDelete,
  onInsertAbove,
  onInsertBelow,
  onMoveUp,
  onMoveDown,
  onToggleRequired,
  children,
}: {
  block: Block;
  index: number;
  total: number;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleRequired: () => void;
  children: React.ReactNode;
}) {
  const welcome = block.type === "welcome";
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onSelect}>
          <SquarePen />
          Open in details
        </ContextMenuItem>
        {!welcome && (
          <ContextMenuItem onSelect={onDuplicate}>
            <Copy />
            Duplicate
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onInsertAbove}>
          <Plus />
          Add a question above
        </ContextMenuItem>
        <ContextMenuItem onSelect={onInsertBelow}>
          <Plus />
          Add a question below
        </ContextMenuItem>
        {!welcome && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={index <= 1} onSelect={onMoveUp}>
              <ArrowUp />
              Move up
            </ContextMenuItem>
            <ContextMenuItem disabled={index >= total - 1} onSelect={onMoveDown}>
              <ArrowDown />
              Move down
            </ContextMenuItem>
            <ContextMenuItem onSelect={onToggleRequired}>
              <Asterisk />
              {block.required ? "Make optional" : "Make required"}
            </ContextMenuItem>
          </>
        )}
        <ContextMenuItem
          onSelect={() => {
            void navigator.clipboard?.writeText(block.ref);
            toast(`Copied ${block.ref}`, {
              description: "The name this answer is stored and exported under.",
            });
          }}
        >
          <Hash />
          Copy reference
        </ContextMenuItem>
        {!welcome && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The picker: everything a form is made of, grouped and searchable.
 *
 * It draws `NodeCatalog` — the same component, the same items, the same order
 * as the Flow view's node library — so the two palettes cannot drift again.
 * Which is how Ending got here: it existed on the canvas and nowhere else.
 *
 * What left is the "Only ask this sometimes" checkbox that used to sit along
 * the bottom. It put a whole branching UI — a checkbox, an operator select and
 * a value field — inside a dialog whose only job is "which kind of block?",
 * and it appeared only when the question above happened to be one you could
 * branch on, so the dialog changed shape depending on where you had clicked.
 * A branch is a node in the catalogue like anything else, and picking it goes
 * to the canvas, which is the one place a branch can be seen.
 */
function BlockPicker({
  onPick,
  onClose,
  branchFrom,
}: {
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
  /** The question a branch added here would leave from, if there is one. */
  branchFrom: Block | null;
}) {
  const [query, setQuery] = useState("");
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const pick = (item: CatalogItem) => {
    if (item.kind === "branch") {
      if (!branchFrom) return;
      onClose();
      router.push(`/forms/${params.id}/workflow?focus=${branchFrom.ref}`);
      return;
    }
    onPick(item);
  };

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
              // Only with something typed. Empty, the "first match" is the
              // first item in the catalogue — Branch — and ↵ on an untouched
              // picker would leave the page for the flow canvas.
              if (e.key === "Enter" && query.trim()) {
                const first = firstCatalogMatch(query);
                if (first) pick(first);
              }
            }}
            placeholder="Search blocks…"
            className="h-8 border-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <NodeCatalog
            variant="detailed"
            query={query}
            onPick={pick}
            reason={(item) =>
              item.kind === "branch" && !branchFrom
                ? "Add a question first — a branch has to leave from one."
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
