"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { InviteMemberDialog } from "@/components/auth/organization/invite-member-dialog";
import { cn } from "@/lib/utils";

/**
 * "Invite team", beside the organization switcher.
 *
 * Inviting somebody was reachable only from `/settings/people` — a page you
 * open on purpose, which is the wrong shape for the one action a new
 * organization is most likely to want on its first day and least likely to go
 * looking for. It belongs next to the control that names the organization,
 * because the organization is exactly what you would be inviting them into.
 *
 * Deliberately *not* inside the switcher's bordered pill. That pill is one
 * control with two halves — pick the organization, or configure it — and both
 * halves act on the organization you are looking at. Inviting is a different
 * verb with a dialog behind it, so it reads as its own target: no border, ghost
 * treatment, the same quiet weight as the Search affordance opposite.
 *
 * The seat ceiling is not answered here. This stays live and always opens the
 * dialog; the padlock chip lives on that dialog's submit button, where there is
 * a typed-in address to make the offer worth something. See
 * `InviteMemberDialog`.
 */
export function InviteTeamButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ent = useEntitlements();

  /*
    `ready &&` rather than `allows` alone. `allows` is optimistic while the
    payload is in flight — right for a padlock, wrong for a header control that
    would otherwise render for an editor and then vanish a moment later.
  */
  if (!(ent.ready && ent.allows("invitation", "create"))) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex items-center gap-1.5",
          "rounded-full px-2.5 py-1 text-sm transition-colors duration-[var(--duration-micro)]",
          className,
        )}
      >
        <Plus className="size-3.5" strokeWidth={2} />
        Invite team
      </button>

      <InviteMemberDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
