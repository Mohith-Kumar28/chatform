import { defineTemplate, type TemplateSeed } from "./define.js";

export const SERVICES: TemplateSeed[] = [
  defineTemplate({
    slug: "client-intake",
    title: "New client intake",
    category: "Services",
    icon: "ClipboardList",
    description: "Everything you need before the first client session.",
    blurb:
      "Replaces the intake PDF nobody fills in. What someone is here for decides what they are asked next — a one-off project gets scope and budget, an ongoing engagement gets scale and decision-makers, a second opinion gets asked what was said the first time. Signed, and done before the first meeting rather than during it.",
    tags: ["intake", "clients", "agency", "branching"],
    greeting: "Welcome! A few questions so we're ready for our first session.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your details",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { ref: "organisation", type: "short_text", title: "Which organisation, if any?", required: false },
      {
        ref: "address",
        type: "address",
        title: "Your address",
        required: false,
        fields: ["street", "city", "postal", "country"],
      },
      {
        ref: "service",
        type: "single_select",
        title: "What are you here for?",
        required: true,
        options: [
          { label: "An initial consultation" },
          { label: "A one-off project" },
          { label: "An ongoing engagement" },
          { label: "A second opinion" },
        ],
      },

      // ── initial consultation ──
      {
        ref: "consult_topic",
        type: "short_text",
        title: "What's the one thing you most want to get out of it?",
        required: true,
      },

      // ── one-off project ──
      {
        ref: "project_scope",
        type: "long_text",
        title: "What needs to be delivered?",
        required: true,
        maxLength: 1500,
      },
      { ref: "project_deadline", type: "date", title: "Is there a date it has to be done by?", required: false, disablePast: true },
      {
        ref: "project_budget",
        type: "single_select",
        title: "What budget are you working with?",
        description: "A range is fine — it tells us what's realistic before we spend your time.",
        required: true,
        options: [
          { label: "Under $5k" },
          { label: "$5k–$15k" },
          { label: "$15k–$50k" },
          { label: "$50k+" },
          { label: "I'd rather you suggest" },
        ],
      },

      // ── ongoing engagement ──
      {
        ref: "ongoing_cadence",
        type: "single_select",
        title: "How often would we work together?",
        required: true,
        options: [{ label: "Weekly" }, { label: "Fortnightly" }, { label: "Monthly" }, { label: "As needed" }],
      },
      {
        ref: "ongoing_stakeholders",
        type: "short_text",
        title: "Who else would be involved, and who signs things off?",
        required: false,
      },

      // ── second opinion ──
      {
        ref: "prior_advice",
        type: "long_text",
        title: "What were you told, and by whom?",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "prior_doubt",
        type: "short_text",
        title: "What about it didn't sit right?",
        required: false,
      },

      // ── everyone ──
      { ref: "background", type: "long_text", title: "Tell us the background in your own words", required: true, maxLength: 2000 },
      { ref: "goals", type: "long_text", title: "What would a good outcome look like?", required: true, maxLength: 1200 },
      {
        ref: "urgency",
        type: "single_select",
        title: "How soon do you need to start?",
        required: true,
        options: [{ label: "This week" }, { label: "This month" }, { label: "This quarter" }, { label: "No rush" }],
      },
      {
        ref: "referral",
        type: "single_select",
        title: "How did you find us?",
        required: false,
        options: [{ label: "Referral" }, { label: "Search" }, { label: "Social media" }, { label: "Existing client" }],
      },
      {
        ref: "documents",
        type: "file_upload",
        title: "Anything we should read first?",
        required: false,
        accept: ["application/pdf", "image/*"],
        maxFiles: 5,
        maxSizeMB: 20,
      },
      {
        ref: "terms",
        type: "legal_consent",
        title: "Terms of engagement",
        required: true,
        consentText: "I have read and accept the terms of engagement and the privacy policy.",
      },
    ],
    branches: [
      { when: "service", is: "An initial consultation", then: "consult_topic" },
      { when: "service", is: "A one-off project", then: "project_scope" },
      { when: "service", is: "An ongoing engagement", then: "ongoing_cadence" },
      { when: "service", is: "A second opinion", then: "prior_advice" },
      { when: "consult_topic", always: true, then: "background" },
      { when: "project_budget", always: true, then: "background" },
      { when: "ongoing_stakeholders", always: true, then: "background" },
    ],
    ending: { title: "Thanks — we're ready 🤝", body: "We'll be in touch to arrange the first session." },
  }),

  defineTemplate({
    slug: "appointment-booking",
    title: "Appointment booking",
    category: "Services",
    icon: "CalendarClock",
    description: "Take a booking with the right slot length for the reason.",
    blurb:
      "A date block with time turned on, so the answer is an appointment rather than a day. First visits are asked the questions a first visit needs; something urgent is offered the next available slot instead of a calendar; a routine check is three taps. Slot length stops being a guess.",
    tags: ["booking", "appointments", "scheduling", "branching"],
    greeting: "Let's find you a time.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "phone", type: "phone", title: "Best number to reach you?", required: true },
      { ref: "email", type: "email", title: "Email, for the confirmation?", required: false },
      {
        ref: "reason",
        type: "single_select",
        title: "What's the appointment for?",
        required: true,
        options: [
          { label: "First consultation" },
          { label: "Follow-up" },
          { label: "Routine check" },
          { label: "Something urgent" },
        ],
      },

      // ── first consultation ──
      {
        ref: "first_concern",
        type: "long_text",
        title: "What would you like to talk about?",
        description: "A sentence or two. It decides how long we book you in for.",
        required: true,
        maxLength: 1000,
      },
      { ref: "referred_by", type: "short_text", title: "Were you referred by anyone?", required: false },
      {
        ref: "date_of_birth",
        type: "date",
        title: "Date of birth, for your record",
        required: false,
        dateFormat: "DD/MM/YYYY",
      },

      // ── follow-up ──
      {
        ref: "previous_visit",
        type: "date",
        title: "Roughly when were you last in?",
        required: false,
      },
      {
        ref: "since_then",
        type: "long_text",
        title: "What's changed since then?",
        required: false,
        maxLength: 800,
      },

      // ── something urgent ──
      {
        ref: "urgent_detail",
        type: "long_text",
        title: "Tell us what's happening",
        required: true,
        maxLength: 800,
      },
      {
        ref: "urgent_today",
        type: "yes_no",
        title: "Do you need to be seen today?",
        required: true,
        yesLabel: "Yes, today",
        noLabel: "The next few days is fine",
      },

      // ── everyone else ──
      {
        ref: "preferred_slot",
        type: "date",
        title: "When suits you?",
        required: true,
        disablePast: true,
        includeTime: true,
        timeStepMinutes: 30,
        timeMin: "09:00",
        timeMax: "17:30",
      },
      {
        ref: "backup_slot",
        type: "date",
        title: "And a second choice, in case that's taken?",
        required: false,
        disablePast: true,
        includeTime: true,
        timeStepMinutes: 30,
        timeMin: "09:00",
        timeMax: "17:30",
      },
      {
        ref: "access_needs",
        type: "long_text",
        title: "Anything we should arrange for your visit?",
        description: "Step-free access, an interpreter, a longer appointment — just say.",
        required: false,
        maxLength: 500,
      },
      { ref: "notes", type: "long_text", title: "Anything else we should know beforehand?", required: false, maxLength: 800 },
    ],
    branches: [
      { when: "reason", is: "First consultation", then: "first_concern" },
      { when: "reason", is: "Follow-up", then: "previous_visit" },
      { when: "reason", is: "Routine check", then: "preferred_slot" },
      { when: "reason", is: "Something urgent", then: "urgent_detail" },
      { when: "date_of_birth", always: true, then: "preferred_slot" },
      { when: "since_then", always: true, then: "preferred_slot" },
      { when: "urgent_today", is: true, then: "end_urgent" },
      { when: "urgent_today", is: false, then: "preferred_slot" },
    ],
    endings: [
      {
        ref: "end_urgent",
        title: "We'll call you back within the hour ☎️",
        body: "Keep your phone nearby. If it's an emergency, please don't wait for us — call your local emergency number.",
      },
    ],
    ending: { title: "Booked 🗓️", body: "We'll confirm by text shortly." },
  }),
];
