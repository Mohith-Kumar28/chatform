"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Collect the postal address without leaving the form.
 *
 * The address is a hard requirement — the server will not schedule a reminder
 * without one — so the alternative to asking here is sending the author to
 * organization settings mid-thought and hoping they come back. They are one
 * click into turning a feature on; that is the wrong moment to hand them a
 * different screen.
 */
export function FollowUpAddressDialog({
  open,
  onOpenChange,
  organizationId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  /** Called once the address is stored, so the caller can finish enabling. */
  onSaved: (address: string) => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const address = value.trim();
    if (!address) return;
    setSaving(true);
    try {
      const { error } = await authClient.organization.update({
        organizationId,
        data: { postalAddress: address } as { postalAddress: string },
      });
      if (error) throw new Error(error.message ?? "Could not save");
      onSaved(address);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add your business address</DialogTitle>
          <DialogDescription>
            It goes at the bottom of every reminder. Anti-spam law requires it, and
            respondents never see it anywhere else.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Textarea
            autoFocus
            className="min-h-24"
            value={value}
            placeholder={"Acme Ltd\n4th Floor, MG Road\nBengaluru 560001"}
            onChange={(e) => setValue(e.target.value)}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!value.trim() || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save and turn on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
