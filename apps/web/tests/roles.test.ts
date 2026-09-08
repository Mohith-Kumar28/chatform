import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  DEFAULT_INVITE_ROLE,
  ROLE_LABELS,
  primaryRole,
  roleLabel,
  roleTitle,
  roleWithArticle,
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
 *   - `member` is Better Auth's legacy default and is still in the database for
 *     anyone invited before the role list settled. It means `editor`.
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

  it("translates the legacy `member` everywhere, not just in one spelling", () => {
    expect(roleLabel("member")).toBe("editor");
    expect(roleTitle("member")).toBe("Editor");
    expect(roleWithArticle("member")).toBe("an editor");
    // And through the comma rule at the same time.
    expect(roleLabel("member,viewer")).toBe("editor");
  });

  it("title-cases for a badge and lowercases mid-sentence", () => {
    expect(roleTitle("owner")).toBe("Owner");
    expect(roleTitle("viewer")).toBe("Viewer");
    expect(roleLabel("Owner".toLowerCase())).toBe("owner");
  });

  it("gets the article right for all four roles", () => {
    // The switcher reads "You're ___ here", so a wrong article is visible copy.
    expect(roleWithArticle("owner")).toBe("an owner");
    expect(roleWithArticle("admin")).toBe("an admin");
    expect(roleWithArticle("editor")).toBe("an editor");
    expect(roleWithArticle("viewer")).toBe("a viewer");
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

  it("never offers owner or the legacy member", () => {
    expect(assignable).not.toContain("owner");
    expect(assignable).not.toContain("member");
  });

  it("offers the three roles the API actually enforces", () => {
    // `apps/api/src/lib/permissions.ts` is the enforcement boundary and lists
    // exactly these as assignable.
    expect([...assignable].sort()).toEqual(["admin", "editor", "viewer"]);
  });

  it("starts on editor, not on whichever entry happens to be last", () => {
    // The dialog's own default was "last key in the map", which against this
    // list is `viewer` — silently inviting every teammate as the most
    // restricted role in the product.
    expect(DEFAULT_INVITE_ROLE).toBe("editor");
    expect(assignable).toContain(DEFAULT_INVITE_ROLE);
  });

  it("can label every role a row may hold, including the unassignable ones", () => {
    // A role with no label renders as its raw lowercase column value. Every
    // organization has an owner, so that gap was visible on day one.
    for (const role of ["owner", "admin", "editor", "viewer", "member"]) {
      expect(ROLE_LABELS[role], role).toBeTruthy();
    }
    expect(ROLE_LABELS.owner).toBe("Owner");
    // `member` is not a different level of access — it is `editor` under Better
    // Auth's old name, which is what `permissions.ts` encodes.
    expect(ROLE_LABELS.member).toBe(ROLE_LABELS.editor);
  });

  it("labels every assignable role consistently with its own list", () => {
    for (const role of ASSIGNABLE_ROLES) {
      expect(ROLE_LABELS[role.value], role.value).toBe(role.label);
    }
  });
});
