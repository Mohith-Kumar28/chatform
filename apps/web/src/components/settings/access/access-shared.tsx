"use client";

import type { QueryClient } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import {
  getGetApiWorkspaceAccessQueryKey,
  getGetApiWorkspacesQueryKey,
} from "@/lib/api/dashboard/dashboard";
import { ENTITLEMENTS_KEY } from "@/hooks/use-entitlements";
import { ASSIGNABLE_ROLES, WORKSPACE_ROLES, type AssignableRole, type WorkspaceRole } from "@/lib/roles";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * The pieces every access surface shares: the invite dialog, a person's
 * Manage access dialog, and a workspace's own access dialog all say the same
 * two things, organization role and workspace roles, in the same words.
 */

export interface WorkspaceLite {
  id: string;
  name: string;
}

/** Workspace id → role. A workspace missing from the map is "No access". */
export type Grants = Record<string, WorkspaceRole>;

export interface GrantOut {
  workspaceId: string;
  role: WorkspaceRole;
  name: string;
}

export interface AccessMap {
  workspaceCount: number;
  members: Record<string, GrantOut[]>;
  invitations: Record<string, GrantOut[]>;
}

export function grantsToList(grants: Grants) {
  return Object.entries(grants).map(([workspaceId, role]) => ({ workspaceId, role }));
}

/**
 * Everything that shows access, refetched together after any change to it.
 *
 * Better Auth UI keys its member and invitation lists under
 * `["auth", "user", <userId>, "organization", …]`, so the organization slice is
 * matched by position rather than by a key this app does not own.
 */
export async function refreshAccess(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: getGetApiWorkspaceAccessQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetApiWorkspacesQueryKey() }),
    // Each workspace's own member list: `/api/workspaces/:id/members`.
    qc.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/workspaces/"),
    }),
    qc.invalidateQueries({ queryKey: ENTITLEMENTS_KEY }),
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === "auth" && q.queryKey[3] === "organization",
    }),
  ]);
}

/** "All workspaces" for an admin; otherwise the names, shortened past two. */
export function accessSummary(isAdmin: boolean, grants: GrantOut[] | undefined): string {
  if (isAdmin) return "All workspaces";
  const list = grants ?? [];
  if (list.length === 0) return "No workspaces";
  const names = list.map((g) => g.name);
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/** Member or Admin, each with the one line that says what it means. */
export function OrgRoleChoice({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: AssignableRole;
  onChange: (role: AssignableRole) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as AssignableRole)}
      disabled={disabled}
      className="gap-2"
    >
      {ASSIGNABLE_ROLES.map((role) => (
        <Label
          key={role.value}
          htmlFor={`${idPrefix}-${role.value}`}
          className="has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal"
        >
          <RadioGroupItem id={`${idPrefix}-${role.value}`} value={role.value} className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{role.label}</span>
            <span className="text-muted-foreground text-xs">{role.blurb}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}

const NO_ACCESS = "none";

/** One row per workspace, each with No access / Editor / Viewer. */
export function WorkspaceGrantsPicker({
  workspaces,
  value,
  onChange,
  disabled,
}: {
  workspaces: WorkspaceLite[];
  value: Grants;
  onChange: (next: Grants) => void;
  disabled?: boolean;
}) {
  return (
    <div className="divide-border max-h-64 divide-y overflow-y-auto rounded-lg border">
      {workspaces.map((ws) => (
        <div key={ws.id} className="flex items-center gap-3 px-3 py-2">
          <FolderOpen className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate text-sm">{ws.name}</span>
          <Select
            value={value[ws.id] ?? NO_ACCESS}
            disabled={disabled}
            onValueChange={(role) => {
              const next = { ...value };
              if (role === NO_ACCESS) delete next[ws.id];
              else next[ws.id] = role as WorkspaceRole;
              onChange(next);
            }}
          >
            <SelectTrigger size="sm" className="w-32" aria-label={`Access to ${ws.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {WORKSPACE_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
              <SelectItem value={NO_ACCESS}>No access</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

/** Two short lines under the picker, so nobody has to guess what the roles mean. */
export function WorkspaceRoleHelp() {
  return (
    <p className="text-muted-foreground text-xs">
      {WORKSPACE_ROLES.map((r, i) => (
        <span key={r.value}>
          {i > 0 && " "}
          <span className="text-foreground font-medium">{r.label}</span>: {r.blurb.toLowerCase().replace(/\.$/, "")}.
        </span>
      ))}
    </p>
  );
}
