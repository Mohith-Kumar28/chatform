import { defineComparison } from "./define";

export default defineComparison({
  slug: "jotform-alternative",
  competitor: "Jotform",
  vendor: "Jotform",
  title: "Jotform alternative — the honest comparison",
  description:
    "A Jotform alternative for teams who want the conversation, not the catalogue: unlimited free responses, a headless conversation API, and logic that is linted before publish. Prices read in September 2026.",
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
        "Jotform's free Starter plan allows 5 active forms and 100 submissions a month. chatform's free plan has no per-plan response quota and no form cap worth hitting — 100 forms, and a fair-use ceiling of 5,000 responses a month.",
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

  pricing: [
    { label: "Free plan", us: "100 forms, unlimited responses", them: "5 forms, 100 submissions a month" },
    { label: "Most affordable plan, billed yearly", us: "$16/mo", them: "$34/mo (Bronze)" },
    { label: "Most affordable plan, billed monthly", us: "$24/mo", them: "$39/mo (Bronze)" },
  ],

  faq: [
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
      date: "September 2026",
      note: "Re-read Jotform's pricing: Starter is still 5 forms and 100 submissions a month, Bronze is still $39/mo monthly and $34/mo billed yearly.",
    },
  ],
});
