/**
 * The two transcripts the landing page replays.
 *
 * Both are recordings of behaviour that is actually shipped — the free-text
 * extraction in the hero ("about a dozen" -> 12) and the knowledge-base
 * interjection in `moment` are the two verified end-to-end results logged in
 * REBUILD.md Phase 6. Nothing here describes a capability the agent does not
 * have; if the agent changes, these change with it.
 */

export interface DemoTurn {
  role: "bot" | "user" | "note";
  text: string;
  /** Quick-reply chips offered under a bot message. */
  chips?: readonly string[];
  /** Which chip this user turn picked, so the row can show the choice. */
  picked?: string;
  /** Pause before this turn lands, in ms. */
  waitMs?: number;
}

export const HERO_SCRIPT: readonly DemoTurn[] = [
  {
    role: "bot",
    text: "Hey! I'm Ada — I help new teams get set up at Northwind. 👋 What should I call you?",
  },
  { role: "user", text: "Maya", waitMs: 900 },
  {
    role: "bot",
    text: "Good to meet you, Maya. How many people are you setting this up for?",
    waitMs: 500,
  },
  { role: "user", text: "we're about a dozen people right now", waitMs: 1400 },
  { role: "note", text: "Team size recorded as 12", waitMs: 300 },
  {
    role: "bot",
    text: "Twelve — noted. And what brings you to Northwind?",
    waitMs: 400,
    chips: ["Replacing a tool", "Starting fresh", "Just looking"],
  },
  { role: "user", text: "Replacing a tool", picked: "Replacing a tool", waitMs: 1200 },
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
