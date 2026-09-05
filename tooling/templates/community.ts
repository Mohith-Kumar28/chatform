import { defineTemplate, type TemplateSeed } from "./define.js";

export const COMMUNITY: TemplateSeed[] = [
  defineTemplate({
    slug: "volunteer-signup",
    title: "Volunteer signup",
    category: "Community",
    icon: "HandHeart",
    description: "Match volunteers to shifts they can actually make.",
    blurb:
      "Availability and skills asked as structured choices, so a coordinator can fill a rota by filtering rather than by reading. The emergency contact is there because most volunteer schemes need one.",
    tags: ["volunteers", "nonprofit", "rota"],
    greeting: "Thanks for offering to help! Tell us when you're free and what you'd like to do.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Email?", required: true },
      { ref: "phone", type: "phone", title: "Mobile number?", required: true },
      {
        ref: "availability",
        type: "multi_select",
        title: "When are you available?",
        required: true,
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
        ref: "interests",
        type: "multi_select",
        title: "What would you like to help with?",
        required: true,
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
      { ref: "emergency_contact", type: "short_text", title: "Emergency contact — name and number", required: true },
    ],
    ending: { title: "Welcome to the team 💚", body: "A coordinator will be in touch with the rota." },
  }),

  defineTemplate({
    slug: "membership-application",
    title: "Membership application",
    category: "Community",
    icon: "BadgeCheck",
    description: "Take applications with the tier and the terms in one pass.",
    blurb:
      "Tier chosen, code of conduct signed, and a line on why they want to join — everything a membership secretary would otherwise chase over three emails.",
    tags: ["membership", "club", "community"],
    greeting: "Glad you want to join us. A few questions and we'll take it from there.",
    questions: [
      { ref: "name", type: "short_text", title: "Your full name?", required: true },
      { ref: "email", type: "email", title: "Email?", required: true },
      { ref: "date_of_birth", type: "date", title: "Date of birth", required: false, dateFormat: "DD/MM/YYYY" },
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
      { ref: "motivation", type: "long_text", title: "Why would you like to join?", required: true, maxLength: 1000 },
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
    ending: { title: "Application in 🎟️", body: "The committee reviews applications monthly." },
  }),

  defineTemplate({
    slug: "testimonial-request",
    title: "Testimonial request",
    category: "Community",
    icon: "Quote",
    description: "Collect quotes you're actually allowed to publish.",
    blurb:
      "Most testimonials never get used because nobody asked permission in writing. This asks for the quote, the attribution and the consent together — so what you collect is publishable the day it arrives.",
    tags: ["testimonial", "social proof", "marketing"],
    greeting: "Would you say a few words about working with us? It really helps.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "role_company", type: "short_text", title: "Role and company, as you'd like it shown", required: false },
      { ref: "rating", type: "rating", title: "How would you rate your experience?", required: true, scale: 5, shape: "star" },
      { ref: "quote", type: "long_text", title: "In your own words — what was it like?", required: true, maxLength: 1200 },
      { ref: "result", type: "short_text", title: "Any specific result you'd be happy to mention?", required: false, maxLength: 200 },
      { ref: "photo", type: "file_upload", title: "A photo we can use alongside it?", required: false, accept: ["image/*"], maxFiles: 1, maxSizeMB: 8 },
      {
        ref: "publish_consent",
        type: "legal_consent",
        title: "Permission to publish",
        required: true,
        consentText:
          "I'm happy for this quote, my name and role, and any photo I've provided to be used on the website and in marketing material.",
      },
    ],
    ending: { title: "Thank you ⭐", body: "That means a lot — we'll let you know where it ends up." },
  }),
];
