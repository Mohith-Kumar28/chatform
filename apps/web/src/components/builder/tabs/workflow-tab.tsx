"use client";

import { useSearchParams } from "next/navigation";
import { WorkflowClient } from "../workflow-client";
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
    <div className="h-[calc(100svh-3.5rem)]">
      {/* The toolbar is handed to the editor so it renders above the canvas,
          between the library and the details panel — the same place it sits on
          the Questions view. */}
      <WorkflowClient
        doc={doc}
        focusRef={focusRef}
        toolbar={<BuildToolbar />}
        onChange={(next) =>
          edit((d) => {
            Object.assign(d, next);
          })
        }
      />
    </div>
  );
}
