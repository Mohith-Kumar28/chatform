import { defineTemplate, type TemplateSeed } from "./define.js";

export const MARKETING: TemplateSeed[] = [
  defineTemplate({
    slug: "waitlist",
    title: "Launch waitlist",
    category: "Marketing",
    icon: "ListOrdered",
    description: "Collect signups, segment by platform, and find your first testers.",
    blurb:
      "An email address alone gives you a number to announce and nothing to act on. This asks what someone is waiting for and which platform they are on, then follows that answer down its own path — so launch day starts with a list already sorted into the builds you have to ship.",
    tags: ["waitlist", "launch", "growth", "beta"],
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
          { label: "Founder or exec" },
          { label: "Engineer" },
          { label: "Designer" },
          { label: "Marketer" },
          { label: "Operations" },
          { label: "Student or hobbyist" },
          { label: "Something else" },
        ],
      },
      {
        ref: "platform",
        type: "single_select",
        title: "Where would you use it first?",
        description: "We ship one platform at a time, so this decides who gets invited when.",
        required: true,
        options: [
          { label: "iPhone or iPad" },
          { label: "Android" },
          { label: "The web app" },
          { label: "A browser extension" },
        ],
      },

      // ── the iPhone arm ──
      {
        ref: "ios_version",
        type: "single_select",
        title: "Which iOS are you on?",
        description: "TestFlight builds need iOS 16 or later.",
        required: false,
        options: [{ label: "iOS 18" }, { label: "iOS 17" }, { label: "iOS 16" }, { label: "Older, or not sure" }],
      },
      {
        ref: "ios_testflight",
        type: "yes_no",
        title: "Happy to install a TestFlight build?",
        required: false,
        yesLabel: "Yes, send it",
        noLabel: "I'll wait for the App Store",
      },

      // ── the Android arm ──
      {
        ref: "android_device",
        type: "short_text",
        title: "Which Android phone do you use?",
        description: "Pixel 8, Galaxy S24 — anything specific helps us test on the right hardware.",
        required: false,
      },
      {
        ref: "android_channel",
        type: "single_select",
        title: "How would you rather install it?",
        required: false,
        options: [
          { label: "Play Store beta channel" },
          { label: "A direct APK" },
          { label: "Wait for the public release" },
        ],
      },

      // ── the web arm ──
      {
        ref: "web_browser",
        type: "single_select",
        title: "Which browser do you live in?",
        required: false,
        options: [{ label: "Chrome" }, { label: "Safari" }, { label: "Firefox" }, { label: "Edge" }, { label: "Arc" }],
      },

      // ── the extension arm ──
      {
        ref: "extension_browser",
        type: "single_select",
        title: "Which browser should we build the extension for first?",
        required: false,
        options: [{ label: "Chrome" }, { label: "Firefox" }, { label: "Safari" }, { label: "Edge" }],
      },

      // ── everyone again ──
      {
        ref: "hoping_for",
        type: "long_text",
        title: "What are you hoping this will solve for you?",
        required: false,
        maxLength: 600,
      },
      { ref: "current_tool", type: "short_text", title: "What do you use for that today?", required: false },
      {
        ref: "pain",
        type: "opinion_scale",
        title: "How much of a problem is that today?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Mild annoyance",
        labelHigh: "Costs me real time",
      },
      {
        ref: "early_access",
        type: "yes_no",
        title: "Would you like early access before we launch?",
        description: "Rougher edges, and your feedback actually changes what ships.",
        required: true,
        yesLabel: "Yes, put me in",
        noLabel: "I'll wait for launch",
      },
      {
        ref: "early_access_why",
        type: "long_text",
        title: "What would you try first?",
        description: "Testers who know what they want to do with it are the ones we invite first.",
        required: false,
        maxLength: 500,
      },
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
      {
        ref: "consent",
        type: "legal_consent",
        title: "Keeping you posted",
        required: true,
        consentText: "Email me about the launch and early access. I can unsubscribe at any time.",
      },
    ],
    branches: [
      { when: "platform", is: "iPhone or iPad", then: "ios_version" },
      { when: "platform", is: "Android", then: "android_device" },
      { when: "platform", is: "The web app", then: "web_browser" },
      { when: "platform", is: "A browser extension", then: "extension_browser" },
      { when: "early_access", is: true, then: "early_access_why" },
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
      "A single list means every send is wrong for someone. Asking which topics and how often, at the moment of signing up, is the cheapest unsubscribe prevention there is — and someone who came for one specific thing gets asked what it was.",
    tags: ["newsletter", "email", "consent", "segmentation"],
    greeting: "Want the newsletter? Tell us what to send and how often.",
    questions: [
      { ref: "email", type: "email", title: "Your email?", required: true },
      { ref: "first_name", type: "short_text", title: "First name, so we're not writing to a stranger?", required: false },
      {
        ref: "reader_type",
        type: "single_select",
        title: "What brings you here?",
        required: true,
        options: [
          { label: "I use the product" },
          { label: "I'm deciding whether to" },
          { label: "I'm here for the writing, not the product" },
        ],
      },
      {
        ref: "customer_since",
        type: "single_select",
        title: "How long have you been using it?",
        required: false,
        options: [{ label: "Less than a month" }, { label: "A few months" }, { label: "Over a year" }],
      },
      {
        ref: "evaluating_against",
        type: "short_text",
        title: "What else are you looking at?",
        description: "No wrong answer — it tells us which comparisons are worth writing.",
        required: false,
      },
      {
        ref: "writing_found_via",
        type: "short_text",
        title: "What did you read that brought you here?",
        required: false,
      },
      {
        ref: "topics",
        type: "multi_select",
        title: "What should we send you?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Product updates" },
          { label: "How-to guides" },
          { label: "Customer stories" },
          { label: "Industry news" },
          { label: "Events and webinars" },
          { label: "Engineering write-ups" },
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
    branches: [
      { when: "reader_type", is: "I use the product", then: "customer_since" },
      { when: "reader_type", is: "I'm deciding whether to", then: "evaluating_against" },
      { when: "reader_type", is: "I'm here for the writing, not the product", then: "writing_found_via" },
    ],
    ending: { title: "Subscribed ✉️", body: "Check your inbox to confirm." },
  }),

  defineTemplate({
    slug: "webinar-registration",
    title: "Webinar registration",
    category: "Marketing",
    icon: "Video",
    description: "Register attendees, and ask the no-shows what would have helped.",
    blurb:
      "The best webinar Q&A is written before the webinar starts. This asks what they want covered, and splits the people joining live from the ones who only want the recording — because those two get different emails afterwards and should be told so now.",
    tags: ["webinar", "events", "leads"],
    greeting: "Save your seat — takes about a minute.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Where should we send the joining link?", required: true, businessOnly: true },
      { ref: "company", type: "short_text", title: "Company?", required: false },
      { ref: "job_title", type: "short_text", title: "Job title?", required: false },
      {
        ref: "familiarity",
        type: "single_select",
        title: "How familiar are you with the topic?",
        description: "So the speaker knows how much ground to cover before the interesting part.",
        required: true,
        options: [
          { label: "New to it" },
          { label: "I know the basics" },
          { label: "I work with it regularly" },
        ],
      },
      {
        ref: "attendance",
        type: "single_select",
        title: "Will you join live?",
        required: true,
        options: [{ label: "Yes, live" }, { label: "No — send me the recording" }],
      },

      // ── joining live ──
      {
        ref: "question",
        type: "long_text",
        title: "Anything you'd like the speaker to cover?",
        description: "Questions submitted in advance get answered first.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "reminder",
        type: "single_select",
        title: "When should we remind you?",
        required: false,
        options: [{ label: "A day before" }, { label: "An hour before" }, { label: "Both" }, { label: "Neither" }],
      },

      // ── recording only ──
      {
        ref: "cannot_attend_reason",
        type: "single_select",
        title: "What's getting in the way?",
        description: "If it's the time, we'll run it again in your timezone.",
        required: false,
        options: [
          { label: "Wrong time of day for me" },
          { label: "Wrong day" },
          { label: "I just prefer recordings" },
          { label: "Something else" },
        ],
      },
      { ref: "timezone", type: "short_text", title: "Which timezone are you in?", required: false },
    ],
    branches: [
      { when: "attendance", is: "Yes, live", then: "question" },
      { when: "attendance", is: "No — send me the recording", then: "cannot_attend_reason" },
      { when: "reminder", always: true, then: "end_thanks" },
      { when: "timezone", always: true, then: "end_recording" },
    ],
    endings: [
      {
        ref: "end_recording",
        title: "We'll send the recording 📼",
        body: "It goes out within a day of the session. No need to be anywhere.",
      },
    ],
    ending: { title: "See you there 🎥", body: "The calendar invite is on its way." },
  }),

  defineTemplate({
    slug: "content-download",
    title: "Content download",
    category: "Marketing",
    icon: "Download",
    description: "Gate a guide without making it feel like a toll booth.",
    blurb:
      "Every extra field costs downloads faster than it gains lead quality — so the file is unlocked after four questions, and the two that qualify are asked only of the people already researching a purchase. Everyone else gets their guide and is left alone.",
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
        required: true,
        options: [
          { label: "Researching a purchase" },
          { label: "Solving a specific problem" },
          { label: "General learning" },
        ],
      },

      // ── researching a purchase ──
      {
        ref: "buying_timeline",
        type: "single_select",
        title: "How soon would you want something in place?",
        required: false,
        options: [{ label: "This month" }, { label: "This quarter" }, { label: "Later this year" }, { label: "No date yet" }],
      },
      {
        ref: "wants_call",
        type: "yes_no",
        title: "Want someone to walk you through it?",
        required: false,
        yesLabel: "Yes, get in touch",
        noLabel: "No thanks, just the guide",
      },

      // ── solving a specific problem ──
      {
        ref: "the_problem",
        type: "long_text",
        title: "What are you trying to fix?",
        description: "If the guide doesn't answer it, we'll send something that does.",
        required: false,
        maxLength: 600,
      },

      // ── general learning ──
      {
        ref: "learning_focus",
        type: "single_select",
        title: "Which part are you most curious about?",
        required: false,
        options: [
          { label: "How it works under the hood" },
          { label: "What it costs to run" },
          { label: "How other teams use it" },
          { label: "All of it, really" },
        ],
      },

      // ── everyone ──
      {
        ref: "consent",
        type: "legal_consent",
        title: "Staying in touch",
        required: false,
        consentText: "Send me related resources occasionally. I can opt out at any time.",
      },
    ],
    branches: [
      { when: "interest", is: "Researching a purchase", then: "buying_timeline" },
      { when: "interest", is: "Solving a specific problem", then: "the_problem" },
      { when: "interest", is: "General learning", then: "learning_focus" },
      { when: "wants_call", is: true, then: "end_contact" },
      { when: "wants_call", is: false, then: "consent" },
    ],
    endings: [
      {
        ref: "end_contact",
        title: "Guide sent, and we'll be in touch 📄",
        body: "Someone who knows this properly will email you within a working day.",
      },
    ],
    ending: { title: "On its way 📄", body: "Check your inbox — it should arrive within a minute." },
  }),
];
