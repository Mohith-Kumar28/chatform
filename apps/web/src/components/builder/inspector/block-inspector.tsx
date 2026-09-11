"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bot, ChevronDown, GitBranch, Sparkles, Trash2 } from "lucide-react";
import {
  IDENTITY_FIELDS,
  IDENTITY_FIELD_LABELS,
  canMapIdentityField,
  type Block,
  type IdentityFieldSetting,
} from "@repo/form-schema";
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
import { EndingInspector } from "./ending-inspector";
import { BLOCK_GROUPS, BLOCK_LIBRARY, blockMeta, TONE_CLASSES } from "../block-library";
import { defaultBlock } from "../default-block";
import { Field, SelectField, SwitchField, TextField } from "./fields";
import { RichDescription } from "./rich-description";
import { MediaField } from "./media-field";
import { TypeFields } from "./type-fields";
import { useRevealOpens } from "../inspector-reveal";
import { cn } from "@/lib/utils";

/**
 * Radix refuses an empty `SelectItem` value, and "unset" needs to be a real
 * choice rather than a blank row, so the absence has a name of its own.
 */
const AUTO_IDENTITY = "auto";

const IDENTITY_FIELD_OPTIONS = [
  { value: AUTO_IDENTITY, label: "Automatic" },
  { value: "never", label: "Never remember" },
  ...IDENTITY_FIELDS.map((f) => ({ value: f, label: IDENTITY_FIELD_LABELS[f] })),
] as const;

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
  const edit = useBuilderStore((s) => s.edit);
  const selectedEndingRef = useBuilderStore((s) => s.selectedEndingRef);
  const params = useParams<{ id: string }>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  /*
    An ending is a selection too.

    The store has held one selection with two halves — `selectedRef` for a
    block, `selectedEndingRef` for an ending — since the canvas and the
    Questions list started sharing it, but this panel only ever asked for the
    block half. So clicking an ending in the Questions list selected it, tinted
    its row, cleared `selectedRef`... and drew "Nothing selected" beside it,
    while the very same click on the canvas opened the ending's settings.
    Same document, same selection, so the same panel answers for both.
  */
  const ending = doc && selectedEndingRef
    ? doc.endings.find((e) => e.ref === selectedEndingRef)
    : undefined;
  if (ending && doc) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <EndingInspector
          ending={ending}
          doc={doc}
          onChange={(next) =>
            edit((d) => {
              d.endings = next.endings as typeof d.endings;
            })
          }
        />
      </div>
    );
  }

  if (!block) {
    return (
      <div className="p-4">
        <EmptyState
          compact
          icon={Sparkles}
          title="Select a block"
        />
      </div>
    );
  }

  const meta = blockMeta(block.type);
  const patch = (p: Partial<Block>, coalesceKey?: string) => updateBlock(block.ref, p, coalesceKey);

  /** Change the block's type, keeping what identifies the question. */
  const changeType = (next: string) => {
    if (next === block.type) return;
    // Rebuild from defaults for the new type, but carry across the things that
    // identify the question rather than its shape.
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
  };
  const key = (f: string) => `${f}:${block.ref}`;

  // What @ can recall: answers given before this question is asked.
  const position = doc?.blocks.findIndex((b) => b.ref === block.ref) ?? -1;
  const recallOptions = (doc?.blocks.slice(0, Math.max(0, position)) ?? [])
    .filter((b) => b.type !== "welcome" && b.type !== "statement")
    .map((b) => ({ id: b.ref, label: b.title || b.ref }));

  // Logic rules that fire on this block, surfaced so the Workflow tab isn't a
  // black box from here.
  const rulesHere =
    doc?.logic.filter((r) => r.action_kind === "goto" && r.from === block.ref).length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        {/*
          The header names the type and is also how you change it.
          
          It used to say the type three ways: an icon, the word beside it, and a
          full-width "Type" select immediately below repeating both. And under
          the word sat the ref — `q_payment` — which nobody types anywhere in
          this panel; it belongs to the flow, and it is on the row's tooltip for
          the rare moment someone wants it.
        */}
        <div className="flex min-w-0 items-center gap-2" title={block.ref}>
          <div className={cn("grid size-7 shrink-0 place-items-center rounded-lg", TONE_CLASSES[meta.tone])}>
            <meta.icon className="size-3.5" strokeWidth={1.75} />
          </div>
          {block.type === "welcome" ? (
            <p className="min-w-0 truncate text-sm font-semibold">{meta.label}</p>
          ) : (
            <Select value={block.type} onValueChange={changeType}>
              <SelectTrigger
                aria-label="Block type"
                className="text-foreground h-auto min-w-0 gap-1 border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus-visible:ring-0 data-[size=default]:h-auto"
              >
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
          )}
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

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pt-2 pb-6">
        <TextField
          label="Question"
          inspect="title"
          // Where ↵ lands when a question is selected in the list.
          shortcutTarget="question-title"
          value={block.title}
          onChange={(v) => patch({ title: v }, key("title"))}
          multiline
          maxLength={2000}
        />

        <Field label="Description" inspect="description">
          <RichDescription
            key={block.ref}
            value={block.description ?? ""}
            onChange={(v) => patch({ description: v || undefined }, key("description"))}
            recall={recallOptions}
          />
        </Field>

        {/* Media goes in the description now. A question saved with media
            before that keeps showing it here until it is removed. */}
        {block.media && (
          <div data-inspect-target="media">
            <MediaField media={block.media} onChange={(media) => patch({ media })} />
          </div>
        )}

        {block.type !== "welcome" && block.type !== "statement" && (
          <SwitchField label="Required" checked={block.required} onChange={(v) => patch({ required: v })} />
        )}

        {/* Where a click on the preview's answer area lands when it names no
            field more precisely. `empty:hidden` for the types with none. */}
        <div data-inspect-target="answer" className="space-y-6 empty:hidden">
          <TypeFields block={block} patch={patch} />
        </div>

        <Section title="Agent hints" icon={Bot} badge={block.agentHints ? "Set" : undefined}>
          <TextField
            label="How to ask"
            multiline
            value={block.agentHints?.askStyle ?? ""}
            onChange={(v) =>
              patch({ agentHints: { ...(block.agentHints ?? { examples: [] }), askStyle: v || undefined } }, key("askStyle"))
            }
          />
          <TextField
            label="Why we ask"
            multiline
            value={block.agentHints?.whyWeAsk ?? ""}
            onChange={(v) =>
              patch({ agentHints: { ...(block.agentHints ?? { examples: [] }), whyWeAsk: v || undefined } }, key("whyWeAsk"))
            }
          />
          <TextField
            label="If they push back"
            multiline
            value={block.agentHints?.retryHint ?? ""}
            onChange={(v) =>
              patch({ agentHints: { ...(block.agentHints ?? { examples: [] }), retryHint: v || undefined } }, key("retryHint"))
            }
          />
        </Section>

        <Section
          title="Advanced"
          icon={GitBranch}
          // Its Button text is what a click on the preview's Send button asks for.
          reveals={block.type !== "welcome" && block.type !== "statement" ? BUTTON_REVEAL : undefined}
        >
          {/*
            What this question collects, so a respondent is offered what they
            typed last time instead of typing it again.

            Off by default, and deliberately the author's call rather than
            something read out of the wording: "What's your name?" and "What's
            the name of your favourite film?" are the same question to a regex,
            and only one of them holds anything worth keeping. Nothing is
            remembered for a question left on "Don't remember".
          */}
          {canMapIdentityField(block.type) && (
            <SelectField
              label="Remember as"
              value={block.identityField ?? AUTO_IDENTITY}
              onChange={(v) =>
                patch(
                  {
                    identityField:
                      v === AUTO_IDENTITY ? undefined : (v as IdentityFieldSetting),
                  },
                  key("identityField"),
                )
              }
              options={IDENTITY_FIELD_OPTIONS}
            />
          )}
          <TextField
            label="URL parameter"
            placeholder="?name="
            value={block.prefillParam ?? ""}
            onChange={(v) => patch({ prefillParam: v || undefined }, key("prefill"))}
          />
          {/* Welcome and statement blocks already show this field above. */}
          {block.type !== "welcome" && block.type !== "statement" && (
            <TextField
              label="Button text"
              inspect="button"
              value={block.buttonLabel ?? ""}
              onChange={(v) => patch({ buttonLabel: v || undefined }, key("btn"))}
              maxLength={60}
            />
          )}
          <Button variant="outline" size="sm" asChild className="w-full justify-start">
            <Link href={`/forms/${params.id}/workflow?focus=${block.ref}`}>
              <GitBranch className="size-3.5" />
              {rulesHere > 0 ? `${rulesHere} rule${rulesHere > 1 ? "s" : ""} from here` : "Add branching"}
            </Link>
          </Button>
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

const BUTTON_REVEAL = ["button"] as const;
const NO_REVEALS: readonly string[] = [];

/** Collapsible inspector section — collapsed by default to keep the panel short. */
function Section({
  title,
  icon: Icon,
  badge,
  reveals = NO_REVEALS,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: string;
  /** Preview targets whose field lives in here, so a click on one opens it. */
  reveals?: readonly string[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openSection = useCallback(() => setOpen(true), []);
  useRevealOpens(reveals, openSection);
  return (
    <div className="border-border/60 border-t pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hover:bg-muted/50 -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors"
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
        <div className="space-y-5 pt-3 pb-1">{children}</div>
      )}
    </div>
  );
}
