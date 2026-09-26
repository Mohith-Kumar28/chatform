/**
 * RBAC — who may do what inside an organization.
 *
 * Built on Better Auth's own access-control primitive rather than a hand-rolled role
 * table, so `authClient.organization.checkRolePermission` on the web and
 * `auth.api.hasPermission` on the server read from one definition.
 *
 * This is deliberately NOT the same axis as plan entitlements:
 *
 *   RBAC          "is this person allowed to do this in this org?"   → 403, no upsell
 *   entitlements  "did this organization buy this?"                  → 402, upsell
 *
 * A viewer cannot export whatever the plan is; nobody on Free sees partial responses,
 * not even the owner. Both must pass, and the two failures stay distinguishable —
 * offering an upgrade for something a role change would fix is the worst thing the
 * authorization layer could do.
 */

import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, ownerAc } from "better-auth/plugins/organization/access";

/**
 * Every guarded resource. `defaultStatements` brings Better Auth's own
 * organization / member / invitation statements; the rest are ours.
 *
 * `submission:read` and `submission:read_partial` are separate on purpose: a viewer may
 * read completed responses without being trusted with the unfinished ones, which often
 * contain answers a respondent chose not to submit.
 */
export const statement = {
  ...defaultStatements,
  billing: ["read", "manage"],
  form: ["create", "read", "update", "delete", "publish"],
  submission: ["read", "read_partial", "export", "delete"],
  analytics: ["read", "read_advanced"],
  webhook: ["create", "read", "update", "delete"],
  apikey: ["create", "read", "revoke"],
  /**
   * The api-key plugin's own resource name, and it must be spelled exactly this
   * way: `checkOrgApiKeyPermission` asks the organization access controller for
   * `{ apiKey: [action] }`. Our pre-existing `apikey` statement above is a
   * different string, so without this every org-owned key operation would fail
   * for anyone but the organization's creator — who passes regardless, which is
   * precisely why it would look fine in development.
   */
  apiKey: ["create", "read", "update", "delete"],
  workspace: ["create", "update", "delete"],
  branding: ["manage"],
  domain: ["manage"],
  audit: ["read"],
  ai: ["generate"],
} as const;

export type Resource = keyof typeof statement;
export type ActionOf<R extends Resource> = (typeof statement)[R][number];

export const ac = createAccessControl(statement);

const ALL = {
  billing: ["read", "manage"],
  form: ["create", "read", "update", "delete", "publish"],
  submission: ["read", "read_partial", "export", "delete"],
  analytics: ["read", "read_advanced"],
  webhook: ["create", "read", "update", "delete"],
  apikey: ["create", "read", "revoke"],
  apiKey: ["create", "read", "update", "delete"],
  workspace: ["create", "update", "delete"],
  branding: ["manage"],
  domain: ["manage"],
  audit: ["read"],
  ai: ["generate"],
} as const;

/** Everything, including deleting the organization and changing what it pays. */
export const owner = ac.newRole({ ...ownerAc.statements, ...ALL });

/** Everything except deleting the organization and changing the subscription. */
export const admin = ac.newRole({
  ...adminAc.statements,
  ...ALL,
  billing: ["read"],
});

/**
 * The working role: builds forms, reads and exports everything, runs the AI. Cannot
 * touch the team, the subscription, API keys, the domain or the audit trail.
 */
export const editor = ac.newRole({
  form: ["create", "read", "update", "delete", "publish"],
  submission: ["read", "read_partial", "export", "delete"],
  analytics: ["read", "read_advanced"],
  webhook: ["create", "read", "update", "delete"],
  workspace: ["create", "update"],
  branding: ["manage"],
  ai: ["generate"],
});

/** Read-only, and not trusted with unfinished responses or exports. */
export const viewer = ac.newRole({
  form: ["read"],
  submission: ["read"],
  analytics: ["read"],
  webhook: ["read"],
});

