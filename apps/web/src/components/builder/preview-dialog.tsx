"use client";

import { ExternalLink, Maximize2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useState } from "react";
import type { FormDoc } from "@repo/form-schema";
import { PreviewChat } from "./preview-chat";
import { cn } from "@/lib/utils";

type Device = "desktop" | "mobile";

/**
 * The full conversation preview, behind the header's play button.
 *
 * The centre of the Build tab shows the one question you are editing; this is
 * where you go to actually walk the whole thing, which is a different job and
 * deserves the whole screen.
 */
export function PreviewDialog({
  open,
  onOpenChange,
  formId,
  doc,
  slug,
  published,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  doc: FormDoc;
  slug: string | null;
  published: boolean;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [nonce, setNonce] = useState(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[86vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogTitle className="sr-only">Preview</DialogTitle>

        {/*
          `pr-12` reserves the corner. The dialog's own close button is
          absolutely positioned at `top-4 right-4`, outside this row's flow, so
          without the reservation the right-aligned controls slide under it and
          the last one collides with the ✕ — which is exactly what "Restart✕"
          looked like on screen.
        */}
        <div className="flex items-center gap-2 py-3 pr-12 pl-4">
          <SegmentedControl
            size="sm"
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "mobile", label: "Mobile" },
            ]}
            value={device}
            onChange={setDevice}
            ariaLabel="Preview size"
          />
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" shape="pill" onClick={() => setNonce((n) => n + 1)}>
              <RefreshCw className="size-3.5" />
              Restart
            </Button>
            {/*
              Always available, and pointed at the draft rather than the live
              form. "Open live" only ever appeared once a form was published,
              which is the opposite of when you need a full window: you are
              testing a draft, in a modal, next to the editor you are testing.
            */}
            <Button variant="ghost" size="sm" shape="pill" asChild>
              <a href={`/preview/${formId}`} target="_blank" rel="noreferrer">
                <Maximize2 className="size-3.5" />
                New tab
              </a>
            </Button>
            {slug && published && (
              <Button variant="ghost" size="sm" shape="pill" asChild>
                <a href={`/f/${slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  Open live
                </a>
              </Button>
            )}
          </div>
        </div>

        <div className="bg-muted/40 flex min-h-0 flex-1 justify-center overflow-hidden p-4">
          <div
            className={cn(
              "flex min-h-0 w-full flex-col transition-[max-width] duration-[var(--duration-standard)]",
              device === "mobile" ? "max-w-[24rem]" : "max-w-2xl",
            )}
          >
            <PreviewChat key={nonce} formId={formId} doc={doc} chromeless />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
