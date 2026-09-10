"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  BLOCK_PRESENTATION,
  GROUP_FIELD_KINDS,
  type Block,
  type GroupField,
  type GroupFieldKind,
} from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Field, ListEditor } from "./fields";
import { BufferedInput } from "@/components/ui/buffered-input";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

/**
 * What each kind is called, borrowed from the block palette rather than
 * written again — a "Website" column and a Website block should not be two
 * different words for the same thing.
 */
const KIND_OPTIONS = GROUP_FIELD_KINDS.map((kind) => ({
  value: kind,
  label: BLOCK_PRESENTATION[kind].label,
}));

/**
 * A key that has not been named yet.
 *
 * Group keys are the identity of a column — they are what an export header and
 * a webhook payload carry — so they follow the same rule `ref` does: derived
 * once, then left alone however the label changes afterwards. Deriving them on
 * every keystroke would rename a live form's column to `f`, then `fu`, then
 * `ful`; freezing them at creation would leave every column called `field_2`.
 *
 * So a new field gets a placeholder key of this shape, and the label's first
 * blur turns it into something readable. After that the shape no longer
 * matches and nothing touches it again.
 */
const UNNAMED_KEY = /^field_\d+$/;

function keyFrom(label: string, taken: Set<string>, fallback: string): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/(^[^a-z]+|_+$)/g, "")
      .slice(0, 28) || fallback;
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}_${n++}`.slice(0, 31);
  return key;
}

/**
 * The columns of a repeating group, and how many times it repeats.
 *
 * Laid out as one row per column — label, what it collects, whether it is
 * required — because that is the table the author is describing. A stack of
 * separate labelled controls per field would put four boxes on screen to say
 * what one row says.
 */
export function GroupFieldsEditor({
  block,
  patch,
}: {
  block: Extract<Block, { type: "field_group" }>;
  patch: (p: Partial<Block>, coalesceKey?: string) => void;
}) {
  const setFields = (fields: GroupField[]) => patch({ fields } as Partial<Block>);
  const update = (i: number, next: Partial<GroupField>, coalesceKey?: string) =>
    patch(
      { fields: block.fields.map((f, j) => (j === i ? { ...f, ...next } : f)) } as Partial<Block>,
      coalesceKey,
    );

  return (
    <Field
      label="Fields in each entry"
      hint="These are collected once per entry. The name you give a field becomes its column in exports and in the API — set after the first time you name it, so renaming it later is safe."
    >
      <div className="space-y-2">
        {block.fields.map((field, i) => (
          <div key={field.id} className="border-border space-y-1.5 rounded-lg border p-2">
            <div className="flex items-center gap-1.5">
              <BufferedInput
                value={field.label}
                placeholder="Field name"
                onFocus={(e) => {
                  // The placeholder label is there to keep the draft valid, not
                  // to be typed around.
                  if (field.label === "New field") e.target.select();
                }}
                maxLength={200}
                onCommit={(label) => {
                  /*
                    The label and the key it implies move together now.

                    Deriving the key was a separate `onBlur` write, so naming a
                    column produced two edits and two undo steps for one action —
                    and the key was read off the DOM rather than from the value
                    that was actually committed. `GroupField.key` is a regex the
                    schema enforces, so the intermediate states of a name being
                    typed were never valid to send anyway.
                  */
                  const taken = new Set(block.fields.filter((_, j) => j !== i).map((f) => f.key));
                  const key = UNNAMED_KEY.test(field.key) ? keyFrom(label, taken, field.key) : field.key;
                  update(i, key === field.key ? { label } : { label, key }, `gflabel:${field.id}`);
                }}
                className="h-8 min-w-0 flex-1"
              />
              <Select
                value={field.kind}
                onValueChange={(v) =>
                  update(i, {
                    kind: v as GroupFieldKind,
                    // A kind that cannot hold choices drops them rather than
                    // carrying a hidden list back if it is switched again.
                    ...(v === "single_select" ? {} : { options: [] }),
                  })
                }
              >
                <SelectTrigger className="h-8 w-32 shrink-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                role="checkbox"
                aria-checked={field.required}
                title="Every entry must fill this in"
                onClick={() => update(i, { required: !field.required })}
                className={cn(
                  "shrink-0 rounded-md border px-2 py-1.5 text-[0.6875rem] transition-colors",
                  "duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                  field.required
                    ? "border-primary bg-primary-soft text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-muted-foreground/40",
                )}
              >
                Required
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${field.label || "field"}`}
                disabled={block.fields.length <= 1}
                onClick={() => setFields(block.fields.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-30"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>

            {field.kind === "single_select" && (
              <ListEditor
                label="Choices"
                items={field.options.map((o) => ({ id: o.id, label: o.label }))}
                onChange={(items) =>
                  update(i, {
                    options: items.map((item) => {
                      const existing = field.options.find((o) => o.id === item.id);
                      return existing
                        ? { ...existing, label: item.label }
                        : { ...item, image_key: null };
                    }),
                  })
                }
                makeItem={() => ({ id: uid("opt"), label: "" })}
                minItems={1}
                addLabel="Add choice"
              />
            )}
          </div>
        ))}

        <Button
          variant="ghost"
          size="sm"
          disabled={block.fields.length >= 10}
          onClick={() =>
            setFields([
              ...block.fields,
              {
                id: uid("gf"),
                key: `field_${block.fields.length + 1}`,
                // A real word, not an empty box: a label is `min(1)` in the
                // schema, so a field left unnamed is a draft that cannot be
                // saved — and the failure would land on autosave, far from the
                // click that caused it.
                label: "New field",
                kind: "short_text",
                required: false,
                options: [],
              },
            ])
          }
          className="text-muted-foreground w-full justify-start"
        >
          <Plus className="size-3.5" />
          Add field
        </Button>
      </div>
    </Field>
  );
}
