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
