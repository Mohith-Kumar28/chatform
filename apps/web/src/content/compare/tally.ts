import { defineComparison } from "./define";

export default defineComparison({
  slug: "tally-alternative",
  competitor: "Tally",
  vendor: "Tally",
  title: "Tally alternative — when a free form stops being enough",
  description:
    "A Tally alternative for the forms where a one-word answer is a wasted response: AI that reads what people write, asks again when an answer is thin, and answers their questions back. Free plan compared honestly, prices read in September 2026.",
  h1: "A Tally alternative for when the answers have to be good.",
  lede:
    "Tally is the best free form builder there is. This is what to use when the thing you are collecting needs a conversation instead of a page.",

  whoShouldStay:
    "Stay on Tally for most things. It is genuinely free, genuinely unlimited, and the Notion-style editor is faster to type a form into than anything else in this category — including this. If your form is six fields and a submit button, a conversation adds nothing and Tally already does it better. Come here when the answers matter more than the fields: when a one-word reply is a failure, when people need to ask you something before they can answer, or when you want to read what someone meant rather than what fitted in the box.",

  theirStrengths: [
    "The fastest form editor in the category — you type on a page like Notion and blocks appear.",
    "A genuinely unlimited free plan with no AI meter to run out of.",
    "180 template pages and a much larger help centre.",
    "More native integrations, including Notion, Airtable, Google Sheets and Slack, where chatform has one.",
  ],

  ourStrengths: [
    {
      title: "A conversation, where Tally has a page",
      body:
        "Tally renders fields and waits for whatever people type. chatform reads what they wrote and asks again when it is too thin to use — so you get an answer instead of a shrug. Choice and scale answers are matched exactly and never sent to a model at all.",
    },
    {
      title: "It answers the respondent's questions",
      body:
        "Write up to twenty knowledge entries and it quotes you, mid-form, then carries on exactly where it was. The state machine still owns the flow, so nothing gets skipped or reordered while it is answering.",
    },
    {
      title: "Deeper logic, checked before you publish",
      body:
        "Nineteen operators, nested and/or groups, variables and scoring, and a linter that walks every path and refuses a form with a dead end in it.",
    },
    {
      title: "A conversation you can drive yourself",
      body:
        "Scoped API keys, a published OpenAPI spec, two SDKs, and a headless session API that streams the turns so you can render the interview in your own product.",
    },
  ],

  extraRows: [
    {
      label: "Editor speed for a plain form",
      hint: "Six fields and a submit button, from empty to published.",
      us: { partial: "Describe it and the AI drafts it" },
      them: "Type on the page, Notion-style",
    },
    {
      label: "Native integrations",
      us: { partial: "Spreadsheet feed, webhooks, REST API" },
      them: "Notion, Sheets, Airtable, Slack and more",
    },
  ],

  pricing: [
    { label: "Free plan", us: "Unlimited responses, 200 AI conversations", them: "Unlimited responses, no AI" },
    { label: "Most affordable plan, billed yearly", us: "$16/mo", them: "≈$20/mo (Pro)" },
    { label: "Most affordable plan, billed monthly", us: "$24/mo", them: "$24/mo (Pro)" },
  ],

  faq: [
    {
      question: "Is chatform free like Tally?",
      answer:
        "Close, with one honest difference. Both give you unlimited forms and unlimited responses at $0 — chatform's is subject to a fair-use ceiling of 5,000 responses a month. The difference is the AI: running an interview costs money, so the free plan includes 200 AI conversations a month. Past that the form keeps working and keeps collecting; it falls back to asking the questions as written instead of rephrasing them.",
    },
    {
      question: "What happens when I run out of AI conversations?",
      answer:
        "The form does not break and it does not stop collecting. It degrades: it stops rephrasing and asks each question exactly as you wrote it. Comprehension — reading what someone typed and turning it into a valid answer — is kept alive separately, because that is the part a respondent would actually notice losing.",
    },
    {
      question: "Should I switch from Tally to chatform?",
      answer:
        "Not for a contact form or an event RSVP — Tally does those well and free, and a conversation adds nothing. Switch the forms where the quality of the answer matters: qualification, intake, research, cancellation surveys, anything where a one-word reply is a wasted response and where people tend to have questions of their own before they can answer yours.",
    },
    {
      question: "Does chatform have conditional logic?",
      answer:
        "Yes. Nineteen operators, nested and/or condition groups, variables and scoring, jumps to a block or to a specific ending, and per-question visibility rules. Every path is linted before publish, so an unreachable question or a dead-end branch is caught before a respondent finds it.",
    },
  ],

  sources: [{ label: "Tally pricing", url: "https://tally.so/pricing", checkedOn: "September 2026" }],

  updates: [
    {
      date: "September 2026",
      note: "Tally Pro now prints $24/mo billed monthly, which is level with chatform Pro; billed yearly it works out around $20/mo against chatform's $16. The free plans remain the closest match in this comparison set.",
    },
  ],
});
