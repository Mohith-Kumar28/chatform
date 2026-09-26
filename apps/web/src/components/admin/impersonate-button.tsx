"use client";

import { useState } from "react";
import { toast } from "sonner";
import { VenetianMask } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { openImpersonationTab } from "@/lib/impersonation";

/**
 * "Impersonate", and the reason it asks for, for one person.
 *
 * A person, not an account: the tab that opens is signed in as them, with every
 * organization they belong to in the switcher. `orgId` only picks which one it
 * opens on, so the account page lands on the account you were reading.
 */
export function ImpersonateButton({
  user,
  orgId,
  size = "sm",
}: {
  user: { id: string; name: string; email: string } | null;
  orgId?: string;
  size?: "sm" | "xs";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const who = user?.name || user?.email;

  /**
   * Opened straight from the click, with the network call deliberately *not*
   * awaited first: a `window.open` that happens after an await has lost the
   * browser's user gesture and is blocked as a popup. The tab that opens does
   * its own minting — see `openImpersonationTab`.
   */
  function impersonate() {
    if (!user) return;
    const win = openImpersonationTab({ userId: user.id, orgId, reason });
    if (!win) {
      toast.error("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
      return;
    }
    setOpen(false);
    setReason("");
    toast.success(`Opened ${who}'s account in a new tab`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant="secondary" disabled={!user}>
          <VenetianMask className="size-3.5" strokeWidth={2} aria-hidden />
          Impersonate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Impersonate {who}</DialogTitle>
          <DialogDescription>
            A new tab, signed in as them. You see their accounts, forms, responses and plan exactly as they do, and
            you can change things, so treat it as their account, not a preview.
          </DialogDescription>
        </DialogHeader>

        <ul className="text-muted-foreground space-y-1.5 text-xs">
          <li>· Everything you do is written to their activity log, under your name.</li>
          <li>· It ends after an hour, when you press Stop, or when you close the tab.</li>
          <li>· This console stays open in the tab you are in now.</li>
        </ul>

        <div className="space-y-2">
          <Label htmlFor="impersonate-reason">Why are you going in?</Label>
          <Input
            id="impersonate-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reproducing the publish failure in ticket 41…"
          />
          <p className="text-muted-foreground text-micro">The customer can read this in their own activity log.</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={impersonate} disabled={!reason.trim()}>
            Open their account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
