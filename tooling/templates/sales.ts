import { defineTemplate, type TemplateSeed } from "./define.js";

export const SALES: TemplateSeed[] = [
  defineTemplate({
    slug: "lead-capture",
    title: "Lead capture",
    category: "Sales",
    icon: "UserPlus",
    description: "Qualify visitors and collect contact details conversationally.",
    blurb:
      "Ask who they are and what they're trying to solve before you ask for a meeting. Team size and budget arrive as structured choices, so the list your sales team works is already sorted by fit.",
    tags: ["lead gen", "b2b", "contact"],
    greeting: "Hey! Interested in what we do? A few quick questions and someone will be in touch.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true },
      { ref: "email", type: "email", title: "Best email to reach you?", required: true, businessOnly: true },
      { ref: "company", type: "short_text", title: "Where do you work?", required: false },
      {
        ref: "team_size", type: "single_select",
        title: "How big is your team?",
        required: true,
        options: [
          { label: "Just me" },
          { label: "2–10" },
          { label: "11–50" },
          { label: "51–200" },
          { label: "200+" },
        ],
      },
      {
        ref: "problem", type: "long_text",
        title: "What problem are you hoping we solve?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "timeline", type: "single_select",
        title: "How soon are you looking to decide?",
        required: false,
        options: [
          { label: "This month" },
          { label: "This quarter" },
          { label: "Sometime this year" },
          { label: "Just researching" },
        ],
      },
    ],
    ending: {
      title: "Talk soon 🤝",
      body: "We'll be in touch within one business day.",
    },
  }),

  defineTemplate({
    slug: "demo-request",
    title: "Demo request",
    category: "Sales",
    icon: "MonitorPlay",
    description: "Book a product demo and learn what to show before the call.",
    blurb:
      "Half of a good demo is knowing what to skip. This asks what they want to see and which tools it has to sit alongside, then hands them straight to your booking link.",
    tags: ["demo", "sales", "booking"],
    greeting: "Let's get you a demo. Two minutes of questions so we don't waste yours.",
    questions: [
      { ref: "contact", type: "contact_info", title: "Who should we be speaking to?", required: true, fields: ["first_name", "last_name", "email"] },
      { ref: "company", type: "short_text", title: "Which company?", required: true },
      {
        ref: "decision_role", type: "single_select",
        title: "What's your role in the decision?",
        required: true,
        options: [
          { label: "I decide" },
          { label: "I recommend" },
          { label: "I'm researching for someone else" },
        ],
      },
      {
        ref: "demo_focus", type: "multi_select",
        title: "What would you most like to see?",
        required: true,
        maxSelections: 4,
        options: [
          { label: "The basics, end to end" },
          { label: "Integrations with our stack" },
          { label: "Security and compliance" },
          { label: "Pricing and plans" },
          { label: "Migrating from what we use now" },
        ],
      },
      { ref: "current_tools", type: "short_text", title: "What are you using today?", required: false },
      {
        ref: "booking", type: "scheduling",
        title: "Pick a time that works",
        required: false,
        url: "https://cal.com/example/demo",
        description: "Replace this link with your own booking page.",
      },
    ],
    ending: {
      title: "Booked 📅",
      body: "Check your inbox for the invite. Bring questions.",
    },
  }),

  defineTemplate({
    slug: "quote-request",
    title: "Quote request",
    category: "Sales",
    icon: "FileText",
    description: "Scope a job well enough to price it without a call.",
    blurb:
      "Most quote forms collect a name and a vague description, then cost you a discovery call anyway. This one asks about scope, timeline and budget range up front so the first reply can be a number.",
    tags: ["quote", "pricing", "services"],
    greeting: "Tell us what you need and we'll come back with a price.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Where should we send the quote?", required: true },
      {
        ref: "job_type", type: "single_select",
        title: "What kind of work is it?",
        required: true,
        options: [
          { label: "New build" },
          { label: "Redesign of something existing" },
          { label: "Ongoing support" },
          { label: "Something else" },
        ],
      },
      { ref: "job_description", type: "long_text", title: "Describe the job in your own words", required: true, maxLength: 1500 },
      {
        ref: "budget", type: "single_select",
        title: "What's your budget range?",
        required: true,
        description: "A range is fine — it tells us what's realistic.",
        options: [
          { label: "Under $5k" },
          { label: "$5k–$15k" },
          { label: "$15k–$50k" },
          { label: "$50k+" },
          { label: "I'd rather you suggest" },
        ],
      },
      { ref: "deadline", type: "date", title: "When would you like it finished?", required: false, disablePast: true },
      { ref: "attachments", type: "file_upload", title: "Anything to share? Briefs, drawings, screenshots.", required: false, accept: ["image/*", "application/pdf"], maxFiles: 5 },
    ],
    ending: {
      title: "On it 📝",
      body: "You'll have a quote within two working days.",
    },
  }),

  defineTemplate({
    slug: "partnership-inquiry",
    title: "Partnership inquiry",
    category: "Sales",
    icon: "Handshake",
    description: "Sort real partnership proposals from the cold pitches.",
    blurb:
      "A partnerships inbox fills with pitches that were never going to fit. Asking for the audience, the shape of the deal and what they want from you filters most of that out before it reaches a person.",
    tags: ["partnerships", "bizdev"],
    greeting: "Thinking of working together? Tell us what you have in mind.",
    questions: [
      { ref: "name_company", type: "short_text", title: "Your name and company?", required: true },
      { ref: "email", type: "email", title: "Work email?", required: true, businessOnly: true },
      { ref: "website", type: "url", title: "Link to your site", required: false },
      {
        ref: "partnership_type", type: "single_select",
        title: "What kind of partnership?",
        required: true,
        options: [
          { label: "Reseller or affiliate" },
          { label: "Technology integration" },
          { label: "Co-marketing" },
          { label: "Agency or implementation partner" },
          { label: "Something else" },
        ],
      },
      { ref: "audience_size", type: "number", title: "Roughly how large is your audience or customer base?", required: false, integerOnly: true, min: 0 },
      { ref: "outcome", type: "long_text", title: "What would a good outcome look like for you?", required: true, maxLength: 1200 },
    ],
    ending: {
      title: "Thanks — we'll read it properly 🤝",
      body: "If there's a fit, you'll hear from us within the week.",
    },
  }),
];
