"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Block as BlockSchema, type Block } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { useBuilderStore } from "@/stores/builder-store";
import { customFetch } from "@/lib/api/mutator";
import { blockMeta, TONE_CLASSES } from "./block-library";
import { cn } from "@/lib/utils";

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  blocks?: Block[];
  applied?: boolean;
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
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function run() {
    const text = prompt.trim();
    if (!text || !doc || busy) return;

    setPrompt("");
    setBusy(true);
    setTurns((t) => [...t, { id: crypto.randomUUID(), role: "user", text }]);

    try {
      const res = await customFetch<{ doc: unknown }>("/api/ai/add-blocks", {
        method: "POST",
        body: JSON.stringify({ formId, prompt: text, count: 3 }),
      });

      // The endpoint returns the whole updated doc; diff it to recover just the
      // additions so they can be reviewed rather than silently applied.
      const existing = new Set(doc.blocks.map((b) => b.ref));
      const added = (res.doc as { blocks: unknown[] }).blocks
        .map((b) => BlockSchema.safeParse(b))
        .flatMap((r) => (r.success ? [r.data] : []))
        .filter((b) => !existing.has(b.ref));

      setTurns((t) => [
        ...t,
        added.length
          ? {
              id: crypto.randomUUID(),
              role: "assistant",
              text: `Here ${added.length === 1 ? "is one question" : `are ${added.length} questions`} you could add.`,
              blocks: added,
            }
          : {
              id: crypto.randomUUID(),
              role: "assistant",
              text: "I couldn't think of anything new to add. Try describing it differently.",
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

  function apply(turnId: string, blocks: Block[]) {
    edit((d) => {
      d.blocks.push(...(blocks as never[]));
    });
    select(blocks[0]!.ref);
    setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, applied: true } : x)));
    toast.success(`Added ${blocks.length} question${blocks.length > 1 ? "s" : ""}`, {
      description: "⌘Z to undo.",
    });
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
            placeholder="Ask AI to add questions…"
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-[color-mix(in_oklch,currentColor_45%,transparent)]"
          />
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
  onApply: (id: string, blocks: Block[]) => void;
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

  return (
    <div className="space-y-1.5">
      <p className="bg-muted max-w-[90%] rounded-2xl rounded-bl-md px-3 py-1.5 text-sm">{turn.text}</p>

      {turn.blocks && (
        <div className="space-y-1.5 pl-1">
          <ul className="space-y-1">
            {turn.blocks.map((b) => {
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
          {turn.applied ? (
            <p className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
              <Check className="size-3" />
              Added
            </p>
          ) : (
            <Button size="sm" shape="pill" onClick={() => onApply(turn.id, turn.blocks!)}>
              Add {turn.blocks.length === 1 ? "it" : "them"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
