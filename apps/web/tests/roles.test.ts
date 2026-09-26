import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  DEFAULT_INVITE_ROLE,
  ROLE_LABELS,
  WORKSPACE_ROLES,
  isOrgAdminRole,
  primaryRole,
  roleLabel,
  roleTitle,
  roleWithArticle,
  workspaceRoleTitle,
} from "@/lib/roles";

/**
 * How a role is spelled to the person who holds it.
 *
 * Two rules here are not guessable from the call site, and both were duplicated
 * across the team roster and the workspace switcher before `lib/roles.ts`
 * existed. Getting either wrong shows somebody the wrong thing about their own
 * access, which is the one category of copy that has to be right:
 *
 *   - Better Auth stores multiple roles comma-separated, so the raw column can
 *     read "admin,editor".
 *   - An organization role is owner, admin or member. `editor` and `viewer`
 *     are workspace roles; a row still holding one at the organization level
 *     predates per-workspace access and reads as "member".
 *
 * `apps/api/tests/team-roles.test.ts` pins what each role may *do*. This pins
 * what each one is *called*.
 */
describe("role vocabulary", () => {
  it("takes the first of a comma-separated set", () => {
    expect(primaryRole("admin,editor")).toBe("admin");
    expect(primaryRole("owner")).toBe("owner");
    // Spacing is Better Auth's to choose, not ours to depend on.
    expect(primaryRole("admin, editor")).toBe("admin");
  });

  it("falls back to the raw value rather than to a blank badge", () => {
    // A leading empty segment trims to "", which as a return value is an empty
    // badge on a roster row — indistinguishable from a member with no role.
    // Showing the raw column is ugly and visible, which is the better failure.
    expect(primaryRole(",admin")).toBe(",admin");
    // Nothing in, nothing out: an empty role is genuinely empty, and callers
    // (`useMyRole`, the roster) already branch on falsy before rendering.
    expect(primaryRole("")).toBe("");
  });

  it("reads legacy org-wide editor and viewer rows as members", () => {
    expect(roleLabel("editor")).toBe("member");
    expect(roleLabel("viewer")).toBe("member");
    expect(roleTitle("member")).toBe("Member");
    expect(roleWithArticle("member")).toBe("a member");
    // And through the comma rule at the same time.
    expect(roleLabel("member,viewer")).toBe("member");
  });

  it("title-cases for a badge and lowercases mid-sentence", () => {
    expect(roleTitle("owner")).toBe("Owner");
    expect(roleTitle("admin")).toBe("Admin");
    expect(roleLabel("Owner".toLowerCase())).toBe("owner");
  });

  it("gets the article right for every organization role", () => {
    // The switcher reads "You're ___ here", so a wrong article is visible copy.
    expect(roleWithArticle("owner")).toBe("an owner");
    expect(roleWithArticle("admin")).toBe("an admin");
    expect(roleWithArticle("member")).toBe("a member");
  });

  it("knows which organization roles open every workspace", () => {
    expect(isOrgAdminRole("owner")).toBe(true);
    expect(isOrgAdminRole("member,admin")).toBe(true);
    expect(isOrgAdminRole("member")).toBe(false);
    expect(isOrgAdminRole("editor")).toBe(false);
  });

  it("spells workspace roles, and the org roles that stand in for them", () => {
    expect(workspaceRoleTitle("editor")).toBe("Editor");
    expect(workspaceRoleTitle("viewer")).toBe("Viewer");
    expect(workspaceRoleTitle("admin")).toBe("Admin");
    expect(WORKSPACE_ROLES.map((r) => r.value)).toEqual(["editor", "viewer"]);
  });
});

/**
 * Which roles may be handed out, and which may only be read.
 *
 * The two lists are different and the difference is load-bearing. Better Auth
 * UI's organization plugin defaults to its own trio — owner, admin, member —
 * and until that default was overridden the invite dialog offered `owner` (an
 * organization has one; transferring it is not an invitation) and `member`
 * (the legacy spelling of `editor`) while omitting `editor` and `viewer`
 * entirely — the two roles people are actually invited as.
 */
describe("who may be invited", () => {
  const assignable = ASSIGNABLE_ROLES.map((r) => r.value);

  it("never offers owner", () => {
    expect(assignable).not.toContain("owner");
  });

  it("offers the organization roles the API accepts", () => {
    // `apps/api/src/lib/permissions.ts` lists exactly these as assignable; the
    // workspace role is chosen per workspace, not here.
    expect([...assignable].sort()).toEqual(["admin", "member"]);
  });

  it("starts on member, the least access that still does something", () => {
    expect(DEFAULT_INVITE_ROLE).toBe("member");
    expect(assignable).toContain(DEFAULT_INVITE_ROLE);
  });

  it("can label every role a row may hold, including legacy ones", () => {
    for (const role of ["owner", "admin", "member", "editor", "viewer"]) {
      expect(ROLE_LABELS[role], role).toBeTruthy();
    }
    expect(ROLE_LABELS.owner).toBe("Owner");
    expect(ROLE_LABELS.editor).toBe(ROLE_LABELS.member);
  });

  it("labels every assignable role consistently with its own list", () => {
    for (const role of ASSIGNABLE_ROLES) {
      expect(ROLE_LABELS[role.value], role.value).toBe(role.label);
    }
  });
});
