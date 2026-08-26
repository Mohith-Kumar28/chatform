"use client";

import { MousePointerSquareDashed } from "lucide-react";
import { BlockList } from "../block-list";
import { BlockInspector } from "../inspector/block-inspector";
import { AiBar } from "../ai-bar";
import { QuestionPreview } from "../question-preview";
import { EmptyState } from "@/components/ui/empty-state";
import { BuildToolbar } from "../build-toolbar";
import { useBuilderStore, useSelectedBlock } from "@/stores/builder-store";
import { cn } from "@/lib/utils";

/**
 * Build: the questions, and the one you are editing.
 *
 * Left is the ordered list, centre is the selected question exactly as a
 * respondent will see it, right is its settings. The whole conversation is
 * behind Preview in the header — you should not have to answer three questions
 * to look at the fourth.
 *
 * Regions are separated by tone, not by rules.
 */
export function BuildTab() {
  const doc = useBuilderStore((s) => s.doc);
  const block = useSelectedBlock();
  if (!doc) return null;

  return (
    <div className="flex h-[calc(100svh-3.5rem)] min-h-0">
      <aside className="bg-sidebar hidden w-72 shrink-0 md:block">
        <BlockList />
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <BuildToolbar />

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pt-3 pb-28">
          <div className="flex max-h-full w-full max-w-lg flex-col">
            {block ? (
              <QuestionPreview doc={doc} block={block} />
            ) : (
              <EmptyState
                icon={MousePointerSquareDashed}
                title="Pick a question"
                description="Choose one on the left to see and edit it."
              />
            )}
          </div>
        </div>

        {/* Docked, and out of the way until you use it. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4">
          <AiBar />
        </div>
      </main>

      <aside className="bg-panel hidden w-80 shrink-0 xl:block">
        <BlockInspector />
      </aside>
    </div>
  );
}
