import { defineTemplate, type TemplateSeed } from "./define.js";

export const MARKETING: TemplateSeed[] = [
  defineTemplate({
    slug: "waitlist",
    title: "Launch waitlist",
    category: "Marketing",
    icon: "ListOrdered",
    description: "Collect signups and learn who is waiting.",
    blurb:
      "An email address alone gives you a number to announce and nothing to segment on. Two extra questions turn a waitlist into a launch plan: who they are, and what they came for.",
    tags: ["waitlist", "launch", "growth"],
    greeting: "Thanks for your interest! Get on the list and we'll let you know the moment we're live.",
    questions: [
      { ref: "email", type: "email", title: "What's your email?", required: true },
      { ref: "name", type: "short_text", title: "And your name?", required: false },
      {
        ref: "role",
        type: "single_select",
        title: "What best describes you?",
        required: false,
        options: [
          { label: "Founder" },
          { label: "Developer" },
          { label: "Designer" },
          { label: "Marketer" },
          { label: "Just curious" },
        ],
      },
      { ref: "hoping_for", type: "long_text", title: "What are you hoping this will solve for you?", required: false, maxLength: 600 },
      {
        ref: "referral",
        type: "single_select",
        title: "How did you hear about us?",
        required: false,
        options: [
          { label: "A friend or colleague" },
          { label: "Social media" },
          { label: "Search" },
          { label: "A newsletter or blog" },
          { label: "Somewhere else" },
        ],
      },
    ],
    ending: { title: "You're in 🎉", body: "We'll email you the moment there's something to try." },
  }),

  defineTemplate({
    slug: "newsletter-signup",
    title: "Newsletter signup",
    category: "Marketing",
    icon: "Mail",
    description: "Subscribe people to the topics they actually want.",
    blurb:
      "A single list means every send is wrong for someone. Asking which topics and how often, at the moment of signing up, is the cheapest unsubscribe prevention there is — and it needs explicit consent to be lawful.",
    tags: ["newsletter", "email", "consent"],
    greeting: "Want the newsletter? Tell us what to send and how often.",
    questions: [
      { ref: "email", type: "email", title: "Your email?", required: true },
      { ref: "first_name", type: "short_text", title: "First name, so we're not writing to a stranger?", required: false },
      {
        ref: "topics",
        type: "multi_select",
        title: "What should we send you?",
        required: true,
        maxSelections: 6,
        options: [
          { label: "Product updates" },
          { label: "How-to guides" },
          { label: "Customer stories" },
          { label: "Industry news" },
          { label: "Events and webinars" },
        ],
      },
      {
        ref: "frequency",
        type: "single_select",
        title: "How often?",
        required: true,
        options: [{ label: "Weekly" }, { label: "Every two weeks" }, { label: "Monthly" }],
      },
      {
        ref: "consent",
        type: "legal_consent",
        title: "Permission to email you",
        required: true,
        consentText:
          "I agree to receive marketing emails and understand I can unsubscribe from any of them at any time.",
      },
    ],
    ending: { title: "Subscribed ✉️", body: "Check your inbox to confirm." },
  }),

  defineTemplate({
    slug: "webinar-registration",
    title: "Webinar registration",
    category: "Marketing",
    icon: "Video",
    description: "Register attendees and collect their questions in advance.",
    blurb:
      "The best webinar Q&A is written before the webinar starts. Asking what they want covered gives the speaker an agenda and gives you a reason to email people who registered but didn't show.",
    tags: ["webinar", "events", "leads"],
    greeting: "Save your seat — takes about a minute.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Where should we send the joining link?", required: true, businessOnly: true },
      { ref: "company", type: "short_text", title: "Company?", required: false },
      { ref: "job_title", type: "short_text", title: "Job title?", required: false },
      {
        ref: "attendance",
        type: "single_select",
        title: "Will you join live?",
        required: true,
        options: [
          { label: "Yes, live" },
          { label: "No — send me the recording" },
        ],
      },
      { ref: "question", type: "long_text", title: "Anything you'd like the speaker to cover?", required: false, maxLength: 600 },
    ],
    ending: { title: "See you there 🎥", body: "The calendar invite is on its way." },
  }),

  defineTemplate({
    slug: "content-download",
    title: "Content download",
    category: "Marketing",
    icon: "Download",
    description: "Gate a guide or report without making it feel like a toll booth.",
    blurb:
      "Three fields and the file. Anything longer and the download rate falls faster than the lead quality rises — so this asks only what a follow-up genuinely needs, and says what it will be used for.",
    tags: ["lead magnet", "content", "gated"],
    greeting: "Almost there — tell us where to send it.",
    questions: [
      { ref: "email", type: "email", title: "Your email?", required: true, businessOnly: true },
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "company", type: "short_text", title: "Company?", required: false },
      {
        ref: "interest",
        type: "single_select",
        title: "What brought you here?",
        required: false,
        options: [
          { label: "Researching a purchase" },
          { label: "Solving a specific problem" },
          { label: "General learning" },
        ],
      },
      {
        ref: "consent",
        type: "legal_consent",
        title: "Staying in touch",
        required: false,
        consentText: "Send me related resources occasionally. I can opt out at any time.",
      },
    ],
    ending: { title: "On its way 📄", body: "Check your inbox — it should arrive within a minute." },
  }),
];
