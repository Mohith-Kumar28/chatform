"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth, useSession } from "@better-auth-ui/react";
import { useListOrganizationMembers } from "@better-auth-ui/react/plugins/organization";
import { FolderLock, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getGetApiWorkspacesQueryKey, usePostApiWorkspaces } from "@/lib/api/dashboard/dashboard";
import { useEntitlements } from "@/hooks/use-entitlements";
import { isOrgAdminRole } from "@/lib/roles";

/**
 * The dashboard with no workspace behind it.
 *
 * Two different people land here. An owner or admin fresh from sign-up, whose
 * organization has no workspace yet: they get the one step that makes one,
 * with a name already filled in. And a member nobody has added to a workspace:
 * they can't make their own, so they're told who can fix it.
 */
export function NoWorkspaceState() {
  const { allows, isLoading } = useEntitlements();
  if (isLoading) return <div className="shimmer h-64 rounded-2xl" />;
  return allows("workspace", "create") ? <CreateFirstWorkspace /> : <WaitingForAccess />;
}

/** "Priya's Workspace", or plain "My Workspace" when there is no name to use. */
function defaultName(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${first}'s Workspace`.slice(0, 60) : "My Workspace";
}

function CreateFirstWorkspace() {
  const { authClient } = useAuth<OrganizationAuthClient>();
  const { data: session } = useSession(authClient);
  const queryClient = useQueryClient();
  const create = usePostApiWorkspaces();
  // Untouched, the field follows the session as it loads; typed in, it's theirs.
  const [name, setName] = useState<string | null>(null);
  const value = name ?? defaultName(session?.user?.name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ data: { name: trimmed } });
      await queryClient.invalidateQueries({ queryKey: getGetApiWorkspacesQueryKey() });
    } catch {
      toast.error("Couldn't create your workspace", { description: "Try again in a moment." });
    }
  }

  return (
    <EmptyState
      icon={FolderPlus}
      title="Name your workspace"
      action={
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Workspace name"
            value={value}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            className="h-9"
          />
          <Button type="submit" shape="pill" disabled={!value.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Continue"}
          </Button>
        </form>
      }
    />
  );
}

/**
 * A member who has not been added to any workspace yet.
 *
 * Not an error and not a blank grid: it says what is going on and who can fix
 * it, by name, because "ask an admin" is useless to someone who does not know
 * who the admins are.
 */
function WaitingForAccess() {
  const { authClient } = useAuth<OrganizationAuthClient>();
  const { data } = useListOrganizationMembers(authClient);
  const members =
    (data as { members?: { role: string; user: { name?: string | null; email?: string | null } }[] } | undefined)
      ?.members ?? [];
  const admins = members
    .filter((m) => isOrgAdminRole(m.role))
    .map((m) => m.user.name || m.user.email)
    .filter(Boolean)
    .slice(0, 3) as string[];

  const who =
    admins.length === 0
      ? "an admin"
      : admins.length === 1
        ? admins[0]
        : `${admins.slice(0, -1).join(", ")} or ${admins.at(-1)}`;

  return (
    <EmptyState
      icon={FolderLock}
      title="You haven't been added to a workspace yet"
      description={`Ask ${who} to add you to the workspaces you need. They'll show up here as soon as they do.`}
    />
  );
}
