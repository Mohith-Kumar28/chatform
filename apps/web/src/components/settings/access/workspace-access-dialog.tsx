"use client";

import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth } from "@better-auth-ui/react";
import {
  useListOrganizationInvitations,
  useListOrganizationMembers,
} from "@better-auth-ui/react/plugins/organization";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { UserView } from "@/components/auth/user/user-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getGetApiWorkspaceAccessQueryKey,
  getGetApiWorkspacesByIdMembersQueryKey,
  useDeleteApiWorkspacesByIdMembersByMemberId,
  useGetApiWorkspaceAccess,
  useGetApiWorkspacesByIdMembers,
  usePostApiInvitations,
  usePutApiWorkspacesByIdMembersByMemberId,
} from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { isOrgAdminRole, workspaceRoleTitle, type WorkspaceRole } from "@/lib/roles";
import { refreshAccess, WorkspaceRoleSelect, type AccessMap } from "./access-shared";

interface WorkspaceMember {
  memberId: string;
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  viaOrgRole: boolean;
}

type OrgMember = { id: string; role: string; user: { name?: string | null; email?: string | null; image?: string | null } };
type OrgInvitation = { id: string; email: string; status: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reason(err: unknown): string | undefined {
  return (err as { error?: { message?: string } })?.error?.message ?? (err instanceof Error ? err.message : undefined);
}

/**
 * Share a workspace: the dialog everyone already knows from Notion, Figma and
 * Google Docs.
 *
 * One box takes either a teammate's name or any email address. A teammate is
 * added on the spot; an address nobody in the organization has gets an
 * invitation to this workspace. There is no second "invite someone new" path
 * to find, and the button only lights up once there is somebody to add.
 *
 * Below it, everyone who can open the workspace. Owners and admins are there
 * because of their organization role, so they carry a label and no controls,
 * and the note under the list says where that role is changed.
 */
export function WorkspaceAccessDialog({
  open,
  onOpenChange,
  workspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: { id: string; name: string };
}) {
  const queryClient = useQueryClient();
  const { authClient } = useAuth<OrganizationAuthClient>();

  const { data, isLoading } = useGetApiWorkspacesByIdMembers(workspace.id, {
    query: { queryKey: getGetApiWorkspacesByIdMembersQueryKey(workspace.id), enabled: open },
  });
  const people = useMemo(() => apiData<WorkspaceMember[]>(data) ?? [], [data]);
  const { data: accessData } = useGetApiWorkspaceAccess({
    query: { queryKey: getGetApiWorkspaceAccessQueryKey(), enabled: open },
  });
  const access = apiData<AccessMap>(accessData);
  const { data: orgMembersData } = useListOrganizationMembers(authClient, { enabled: open });
  const { data: invitationsData } = useListOrganizationInvitations(authClient, { enabled: open });

  const add = usePutApiWorkspacesByIdMembersByMemberId();
  const remove = useDeleteApiWorkspacesByIdMembersByMemberId();
  const invite = usePostApiInvitations();

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<OrgMember | null>(null);
  const [role, setRole] = useState<WorkspaceRole>("editor");
  const [focused, setFocused] = useState(false);

  const orgMembers = useMemo(
    () => (orgMembersData as { members?: OrgMember[] } | undefined)?.members ?? [],
    [orgMembersData],
  );

  // Teammates who could be added here: members of the organization who are
  // not in already, and not admins, who are in every workspace anyway.
  const candidates = useMemo(() => {
    const here = new Set(people.map((p) => p.memberId));
    return orgMembers.filter((m) => !here.has(m.id) && !isOrgAdminRole(m.role));
  }, [people, orgMembers]);

  const q = query.trim().toLowerCase();
  const matches = (
    q ? candidates.filter((m) => `${m.user.name ?? ""} ${m.user.email ?? ""}`.toLowerCase().includes(q)) : candidates
  ).slice(0, 5);

  // Invitations still waiting that will open this workspace once accepted.
  const pending = useMemo(() => {
    const raw = invitationsData as OrgInvitation[] | { invitations?: OrgInvitation[] } | undefined;
    const all = Array.isArray(raw) ? raw : (raw?.invitations ?? []);
    return all.flatMap((inv) => {
      if (inv.status !== "pending") return [];
      const grant = access?.invitations[inv.id]?.find((g) => g.workspaceId === workspace.id);
      return grant ? [{ id: inv.id, email: inv.email, role: grant.role }] : [];
    });
  }, [invitationsData, access, workspace.id]);

  // What the button will do with what has been typed.
  const exact = candidates.find((m) => (m.user.email ?? "").toLowerCase() === q);
  const target = picked ?? exact ?? null;
  const alreadyInOrg = orgMembers.some((m) => (m.user.email ?? "").toLowerCase() === q);
  const inviteEmail = !target && !alreadyInOrg && EMAIL.test(query.trim()) ? query.trim() : null;
  const busy = add.isPending || remove.isPending || invite.isPending;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    try {
      if (target) {
        await add.mutateAsync({ id: workspace.id, memberId: target.id, data: { role } });
        toast.success(`${target.user.name || target.user.email} can now open ${workspace.name}`);
      } else if (inviteEmail) {
        await invite.mutateAsync({
          data: { email: inviteEmail, role: "member", workspaces: [{ workspaceId: workspace.id, role }] },
        });
        toast.success(`Invitation sent to ${inviteEmail}`);
      } else return;
      setQuery("");
      setPicked(null);
      await refreshAccess(queryClient);
    } catch (err) {
      // A seat refusal has already opened the paywall.
      if ((err as { status?: number })?.status === 402) return;
      toast.error("Couldn't add them", { description: reason(err) });
    }
  }

  async function changeRole(memberId: string, next: WorkspaceRole) {
    try {
      await add.mutateAsync({ id: workspace.id, memberId, data: { role: next } });
      await refreshAccess(queryClient);
    } catch (err) {
      toast.error("Couldn't change their role", { description: reason(err) });
    }
  }

  async function drop(person: WorkspaceMember) {
    try {
      await remove.mutateAsync({ id: workspace.id, memberId: person.memberId });
      await refreshAccess(queryClient);
    } catch (err) {
      toast.error("Couldn't remove them", { description: reason(err) });
    }
  }

  const onlyAdmins = !isLoading && people.every((p) => p.viaOrgRole) && pending.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {workspace.name}</DialogTitle>
          <DialogDescription>Add teammates, or invite anyone by email.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              value={picked ? picked.user.name || picked.user.email || "" : query}
              onChange={(e) => {
                setPicked(null);
                setQuery(e.target.value);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Name or email"
              aria-label="Name or email"
              disabled={busy}
              autoFocus
            />
            {focused && !picked && matches.length > 0 && (
              <div className="bg-popover absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-lg border shadow-md">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    // Keeps focus in the input, so choosing does not blur-close the list first.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setPicked(m);
                      setFocused(false);
                    }}
                    className="hover:bg-muted flex w-full items-center px-3 py-2 text-left"
                  >
                    <UserView
                      user={{ name: m.user.name ?? undefined, email: m.user.email ?? undefined, image: m.user.image ?? undefined }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <WorkspaceRoleSelect value={role} onChange={setRole} disabled={busy} label="Role" className="h-9 w-28" />
          {/* Grey until there is somebody to add: a dimmed orange button still
              reads as the thing to press. */}
          <Button type="submit" variant={target || inviteEmail ? "default" : "secondary"} disabled={busy || (!target && !inviteEmail)}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {inviteEmail ? "Invite" : "Add"}
          </Button>
        </form>

        <div className="grid gap-2">
          <p className="text-muted-foreground text-xs font-medium">People with access</p>
          <div className="divide-border max-h-80 divide-y overflow-y-auto rounded-lg border">
            {isLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading
              </div>
            ) : (
              <>
                {people.map((p) => (
                  <div key={p.memberId} className="flex min-h-14 items-center gap-3 px-3 py-2">
                    <UserView
                      user={{ name: p.name ?? undefined, email: p.email, image: p.image ?? undefined }}
                      className="min-w-0 flex-1"
                    />
                    {p.viaOrgRole ? (
                      <span className="text-muted-foreground w-28 shrink-0 pr-3 text-right text-sm">
                        {workspaceRoleTitle(p.role)}
                      </span>
                    ) : (
                      <WorkspaceRoleSelect
                        value={p.role as WorkspaceRole}
                        onChange={(r) => changeRole(p.memberId, r)}
                        disabled={busy}
                        label={`Role for ${p.name || p.email}`}
                      />
                    )}
                    <div className="w-8 shrink-0">
                      {!p.viaOrgRole && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${p.name || p.email} from ${workspace.name}`}
                          onClick={() => drop(p)}
                          disabled={busy}
                        >
                          <X className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {pending.map((inv) => (
                  <div key={inv.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{inv.email}</p>
                      <p className="text-muted-foreground text-xs">Invited, hasn&apos;t joined yet</p>
                    </div>
                    <span className="text-muted-foreground w-28 shrink-0 pr-3 text-right text-sm">
                      {workspaceRoleTitle(inv.role)}
                    </span>
                    <div className="w-8 shrink-0" />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {onlyAdmins && "Only owners and admins can open this workspace right now. "}
            Owners and admins can open every workspace. Change someone&apos;s role in{" "}
            <Link href="/settings/people" className="text-foreground underline underline-offset-2" onClick={() => onOpenChange(false)}>
              People
            </Link>
            .
          </span>
        </p>
      </DialogContent>
    </Dialog>
  );
}
