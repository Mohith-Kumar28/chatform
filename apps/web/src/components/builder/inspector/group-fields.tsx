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
import { InfoHint } from "@/components/ui/info-hint";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Field, ListEditor } from "./fields";
import { BufferedInput } from "@/components/ui/buffered-input";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

/** The schema's own ceiling, so the button disappears exactly when it stops working. */
const MAX_FIELDS = 10;

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

/** Whether a pattern is one the browser can actually compile. */
export function patternIsValid(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * What a pattern is, for an author who has never written one.
 *
 * The box takes a regular expression and there is no way to guess that from an
 * empty input labelled "Pattern" — so the explanation sits behind the icon next
 * to it, with the two or three shapes anybody actually reaches for.
 */
export function PatternHelp() {
  return (
    <InfoHint label="What is a pattern?">
      <p>
        A rule the answer has to match, written as a regular expression. Leave it empty to
        accept anything.
      </p>
      <ul className="mt-2 space-y-1">
        <li>
          <code className="text-foreground">^[0-9]&#123;10&#125;$</code> — exactly 10 digits
        </li>
        <li>
          <code className="text-foreground">^1[A-Z]&#123;2&#125;[0-9]&#123;2&#125;.+$</code> — a USN
          shape
        </li>
        <li>
          <code className="text-foreground">^[A-Z]&#123;3&#125;-[0-9]+$</code> — ABC-1234
        </li>
      </ul>
      <p className="mt-2">
        Someone whose answer doesn&apos;t match is asked to fix it before moving on.
      </p>
    </InfoHint>
  );
}

/**
 * The columns of a repeating group, and how many times it repeats.
 *
 * One card per column, two rows deep: the name on its own line, then what it
 * collects and whether it is required. They were one line each, which in a
 * 380px panel meant a name box roughly wide enough for one character — an
 * author editing a group could not read the names of the columns they had
 * already made, which is the one thing this list exists to show.
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
          <div
            key={field.id}
            className="border-border bg-muted/25 space-y-2 rounded-xl border p-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-3 shrink-0 text-center text-[0.6875rem] tabular-nums">
                {i + 1}
              </span>
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
                className="h-8 min-w-0 flex-1 font-medium"
              />
              {/* A group needs one column to be a group at all, so at one field
                  there is nothing to remove — and a permanently greyed button is
                  a worse way to say that than no button. */}
              {block.fields.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${field.label || "field"}`}
                  onClick={() => setFields(block.fields.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 pl-5">
              <Select
                value={field.kind}
                onValueChange={(v) =>
                  update(i, {
                    kind: v as GroupFieldKind,
                    // A kind that cannot hold choices — or a pattern — drops them
                    // rather than carrying a hidden value back if it is switched
                    // again.
                    ...(v === "single_select" ? {} : { options: [] }),
                    ...(v === "short_text" ? {} : { pattern: undefined }),
                  })
                }
              >
                <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
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
              {/*
                A switch, not a pill that only says "Required".

                The pill was on when it was tinted and off when it was not, which
                is the same word in both states — you had to know the convention
                to read it. A switch is the control this panel already uses for
                every other yes/no, including the block's own Required toggle
                four inches above it.
              */}
              <div className="flex shrink-0 items-center gap-1.5">
                <Label
                  htmlFor={`req_${field.id}`}
                  className={cn(
                    "cursor-pointer text-[0.6875rem]",
                    field.required ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  Required
                </Label>
                <Switch
                  id={`req_${field.id}`}
                  size="sm"
                  checked={field.required}
                  onCheckedChange={(v) => update(i, { required: v })}
                  aria-label={`${field.label || "This field"} is required in every entry`}
                />
              </div>
            </div>

            {field.kind === "single_select" && (
              <div className="pl-5">
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
              </div>
            )}

            {field.kind === "short_text" && (
              <div className="space-y-1 pl-5">
                <div className="flex items-center gap-0.5">
                  <Label className="text-muted-foreground text-[0.6875rem] font-medium">
                    Pattern
                  </Label>
                  <PatternHelp />
                </div>
                <BufferedInput
                  value={field.pattern ?? ""}
                  placeholder="^[0-9]{10}$"
                  maxLength={500}
                  onCommit={(v) => update(i, { pattern: v.trim() || undefined }, `gfpat:${field.id}`)}
                  className="h-8 font-mono text-xs"
                />
                {field.pattern && !patternIsValid(field.pattern) && (
                  <p className="text-destructive text-[0.6875rem] leading-snug">
                    This isn&apos;t a valid pattern, so nothing is checked against it.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Ten is the schema's limit; past it the button could only fail. */}
        {block.fields.length < MAX_FIELDS && (
          <Button
            variant="ghost"
            size="sm"
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
        )}
      </div>
    </Field>
  );
}
