"use client";

import { GripVertical } from "lucide-react";
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
import { cn } from "@/lib/utils";

/**
 * Drag-to-reorder for the repeated rows in the inspector.
 *
 * The question list has been draggable since it existed; the lists *inside* a
 * question were not, so the order of five choices was whatever order they were
 * typed in, and moving the third one up meant retyping three labels. Same
 * library, same sensors and the same grip as the question list, so there is one
 * reorder gesture in the builder rather than two that look alike.
 *
 * Nesting is deliberate and works: a field group's own cards are sortable and
 * so are the choices inside one of them. Both contexts activate from their own
 * handle's listeners, so a drag on a choice never reaches the card's context.
 */
export function SortableList({
  ids,
  onReorder,
  children,
}: {
  ids: string[];
  /** Indices into the same array `ids` came from. */
  onReorder: (from: number, to: number) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    // 4px before a drag begins, so clicking into a text field to type is never
    // read as the start of one.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) onReorder(from, to);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** Move one item, returning a new array. */
export function moved<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function useSortableRow(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return {
    // Named as dnd-kit names it. `ref` would read better at the call site, but
    // the refs lint rule treats any `x.ref` read in a render as a ref access.
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    /** Spread onto the grip, never onto the row — the row holds an input. */
    handleProps: { ...attributes, ...listeners },
    isDragging,
  };
}

/**
 * The grip.
 *
 * Hidden until the row is hovered or the handle is focused, which is how the
 * question list draws it and how the row's own remove button already behaves —
 * a panel of text fields with a permanent column of grips down its left edge
 * reads as a table of controls rather than as the answers somebody is writing.
 * Keyboard users lose nothing: it is a real button, it takes focus in order,
 * and dnd-kit's keyboard sensor reorders from space and the arrow keys.
 */
export function DragHandle({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "text-muted-foreground shrink-0 cursor-grab touch-none opacity-0 transition-opacity",
        "group-hover:opacity-40 hover:!opacity-80 focus-visible:opacity-80 active:cursor-grabbing",
        className,
      )}
      {...props}
    >
      {children ?? <GripVertical className="size-3.5" />}
    </button>
  );
}
