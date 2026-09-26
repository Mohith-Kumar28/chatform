import { defineComparison } from "./define";

export default defineComparison({
  slug: "fillout-alternative",
  competitor: "Fillout",
  vendor: "Fillout",
  title: "Fillout alternative — a form that asks the follow-up question",
  description:
    "A Fillout alternative for forms where the answer matters more than the field: AI that reads what people write, follows up when an answer is thin, and answers their questions back. Unlimited free responses. Prices read from Fillout's own pages in September 2026.",
  h1: "A Fillout alternative that reads the answers.",
  lede:
    "Fillout is a fast, well-connected form builder with the cheapest paid plan in the category. This is what to use when the form needs to hold a conversation instead.",

  whoShouldStay:
    "Stay on Fillout if your forms feed Airtable, Notion or a CRM and the integration is the point: its connectors go deeper than almost anyone's, and chatform has a spreadsheet feed, webhooks and an API. Stay if you need payment processing, scheduling, PDF generation or e-signatures inside the form; chatform can show a payment link or UPI QR mid-conversation, but it does not process payments or do the rest. And its $15-a-month Starter plan, billed yearly, is a little cheaper than ours. Come here when a one-word answer is a failure — intake, qualification, applications, feedback — and you want the form to ask what the person meant.",

  theirStrengths: [
    "Deep native integrations with Airtable, Notion, HubSpot and Salesforce — chatform has a spreadsheet feed, webhooks and a REST API.",
    "Payment processing, scheduling, PDF generation and signatures built into the form.",
    "The cheapest paid tier in this comparison set: Starter at $15 a month, billed yearly.",
    "A thousand responses a month free, with unlimited forms and seats.",
  ],

  ourStrengths: [
    {
      title: "It asks again when an answer is thin",
      body:
        "Fillout collects whatever lands in the field. chatform reads the free-text answers and asks a follow-up when one is too vague to use, then records the reply as the answer. Choice, scale and consent answers are matched exactly and never go to a model.",
    },
    {
      title: "It answers the respondent's questions",
      body:
        "Give it up to 50 knowledge sources on Pro (3 on Free) — prices, policies, what happens next — and it answers from them mid-form, then carries on from the same question. A state machine owns the order, so answering never skips or reorders anything.",
    },
    {
      title: "Unlimited responses on the free plan",
      body:
        "Fillout's free plan stops at 1,000 responses a month, and unlimited responses start on its Business plan at $75 a month billed yearly. chatform has no response quota on any plan, subject to a fair-use ceiling of 10,000 a month on Free.",
    },
    {
      title: "Partial answers and reminders from the entry plan",
      body:
        "Fillout lists partial submissions on its Business plan, and its abandonment email goes out by default 30 minutes after someone leaves. chatform keeps partial answers from Pro, its entry paid plan, and sends up to three reminders worded differently, four hours, a day and three days apart, each linking back to the question they stopped on. It can hold some people back as a control so you can see what the reminders earned.",
    },
    {
      title: "A conversation you can drive from your own code",
      body:
        "A documented headless session API streams the turns, so you can run the interview inside your own product. Fillout's API reads and writes submissions.",
    },
  ],

  extraRows: [
    {
      label: "Payments, scheduling and PDFs in the form",
      us: { partial: "Shows your payment link or UPI QR" },
      them: true,
    },
    {
      label: "Native integrations",
      us: { partial: "Spreadsheet feed, webhooks, REST API" },
      them: "Airtable, Notion, HubSpot, Salesforce and more",
    },
    {
      label: "Partial submissions",
      hint: "Keeping the answers of someone who stopped partway.",
      us: "Pro, $16/mo",
      them: "Business, $75/mo",
    },
  ],

  pricing: [
    { label: "Free plan", us: "Unlimited responses, 200 AI conversations", them: "1,000 responses a month" },
    { label: "Most affordable plan, billed yearly", us: "$16/mo", them: "$15/mo (Starter, 2,000 responses)" },
    { label: "Unlimited responses", us: "Every plan, free included", them: "$75/mo (Business, billed yearly)" },
  ],

  faq: [
    {
      question: "Is chatform cheaper than Fillout?",
      answer:
        "At the entry level, no: Fillout Starter is $15 a month billed yearly and chatform Pro is $16. The difference is in the limits. Fillout's free plan allows 1,000 responses a month, Starter 2,000 and Pro 5,000, with unlimited responses from Business at $75 a month. chatform has no response quota on any plan, subject to a fair-use ceiling of 10,000 a month on Free.",
    },
    {
      question: "Does Fillout have AI follow-up questions?",
      answer:
        "Fillout offers AI to generate a form from a description. We could not find documentation of a conversational mode that reads each answer and asks a follow-up when it is too thin, which is what chatform does on every plan.",
    },
    {
      question: "Can chatform send Fillout-style abandonment emails?",
      answer:
        "Yes, and more than one. On Pro and above chatform sends up to three reminders, four hours, a day and three days after someone leaves, each worded differently and each linking back to the question they stopped on with their answers intact. Each is re-checked when it is due and dropped if they finished or opted out. Fillout's abandonment email is sent by default 30 minutes after someone leaves.",
    },
    {
      question: "Should I switch from Fillout to chatform?",
      answer:
        "Not if your form is mostly a front end for Airtable or Notion, or needs payments and signatures — Fillout does those better. Switch the forms where the answers themselves are the problem: intake, applications, qualification and feedback, where a vague reply costs you a follow-up email later.",
    },
  ],

  sources: [
    { label: "Fillout pricing", url: "https://www.fillout.com/pricing", checkedOn: "September 2026" },
    { label: "Fillout form abandonment help", url: "https://www.fillout.com/help/form-abandonment", checkedOn: "September 2026" },
  ],

  updates: [
    {
      date: "September 2026",
      note: "Read Fillout's pricing page: Free 1,000 responses a month, Starter $15/mo (2,000), Pro $40/mo (5,000), Business $75/mo (unlimited), all billed yearly. Partial submissions are listed on Business.",
    },
  ],
});
