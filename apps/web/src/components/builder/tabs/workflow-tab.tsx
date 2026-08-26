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
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <BuildToolbar />
      <div className="min-h-0 flex-1">
      <WorkflowClient
        doc={doc}
        focusRef={focusRef}
        onChange={(next) =>
          edit((d) => {
            Object.assign(d, next);
          })
        }
        />
      </div>
    </div>
  );
}
