"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, GitBranch, Loader2, Minus, Shuffle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { FormDoc as FormDocSchema, type Block, type FormDoc } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useBuilderStore } from "@/stores/builder-store";
import { customFetch } from "@/lib/api/mutator";
import { blockMeta, TONE_CLASSES } from "./block-library";
import { KEY } from "./use-builder-shortcuts";
import { cn } from "@/lib/utils";

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Just for the preview list; applying uses `doc`. */
  blocks?: Block[];
  /** Refs of questions the proposal takes out. */
  removed?: string[];
  /** How many branching rules the proposal adds. */
  rules?: number;
  /** How many questions had their routing replaced. */
  rewired?: number;
  /**
   * The whole proposed document.
   *
   * Applying used to push the new blocks onto the end of the local doc, which
   * threw away both the positions the server chose and every branching rule it
   * wrote — the two things that make a conditional question work.
   */
  doc?: FormDoc;
  applied?: boolean;
}

/**
 * The thread outlives the popover.
 *
 * It used to live in component state, so clicking away — which is how the bar
 * collapses — erased what you had asked and what it answered. Kept per form,
 * because the conversation is about this form's questions and means nothing
 * next to another one.
 */
const historyKey = (formId: string) => `chatform:aibar:${formId}`;
const MAX_TURNS = 40;

