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
 *  - `member` is Better Auth's legacy default and the database still holds it
 *    for anyone invited before the role list settled. It means `editor`, and
 *    "member" tells a reader nothing about what they can do.
 *
 * This is presentation only. `apps/api/src/lib/permissions.ts` is the
 * enforcement boundary and the only thing that decides what a role may do.
 */

/** The first of a comma-separated set. */
export function primaryRole(role: string): string {
  return role.split(",")[0]?.trim() || role;
}

/** Lowercase, mid-sentence: "you are an editor here". */
export function roleLabel(role: string): string {
  const r = primaryRole(role);
  return r === "member" ? "editor" : r;
}

/** Title case, standing alone: a badge, a column, a menu row. */
export function roleTitle(role: string): string {
  const r = roleLabel(role);
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/**
 * With its article: "You're **an editor** here."
 *
 * Spelled out rather than derived from the first letter, because the list is
 * four items long and closed — a rule that reads the vowel would be more code
 * to say the same thing and would guess wrong on a role we have not written yet.
 */
export function roleWithArticle(role: string): string {
  const r = roleLabel(role);
  return r === "owner" || r === "admin" || r === "editor" ? `an ${r}` : `a ${r}`;
}

/**
 * The roles an invitation may assign, in the order they are offered.
 *
 * `owner` is not here: an organization has one, and transferring it is a
 * different operation from inviting somebody. `member` is not here either —
 * it is Better Auth's legacy name for `editor`, still accepted by the API for
 * rows written before the role list settled, but never offered to a chooser.
 *
 * This is the fourth thing in the tree that had its own copy of the role list
 * and the third that had its own copy of these blurbs. The blurbs are help
 * text, not an authorization decision: `apps/api/src/lib/permissions.ts` is the
 * enforcement boundary and refuses regardless of what this array claims. But
 * they must not drift from it, which is a great deal easier to hold true with
 * one copy than with three.
 */
export const ASSIGNABLE_ROLES = [
  { value: "editor", label: "Editor", blurb: "Build forms and read every response." },
  { value: "admin", label: "Admin", blurb: "Everything except billing." },
  { value: "viewer", label: "Viewer", blurb: "Read completed responses and basic analytics." },
] as const;

/**
 * Every role that can appear in the database, spelled for a reader.
 *
 * A superset of `ASSIGNABLE_ROLES`, and the distinction is the point: `owner`
 * cannot be handed out by an invitation but every organization has one, and
 * `member` cannot be chosen but is still stored for anyone invited before the
 * role list settled. Both have to be *readable* in the members table even
 * though neither may be *picked*, and a map that only covered the assignable
 * three would render them as raw lowercase column values.
 *
 * `member` deliberately shares `editor`'s label rather than getting one of its
 * own, because it is not a different level of access — it is the same one under
 * Better Auth's old name, which is exactly what `permissions.ts` encodes with
 * `export const member = editor`.
 */
export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  member: "Editor",
}

/** One of the roles an invitation may assign. */
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]["value"];

/** The role an invite starts on: the one most people are invited as. */
export const DEFAULT_INVITE_ROLE: AssignableRole = "editor";
