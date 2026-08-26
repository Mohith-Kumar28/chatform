"use client";

import { Palette } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ThemePanel } from "./theme-panel";
import { useBuilderStore } from "@/stores/builder-store";

/**
 * Theme controls in a sheet over the builder.
 *
 * Design used to be its own route, which meant leaving the questions to change
 * their colours and guessing at the result. As a sheet the form stays on
 * screen behind it and every change lands live — which is the whole point of
 * having a preview.
 *
 * Edits go straight into the store and autosave like any other change, so
 * there is nothing to confirm and nothing to lose.
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
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Palette className="size-4" strokeWidth={1.75} />
            Design
          </SheetTitle>
          <SheetDescription>Changes apply to the form behind this panel as you make them.</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
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
