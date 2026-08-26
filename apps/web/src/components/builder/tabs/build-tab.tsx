"use client";

import { BlockList } from "../block-list";
import { BlockInspector } from "../inspector/block-inspector";
import { AiBar } from "../ai-bar";
import { PreviewChat } from "../preview-chat";
import { useBuilderStore } from "@/stores/builder-store";

/**
 * Build: what the agent collects.
 *
 * Three panes — blocks, live preview, inspector. The preview is the real chat
 * runtime against the working draft, so what you see here is what a respondent
 * gets.
 */
export function BuildTab() {
  const doc = useBuilderStore((s) => s.doc);
  const formId = useBuilderStore((s) => s.formId);
  if (!doc) return null;

  return (
    <div className="flex h-[calc(100svh-3.5rem)] min-h-0">
      <aside className="border-border bg-sidebar hidden w-64 shrink-0 border-r md:block">
        <BlockList />
      </aside>

      <main className="flex min-w-0 flex-1 justify-center overflow-y-auto p-4 lg:p-6">
        <div className="flex h-full min-h-0 w-full max-w-xl flex-col gap-3">
          <AiBar />
          <div className="min-h-0 flex-1">
            <PreviewChat formId={formId} doc={doc} />
          </div>
        </div>
      </main>

      <aside className="border-border bg-card hidden w-80 shrink-0 border-l xl:block">
        <BlockInspector />
      </aside>
    </div>
  );
}
