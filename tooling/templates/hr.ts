import { defineTemplate, type TemplateSeed } from "./define.js";

export const HR: TemplateSeed[] = [
  defineTemplate({
    slug: "job-application",
    title: "Job application",
    category: "HR",
    icon: "Briefcase",
    description: "Screen candidates, and ask each discipline its own questions.",
    blurb:
      "Everything a first-pass review needs and nothing it doesn't. The role someone picks decides what they are asked next — engineers get a code sample, designers a portfolio walkthrough, sales a number — so one form serves five hiring managers without asking anyone an irrelevant question.",
    tags: ["hiring", "recruiting", "candidates", "branching"],
    greeting: "Glad you're interested in joining us. Let's start.",
    questions: [
      { ref: "name", type: "short_text", title: "Your full name?", required: true },
      { ref: "email", type: "email", title: "Email address?", required: true },
      { ref: "phone", type: "phone", title: "Phone number?", required: false },
      { ref: "location", type: "short_text", title: "Where are you based?", required: true },
      {
        ref: "work_setup",
        type: "single_select",
        title: "How would you want to work?",
        required: true,
        options: [{ label: "Fully remote" }, { label: "Hybrid" }, { label: "In the office" }],
      },
      {
        ref: "role",
        type: "single_select",
        title: "Which role are you applying for?",
        required: true,
        options: [
          { label: "Engineering" },
          { label: "Design" },
          { label: "Product" },
          { label: "Sales" },
          { label: "Operations" },
        ],
      },

      // ── engineering ──
      {
        ref: "eng_stack",
        type: "multi_select",
        title: "What do you work in most?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "TypeScript / JavaScript" },
          { label: "Python" },
          { label: "Go" },
          { label: "Rust" },
          { label: "Java or Kotlin" },
          { label: "Swift" },
        ],
      },
      { ref: "eng_code_sample", type: "url", title: "A link to something you've built or shipped", required: true },
      {
        ref: "eng_proudest",
        type: "long_text",
        title: "What's the hardest thing you've debugged, and how did you find it?",
        required: true,
        maxLength: 1500,
      },

      // ── design ──
      { ref: "design_portfolio", type: "url", title: "Link to your portfolio", required: true },
      {
        ref: "design_focus",
        type: "multi_select",
        title: "Where are you strongest?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Product and interaction" },
          { label: "Visual and brand" },
          { label: "Design systems" },
          { label: "Research" },
          { label: "Motion" },
        ],
      },
      {
        ref: "design_case",
        type: "long_text",
        title: "Pick one project and tell us what you changed and why",
        required: true,
        maxLength: 1500,
      },

      // ── product ──
      {
        ref: "product_shipped",
        type: "long_text",
        title: "Describe something you shipped and how you decided what to cut",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "product_metric",
        type: "short_text",
        title: "What number did you own?",
        required: false,
      },

      // ── sales ──
      {
        ref: "sales_quota",
        type: "number",
        title: "What annual quota have you carried, in thousands?",
        required: false,
        integerOnly: true,
        min: 0,
        currency: "USD",
      },
      {
        ref: "sales_deal_size",
        type: "single_select",
        title: "What size deals do you usually close?",
        required: true,
        options: [{ label: "Under $5k" }, { label: "$5k–$25k" }, { label: "$25k–$100k" }, { label: "$100k+" }],
      },
      {
        ref: "sales_market",
        type: "single_select",
        title: "Which market do you know best?",
        required: false,
        options: [{ label: "SMB" }, { label: "Mid-market" }, { label: "Enterprise" }, { label: "Developer tools" }],
      },

      // ── operations ──
      {
        ref: "ops_area",
        type: "multi_select",
        title: "Which of these have you owned?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Finance" },
          { label: "People and hiring" },
          { label: "Legal and compliance" },
          { label: "Customer operations" },
          { label: "Tooling and systems" },
          { label: "Vendor management" },
        ],
      },
      {
        ref: "ops_process",
        type: "long_text",
        title: "Describe a process you fixed and what it cost before",
        required: true,
        maxLength: 1500,
      },

      // ── everyone ──
      {
        ref: "experience_years",
        type: "number",
        title: "How many years of relevant experience?",
        required: true,
        integerOnly: true,
        min: 0,
        max: 60,
      },
      { ref: "portfolio", type: "url", title: "Anything else you'd like us to see?", required: false },
      {
        ref: "cv",
        type: "file_upload",
        title: "Attach your CV",
        required: false,
        accept: ["application/pdf", "application/msword"],
        maxFiles: 1,
        maxSizeMB: 10,
      },
      { ref: "motivation", type: "long_text", title: "Why do you want to work with us?", required: true, maxLength: 1500 },
      {
        ref: "notice_period",
        type: "single_select",
        title: "When could you start?",
        required: true,
        options: [
          { label: "Immediately" },
          { label: "Within a month" },
          { label: "One to three months" },
          { label: "Longer than three months" },
        ],
      },
      {
        ref: "right_to_work",
        type: "yes_no",
        title: "Do you have the right to work where this role is based?",
        required: true,
      },
      {
        ref: "accommodations",
        type: "long_text",
        title: "Anything we should do to make the process work for you?",
        description: "Interview format, timing, access — it never counts against an application.",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "role", is: "Engineering", then: "eng_stack" },
      { when: "role", is: "Design", then: "design_portfolio" },
      { when: "role", is: "Product", then: "product_shipped" },
      { when: "role", is: "Sales", then: "sales_quota" },
      { when: "role", is: "Operations", then: "ops_area" },
      { when: "eng_proudest", always: true, then: "experience_years" },
      { when: "design_case", always: true, then: "experience_years" },
      { when: "product_metric", always: true, then: "experience_years" },
      { when: "sales_market", always: true, then: "experience_years" },
    ],
    ending: { title: "Application received 🚀", body: "We review every application within a week, and reply either way." },
  }),

  defineTemplate({
    slug: "employee-onboarding",
    title: "Employee onboarding",
    category: "HR",
    icon: "UserCheck",
    description: "Collect what a new starter needs before day one.",
    blurb:
      "The details that otherwise arrive as five separate emails in the first week — legal name, address, kit, a signature on the handbook. Remote starters get shipping and home-setup questions; office starters get desk and access ones, and neither sees the other's.",
    tags: ["onboarding", "people ops", "new hire", "branching"],
    greeting: "Welcome aboard! A few details so everything's ready on your first day.",
    questions: [
      { ref: "legal_name", type: "short_text", title: "Your full legal name?", required: true },
      { ref: "preferred_name", type: "short_text", title: "What should we actually call you?", required: false },
      { ref: "pronouns", type: "short_text", title: "Pronouns, for the team directory?", required: false },
      { ref: "personal_email", type: "email", title: "A personal email we can reach you on", required: true },
      { ref: "phone", type: "phone", title: "Mobile number?", required: true },
      { ref: "start_date", type: "date", title: "Confirm your start date", required: true, disablePast: true },
      {
        ref: "work_location",
        type: "single_select",
        title: "Where will you be working from?",
        required: true,
        options: [{ label: "Remote" }, { label: "The office" }, { label: "A bit of both" }],
      },

      // ── remote ──
      {
        ref: "shipping_address",
        type: "address",
        title: "Where should we ship your kit?",
        required: true,
        fields: ["street", "city", "state", "postal", "country"],
      },
      {
        ref: "home_setup",
        type: "multi_select",
        title: "What do you already have at home?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "External monitor" },
          { label: "Keyboard and mouse" },
          { label: "Decent chair" },
          { label: "Headset" },
          { label: "Webcam" },
        ],
      },

      // ── the office ──
      {
        ref: "office_site",
        type: "dropdown",
        title: "Which office?",
        required: true,
        options: [{ label: "London" }, { label: "Berlin" }, { label: "New York" }, { label: "Bengaluru" }],
      },
      {
        ref: "commute",
        type: "single_select",
        title: "How will you get in?",
        description: "So we know whether to sort a parking space or a bike locker.",
        required: false,
        options: [{ label: "Public transport" }, { label: "Driving" }, { label: "Cycling" }, { label: "Walking" }],
      },

      // ── everyone ──
      {
        ref: "equipment",
        type: "single_select",
        title: "Which laptop would you like?",
        required: true,
        options: [{ label: "MacBook Pro" }, { label: "MacBook Air" }, { label: "Windows laptop" }, { label: "Linux laptop" }],
      },
      { ref: "tshirt", type: "single_select", title: "T-shirt size?", required: false, options: [{ label: "XS" }, { label: "S" }, { label: "M" }, { label: "L" }, { label: "XL" }, { label: "XXL" }] },
      { ref: "dietary", type: "short_text", title: "Any dietary requirements for team lunches?", required: false },
      { ref: "emergency_contact", type: "short_text", title: "Emergency contact — name and number", required: true },
      {
        ref: "accessibility",
        type: "long_text",
        title: "Anything we should set up to make work work for you?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "handbook",
        type: "signature",
        title: "Sign to confirm you've read the employee handbook",
        required: true,
        drawnNameRequired: true,
      },
    ],
    branches: [
      { when: "work_location", is: "Remote", then: "shipping_address" },
      { when: "work_location", is: "The office", then: "office_site" },
      { when: "work_location", is: "A bit of both", then: "shipping_address" },
      { when: "home_setup", always: true, then: "equipment" },
    ],
    ending: { title: "All set 🎊", body: "See you on day one — we'll email the schedule shortly." },
  }),

  defineTemplate({
    slug: "exit-interview",
    title: "Exit interview",
    category: "HR",
    icon: "LogOut",
    description: "Ask why someone is leaving in a way they can answer honestly.",
    blurb:
      "Leaving is when people say what they meant. Structured enough to count across a year of departures, open enough to catch what no option covers — and the follow-up follows the reason, so someone leaving over their manager is not asked about the salary bands.",
    tags: ["retention", "people ops", "offboarding", "branching"],
    greeting: "Before you go — your honest answers help the people staying. This is confidential.",
    questions: [
      {
        ref: "ratings",
        type: "matrix",
        title: "How would you rate each of these?",
        required: true,
        rows: [
          "Your manager",
          "Your team",
          "Compensation",
          "Growth opportunities",
          "Work-life balance",
          "Leadership and direction",
        ],
        columns: ["Poor", "Fair", "Good", "Excellent"],
      },
      {
        ref: "primary_reason",
        type: "single_select",
        title: "What's the main reason you're leaving?",
        required: true,
        options: [
          { label: "Compensation" },
          { label: "Career growth" },
          { label: "Manager or team" },
          { label: "Work-life balance" },
          { label: "Company direction" },
          { label: "Personal reasons" },
        ],
      },

      // ── compensation ──
      {
        ref: "comp_gap",
        type: "single_select",
        title: "How far off was it?",
        required: false,
        options: [
          { label: "Under 10%" },
          { label: "10–25%" },
          { label: "More than 25%" },
          { label: "It wasn't the number — it was how it was decided" },
        ],
      },

      // ── growth ──
      {
        ref: "growth_missing",
        type: "long_text",
        title: "What did you want to be doing that you weren't?",
        required: false,
        maxLength: 800,
      },

      // ── manager or team ──
      {
        ref: "manager_detail",
        type: "long_text",
        title: "What would have made the difference?",
        description: "Goes to HR only, and is never shown to your manager attributed to you.",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "raised_it",
        type: "yes_no",
        title: "Did you raise it at the time?",
        required: false,
        yesLabel: "Yes",
        noLabel: "No",
      },

      // ── work-life balance ──
      {
        ref: "balance_detail",
        type: "single_select",
        title: "What tipped it?",
        required: false,
        options: [
          { label: "Hours" },
          { label: "Always-on expectations" },
          { label: "Travel or commute" },
          { label: "Not enough flexibility" },
        ],
      },

      // ── everyone ──
      { ref: "what_worked", type: "long_text", title: "What worked well here?", required: false, maxLength: 1000 },
      { ref: "what_to_change", type: "long_text", title: "What would you change?", required: false, maxLength: 1200 },
      { ref: "recommend", type: "nps", title: "How likely are you to recommend us as a place to work?", required: false },
      { ref: "boomerang", type: "yes_no", title: "Would you consider working here again one day?", required: false },
      {
        ref: "next_role",
        type: "short_text",
        title: "Where are you off to, if you don't mind saying?",
        required: false,
      },
    ],
    branches: [
      { when: "primary_reason", is: "Compensation", then: "comp_gap" },
      { when: "primary_reason", is: "Career growth", then: "growth_missing" },
      { when: "primary_reason", is: "Manager or team", then: "manager_detail" },
      { when: "primary_reason", is: "Work-life balance", then: "balance_detail" },
      { when: "primary_reason", is: "Company direction", then: "what_worked" },
      { when: "primary_reason", is: "Personal reasons", then: "what_worked" },
      { when: "comp_gap", always: true, then: "what_worked" },
      { when: "growth_missing", always: true, then: "what_worked" },
      { when: "raised_it", always: true, then: "what_worked" },
    ],
    ending: { title: "Thank you — genuinely 🙏", body: "All the best for what's next." },
  }),

  defineTemplate({
    slug: "engagement-pulse",
    title: "Engagement pulse",
    category: "HR",
    icon: "HeartPulse",
    description: "A short, repeatable check that follows up on the low scores.",
    blurb:
      "Short enough to send monthly and consistent enough to trend: six scaled statements that stay identical every round. Anyone who scores low on workload or support gets one extra question about it — which is where the anonymised comments worth reading come from.",
    tags: ["culture", "pulse", "people ops", "branching"],
    greeting: "Quick pulse check — anonymous, and under two minutes.",
    questions: [
      { ref: "workload", type: "opinion_scale", title: "My workload is manageable.", required: true, steps: 5, startAt: 1, labelLow: "Strongly disagree", labelHigh: "Strongly agree" },
      { ref: "clarity", type: "opinion_scale", title: "I'm clear on what's expected of me.", required: true, steps: 5, startAt: 1, labelLow: "Strongly disagree", labelHigh: "Strongly agree" },
      { ref: "support", type: "opinion_scale", title: "I get the support I need from my manager.", required: true, steps: 5, startAt: 1, labelLow: "Strongly disagree", labelHigh: "Strongly agree" },
      { ref: "growth", type: "opinion_scale", title: "I'm learning and growing here.", required: true, steps: 5, startAt: 1, labelLow: "Strongly disagree", labelHigh: "Strongly agree" },
      { ref: "belonging", type: "opinion_scale", title: "I can be myself at work.", required: true, steps: 5, startAt: 1, labelLow: "Strongly disagree", labelHigh: "Strongly agree" },
      { ref: "enps", type: "nps", title: "How likely are you to recommend us as a place to work?", required: true },

      // ── the people who are not doing well ──
      {
        ref: "low_area",
        type: "multi_select",
        title: "Which of these is weighing on you most?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "Too much work" },
          { label: "Unclear priorities" },
          { label: "Not enough support" },
          { label: "No path forward" },
          { label: "Something about the team" },
        ],
      },
      {
        ref: "low_detail",
        type: "long_text",
        title: "What would help most, this month?",
        description: "Still anonymous. Answers are summarised, never quoted with a name.",
        required: false,
        maxLength: 1000,
      },

      // ── everyone ──
      { ref: "anything_else", type: "long_text", title: "Anything else on your mind?", required: false, maxLength: 1000 },
    ],
    branches: [
      { when: "enps", op: "lte", is: 6, then: "low_area" },
      { when: "enps", op: "gte", is: 7, then: "anything_else" },
    ],
    ending: { title: "Thanks 💬", body: "Results are shared with the whole team." },
  }),

  defineTemplate({
    slug: "referral-submission",
    title: "Employee referral",
    category: "HR",
    icon: "Users",
    description: "Make referring someone take a minute, not an afternoon.",
    blurb:
      "Referral schemes die on friction. Name, contact, role and one honest line is enough for a recruiter to act on — and when the referrer hasn't asked the candidate yet, the form says so and takes their word rather than an email address they shouldn't be sharing.",
    tags: ["referral", "hiring", "internal", "branching"],
    greeting: "Know someone great? Put them forward.",
    questions: [
      { ref: "referrer", type: "short_text", title: "Your name?", required: true },
      { ref: "referrer_team", type: "short_text", title: "Which team are you on?", required: false },
      { ref: "candidate_name", type: "short_text", title: "Who are you referring?", required: true },
      {
        ref: "has_consent",
        type: "yes_no",
        title: "Do they know you're referring them?",
        required: true,
        yesLabel: "Yes, they're expecting it",
        noLabel: "Not yet",
      },

      // ── they know ──
      {
        ref: "candidate_contact",
        type: "short_text",
        title: "How can we reach them? Email or LinkedIn.",
        required: true,
      },
      {
        ref: "best_approach",
        type: "single_select",
        title: "How should we open?",
        required: false,
        options: [{ label: "Email from a recruiter" }, { label: "LinkedIn message" }, { label: "You'll make the intro" }],
      },

      // ── they don't ──
      {
        ref: "will_ask",
        type: "yes_no",
        title: "Will you ask them first?",
        description: "We won't contact anyone who hasn't agreed to it.",
        required: true,
        yesLabel: "Yes, I'll check with them",
        noLabel: "No — just log it for now",
      },

      // ── everyone ──
      {
        ref: "role",
        type: "dropdown",
        title: "Which role?",
        required: true,
        options: [
          { label: "Engineering" },
          { label: "Design" },
          { label: "Product" },
          { label: "Sales" },
          { label: "Operations" },
          { label: "Open application" },
        ],
      },
      { ref: "why", type: "long_text", title: "Why would they be good here?", required: true, maxLength: 1000 },
      {
        ref: "worked_together",
        type: "single_select",
        title: "How do you know them?",
        required: false,
        options: [
          { label: "We worked together directly" },
          { label: "Same company, different team" },
          { label: "Through the community" },
          { label: "Personally" },
        ],
      },
    ],
    branches: [
      { when: "has_consent", is: true, then: "candidate_contact" },
      { when: "has_consent", is: false, then: "will_ask" },
      { when: "best_approach", always: true, then: "role" },
    ],
    ending: { title: "Thanks for the referral 🙌", body: "We'll take it from here and keep you posted." },
  }),
];
