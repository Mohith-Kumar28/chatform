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
    /*
     * Checked against each vendor's own help pages in September 2026, not
     * against the August sweep the rest of this table came from — hence its
     * own footnote with its own date.
     *
     * This row is the one place the table concedes something interesting:
     * Fillout ships real abandonment recovery, and their own guidance is that
     * such an email "should only ever be sent once". That is a defensible
     * position, not an absence, and writing it as `false` would be the kind of
     * quiet lie rule 1 exists to stop. Tally is a genuine `false` because
     * Tally publishes it — partial submissions, in their words, "won't trigger
     * email notifications".
     */
    label: "Follow-ups when someone abandons",
    hint: "Timed reminders to the respondent, linking back to the question they stopped on.",
    cells: [
      "Up to 3, widening gaps",
      { partial: "One automation on a partial-submit trigger; paid add-on" },
      { unknown: "Not documented" },
      false,
      { partial: "Resend the draft link by hand; no timed sequence" },
      { partial: "One email, ~30 min after abandonment" },
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
    /*
     * "Most affordable", never "cheapest".
     *
     * They point at the same number and they do not mean the same thing.
     * Cheap is a claim about what a thing is worth; affordable is a claim about
     * what it costs you — and this row sits directly under four rows about
     * capability, where inviting the reader to think "cheap" about the column
     * we want them to choose works against everything above it.
     */
    label: "Most affordable plan",
    hint: "Billed yearly, per month, in USD.",
    cells: [
      "$16",
      "$25",
      "$20",
      "~$20",
      "$34",
      "$15",
      { unknown: "Workspace, priced per user by region" },
    ],
  },
];

export const FOOTNOTES: readonly string[] = [
  `Competitor pricing and capabilities were read from each vendor's own public pricing, features and documentation pages in ${VERIFIED_ON}. Prices are the annual-billed per-month figure in USD. Tally and Fillout do not print a monthly-equivalent annual price; those are derived from the annual total.`,
  "Google Forms itself is free with any Google account; its paid tier is Google Workspace, which is billed per user and served in local currency at prices that differ by region. There is no single USD figure to put in that cell, so it does not carry one.",
  "Typeform's conversational AI product is Formless, sold separately from typeform.com plans and starting at $59/mo for 250 AI conversations. typeform.com itself offers AI follow-ups on an open-text answer, not a conversational interview.",
  "Jotform's AI Agents are a genuine conversational form-filler with a trainable knowledge base, available from its free tier. It is the closest thing to this product on the list.",
  "“Not documented” means we could not find the capability on the vendor's public pages — not that it is confirmed absent.",
  "* Unlimited means no per-plan quota, subject to a fair-use ceiling of 10,000 responses a month on Free.",
  "The abandonment follow-up row was checked separately in September 2026, against Typeform's partial-response and automation help pages, Tally's partial-submissions page (which states that partial submissions do not trigger email notifications), Jotform's incomplete-submission answers, and Fillout's form-abandonment help page. Fillout is the only competitor on this list with native timed recovery; their own guidance is to send it once. chatform sends at most three, and every one is re-checked at the moment it is due — dropped if the person finished, the form closed, or the address opted out in the meantime.",
];
