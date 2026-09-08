import { defineComparison } from "./define";

export default defineComparison({
  slug: "google-forms-alternative",
  competitor: "Google Forms",
  vendor: "Google Forms",
  title: "Google Forms alternative — for the answers Google Forms cannot get",
  description:
    "A Google Forms alternative that reads the answers instead of just filing them: AI that follows up on thin replies and answers questions back. Free, unlimited responses, and honest about what Google Forms still does better.",
  h1: "A Google Forms alternative that reads the answers.",
  lede:
    "Google Forms collects what people put in the boxes. This asks the next question when what they put in the box was “n/a”.",

  whoShouldStay:
    "Stay on Google Forms when the destination is a spreadsheet and the questions are already unambiguous — a class register, a lunch order, an RSVP. It is free, everyone already has an account, and the Sheets integration is instant and native, which is not something chatform can match. Stay too if your organisation's data policy is written around Google Workspace; moving one form outside it is rarely worth the conversation.",

  theirStrengths: [
    "Free, unlimited, and already in the Google account everybody has.",
    "Instant native Google Sheets output — chatform offers a pull-based CSV feed, which is not the same thing.",
    "Inside Google Workspace's existing security, retention and admin controls.",
    "Nothing to learn: most people have filled one in this month.",
  ],

  ourStrengths: [
    {
      title: "It reads what people write",
      body:
        "Google Forms stores the text. chatform interprets it — resolving “same as above”, turning a sentence into a validated answer, and asking a follow-up when the read is low-confidence rather than recording a guess. Choice and scale answers are matched exactly and never go near a model.",
    },
    {
      title: "It answers questions back",
      body:
        "Up to twenty knowledge entries it can quote mid-form without losing its place. A Google Form that raises a question in the respondent's mind has nowhere to put it except abandonment.",
    },
    {
      title: "Branching that is checked before publish",
      body:
        "Google Forms has section-based go-to logic. chatform has nineteen operators, nested and/or groups, variables and scoring, multiple endings — and a linter that walks every path and refuses to publish a dead end.",
    },
    {
      title: "You can see where people leave",
      body:
        "Per-question drop-off, answer rate, and median time to complete, on your own form. Google Forms shows you responses; it does not show you the shape of the abandonment.",
    },
  ],

  extraRows: [
    {
      label: "Google Sheets output",
      hint: "Answers landing in a sheet without wiring anything.",
      us: { partial: "Pull-based CSV feed via IMPORTDATA" },
      them: "Native, instant",
    },
    { label: "Costs nothing, ever", us: { partial: "Free plan, fair-use ceiling" }, them: true },
  ],

  pricing: [
    { label: "Free plan", us: "Unlimited forms and responses, 200 AI conversations", them: "Unlimited, with a Google account" },
    {
      label: "Paid",
      us: "$16/mo billed yearly",
      them: "Google Workspace, priced per user",
      note: "Workspace pricing varies by region and is not quoted here for that reason.",
    },
  ],

  faq: [
    {
      question: "Is there a free Google Forms alternative?",
      answer:
        "chatform's free plan gives you unlimited forms and unlimited responses, subject to a fair-use ceiling of 5,000 responses a month, plus 200 AI-run conversations a month. No card and no trial clock. It is not free in the same absolute way Google Forms is — running an interview costs money — but collecting answers is.",
    },
    {
      question: "Can I send Google Forms responses to a spreadsheet from chatform?",
      answer:
        "Yes, but by a different mechanism, and it is worth understanding the difference. Google Forms writes into a Sheet natively and instantly. chatform gives you a stable, revocable CSV URL that Google Sheets pulls with IMPORTDATA, or Excel pulls on its own schedule, up to 5,000 rows. It is a pull, not a push, and it is one of the honest reasons to stay on Google Forms if a live sheet is the whole point.",
    },
    {
      question: "Why do people abandon long Google Forms?",
      answer:
        "Because a long form is visibly long. Baymard Institute's checkout research finds 22% of users abandon on complexity alone, and survey research going back to Schober and Conrad in 1997 shows that letting the interviewer clarify what a question means sharply reduces error compared with fixed wording. A page of twenty-five fields does neither: it shows you the whole cost upfront and cannot explain itself when a question is ambiguous.",
    },
    {
      question: "Does chatform work with a Google account?",
      answer:
        "You can sign in with Google, and respondents can be asked to verify with Google or an SMS code on the Business plan — that verification creates no account and grants no dashboard access, it just establishes who answered. What chatform does not do is live inside Google Workspace's admin, retention and DLP controls, which is a real reason for some organisations to stay put.",
    },
  ],

  sources: [
    { label: "Google Forms product page", url: "https://www.google.com/forms/about/", checkedOn: "September 2026" },
    { label: "Baymard Institute, checkout form fields", url: "https://baymard.com/blog/checkout-flow-average-form-fields", checkedOn: "September 2026" },
  ],

  updates: [
    {
      date: "September 2026",
      note: "Google Workspace prices are served in local currency and vary by region, so no dollar figure is quoted on this page. Google Forms itself remains free with any Google account.",
    },
  ],
});
