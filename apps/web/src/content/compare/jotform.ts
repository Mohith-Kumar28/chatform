import { defineComparison } from "./define";

export default defineComparison({
  slug: "jotform-alternative",
  competitor: "Jotform",
  vendor: "Jotform",
  title: "Free Jotform Alternative: Conversational Forms · chatform",
  description:
    "A Jotform alternative with conversational forms: no monthly response cap on the free plan, AI follow-ups on thin answers, Pro at $16/mo. Where Jotform wins.",
  h1: "A Jotform alternative with far less surface, and better answers.",
  lede:
    "Jotform is the biggest form platform there is. This is the smaller one, built around a single idea it does better.",

  whoShouldStay:
    "Stay on Jotform if breadth is the point. HIPAA workflows, PDF generation and editing, tables, apps, approvals, 40-plus payment gateways, tens of thousands of templates — chatform has none of that and is not trying to. Jotform's AI Agents are also a genuine conversational form-filler with a trainable knowledge base, available from its free tier, and it is the closest thing to this product on the market. If you are already inside Jotform's ecosystem, the case for moving is narrow.",

  theirStrengths: [
    "AI Agents are a real conversational form-filler with a knowledge base, and they start on the free plan.",
    "Enormously more product: PDFs, tables, apps, approvals, e-sign, HIPAA.",
    "Over 40 payment gateways with actual payment processing — chatform never touches the money.",
    "Tens of thousands of templates and a very large integration catalogue.",
  ],

  ourStrengths: [
    {
      title: "No response cliff on the free plan",
      body:
        "Jotform's free Starter plan allows 5 active forms and 100 submissions a month. chatform's free plan has no per-plan response quota and no form cap worth hitting — 100 forms, and a fair-use ceiling of 10,000 responses a month.",
    },
    {
      title: "A documented headless conversation API",
      body:
        "Open a session, stream the turns over SSE, and render the conversation inside your own product. Scoped keys, an OpenAPI spec you can generate a client from, and two published SDKs. This is the thing Jotform does not publish.",
    },
    {
      title: "Logic that cannot ship broken",
      body:
        "Nineteen operators, nested and/or groups, variables and scoring — and a linter that walks every path before publish. An unreachable question or a branch that dead-ends is a publish-time error, not a support ticket.",
    },
    {
      title: "The whole conversation, next to the row",
      body:
        "Every response keeps its transcript. You read what you asked, what they said, and what got recorded, side by side — rather than a spreadsheet row with the reasoning thrown away.",
    },
    {
      title: "It chases the people who left",
      body:
        "Jotform can show you incomplete submissions once Save & Continue Later is on, and you can resend somebody the link to their draft by hand. There is no timed sequence. chatform sends up to three reminders on a widening gap, each re-checked when it comes due and dropped if they finished or opted out, with a link that reopens the conversation on the exact question they stopped on. It will also hold a share of abandoners out of the sequence entirely, which is the only way to know the reminders did anything.",
    },
  ],

  extraRows: [
    {
      label: "Payment processing",
      hint: "Taking the money, as opposed to showing where to pay.",
      us: { partial: "Shows your payment link or UPI QR — never in the flow of funds" },
      them: "40+ gateways",
    },
    { label: "PDF generation, tables, approvals, e-sign", us: false, them: true },
    { label: "HIPAA", us: false, them: "Gold and Enterprise" },
  ],

  byline: { author: "Mohith Kumar", checkedOn: "September 2026" },

  atAGlance: [
    { label: "Free plan", us: "100 forms, unlimited responses (fair use 10,000/mo)", them: "5 forms, 100 submissions a month" },
    { label: "Entry plan, billed yearly", us: "$16/mo, no response quota", them: "$34/mo (Bronze), 1,000 submissions a month" },
    { label: "AI conversations", us: "200 free, 2,000 on Pro", them: "AI Agents: 100 free, 1,000 on Bronze" },
    { label: "Team members", us: "3 on Pro, 5 on Business", them: "1 on every plan below Enterprise" },
  ],

  whyLeave: [
    {
      title: "Five forms on the free plan",
      body: "Jotform's free Starter plan allows 5 forms, 100 submissions a month and 10,000 form views. Run a few forms at once and you are paying.",
    },
    {
      title: "The price climbs with submissions",
      body: "Billed yearly, Bronze is $34 a month for 1,000 submissions, Silver $39 for 2,500 and Gold $99 for 10,000. The bill follows your volume.",
    },
    {
      title: "One user until Enterprise",
      body: "Every plan below Enterprise is single-user, so a team shares a login or pays for Enterprise. chatform Pro includes 3 members and Business 5.",
    },
    {
      title: "HIPAA starts at Gold",
      body: "HIPAA features begin on Gold at $99 a month billed yearly. If that is why you are looking, chatform will not help — it has no HIPAA offering at all.",
    },
  ],

  switching: [
    {
      title: "Rebuild it from a sentence or a link",
      body: "There is no Jotform importer. Describe the form, or paste the URL of the page it sits on, and chatform drafts the questions, wording and branching (10 drafts a month free, 200 on Pro).",
    },
    {
      title: "Decide what happens to payments and PDFs",
      body: "chatform can show your existing checkout link or a UPI QR mid-conversation, but it does not process payments, generate PDFs or collect e-signatures. Forms that depend on those should stay on Jotform.",
    },
    {
      title: "Point your data where it went before",
      body: "A spreadsheet feed you pull into Google Sheets or Excel, signed webhooks, and the REST API. No connector catalogue — anything you clicked together in Jotform is wired with a webhook here.",
    },
    {
      title: "Swap the embed",
      body: "One script tag — inline, popup, side tab or full page — or a link and a QR code. Old Jotform links need replacing wherever they are posted.",
    },
  ],

  otherAlternatives: [
    { name: "Tally", href: "/tally-alternative", body: "Free and unlimited, with the fastest editor in the category, for forms that do not need a conversation." },
    { name: "Fillout", href: "/fillout-alternative", body: "Cheapest paid tier and deep Airtable and Notion integrations, with payments and PDFs built in." },
    { name: "Typeform", href: "/typeform-alternative", body: "The best-looking one-question-per-screen forms; conversational AI is Formless, sold separately." },
    { name: "Google Forms", href: "/google-forms-alternative", body: "Free, unlimited and native to Google Sheets, when the questions need no interpreting." },
  ],

  pricing: [
    { label: "Free plan", us: "100 forms, unlimited responses", them: "5 forms, 100 submissions a month" },
    { label: "Most affordable plan, billed yearly", us: "$16/mo", them: "$34/mo (Bronze)" },
    { label: "Most affordable plan, billed monthly", us: "$24/mo", them: "$39/mo (Bronze)" },
  ],

  faq: [
    {
      question: "Is there a Jotform alternative with no submission limits?",
      answer:
        "chatform has no per-plan response quota on any plan, including free, subject to a fair-use ceiling (10,000 a month on Free, 50,000 on paid plans). Jotform caps submissions on every plan below Enterprise: 100 a month free, 1,000 on Bronze, 2,500 on Silver and 10,000 on Gold.",
    },
    {
      question: "Can I import my Jotform forms?",
      answer:
        "Not directly — there is no importer. Describe the form in a sentence or paste the URL of the page it lives on, and chatform drafts the questions, wording and branching for you to edit. Payments, PDFs and e-signatures do not carry over, because chatform does not do them.",
    },
    {
      question: "Which Jotform alternative is best for teams?",
      answer:
        "It depends what the team needs. Jotform is single-user on every plan below Enterprise. chatform Pro includes 3 team members and Business 5, with roles, for $16 and $55 a month billed yearly. If the team mainly lives in Airtable or Notion, Fillout is worth a look too.",
    },
    {
      question: "Is chatform more affordable than Jotform?",
      answer:
        "On the plans most people buy, yes. Jotform's entry paid plan is $34 a month billed yearly and allows 25 forms and 1,000 submissions a month. chatform Pro is $16 a month billed yearly with no per-plan response quota. The free plans are further apart still: Jotform allows 5 forms and 100 submissions, chatform allows 100 forms and unlimited responses under a fair-use ceiling.",
    },
    {
      question: "Can chatform take payments like Jotform?",
      answer:
        "No, and this is the clearest gap between them. Jotform integrates with more than 40 payment gateways and actually processes the payment. chatform shows the respondent your existing checkout link or a UPI QR code mid-conversation and records that they said they paid. We are never in the flow of funds, so there is no gateway to verify against. If you need payment taken and confirmed inside the form, use Jotform.",
    },
    {
      question: "How is chatform different from Jotform AI Agents?",
      answer:
        "They are genuinely similar, and Jotform AI Agents is the closest competitor this product has. The differences are the headless conversation API — chatform publishes one and Jotform does not — the publish-time linter that refuses a form with an unreachable path, and the free plan's response allowance. Jotform is far ahead on everything outside the conversation itself.",
    },
    {
      question: "Is chatform HIPAA compliant?",
      answer:
        "No. There is no HIPAA offering, no BAA, and no SOC 2 report. Forms are protected with passwords, Turnstile captcha, an embed origin allowlist and optional respondent verification by Google or SMS — but if you handle protected health information, Jotform's Gold and Enterprise plans are the right answer and this is not.",
    },
  ],

  sources: [{ label: "Jotform pricing", url: "https://www.jotform.com/pricing/", checkedOn: "September 2026" }],

  updates: [
    {
      date: "18 September 2026",
      note: "Read Jotform's pricing page again for the new sections: Starter 5 forms, 100 submissions and 10,000 views a month; Bronze $34, Silver $39, Gold $99 a month billed yearly (1,000 / 2,500 / 10,000 submissions); all single-user below Enterprise; HIPAA from Gold; AI Agents 100 / 1,000 / 2,500 / 10,000 conversations.",
    },
    {
      date: "September 2026",
      note: "Re-read Jotform's pricing: Starter is still 5 forms and 100 submissions a month, Bronze is still $39/mo monthly and $34/mo billed yearly.",
    },
  ],
});
