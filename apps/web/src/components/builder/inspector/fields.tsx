"use client";

import { useId } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useBufferedValue } from "@/hooks/use-buffered-value";

/**
 * Inspector field primitives.
 *
 * Every control here is labelled in one place so the per-type inspectors stay
 * declarative. The panel carries a label and a control per field and nothing
 * else: explanatory subtext under every box made it read as a wall of grey, so
 * the only line a field may print beneath itself is an `error`. Anything worth
 * explaining once goes behind a `help` icon.
 */

/**
 * The inspector's box: filled rather than outlined, so a panel of fields reads
 * as a column of soft surfaces instead of a grid of rules. The border only
 * appears on hover and focus, where it is telling you something.
 */
export const fieldInputClass =
  "rounded-lg border-transparent bg-muted/70 shadow-none dark:bg-muted/70 hover:border-border focus-visible:border-ring focus-visible:bg-background dark:focus-visible:bg-background";

/** The same surface, sized for prose. */
export const fieldTextareaClass = cn(
  fieldInputClass,
  "min-h-20 resize-none px-3 py-2.5 leading-relaxed",
);

export function Field({
  label,
  error,
  help,
  children,
  className,
  inspect,
}: {
  label?: string;
  /** The one line a field may print under itself. */
  error?: string;
  /** An `InfoHint` beside the label, for the explanation you look for once. */
  help?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** The preview region this field edits — see `inspector-reveal`. */
  inspect?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} data-inspect-target={inspect}>
      {label && (
        <div className="flex items-center gap-0.5">
          <Label className="text-muted-foreground text-xs font-medium">{label}</Label>
          {help}
        </div>
      )}
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

export function TextField({
  label,
  error,
  help,
  value,
  onChange,
  placeholder,
  multiline,
  maxLength,
  className,
  shortcutTarget,
  inspect,
}: {
  label?: string;
  error?: string;
  help?: React.ReactNode;
  className?: string;
  inspect?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  /**
   * Names this field for `focusTarget`, so a key can put the caret here
   * without a ref threaded down from the builder shell.
   */
  shortcutTarget?: string;
}) {
  /*
    Buffered, because a keystroke is not an edit.

    Roughly forty of the builder's typed fields render through this component,
    and every one of them used to write a whole new document per character —
    which marked the form dirty, restarted the save timer, and submitted whatever
    half-finished value was in the box for validation. Committing on blur or
    after a pause makes the document change once per thing the author actually
    changed. See `useBufferedValue`.
  */
  const buffered = useBufferedValue(value, onChange);
  return (
    <Field label={label} error={error} help={help} inspect={inspect}>
      {multiline ? (
        <Textarea
          data-shortcut-target={shortcutTarget}
          value={buffered.value}
          onChange={(e) => buffered.onChange(e.target.value)}
          onBlur={buffered.onBlur}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          className={fieldTextareaClass}
        />
      ) : (
        <Input
          data-shortcut-target={shortcutTarget}
          value={buffered.value}
          onChange={(e) => buffered.onChange(e.target.value)}
          onBlur={buffered.onBlur}
          placeholder={placeholder}
          maxLength={maxLength}
          className={cn(fieldInputClass, className)}
        />
      )}
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  /*
    Numbers need this more than text does, not less.

    Several numeric fields have a floor well above their first digit —
    `sessionTokenBudget` starts at 1000, `maxTurns` at 5 — so every prefix of a
    legitimate answer is a value the schema refuses. Typing `12000` used to send
    `1`, `12` and `120` for validation before it sent anything acceptable.
  */
  const buffered = useBufferedValue(value === undefined ? "" : String(value), (raw) =>
    // An empty box means "no constraint", which is different from 0.
    onChange(raw === "" ? undefined : Number(raw)),
  );
  return (
    <Field label={label}>
      <Input
        type="number"
        className={fieldInputClass}
        value={buffered.value}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => buffered.onChange(e.target.value)}
        onBlur={buffered.onBlur}
      />
    </Field>
  );
}

export function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="min-w-0 cursor-pointer text-sm font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className={cn("w-full", fieldInputClass)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Editable list of `{id,label}` records — options, ranking items, matrix rows. */
/**
 * One row of a `ListEditor`, buffered.
 *
 * A component of its own only because the rows are produced in a loop and a hook
 * cannot be. Worth the indirection: an option's label is `z.string().min(1)`, so
 * clearing one in order to retype it produced a document the server refused —
 * and refused the rest of the form along with it.
 */
function ListItemInput({
  value,
  onCommit,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  ariaLabel: string;
}) {
  const buffered = useBufferedValue(value, onCommit);
  return (
    <Input
      aria-label={ariaLabel}
      value={buffered.value}
      onChange={(e) => buffered.onChange(e.target.value)}
      onBlur={buffered.onBlur}
      className={cn("h-9", fieldInputClass)}
    />
  );
}

export function ListEditor({
  label,
  items,
  onChange,
  makeItem,
  minItems = 1,
  addLabel = "Add option",
  inspect,
}: {
  label: string;
  items: { id: string; label: string }[];
  onChange: (items: { id: string; label: string }[]) => void;
  makeItem: () => { id: string; label: string };
  minItems?: number;
  addLabel?: string;
  inspect?: string;
}) {
  return (
    <Field label={label} inspect={inspect}>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={item.id} className="group flex items-center gap-1">
            <ListItemInput
              value={item.label}
              onCommit={(label) => {
                const next = [...items];
                next[i] = { ...item, label };
                onChange(next);
              }}
              ariaLabel={`${label} ${i + 1}`}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${item.label || "option"}`}
              disabled={items.length <= minItems}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...items, makeItem()])}
          className="text-muted-foreground hover:text-foreground -ml-2 justify-start"
        >
          <Plus className="size-3.5" />
          {addLabel}
        </Button>
      </div>
    </Field>
  );
}

/** Multi-checkbox for the fixed field sets on contact_info and address. */
export function CheckboxGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: readonly T[];
  onChange: (v: T[]) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((o) => {
          const checked = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() =>
                onChange(checked ? value.filter((v) => v !== o.value) : [...value, o.value])
              }
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                "duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                checked
                  ? "border-primary bg-primary-soft text-primary font-medium"
                  : "bg-muted/70 text-muted-foreground border-transparent hover:border-border",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
