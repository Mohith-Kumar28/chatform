"use client";

import { useCallback, useState } from "react";
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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { KeyHint } from "./primitives";
import { FIELD_SEMANTICS } from "./input-semantics";
import { useChoiceKeys } from "./choice-keys";

/**
 * Composers for the record-shaped block types.
 *
 * `contact_info`, `address`, `ranking` and `matrix` all previously fell through
 * to a single plain text input, which could not produce the record or array
 * shape `validateAnswer` requires — so they were unanswerable in practice.
 */

const CONTACT_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  phone: "Phone",
  street: "Street",
  city: "City",
  state: "State / region",
  postal: "Postal code",
  country: "Country",
};

export function FieldsComposer({
  fields,
  required,
  onSubmit,
}: {
  fields: readonly string[];
  /** A required record needs every field, which is what the server enforces. */
  required?: boolean;
  onSubmit: (value: Record<string, string>, display: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const filled = fields.filter((f) => values[f]?.trim());
  const missing = required ? fields.filter((f) => !values[f]?.trim()) : [];

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => {
          /*
            The autofill token is the whole point of naming these fields. A
            browser holding somebody's address will fill all five of these in
            one tap — but only if each one says which part it is, in the
            vocabulary the spec defines. See `input-semantics.ts`.
          */
          const meta = FIELD_SEMANTICS[f];
          return (
            <label key={f} className="space-y-1">
              <span className="block text-xs opacity-60">{CONTACT_LABELS[f] ?? f}</span>
              <input
                value={values[f] ?? ""}
                name={f}
                type={meta?.type ?? "text"}
                inputMode={meta?.inputMode}
                autoComplete={meta?.autoComplete ?? "off"}
                autoCapitalize={meta?.autoCapitalize ?? "sentences"}
                onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                className="h-11 w-full rounded-xl border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] px-3 text-[0.9375rem] outline-none focus:border-[var(--cf-accent)]"
              />
            </label>
          );
        })}
      </div>
      {missing.length > 0 && filled.length > 0 && (
        <p className="px-1 text-xs opacity-55">
          Still needed: {missing.map((f) => (CONTACT_LABELS[f] ?? f).toLowerCase()).join(", ")}.
        </p>
      )}
      <button
        type="button"
        disabled={filled.length === 0 || missing.length > 0}
        onClick={() => {
          const clean = Object.fromEntries(
            Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]),
          );
          onSubmit(clean, Object.values(clean).join(", "));
        }}
        className="h-11 w-full rounded-full bg-[var(--cf-accent)] text-sm font-medium text-[var(--cf-accent-text)] transition-transform active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40"
      >
        Continue
      </button>
    </div>
  );
}

/**
 * Ranking — tap or press a key to place, drag to rearrange.
 *
 * The grip used to sit on the *unranked* chips, which are tap-only: it
 * advertised a drag in the one place nothing could be dragged, while the
 * ranked rows — the only things that have an order to change — offered no way
 * to change it short of removing an item and re-tapping everything after it.
 * The handle now lives where the reordering happens.
 *
 * The badge on an unranked chip used to be the slot the chip would land in —
 * the same number on every chip, four "2"s in a row, drawn in the position of
 * a key hint on a question where every other block type puts a real shortcut.
 * It is now the option's own key, fixed to its place in the list so pressing 3
 * means the third option however much of the ranking is already built.
 */
