import { defineTemplate, type TemplateSeed } from "./define.js";

export const SUPPORT: TemplateSeed[] = [
  defineTemplate({
    slug: "bug-report",
    title: "Bug report",
    category: "Support",
    icon: "Bug",
    description: "Get reproducible reports instead of “it's broken”.",
    blurb:
      "Asks for the three things an engineer needs and a reporter always forgets: what they expected, what happened, and the exact steps between. Where it happened decides what is asked next — a browser gets asked about the console, a phone about its model and OS — and anyone who says they cannot work at all is routed straight to a human.",
    tags: ["bugs", "engineering", "triage", "branching"],
    greeting: "Sorry something's broken. Let's get the details down.",
    questions: [
      { ref: "summary", type: "short_text", title: "In one line, what went wrong?", required: true, maxLength: 160 },
      { ref: "steps", type: "long_text", title: "What steps lead to it? Number them if you can.", required: true, maxLength: 2000 },
      { ref: "expected", type: "short_text", title: "What did you expect to happen?", required: true, maxLength: 300 },
      { ref: "actual", type: "short_text", title: "What happened instead?", required: true, maxLength: 300 },
      {
        ref: "frequency",
        type: "single_select",
        title: "How often does it happen?",
        required: true,
        options: [
          { label: "Every time" },
          { label: "Most times" },
          { label: "Now and then" },
          { label: "It happened once" },
        ],
      },
      {
        ref: "environment",
        type: "single_select",
        title: "Where did it happen?",
        required: true,
        options: [
          { label: "In a desktop browser" },
          { label: "In the mobile app" },
          { label: "Through the API" },
        ],
      },

      // ── desktop browser ──
      {
        ref: "browser",
        type: "single_select",
        title: "Which browser?",
        required: true,
        options: [{ label: "Chrome" }, { label: "Safari" }, { label: "Firefox" }, { label: "Edge" }, { label: "Something else" }],
      },
      {
        ref: "console_errors",
        type: "long_text",
        title: "Anything red in the developer console?",
        description: "Right-click → Inspect → Console. Paste whatever is there; if nothing is, say so.",
        required: false,
        maxLength: 2000,
      },
      {
        ref: "incognito",
        type: "yes_no",
        title: "Does it still happen in a private window?",
        description: "This is how we tell an extension apart from a real bug in about ten seconds.",
        required: false,
        yesLabel: "Yes, still broken",
        noLabel: "No, it works there",
      },

      // ── mobile app ──
      { ref: "device_model", type: "short_text", title: "Which phone or tablet?", required: true },
      { ref: "os_version", type: "short_text", title: "Which OS version?", required: false },
      { ref: "app_version", type: "short_text", title: "Which app version? It's at the bottom of Settings.", required: false },

      // ── API ──
      { ref: "endpoint", type: "short_text", title: "Which endpoint?", required: true, maxLength: 200 },
      {
        ref: "status_code",
        type: "number",
        title: "What status code came back?",
        required: false,
        integerOnly: true,
        min: 100,
        max: 599,
      },
      {
        ref: "request_id",
        type: "short_text",
        title: "The request id from the response headers, if you have it",
        required: false,
      },

      // ── everyone ──
      {
        ref: "severity",
        type: "single_select",
        title: "How badly is this affecting you?",
        required: true,
        options: [
          { label: "I can't work at all" },
          { label: "There's a workaround, but it's painful" },
          { label: "Minor annoyance" },
        ],
      },
      {
        ref: "screenshot",
        type: "file_upload",
        title: "A screenshot or recording, if you have one",
        required: false,
        accept: ["image/*", "video/*"],
        maxFiles: 3,
        maxSizeMB: 25,
      },
      { ref: "email", type: "email", title: "Where should we reply?", required: true },
    ],
    branches: [
      { when: "environment", is: "In a desktop browser", then: "browser" },
      { when: "environment", is: "In the mobile app", then: "device_model" },
      { when: "environment", is: "Through the API", then: "endpoint" },
      { when: "incognito", always: true, then: "severity" },
      { when: "app_version", always: true, then: "severity" },
      { when: "severity", is: "I can't work at all", then: "end_urgent" },
    ],
    endings: [
      {
        ref: "end_urgent",
        title: "Flagged as blocking 🚨",
        body: "Send a screenshot to support if you have one. Someone is looking at this now.",
      },
    ],
    ending: { title: "Reported 🐛", body: "Thanks — a real person reads every one of these." },
  }),

  defineTemplate({
    slug: "support-ticket",
    title: "Support ticket",
    category: "Support",
    icon: "LifeBuoy",
    description: "Route requests to the right queue, with the details that queue needs.",
    blurb:
      "Category asked up front is what lets a ticket reach the right person without a triage pass — and each category can then ask its own thing. Billing gets an invoice number, login gets the error text, a how-to gets a chance to be answered by a link instead of a person.",
    tags: ["support", "helpdesk", "triage", "branching"],
    greeting: "How can we help? Tell us what's going on.",
    questions: [
      { ref: "email", type: "email", title: "The email on your account?", required: true },
      {
        ref: "category",
        type: "single_select",
        title: "What's this about?",
        required: true,
        options: [
          { label: "Billing or invoices" },
          { label: "Account and login" },
          { label: "Something isn't working" },
          { label: "How do I…?" },
          { label: "Something else" },
        ],
      },

      // ── billing ──
      { ref: "invoice_number", type: "short_text", title: "Which invoice? The number is top-right.", required: false },
      {
        ref: "billing_issue",
        type: "single_select",
        title: "What's wrong with it?",
        required: true,
        options: [
          { label: "Charged the wrong amount" },
          { label: "Charged twice" },
          { label: "Need a VAT or tax number added" },
          { label: "Want to change plan" },
          { label: "Card was declined" },
        ],
      },

      // ── account and login ──
      {
        ref: "login_error",
        type: "short_text",
        title: "What does the error say, word for word?",
        required: false,
        maxLength: 300,
      },
      {
        ref: "login_method",
        type: "single_select",
        title: "How do you normally sign in?",
        required: true,
        options: [{ label: "Email and password" }, { label: "Google" }, { label: "A magic link" }, { label: "SSO" }],
      },

      // ── something isn't working ──
      {
        ref: "broken_where",
        type: "short_text",
        title: "Where in the product?",
        description: "The page name or the URL is perfect.",
        required: true,
      },
      {
        ref: "broken_since",
        type: "single_select",
        title: "Since when?",
        required: false,
        options: [{ label: "Just now" }, { label: "Today" }, { label: "This week" }, { label: "It's never worked" }],
      },

      // ── how do I ──
      {
        ref: "trying_to_do",
        type: "long_text",
        title: "What are you trying to get done?",
        description: "Describe the outcome, not the button — we'll often know a shorter way.",
        required: true,
        maxLength: 1000,
      },

      // ── everyone ──
      {
        ref: "urgency",
        type: "single_select",
        title: "How urgent is it?",
        required: true,
        options: [
          { label: "Blocking — I can't work" },
          { label: "Important, but I can wait a day" },
          { label: "Whenever you get to it" },
        ],
      },
      { ref: "description", type: "long_text", title: "Anything else we should know?", required: false, maxLength: 2000 },
      {
        ref: "attachment",
        type: "file_upload",
        title: "Anything to attach?",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 3,
      },
    ],
    branches: [
      { when: "category", is: "Billing or invoices", then: "invoice_number" },
      { when: "category", is: "Account and login", then: "login_error" },
      { when: "category", is: "Something isn't working", then: "broken_where" },
      { when: "category", is: "How do I…?", then: "trying_to_do" },
      { when: "category", is: "Something else", then: "urgency" },
      { when: "billing_issue", always: true, then: "urgency" },
      { when: "login_method", always: true, then: "urgency" },
      { when: "broken_since", always: true, then: "urgency" },
      { when: "trying_to_do", always: true, then: "urgency" },
    ],
    ending: { title: "Ticket created 🎫", body: "We reply to most tickets within a few hours." },
  }),

  defineTemplate({
    slug: "contact-us",
    title: "Contact us",
    category: "Support",
    icon: "MessageCircle",
    description: "A general enquiry form that sorts the inbox as it fills it.",
    blurb:
      "The one form every site needs. What the message is about decides the two or three follow-ups worth asking — a sales enquiry gets company and size, press gets a deadline, careers gets pointed at the actual openings — so nothing arrives needing a reply that just asks for more.",
    tags: ["contact", "general", "inbox", "branching"],
    greeting: "Hi! What can we help you with?",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Your email?", required: true },
      {
        ref: "topic",
        type: "single_select",
        title: "What's it about?",
        required: true,
        options: [
          { label: "Sales enquiry" },
          { label: "Support" },
          { label: "Press or media" },
          { label: "Careers" },
          { label: "Something else" },
        ],
      },

      // ── sales ──
      { ref: "company", type: "short_text", title: "Which company?", required: true },
      {
        ref: "team_size",
        type: "single_select",
        title: "How many people would use it?",
        required: false,
        options: [{ label: "Just me" }, { label: "2–10" }, { label: "11–50" }, { label: "51–200" }, { label: "200+" }],
      },

      // ── support ──
      { ref: "account_email", type: "email", title: "The email on your account, if different?", required: false },

      // ── press ──
      { ref: "outlet", type: "short_text", title: "Which publication?", required: true },
      { ref: "deadline", type: "date", title: "What's your deadline?", required: false, disablePast: true },

      // ── careers ──
      {
        ref: "career_interest",
        type: "single_select",
        title: "What kind of role?",
        required: false,
        options: [
          { label: "Engineering" },
          { label: "Design" },
          { label: "Product" },
          { label: "Sales" },
          { label: "Operations" },
          { label: "Open application" },
        ],
      },

      // ── everyone ──
      { ref: "message", type: "long_text", title: "Your message", required: true, maxLength: 2000 },
      {
        ref: "callback",
        type: "yes_no",
        title: "Would you prefer a call back?",
        required: false,
        yesLabel: "Yes, please call",
        noLabel: "Email is fine",
      },
      { ref: "phone", type: "phone", title: "Best number, and when to try?", required: true },
    ],
    branches: [
      { when: "topic", is: "Sales enquiry", then: "company" },
      { when: "topic", is: "Support", then: "account_email" },
      { when: "topic", is: "Press or media", then: "outlet" },
      { when: "topic", is: "Careers", then: "career_interest" },
      { when: "topic", is: "Something else", then: "message" },
      { when: "team_size", always: true, then: "message" },
      { when: "account_email", always: true, then: "message" },
      { when: "deadline", always: true, then: "message" },
      { when: "career_interest", always: true, then: "message" },
      { when: "callback", is: false, then: "end_thanks" },
    ],
    ending: { title: "Message sent 📨", body: "We usually reply within one working day." },
  }),

  defineTemplate({
    slug: "refund-request",
    title: "Refund request",
    category: "Support",
    icon: "ReceiptText",
    description: "Handle refunds with the evidence a finance team needs.",
    blurb:
      "Order reference, date, reason and preferred resolution — collected once so nobody has to email back asking for them. A damaged item is asked for a photo; a missing one for the tracking status; a duplicate charge for the second transaction. The reason list doubles as a running count of why people ask.",
    tags: ["refund", "billing", "ecommerce", "branching"],
    greeting: "Let's sort this out. A few details about the order.",
    questions: [
      { ref: "email", type: "email", title: "The email used for the order?", required: true },
      { ref: "order_reference", type: "short_text", title: "Order or invoice number", required: true, maxLength: 60 },
      { ref: "order_date", type: "date", title: "Roughly when did you order?", required: false },
      {
        ref: "reason",
        type: "single_select",
        title: "Why are you requesting a refund?",
        required: true,
        options: [
          { label: "Arrived damaged or faulty" },
          { label: "Never arrived" },
          { label: "Charged twice" },
          { label: "Not what I expected" },
          { label: "Changed my mind" },
        ],
      },

      // ── damaged ──
      {
        ref: "damage_photos",
        type: "file_upload",
        title: "Photos of the damage",
        description: "One of the item and one of the packaging is usually enough.",
        required: true,
        accept: ["image/*"],
        maxFiles: 5,
        maxSizeMB: 20,
      },
      {
        ref: "damage_when",
        type: "single_select",
        title: "When did you notice?",
        required: false,
        options: [{ label: "On opening it" }, { label: "Within a few days" }, { label: "After using it a while" }],
      },

      // ── never arrived ──
      {
        ref: "tracking_status",
        type: "single_select",
        title: "What does the tracking say?",
        required: false,
        options: [
          { label: "Says delivered, but it isn't here" },
          { label: "Still in transit" },
          { label: "No tracking updates at all" },
          { label: "I don't have a tracking number" },
        ],
      },
      { ref: "delivery_address", type: "address", title: "Confirm the delivery address", required: false, fields: ["street", "city", "postal", "country"] },

      // ── charged twice ──
      {
        ref: "duplicate_amounts",
        type: "short_text",
        title: "What amounts and dates do you see on your statement?",
        required: true,
        maxLength: 200,
      },

      // ── not what I expected / changed my mind ──
      {
        ref: "expectation_gap",
        type: "long_text",
        title: "What was different from what you expected?",
        required: false,
        maxLength: 800,
      },

      // ── everyone ──
      {
        ref: "condition",
        type: "single_select",
        title: "What condition is it in now?",
        required: true,
        options: [
          { label: "Unopened" },
          { label: "Opened but unused" },
          { label: "Used" },
          { label: "Damaged" },
          { label: "I never received it" },
        ],
      },
      {
        ref: "resolution",
        type: "single_select",
        title: "What would you like us to do?",
        required: true,
        options: [{ label: "Refund to my original payment method" }, { label: "Store credit" }, { label: "Replacement" }],
      },
      { ref: "detail", type: "long_text", title: "Anything else we should know?", required: false, maxLength: 1000 },
    ],
    branches: [
      { when: "reason", is: "Arrived damaged or faulty", then: "damage_photos" },
      { when: "reason", is: "Never arrived", then: "tracking_status" },
      { when: "reason", is: "Charged twice", then: "duplicate_amounts" },
      { when: "reason", is: "Not what I expected", then: "expectation_gap" },
      { when: "reason", is: "Changed my mind", then: "expectation_gap" },
      { when: "damage_when", always: true, then: "condition" },
      { when: "delivery_address", always: true, then: "condition" },
      { when: "duplicate_amounts", always: true, then: "end_finance" },
    ],
    endings: [
      {
        ref: "end_finance",
        title: "Sent to finance 💳",
        body: "A duplicate charge is usually reversed within three working days, without anything else from you.",
      },
    ],
    ending: { title: "Request received 💳", body: "Refunds are usually processed within five working days." },
  }),
];
