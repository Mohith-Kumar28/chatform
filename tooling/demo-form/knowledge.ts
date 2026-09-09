import { PLANS, yearlyPerMonthCents } from "@repo/entitlements";

/**
 * What the demo agent is allowed to say about chatform.
 *
 * This is the whole of it. `agent.knowledge` is inlined into the system prompt
 * by `buildStablePrefix`, the `answer_from_knowledge` tool retrieves from it by
 * lexical overlap, and the persona forbids inventing anything it does not
 * contain — so an omission here is not a gap the model fills in, it is a
 * question the agent says it cannot answer. That is the intended failure.
 *
 * Two rules, both learned from what a public demo actually gets asked:
 *
 * 1. **Prices are computed, never typed.** A number written by hand here would
 *    be a number in a published form version that nothing recomputes when
 *    pricing changes, and the agent would quote it with total confidence to
 *    every visitor. `PLANS` is the same source the pricing page reads.
 * 2. **The last entry is the honest one.** Somebody evaluating a form product
 *    will poke at what it cannot do, and an agent that only knows good news
 *    reads as marketing the moment they find the edge. Saying "payments are
 *    recorded, not verified" costs nothing and buys the rest of it credibility.
 */

const usd = (cents: number) => `$${Math.round(cents / 100)}`;

const free = PLANS.free;
const pro = PLANS.pro;
const business = PLANS.business;

