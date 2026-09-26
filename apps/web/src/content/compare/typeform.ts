import { defineComparison } from "./define";

export default defineComparison({
  slug: "typeform-alternative",
  competitor: "Typeform",
  vendor: "Typeform",
  /* The exact query first, "free" for the price-motivated searcher, the
     category second — see docs/KEYWORD-RESEARCH.md. */
  title: "Free Typeform Alternative: Conversational Forms · chatform",
  description:
    "A Typeform alternative with conversational forms: unlimited free responses, AI follow-ups on vague answers, from $16/mo. And where Typeform still wins.",
  h1: "A Typeform alternative that talks back.",
  lede:
    "Typeform made forms beautiful. This one makes them finish — by reading what people write and letting them ask you something back.",

  whoShouldStay:
    "Stay on Typeform if your form is a designed artefact more than a conversation: full-bleed imagery, video questions, a brand team with opinions about kerning. Stay if you depend on its integration catalogue — Typeform connects to hundreds of tools and chatform has one integration, a spreadsheet feed, plus webhooks and an API you have to wire yourself. And stay if you have already bought Growth Flow or the enrichment features; nothing here replaces those.",

  theirStrengths: [
    "A far larger integration catalogue — chatform ships one native integration and expects you to use webhooks or the API for the rest.",
    "Video questions and answers, which chatform does not have at all.",
    "A template gallery in the thousands, against a few dozen here.",
    "Fifteen years of brand recognition, which matters when you are the one sending the link.",
  ],

  ourStrengths: [
    {
      title: "It reads the answer, not just stores it",
      body:
        "Typeform shows a field per screen and records whatever lands in it. chatform reads what the person actually wrote and asks again when it is too thin to use — so \"n/a\" turns into an answer instead of a row you throw away. Choice and scale answers are matched exactly and never sent to a model; only free text is interpreted, and a low-confidence read becomes a follow-up rather than a guess.",
    },
    {
      title: "It answers questions back",
      body:
        "Give it your documents, pages or notes (3 knowledge sources on Free, up to 50 on Pro) and it quotes you, mid-form, without losing its place in the flow. Typeform's own conversational product, Formless, does this — but Formless is sold separately, and starts at $59 a month for 250 AI conversations. chatform Pro is $16 a month billed yearly and includes 2,000.",
    },
    {
      title: "Unlimited responses on the free plan",
      body:
        "Typeform's free tier stops at 10 responses a month. chatform's free plan has no per-plan response quota at all, subject to a fair-use ceiling of 10,000 a month, across up to 100 forms.",
    },
    {
      title: "A documented headless API",
      body:
        "Open a session, stream the turns, drive the whole conversation from your own backend and render it in your own interface. There is a published OpenAPI spec and two SDKs. Typeform's API reads and writes submissions; it does not hand you the conversation.",
    },
    {
      title: "It chases the people who left",
      body:
        "Somebody who stops halfway is the most recoverable lead a form produces, and Typeform's answer is one automation on a partial-submit trigger, on the Contacts & Automations add-on — which its own community notes also mails people who go on to finish. chatform sends up to three, four hours then a day then three days apart, and re-checks each one at the moment it is due: if they finished, if the form closed, if they opted out, it is dropped. Then it will hold a slice of abandoners back and send them nothing, so the recovery number you read is the reminders' work and not the people who were coming back anyway.",
    },
  ],

  extraRows: [
    {
      label: "Video questions",
      hint: "Recording a question to camera, or asking for a video answer.",
      us: false,
      them: true,
    },
    {
      label: "Native integrations",
      hint: "Connectors you click, rather than a webhook you wire.",
      us: { partial: "Spreadsheet feed, webhooks, REST API" },
      them: "Hundreds",
    },
  ],

  byline: { author: "Mohith Kumar", checkedOn: "September 2026" },

  atAGlance: [
    { label: "Free plan", us: "Unlimited responses (fair use 10,000/mo), 200 AI conversations", them: "10 responses a month" },
    { label: "Entry plan, billed yearly", us: "$16/mo", them: "$25/mo (Basic)" },
    { label: "Answered as a conversation", us: "Every plan, free included", them: "Formless, sold separately from $59/mo" },
    { label: "Someone leaves halfway", us: "Up to 3 reminders, worded differently (Pro)", them: "One automation on a partial submit, paid add-on" },
  ],

  whyLeave: [
    {
      title: "Ten responses a month",
      body: "Typeform's free plan stops at 10 responses a month, which is a demo rather than a plan. Anything real means paying from the first week.",
    },
    {
      title: "$25 a month to start",
      body: "The entry paid plan, Basic, is $25 a month billed yearly — before you have decided whether the form is worth it.",
    },
    {
      title: "The conversation costs extra",
      body: "The AI that holds a conversation and answers questions is Formless, a separate product from $59 a month for 250 AI conversations. typeform.com itself shows one field per screen, with AI follow-ups on open-text answers.",
    },
    {
      title: "Nothing chases the half-finished ones",
      body: "Following up with people who left partway is one automation on a partial-submit trigger, on a paid add-on. There is no timed sequence of reminders.",
    },
  ],

  switching: [
    {
      title: "Rebuild it from a sentence or a link",
      body: "There is no Typeform importer. Describe the form in a sentence, or paste the URL of the page it lives on, and chatform drafts the questions, wording and branching (10 drafts a month free, 200 on Pro). Under about thirty questions, that is faster than an import.",
    },
    {
      title: "Check the branches before it goes live",
      body: "Every path is linted when you publish, so a branch that dead-ends or a question nobody can reach is caught before a respondent finds it.",
    },
    {
      title: "Point your data where it went before",
      body: "Responses go out through a spreadsheet feed you pull into Google Sheets or Excel, signed webhooks, or the REST API. There is no one-click connector catalogue — if you relied on Typeform's, that is the part you will rebuild.",
    },
    {
      title: "Swap the embed",
      body: "One script tag, inline, as a popup, a side tab or full page — or share the link and a QR code. Existing Typeform links will need replacing wherever they are posted.",
    },
  ],

  otherAlternatives: [
    { name: "Tally", href: "/tally-alternative", body: "The best free form builder: unlimited responses, the fastest editor, no AI follow-ups." },
    { name: "Youform", href: "/youform-alternative", body: "The closest copy of Typeform's format, for less: unlimited free responses, Pro from $20/mo yearly." },
    { name: "Fillout", href: "/fillout-alternative", body: "The cheapest paid tier ($15/mo yearly) and the deepest Airtable and Notion integrations." },
    { name: "Jotform", href: "/jotform-alternative", body: "Its AI Agents also hold a conversation, inside a far broader product with payments and PDFs." },
    { name: "Formbricks", body: "The open-source pick: AGPLv3, free to self-host, with a free cloud plan of 250 responses a month." },
  ],

  roundup: { href: "/blog/typeform-alternatives", label: "Typeform alternatives compared, all seven in one table →" },

  pricing: [
    { label: "Free plan", us: "Unlimited responses, 200 AI conversations", them: "10 responses a month" },
    { label: "Most affordable plan, billed yearly", us: "$16/mo", them: "$25/mo (Basic)" },
    {
      label: "Conversational AI",
      us: "Included on every plan, free one too",
      them: "Formless, sold separately",
      note: "Formless Pro is $59/mo for 250 AI conversations.",
    },
  ],

  faq: [
    {
      question: "Is there a free Typeform alternative?",
      answer:
        "Several. chatform's free plan has unlimited responses (fair-use ceiling of 10,000 a month) across up to 100 forms, with 200 AI conversations a month. Tally and Youform are free and unlimited as well, without AI follow-ups, and Google Forms is free with any Google account. Typeform's own free plan stops at 10 responses a month.",
    },
    {
      question: "Is there an open-source Typeform alternative?",
      answer:
        "Yes: Formbricks. Its core is licensed AGPLv3 and free to self-host with Docker, and its cloud has a free plan of 250 responses a month. chatform is not open source, so if self-hosting is a requirement, Formbricks is the one to look at.",
    },
    {
      question: "Is chatform really free?",
      answer:
        "Yes. Unlimited responses on the free plan, subject to a fair-use ceiling of 10,000 a month, across up to 100 forms, plus 200 AI-run conversations a month. No card, no trial clock. Paid plans start at $16 a month billed yearly, and they buy brand control, partial-response export, the API and a bigger AI allowance — not the right to collect answers.",
    },
    {
      question: "How does chatform compare to Typeform on pricing?",
      answer:
        "Typeform's free plan allows 10 responses a month and its entry paid plan is $25 a month billed yearly. chatform's free plan has no response quota and its entry paid plan is $16 a month billed yearly. The larger gap is on conversational AI: Typeform's conversational product, Formless, starts at $59 a month for 250 AI conversations, while chatform includes 200 on the free plan and 2,000 on Pro.",
    },
    {
      question: "Can I import my existing Typeform?",
      answer:
        "Not directly — there is no Typeform importer. What there is instead: describe the form in a sentence and the AI writes it, or paste the URL of the page the form lives on and it reads that to draft the questions in your own vocabulary. In practice that is faster than a field-by-field import for anything under about thirty questions.",
    },
    {
      question: "Does chatform support conditional logic like Typeform?",
      answer:
        "Yes, and further. Nineteen condition operators, nested and/or groups, variables and scoring, jumps to a block or to a specific ending, and per-question visibility rules. A linter walks every path before you can publish, so a branch that dead-ends is caught at publish time rather than by a respondent.",
    },
    {
      question: "What does chatform not do that Typeform does?",
      answer:
        "Video questions and answers, a template gallery in the thousands, and a large catalogue of one-click integrations. chatform has one native integration — a spreadsheet feed you pull from Google Sheets or Excel — plus signed webhooks and a REST API. If your workflow depends on clicking a connector rather than wiring one, Typeform is the better fit today.",
    },
  ],

  sources: [
    { label: "Typeform pricing", url: "https://www.typeform.com/pricing/", checkedOn: "September 2026" },
    { label: "Formless pricing", url: "https://formless.ai/pricing", checkedOn: "September 2026" },
    { label: "Formbricks pricing", url: "https://formbricks.com/pricing", checkedOn: "September 2026" },
    { label: "Formbricks licence (GitHub)", url: "https://github.com/formbricks/formbricks", checkedOn: "September 2026" },
  ],

  updates: [
    {
      date: "September 2026",
      note: "Re-read Typeform's pricing page: Basic is still $25/mo billed yearly and the free tier is still 10 responses a month. Formless no longer appears anywhere on typeform.com/pricing, but formless.ai is live and Pro is still $59/mo for 250 AI conversations.",
    },
  ],
});
