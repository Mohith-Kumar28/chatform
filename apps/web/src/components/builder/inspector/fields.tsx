"use client";

import { useId } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
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
 * Every control here is labelled and described in one place so the per-type
 * inspectors stay declarative. The previous inspector reached for native
 * <select> elements while the shadcn Select sat unused in one file — these
 * wrappers make the styled control the path of least resistance.
 */

export function Field({
  label,
  hint,
  help,
  children,
  className,
}: {
  label: string;
  hint?: string;
  /**
   * An explanation too long to print under every field — an `InfoHint`, folded
   * away behind its icon beside the label. `hint` is for a line worth reading
   * every time; this is for the one you go looking for once.
   */
  help?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-0.5">
        <Label className="text-caption font-medium">{label}</Label>
        {help}
      </div>
      {children}
      {hint && <p className="text-muted-foreground text-[0.6875rem] leading-snug">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  hint,
  help,
  value,
  onChange,
  placeholder,
  multiline,
  maxLength,
  className,
  shortcutTarget,
}: {
  label: string;
  hint?: string;
  help?: React.ReactNode;
  className?: string;
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
    <Field label={label} hint={hint} help={help}>
      {multiline ? (
        <Textarea
          data-shortcut-target={shortcutTarget}
          value={buffered.value}
          onChange={(e) => buffered.onChange(e.target.value)}
          onBlur={buffered.onBlur}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          className="resize-y"
        />
      ) : (
        <Input
          data-shortcut-target={shortcutTarget}
          value={buffered.value}
          onChange={(e) => buffered.onChange(e.target.value)}
          onBlur={buffered.onBlur}
          placeholder={placeholder}
          maxLength={maxLength}
          className={className}
        />
      )}
    </Field>
  );
}

export function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  label: string;
  hint?: string;
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
    <Field label={label} hint={hint}>
      <Input
        type="number"
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
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="text-caption font-medium">
          {label}
        </Label>
        {hint && <p className="text-muted-foreground text-[0.6875rem] leading-snug">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint?: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <Field label={label} hint={hint}>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="w-full">
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
      className="h-8"
    />
  );
}

export function ListEditor({
  label,
  hint,
  items,
  onChange,
  makeItem,
  minItems = 1,
  addLabel = "Add option",
}: {
  label: string;
  hint?: string;
  items: { id: string; label: string }[];
  onChange: (items: { id: string; label: string }[]) => void;
  makeItem: () => { id: string; label: string };
  minItems?: number;
  addLabel?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={item.id} className="group flex items-center gap-1.5">
            <GripVertical className="text-muted-foreground/40 size-3.5 shrink-0" />
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
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...items, makeItem()])}
          className="text-muted-foreground w-full justify-start"
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
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint?: string;
  value: readonly T[];
  onChange: (v: T[]) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <Field label={label} hint={hint}>
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
                "rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                "duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                checked
                  ? "border-primary bg-primary-soft text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-muted-foreground/40",
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