/**
 * `member` is the organization role of everyone who is not an owner or admin.
 *
 * It grants nothing at the organization level on purpose: what a member may do
 * with forms, responses and the AI is decided per workspace by the role on their
 * `workspace_members` row, which is `editor` or `viewer` above. Those two are
 * workspace roles now. Rows that still say `editor` or `viewer` at the
 * organization level predate per-workspace access and are read as `member`
 * (see `orgTier`), with their grants backfilled by migration 0042.
 */
export const member = ac.newRole({});
export const roles = { owner, admin, editor, viewer, member } as const;

export type RoleName = keyof typeof roles;

export const ROLE_NAMES = Object.keys(roles) as RoleName[];

/** Organization roles offered in the invite UI. */
export const ASSIGNABLE_ROLES = ["admin", "member"] as const;

/** Roles a member can hold inside one workspace. */
export const WORKSPACE_ROLES = ["editor", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === "editor" || value === "viewer";
}

/**
 * Resources whose permission is decided by the workspace a thing lives in rather
 * than by the organization. Everything else (billing, members, keys, domains,
 * the audit trail, creating workspaces) stays an organization question.
 */
export const WORKSPACE_RESOURCES: ReadonlySet<Resource> = new Set<Resource>([
  "form",
  "submission",
  "analytics",
  "ai",
  "branding",
  "webhook",
]);

/** Owners and admins reach every workspace without a grant. */
export function isOrgAdmin(role: string | null | undefined): boolean {
  if (!role) return false;
  return role.split(",").some((r) => {
    const name = r.trim();
    return name === "owner" || name === "admin";
  });
}

/**
 * The organization-level role a stored role string stands for: owners and admins
 * as themselves, everyone else as `member`. Legacy org-wide `editor` / `viewer`
 * rows land here too, so they can never outrank their workspace grants.
 */
export function orgTier(role: string | null | undefined): string {
  if (!role) return "";
  return isOrgAdmin(role) ? role : "member";
}

export const ROLE_LABELS: Record<RoleName, { label: string; blurb: string }> = {
  owner: { label: "Owner", blurb: "Full access, including billing." },
  admin: { label: "Admin", blurb: "Everything except billing and deleting the organization." },
  editor: { label: "Editor", blurb: "Build, edit and publish forms, and work with every response." },
  viewer: { label: "Viewer", blurb: "Read completed responses and basic analytics." },
  member: { label: "Member", blurb: "Only the workspaces they're added to." },
};

export function isRoleName(value: string): value is RoleName {
  return Object.prototype.hasOwnProperty.call(roles, value);
}

/**
 * Does `role` permit `action` on `resource`?
 *
 * Answers locally from the statements rather than calling `auth.api.hasPermission`,
 * which would cost another session round-trip on a hot path where the guards have
 * already resolved the member row. Better Auth stores multiple roles as a
 * comma-separated string, so a member may hold several.
 */
export function roleAllows<R extends Resource>(
  role: string | null | undefined,
  resource: R,
  action: ActionOf<R>,
): boolean {
  if (!role) return false;
  for (const name of role.split(",").map((r) => r.trim())) {
    if (!isRoleName(name)) continue;
    const result = roles[name].authorize({ [resource]: [action] } as never);
    if (result.success) return true;
  }
  return false;
}

/**
 * The full permission map for a role, sent to the web app so the UI can hide what a
 * role cannot do without asking the server per control.
 */
export function permissionsFor(role: string | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const resource of Object.keys(statement) as Resource[]) {
    const actions = statement[resource] as readonly string[];
    const allowed = actions.filter((a) => roleAllows(role, resource, a as never));
    if (allowed.length > 0) out[resource] = allowed;
  }
  return out;
}

/** The workspace-scoped slice of a role's permissions: what it may do inside one workspace. */
export function workspacePermissionsFor(role: string | null | undefined): Record<string, string[]> {
  const all = permissionsFor(role);
  return Object.fromEntries(Object.entries(all).filter(([resource]) => WORKSPACE_RESOURCES.has(resource as Resource)));
}
