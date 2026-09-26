/**
 * How a role is spelled to a person.
 *
 * Three spellings of the same fact were already in the tree — the team roster's
 * lowercase badge, the invitation email's "an editor", the accept page's copy —
 * and each carried its own copy of the two rules below. They are not obvious
 * rules, and getting either wrong shows somebody the wrong thing about their
 * own access:
 *
 *  - Better Auth stores multiple roles comma-separated. The first is the one to
 *    show; rendering the raw column gives "admin,editor".
 *  - An organization role is owner, admin or member. `editor` and `viewer`
 *    are workspace roles now; a row that still holds one at the organization
 *    level predates per-workspace access and reads as "member".
 *
 * This is presentation only. `apps/api/src/lib/permissions.ts` is the
 * enforcement boundary and the only thing that decides what a role may do.
 */

/** The first of a comma-separated set. */
export function primaryRole(role: string): string {
  return role.split(",")[0]?.trim() || role;
}

/** Lowercase, mid-sentence: "you are an admin here". Organization roles only. */
export function roleLabel(role: string): string {
  const r = primaryRole(role);
  return r === "owner" || r === "admin" ? r : "member";
}

/** Title case, standing alone: a badge, a column, a menu row. */
export function roleTitle(role: string): string {
  const r = roleLabel(role);
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/** Is this organization role one that opens every workspace? */
export function isOrgAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return role.split(",").some((r) => r.trim() === "owner" || r.trim() === "admin");
}

/**
 * With its article: "You're **an admin** here."
 *
 * Spelled out rather than derived from the first letter, because the list is
 * short and closed.
 */
export function roleWithArticle(role: string): string {
  const r = roleLabel(role);
  return r === "owner" || r === "admin" ? `an ${r}` : `a ${r}`;
}

/**
 * The organization roles an invitation may assign, in the order they are offered.
 *
 * `owner` is not here: an organization has one, and transferring it is a
 * different operation from inviting somebody. The blurbs are help text, not an
 * authorization decision: `apps/api/src/lib/permissions.ts` is the enforcement
 * boundary and refuses regardless of what this array claims.
 */
export const ASSIGNABLE_ROLES = [
  { value: "member", label: "Member", blurb: "Only the workspaces you choose." },
  { value: "admin", label: "Admin", blurb: "Every workspace, plus people and settings. Not billing." },
] as const;

/** What a member can do inside one workspace. */
export const WORKSPACE_ROLES = [
  { value: "editor", label: "Editor", blurb: "Build, edit and publish forms, and work with every response." },
  { value: "viewer", label: "Viewer", blurb: "Read completed responses and basic analytics." },
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]["value"];

export function workspaceRoleTitle(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return WORKSPACE_ROLES.find((r) => r.value === role)?.label ?? role;
}

/**
 * Every organization role that can appear in the database, spelled for a reader.
 * `editor` and `viewer` are here only for rows written before per-workspace
 * access, which the API treats as members.
 */
export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  editor: "Member",
  viewer: "Member",
}

/** One of the roles an invitation may assign. */
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]["value"];

/** The role an invite starts on: the one most people are invited as. */
export const DEFAULT_INVITE_ROLE: AssignableRole = "member";
