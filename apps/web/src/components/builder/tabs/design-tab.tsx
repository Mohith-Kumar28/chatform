"use client";

import { ThemePanel } from "../theme-panel";
import { PreviewChat } from "../preview-chat";
import { useBuilderStore } from "@/stores/builder-store";

/** Design: theme controls beside a live preview that uses the real runtime. */
export function DesignTab() {
  const doc = useBuilderStore((s) => s.doc);
  const formId = useBuilderStore((s) => s.formId);
  const edit = useBuilderStore((s) => s.edit);

  if (!doc) return null;

  return (
    <div className="mx-auto grid h-[calc(100svh-3.5rem)] w-full max-w-6xl grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        <ThemePanel
          theme={doc.theme}
          onChange={(theme) =>
            edit((d) => {
              d.theme = theme;
            })
          }
        />
      </div>
      {/* The real chat, not a mock. The old Design tab showed a hardcoded fake
          conversation ("What's your email?" / "grace@hopper.dev") that was
          hidden entirely below the lg breakpoint. */}
      <aside className="hidden h-[32rem] lg:sticky lg:top-6 lg:block">
        <PreviewChat formId={formId} doc={doc} />
      </aside>
    </div>
  );
}
