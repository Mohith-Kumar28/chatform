"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { getGetApiMeInvitationsQueryKey, useGetApiMeInvitations } from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import type { GetApiMeInvitations200InvitationsItem } from "@/lib/api/generated.schemas";
import { acceptAndEnter } from "@/lib/accept-invitation";
import { roleWithArticle, workspaceRoleTitle } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type PendingInvitation = GetApiMeInvitations200InvitationsItem;

/** Invitations answered "Not now" in this browser, so the prompt does not reopen for them. */
const SEEN_KEY = "chatform:invites-seen";

function readSeen(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeSeen(ids: string[]) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    /* private window: the prompt reopens next visit, which is the safe side */
  }
}

/** Invitations waiting for the signed-in person. Expired ones never come back. */
export function usePendingInvitations() {
  const query = useGetApiMeInvitations({ query: { queryKey: getGetApiMeInvitationsQueryKey(), staleTime: 60_000 } });
  return { ...query, invitations: apiData<{ invitations: PendingInvitation[] }>(query.data)?.invitations ?? [] };
}

/**
 * Where an invitation meets someone who is already signed in.
 *
 * The email link was the only way in, so an invitee who signed up from the
 * homepage, or closed the tab after verifying, landed in their own workspace
 * with nothing saying a team was waiting. This opens the prompt once per
 * invitation, and leaves a pill in the header until it is answered, so
 * "Not now" never loses it.
 */
export function PendingInvitations() {
  const { invitations } = usePendingInvitations();
  // `null` until the person opens or closes it: then the prompt opens by
  // itself only for an invitation this browser has not already put off.
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? (invitations.length > 0 && invitations.some((i) => !readSeen().includes(i.id)));

  const close = () => {
    writeSeen([...new Set([...readSeen(), ...invitations.map((i) => i.id)])]);
    setChoice(false);
  };

  if (invitations.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setChoice(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          "bg-primary/10 text-primary hover:bg-primary/15 transition-colors duration-[var(--duration-micro)]",
        )}
      >
        <Mail className="size-3.5" strokeWidth={1.75} />
        {invitations.length === 1 ? "1 invite" : `${invitations.length} invites`}
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setChoice(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {invitations.length === 1 ? "You've been invited" : `You have ${invitations.length} invitations`}
            </DialogTitle>
            <DialogDescription>Accepting takes you straight there.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-3">
            {invitations.map((invitation) => (
              <InvitationItem key={invitation.id} invitation={invitation} />
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={close}>
              Not now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InvitationItem({ invitation }: { invitation: PendingInvitation }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = invitation.inviterName?.trim() || invitation.inviterEmail?.trim() || "Someone";
  const spaces = invitation.workspaces;

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptAndEnter(invitation.id, spaces[0]?.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept this invitation.");
      setBusy(false);
    }
  };

  return (
    <li className="border-border flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm">
          <span className="font-medium">{who}</span> invited you to{" "}
          <span className="font-medium">{invitation.organizationName}</span>
        </p>
        <p className="text-muted-foreground text-xs">
          {spaces.length > 0
            ? spaces.map((w) => `${w.name} (${workspaceRoleTitle(w.role)})`).join(", ")
            : `As ${roleWithArticle(invitation.role)}, with every workspace`}
        </p>
      </div>
      <Button onClick={() => void accept()} disabled={busy} className="rounded-full">
        {busy ? "…" : "Accept invitation"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </li>
  );
}
