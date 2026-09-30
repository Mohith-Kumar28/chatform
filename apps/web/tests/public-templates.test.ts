import { describe, expect, it } from "vitest";
import { GOALS, ROLES, TEMPLATES, TYPES, byCategory, byGoal, byRole, getTemplate, loadTemplate } from "@/content/templates";
import { HUBS } from "@/content/templates/hubs";
import { FEATURED_TEMPLATES } from "@/content/templates/featured";
import { USE_CASES } from "@/content/use-cases";

/**
 * The public template pages are generated from a committed JSON file, and three
 * other places point into it by slug: the nav menu, the use-case guides, and
 * the search names. A renamed template would leave any of them linking to a
 * 404 — which `dynamicParams = false` makes a real 404, not a fallback.
 */
describe("public template catalogue", () => {
  it("has every template with a document and a guide", async () => {
    expect(TEMPLATES.length).toBeGreaterThan(280);
    for (const t of TEMPLATES) {
      const full = await loadTemplate(t.slug);
      expect(full?.doc.blocks.length, t.slug).toBeGreaterThan(0);
      expect(full?.guide.faqs.length, t.slug).toBeGreaterThanOrEqual(3);
      expect(t.path).toBe(`/form-templates/${t.slug}`);
    }
  });

  it("has written copy for every hub page", () => {
    const keys = [
      "gallery",
      ...TYPES.map((t) => `type:${t.type}`),
      ...TYPES.flatMap((t) => t.categories.filter((c) => byCategory(t.type, c.slug).length > 0).map((c) => `category:${t.type}/${c.slug}`)),
      ...GOALS.filter((g) => byGoal(g.slug).length > 0).map((g) => `goal:${g.slug}`),
      ...ROLES.filter((r) => byRole(r.slug).length > 0).map((r) => `role:${r.slug}`),
    ];
    expect(keys.filter((k) => !HUBS[k])).toEqual([]);
    const descriptions = Object.values(HUBS).map((h) => h.metaDescription);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    expect(Object.values(HUBS).filter((h) => /\u2014/.test(JSON.stringify(h)))).toEqual([]);
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
