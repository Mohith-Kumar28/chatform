"use client";

import { useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelative } from "@/lib/format";

/**
 * The last thing between a stale live form and the person who could have fixed
 * it in one click.
 *
 * Deliberately not phrased as a warning about losing work — nothing is lost, and
 * saying otherwise here would be a lie the user could immediately disprove. The
 * fact worth interrupting for is the other one: the version their respondents
 * are filling in right now is not the one on their screen.
 *
 * Three ways out, in the order a person weighs them: publish, leave anyway, or
 * go back to editing. Escape and the backdrop both mean "keep editing", which is
 * the only choice with no consequences.
 */
export function UnpublishedChangesDialog({
  open,
  activeVersion,
  publishedAt,
  onPublish,
  onLeave,
  onStay,
}: {
  open: boolean;
  /** The version respondents are on — the thing that is about to stay stale. */
  activeVersion: number | null;
  publishedAt: number | null;
  onPublish: () => Promise<void>;
  onLeave: () => void;
  onStay: () => void;
}) {
  const [publishing, setPublishing] = useState(false);

  async function publish() {
    setPublishing(true);
    try {
      await onPublish();
    } catch {
      // The publish reports its own failure; staying open is the right outcome,
      // because leaving now would be leaving on a promise that did not happen.
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !publishing && onStay()}>
      <DialogContent size="md" showCloseButton={!publishing}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]">
            <CloudUpload className="size-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold tracking-tight">
              These changes aren&rsquo;t live yet
            </h2>
            <p className="text-muted-foreground mt-1 text-sm text-pretty">
              Your edits are saved to the draft, so nothing is lost. But anyone opening your form
              still sees{" "}
              <span className="text-foreground font-medium">v{activeVersion ?? 1}</span>
              {publishedAt ? (
                <>
                  , published{" "}
                  <span title={formatDateTime(publishedAt)}>{formatRelative(publishedAt)}</span>
                </>
              ) : null}
              .
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onStay} disabled={publishing}>
            Keep editing
          </Button>
          <Button variant="outline" onClick={onLeave} disabled={publishing}>
            Leave without publishing
          </Button>
          <Button onClick={publish} disabled={publishing}>
            {publishing && <Loader2 className="size-3.5 animate-spin" />}
            {publishing ? "Publishing" : "Make it live"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
