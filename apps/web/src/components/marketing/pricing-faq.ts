import { PLANS, yearlyPerMonthCents } from "@repo/entitlements";

/**
 * The pricing page's questions, after the ones Youform answers on theirs.
 * Rendered on the page and emitted as its `FAQPage` graph, so every figure is
 * read from the plan catalogue and every claim is one the gates enforce.
 */
const { free, pro, business } = PLANS;
const usd = (cents: number) => `$${Math.round(cents / 100)}`;
const n = (value: number | null) => (value ?? 0).toLocaleString("en-US");

export const PRICING_FAQ = [
  {
    question: "Is the free plan actually free forever?",
    answer: `Yes. Free has unlimited responses, up to ${n(free.limits.forms_count)} forms and ${n(free.limits.ai_conversations_per_month)} AI conversations a month. You do not need a credit card and there is no trial countdown. Paid plans add capabilities; you do not need one to collect more responses. Fair use is a stated number, not small print: ${n(free.limits.responses_ceiling_per_month)} responses a month on Free and ${n(pro.limits.responses_ceiling_per_month)} on paid plans.`,
  },
  {
    question: "What changes when I choose yearly billing?",
    answer: `Pro is ${usd(pro.priceYearlyCents)} for the year, which works out to ${usd(yearlyPerMonthCents(pro))} a month. Business is ${usd(business.priceYearlyCents)} for the year, or ${usd(yearlyPerMonthCents(business))} a month. These are single annual payments. Monthly billing is ${usd(pro.priceMonthlyCents)} for Pro and ${usd(business.priceMonthlyCents)} for Business.`,
  },
  {
    question: "When would I need Pro?",
    answer: `Choose Pro when you want your own logo and fonts with our badge removed, payments through Stripe, the answers of people who left halfway and follow-up emails to bring them back, the full analytics, respondents who sign in with Google, email or a texted code, or up to ${pro.limits.seats} team members. Logic, signatures, file uploads, Google Sheets and webhooks are already on Free.`,
  },
  {
    question: "What does Business add?",
    answer: `Everything in Pro, plus verified answers (a code sent to an email or phone answer before it is kept), one response per verified person, and an activity log you can export. It includes ${business.limits.seats} team members, with extra seats at ${usd(business.seatPriceCents)} a month each.`,
  },
  {
    question: "What is an AI conversation, and what happens when I run out?",
    answer: `It is one respondent talking to your form with the AI switched on. Every plan has a monthly count: ${n(free.limits.ai_conversations_per_month)} on Free, ${n(pro.limits.ai_conversations_per_month)} on Pro and ${n(business.limits.ai_conversations_per_month)} on Business. Past it, your forms keep collecting and simply ask your questions as written. Nothing breaks and no response is lost.`,
  },
  {
    question: "Can I embed a form on my website for free?",
    answer: "Yes. The share link, inline embeds, a popup, a side tab and a QR code are on every plan. Build the form, then paste one snippet into your site.",
  },
  {
    question: "Does chatform work with Google Sheets?",
    answer: "Yes, on Free. A live feed puts each new response into Google Sheets or Excel as a row.",
  },
  {
    question: "Can I connect other apps?",
    answer: `Yes. Signed webhooks are on every plan (${free.limits.webhooks_per_form} per form on Free, ${pro.limits.webhooks_per_form} on Pro), and Claude or ChatGPT can read your responses through the connector. The REST API is on Pro. Zapier, Make and Slack are being built and are not available yet.`,
  },
  {
    question: "Can I collect signatures and files?",
    answer: `Yes, on every plan. A file can be up to ${free.limits.max_upload_mb_per_file} MB on Free, ${pro.limits.max_upload_mb_per_file} MB on Pro and ${business.limits.max_upload_mb_per_file} MB on Business. Free stores ${free.limits.file_storage_mb} MB in total; Pro stores ${Math.round((pro.limits.file_storage_mb ?? 0) / 1024)} GB.`,
  },
  {
    question: "Can I redirect people after they finish?",
    answer: "Yes, on Pro. Send respondents to any URL when the form is complete.",
  },
  {
    question: "Can I collect payments through a form?",
    answer: "Yes, on Pro. Connect your own Stripe account and the form takes the payment as part of the conversation. Stripe's own fees and account requirements apply separately.",
  },
  {
    question: "Can I cancel or change plans later?",
    answer: "Yes. Change or cancel from the billing page at any time. If you go back to Free, your forms keep working and the paid settings switch off; nothing you collected is deleted.",
  },
] as const;
