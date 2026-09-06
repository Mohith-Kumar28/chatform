import { defineTemplate, type TemplateSeed } from "./define.js";

export const PRODUCT: TemplateSeed[] = [
  defineTemplate({
    slug: "nps-survey",
    title: "NPS survey",
    category: "Product",
    icon: "Gauge",
    description: "Measure loyalty, then ask detractors and promoters different things.",
    blurb:
      "The score on its own tells you almost nothing you can act on, and the same follow-up cannot serve both ends of it. Someone who scored a 3 is asked what went wrong; someone who scored a 10 is asked what to quote — so one survey produces a fix list and a testimonial list.",
    tags: ["nps", "loyalty", "survey", "branching"],
    greeting: "One quick question — it takes about twenty seconds.",
    questions: [
      { ref: "score", type: "nps", title: "How likely are you to recommend us to a friend or colleague?", required: true },

      // ── 0–6: detractors ──
      {
        ref: "went_wrong",
        type: "long_text",
        title: "What's gone wrong?",
        description: "Be blunt. This is read by the people who can fix it.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "problem_area",
        type: "single_select",
        title: "Where does the trouble mostly sit?",
        required: true,
        options: [
          { label: "It's missing something I need" },
          { label: "It's unreliable" },
          { label: "It's hard to use" },
          { label: "Support hasn't helped" },
          { label: "It costs more than it's worth" },
        ],
      },
      {
        ref: "at_risk",
        type: "yes_no",
        title: "Are you considering leaving?",
        required: false,
        yesLabel: "Honestly, yes",
        noLabel: "Not right now",
      },

      // ── 7–10: passives and promoters ──
      {
        ref: "what_works",
        type: "long_text",
        title: "What's working well for you?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "quote_ok",
        type: "yes_no",
        title: "May we quote that publicly?",
        description: "With your first name and company, and never without showing you first.",
        required: false,
        yesLabel: "Yes, go ahead",
        noLabel: "Please don't",
      },

      // ── everyone ──
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
      { ref: "email", type: "email", title: "Where should we reach you?", required: false },
    ],
    branches: [
      { when: "score", op: "lte", is: 6, then: "went_wrong" },
      { when: "score", op: "gte", is: 7, then: "what_works" },
      { when: "at_risk", always: true, then: "improvement" },
      { when: "follow_up_ok", is: false, then: "end_thanks" },
    ],
    ending: { title: "Thank you 💛", body: "Your answer shapes what we build next." },
  }),

  defineTemplate({
    slug: "csat-survey",
    title: "Customer satisfaction",
    category: "Product",
    icon: "SmilePlus",
    description: "Rate a specific interaction, and dig only where it went badly.",
    blurb:
      "CSAT works when it is asked about one thing, straight after that thing happened. A happy answer is three taps and done; an unhappy one opens the questions that make the complaint actionable, and offers a human. Nobody is asked what went wrong when nothing did.",
    tags: ["csat", "feedback", "support", "branching"],
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

      // ── not resolved ──
      {
        ref: "still_wrong",
        type: "long_text",
        title: "What's still outstanding?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "friction",
        type: "single_select",
        title: "What got in the way?",
        required: false,
        options: [
          { label: "It took too long" },
          { label: "I had to repeat myself" },
          { label: "The answer didn't fit my situation" },
          { label: "I was sent to the wrong place" },
          { label: "Something else" },
        ],
      },
      {
        ref: "callback",
        type: "yes_no",
        title: "Would you like someone to pick this up with you?",
        required: true,
        yesLabel: "Yes please",
        noLabel: "No, I'll manage",
      },
      { ref: "callback_email", type: "email", title: "Where can they reach you?", required: true },

      // ── resolved ──
      {
        ref: "what_helped",
        type: "short_text",
        title: "What made the difference?",
        required: false,
      },
    ],
    branches: [
      { when: "resolved", is: false, then: "still_wrong" },
      { when: "resolved", is: true, then: "what_helped" },
      { when: "callback", is: false, then: "end_thanks" },
      { when: "callback_email", always: true, then: "end_followup" },
    ],
    endings: [
      {
        ref: "end_followup",
        title: "Someone will be in touch 📮",
        body: "We've flagged this as unresolved. Expect a reply within one working day.",
      },
    ],
    ending: { title: "Thanks for telling us ⭐", body: "" },
  }),

  defineTemplate({
    slug: "product-market-fit",
    title: "Product-market fit survey",
    category: "Product",
    icon: "Target",
    description: "The Sean Ellis question, with a different follow-up for each answer.",
    blurb:
      "Ask how disappointed people would be if your product disappeared. Above about forty percent “very disappointed” is the usual fit signal — but the useful part is what each group says next, so the three answers lead to three different conversations instead of one generic one.",
    tags: ["pmf", "research", "strategy", "branching"],
    greeting: "A few questions about how you use us. Honest answers help most.",
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

      // ── very disappointed: the segment you are building for ──
      {
        ref: "main_benefit",
        type: "long_text",
        title: "What's the main benefit you get from it?",
        description: "In your own words — we use these almost verbatim on the site.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "who_benefits",
        type: "long_text",
        title: "What type of person do you think would benefit most from this?",
        required: true,
        maxLength: 600,
      },

      // ── somewhat disappointed: the segment you can convert ──
      {
        ref: "whats_missing",
        type: "long_text",
        title: "What would have to be true for you to be very disappointed?",
        required: true,
        maxLength: 800,
      },

      // ── not disappointed: the segment you are not for ──
      {
        ref: "alternative",
        type: "short_text",
        title: "What would you use instead?",
        required: false,
      },

      // ── everyone ──
      { ref: "improvement", type: "long_text", title: "How can we improve it for you?", required: false, maxLength: 1000 },
      {
        ref: "usage",
        type: "single_select",
        title: "How often do you use it?",
        required: true,
        options: [{ label: "Every day" }, { label: "A few times a week" }, { label: "A few times a month" }, { label: "Rarely" }],
      },
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
      {
        ref: "team_size",
        type: "single_select",
        title: "How big is the team you work in?",
        required: false,
        options: [{ label: "Just me" }, { label: "2–10" }, { label: "11–50" }, { label: "51–200" }, { label: "200+" }],
      },
    ],
    branches: [
      { when: "disappointment", is: "Very disappointed", then: "main_benefit" },
      { when: "disappointment", is: "Somewhat disappointed", then: "whats_missing" },
      { when: "disappointment", is: "Not disappointed", then: "alternative" },
      { when: "who_benefits", always: true, then: "improvement" },
      { when: "whats_missing", always: true, then: "improvement" },
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
      "People ask for solutions; roadmaps need problems. This asks what they are trying to do and how they work around it today — and when someone says they are blocked right now, it takes that seriously and collects enough to reply to them personally.",
    tags: ["roadmap", "feedback", "product", "branching"],
    greeting: "Got an idea? Tell us what you're trying to do and we'll take it from there.",
    questions: [
      { ref: "request", type: "short_text", title: "In one line, what would you like to be able to do?", required: true, maxLength: 200 },
      { ref: "problem", type: "long_text", title: "What are you trying to accomplish?", required: true, maxLength: 1200 },
      { ref: "workaround", type: "long_text", title: "How do you handle it today?", required: false, maxLength: 800 },
      {
        ref: "area",
        type: "single_select",
        title: "Which part of the product is this about?",
        required: true,
        options: [
          { label: "Building and editing" },
          { label: "Sharing and publishing" },
          { label: "Results and reporting" },
          { label: "Integrations" },
          { label: "Billing and admin" },
          { label: "Something else" },
        ],
      },
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

      // ── blocked right now ──
      {
        ref: "blocking_since",
        type: "date",
        title: "Since when?",
        required: false,
      },
      {
        ref: "blocking_impact",
        type: "long_text",
        title: "What can't you do until this exists?",
        required: true,
        maxLength: 800,
      },
      { ref: "blocking_email", type: "email", title: "Where can we reach you today?", required: true },

      // ── everyone else ──
      {
        ref: "how_often",
        type: "single_select",
        title: "How often would you use it?",
        required: false,
        options: [{ label: "Daily" }, { label: "Weekly" }, { label: "Monthly" }, { label: "Now and then" }],
      },
      { ref: "email", type: "email", title: "Where can we reach you if we build it?", required: false },
    ],
    branches: [
      { when: "importance", is: "It's blocking me right now", then: "blocking_since" },
      { when: "importance", is: "It would save me real time", then: "how_often" },
      { when: "importance", is: "It would be nice to have", then: "how_often" },
      { when: "blocking_email", always: true, then: "end_urgent" },
    ],
    endings: [
      {
        ref: "end_urgent",
        title: "Flagged as blocking 🚧",
        body: "Someone will reply today — often with a workaround before the fix exists.",
      },
    ],
    ending: { title: "Logged 💡", body: "We read every one of these." },
  }),

  defineTemplate({
    slug: "beta-signup",
    title: "Beta signup",
    category: "Product",
    icon: "FlaskConical",
    description: "Recruit testers who will actually test, sorted by platform.",
    blurb:
      "A beta list full of people who never log in is worse than a short one. This asks about their setup, their appetite for rough edges and how much time they can give — and everyone who says they can give real time gets asked the questions that decide the first invite wave.",
    tags: ["beta", "research", "recruiting", "branching"],
    greeting: "Want early access? Tell us a little about how you'd use it.",
    questions: [
      { ref: "email", type: "email", title: "Your email?", required: true },
      { ref: "name", type: "short_text", title: "And your name?", required: false },
      { ref: "company", type: "short_text", title: "Where do you work?", required: false },
      {
        ref: "platform",
        type: "multi_select",
        title: "Which platforms do you need?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [{ label: "Web" }, { label: "iOS" }, { label: "Android" }, { label: "Desktop" }, { label: "API only" }],
      },
      { ref: "use_case", type: "long_text", title: "What would you try first?", required: true, maxLength: 800 },
      {
        ref: "time_commitment",
        type: "single_select",
        title: "How much time could you give in the first month?",
        required: true,
        options: [
          { label: "As much as it takes" },
          { label: "A few hours" },
          { label: "An hour or two" },
        ],
      },

      // ── the people who can give real time ──
      {
        ref: "feedback_style",
        type: "multi_select",
        title: "How would you rather give feedback?",
        required: false,
        minSelections: 0,
        maxSelections: 4,
        options: [
          { label: "Written notes as I go" },
          { label: "A call every couple of weeks" },
          { label: "Bug reports only" },
          { label: "Screen recordings" },
        ],
      },
      {
        ref: "rough_edges",
        type: "opinion_scale",
        title: "How much roughness can you live with?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Must basically work",
        labelHigh: "Break it, I'll tell you how",
      },
      {
        ref: "call_slot",
        type: "single_select",
        title: "Best time for an occasional call?",
        required: false,
        options: [{ label: "Mornings" }, { label: "Afternoons" }, { label: "Evenings" }, { label: "I'd rather not" }],
      },

      // ── everyone ──
      {
        ref: "nda_consent",
        type: "legal_consent",
        title: "Keeping it quiet",
        required: true,
        consentText:
          "I understand the beta is confidential and agree not to share screenshots or details publicly until launch.",
      },
    ],
    branches: [
      { when: "time_commitment", is: "As much as it takes", then: "feedback_style" },
      { when: "time_commitment", is: "A few hours", then: "feedback_style" },
      { when: "time_commitment", is: "An hour or two", then: "nda_consent" },
    ],
    ending: { title: "You're on the list 🧪", body: "We'll email you when your invite is ready." },
  }),

  defineTemplate({
    slug: "cancellation-survey",
    title: "Cancellation survey",
    category: "Product",
    icon: "DoorOpen",
    description: "Find out why people leave, and offer the right thing to the ones you can keep.",
    blurb:
      "The exit is the most honest moment you get, and the reason decides what is worth saying next. Price gets a question about what would have worked; a missing feature gets asked which one; “no longer need it” gets left alone. Nobody is talked out of leaving — they are asked the one thing their answer makes worth asking.",
    tags: ["churn", "retention", "feedback", "branching"],
    greeting: "Sorry to see you go. A couple of questions, and then you're done.",
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

      // ── price ──
      {
        ref: "price_fair",
        type: "single_select",
        title: "What would have felt fair?",
        required: false,
        options: [
          { label: "Half what I'm paying" },
          { label: "A bit less" },
          { label: "The price is fine — the value wasn't" },
          { label: "A smaller plan would have worked" },
        ],
      },

      // ── missing feature ──
      {
        ref: "missing_feature",
        type: "short_text",
        title: "Which feature?",
        required: true,
        maxLength: 200,
      },
      {
        ref: "missing_blocked",
        type: "yes_no",
        title: "Did that block you outright, or just slow you down?",
        required: false,
        yesLabel: "Blocked me",
        noLabel: "Slowed me down",
      },

      // ── too hard to use ──
      {
        ref: "hard_where",
        type: "long_text",
        title: "Where did it lose you?",
        required: false,
        maxLength: 800,
      },

      // ── a competitor ──
      { ref: "competitor", type: "short_text", title: "What are you moving to?", required: false },
      {
        ref: "competitor_why",
        type: "long_text",
        title: "What do they do better?",
        required: false,
        maxLength: 800,
      },

      // ── everyone ──
      { ref: "detail", type: "long_text", title: "Anything you'd like to add?", required: false, maxLength: 1000 },
      {
        ref: "would_return",
        type: "yes_no",
        title: "Would you consider coming back if we fixed that?",
        required: false,
        yesLabel: "Maybe",
        noLabel: "Unlikely",
      },
      {
        ref: "keep_in_touch",
        type: "email",
        title: "Want us to let you know when we do?",
        description: "Only for this — no marketing.",
        required: false,
      },
    ],
    branches: [
      { when: "reason", is: "Too expensive", then: "price_fair" },
      { when: "reason", is: "Missing a feature I need", then: "missing_feature" },
      { when: "reason", is: "Too hard to use", then: "hard_where" },
      { when: "reason", is: "Found a better alternative", then: "competitor" },
      { when: "reason", is: "No longer need it", then: "detail" },
      { when: "reason", is: "Something else", then: "detail" },
      { when: "price_fair", always: true, then: "detail" },
      { when: "missing_blocked", always: true, then: "detail" },
      { when: "hard_where", always: true, then: "detail" },
      { when: "would_return", is: false, then: "end_thanks" },
    ],
    ending: { title: "Thanks for the honesty 👋", body: "Your account stays active until the end of the period." },
  }),
];
