import { defineTemplate, type TemplateSeed } from "./define.js";

export const SERVICES: TemplateSeed[] = [
  defineTemplate({
    slug: "client-intake",
    title: "New client intake",
    category: "Services",
    icon: "ClipboardList",
    description: "Everything you need before the first client session.",
    blurb:
      "Replaces the intake PDF nobody fills in. Contact details, what they're here for, how they found you, and a signed agreement — collected once, before the first meeting rather than during it.",
    tags: ["intake", "clients", "agency"],
    greeting: "Welcome! A few questions so we're ready for our first session.",
    questions: [
      { ref: "contact", type: "contact_info", title: "Your details", required: true, fields: ["first_name", "last_name", "email", "phone"] },
      { ref: "address", type: "address", title: "Your address", required: false, fields: ["street", "city", "postal", "country"] },
      {
        ref: "service",
        type: "single_select",
        title: "What are you here for?",
        required: true,
        options: [
          { label: "An initial consultation" },
          { label: "An ongoing engagement" },
          { label: "A one-off project" },
          { label: "A second opinion" },
        ],
      },
      { ref: "background", type: "long_text", title: "Tell us the background in your own words", required: true, maxLength: 2000 },
      { ref: "goals", type: "long_text", title: "What would a good outcome look like?", required: true, maxLength: 1200 },
      {
        ref: "referral",
        type: "single_select",
        title: "How did you find us?",
        required: false,
        options: [{ label: "Referral" }, { label: "Search" }, { label: "Social media" }, { label: "Existing client" }],
      },
      {
        ref: "terms",
        type: "legal_consent",
        title: "Terms of engagement",
        required: true,
        consentText: "I have read and accept the terms of engagement and the privacy policy.",
      },
    ],
    ending: { title: "Thanks — we're ready 🤝", body: "We'll be in touch to arrange the first session." },
  }),

  defineTemplate({
    slug: "appointment-booking",
    title: "Appointment booking",
    category: "Services",
    icon: "CalendarClock",
    description: "Take a booking with a date, a time and a reason.",
    blurb:
      "A date block with time turned on, so the answer is an actual appointment rather than a day. Asking the reason and whether they've been before is what lets you allocate the right slot length.",
    tags: ["booking", "appointments", "scheduling"],
    greeting: "Let's find you a time.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "phone", type: "phone", title: "Best number to reach you?", required: true },
      { ref: "email", type: "email", title: "Email?", required: false },
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
      { ref: "first_visit", type: "yes_no", title: "Is this your first visit?", required: true },
      { ref: "notes", type: "long_text", title: "Anything we should know beforehand?", required: false, maxLength: 800 },
    ],
    ending: { title: "Booked 🗓️", body: "We'll confirm by text shortly." },
  }),
];
