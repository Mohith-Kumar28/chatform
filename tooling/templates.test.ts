import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FormDoc } from "@repo/form-schema";
import { CATEGORIES, CATEGORY_ACCENT, TEMPLATES } from "./templates/index.js";

/**
 * The catalogue is authored in TypeScript and generated into SQL that is
 * committed. These are the two things that generation cannot check for itself:
 * that the content is coherent, and that the committed SQL still matches the
 * catalogue it claims to come from.
 */

describe("template catalogue", () => {
  it("has templates across every category", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(30);
    const used = new Set(TEMPLATES.map((t) => t.category));
    for (const category of CATEGORIES) expect(used).toContain(category);
  });

  it("has unique slugs", () => {
    const slugs = TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps the slugs the original four shipped under", () => {
    // These are live: a form created from one of them predates this table, and
    // a renamed slug is a 404 on a link someone may have bookmarked.
    for (const slug of ["lead-capture", "nps-survey", "event-rsvp", "job-application"]) {
      expect(TEMPLATES.some((t) => t.slug === slug)).toBe(true);
    }
  });

  it("produces documents the schema accepts", () => {
    for (const t of TEMPLATES) {
      expect(() => FormDoc.parse(t.doc), t.slug).not.toThrow();
      expect(t.doc.blocks.length, t.slug).toBeGreaterThan(1);
      expect(t.doc.endings.length, t.slug).toBe(1);
    }
  });

  it("gives every question a distinct, readable ref", () => {
    for (const t of TEMPLATES) {
      const refs = t.doc.blocks.map((b) => b.ref);
      expect(new Set(refs).size, t.slug).toBe(refs.length);
      // Refs become CSV headers and webhook keys, so a derived-from-title ref
      // like `q_what_s_your` is a bug, not a style preference.
      for (const ref of refs) expect(ref, `${t.slug}:${ref}`).not.toMatch(/_s_/);
    }
  });

  it("counts questions without counting the greeting", () => {
    for (const t of TEMPLATES) {
      const asked = t.doc.blocks.filter((b) => b.type !== "welcome" && b.type !== "statement").length;
      expect(t.blockCount, t.slug).toBe(asked);
      expect(t.estMinutes, t.slug).toBeGreaterThan(0);
    }
  });

  it("carries the presentation metadata the gallery renders", () => {
    for (const t of TEMPLATES) {
      expect(t.description.length, t.slug).toBeGreaterThan(10);
      expect(t.blurb.length, t.slug).toBeGreaterThan(40);
      expect(t.tags.length, t.slug).toBeGreaterThan(0);
      expect(t.icon, t.slug).toMatch(/^[A-Z][A-Za-z0-9]+$/);
      expect(t.accent, t.slug).toBe(CATEGORY_ACCENT[t.category]);
    }
  });
});

describe("generated seed", () => {
  const sql = readFileSync(join(import.meta.dirname, "seed-templates.sql"), "utf8");

  it("contains a row for every template", () => {
    expect(sql.split("INSERT INTO form_templates").length - 1).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect(sql, t.slug).toContain(`'${t.slug}'`);
  });

  it("never resets usage_count or created_at on re-seed", () => {
    // Both are runtime state. An upsert that overwrote them would zero every
    // template's popularity on each deploy that ran the seed.
    expect(sql).not.toContain("usage_count = excluded");
    expect(sql).not.toContain("created_at = excluded");
  });

  it("retires only official templates that left the catalogue", () => {
    expect(sql).toContain("DELETE FROM form_templates WHERE official = 1 AND organization_id IS NULL");
  });
});
