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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBuilderStore } from "@/stores/builder-store";
import { computeBranchLayout } from "./branch-layout";
import { BLOCK_GROUPS, BLOCK_LIBRARY, blockMeta, TONE_ACCENT, TONE_CLASSES } from "./block-library";
import { defaultBlock } from "./default-block";
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

  const [picker, setPicker] = useState<{ index: number } | null>(null);
  // Which questions are only asked under a condition, and under which one.
  const layout = useMemo(() => (doc ? computeBranchLayout(doc) : new Map()), [doc]);

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
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Add block at end"
            onClick={() => setPicker({ index: doc.blocks.length })}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={doc.blocks.map((b) => b.ref)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="space-y-0.5">
                {doc.blocks.map((block, i) => {
                  const branch = layout.get(block.ref);
                  const prev = i > 0 ? layout.get(doc.blocks[i - 1]!.ref) : undefined;
                  return (
                    <li key={block.ref}>
                      <InsertPoint onClick={() => setPicker({ index: i })} />
                      {/* The condition is stated once above the first arm that
                          answers it; a second arm of the same question repeats
                          only its own answer, not the whole sentence. */}
                      {branch?.condition && (
                        <BranchLabel
                          condition={branch.condition}
                          sourceTitle={branch.sourceTitle}
                          depth={branch.depth}
                          repeat={prev?.sourceRef === branch.sourceRef}
                        />
                      )}
                      <div style={{ paddingLeft: branch ? branch.depth * 14 : 0 }}>
                        <SortableRow
                          block={block}
                          index={i}
                          selected={selectedRef === block.ref}
                          conditional={Boolean(branch?.condition)}
                          branches={Boolean(branch?.branches)}
                          onSelect={() => select(block.ref)}
                          onDuplicate={() => duplicateBlock(block.ref)}
                          onDelete={() => removeBlock(block.ref)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </SortableContext>
          </DndContext>

          <InsertPoint onClick={() => setPicker({ index: doc.blocks.length })} />

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

        {picker && (
          <BlockPicker
            onClose={() => setPicker(null)}
            onPick={(type) => {
              const refs = new Set(doc.blocks.map((b) => b.ref));
              addBlock(defaultBlock(type, refs), picker.index);
              setPicker(null);
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

/** "Only if — iPhone", sitting above the questions that answer to it. */
function BranchLabel({
  condition,
  sourceTitle,
  depth,
  repeat,
}: {
  condition: string;
  sourceTitle: string | null;
  depth: number;
  repeat: boolean;
}) {
  return (
    <div
      className="text-muted-foreground flex items-center gap-1.5 pt-1.5 pb-1 text-[0.625rem] leading-none"
      style={{ paddingLeft: Math.max(0, depth - 1) * 14 + 4 }}
    >
      <CornerDownRight className="size-3 shrink-0 opacity-50" />
      <span className="min-w-0 truncate">
        {!repeat && sourceTitle && <span className="opacity-60">{sourceTitle} — </span>}
        <span className="font-medium">{condition}</span>
      </span>
    </div>
  );
}

function SortableRow({
  block,
  index,
  selected,
  conditional,
  branches,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  block: Block;
  index: number;
  selected: boolean;
  /** Only reached under a condition. */
  conditional: boolean;
  /** Splits the flow into arms. */
  branches: boolean;
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
        // An arm is set slightly back from the trunk so the column reads as a
        // shape rather than a list.
        conditional && "rounded-l-md",
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
        {/* Two lines before the ellipsis: one line truncated after ~three
            words made the list unreadable. */}
        <span className={cn("line-clamp-2 min-w-0 flex-1 text-xs leading-snug", selected && "font-semibold")}>
          {block.title || meta.label}
        </span>
        {/* This question sends different answers different ways. */}
        {branches && <GitBranch className="mt-0.5 size-3 shrink-0 opacity-45" aria-label="Branches" />}
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
            <TooltipContent side="right">Duplicate</TooltipContent>
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
}: {
  onPick: (type: Block["type"]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
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
              if (e.key === "Enter" && matches[0]) onPick(matches[0].type);
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
                      onClick={() => onPick(b.type)}
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
      </div>
    </div>
  );
}
