import { describe, expect, it } from "vitest";
import { SEARCH_NAMES, TEMPLATES, getTemplate } from "@/content/templates";
import { FEATURED_TEMPLATES } from "@/content/templates/featured";
import { USE_CASES } from "@/content/use-cases";

/**
 * The public template pages are generated from a committed JSON file, and three
 * other places point into it by slug: the nav menu, the use-case guides, and
 * the search names. A renamed template would leave any of them linking to a
 * 404 — which `dynamicParams = false` makes a real 404, not a fallback.
 */
describe("public template catalogue", () => {
  it("has every template with a document", () => {
    expect(TEMPLATES.length).toBeGreaterThan(20);
    for (const t of TEMPLATES) {
      expect(t.doc.blocks.length, t.slug).toBeGreaterThan(0);
      expect(t.path).toBe(`/form-templates/${t.slug}`);
    }
  });

  /* The fallback to the catalogue title keeps a new template publishable,
     but it should be a stopgap: this is the reminder to name it. */
  it("names every template by its search phrase", () => {
    const unnamed = TEMPLATES.filter((t) => !(t.slug in SEARCH_NAMES)).map((t) => t.slug);
    expect(unnamed).toEqual([]);
    const stale = Object.keys(SEARCH_NAMES).filter((slug) => !getTemplate(slug));
    expect(stale).toEqual([]);
  });

  it("links the nav menu only to templates that exist", () => {
    for (const featured of FEATURED_TEMPLATES) {
      expect(getTemplate(featured.slug)?.searchName, featured.slug).toBe(featured.name);
    }
  });

  it("links every use-case guide to a template that exists", () => {
    for (const entry of USE_CASES) {
      if (entry.template) expect(getTemplate(entry.template.slug), entry.slug).toBeDefined();
    }
  });
});
