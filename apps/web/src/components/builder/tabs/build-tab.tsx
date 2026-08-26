"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { MousePointerSquareDashed } from "lucide-react";
import { BlockList } from "../block-list";
import { BlockInspector } from "../inspector/block-inspector";
import { AiBar } from "../ai-bar";
import { QuestionPreview } from "../question-preview";
import { EmptyState } from "@/components/ui/empty-state";
import { BUILD_VIEWS } from "../builder-tabs";
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
        <div className="flex justify-center px-4 pt-3">
          <BuildViewSwitcher />
        </div>

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

/**
 * Questions ⇄ Flow. Two views of one thing, so they share a tab rather than
 * competing for space in the header. Separate routes keep the flow editor's
 * bundle out of this page.
 */
export function BuildViewSwitcher() {
  const pathname = usePathname();
  const formId = useBuilderStore((s) => s.formId);

  return (
    <div className="bg-muted/60 inline-flex items-center rounded-full p-1">
      {BUILD_VIEWS.map((view) => {
        const href = `/forms/${formId}/${view.segment}`;
        const active = pathname.endsWith(`/${view.segment}`);
        return (
          <Link
            key={view.segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative isolate inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium",
              "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="build-view-pill"
                className="bg-card shadow-xs absolute inset-0 -z-10 rounded-full"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <view.icon className="size-3.5" strokeWidth={1.75} />
            {view.label}
          </Link>
        );
      })}
    </div>
  );
}
