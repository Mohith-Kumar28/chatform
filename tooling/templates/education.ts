import { defineTemplate, type TemplateSeed } from "./define.js";

export const EDUCATION: TemplateSeed[] = [
  defineTemplate({
    slug: "course-enrollment",
    title: "Course enrolment",
    category: "Education",
    icon: "GraduationCap",
    description: "Enrol students, place them at the right level, and take the fee.",
    blurb:
      "Enrolment and placement in one pass. Students who know which course they want go straight through; students who don't are asked the three questions that place them, and get a recommendation instead of a guess. The fee is collected at the end, once they know what they're paying for.",
    tags: ["course", "enrolment", "students", "payment"],
    greeting: "Welcome! Let's get you enrolled.",
    questions: [
      { ref: "name", type: "short_text", title: "Your full name?", required: true },
      { ref: "email", type: "email", title: "Email?", required: true },
      { ref: "phone", type: "phone", title: "Mobile number, for timetable changes?", required: false },
      {
        ref: "course",
        type: "dropdown",
        title: "Which course?",
        required: true,
        options: [
          { label: "Foundations" },
          { label: "Intermediate" },
          { label: "Advanced" },
          { label: "Not sure — help me choose" },
        ],
      },

      // ── they know what they want ──
      {
        ref: "why_this_level",
        type: "short_text",
        title: "What makes that the right level for you?",
        required: false,
      },

      // ── placement ──
      {
        ref: "experience",
        type: "opinion_scale",
        title: "How much experience do you already have?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "None at all",
        labelHigh: "A lot",
      },
      {
        ref: "prior_study",
        type: "multi_select",
        title: "Have you done any of these before?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "A short course or bootcamp" },
          { label: "Taught myself from books or videos" },
          { label: "Used it at work" },
          { label: "Studied it formally" },
          { label: "None of these" },
        ],
      },
      {
        ref: "self_assessment",
        type: "long_text",
        title: "Describe something you've made or solved with it",
        description: "A sentence is plenty. It's the fastest way for a tutor to place you.",
        required: false,
        maxLength: 600,
      },

      // ── everyone ──
      { ref: "goal", type: "long_text", title: "What do you want to be able to do by the end?", required: true, maxLength: 800 },
      {
        ref: "schedule",
        type: "multi_select",
        title: "When can you study?",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [{ label: "Weekday mornings" }, { label: "Weekday evenings" }, { label: "Weekends" }, { label: "Any time" }],
      },
      {
        ref: "format",
        type: "single_select",
        title: "How would you rather learn?",
        required: true,
        options: [{ label: "In person" }, { label: "Live online" }, { label: "At my own pace" }],
      },
      {
        ref: "accessibility",
        type: "long_text",
        title: "Anything we should know to support you?",
        description: "Access needs, dyslexia, caring responsibilities, anything at all.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "funding",
        type: "single_select",
        title: "How are you paying?",
        required: true,
        options: [
          { label: "Myself" },
          { label: "My employer" },
          { label: "I'm applying for a bursary" },
        ],
      },

      // ── paying themselves ──
      {
        ref: "deposit",
        type: "payment",
        title: "Secure your place with a deposit",
        description: "Replace this with your own checkout link before publishing.",
        required: false,
        method: "link",
        amountMode: "fixed",
        amount: 99,
        currency: "USD",
        url: "https://example.com/checkout/course-deposit",
      },

      // ── employer paying ──
      { ref: "employer_name", type: "short_text", title: "Which employer?", required: true },
      { ref: "invoice_email", type: "email", title: "Where should the invoice go?", required: true },
      { ref: "purchase_order", type: "short_text", title: "Purchase order number, if you need one on it", required: false },

      // ── bursary ──
      {
        ref: "bursary_reason",
        type: "long_text",
        title: "Tell us about your circumstances",
        description: "Read only by the bursary panel, and never shared with tutors.",
        required: true,
        maxLength: 1200,
      },
    ],
    branches: [
      { when: "course", is: "Not sure — help me choose", then: "experience" },
      { when: "course", is: "Foundations", then: "why_this_level" },
      { when: "course", is: "Intermediate", then: "why_this_level" },
      { when: "course", is: "Advanced", then: "why_this_level" },
      { when: "why_this_level", always: true, then: "goal" },
      { when: "funding", is: "Myself", then: "deposit" },
      { when: "funding", is: "My employer", then: "employer_name" },
      { when: "funding", is: "I'm applying for a bursary", then: "bursary_reason" },
      { when: "deposit", always: true, then: "end_thanks" },
      { when: "purchase_order", always: true, then: "end_invoice" },
      { when: "bursary_reason", always: true, then: "end_bursary" },
    ],
    endings: [
      {
        ref: "end_invoice",
        title: "We'll invoice your employer 🧾",
        body: "Your place is held for fourteen days while the invoice is settled.",
      },
      {
        ref: "end_bursary",
        title: "Bursary application received 🎓",
        body: "The panel meets fortnightly. We'll hold a place for you until they've decided.",
      },
    ],
    ending: { title: "You're enrolled 🎓", body: "Your welcome pack is on its way." },
  }),

  defineTemplate({
    slug: "student-feedback",
    title: "Student feedback",
    category: "Education",
    icon: "BookOpen",
    description: "End-of-course feedback that separates teaching from material.",
    blurb:
      "A course can have excellent material and a rushed delivery, or the reverse — so they are rated apart. Anyone who says the pace was wrong is asked where it went wrong; anyone who would not recommend it is asked what would have to change, which is the only answer that improves the next cohort.",
    tags: ["teaching", "feedback", "course", "branching"],
    greeting: "You made it to the end! How was it?",
    questions: [
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each part?",
        required: true,
        rows: ["Course material", "Teaching", "Exercises", "Pace", "Support", "Assessment"],
        columns: ["Poor", "Fair", "Good", "Excellent"],
      },
      { ref: "overall", type: "rating", title: "And the course overall?", required: true, scale: 5, shape: "star" },
      {
        ref: "pace",
        type: "single_select",
        title: "How was the pace?",
        required: true,
        options: [{ label: "Too slow" }, { label: "About right" }, { label: "Too fast" }],
      },

      // ── too slow ──
      {
        ref: "slow_where",
        type: "short_text",
        title: "Which parts dragged?",
        required: false,
      },

      // ── too fast ──
      {
        ref: "fast_where",
        type: "short_text",
        title: "Where did you start to lose the thread?",
        required: false,
      },
      {
        ref: "fast_support",
        type: "yes_no",
        title: "Would catch-up sessions have helped?",
        required: false,
        yesLabel: "Yes, definitely",
        noLabel: "Not really",
      },

      // ── everyone ──
      { ref: "most_useful", type: "long_text", title: "What was most useful?", required: false, maxLength: 800 },
      { ref: "least_useful", type: "long_text", title: "What would you cut or change?", required: false, maxLength: 800 },
      {
        ref: "confidence_now",
        type: "opinion_scale",
        title: "How confident do you feel putting this into practice?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Completely",
      },
      { ref: "recommend", type: "nps", title: "How likely are you to recommend this course?", required: true },

      // ── detractors ──
      {
        ref: "what_would_change_it",
        type: "long_text",
        title: "What would have to be different for you to recommend it?",
        required: false,
        maxLength: 1000,
      },

      // ── promoters ──
      {
        ref: "quote_ok",
        type: "yes_no",
        title: "May we quote you on the course page?",
        required: false,
        yesLabel: "Yes, with my first name",
        noLabel: "Please don't",
      },
    ],
    branches: [
      { when: "pace", is: "Too slow", then: "slow_where" },
      { when: "pace", is: "About right", then: "most_useful" },
      { when: "pace", is: "Too fast", then: "fast_where" },
      { when: "slow_where", always: true, then: "most_useful" },
      { when: "fast_support", always: true, then: "most_useful" },
      { when: "recommend", op: "lte", is: 6, then: "what_would_change_it" },
      { when: "recommend", op: "gte", is: 7, then: "quote_ok" },
    ],
    ending: { title: "Thank you 📚", body: "Every cohort improves because of answers like these." },
  }),

  defineTemplate({
    slug: "quiz",
    title: "Knowledge quiz",
    category: "Education",
    icon: "ListChecks",
    description: "A scored quiz that adapts to how the first answers go.",
    blurb:
      "Worked example questions with scores already attached to the options, so the wiring is done and you only replace the wording. The warm-up question decides whether the taker gets the easier set or the harder one — which is how a quiz stays interesting for both ends of a class.",
    tags: ["quiz", "scoring", "assessment", "branching"],
    greeting: "A short quiz. No pressure — you'll get your score at the end.",
    questions: [
      { ref: "name", type: "short_text", title: "What should we call you?", required: true },
      {
        ref: "self_level",
        type: "single_select",
        title: "How would you describe yourself on this topic?",
        required: true,
        options: [{ label: "Just starting out" }, { label: "I know a bit" }, { label: "I know this well" }],
      },

      // ── the easier set ──
      {
        ref: "easy_1",
        type: "single_select",
        title: "Which of these is a primary colour?",
        required: true,
        options: [
          { label: "Green", score: 0 },
          { label: "Blue", score: 1 },
          { label: "Orange", score: 0 },
          { label: "Purple", score: 0 },
        ],
      },
      {
        ref: "easy_2",
        type: "yes_no",
        title: "Is the Pacific the largest ocean on Earth?",
        required: true,
        yesLabel: "Yes",
        noLabel: "No",
      },
      {
        ref: "easy_3",
        type: "multi_select",
        title: "Which of these are mammals? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Dolphin", score: 1 },
          { label: "Shark", score: 0 },
          { label: "Bat", score: 1 },
          { label: "Penguin", score: 0 },
        ],
      },

      // ── the harder set ──
      {
        ref: "hard_1",
        type: "single_select",
        title: "Which of these gases makes up most of Earth's atmosphere?",
        required: true,
        options: [
          { label: "Oxygen", score: 0 },
          { label: "Nitrogen", score: 1 },
          { label: "Carbon dioxide", score: 0 },
          { label: "Argon", score: 0 },
        ],
      },
      {
        ref: "hard_2",
        type: "ranking",
        title: "Put these in order, closest to the Sun first",
        required: true,
        items: ["Mercury", "Earth", "Jupiter", "Neptune"],
      },
      {
        ref: "hard_3",
        type: "short_text",
        title: "Name the process plants use to turn light into energy",
        required: true,
        maxLength: 60,
      },

      // ── everyone ──
      {
        ref: "confidence",
        type: "opinion_scale",
        title: "How confident are you in your answers?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Guessing",
        labelHigh: "Certain",
      },
      {
        ref: "want_results",
        type: "email",
        title: "Where should we send your score?",
        required: false,
      },
    ],
    branches: [
      { when: "self_level", is: "Just starting out", then: "easy_1" },
      { when: "self_level", is: "I know a bit", then: "easy_1" },
      { when: "self_level", is: "I know this well", then: "hard_1" },
      { when: "easy_3", always: true, then: "confidence" },
    ],
    ending: { title: "Nicely done ✅", body: "Swap in your own questions — the scores are already wired up." },
  }),
];
