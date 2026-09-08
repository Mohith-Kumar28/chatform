import googleForms from "./google-forms";
import jotform from "./jotform";
import tally from "./tally";
import typeform from "./typeform";
import type { Comparison } from "./define";

/**
 * The comparison set, in the order the hub lists them.
 *
 * Ordered by how often the phrase is actually searched rather than
 * alphabetically, because this array is also the `ItemList` graph on `/compare`
 * and the order there is a claim about relevance.
 */
export const COMPARISONS: readonly Comparison[] = [typeform, googleForms, jotform, tally];

export function getComparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((entry) => entry.slug === slug);
}

export type { Comparison } from "./define";
