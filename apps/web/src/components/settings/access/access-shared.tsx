"use client";

import type { QueryClient } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import {
  getGetApiWorkspaceAccessQueryKey,
  getGetApiWorkspacesQueryKey,
} from "@/lib/api/dashboard/dashboard";
import { ENTITLEMENTS_KEY } from "@/hooks/use-entitlements";
import { ASSIGNABLE_ROLES, WORKSPACE_ROLES, isOrgAdminRole, type AssignableRole, type WorkspaceRole } from "@/lib/roles";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

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

/**
 * Someone's access in two lines: the role, then exactly what it opens.
 * "Admin" over "All workspaces", or "Member" over "Marketing (Editor), Sales
 * (Viewer)". One column saying the whole thing, where a Role column and an
 * Access column made you combine them in your head.
 */
export function accessSummary(orgRole: string, grants: GrantOut[] | undefined): { title: string; detail: string } {
  if (isOrgAdminRole(orgRole)) {
    return { title: orgRole.split(",").map((r) => r.trim()).includes("owner") ? "Owner" : "Admin", detail: "All workspaces" };
  }
  const list = grants ?? [];
  if (list.length === 0) return { title: "Member", detail: "No workspaces yet" };
  const named = list.map((g) => `${g.name} (${g.role === "editor" ? "Editor" : "Viewer"})`);
  return {
    title: "Member",
    detail: named.length <= 3 ? named.join(", ") : `${named.slice(0, 3).join(", ")} +${named.length - 3} more`,
  };
}

/** The two-line cell the People tables render for `accessSummary`. */
export function AccessCell({ access }: { access: { title: string; detail: string } }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-sm">{access.title}</span>
      <span className="text-muted-foreground truncate text-xs">{access.detail}</span>
    </span>
  );
}

/**
 * Member or Admin, side by side. Two options read as a choice between two
 * things, which a vertical stack of cards made look like a longer form.
 */
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
      className="grid grid-cols-2 gap-2"
    >
      {ASSIGNABLE_ROLES.map((role) => (
        <Label
          key={role.value}
          htmlFor={`${idPrefix}-${role.value}`}
          className="has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 font-normal"
        >
          <RadioGroupItem id={`${idPrefix}-${role.value}`} value={role.value} className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{role.label}</span>
            <span className="text-muted-foreground text-xs leading-snug">{role.blurb}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}

/**
 * Editor or Viewer, with what each means inside the menu rather than in a
 * paragraph under the list. The trigger names the role only: Radix renders the
 * whole item text as the value, and a blurb in the closed trigger clips.
 */
export function WorkspaceRoleSelect({
  value,
  onChange,
  disabled,
  label,
  className,
}: {
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as WorkspaceRole)} disabled={disabled}>
      <SelectTrigger size="sm" className={className ?? "w-28"} aria-label={label}>
        {WORKSPACE_ROLES.find((r) => r.value === value)?.label}
      </SelectTrigger>
      {/* Popper, not item-aligned: item-aligned lines the menu up with a
          SelectValue, and this trigger renders the label itself, so Radix
          had nothing to align to and drew the menu off the screen. */}
      <SelectContent position="popper" align="end" className="w-64">
        {WORKSPACE_ROLES.map((r) => (
          <SelectItem key={r.value} value={r.value} textValue={r.label}>
            <span className="flex flex-col gap-0.5">
              <span>{r.label}</span>
              <span className="text-muted-foreground text-xs">{r.blurb}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The workspaces someone will open, as a checklist.
 *
 * A ticked row is lit and carries its role; an unticked one is dimmed and says
 * "No access". The difference between "in" and "out" is the thing being
 * decided, so it is the loudest thing on the row, not one value in a column of
 * identical dropdowns.
 */
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
  function toggle(id: string, on: boolean) {
    const next = { ...value };
    if (on) next[id] = next[id] ?? "editor";
    else delete next[id];
    onChange(next);
  }
  return (
    <div className="divide-border max-h-64 divide-y overflow-y-auto rounded-lg border">
      {workspaces.map((ws) => {
        const role = value[ws.id];
        const on = role !== undefined;
        return (
          <div
            key={ws.id}
            className={cn(
              "flex min-h-12 items-center gap-3 px-3 py-2 transition-colors",
              on ? "bg-primary/5" : "text-muted-foreground",
            )}
          >
            <Label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 font-normal">
              <Checkbox
                checked={on}
                disabled={disabled}
                onCheckedChange={(c) => toggle(ws.id, c === true)}
                aria-label={`Give access to ${ws.name}`}
              />
              <FolderOpen className={cn("size-4 shrink-0", on ? "text-foreground" : "opacity-60")} strokeWidth={1.75} />
              <span className={cn("min-w-0 flex-1 truncate text-sm", on && "text-foreground font-medium")}>{ws.name}</span>
            </Label>
            {on ? (
              <WorkspaceRoleSelect
                value={role}
                onChange={(r) => onChange({ ...value, [ws.id]: r })}
                disabled={disabled}
                label={`Role in ${ws.name}`}
              />
            ) : (
              <span className="w-28 pr-3 text-right text-xs">No access</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * What saving this will do, in one sentence: "They'll be an Editor in
 * Marketing and a Viewer in Sales, and won't see any other workspace." It is
 * what someone checks before pressing the button, so it is written out rather
 * than left to be read off the rows.
 */
export function grantsSentence(
  subject: string,
  role: AssignableRole,
  grants: Grants,
  workspaces: WorkspaceLite[],
): string | null {
  if (role === "admin") return `${subject} will be an Admin: every workspace, plus people and settings.`;
  const names = (r: WorkspaceRole) => workspaces.filter((w) => grants[w.id] === r).map((w) => w.name);
  const parts: string[] = [];
  const editor = names("editor");
  const viewer = names("viewer");
  if (editor.length) parts.push(`an Editor in ${listOf(editor)}`);
  if (viewer.length) parts.push(`a Viewer in ${listOf(viewer)}`);
  if (parts.length === 0) return null;
  const rest = editor.length + viewer.length < workspaces.length ? ", and won't see any other workspace" : "";
  return `${subject} will be ${parts.join(" and ")}${rest}.`;
}

function listOf(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
