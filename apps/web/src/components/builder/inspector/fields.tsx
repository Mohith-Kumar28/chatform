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
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-caption font-medium">{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-[0.6875rem] leading-snug">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  multiline,
  maxLength,
  shortcutTarget,
}: {
  label: string;
  hint?: string;
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
  return (
    <Field label={label} hint={hint}>
      {multiline ? (
        <Textarea
          data-shortcut-target={shortcutTarget}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          className="resize-y"
        />
      ) : (
        <Input
          data-shortcut-target={shortcutTarget}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
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
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        placeholder={placeholder}
        // An empty box means "no constraint", which is different from 0.
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
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
            <Input
              value={item.label}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...item, label: e.target.value };
                onChange(next);
              }}
              className="h-8"
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
