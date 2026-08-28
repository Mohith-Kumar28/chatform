/**
 * The two transcripts the landing page replays.
 *
 * Both are recordings of behaviour that is actually shipped — the free-text
 * extraction in the hero ("about a dozen" -> 12) and the knowledge-base
 * interjection are the two verified end-to-end results logged in REBUILD.md
 * Phase 6. Nothing here describes a capability the agent does not have; if the
 * agent changes, these change with it.
 *
 * The hero script used to stop after three questions and start over, which
 * sold the greeting and nothing else. A form is not its first question — it is
 * the whole run: the free-text answer that gets read, the question asked back
 * mid-flow, the rating, the booking link, the file, the payment, and the
 * thank-you at the end. So the hero now plays a complete response, and every
 * affordance in it is a block type that exists in `BLOCK_LIBRARY`.
 */

/**
 * The in-thread controls a bot turn can offer.
 *
 * Each `kind` mirrors a real respondent affordance in `components/chat` —
 * `rating` the star composer, `scheduling` and `payment` the two hand-off
 * cards, `upload` the file control — so the demo stays a recording of the
 * product rather than a drawing of it.
 */
export type DemoCard =
  | { kind: "rating"; max: number; picked: number }
  | {
      kind: "scheduling";
      buttonLabel: string;
      provider: string;
      /** What the confirmed booking reads as once they pick a slot. */
      slot: string;
    }
  | { kind: "upload"; hint: string; fileName: string; fileSize: string }
  | {
      kind: "payment";
      amount: string;
      buttonLabel: string;
      method: string;
      /** Matched against the builder's statement, exactly as the real card does. */
      reference: string;
    };

export interface DemoTurn {
  role: "bot" | "user" | "note" | "end";
  /** The bubble's text, the note's line, or — for `end` — the thank-you title. */
  text: string;
  /** Quick-reply chips offered under a bot message. */
  chips?: readonly string[];
  /** Which chip this user turn picked, so the row can show the choice. */
  picked?: string;
  /** Which chips a multi-select user turn picked. */
  pickedAll?: readonly string[];
  /** A richer control under a bot message: rating, booking, upload, payment. */
  card?: DemoCard;
  /** `end` only: the line under the thank-you title. */
  body?: string;
  /** `end` only: the label on the closing button. */
  cta?: string;
  /** Pause before this turn lands, in ms. */
  waitMs?: number;
}

export const HERO_SCRIPT: readonly DemoTurn[] = [
  {
    role: "bot",
    text: "Hey! I'm Ada — I help new teams get set up at Northwind. 👋 What should I call you?",
  },
  { role: "user", text: "Maya", waitMs: 800 },
  {
    role: "bot",
    text: "Good to meet you, Maya. How many people are you setting this up for?",
    waitMs: 450,
  },
  { role: "user", text: "we're about a dozen right now", waitMs: 1200 },
  { role: "note", text: "Team size recorded as 12", waitMs: 250 },
  {
    role: "bot",
    text: "Twelve — noted. What brings you to Northwind?",
    waitMs: 400,
    chips: ["Replacing a tool", "Starting fresh", "Just looking"],
  },
  { role: "user", text: "Replacing a tool", picked: "Replacing a tool", waitMs: 1000 },
  {
    role: "bot",
    text: "Which of these matter most? Pick as many as you like.",
    waitMs: 450,
    chips: ["Speed", "Integrations", "Reporting", "Price"],
  },
  {
    role: "user",
    text: "Speed and integrations",
    pickedAll: ["Speed", "Integrations"],
    waitMs: 1100,
  },
  {
    role: "bot",
    text: "Fair. How would you rate the tool you're leaving?",
    waitMs: 450,
    card: { kind: "rating", max: 5, picked: 2 },
  },
  { role: "user", text: "2 out of 5", waitMs: 1200 },

  // The interjection. The respondent takes the wheel mid-form, and the agent
  // answers before handing it back — this is the whole pitch, played inline.
  { role: "user", text: "quick one before I go on — do you post to Slack?", waitMs: 1100 },
  {
    role: "bot",
    text: "We do. Every response can land in a Slack channel the second it comes in, and Zapier covers anything else.",
    waitMs: 700,
  },
  { role: "note", text: "Answered from your knowledge base", waitMs: 250 },

  {
    role: "bot",
    text: "Back to it — want twenty minutes with an onboarding lead?",
    waitMs: 500,
    card: {
      kind: "scheduling",
      buttonLabel: "Pick a time",
      provider: "cal.com/northwind/onboarding",
      slot: "Thu 4 Sep · 10:30 AM",
    },
  },
  { role: "user", text: "Booked", waitMs: 1500 },
  { role: "note", text: "Thu 4 Sep · 10:30 AM · added to both calendars", waitMs: 250 },

  {
    role: "bot",
    text: "Locked in. If you've got an export of your current fields, drop it here and I'll map them.",
    waitMs: 500,
    card: {
      kind: "upload",
      hint: "CSV, XLSX or JSON · up to 25 MB",
      fileName: "northwind-members.csv",
      fileSize: "24 KB",
    },
  },
  { role: "user", text: "northwind-members.csv", waitMs: 1500 },
  { role: "note", text: "14 columns read · 12 rows · all mappable", waitMs: 250 },

  {
    role: "bot",
    text: "Where should the invites go?",
    waitMs: 450,
  },
  { role: "user", text: "maya@northwind.co", waitMs: 1300 },

  {
    role: "bot",
    text: "Last step: twelve seats on Team is $288 for the year.",
    waitMs: 500,
    card: {
      kind: "payment",
      amount: "$288.00",
      buttonLabel: "Pay $288.00",
      method: "Stripe payment link",
      reference: "CF-7QK2",
    },
  },
  { role: "user", text: "Paid $288.00", waitMs: 1800 },
  { role: "note", text: "Reference CF-7QK2 recorded · matched to your invoice", waitMs: 250 },

  {
    role: "end",
    text: "You're all set, Maya.",
    body: "Twelve invites are on their way, and I'll see you Thursday at 10:30.",
    cta: "Open your workspace",
    waitMs: 700,
  },
];

export const MOMENT_SCRIPT: readonly DemoTurn[] = [
  {
    role: "bot",
    text: "Almost done. Where should I send your invite?",
  },
  { role: "user", text: "hold on — how much is Pro before I commit to anything?", waitMs: 1100 },
  {
    role: "bot",
    text: "Pro is $24 a month, or $192 a year — that works out to $16 a month. It covers 2,000 AI conversations, your own branding, and the partial responses people leave behind.\n\nAnyway — where should I send your invite?",
    waitMs: 700,
  },
  { role: "user", text: "maya@northwind.co", waitMs: 1400 },
  { role: "note", text: "Answered from your knowledge base · email recorded · 4 of 5", waitMs: 300 },
];
