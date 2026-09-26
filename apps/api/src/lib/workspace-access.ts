import type { Bindings } from "../env.js";
import { isOrgAdmin, isWorkspaceRole, type WorkspaceRole } from "./permissions.js";

/**
 * Which workspaces the caller may open, and at what role.
 *
 * Owners and admins reach every workspace in their organization without a grant.
 * Everyone else reaches only the workspaces on their `workspace_members` rows.
 * An API key is organization-wide by construction (only admins can mint one), so
 * a key request resolves as admin here and is narrowed by its scopes instead.
 *
 * One query per request, memoised on the context: the guards, the role gates and
 * the list filters all ask, and the answer cannot change mid-request.
 */
export type WorkspaceAccess = {
  /** The stored organization role, as `roleFor` reads it. */
  orgRole: string;
  /** Owner or admin: every workspace, no grant needed. */
  admin: boolean;
  /** The caller's membership row id, or null when they are not a member. */
  memberId: string | null;
  /** Workspace id → role. Empty for admins, who need none. */
  grants: Map<string, WorkspaceRole>;
};

type AccessCtx = {
  env: Bindings;
  get: (key: never) => unknown;
  set: (key: never, value: never) => void;
};

const NONE: WorkspaceAccess = { orgRole: "", admin: false, memberId: null, grants: new Map() };

export async function accessFor(c: AccessCtx): Promise<WorkspaceAccess> {
  const get = c.get as (k: string) => unknown;
  const set = c.set as (k: string, v: unknown) => void;
  const cached = get("access") as WorkspaceAccess | undefined;
  if (cached) return cached;

  const orgId = get("orgId") as string | undefined;
  if (get("keyId")) {
    const access: WorkspaceAccess = { orgRole: "", admin: true, memberId: null, grants: new Map() };
    set("access", access);
    return access;
  }
  const userId = get("userId") as string | undefined;
  if (!userId || !orgId) return NONE;

  const rows = await c.env.DB.prepare(
    `SELECT m.id AS member_id, m.role AS org_role, wm.workspace_id, wm.role AS ws_role
       FROM members m
       LEFT JOIN workspace_members wm ON wm.member_id = m.id
      WHERE m.organization_id = ? AND m.user_id = ?`,
  )
    .bind(orgId, userId)
    .all<{ member_id: string; org_role: string; workspace_id: string | null; ws_role: string | null }>();
  const list = rows.results ?? [];
  if (list.length === 0) {
    set("access", NONE);
    return NONE;
  }
  const orgRole = list[0]!.org_role;
  const grants = new Map<string, WorkspaceRole>();
  for (const r of list) {
    if (r.workspace_id && isWorkspaceRole(r.ws_role)) grants.set(r.workspace_id, r.ws_role);
  }
  const access: WorkspaceAccess = { orgRole, admin: isOrgAdmin(orgRole), memberId: list[0]!.member_id, grants };
  set("access", access);
  return access;
}

/**
 * The role to judge a workspace-scoped permission by: the organization role for
 * an owner or admin, the grant for a member, or null when they cannot open it.
 */
export async function workspaceRoleFor(c: AccessCtx, workspaceId: string | null | undefined): Promise<string | null> {
  const access = await accessFor(c);
  if (access.admin) return access.orgRole || "admin";
  if (!workspaceId) return null;
  return access.grants.get(workspaceId) ?? null;
}

/** Can the caller open this workspace at all? */
export async function canOpenWorkspace(c: AccessCtx, workspaceId: string | null | undefined): Promise<boolean> {
  return (await workspaceRoleFor(c, workspaceId)) !== null;
}

/**
 * The strongest workspace role a member holds anywhere, for a gate that runs
 * before the request has said which workspace it means. The handler then checks
 * the real target; this only stops a viewer-everywhere from getting that far.
 */
export function bestGrant(access: WorkspaceAccess): WorkspaceRole | null {
  let best: WorkspaceRole | null = null;
  for (const role of access.grants.values()) {
    if (role === "editor") return "editor";
    best = "viewer";
  }
  return best;
}

/**
 * A SQL fragment restricting `column` to the workspaces the caller may open, with
 * its bindings. Admins get no restriction. A member's grants are read by
 * subquery rather than listed, so the fragment binds one value however many
 * workspaces they hold, and a member with none matches nothing.
 */
export function workspaceFilter(access: WorkspaceAccess, column: string): { sql: string; binds: string[] } {
  if (access.admin) return { sql: "", binds: [] };
  if (!access.memberId) return { sql: " AND 0", binds: [] };
  return {
    sql: ` AND ${column} IN (SELECT workspace_id FROM workspace_members WHERE member_id = ?)`,
    binds: [access.memberId],
  };
}

/**
 * Turns an accepted invitation's waiting grants into real ones. Called from
 * Better Auth's `afterAcceptInvitation`, which hands over the new member row.
 */
export async function applyInvitationGrants(env: Bindings, invitationId: string, memberId: string, memberRole: string) {
  if (isOrgAdmin(memberRole)) return;
  await env.DB.prepare(
    `INSERT INTO workspace_members (id, workspace_id, member_id, role, created_by, created_at)
     SELECT 'wm_' || lower(hex(randomblob(12))), iw.workspace_id, ?, iw.role, NULL, ?
       FROM invitation_workspaces iw WHERE iw.invitation_id = ?
     ON CONFLICT (workspace_id, member_id) DO UPDATE SET role = excluded.role`,
  )
    .bind(memberId, Date.now(), invitationId)
    .run();
}