function loadHistory(formId: string): Turn[] {
  try {
    const raw = localStorage.getItem(historyKey(formId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Turn[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(formId: string, turns: Turn[]) {
  try {
    // Proposed docs are large and only useful while the offer is live, so the
    // stored copy keeps the conversation and drops the payloads.
    const slim = turns.slice(-MAX_TURNS).map(({ doc, ...rest }) => (doc ? { ...rest, applied: rest.applied ?? false, stale: true } : rest));
    localStorage.setItem(historyKey(formId), JSON.stringify(slim));
  } catch {
    // A full or blocked store is not worth failing a suggestion over.
  }
}

/** Plain words for an edit whose summary came back empty. */
function describeEdit(added: number, removed: number, rules: number): string {
  const parts: string[] = [];
  if (added) parts.push(`${added} new question${added > 1 ? "s" : ""}`);
  if (removed) parts.push(`${removed} removed`);
  if (rules) parts.push(`${rules} branching rule${rules > 1 ? "s" : ""}`);
  return parts.length ? `Here is the change: ${parts.join(", ")}.` : "Here is the change.";
}

/**
 * "Build with AI" — a slim docked bar that expands into a conversation when
 * focused and collapses when you click away.
 *
 * Collapsed it is one line and gets out of the way; expanded it keeps the
 * thread so you can see what you asked for and what it produced. Suggested
 * blocks are reviewed before they land, and applying them is a single undo
 * step.
 */
export function AiBar() {
  const doc = useBuilderStore((s) => s.doc);
  const formId = useBuilderStore((s) => s.formId);
  const edit = useBuilderStore((s) => s.edit);
  const select = useBuilderStore((s) => s.select);

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Collapse on click-away and on Escape — but never mid-request, which would
  // hide the spinner and make it look like nothing happened.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (busy) return;
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!formId) return;
    setTurns(loadHistory(formId));
    setHydrated(true);
  }, [formId]);

  useEffect(() => {
    if (!formId || !hydrated) return;
    saveHistory(formId, turns);
  }, [formId, turns, hydrated]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function run() {
    const text = prompt.trim();
    if (!text || !doc || busy) return;

    setPrompt("");
    setBusy(true);
    setTurns((t) => [...t, { id: crypto.randomUUID(), role: "user", text }]);

    /**
     * The thread goes with the request.
     *
     * It was on screen and nowhere else: every message was sent as if it were
     * the first, so "even if it's iOS, we still need their email" arrived with
     * no idea what "even" was qualifying, and came back with a question about
     * iOS devices instead of an email field. The proposals themselves are left
     * out — an applied one is already in the form the server reads, and an
     * unapplied one is not part of the form at all.
     */
    const history = turns.slice(-8).map((t) => ({ role: t.role, text: t.text }));

    try {
      const res = await customFetch<{
        doc: unknown;
        rules?: number;
        rewired?: number;
        removedRefs?: string[];
        summary?: string;
      }>("/api/ai/edit-form", {
        method: "POST",
        body: JSON.stringify({ formId, prompt: text, history }),
      });

      // The proposal is the whole document — the new questions, where they sit,
      // and any branching. It is diffed only to describe what changed; applying
      // takes the document as a whole.
      const proposed = FormDocSchema.safeParse(res.doc);
      if (!proposed.success) throw new Error("The proposal came back in a shape I couldn't read.");

      const existing = new Set(doc.blocks.map((b) => b.ref));
      const added = proposed.data.blocks.filter((b) => !existing.has(b.ref));
      const removed = res.removedRefs ?? [];
      const rules = res.rules ?? 0;

      /**
       * An edit that adds no questions is a real edit.
       *
       * This used to say "I couldn't think of anything new to add" whenever
       * `added` was empty — which was the common case for the most common kind
       * of request, since changing who gets asked what adds nothing. The server
       * now refuses genuinely empty edits with a 422, so anything that arrives
       * here changed something worth describing.
       */
      setTurns((t) => [
        ...t,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: res.summary?.trim() || describeEdit(added.length, removed.length, rules),
          blocks: added,
          removed,
          rules,
          rewired: res.rewired ?? 0,
          doc: proposed.data,
        },
      ]);
    } catch (err) {
      setTurns((t) => [
        ...t,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function apply(turn: Turn) {
    const next = turn.doc;
    const added = turn.blocks ?? [];
    // Not gated on `added.length` any more. An edit whose whole content is new
    // routing has no new questions, and refusing to apply it was the last place
    // this flow still assumed every change adds something.
    if (!next) return;

    // Take the whole proposal. Pushing the new blocks onto the end instead —
    // which is what this did — discarded both the positions chosen for them
    // and every branching rule, so a question meant only for iPhone users was
    // appended after everything and asked of everyone.
    edit((d) => {
      d.blocks = next.blocks as never;
      d.logic = next.logic as never;
      d.endings = next.endings as never;
    });
    if (added[0]) select(added[0].ref);
    setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, applied: true } : x)));

    const rules = turn.rules ?? 0;
    const removed = turn.removed?.length ?? 0;
    const parts: string[] = [];
    if (added.length) parts.push(`Added ${added.length} question${added.length > 1 ? "s" : ""}`);
    if (removed) parts.push(`removed ${removed}`);
    if (rules) parts.push(`${rules} branching rule${rules > 1 ? "s" : ""} set up`);
    toast.success(parts.length ? parts.join(", ") : "Flow updated", { description: "⌘Z to undo." });
  }

  return (
    <div ref={wrapRef} className="pointer-events-auto w-full max-w-xl">
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 420, damping: 36 }}
        className={cn(
          "bg-card overflow-hidden rounded-3xl",
          open ? "shadow-lg" : "shadow-md",
        )}
      >
        <AnimatePresence initial={false}>
          {open && turns.length > 0 && (
            <motion.div
              key="thread"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            >
              <div ref={threadRef} className="max-h-72 space-y-2.5 overflow-y-auto p-3">
                {turns.map((turn) => (
                  <Message key={turn.id} turn={turn} onApply={apply} />
                ))}
                {busy && (
                  <div className="text-muted-foreground flex items-center gap-2 px-1 text-sm">
                    <Loader2 className="size-3.5 animate-spin" />
                    Thinking…
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="flex items-end gap-2 px-3 py-2"
        >
          <Sparkles className="text-primary mb-2 size-4 shrink-0" />
          <textarea
            ref={inputRef}
            // How `/` finds this from the shell's keyboard layer.
            data-shortcut-target="ai-bar"
            value={prompt}
            rows={1}
            onFocus={() => setOpen(true)}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void run();
              }
            }}
            placeholder="Ask AI to make changes…"
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-[color-mix(in_oklch,currentColor_45%,transparent)]"
          />
          {/* The key that gets you here, shown only while the bar is closed —
              once you are typing in it, it is noise. */}
          {!open && !prompt && (
            <Kbd className="mb-2 hidden shrink-0 sm:inline-grid">{KEY.askAi}</Kbd>
          )}
          <Button
            type="submit"
            size="icon-sm"
            shape="pill"
            disabled={busy || !prompt.trim()}
            aria-label="Ask"
            className="mb-1 shrink-0"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

function Message({
  turn,
  onApply,
}: {
  turn: Turn;
  onApply: (turn: Turn) => void;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-3 py-1.5 text-sm">
          {turn.text}
        </p>
      </div>
    );
  }

  const added = turn.blocks ?? [];
  const removed = turn.removed ?? [];
  const rules = turn.rules ?? 0;
  const rewired = turn.rewired ?? 0;
  // An assistant turn is a proposal when it carries one, in any of its forms —
  // questions, removals, or nothing but new wiring.
  const isProposal =
    turn.blocks !== undefined || removed.length > 0 || rules > 0 || rewired > 0;

  return (
    <div className="space-y-1.5">
      <p className="bg-muted max-w-[90%] rounded-2xl rounded-bl-md px-3 py-1.5 text-sm">{turn.text}</p>

      {isProposal && (
        <div className="space-y-1.5 pl-1">
          {added.length > 0 && (
            <ul className="space-y-1">
              {added.map((b) => {
                const meta = blockMeta(b.type);
                return (
                  <li key={b.ref} className="bg-muted/50 flex items-center gap-2 rounded-xl px-2 py-1.5">
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-md", TONE_CLASSES[meta.tone])}>
                      <meta.icon className="size-2.5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">{b.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {removed.length > 0 && (
            <ul className="space-y-1">
              {removed.map((ref) => (
                <li
                  key={ref}
                  className="bg-destructive-soft/50 text-muted-foreground flex items-center gap-2 rounded-xl px-2 py-1.5"
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-md">
                    <Minus className="size-2.5" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs line-through">{ref}</span>
                </li>
              ))}
            </ul>
          )}
          {rewired > 0 && (
            <p className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
              <Shuffle className="size-3 shrink-0" />
              Re-routes {rewired === 1 ? "1 question" : `${rewired} questions`}, replacing what was there
            </p>
          )}
          {rules > 0 && (
            <p className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
              <GitBranch className="size-3 shrink-0" />
              {rules} branching rule{rules > 1 ? "s" : ""}, so each answer only sees what applies to it
            </p>
          )}
          {turn.applied ? (
            <p className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
              <Check className="size-3" />
              Applied
            </p>
          ) : turn.doc ? (
            <Button size="sm" shape="pill" onClick={() => onApply(turn)}>
              {/* Named for what the edit does. It said "Add them" regardless,
                  which was wrong for the many edits that add nothing. */}
              {added.length > 0 && removed.length === 0
                ? `Add ${added.length === 1 ? "it" : "them"}`
                : "Apply"}
            </Button>
          ) : (
            // The proposal is not kept in storage, so a thread restored from a
            // previous visit can show what was suggested but not apply it.
            <p className="text-muted-foreground px-1 text-xs">Ask again to apply this.</p>
          )}
        </div>
      )}
    </div>
  );
}