export const DEMO_KNOWLEDGE: { title: string; body: string }[] = [
  {
    title: "What chatform is",
    body: `chatform is a form builder where the form is a conversation. Instead of a page of fields, an AI agent asks one question at a time, reads the answer, and asks the next one — which is what this form is doing right now.

You build it the way you would build any form: a list of questions, each with a type (short text, multiple choice, rating, file upload, and about twenty more), plus logic for what follows what. The agent handles the asking. It rephrases questions so they fit the conversation, notices when an answer does not really answer the question, and asks once more before moving on.

Every answer is validated the same way whatever route it came in by, so an email question gets an email address and a rating gets a number in range. The conversation is a nicer surface on the same strictness a normal form has.`,
  },
  {
    title: "Pricing, and what the free plan includes",
    body: `Three plans. Prices are in USD.

HOW TO QUOTE THESE. Always lead with the monthly price. The lower figure on each
paid plan is the per-month cost of paying a year up front, and it is only
available that way — quoting it on its own ("plans start at ${usd(yearlyPerMonthCents(pro))}/month")
states a price nobody can actually pay monthly, which is the one pricing claim
that gets a product accused of bait pricing. Say "${usd(pro.priceMonthlyCents)}/month, or ${usd(yearlyPerMonthCents(pro))}/month billed yearly",
and if you only have room for one number, use the monthly one.

Free — ${usd(free.priceMonthlyCents)}. No card, no expiry. Unlimited forms and unlimited responses, up to ${free.limits.responses_ceiling_per_month.toLocaleString()} a month. ${free.limits.ai_conversations_per_month} AI conversations a month; past that the interview keeps working but asks questions as written instead of phrasing them itself. Forms carry a small chatform mark.

Pro — ${usd(pro.priceMonthlyCents)}/month, or ${usd(yearlyPerMonthCents(pro))}/month billed yearly. Removes the chatform mark, adds your own fonts and logo, partial responses (what people typed before they left), analytics, file uploads up to ${pro.limits.max_upload_mb_per_file}MB, a custom domain, the developer API, and the agent's persona and knowledge base. ${pro.limits.ai_conversations_per_month.toLocaleString()} AI conversations a month, ${pro.limits.seats} seats.

Business — ${usd(business.priceMonthlyCents)}/month, or ${usd(yearlyPerMonthCents(business))}/month billed yearly. Adds verified respondents (sign in with Google or a phone number, like this form asked), one-response-per-person, an activity log, and ${business.limits.ai_conversations_per_month.toLocaleString()} AI conversations a month.

If someone asks which plan they need, ask what they are trying to do rather than guessing.`,
  },
  {
    title: "How it differs from Typeform, Tally, Youform and Google Forms",
    body: `Those are all good tools, and the honest answer is that the difference is the interview, not the feature list.

Typeform shows one question per screen — a form that feels like a conversation. chatform is an actual conversation: the agent reads what you wrote, and can ask about it. If you answer a "what went wrong?" question with "it broke", Typeform stores "it broke". chatform asks what broke.

Google Forms and Tally are excellent at being quick and free. Neither rephrases anything or follows up, and their branching is a rules table you maintain by hand.

Youform is the closest on price and does unlimited responses on its free tier too.

What none of them do is let a respondent ask a question back. You can ask me things about chatform right now, mid-form, and I will answer — that is a knowledge base the form's author wrote, not me improvising.

Be fair about the others. Do not claim chatform gets better completion rates or better data: those numbers are not measured, and inventing one would be a lie.`,
  },
  {
    title: "The agent, and how much of it the author controls",
    body: `The author sets the agent's tone, a persona, a goal, and what it may talk about. They can turn the rephrasing off entirely, in which case questions are asked exactly as written.

They give it a knowledge base — up to ${business.limits.knowledge_entries} entries — which is how I can answer questions about chatform. The agent quotes it and is told not to invent anything beyond it. Guardrails set a cap on how long a conversation can run and a list of topics to refuse.

When an answer does not fit the question, the agent says so conversationally and asks again, up to a limit the author sets. After that it stops arguing and shows the plain input instead, so nobody gets stuck in a loop with a chatbot.

There is a three-mode setting: template (no model at all, deterministic questions), hybrid, and full AI.`,
  },
  {
    title: "Logic, branching and endings",
    body: `Branching is a condition on an answer: if they picked this, go there. Conditions can be nested and combined, and they can read earlier answers, hidden fields from the URL, or a running score.

It is evaluated in code after every answer, never by the model. That matters: the agent cannot decide to skip your screening question because the conversation was going well.

A form can have several endings, and which one someone reaches can depend on their answers — so a form that qualifies people can thank a lead and turn away a mismatch with different words. An ending can be marked as a screen-out, which keeps disqualified responses out of your completion rate.

This form is branching right now. Which questions you have been asked depends on what you answered earlier.`,
  },
  {
    title: "Where the answers go",
    body: `Everything lands in a results table you can read, filter and search, with the full conversation transcript beside each response — so you can see not just what someone answered but what they were asked and what they said on the way.

Partial responses are kept: if someone leaves halfway, what they had already typed is saved rather than discarded.

Out of the product: CSV and JSONL export, webhooks when a response completes, Google Sheets, Slack, Zapier, and a developer API with SDKs for JavaScript and React. The API can also drive the interview headlessly, so you can build your own interface on the same engine — a chat, a classic form, a voice agent.`,
  },
  {
    title: "What this demo does with your answers, and what chatform cannot do yet",
    body: `This form is a real chatform form, and your answers are a real response stored in a real account — the team's own. They are read as research about how people use form tools, which is why the questions are what they are. You signed in with Google, so your name and email address are attached to the response. Nothing here is sold or passed to anyone else. If you want yours removed, say so and it will be.

Things chatform does not do, which are worth knowing before anyone builds on it:

Payments are not verified. A payment question hands the respondent to a payment link or a UPI app and records that they said they paid. Nothing talks to a payment gateway, so you have to reconcile against your own processor.

Scheduling is a hand-off. A scheduling question records a booking link and the slot if you pass one; it does not hold a calendar.

The agent is a language model and can be wrong. It is held to this knowledge base and to validating every answer in code, but if someone asks me something outside what I have been told, the right answer is that I do not know.

If a question is asked that none of this covers, say so plainly and offer to pass it on. Do not guess.`,
  },
];