export function RankingComposer({
  items,
  onSubmit,
  disabled,
}: {
  items: readonly { id: string; label: string }[];
  onSubmit: (order: string[], display: string) => void;
  disabled?: boolean;
}) {
  const [order, setOrder] = useState<string[]>([]);
  // Keys come from the item's position in the *question*, not in what is left
  // to rank: a shortcut that renumbers itself after every pick is one nobody
  // can aim at twice.
  const remaining = items
    .map((item, i) => ({ ...item, hotkey: i < 9 ? String(i + 1) : undefined }))
    .filter((i) => !order.includes(i.id));
  const place = useCallback((id: string) => setOrder((o) => (o.includes(id) ? o : [...o, id])), []);
  const display = useCallback(
    (o: string[]) => o.map((id, i) => `${i + 1}. ${items.find((x) => x.id === id)?.label}`).join(", "),
    [items],
  );
  const submit = useCallback(() => onSubmit(order, display(order)), [display, onSubmit, order]);

  useChoiceKeys(
    // Only what is still unranked answers to a key: pressing 3 twice should
    // not move an item that is already placed.
    disabled
      ? []
      : remaining.flatMap((item) =>
          item.hotkey ? [{ id: item.id, label: item.label, value: item.id, key: item.hotkey }] : [],
        ),
    (choice) => place(choice.id),
    // Enter confirms, but only once there is a complete ranking to confirm.
    !disabled && remaining.length === 0 && order.length > 0 ? submit : undefined,
  );
  const sensors = useSensors(
    // A short threshold so a tap on "Remove" is still a tap, not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((o) => {
      const from = o.indexOf(String(active.id));
      const to = o.indexOf(String(over.id));
      return from < 0 || to < 0 ? o : arrayMove(o, from, to);
    });
  }

  return (
    <div className="space-y-2">
      {order.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ol className="space-y-1">
              {order.map((id, i) => (
                <RankedRow
                  key={id}
                  id={id}
                  position={i + 1}
                  label={items.find((x) => x.id === id)?.label ?? id}
                  draggable={order.length > 1}
                  onRemove={() => setOrder((o) => o.filter((x) => x !== id))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {remaining.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => place(item.id)}
              className={cn(
                "group flex min-h-[2.75rem] items-center gap-1.5 rounded-full border border-[var(--cf-chip-border)]",
                "bg-[var(--cf-chip-bg)] px-3.5 py-2 text-sm transition-colors hover:border-[var(--cf-accent)]",
                "disabled:pointer-events-none disabled:opacity-50 sm:min-h-0",
              )}
            >
              {/* The key that places it, not the slot it lands in: a slot is
                  the same number on every chip at once. `KeyHint` draws itself
                  only where there is a keyboard, so a tap-only respondent gets
                  the label and the "tap in order" line under it. */}
              {item.hotkey && <KeyHint>{item.hotkey}</KeyHint>}
              {item.label}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs opacity-50">
        {remaining.length > 0
          ? order.length > 1
            ? "Tap in order, best first · drag a handle to rearrange."
            : "Tap in order, best first."
          : "All ranked — drag a handle to rearrange."}
      </p>

      <button
        type="button"
        disabled={disabled || remaining.length > 0}
        onClick={submit}
        className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--cf-accent)] text-sm font-medium text-[var(--cf-accent-text)] transition-transform active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40"
      >
        Confirm ranking
        <KeyHint tone="inverse">↵</KeyHint>
      </button>
    </div>
  );
}

/** One placed item. The grip is the drag handle — and only appears once there
 *  is something to reorder against. */
function RankedRow({
  id,
  position,
  label,
  draggable,
  onRemove,
}: {
  id: string;
  position: number;
  label: string;
  draggable: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-xl border border-[var(--cf-accent)] bg-[var(--cf-chip-bg)] py-2 pr-3 pl-1.5 text-sm",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      {draggable ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${label}`}
          className="shrink-0 cursor-grab touch-none rounded-md p-1 opacity-35 transition-opacity hover:opacity-90 focus-visible:opacity-90 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
      ) : (
        <span className="size-3.5 shrink-0 p-1" aria-hidden />
      )}
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--cf-accent)] text-[0.625rem] font-semibold text-[var(--cf-accent-text)]">
        {position}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-xs opacity-50 transition-opacity hover:opacity-100"
      >
        Remove
      </button>
    </li>
  );
}

export function MatrixComposer({
  rows,
  columns,
  multiple,
  onSubmit,
}: {
  rows: readonly { id: string; label: string }[];
  columns: readonly { id: string; label: string }[];
  multiple: boolean;
  onSubmit: (value: Record<string, string | string[]>, display: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  function toggle(rowId: string, colId: string) {
    setAnswers((a) => {
      if (!multiple) return { ...a, [rowId]: colId };
      const current = Array.isArray(a[rowId]) ? (a[rowId] as string[]) : [];
      return {
        ...a,
        [rowId]: current.includes(colId) ? current.filter((c) => c !== colId) : [...current, colId],
      };
    });
  }

  function isOn(rowId: string, colId: string) {
    const v = answers[rowId];
    return Array.isArray(v) ? v.includes(colId) : v === colId;
  }

  const complete = rows.every((r) => {
    const v = answers[r.id];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="space-y-1">
            <p className="text-xs opacity-70">{row.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => toggle(row.id, col.id)}
                  aria-pressed={isOn(row.id, col.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    isOn(row.id, col.id)
                      ? "border-transparent bg-[var(--cf-accent)] text-[var(--cf-accent-text)]"
                      : "border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] hover:border-[var(--cf-accent)]",
                  )}
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={!complete}
        onClick={() =>
          onSubmit(
            answers,
            rows
              .map((r) => {
                const v = answers[r.id];
                const labels = (Array.isArray(v) ? v : [v])
                  .map((id) => columns.find((c) => c.id === id)?.label)
                  .filter(Boolean);
                return `${r.label}: ${labels.join(", ")}`;
              })
              .join(" · "),
          )
        }
        className="h-11 w-full rounded-full bg-[var(--cf-accent)] text-sm font-medium text-[var(--cf-accent-text)] transition-transform active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40"
      >
        Continue
      </button>
    </div>
  );
}
