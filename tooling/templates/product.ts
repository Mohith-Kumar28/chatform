import { defineTemplate, type TemplateSeed } from "./define.js";

export const PRODUCT: TemplateSeed[] = [
  defineTemplate({
    slug: "nps-survey",
    title: "NPS survey",
    category: "Product",
    icon: "Gauge",
    description: "Measure loyalty with the standard question and a real follow-up.",
    blurb:
      "The score on its own tells you almost nothing you can act on. Asking why immediately after, while the number is still in mind, is what turns a metric into a list of things to fix.",
    tags: ["nps", "loyalty", "survey"],
    greeting: "One quick question — it takes about twenty seconds.",
    questions: [
      { ref: "score", type: "nps", title: "How likely are you to recommend us to a friend or colleague?", required: true },
      { ref: "reason", type: "long_text", title: "What's the main reason for your score?", required: false, maxLength: 1000 },
      {
        ref: "improvement",
        type: "long_text",
        title: "What's the one thing we could change that would matter most?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "follow_up_ok",
        type: "yes_no",
        title: "Would it be alright if someone followed up?",
        required: false,
        yesLabel: "Sure",
        noLabel: "No thanks",
      },
    ],
    ending: { title: "Thank you 💛", body: "Your answer shapes what we build next." },
  }),

  defineTemplate({
    slug: "csat-survey",
    title: "Customer satisfaction",
    category: "Product",
    icon: "SmilePlus",
    description: "Rate a specific interaction while it's still fresh.",
    blurb:
      "CSAT works when it's asked about one thing, straight after that thing happened. This asks about the experience, what got in the way, and whether it was resolved — three answers you can route on.",
    tags: ["csat", "feedback", "support"],
    greeting: "How did that go? A couple of questions while it's fresh.",
    questions: [
      { ref: "satisfaction", type: "rating", title: "How satisfied were you overall?", required: true, scale: 5, shape: "star" },
      {
        ref: "effort",
        type: "opinion_scale",
        title: "How easy was it to get what you needed?",
        required: true,
        steps: 7,
        labelLow: "Very difficult",
        labelHigh: "Very easy",
      },
      { ref: "resolved", type: "yes_no", title: "Was your issue fully resolved?", required: true },
      { ref: "friction", type: "long_text", title: "What got in the way, if anything?", required: false, maxLength: 800 },
    ],
    ending: { title: "Thanks for telling us ⭐", body: "" },
  }),

  defineTemplate({
    slug: "product-market-fit",
    title: "Product-market fit survey",
    category: "Product",
    icon: "Target",
    description: "The Sean Ellis question, plus the context that makes it useful.",
    blurb:
      "Ask how disappointed people would be if your product disappeared. Above about forty percent “very disappointed” is the usual fit signal — and the segment answering that way tells you who to build for.",
    tags: ["pmf", "research", "strategy"],
    greeting: "Five questions about how you use us. Honest answers help most.",
    questions: [
      {
        ref: "disappointment",
        type: "single_select",
        title: "How would you feel if you could no longer use this product?",
        required: true,
        options: [
          { label: "Very disappointed" },
          { label: "Somewhat disappointed" },
          { label: "Not disappointed" },
        ],
      },
      { ref: "who_benefits", type: "long_text", title: "What type of person do you think would benefit most from this?", required: true, maxLength: 600 },
      { ref: "main_benefit", type: "long_text", title: "What's the main benefit you get from it?", required: true, maxLength: 800 },
      { ref: "improvement", type: "long_text", title: "How can we improve it for you?", required: false, maxLength: 1000 },
      {
        ref: "role",
        type: "single_select",
        title: "What best describes your role?",
        required: false,
        options: [
          { label: "Founder or exec" },
          { label: "Engineering" },
          { label: "Design" },
          { label: "Marketing" },
          { label: "Operations" },
          { label: "Something else" },
        ],
      },
    ],
    ending: { title: "Really useful — thank you 🙏", body: "" },
  }),

  defineTemplate({
    slug: "feature-request",
    title: "Feature request",
    category: "Product",
    icon: "Lightbulb",
    description: "Capture the problem behind the request, not just the request.",
    blurb:
      "People ask for solutions; roadmaps need problems. Asking what they are trying to do and how they work around it today turns a wishlist into something a product team can actually prioritise.",
    tags: ["roadmap", "feedback", "product"],
    greeting: "Got an idea? Tell us what you're trying to do and we'll take it from there.",
    questions: [
      { ref: "request", type: "short_text", title: "In one line, what would you like to be able to do?", required: true, maxLength: 200 },
      { ref: "problem", type: "long_text", title: "What are you trying to accomplish?", required: true, maxLength: 1200 },
      { ref: "workaround", type: "long_text", title: "How do you handle it today?", required: false, maxLength: 800 },
      {
        ref: "importance",
        type: "single_select",
        title: "How much would this change your day?",
        required: true,
        options: [
          { label: "It's blocking me right now" },
          { label: "It would save me real time" },
          { label: "It would be nice to have" },
        ],
      },
      { ref: "email", type: "email", title: "Where can we reach you if we build it?", required: false },
    ],
    ending: { title: "Logged 💡", body: "We read every one of these." },
  }),

  defineTemplate({
    slug: "beta-signup",
    title: "Beta signup",
    category: "Product",
    icon: "FlaskConical",
    description: "Recruit testers who will actually test.",
    blurb:
      "A beta list full of people who never log in is worse than a short one. Asking about their setup and how much time they can give lets you invite in the order that gets you feedback fastest.",
    tags: ["beta", "research", "recruiting"],
    greeting: "Want early access? Tell us a little about how you'd use it.",
    questions: [
      { ref: "email", type: "email", title: "Your email?", required: true },
      { ref: "company", type: "short_text", title: "Where do you work?", required: false },
      {
        ref: "platform",
        type: "multi_select",
        title: "Which platforms do you need?",
        required: true,
        maxSelections: 5,
        options: [
          { label: "Web" },
          { label: "iOS" },
          { label: "Android" },
          { label: "Desktop" },
          { label: "API only" },
        ],
      },
      {
        ref: "time_commitment",
        type: "single_select",
        title: "How much time could you give in the first month?",
        required: true,
        options: [
          { label: "An hour or two" },
          { label: "A few hours" },
          { label: "As much as it takes" },
        ],
      },
      { ref: "use_case", type: "long_text", title: "What would you try first?", required: false, maxLength: 800 },
      {
        ref: "nda_consent",
        type: "legal_consent",
        title: "Keeping it quiet",
        required: true,
        consentText:
          "I understand the beta is confidential and agree not to share screenshots or details publicly until launch.",
      },
    ],
    ending: { title: "You're on the list 🧪", body: "We'll email you when your invite is ready." },
  }),

  defineTemplate({
    slug: "cancellation-survey",
    title: "Cancellation survey",
    category: "Product",
    icon: "DoorOpen",
    description: "Find out why people leave, without begging them to stay.",
    blurb:
      "The exit is the most honest moment you get. Keep it short, ask the real reason as a choice you can count, and leave one open box for the thing your options didn't anticipate.",
    tags: ["churn", "retention", "feedback"],
    greeting: "Sorry to see you go. Two questions, and then you're done.",
    questions: [
      {
        ref: "reason",
        type: "single_select",
        title: "What's the main reason you're cancelling?",
        required: true,
        options: [
          { label: "Too expensive" },
          { label: "Missing a feature I need" },
          { label: "Too hard to use" },
          { label: "Found a better alternative" },
          { label: "No longer need it" },
          { label: "Something else" },
        ],
      },
      { ref: "detail", type: "long_text", title: "Anything you'd like to add?", required: false, maxLength: 1000 },
      {
        ref: "would_return",
        type: "yes_no",
        title: "Would you consider coming back if we fixed that?",
        required: false,
        yesLabel: "Maybe",
        noLabel: "Unlikely",
      },
    ],
    ending: { title: "Thanks for the honesty 👋", body: "Your account stays active until the end of the period." },
  }),
];
