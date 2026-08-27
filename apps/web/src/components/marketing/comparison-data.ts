/**
 * Competitor facts, verified against each vendor's own public pages.
 *
 * Rules this file follows, because a comparison table is the easiest place on
 * a marketing site to tell a lie by accident:
 *
 *  1. Every cell is either something the vendor publishes, or a `note` saying
 *     we could not confirm it. There is no inference dressed as a fact.
 *  2. Where a competitor genuinely matches us, the table says so. Jotform's AI
 *     Agents really do hold a conversation and really do answer from a
 *     knowledge base — pretending otherwise would be the fastest way to lose
 *     someone who has used both.
 *  3. Typeform's chat product is Formless, sold separately; comparing our chat
 *     surface to typeform.com would be comparing against the wrong product, so
 *     the Typeform column says which product each answer refers to.
 *
 * Re-check before any redesign. Prices move.
 */

export const VERIFIED_ON = "August 2026";

export type Cell = true | false | { partial: string } | { unknown: string } | string;

export interface ComparisonRow {
  label: string;
  hint?: string;
  cells: readonly Cell[];
}

/** Column order. `chatform` is always first. */
export const VENDORS = [
  "chatform",
  "Typeform",
  "Youform",
  "Tally",
  "Jotform",
  "Fillout",
  "Google Forms",
] as const;

export const ROWS: readonly ComparisonRow[] = [
  {
    label: "Answered as a conversation",
    hint: "An AI that asks, listens and adapts — not one static field per screen.",
    cells: [
      true,
      { partial: "Formless, a separate product from $59/mo" },
      false,
      false,
      true,
      { unknown: "Not documented" },
      false,
    ],
  },
  {
    label: "Answers the respondent's questions",
    hint: "From a knowledge base you write, mid-form, without losing its place.",
    cells: [
      true,
      { partial: "Formless only" },
      false,
      false,
      true,
      { unknown: "Not documented" },
      false,
    ],
  },
  {
    label: "Documented headless conversation API",
    hint: "Drive the interview from your own backend, not just read submissions.",
    cells: [true, false, false, false, { unknown: "Not documented" }, false, false],
  },
  {
    label: "Respondent identity verification",
    hint: "Google sign-in or an SMS code, gating who may answer.",
    cells: [
      "Google + SMS",
      { unknown: "Not listed" },
      "Email + SMS",
      false,
      { unknown: "Not listed" },
      "Email + SSO",
      "Google account",
    ],
  },
  {
    label: "Free responses per month",
    cells: [
      "Unlimited*",
      "10",
      "Unlimited",
      "Unlimited",
      "100",
      "1,000",
      "Unlimited",
    ],
  },
  {
    label: "Free AI conversations per month",
    cells: ["200", false, false, false, "100", false, false],
  },
  {
    label: "Cheapest paid plan",
    hint: "Billed yearly, per month, in USD.",
    cells: ["$16", "$25", "$20", "~$20", "$34", "$15", "$7 per user"],
  },
];

export const FOOTNOTES: readonly string[] = [
  `Competitor pricing and capabilities were read from each vendor's own public pricing, features and documentation pages in ${VERIFIED_ON}. Prices are the annual-billed per-month figure in USD. Tally and Fillout do not print a monthly-equivalent annual price; those are derived from the annual total.`,
  "Typeform's conversational AI product is Formless, sold separately from typeform.com plans and starting at $59/mo for 250 AI conversations. typeform.com itself offers AI follow-ups on an open-text answer, not a conversational interview.",
  "Jotform's AI Agents are a genuine conversational form-filler with a trainable knowledge base, available from its free tier. It is the closest thing to this product on the list.",
  "“Not documented” means we could not find the capability on the vendor's public pages — not that it is confirmed absent.",
  "* Unlimited means no per-plan quota, subject to a fair-use ceiling of 5,000 responses a month on Free.",
];
