"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBuilderStore } from "@/stores/builder-store";

/**
 * Two people saved the same form, and one of them has to be told.
 *
 * Before this the save was an unconditional write: whoever called last won, the
 * other author's work vanished from `working_schema`, and nothing anywhere said
 * so. The only trace was a diff in the activity timeline, which records that
 * something was overwritten but cannot give it back.
 *
 * Deliberately not a merge. A form builder has one author at a time in every
 * case that matters, and a three-way merge of a document with logic branches in
 * it would be a guess presented as a fact. The honest failure is the one the
 * author can see and decide about.
 */
export function ConflictDialog() {
  const conflict = useBuilderStore((s) => s.conflict);
  const acceptTheirs = useBuilderStore((s) => s.acceptTheirs);
  const keepMine = useBuilderStore((s) => s.keepMine);

  const theirTitle = conflict?.theirs.title;

  return (
    <Dialog open={conflict !== null} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        // No dismiss. Closing this without choosing leaves an editor whose every
        // save will fail, which is the state it exists to get out of.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Someone else edited this form</DialogTitle>
          <DialogDescription>
            Your changes were not saved, because the version on the server has moved on since you opened it
            {theirTitle ? ` — it is now called “${theirTitle}”` : ""}. Nothing has been lost yet.
          </DialogDescription>
        </DialogHeader>
        <div className="text-muted-foreground space-y-2 text-sm">
          <p>
            <strong className="text-foreground">Use their version</strong> discards what you have done here and
            loads theirs. Your edits since opening the form are gone.
          </p>
          <p>
            <strong className="text-foreground">Keep mine</strong> saves your version over theirs. Their edits
            are gone instead, though the form&rsquo;s history still records what they changed.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={keepMine}>
            Keep mine
          </Button>
          <Button onClick={acceptTheirs}>Use their version</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
