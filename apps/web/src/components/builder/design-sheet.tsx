"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ThemePanel } from "./theme-panel";
import { useBuilderStore } from "@/stores/builder-store";

/**
 * Theme controls in a sheet over the builder, so the form stays on screen and
 * every change lands live. Edits autosave like any other, so there is nothing
 * to confirm.
 *
 * The header is pinned and only the body scrolls — putting `overflow-y-auto`
 * on the whole panel made the title scroll away with the content.
 */
export function DesignSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const doc = useBuilderStore((s) => s.doc);
  const edit = useBuilderStore((s) => s.edit);
  if (!doc) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="shrink-0 px-5 pt-5 pb-3">
          <SheetTitle>Design</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          <ThemePanel
            theme={doc.theme}
            onChange={(theme) =>
              edit((d) => {
                d.theme = theme;
              })
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
