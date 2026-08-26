"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bot, ChevronDown, GitBranch, Sparkles, Trash2 } from "lucide-react";
import type { Block } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBuilderStore, useSelectedBlock } from "@/stores/builder-store";
import { BLOCK_GROUPS, BLOCK_LIBRARY, blockMeta, TONE_CLASSES } from "../block-library";
import { defaultBlock } from "../default-block";
import { Field, SwitchField, TextField } from "./fields";
import { TypeFields } from "./type-fields";
import { cn } from "@/lib/utils";

/**
 * The right-hand inspector.
 *
 * Sections, top to bottom: identity (type + ref), the question itself, the
 * type-specific fields, agent hints, and the advanced Youform-parity fields.
 * Collapsible sections keep the common case short without hiding anything.
 */
export function BlockInspector() {
  const block = useSelectedBlock();
  const updateBlock = useBuilderStore((s) => s.updateBlock);
  const removeBlock = useBuilderStore((s) => s.removeBlock);
  const doc = useBuilderStore((s) => s.doc);
  const params = useParams<{ id: string }>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!block) {
    return (
      <div className="p-4">
        <EmptyState
          compact
          icon={Sparkles}
          title="Nothing selected"
          description="Pick a block on the left to edit how the agent asks for it."
        />
      </div>
    );
  }

  const meta = blockMeta(block.type);
  const patch = (p: Partial<Block>, coalesceKey?: string) => updateBlock(block.ref, p, coalesceKey);
  const key = (f: string) => `${f}:${block.ref}`;

  // Logic rules that fire on this block, surfaced so the Workflow tab isn't a
  // black box from here.
  const rulesHere =
    doc?.logic.filter((r) => r.action_kind === "goto" && r.from === block.ref).length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("grid size-7 shrink-0 place-items-center rounded-lg", TONE_CLASSES[meta.tone])}>
            <meta.icon className="size-3.5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{meta.label}</p>
            <p className="text-muted-foreground truncate font-mono text-[0.6875rem]">{block.ref}</p>
          </div>
        </div>
        {block.type !== "welcome" && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete block"
            onClick={() => setConfirmDelete(true)}
            className="text-muted-foreground hover:text-destructive shrink-0"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* type switcher */}
        {block.type !== "welcome" && (
          <Field label="Block type" hint="Changing type keeps the question and ref.">
            <Select
              value={block.type}
              onValueChange={(next) => {
                if (next === block.type) return;
                // Rebuild from defaults for the new type, but carry across the
                // things that identify the question rather than its shape.
                const refs = new Set(doc?.blocks.map((b) => b.ref) ?? []);
                refs.delete(block.ref);
                const fresh = defaultBlock(next as Block["type"], refs);
                patch({
                  ...fresh,
                  id: block.id,
                  ref: block.ref,
                  title: block.title,
                  description: block.description,
                  required: block.required,
                  agentHints: block.agentHints,
                  visibility: block.visibility,
                } as Partial<Block>);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLOCK_GROUPS.map((group) => {
                  const items = BLOCK_LIBRARY.filter((b) => b.group === group);
                  if (!items.length) return null;
                  return (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {items.map((b) => (
                        <SelectItem key={b.type} value={b.type}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
        )}

        <TextField
          label="Question"
          hint="What the agent is trying to find out. It rephrases this naturally."
          value={block.title}
          onChange={(v) => patch({ title: v }, key("title"))}
          multiline
          maxLength={2000}
        />

        <TextField
          label="Description"
          hint="Extra context shown with the question."
          value={block.description ?? ""}
          onChange={(v) => patch({ description: v || undefined }, key("description"))}
          multiline
          maxLength={5000}
        />

        {block.type !== "welcome" && block.type !== "statement" && (
          <SwitchField
            label="Required"
            hint="The agent will keep asking until it gets a usable answer."
            checked={block.required}
            onChange={(v) => patch({ required: v })}
          />
        )}

        <TypeFields block={block} patch={patch} />

        <Section
          title="Agent hints"
          icon={Bot}
          badge={block.agentHints ? "Set" : undefined}
          description="Coach the interviewer on how to ask for this one."
        >
          <TextField
            label="How to ask"
            hint='e.g. "casually, and mention it is optional"'
            value={block.agentHints?.askStyle ?? ""}
            onChange={(v) =>
              patch({ agentHints: { ...(block.agentHints ?? { examples: [] }), askStyle: v || undefined } }, key("askStyle"))
            }
          />
          <TextField
            label="Why we ask"
            hint="Used when the respondent asks why this is needed."
            value={block.agentHints?.whyWeAsk ?? ""}
            onChange={(v) =>
              patch({ agentHints: { ...(block.agentHints ?? { examples: [] }), whyWeAsk: v || undefined } }, key("whyWeAsk"))
            }
          />
          <TextField
            label="If they push back"
            hint="What to say when they refuse or give something unusable."
            value={block.agentHints?.retryHint ?? ""}
            onChange={(v) =>
              patch({ agentHints: { ...(block.agentHints ?? { examples: [] }), retryHint: v || undefined } }, key("retryHint"))
            }
          />
        </Section>

        <Section title="Advanced" icon={GitBranch} description="Prefill, cover image and logic.">
          <TextField
            label="Auto-fill from URL parameter"
            hint="Prefills this answer from ?param=value on the form link."
            value={block.prefillParam ?? ""}
            onChange={(v) => patch({ prefillParam: v || undefined }, key("prefill"))}
          />
          <TextField
            label="Button text"
            hint="Label on the advance control. Leave empty for the default."
            value={block.buttonLabel ?? ""}
            onChange={(v) => patch({ buttonLabel: v || undefined }, key("btn"))}
            maxLength={60}
          />
          <Field label="Branching">
            <Button variant="outline" size="sm" asChild className="w-full justify-start">
              <Link href={`/forms/${params.id}/workflow?focus=${block.ref}`}>
                <GitBranch className="size-3.5" />
                {rulesHere > 0 ? `${rulesHere} rule${rulesHere > 1 ? "s" : ""} from here` : "Add branching logic"}
              </Link>
            </Button>
          </Field>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${block.title.slice(0, 40) || meta.label}"?`}
        description="Any branching rules that point at this block will be removed too. Answers already collected are kept."
        confirmLabel="Delete block"
        onConfirm={() => removeBlock(block.ref)}
      />
    </div>
  );
}

/** Collapsible inspector section — collapsed by default to keep the panel short. */
function Section({
  title,
  icon: Icon,
  description,
  badge,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  description?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-border rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hover:bg-muted/40 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors"
      >
        <Icon className="text-muted-foreground size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="text-caption flex-1 font-medium">{title}</span>
        {badge && (
          <Badge variant="secondary" className="text-[0.625rem]">
            {badge}
          </Badge>
        )}
        <ChevronDown
          className={cn(
            "text-muted-foreground size-3.5 shrink-0 transition-transform duration-[var(--duration-micro)]",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-border space-y-4 border-t px-3 py-3">
          {description && <p className="text-muted-foreground text-micro">{description}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
