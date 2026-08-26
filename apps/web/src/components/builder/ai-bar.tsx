"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Block as BlockSchema, type Block } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBuilderStore } from "@/stores/builder-store";
import { customFetch } from "@/lib/api/mutator";
import { blockMeta, TONE_CLASSES } from "./block-library";
import { cn } from "@/lib/utils";

/**
 * "Build with AI" bar.
 *
 * The previous version POSTed with a hardcoded count of 3 and then called
 * `window.location.reload()` after a 600ms timeout — losing selection, scroll
 * and any unsaved edit, with no way to see or reject what the AI did.
 *
 * This proposes blocks and shows them for review. Accepting applies them
 * through the store, so the whole batch is a single undo step.
 */
export function AiBar() {
  const doc = useBuilderStore((s) => s.doc);
  const formId = useBuilderStore((s) => s.formId);
  const edit = useBuilderStore((s) => s.edit);
  const select = useBuilderStore((s) => s.select);

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Block[] | null>(null);

  async function run() {
    if (!prompt.trim() || !doc) return;
    setBusy(true);
    setProposal(null);
    try {
      const res = await customFetch<{ doc: unknown; added: number }>("/api/ai/add-blocks", {
        method: "POST",
        body: JSON.stringify({ formId, prompt: prompt.trim(), count: 3 }),
      });

      // The endpoint returns the whole updated doc; diff against what we have
      // to recover just the additions for review.
      const existing = new Set(doc.blocks.map((b) => b.ref));
      const returned = (res.doc as { blocks: unknown[] }).blocks
        .map((b) => BlockSchema.safeParse(b))
        .flatMap((r) => (r.success ? [r.data] : []))
        .filter((b) => !existing.has(b.ref));

      if (returned.length === 0) {
        toast.info("The AI didn't suggest anything new. Try being more specific.");
        return;
      }
      setProposal(returned);
    } catch (err) {
      toast.error("Couldn't generate blocks", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  function accept() {
    if (!proposal) return;
    edit((d) => {
      d.blocks.push(...(proposal as never[]));
    });
    select(proposal[0]!.ref);
    toast.success(`Added ${proposal.length} block${proposal.length > 1 ? "s" : ""}`, {
      description: "Undo with ⌘Z if that isn't what you wanted.",
    });
    setProposal(null);
    setPrompt("");
  }

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="border-border bg-card shadow-xs focus-within:ring-ring/30 flex items-center gap-2 rounded-full border px-3 py-1.5 transition-shadow focus-within:ring-2"
      >
        <Sparkles className="text-primary size-4 shrink-0" />
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask AI to add questions…"
          disabled={busy}
          className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="sm"
          shape="pill"
          disabled={busy || !prompt.trim()}
          className="shrink-0"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Ask"}
        </Button>
      </form>

      {proposal && (
        <div className="border-primary/30 bg-primary-soft/40 animate-message-in space-y-2 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption font-medium">
              {proposal.length} block{proposal.length > 1 ? "s" : ""} suggested
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setProposal(null)}>
                <X className="size-3.5" />
                Discard
              </Button>
              <Button size="sm" shape="pill" onClick={accept}>
                <Check className="size-3.5" />
                Add
              </Button>
            </div>
          </div>
          <ul className="space-y-1">
            {proposal.map((b) => {
              const meta = blockMeta(b.type);
              return (
                <li key={b.ref} className="bg-card flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <div className={cn("grid size-5 shrink-0 place-items-center rounded", TONE_CLASSES[meta.tone])}>
                    <meta.icon className="size-2.5" strokeWidth={1.75} />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-xs">{b.title}</span>
                  <span className="text-muted-foreground shrink-0 text-[0.625rem]">{meta.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
