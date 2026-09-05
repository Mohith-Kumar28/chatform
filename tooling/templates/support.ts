import { defineTemplate, type TemplateSeed } from "./define.js";

export const SUPPORT: TemplateSeed[] = [
  defineTemplate({
    slug: "bug-report",
    title: "Bug report",
    category: "Support",
    icon: "Bug",
    description: "Get reproducible reports instead of “it's broken”.",
    blurb:
      "Asks for the three things an engineer needs and a reporter always forgets: what they expected, what happened, and the exact steps between. Severity and environment come as fields you can filter on.",
    tags: ["bugs", "engineering", "triage"],
    greeting: "Sorry something's broken. Let's get the details down.",
    questions: [
      { ref: "summary", type: "short_text", title: "In one line, what went wrong?", required: true, maxLength: 160 },
      { ref: "steps", type: "long_text", title: "What steps lead to it? Number them if you can.", required: true, maxLength: 2000 },
      { ref: "expected", type: "short_text", title: "What did you expect to happen?", required: true, maxLength: 300 },
      { ref: "actual", type: "short_text", title: "What happened instead?", required: true, maxLength: 300 },
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
        ref: "environment",
        type: "single_select",
        title: "Where did it happen?",
        required: true,
        options: [
          { label: "Chrome" },
          { label: "Safari" },
          { label: "Firefox" },
          { label: "Edge" },
          { label: "Mobile app" },
          { label: "Somewhere else" },
        ],
      },
      { ref: "screenshot", type: "file_upload", title: "A screenshot or recording, if you have one", required: false, accept: ["image/*", "video/*"], maxFiles: 3, maxSizeMB: 25 },
      { ref: "email", type: "email", title: "Where should we reply?", required: true },
    ],
    ending: { title: "Reported 🐛", body: "Thanks — a real person reads every one of these." },
  }),

  defineTemplate({
    slug: "support-ticket",
    title: "Support ticket",
    category: "Support",
    icon: "LifeBuoy",
    description: "Route requests to the right queue on the way in.",
    blurb:
      "Category and urgency asked up front are what let a ticket reach the right person without a triage pass. The account field means the first reply can already know who's asking.",
    tags: ["support", "helpdesk", "triage"],
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
      { ref: "description", type: "long_text", title: "Tell us what's happening", required: true, maxLength: 2000 },
      { ref: "attachment", type: "file_upload", title: "Anything to attach?", required: false, accept: ["image/*", "application/pdf"], maxFiles: 3 },
    ],
    ending: { title: "Ticket created 🎫", body: "We reply to most tickets within a few hours." },
  }),

  defineTemplate({
    slug: "contact-us",
    title: "Contact us",
    category: "Support",
    icon: "MessageCircle",
    description: "A general enquiry form that still sorts the inbox.",
    blurb:
      "The one form every site needs, with a single choice added: what the message is about. That one field is the difference between a shared inbox and a routed one.",
    tags: ["contact", "general", "inbox"],
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
      { ref: "message", type: "long_text", title: "Your message", required: true, maxLength: 2000 },
      { ref: "callback", type: "yes_no", title: "Would you prefer a call back?", required: false },
    ],
    ending: { title: "Message sent 📨", body: "We usually reply within one working day." },
  }),

  defineTemplate({
    slug: "refund-request",
    title: "Refund request",
    category: "Support",
    icon: "ReceiptText",
    description: "Handle refunds with the details a finance team needs.",
    blurb:
      "Order reference, date, reason and preferred resolution — collected once so nobody has to email back asking for them. The reason list doubles as a running count of why people ask.",
    tags: ["refund", "billing", "ecommerce"],
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
          { label: "Not what I expected" },
          { label: "Arrived damaged or faulty" },
          { label: "Never arrived" },
          { label: "Charged twice" },
          { label: "Changed my mind" },
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
    ending: { title: "Request received 💳", body: "Refunds are usually processed within five working days." },
  }),
];
