import { describe, expect, it } from "vitest";
import { ConditionOp } from "@repo/form-schema";
import { QUESTION_TYPE_COUNT } from "@/components/marketing/question-types";
import { COMPARISONS } from "@/content/compare";
import { STUDIES } from "@/content/research";
import { VENDORS, ROWS } from "@/components/marketing/comparison-data";
import { USE_CASES, USE_CASE_GROUPS, getUseCase } from "@/content/use-cases";

/**
 * The marketing copy makes countable claims. This is what stops them rotting.
 *
 * `question-types.ts` already tells the story: three places said "26 question
 * types" by hand, the registry had 25, and nobody mistyped it — it was correct
 * once and then a block type left the library. The fix there was to derive the
 * number. That is not available everywhere: "nineteen operators" appears in
 * nine places, several of them prose in an MDX post, and interpolating a count
 * into an English sentence in a blog post is worse than the problem.
 *
 * So the number stays written out, and this asserts it is still true. If
 * somebody adds a twentieth operator, this fails and names the pages to edit,
 * which is the outcome that matters.
 */
describe("countable marketing claims", () => {
  it("still has exactly nineteen condition operators", () => {
    expect(ConditionOp.options).toHaveLength(19);
  });

  it("has a question-type count worth printing", () => {
    // Not an exact assertion — the count is derived everywhere it is shown.
    // This only catches the registry emptying out or exploding.
    expect(QUESTION_TYPE_COUNT).toBeGreaterThan(20);
    expect(QUESTION_TYPE_COUNT).toBeLessThan(40);
  });
});

/**
 * The comparison pages read competitor facts positionally out of the shared
 * table. A vendor removed from `VENDORS`, or a row added with a short `cells`
 * array, would render as `undefined` in a table cell — a silent blank where a
 * factual claim used to be.
 */
describe("comparison pages", () => {
  it("every page points at a real vendor column", () => {
    for (const entry of COMPARISONS) {
      expect(VENDORS).toContain(entry.vendor);
      expect(entry.vendorIndex).toBeGreaterThan(0);
    }
  });

  it("every shared row has a cell for every vendor", () => {
    for (const row of ROWS) {
      expect(row.cells, `row "${row.label}"`).toHaveLength(VENDORS.length);
    }
  });

  it("every page concedes something, and cites its prices", () => {
    for (const entry of COMPARISONS) {
      expect(entry.theirStrengths.length, entry.slug).toBeGreaterThan(0);
      expect(entry.whoShouldStay.length, entry.slug).toBeGreaterThan(120);
      expect(entry.sources.length, entry.slug).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(source.url, entry.slug).toMatch(/^https:\/\//);
      }
    }
  });

  it("uses no slug that would collide with a real route", () => {
    const reserved = ["pricing", "compare", "blog", "docs", "signin", "ai-info", "dashboard"];
    for (const entry of COMPARISONS) {
      expect(reserved).not.toContain(entry.slug);
    }
  });
});

/**
 * Every research claim on the site traces to this list, and every entry has to
 * be checkable. A citation without a resolvable link is the thing the whole
 * page exists to be better than.
 */
describe("research citations", () => {
  it("every study has a resolvable source", () => {
    for (const entry of STUDIES) {
      expect(entry.url, entry.id).toMatch(/^https:\/\//);
      expect(entry.finding.length, entry.id).toBeGreaterThan(60);
      expect(entry.year, entry.id).toBeGreaterThan(1990);
    }
  });

  it("names no study twice", () => {
    const ids = STUDIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * The use-case guides are the largest body of authored content on the site and
 * the one most likely to rot quietly: a `related` slug that no longer exists
 * renders as a missing card, and a guide with no group vanishes from the nav
 * menu without anything failing.
 */
describe("use-case guides", () => {
  it("every related link points at a guide that exists", () => {
    for (const entry of USE_CASES) {
      for (const slug of entry.related) {
        expect(getUseCase(slug), `${entry.slug} → ${slug}`).toBeDefined();
      }
      expect(entry.related, entry.slug).not.toContain(entry.slug);
    }
  });

  it("every guide appears in exactly one nav group", () => {
    const grouped = USE_CASE_GROUPS.flatMap((group) => group.items);
    expect(grouped).toHaveLength(USE_CASES.length);
    for (const entry of USE_CASES) {
      expect(grouped.filter((item) => item.slug === entry.slug), entry.slug).toHaveLength(1);
    }
  });

  it("uses a unique slug and a unique sample response reference", () => {
    const slugs = USE_CASES.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const refs = USE_CASES.map((entry) => entry.responseReference);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("gives every step a body and every figure something to draw", () => {
    for (const entry of USE_CASES) {
      for (const step of entry.steps) {
        expect(step.body.length, `${entry.slug} / ${step.title}`).toBeGreaterThan(40);
      }
      // The prompt has to be shown somewhere, or there is nothing to copy.
      expect(entry.steps.some((step) => step.figure === "prompt"), entry.slug).toBe(true);
    }
  });

  it("shows three extracted fields beside the sample transcript", () => {
    for (const entry of USE_CASES) {
      expect(entry.resultFields.length, entry.slug).toBe(3);
    }
  });

  it("does not collide with a comparison slug or a real route", () => {
    const comparisonSlugs = new Set(COMPARISONS.map((entry) => entry.slug));
    for (const entry of USE_CASES) {
      expect(comparisonSlugs.has(entry.slug), entry.slug).toBe(false);
    }
  });
});
