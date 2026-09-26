"use client";

import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth } from "@better-auth-ui/react";
import { useListOrganizationMembers } from "@better-auth-ui/react/plugins/organization";
import { FolderLock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { isOrgAdminRole } from "@/lib/roles";

/**
 * A member who has not been added to any workspace yet.
 *
 * Not an error and not a blank grid: it says what is going on and who can fix
 * it, by name, because "ask an admin" is useless to someone who does not know
 * who the admins are.
 */
export function NoWorkspaceState() {
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
