import { describe, expect, it } from "vitest";
import { primaryRole, roleLabel, roleTitle, roleWithArticle } from "@/lib/roles";

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
