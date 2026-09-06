import { defineTemplate, type TemplateSeed } from "./define.js";

export const COMMUNITY: TemplateSeed[] = [
  defineTemplate({
    slug: "volunteer-signup",
    title: "Volunteer signup",
    category: "Community",
    icon: "HandHeart",
    description: "Match volunteers to shifts they can actually make.",
    blurb:
      "Availability and skills as structured choices, so a coordinator fills a rota by filtering rather than by reading. Anyone offering to drive is asked about their licence and insurance; anyone offering to work with people directly is asked about their DBS check — the two questions that otherwise hold up a whole rota.",
    tags: ["volunteers", "nonprofit", "rota", "branching"],
    greeting: "Thanks for offering to help! Tell us when you're free and what you'd like to do.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Email?", required: true },
      { ref: "phone", type: "phone", title: "Mobile number?", required: true },
      { ref: "over_18", type: "yes_no", title: "Are you over 18?", required: true },
      {
        ref: "guardian_contact",
        type: "short_text",
        title: "A parent or guardian's name and number",
        description: "We need this before you can be put on a shift.",
        required: true,
      },
      {
        ref: "availability",
        type: "multi_select",
        title: "When are you available?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Weekday mornings" },
          { label: "Weekday afternoons" },
          { label: "Weekday evenings" },
          { label: "Saturdays" },
          { label: "Sundays" },
        ],
      },
      {
        ref: "commitment",
        type: "single_select",
        title: "How often could you help?",
        required: true,
        options: [{ label: "Every week" }, { label: "A couple of times a month" }, { label: "Now and then" }, { label: "One-off events only" }],
      },
      {
        ref: "primary_role",
        type: "single_select",
        title: "What would you most like to help with?",
        required: true,
        options: [
          { label: "Driving and deliveries" },
          { label: "Working with people directly" },
          { label: "Events and stewarding" },
          { label: "Fundraising" },
          { label: "Admin and data" },
          { label: "Whatever's needed" },
        ],
      },

      // ── driving ──
      { ref: "licence_years", type: "number", title: "How many years have you held a full licence?", required: true, integerOnly: true, min: 0, max: 80 },
      {
        ref: "own_vehicle",
        type: "yes_no",
        title: "Would you use your own vehicle?",
        required: true,
        yesLabel: "Yes, my own",
        noLabel: "I'd need one of yours",
      },
      {
        ref: "business_insurance",
        type: "yes_no",
        title: "Does your insurance cover volunteer driving?",
        description: "Most insurers add it free. We can send a letter to help you ask.",
        required: false,
      },

      // ── working with people ──
      {
        ref: "dbs_status",
        type: "single_select",
        title: "Do you have a current DBS check?",
        required: true,
        options: [
          { label: "Yes, on the update service" },
          { label: "Yes, but not on the update service" },
          { label: "No — I'd need one" },
          { label: "I'm not sure" },
        ],
      },
      {
        ref: "people_experience",
        type: "long_text",
        title: "Have you done anything like this before?",
        required: false,
        maxLength: 800,
      },

      // ── everyone ──
      {
        ref: "other_interests",
        type: "multi_select",
        title: "Anything else you'd be happy to pitch in with?",
        required: false,
        minSelections: 0,
        maxSelections: 6,
        options: [
          { label: "Events and stewarding" },
          { label: "Fundraising" },
          { label: "Admin and data" },
          { label: "Driving and deliveries" },
          { label: "Working with people directly" },
          { label: "Whatever's needed" },
        ],
      },
      { ref: "experience", type: "long_text", title: "Any relevant experience or skills?", required: false, maxLength: 800 },
      {
        ref: "access_needs",
        type: "long_text",
        title: "Anything we should know to make volunteering work for you?",
        required: false,
        maxLength: 600,
      },
      { ref: "emergency_contact", type: "short_text", title: "Emergency contact — name and number", required: true },
      {
        ref: "policies",
        type: "legal_consent",
        title: "Volunteer agreement",
        required: true,
        consentText:
          "I have read the volunteer agreement and safeguarding policy, and agree to follow them.",
      },
    ],
    branches: [
      { when: "over_18", is: false, then: "guardian_contact" },
      { when: "guardian_contact", always: true, then: "availability" },
      { when: "over_18", is: true, then: "availability" },
      { when: "primary_role", is: "Driving and deliveries", then: "licence_years" },
      { when: "primary_role", is: "Working with people directly", then: "dbs_status" },
      { when: "primary_role", is: "Events and stewarding", then: "other_interests" },
      { when: "primary_role", is: "Fundraising", then: "other_interests" },
      { when: "primary_role", is: "Admin and data", then: "other_interests" },
      { when: "primary_role", is: "Whatever's needed", then: "other_interests" },
      { when: "business_insurance", always: true, then: "other_interests" },
    ],
    ending: { title: "Welcome to the team 💚", body: "A coordinator will be in touch with the rota." },
  }),

  defineTemplate({
    slug: "membership-application",
    title: "Membership application",
    category: "Community",
    icon: "BadgeCheck",
    description: "Take applications with the tier, the evidence and the terms in one pass.",
    blurb:
      "Everything a membership secretary would otherwise chase over three emails. A concession is asked for the evidence that supports it, a household membership for the other names on it, and a life membership is handed straight to the committee — so the reply is a decision rather than another question.",
    tags: ["membership", "club", "community", "branching"],
    greeting: "Glad you want to join us. A few questions and we'll take it from there.",
    questions: [
      { ref: "name", type: "short_text", title: "Your full name?", required: true },
      { ref: "email", type: "email", title: "Email?", required: true },
      { ref: "phone", type: "phone", title: "Phone number?", required: false },
      { ref: "date_of_birth", type: "date", title: "Date of birth", required: false, dateFormat: "DD/MM/YYYY" },
      {
        ref: "address",
        type: "address",
        title: "Your address",
        required: false,
        fields: ["street", "city", "postal", "country"],
      },
      {
        ref: "tier",
        type: "single_select",
        title: "Which membership?",
        required: true,
        options: [
          { label: "Standard", description: "Full access, billed yearly" },
          { label: "Concession", description: "Students, over-65s and unwaged" },
          { label: "Household", description: "Up to four people at one address" },
          { label: "Life member" },
        ],
      },

      // ── concession ──
      {
        ref: "concession_basis",
        type: "single_select",
        title: "Which applies to you?",
        required: true,
        options: [{ label: "Student" }, { label: "Over 65" }, { label: "Unwaged" }, { label: "Receiving benefits" }],
      },
      {
        ref: "concession_evidence",
        type: "file_upload",
        title: "Something that shows it",
        description: "A student card, a letter, a screenshot — anything dated in the last year.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 2,
        maxSizeMB: 10,
      },

      // ── household ──
      {
        ref: "household_members",
        type: "long_text",
        title: "Who else is on it? One name per line.",
        required: true,
        maxLength: 500,
      },
      {
        ref: "household_count",
        type: "number",
        title: "How many people in total, including you?",
        required: true,
        integerOnly: true,
        min: 2,
        max: 4,
      },

      // ── life member ──
      {
        ref: "life_nominator",
        type: "short_text",
        title: "Which existing member is nominating you?",
        required: true,
      },
      {
        ref: "life_contribution",
        type: "long_text",
        title: "What's your history with us?",
        required: true,
        maxLength: 1500,
      },

      // ── everyone ──
      { ref: "motivation", type: "long_text", title: "Why would you like to join?", required: true, maxLength: 1000 },
      {
        ref: "interests",
        type: "multi_select",
        title: "What would you like to get involved in?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "Regular meetups" },
          { label: "The annual gathering" },
          { label: "Volunteering" },
          { label: "The committee" },
          { label: "Just the newsletter, thanks" },
        ],
      },
      {
        ref: "how_heard",
        type: "single_select",
        title: "How did you hear about us?",
        required: false,
        options: [{ label: "A member" }, { label: "An event" }, { label: "Online" }, { label: "Somewhere else" }],
      },
      {
        ref: "code_of_conduct",
        type: "legal_consent",
        title: "Code of conduct",
        required: true,
        consentText: "I have read the code of conduct and agree to abide by it as a member.",
      },
    ],
    branches: [
      { when: "tier", is: "Standard", then: "motivation" },
      { when: "tier", is: "Concession", then: "concession_basis" },
      { when: "tier", is: "Household", then: "household_members" },
      { when: "tier", is: "Life member", then: "life_nominator" },
      { when: "concession_evidence", always: true, then: "motivation" },
      { when: "household_count", always: true, then: "motivation" },
      { when: "life_contribution", always: true, then: "motivation" },
    ],
    ending: { title: "Application in 🎟️", body: "The committee reviews applications monthly." },
  }),

  defineTemplate({
    slug: "testimonial-request",
    title: "Testimonial request",
    category: "Community",
    icon: "Quote",
    description: "Collect quotes you're actually allowed to publish.",
    blurb:
      "Most testimonials never get used because nobody asked permission in writing. The quote, the attribution and the consent are collected together — and how they want to be credited decides what else is asked, so an anonymous quote is never chased for a headshot.",
    tags: ["testimonial", "social proof", "marketing", "branching"],
    greeting: "Would you say a few words about working with us? It really helps.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "rating", type: "rating", title: "How would you rate your experience?", required: true, scale: 5, shape: "star" },
      {
        ref: "worked_on",
        type: "short_text",
        title: "What did we work on together?",
        required: false,
      },
      { ref: "quote", type: "long_text", title: "In your own words — what was it like?", required: true, maxLength: 1200 },
      {
        ref: "before_after",
        type: "long_text",
        title: "What was it like before, and what changed?",
        description: "The most useful testimonials are the ones with a before in them.",
        required: false,
        maxLength: 800,
      },
      { ref: "result", type: "short_text", title: "Any specific result you'd be happy to mention?", required: false, maxLength: 200 },
      {
        ref: "attribution",
        type: "single_select",
        title: "How would you like to be credited?",
        required: true,
        options: [
          { label: "Full name, role and company" },
          { label: "First name and company only" },
          { label: "Anonymously" },
        ],
      },

      // ── credited by name ──
      { ref: "role_company", type: "short_text", title: "Role and company, exactly as you'd like it shown", required: true },
      {
        ref: "photo",
        type: "file_upload",
        title: "A photo we can use alongside it?",
        required: false,
        accept: ["image/*"],
        maxFiles: 1,
        maxSizeMB: 8,
      },
      { ref: "linkedin", type: "url", title: "LinkedIn, if you'd like it linked", required: false },

      // ── first name only ──
      { ref: "company_only", type: "short_text", title: "Which company should we name?", required: false },

      // ── everyone ──
      {
        ref: "where_ok",
        type: "multi_select",
        title: "Where are you happy for it to appear?",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Our website" },
          { label: "Social media" },
          { label: "Sales decks and proposals" },
          { label: "Paid advertising" },
        ],
      },
      {
        ref: "publish_consent",
        type: "legal_consent",
        title: "Permission to publish",
        required: true,
        consentText:
          "I'm happy for this quote, the attribution I chose, and any photo I've provided to be used in the places I selected. I understand I can withdraw this by asking.",
      },
    ],
    branches: [
      { when: "attribution", is: "Full name, role and company", then: "role_company" },
      { when: "attribution", is: "First name and company only", then: "company_only" },
      { when: "attribution", is: "Anonymously", then: "where_ok" },
      { when: "linkedin", always: true, then: "where_ok" },
      { when: "company_only", always: true, then: "where_ok" },
    ],
    ending: { title: "Thank you ⭐", body: "That means a lot — we'll let you know where it ends up." },
  }),
];
