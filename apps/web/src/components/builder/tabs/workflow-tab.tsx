"use client";

import { useSearchParams } from "next/navigation";
import { WorkflowClient } from "../workflow-client";
import { AiBar } from "../ai-bar";
import { BuildToolbar } from "../build-toolbar";
import { useBuilderStore } from "@/stores/builder-store";

/**
 * Workflow lives on its own route, so @xyflow/react and this 1,200-line editor
 * are no longer part of the builder's initial bundle.
 */
export function WorkflowTab() {
  const doc = useBuilderStore((s) => s.doc);
  const edit = useBuilderStore((s) => s.edit);
  const params = useSearchParams();
  // The inspector links here with ?focus=<ref>; previously nothing ever passed
  // focusRef even though the editor accepted one.
  const focusRef = params.get("focus") ?? undefined;

  if (!doc) return null;

  return (
    <div data-fill-viewport="" className="h-[calc(100svh-var(--app-header-h))]">
      {/* The toolbar is handed to the editor so it renders above the canvas,
          between the library and the details panel — the same place it sits on
          the Questions view. The AI bar goes in the same way, docked at the
          foot of the canvas: it edits the document, and the document is what
          this view is showing, so there was never a reason it stopped at the
          Questions route. */}
      <WorkflowClient
        doc={doc}
        focusRef={focusRef}
        toolbar={<BuildToolbar />}
        dock={<AiBar />}
        onChange={(next) =>
          edit((d) => {
            Object.assign(d, next);
          })
        }
      />
    </div>
  );
}
