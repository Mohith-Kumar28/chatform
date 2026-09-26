"use client";

import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth } from "@better-auth-ui/react";
import { useListOrganizationMembers } from "@better-auth-ui/react/plugins/organization";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { InviteMemberDialog } from "@/components/auth/organization/invite-member-dialog";
import { UserView } from "@/components/auth/user/user-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getGetApiWorkspacesByIdMembersQueryKey,
  useDeleteApiWorkspacesByIdMembersByMemberId,
  useGetApiWorkspacesByIdMembers,
  usePutApiWorkspacesByIdMembersByMemberId,
} from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { isOrgAdminRole, WORKSPACE_ROLES, workspaceRoleTitle, type WorkspaceRole } from "@/lib/roles";
import { refreshAccess, WorkspaceRoleHelp } from "./access-shared";

interface WorkspaceMember {
  memberId: string;
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  viaOrgRole: boolean;
}

/**
 * Who can open one workspace: the other door into the same grants as a
 * person's Manage access dialog, for the admin who starts from "who is in
 * Marketing?" rather than "what can Priya see?".
 *
 * Owners and admins are listed, labelled, and have no controls: they open
 * every workspace because of their organization role, and removing them here
 * would be a control that does nothing.
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
  const { data: orgMembers } = useListOrganizationMembers(authClient, { enabled: open });

  const set = usePutApiWorkspacesByIdMembersByMemberId();
  const remove = useDeleteApiWorkspacesByIdMembersByMemberId();

  const [adding, setAdding] = useState<string>("");
  const [addRole, setAddRole] = useState<WorkspaceRole>("editor");
  const [inviteOpen, setInviteOpen] = useState(false);

  // Members of the organization who are not already here and are not admins,
  // who would be here already.
  const candidates = useMemo(() => {
    const here = new Set(people.map((p) => p.memberId));
    const list = (orgMembers as { members?: { id: string; role: string; user: { name?: string | null; email?: string | null } }[] } | undefined)?.members ?? [];
    return list.filter((m) => !here.has(m.id) && !isOrgAdminRole(m.role));
  }, [people, orgMembers]);

  async function setRole(memberId: string, role: WorkspaceRole) {
    try {
      await set.mutateAsync({ id: workspace.id, memberId, data: { role } });
      await refreshAccess(queryClient);
    } catch (err) {
      toast.error("Couldn't change access", { description: (err as { error?: { message?: string } })?.error?.message });
    }
  }

  async function add() {
    if (!adding) return;
    await setRole(adding, addRole);
    setAdding("");
  }

  async function drop(person: WorkspaceMember) {
    try {
      await remove.mutateAsync({ id: workspace.id, memberId: person.memberId });
      await refreshAccess(queryClient);
    } catch (err) {
      toast.error("Couldn't remove access", { description: (err as { error?: { message?: string } })?.error?.message });
    }
  }

  const busy = set.isPending || remove.isPending;

  return (
    <>
      <Dialog open={open && !inviteOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Who can open {workspace.name}</DialogTitle>
            <DialogDescription>Admins open every workspace. Everyone else needs to be added here.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={adding} onValueChange={setAdding} disabled={busy || candidates.length === 0}>
              <SelectTrigger className="w-full sm:flex-1" aria-label="Person to add">
                <SelectValue placeholder={candidates.length ? "Add someone from your organization" : "Everyone is already here"} />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.user.name || m.user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Select value={addRole} onValueChange={(v) => setAddRole(v as WorkspaceRole)} disabled={busy}>
                <SelectTrigger className="w-28" aria-label="Role for the person being added">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKSPACE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={add} disabled={!adding || busy}>
                {set.isPending && adding ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Add
              </Button>
            </div>
          </div>
          <WorkspaceRoleHelp />

          <div className="divide-border max-h-80 divide-y overflow-y-auto rounded-lg border">
            {isLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading
              </div>
            ) : (
              people.map((p) => (
                <div key={p.memberId} className="flex items-center gap-3 px-3 py-2">
                  <UserView user={{ name: p.name ?? undefined, email: p.email, image: p.image ?? undefined }} className="min-w-0 flex-1" />
                  {p.viaOrgRole ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {workspaceRoleTitle(p.role)} · all workspaces
                    </span>
                  ) : (
                    <>
                      <Select value={p.role} onValueChange={(v) => setRole(p.memberId, v as WorkspaceRole)} disabled={busy}>
                        <SelectTrigger size="sm" className="w-28" aria-label={`Role for ${p.name || p.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                          {WORKSPACE_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <Button type="button" variant="ghost" className="self-start" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-3.5" />
            Invite someone new to {workspace.name}
          </Button>
        </DialogContent>
      </Dialog>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={(o) => {
          setInviteOpen(o);
          if (!o) onOpenChange(true);
        }}
        defaultWorkspaceId={workspace.id}
      />
    </>
  );
}
