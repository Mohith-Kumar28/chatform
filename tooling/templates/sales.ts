import { defineTemplate, type TemplateSeed } from "./define.js";

export const SALES: TemplateSeed[] = [
  defineTemplate({
    slug: "lead-capture",
    title: "Lead capture",
    category: "Sales",
    icon: "UserPlus",
    description: "Qualify visitors, and send the big ones to sales and the rest to a trial.",
    blurb:
      "Ask who they are and what they're trying to solve before you ask for a meeting. Team size and timeline arrive as structured choices, and they decide the ending: a large team looking to buy this quarter is handed to sales, everyone else is pointed at a trial they can start today rather than waiting for a call nobody wanted.",
    tags: ["lead gen", "b2b", "qualification", "branching"],
    greeting: "Hey! Interested in what we do? A few quick questions and someone will be in touch.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true },
      { ref: "email", type: "email", title: "Best email to reach you?", required: true, businessOnly: true },
      { ref: "company", type: "short_text", title: "Where do you work?", required: false },
      {
        ref: "team_size",
        type: "single_select",
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

      // ── larger teams: the questions a rep would ask on the call ──
      {
        ref: "decision_role",
        type: "single_select",
        title: "What's your part in the decision?",
        required: true,
        options: [
          { label: "I decide" },
          { label: "I recommend, someone else signs" },
          { label: "I'm researching for someone else" },
        ],
      },
      {
        ref: "requirements",
        type: "multi_select",
        title: "Anything you'd need us to satisfy?",
        required: false,
        minSelections: 0,
        maxSelections: 6,
        options: [
          { label: "SSO or SAML" },
          { label: "A signed DPA" },
          { label: "SOC 2 or ISO 27001" },
          { label: "Data residency in a specific region" },
          { label: "A security review" },
          { label: "None of these" },
        ],
      },
      {
        ref: "budget_owner",
        type: "short_text",
        title: "Whose budget would this come from?",
        required: false,
      },

      // ── smaller teams ──
      {
        ref: "solo_stage",
        type: "single_select",
        title: "Where are you up to?",
        required: false,
        options: [
          { label: "Just looking around" },
          { label: "Comparing a few options" },
          { label: "Ready to start" },
        ],
      },

      // ── everyone ──
      {
        ref: "problem",
        type: "long_text",
        title: "What problem are you hoping we solve?",
        required: true,
        maxLength: 800,
      },
      { ref: "current_tools", type: "short_text", title: "What are you using for it today?", required: false },
      {
        ref: "timeline",
        type: "single_select",
        title: "How soon are you looking to decide?",
        required: true,
        options: [
          { label: "This month" },
          { label: "This quarter" },
          { label: "Sometime this year" },
          { label: "Just researching" },
        ],
      },
      {
        ref: "referral",
        type: "single_select",
        title: "How did you hear about us?",
        required: false,
        options: [
          { label: "A friend or colleague" },
          { label: "Search" },
          { label: "Social media" },
          { label: "An event" },
          { label: "Somewhere else" },
        ],
      },
    ],
    branches: [
      { when: "team_size", is: "Just me", then: "solo_stage" },
      { when: "team_size", is: "2–10", then: "solo_stage" },
      { when: "team_size", is: "11–50", then: "decision_role" },
      { when: "team_size", is: "51–200", then: "decision_role" },
      { when: "team_size", is: "200+", then: "decision_role" },
      { when: "budget_owner", always: true, then: "problem" },
      { when: "timeline", is: "This month", then: "end_sales" },
      { when: "timeline", is: "This quarter", then: "end_sales" },
    ],
    endings: [
      {
        ref: "end_sales",
        title: "We'll call you 🤝",
        body: "Someone from the team will be in touch within one business day, with your answers already in front of them.",
      },
    ],
    ending: {
      title: "Talk soon 🤝",
      body: "We've sent you a trial link so you can have a look around in the meantime.",
    },
  }),

  defineTemplate({
    slug: "demo-request",
    title: "Demo request",
    category: "Sales",
    icon: "MonitorPlay",
    description: "Book a demo and learn exactly what to show before the call.",
    blurb:
      "Half of a good demo is knowing what to skip. This asks what they want to see, and each answer opens the one follow-up that makes the demo specific — which integrations, which compliance regime, which system they are migrating from — then hands them straight to your booking link.",
    tags: ["demo", "sales", "booking", "branching"],
    greeting: "Let's get you a demo. Two minutes of questions so we don't waste yours.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should we be speaking to?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "Which company?", required: true },
      {
        ref: "company_size",
        type: "single_select",
        title: "How many people work there?",
        required: true,
        options: [{ label: "1–10" }, { label: "11–50" }, { label: "51–200" }, { label: "201–1000" }, { label: "1000+" }],
      },
      {
        ref: "decision_role",
        type: "single_select",
        title: "What's your role in the decision?",
        required: true,
        options: [
          { label: "I decide" },
          { label: "I recommend" },
          { label: "I'm researching for someone else" },
        ],
      },
      {
        ref: "demo_focus",
        type: "single_select",
        title: "What would you most like to see?",
        description: "Pick the one that matters most — we'll cover the rest if there's time.",
        required: true,
        options: [
          { label: "The basics, end to end" },
          { label: "Integrations with our stack" },
          { label: "Security and compliance" },
          { label: "Migrating from what we use now" },
        ],
      },

      // ── integrations ──
      {
        ref: "stack",
        type: "multi_select",
        title: "What does it need to talk to?",
        required: true,
        minSelections: 1,
        maxSelections: 8,
        options: [
          { label: "Salesforce" },
          { label: "HubSpot" },
          { label: "Slack" },
          { label: "Google Workspace" },
          { label: "Notion" },
          { label: "Zapier or Make" },
          { label: "Our own API" },
          { label: "Something else" },
        ],
      },

      // ── security ──
      {
        ref: "compliance",
        type: "multi_select",
        title: "Which of these are you being held to?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "SOC 2" },
          { label: "ISO 27001" },
          { label: "GDPR" },
          { label: "HIPAA" },
          { label: "An internal security review" },
          { label: "Not sure yet" },
        ],
      },
      {
        ref: "security_contact",
        type: "short_text",
        title: "Who runs the security review on your side?",
        required: false,
      },

      // ── migration ──
      { ref: "migrating_from", type: "short_text", title: "What are you moving off?", required: true },
      {
        ref: "migration_volume",
        type: "single_select",
        title: "Roughly how much data would come with you?",
        required: false,
        options: [{ label: "A handful of records" }, { label: "Hundreds" }, { label: "Thousands" }, { label: "Millions" }],
      },

      // ── everyone ──
      {
        ref: "timeline",
        type: "single_select",
        title: "When would you want this live?",
        required: true,
        options: [{ label: "This month" }, { label: "This quarter" }, { label: "Later this year" }, { label: "No date yet" }],
      },
      { ref: "anything_else", type: "long_text", title: "Anything the demo should definitely cover?", required: false, maxLength: 800 },
      {
        ref: "booking",
        type: "scheduling",
        title: "Pick a time that works",
        required: false,
        url: "https://cal.com/example/demo",
        description: "Replace this link with your own booking page.",
      },
    ],
    branches: [
      { when: "demo_focus", is: "The basics, end to end", then: "timeline" },
      { when: "demo_focus", is: "Integrations with our stack", then: "stack" },
      { when: "demo_focus", is: "Security and compliance", then: "compliance" },
      { when: "demo_focus", is: "Migrating from what we use now", then: "migrating_from" },
      { when: "stack", always: true, then: "timeline" },
      { when: "security_contact", always: true, then: "timeline" },
      { when: "migration_volume", always: true, then: "timeline" },
    ],
    ending: {
      title: "Booked 📅",
      body: "Check your inbox for the invite. We'll have your answers open on the call.",
    },
  }),

  defineTemplate({
    slug: "quote-request",
    title: "Quote request",
    category: "Sales",
    icon: "FileText",
    description: "Scope a job well enough to price it without a call.",
    blurb:
      "Most quote forms collect a name and a vague description, then cost you a discovery call anyway. This asks the questions the price actually depends on, and which ones those are depends on the job — a new build is scoped differently from a rescue, and ongoing support differently again. The first reply can be a number.",
    tags: ["quote", "pricing", "services", "branching"],
    greeting: "Tell us what you need and we'll come back with a price.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Where should we send the quote?", required: true },
      { ref: "company", type: "short_text", title: "Company, if there is one?", required: false },
      {
        ref: "job_type",
        type: "single_select",
        title: "What kind of work is it?",
        required: true,
        options: [
          { label: "New build" },
          { label: "Redesign of something existing" },
          { label: "Ongoing support" },
          { label: "Something else" },
        ],
      },

      // ── new build ──
      {
        ref: "build_scale",
        type: "single_select",
        title: "Roughly how big is it?",
        required: true,
        options: [
          { label: "A single page or screen" },
          { label: "A handful of pages" },
          { label: "A full site or product" },
          { label: "I genuinely don't know" },
        ],
      },
      {
        ref: "build_has_design",
        type: "yes_no",
        title: "Is there a design already?",
        required: true,
        yesLabel: "Yes, it's ready",
        noLabel: "No — we'd need that too",
      },

      // ── redesign ──
      { ref: "existing_url", type: "url", title: "Link to what exists now", required: true },
      {
        ref: "redesign_reason",
        type: "single_select",
        title: "What's driving the change?",
        required: true,
        options: [
          { label: "It looks dated" },
          { label: "It doesn't convert" },
          { label: "It's hard to maintain" },
          { label: "The business has changed" },
        ],
      },
      {
        ref: "keep_content",
        type: "yes_no",
        title: "Are you keeping the existing content?",
        required: false,
        yesLabel: "Mostly, yes",
        noLabel: "No, it's all being rewritten",
      },

      // ── ongoing support ──
      {
        ref: "support_hours",
        type: "single_select",
        title: "How much help do you expect to need?",
        required: true,
        options: [
          { label: "A few hours a month" },
          { label: "A day or two a month" },
          { label: "A day a week" },
          { label: "More than that" },
        ],
      },
      {
        ref: "support_response",
        type: "single_select",
        title: "How fast do you need us to respond?",
        required: false,
        options: [{ label: "Same day" }, { label: "Within two days" }, { label: "Within a week" }],
      },

      // ── everyone ──
      { ref: "job_description", type: "long_text", title: "Describe the job in your own words", required: true, maxLength: 1500 },
      {
        ref: "budget",
        type: "single_select",
        title: "What's your budget range?",
        description: "A range is fine — it tells us what's realistic.",
        required: true,
        options: [
          { label: "Under $5k" },
          { label: "$5k–$15k" },
          { label: "$15k–$50k" },
          { label: "$50k+" },
          { label: "I'd rather you suggest" },
        ],
      },
      { ref: "deadline", type: "date", title: "When would you like it finished?", required: false, disablePast: true },
      {
        ref: "attachments",
        type: "file_upload",
        title: "Anything to share? Briefs, drawings, screenshots.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
      },
    ],
    branches: [
      { when: "job_type", is: "New build", then: "build_scale" },
      { when: "job_type", is: "Redesign of something existing", then: "existing_url" },
      { when: "job_type", is: "Ongoing support", then: "support_hours" },
      { when: "job_type", is: "Something else", then: "job_description" },
      { when: "build_has_design", always: true, then: "job_description" },
      { when: "keep_content", always: true, then: "job_description" },
      { when: "support_response", always: true, then: "job_description" },
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
      "A partnerships inbox fills with pitches that were never going to fit. Each kind of partnership is asked the one thing that makes it credible — an integration for the API it would use, a reseller for the market it sells into, co-marketing for the size of its audience — and a proposal that can't answer that is the one you were going to decline anyway.",
    tags: ["partnerships", "bizdev", "branching"],
    greeting: "Thinking of working together? Tell us what you have in mind.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "company_name", type: "short_text", title: "And your company?", required: true },
      { ref: "email", type: "email", title: "Work email?", required: true, businessOnly: true },
      { ref: "website", type: "url", title: "Link to your site", required: false },
      {
        ref: "partnership_type",
        type: "single_select",
        title: "What kind of partnership?",
        required: true,
        options: [
          { label: "Technology integration" },
          { label: "Reseller or affiliate" },
          { label: "Co-marketing" },
          { label: "Agency or implementation partner" },
          { label: "Something else" },
        ],
      },

      // ── integration ──
      {
        ref: "integration_direction",
        type: "single_select",
        title: "Which way round would it work?",
        required: true,
        options: [
          { label: "You'd call our API" },
          { label: "We'd call yours" },
          { label: "Both" },
          { label: "Not sure yet" },
        ],
      },
      {
        ref: "integration_users",
        type: "number",
        title: "How many of your customers would use it?",
        required: false,
        integerOnly: true,
        min: 0,
      },

      // ── reseller ──
      {
        ref: "reseller_market",
        type: "short_text",
        title: "Which market and region do you sell into?",
        required: true,
      },
      {
        ref: "reseller_experience",
        type: "yes_no",
        title: "Do you already resell anything similar?",
        required: false,
      },

      // ── co-marketing ──
      {
        ref: "audience_size",
        type: "number",
        title: "Roughly how large is your audience?",
        required: true,
        integerOnly: true,
        min: 0,
      },
      {
        ref: "comarketing_format",
        type: "multi_select",
        title: "What did you have in mind?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "A joint webinar" },
          { label: "A guest post or newsletter swap" },
          { label: "A case study together" },
          { label: "An event or sponsorship" },
          { label: "Something else" },
        ],
      },

      // ── agency ──
      {
        ref: "agency_clients",
        type: "single_select",
        title: "How many clients do you look after?",
        required: true,
        options: [{ label: "1–5" }, { label: "6–20" }, { label: "21–50" }, { label: "50+" }],
      },
      {
        ref: "agency_services",
        type: "short_text",
        title: "What do you do for them?",
        required: false,
      },

      // ── everyone ──
      { ref: "outcome", type: "long_text", title: "What would a good outcome look like for you?", required: true, maxLength: 1200 },
      {
        ref: "timeline",
        type: "single_select",
        title: "What sort of timeline are you thinking?",
        required: false,
        options: [{ label: "Next few weeks" }, { label: "This quarter" }, { label: "This year" }, { label: "Exploring for now" }],
      },
    ],
    branches: [
      { when: "partnership_type", is: "Technology integration", then: "integration_direction" },
      { when: "partnership_type", is: "Reseller or affiliate", then: "reseller_market" },
      { when: "partnership_type", is: "Co-marketing", then: "audience_size" },
      { when: "partnership_type", is: "Agency or implementation partner", then: "agency_clients" },
      { when: "partnership_type", is: "Something else", then: "outcome" },
      { when: "integration_users", always: true, then: "outcome" },
      { when: "reseller_experience", always: true, then: "outcome" },
      { when: "comarketing_format", always: true, then: "outcome" },
      { when: "agency_services", always: true, then: "outcome" },
    ],
    ending: {
      title: "Thanks — we'll read it properly 🤝",
      body: "If there's a fit, you'll hear from us within the week.",
    },
  }),
];
