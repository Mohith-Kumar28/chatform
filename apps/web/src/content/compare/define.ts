import type { Cell } from "@/components/marketing/comparison-data";
import { VENDORS } from "@/components/marketing/comparison-data";

/**
 * One comparison page, as data.
 *
 * The shape is the argument, and the argument is deliberately not "we win".
 * Every field that could be used to shade the truth has an honest counterpart
 * that has to be filled in too: `theirStrengths` sits next to `ourStrengths`,
 * and `whoShouldStay` is a required string, not an optional one. A page that
 * cannot name a reason to choose the competitor is a page nobody believes, and
 * a reader who catches one bad claim stops reading the other twenty.
 *
 * `sources` and `updates` exist for the same reason. A comparison page is the
 * easiest kind of page to write and the easiest kind to get quietly wrong six
 * months later, when a competitor changes a price and nobody notices. Naming
 * the pages the numbers came from, and the date each was read, is what makes
 * the drift findable.
 */

export type VendorKey = (typeof VENDORS)[number];

export interface ComparisonFaq {
  /**
   * Phrased the way somebody types it into a search box, not the way a
   * marketing team would title a section. These are the strings the page is
   * for, and they double as the `FAQPage` graph.
   */
  question: string;
  /** Plain text. It has to survive being flattened into JSON-LD. */
  answer: string;
}

export interface ComparisonStrength {
  title: string;
  body: string;
}

export interface ComparisonPriceRow {
  label: string;
  us: string;
  them: string;
  note?: string;
}

export interface ComparisonSource {
  label: string;
  url: string;
  /** When a human last opened that URL and read it. */
  checkedOn: string;
}

export interface ComparisonUpdate {
  date: string;
  note: string;
}

export interface ComparisonInput {
  /** The search phrase, as the URL. `typeform-alternative`, not `typeform`. */
  slug: string;
  competitor: string;
  /** Which column of the shared table this page pulls from. */
  vendor: VendorKey;
  title: string;
  description: string;
  h1: string;
  lede: string;
  /**
   * The concession, and the most important paragraph on the page.
   *
   * It runs high, before the table, because a reader who is told upfront where
   * the competitor genuinely wins will believe the rest — and because the
   * people it sends away were never going to stay.
   */
  whoShouldStay: string;
  theirStrengths: readonly string[];
  ourStrengths: readonly ComparisonStrength[];
  /** Extra rows specific to this matchup, appended to the shared ones. */
  extraRows?: readonly { label: string; hint?: string; us: Cell; them: Cell }[];
  pricing: readonly ComparisonPriceRow[];
  faq: readonly ComparisonFaq[];
  sources: readonly ComparisonSource[];
  updates: readonly ComparisonUpdate[];
}

export interface Comparison extends ComparisonInput {
  /** `/typeform-alternative` — the leading slash, computed once. */
  path: string;
  /** Index into `VENDORS`, so the shared table's cells can be read positionally. */
  vendorIndex: number;
}

export function defineComparison(input: ComparisonInput): Comparison {
  const vendorIndex = VENDORS.indexOf(input.vendor);
  if (vendorIndex < 0) {
    throw new Error(
      `defineComparison(${input.slug}): "${input.vendor}" is not a column in VENDORS. ` +
        `Add it to comparison-data.ts first, with a cell for every row.`,
    );
  }
  if (input.theirStrengths.length === 0) {
    throw new Error(
      `defineComparison(${input.slug}): theirStrengths is empty. A comparison page that ` +
        `cannot name one thing ${input.competitor} does better is an advertisement.`,
    );
  }
  return { ...input, path: `/${input.slug}`, vendorIndex };
}
