"use client";

import { Flag, MousePointerSquareDashed, ShieldAlert } from "lucide-react";
import { BlockList } from "../block-list";
import { BlockInspector } from "../inspector/block-inspector";
import { AiBar } from "../ai-bar";
import { QuestionPreview } from "../question-preview";
import { EmptyState } from "@/components/ui/empty-state";
import { BuildToolbar } from "../build-toolbar";
import { useBuilderStore, useSelectedBlock } from "@/stores/builder-store";
import { useGetApiFormsById } from "@/lib/api/dashboard/dashboard";

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
  const selectedEndingRef = useBuilderStore((s) => s.selectedEndingRef);
  // The slug seeds the preview's background pattern. It lives on the form row,
  // not the document — the same already-cached query the Settings tab reads, so
  // this costs a cache hit rather than a request.
  const formId = useBuilderStore((s) => s.formId);
  const { data: row } = useGetApiFormsById(formId as never);
  const slug = (row as { slug?: string } | undefined)?.slug ?? null;
  if (!doc) return null;

  // An ending has no question to render here, but "Pick a question" is a lie
  // when you have just picked something — its settings are in the inspector.
  const ending = selectedEndingRef ? doc.endings.find((e) => e.ref === selectedEndingRef) : undefined;

  return (
    <div className="flex h-[calc(100svh-var(--app-header-h))] min-h-0">
      <aside className="bg-sidebar hidden w-72 shrink-0 md:block">
        <BlockList />
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <BuildToolbar />

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pt-3 pb-28">
          <div className="flex max-h-full w-full max-w-lg flex-col">
            {block ? (
              <QuestionPreview doc={doc} block={block} slug={slug} />
            ) : ending ? (
              <EmptyState
                icon={ending.kind === "screen_out" ? ShieldAlert : Flag}
                title={ending.title || "Ending"}
                description={
                  ending.kind === "screen_out"
                    ? "Nothing is submitted here. Edit what it says on the right."
                    : "Where a finished response lands. Edit what it says on the right."
                }
              />
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

      <aside className="bg-panel hidden w-96 shrink-0 xl:block">
        <BlockInspector />
      </aside>
    </div>
  );
}
