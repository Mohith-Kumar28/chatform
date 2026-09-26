"use client";

import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { FormDoc } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { canRemoveEnding, useBuilderStore } from "@/stores/builder-store";
import { publishProblems } from "../attention";
import { cn } from "@/lib/utils";

/**
 * What is wrong with this question's or ending's place in the flow, said at the
 * top of its settings, with the one-click fix when there is an obvious one.
 *
 * The canvas drew these on the node and nowhere else, so an author sent here
 * from the Questions view by "Show me" got the ending's settings and no word
 * about why: the problem was only legible in a view they were not looking at.
 * Setup problems ("no price for Team") have their own callout; this is the
 * wiring.
 */
export function ProblemCallout({ nodeRef, doc }: { nodeRef: string; doc: FormDoc }) {
  const problem = useMemo(() => {
    const p = publishProblems(doc).get(nodeRef);
    return p && !p.attention ? p : null;
  }, [doc, nodeRef]);
  const removeEnding = useBuilderStore((s) => s.removeEnding);
  const removeBlock = useBuilderStore((s) => s.removeBlock);
  const box = useRef<HTMLDivElement>(null);
  // Sent here again (the banner, a refused publish): shake again.
  const pulse = useBuilderStore((s) => (s.attentionPulse?.ref === nodeRef ? s.attentionPulse.n : 0));

  useEffect(() => {
    const node = box.current;
    if (!pulse || !node) return;
    node.classList.remove("animate-attention");
    void node.offsetWidth;
    node.classList.add("animate-attention");
    const stop = setTimeout(() => node.classList.remove("animate-attention"), 1300);
    return () => clearTimeout(stop);
  }, [pulse]);

  if (!problem) return null;

  const isEnding = doc.endings.some((e) => e.ref === nodeRef);
  // Nothing leads here, so removing it changes nothing a respondent sees.
  const orphan = problem.codes.includes(isEnding ? "ending_unreachable" : "unreachable_blocks");
  const canRemove = orphan && (!isEnding || canRemoveEnding(doc, nodeRef));
  const error = problem.level === "error";

  return (
    <div
      ref={box}
      role="alert"
      className={cn(
        "flex gap-2 rounded-lg border px-3 py-2.5",
        error
          ? "border-destructive/50 bg-destructive/10 text-destructive"
          : "border-amber-400/60 bg-amber-400/10 text-amber-800 dark:text-amber-200",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium">
          {orphan ? "Nothing connects to this" : error ? "Broken connection" : "Needs attention"}
        </p>
        <ul className="space-y-0.5 text-xs opacity-90">
          {problem.messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        {canRemove && (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 h-7 gap-1.5 bg-transparent text-xs"
            onClick={() => (isEnding ? removeEnding(nodeRef) : removeBlock(nodeRef))}
          >
            <Trash2 className="size-3" />
            {isEnding ? "Remove ending" : "Remove question"}
          </Button>
        )}
      </div>
    </div>
  );
}
