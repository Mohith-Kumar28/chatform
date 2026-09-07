"use client";

import { useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { HistoryClient } from "./history-client";

/**
 * History as a panel, not a page.
 *
 * A full screen was the wrong shape for it. Nobody comes here to read history —
 * they come here holding a question about the form they are looking at ("is my
 * draft live?", "what did that publish change?", "give me Friday's copy back"),
 * and a route answered it by taking the form away. A sheet keeps the builder
 * behind it, so the timeline is read against the thing it describes and closing
 * it costs nothing.
 */
const SHOW_HISTORY_EVENT = "chatform:show-history";

/** Open the history panel from anywhere — the header, ⌘K, a shortcut. */
export function showHistory(): void {
  window.dispatchEvent(new CustomEvent(SHOW_HISTORY_EVENT));
}

export function HistorySheet({ formId }: { formId: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onShow = () => setOpen(true);
    window.addEventListener(SHOW_HISTORY_EVENT, onShow);
    return () => window.removeEventListener(SHOW_HISTORY_EVENT, onShow);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/*
        Wider than the default sheet: the timeline nests changes two levels deep,
        and at `sm` those lines wrap into mush. Still narrow enough that the canvas
        stays visible beside it.
      */}
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-3.5">
          <SheetTitle className="text-sm">History</SheetTitle>
          <SheetDescription className="text-xs">
            Every edit, grouped by the version it shipped in.
          </SheetDescription>
        </SheetHeader>
        {/* Mounted only while open, so the panel refetches each time it is
            opened rather than showing whatever it last saw. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {open && <HistoryClient formId={formId} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
