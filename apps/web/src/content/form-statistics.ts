/**
 * The form statistics everyone repeats, each followed back to where it came
 * from.
 *
 * This is `research.ts`'s rule turned outward. That file keeps the numbers the
 * site itself is allowed to use; this one audits the numbers the category
 * uses, hop by hop, and says what each original source actually measured.
 * Traced in September 2026. Every `url` is the original, not a blog quoting it,
 * except where the original is dead — and then the entry says so.
 *
 * `verdict` is deliberately four-valued. "True/false" would flatten the most
 * common case, which is a real study that measured something narrower, older
 * or smaller than the sentence now attributed to it.
 */

export type Verdict = "holds up" | "real, but narrower" | "outdated" | "no source found";

export interface TracedStatistic {
  id: string;
  /** The claim as it circulates, in its most common wording. */
  claim: string;
  verdict: Verdict;
  /** One sentence: what is actually true, liftable on its own. */
  summary: string;
  /** What the original says, quoted briefly. */
  quote?: string;
  source?: { publisher: string; title: string; year: number; url: string };
  /** Sample and method, as stated by the source. */
  method?: string;
  /** Why the verdict is what it is. */
  note: string;
}

export const TRACED_STATISTICS: readonly TracedStatistic[] = [
  {
    id: "conversational-40",
    claim: "Conversational forms have a 40% higher completion rate than traditional forms.",
    verdict: "no source found",
    summary:
      "We could not find any study behind the 40% figure; the chains we followed end at vendor blog posts that cite each other or cite nothing.",
    note:
      "Versions of it say 25–40%, 30% or \"up to 40%\". One widely copied post credits it to Formstack's form report, but that report contains no such number. The closest real figure is Typeform's own platform average, below — which is first-party and compared against an unsourced baseline.",
  },
  {
    id: "typeform-47",
    claim: "Typeform's forms average a 47.3% completion rate, against an industry average of 21.5%.",
    verdict: "real, but narrower",
    summary:
      "The 47.3% is Typeform's own figure for its own platform in 2023; the 21.5% \"industry average\" it is compared with is given no source or method.",
    quote:
      "an average form completion rate of 47.3%, more than 25 percentage points higher than the industry average completion rate of 21.5%",
    source: {
      publisher: "Typeform (press release via PR Newswire)",
      title: "New Typeform report reveals how marketers can drive higher form completion rates",
      year: 2024,
      url: "https://www.prnewswire.com/news-releases/new-typeform-report-reveals-how-marketers-can-drive-higher-form-completion-rates-302041979.html",
    },
    method: "Over 2.6 million forms published on Typeform in 2023 and 568 million submissions.",
    note:
      "A vendor measuring its own product against a baseline it does not cite. The release also does not define \"completion rate\", so the two numbers may not even measure the same thing.",
  },
  {
    id: "multistep",
    claim: "Multi-step forms convert 86% better — multi-page forms convert at 13.85% against 4.53% for single-page.",
    verdict: "real, but narrower",
    summary:
      "These are two different sources merged into one claim: an observational 2015 Formstack report, and a 2019 HubSpot survey of 173 marketers' self-reported rates.",
    quote: "Single Page: 4.53% / Multi-Page: 13.85%",
    source: {
      publisher: "Formstack",
      title: "The 2015 Form Conversion Report",
      year: 2015,
      url: "https://assets-global.website-files.com/5eff9c5e4dba181f8aa2d1e0/5f3970fe6c68f2c8481aebf3_Formstack_Form_Conversion_Report_2015__1_.pdf",
    },
    method:
      "Formstack: data from more than 650,000 anonymised form users, comparing different forms rather than testing one form both ways. HubSpot's \"86% higher\": a survey of 173 marketers, fielded in 2019.",
    note:
      "Neither is an experiment. Formstack compared forms that were different in many ways besides page count, eleven years ago; HubSpot's number is what marketers said their conversion rates were, not what was measured.",
  },
  {
    id: "hubspot-4-to-3",
    claim: "HubSpot found that cutting form fields from 4 to 3 increased conversions by 50%.",
    verdict: "real, but narrower",
    summary:
      "HubSpot's analysis was a correlation across 40,000+ landing pages, and its author described the effect of more fields as a slight decrease — nobody removed a field.",
    quote:
      "as the number of form fields increases, conversion rates decrease slightly, but not as steeply as I expected",
    source: {
      publisher: "HubSpot (Dan Zarrella)",
      title: "Which types of form fields lower landing page conversions?",
      year: 2010,
      url: "https://blog.hubspot.com/blog/tabid/6307/bid/6746/which-types-of-form-fields-lower-landing-page-conversions.aspx",
    },
    method: "Cross-sectional analysis of more than 40,000 HubSpot customer landing pages.",
    note:
      "The \"50%\" arrived later, through a blog summary (\"increased by almost half\") and then a 2013 infographic. It reads a chart from an observational study as if it were an A/B test.",
  },
  {
    id: "inline-validation",
    claim: "Inline validation reduces form abandonment by 22% and cuts completion time by 42%.",
    verdict: "real, but narrower",
    summary:
      "The study was a 22-person lab usability test, and it measured success rate and errors — it never mentions abandonment.",
    quote:
      "a 22% increase in success rates, a 22% decrease in errors made, a 31% increase in satisfaction rating, a 42% decrease in completion times",
    source: {
      publisher: "A List Apart (Luke Wroblewski)",
      title: "Inline Validation in Web Forms",
      year: 2009,
      url: "https://alistapart.com/article/inline-validation-in-web-forms/",
    },
    method: "Eye-tracking usability test run by Etre in London with 22 participants.",
    note:
      "A careful, useful study — of how people fill in a form in a lab. \"Abandonment\" was added in retelling.",
  },
  {
    id: "manifest-81",
    claim: "81% of people have abandoned a form after starting to fill it out.",
    verdict: "real, but narrower",
    summary:
      "A 2018 self-reported survey found 81% of people had recently abandoned at least one online form; it did not measure abandonment of any particular form.",
    quote: "81% of people recently abandoned at least one online form",
    source: {
      publisher: "The Manifest (press release via PR Newswire)",
      title: "Most people don't finish online forms, citing security concerns and form length",
      year: 2018,
      url: "https://www.prnewswire.com/news-releases/most-people-dont-finish-online-forms-citing-security-concerns-and-form-length-300631039.html",
    },
    method: "An online survey of consumers; the release itself does not state the sample size.",
    note:
      "Having abandoned one form, ever recently, is a very different thing from 81% of your visitors leaving. The same survey found security concerns (29%) cited more often than length (27%).",
  },
  {
    id: "expedia-12m",
    claim: "Expedia removed one form field and gained $12 million a year.",
    verdict: "real, but narrower",
    summary:
      "It is an executive's anecdote from a 2010 interview, and the field was confusing rather than extra: people typed their bank's name into \"Company\", which then failed address checks.",
    quote:
      "deleted that field – overnight there was a step function [change], resulting in $12m of profit a year",
    source: {
      publisher: "Silicon.com (quoted by Usability Counts; the original is offline)",
      title: "Expedia on how one extra data field can cost $12m",
      year: 2010,
      url: "https://www.usabilitycounts.com/2010/11/29/silicon-com-expedia-on-how-one-extra-data-field-can-cost-12-million/",
    },
    note:
      "No data or method was published. The lesson it actually supports is about an ambiguous optional field breaking a payment step — not that shorter forms earn millions.",
  },
  {
    id: "imagescape-120",
    claim: "Reducing a form from 11 fields to 4 increased conversions by 120%.",
    verdict: "real, but narrower",
    summary:
      "It was a before-and-after comparison of one contact form over two periods, and the whole effect rests on 16 extra submissions.",
    quote: "Contact form conversions increased 120% when the number of fields was reduced from 11 to 4",
    source: {
      publisher: "Imaginary Landscape",
      title: "Form case study",
      year: 2008,
      url: "https://www.imagescape.com/media/filer_public/06/94/0694c7f4-8914-4598-8871-b857fbc12737/form_case_study.pdf",
    },
    method:
      "October–November 2007 against April–May 2008; 184 and 219 form views; submissions went from 10 to 26.",
    note: "Not an A/B test, and small enough that a handful of submissions either way changes the headline.",
  },
  {
    id: "baymard-22",
    claim: "22% of shoppers abandon a checkout because it is too long or complicated.",
    verdict: "outdated",
    summary:
      "Baymard's current survey puts it at 17% of US online shoppers, among those who were not just browsing; 22% is the previous round.",
    quote:
      "17% of US online shoppers have abandoned an order due to a 'too long / complicated checkout process'",
    source: {
      publisher: "Baymard Institute",
      title: "Cart Abandonment Rate Statistics (last updated 22 September 2025)",
      year: 2025,
      url: "https://baymard.com/lists/cart-abandonment-rate",
    },
    method: "Survey of US online shoppers' reasons for abandoning an order, excluding those only browsing.",
    note:
      "Baymard is one of the few genuinely rigorous sources in this list — it just keeps updating, and the internet does not. Its average documented cart abandonment rate is 70.22%.",
  },
];

/**
 * The benchmark we would point to, with its method.
 *
 * Zuko is the only form benchmark we found that defines its stages and says
 * which data it excludes. Figures read September 2026.
 */
export const ZUKO_BENCHMARK = {
  url: "https://www.zuko.io/benchmarking/industry-benchmarking",
  viewToCompletion: { desktop: "37.2%", mobile: "31.3%" },
  starterToCompletion: { desktop: "55.5%", mobile: "47.5%" },
} as const;
