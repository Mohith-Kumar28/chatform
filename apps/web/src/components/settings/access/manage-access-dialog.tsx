"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  getGetApiWorkspaceAccessQueryKey,
  getGetApiWorkspacesQueryKey,
  useGetApiWorkspaceAccess,
  useGetApiWorkspaces,
  usePutApiMembersByMemberIdAccess,
} from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { isOrgAdminRole, type AssignableRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  grantsToList,
  OrgRoleChoice,
  refreshAccess,
  WorkspaceGrantsPicker,
  grantsSentence,
  type AccessMap,
  type Grants,
  type WorkspaceLite,
} from "./access-shared";

/**
 * One person's access, edited in one place: their organization role and, for
 * a member, a role in each workspace. Replaces the role-only editor, because a
 * role without its workspaces is half of what someone can open.
 */
export function ManageAccessDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: { id: string; role: string; name: string };
}) {
  const queryClient = useQueryClient();
  const { data: wsData } = useGetApiWorkspaces({ query: { queryKey: getGetApiWorkspacesQueryKey(), enabled: open } });
  const { data: accessData } = useGetApiWorkspaceAccess({ query: { queryKey: getGetApiWorkspaceAccessQueryKey(), enabled: open } });
  const workspaces = apiData<WorkspaceLite[]>(wsData) ?? [];
  const access = apiData<AccessMap>(accessData);

  const loaded = Boolean(open && access && wsData);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {loaded ? (
          // Mounted fresh each time the data is there, so the form starts from
          // what the server says rather than from the last time it was open.
          <AccessForm
            member={member}
            workspaces={workspaces}
            initial={Object.fromEntries((access!.members[member.id] ?? []).map((g) => [g.workspaceId, g.role]))}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
            refresh={() => refreshAccess(queryClient)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Manage access</DialogTitle>
              <DialogDescription>What {member.name} can open in this organization.</DialogDescription>
            </DialogHeader>
            <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccessForm({
  member,
  workspaces,
  initial,
  onDone,
  onCancel,
  refresh,
}: {
  member: { id: string; role: string; name: string };
  workspaces: WorkspaceLite[];
  initial: Grants;
  onDone: () => void;
  onCancel: () => void;
  refresh: () => Promise<void>;
}) {
  const [role, setRole] = useState<AssignableRole>(isOrgAdminRole(member.role) ? "admin" : "member");
  const [grants, setGrants] = useState<Grants>(initial);

  const save = usePutApiMembersByMemberIdAccess();
  const needsWorkspace = role === "member" && Object.keys(grants).length === 0;
  const summary = grantsSentence(member.name, role, grants, workspaces);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsWorkspace) return;
    try {
      await save.mutateAsync({
        memberId: member.id,
        data: { role, workspaces: role === "member" ? grantsToList(grants) : [] },
      });
      await refresh();
      toast.success(`Access updated for ${member.name}`);
      onDone();
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message;
      toast.error("Couldn't update access", { description: message });
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Manage access</DialogTitle>
        <DialogDescription>What {member.name} can open in this organization.</DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel>Role</FieldLabel>
        <OrgRoleChoice value={role} onChange={setRole} disabled={save.isPending} idPrefix="access-role" />
      </Field>

      {role === "member" && (
        <Field>
          <FieldLabel>Workspaces</FieldLabel>
          <WorkspaceGrantsPicker workspaces={workspaces} value={grants} onChange={setGrants} disabled={save.isPending} />
          {/* A prompt, not an error: nothing has gone wrong until they try to save. */}
          {needsWorkspace && (
            <FieldDescription>Tick the workspaces they should open.</FieldDescription>
          )}
        </Field>
      )}

      {summary && <p className="bg-muted/50 text-muted-foreground rounded-lg px-3 py-2 text-sm">{summary}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={needsWorkspace ? "secondary" : "default"}
          disabled={needsWorkspace || save.isPending}
        >
          {save.isPending && <Loader2 className="size-3.5 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
