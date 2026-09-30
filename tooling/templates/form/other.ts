import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_OTHER: TemplateSeed[] = [
  defineTemplate({
    slug: "sales-performance-evaluation-form",
    type: "form",
    category: "other",
    goals: ["collect-feedback"],
    roles: ["sales", "hr-people"],
    searchName: "Sales performance evaluation form",
    title: "Sales performance review",
    icon: "TrendingUp",
    metaDescription:
      "Review a salesperson on results, selling skills and habits, not just quota. A miss asks what got in the way; a beat asks what worked, so others can copy it.",
    description: "A manager's review of one rep: the number, the skills behind it and the support they need next.",
    blurb:
      "Separates the result from the skills that produced it, so a strong rep in a thin territory is not judged the same as a weak rep in a rich one. The target question decides the follow-up: a miss is asked what got in the way, a beat is asked what worked, and every review ends with one skill to build and the support that would help most.",
    tags: ["sales performance review", "sales evaluation", "quota attainment", "sales coaching", "branching"],
    greeting: "Let's review this period. Plan on five minutes, and have their numbers to hand.",
    questions: [
      { ref: "rep_name", type: "short_text", title: "Which salesperson are you reviewing?", required: true, maxLength: 120 },
      {
        ref: "period",
        type: "short_text",
        title: "Which period does this review cover?",
        description: "For example: Q3, or January to June.",
        required: true,
        maxLength: 60,
      },
      {
        ref: "sales_role",
        type: "dropdown",
        title: "What's their role?",
        required: true,
        options: [
          { label: "Sales development rep" },
          { label: "Account executive" },
          { label: "Account manager" },
          { label: "Sales manager" },
          { label: "Other sales role" },
        ],
      },
      {
        ref: "attainment",
        type: "number",
        title: "What percentage of their target did they reach?",
        description: "Leave it blank if they don't carry a number yet.",
        required: false,
        min: 0,
        max: 1000,
      },
      {
        ref: "target_result",
        type: "single_select",
        title: "How did that compare with what was expected?",
        required: true,
        options: [
          { label: "Beat it" },
          { label: "Met it" },
          { label: "Fell short" },
          { label: "Still ramping, no target yet" },
        ],
      },

      // Beat or met
      {
        ref: "what_worked",
        type: "long_text",
        title: "What did they do that others on the team could copy?",
        required: false,
        maxLength: 1000,
      },

      // Fell short
      {
        ref: "shortfall_reasons",
        type: "multi_select",
        title: "What got in the way?",
        required: true,
        minSelections: 1,
        maxSelections: 7,
        options: [
          { label: "Not enough pipeline" },
          { label: "Deals slipped into next period" },
          { label: "Lost to a competitor" },
          { label: "Territory or account changes" },
          { label: "Gaps in the product" },
          { label: "Skills still developing" },
          { label: "Personal circumstances" },
        ],
      },
      {
        ref: "shortfall_context",
        type: "long_text",
        title: "Give one example that shows what happened.",
        description: "A specific deal or week is more useful here than a general impression.",
        required: false,
        maxLength: 1000,
      },

      // Everyone
      {
        ref: "skills",
        type: "matrix",
        title: "How would you rate their selling skills this period?",
        required: true,
        rows: [
          "Prospecting and building pipeline",
          "Discovery and understanding needs",
          "Product knowledge",
          "Handling objections",
          "Negotiating and closing",
          "Keeping the CRM up to date",
          "Working with other teams",
        ],
        columns: ["Needs work", "Developing", "Solid", "Strong"],
      },
      {
        ref: "forecast",
        type: "opinion_scale",
        title: "How reliable were their forecasts?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Often far off",
        labelHigh: "Spot on",
      },
      {
        ref: "best_moment",
        type: "long_text",
        title: "Describe one deal or moment that showed them at their best.",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "focus_skill",
        type: "long_text",
        title: "Which one skill should they work on next, and what would good look like?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "support",
        type: "ranking",
        title: "Rank the support that would help them most next period.",
        required: false,
        items: [
          "Deal coaching with their manager",
          "Shadowing a top performer",
          "Product training",
          "Better quality leads",
          "Less admin",
        ],
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how would you rate their performance this period?",
        required: true,
        scale: 5,
      },
      {
        ref: "discussed",
        type: "yes_no",
        title: "Have you talked this review through with them yet?",
        required: true,
      },
    ],
    branches: [
      { when: "target_result", is: "Beat it", then: "what_worked" },
      { when: "target_result", is: "Met it", then: "what_worked" },
      { when: "target_result", is: "Fell short", then: "shortfall_reasons" },
      { when: "target_result", is: "Still ramping, no target yet", then: "skills" },
      { when: "what_worked", always: true, then: "skills" },
    ],
    ending: {
      title: "Review saved",
      body: "Use the focus skill and the support ranking to agree two or three actions with them, and set a date to check in.",
    },
    guide: {
      questionsToConsider: [
        "Which selling skills matter most for this role, and do they differ between new business and account management?",
        "Is the target a fair measure this period, or did territory or pricing changes move it?",
        "Should the rep fill in the same form as a self-review so you can compare the two?",
        "Who else sees the finished review, and does the rep know that?",
      ],
      howToUseResponses:
        "Read the skills grid next to the target result. A rep who fell short but rates solid on discovery and closing probably needs more pipeline, not coaching, while one who hit target on a single large deal may need help with prospecting. Put two or three agreed actions from the focus skill and support ranking in writing, and compare the grid at the next review to see what moved.",
      customizeSteps: [
        "Edit the rows in the skills grid to match your sales process, and remove any that don't apply to the role.",
        "Change the shortfall reasons to the obstacles your team actually runs into, so the answers can be counted across reviews.",
        "Send the link to each manager before review week, and export the responses to CSV to compare reps side by side.",
      ],
      faqs: [
        {
          q: "What should a sales performance evaluation include?",
          a: "The result against target, the skills behind it such as prospecting, discovery and closing, the reasons for any shortfall, one area to develop and the support that would help.",
        },
        {
          q: "Should sales reps be judged only on quota?",
          a: "No. Quota shows the outcome, but pipeline quality, forecasting and deal skills explain it and tell you what to coach. This form asks for both.",
        },
        {
          q: "How often should sales performance be reviewed?",
          a: "Most teams do a short review each quarter and a fuller one once a year. Quarterly reviews catch a slipping pipeline while there is still time to fix it.",
        },
        {
          q: "Can a salesperson use this form for a self-review?",
          a: "Yes. Copy the template, reword the questions in the first person, and compare their answers with their manager's before the meeting.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "360-degree-feedback-form",
    type: "form",
    category: "other",
    goals: ["collect-feedback"],
    roles: ["hr-people"],
    searchName: "360 degree feedback form",
    title: "360 degree feedback",
    icon: "Users",
    metaDescription:
      "Collect 360 feedback from managers, peers and direct reports with keep, start and stop prompts. Reports also rate leadership, and reviewers choose if they are named.",
    description: "Feedback on one person from the people around them, with examples, not just scores.",
    blurb:
      "Asks every reviewer the same core questions so answers can be compared across managers, peers and direct reports. People who report to the person also rate their leadership, a question the others skip. The keep, start and stop prompts pull out specific examples, and a short follow-up asks for one whenever an answer is too vague to act on.",
    tags: ["360 degree feedback", "peer review", "performance review", "leadership feedback", "branching"],
    greeting: "You've been asked for feedback on a colleague. Honest and specific is the most useful thing you can give.",
    questions: [
      {
        ref: "subject",
        type: "short_text",
        title: "Who are you giving feedback about?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "relationship",
        type: "single_select",
        title: "How do you work with them?",
        required: true,
        options: [
          { label: "I'm their manager" },
          { label: "We're peers" },
          { label: "They manage me" },
          { label: "I work with them from another team" },
        ],
      },

      // Direct reports
      {
        ref: "leadership",
        type: "matrix",
        title: "As your manager, how often do they do these things?",
        required: true,
        rows: [
          "Make priorities clear",
          "Give useful feedback",
          "Back the team when it counts",
          "Make time for one-to-ones",
          "Help me grow",
        ],
        columns: ["Rarely", "Sometimes", "Often", "Almost always"],
      },

      // Everyone
      {
        ref: "how_long",
        type: "single_select",
        title: "How long have you worked with them?",
        required: true,
        options: [
          { label: "Less than 3 months" },
          { label: "3 to 12 months" },
          { label: "1 to 3 years" },
          { label: "More than 3 years" },
        ],
      },
      {
        ref: "competencies",
        type: "matrix",
        title: "How often do you see them do each of these?",
        required: true,
        rows: [
          "Communicate clearly",
          "Collaborate and share credit",
          "Deliver what they promise",
          "Solve problems without being asked",
          "Take feedback well",
          "Treat people with respect",
        ],
        columns: ["Rarely", "Sometimes", "Often", "Almost always"],
      },
      {
        ref: "keep_doing",
        type: "long_text",
        title: "What should they keep doing? Give an example if you can.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "start_doing",
        type: "long_text",
        title: "What's one thing they should start doing?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "stop_doing",
        type: "long_text",
        title: "Is there anything they should stop doing?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "effectiveness",
        type: "opinion_scale",
        title: "Overall, how effective are they in their role?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not effective",
        labelHigh: "Highly effective",
      },
      {
        ref: "attribution",
        type: "yes_no",
        title: "Can we show your name next to your feedback?",
        description: "Say no and your answers are shared only as part of a summary.",
        required: true,
        yesLabel: "Yes, name me",
        noLabel: "No, keep it unnamed",
      },

      // Named reviewers
      { ref: "reviewer_name", type: "short_text", title: "What name should appear next to your feedback?", required: true, maxLength: 120 },
    ],
    branches: [
      { when: "relationship", is: "They manage me", then: "leadership" },
      { when: "relationship", is: "I'm their manager", then: "how_long" },
      { when: "relationship", is: "We're peers", then: "how_long" },
      { when: "relationship", is: "I work with them from another team", then: "how_long" },
      { when: "attribution", is: true, then: "reviewer_name" },
      { when: "attribution", is: false, then: "end_thanks" },
    ],
    ending: {
      title: "Thank you for your feedback",
      body: "It will be combined with everyone else's and discussed with them as part of their development plan.",
    },
    guide: {
      questionsToConsider: [
        "Who picks the reviewers, and how many from each group do you need before a summary is fair?",
        "Which behaviours matter most at your company, and do the grid rows reflect them?",
        "Will reviewers be named in the report, and how will you protect people in very small teams?",
        "Should the person reviewed also fill this in about themselves for comparison?",
      ],
      howToUseResponses:
        "Group the answers by relationship before you read them, because a pattern that only direct reports see means something different from one peers see. Look for themes that come up three or more times rather than reacting to a single comment. Share a summary, not raw answers, in a conversation with the person, and turn the start and stop themes into one or two goals with a date to check progress.",
      customizeSteps: [
        "Rewrite the rows in both grids to match your company's values or leadership framework.",
        "If you run one copy of the form per person, put their name in the greeting and remove the first question, so reviewers don't have to type it.",
        "Explain at the top who will read the answers and how they are summarised, then send the link to each reviewer.",
      ],
      faqs: [
        {
          q: "What is a 360 degree feedback form?",
          a: "A form that collects feedback on one person from the people who work around them: their manager, peers, direct reports and sometimes people in other teams. Together they give a fuller picture than one manager's view.",
        },
        {
          q: "Should 360 feedback be anonymous?",
          a: "Many companies keep it unnamed so people can be honest. This template lets each reviewer choose, and only shows their name if they agree.",
        },
        {
          q: "How many people should give 360 feedback?",
          a: "Enough that no single answer can be traced back or dominate the summary. Several peers plus the manager, and direct reports if there are any, is a common mix.",
        },
        {
          q: "What questions should a 360 review include?",
          a: "A few consistent ratings everyone answers, plus open questions about what to keep, start and stop doing. Examples make the feedback something the person can act on.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "staff-induction-form",
    type: "form",
    category: "other",
    goals: ["collect-feedback"],
    roles: ["hr-people", "operations"],
    searchName: "Staff induction form",
    title: "Staff induction checklist",
    icon: "ClipboardCheck",
    metaDescription:
      "A first-week induction checklist for new staff: which steps are done, what is still blocking them, an emergency contact and how ready they feel for week two.",
    description: "New starters confirm what's done in their first week and flag what's still missing.",
    blurb:
      "Sent at the end of a new starter's first week, it turns induction into a checklist the employee confirms themselves. Anyone who says something is blocking them is asked what and who could fix it, so a missing login is sorted on Monday rather than discovered a month later.",
    tags: ["staff induction", "induction checklist", "new starter", "first week", "branching"],
    greeting: "You've made it through week one! A quick check that your induction covered everything.",
    questions: [
      {
        ref: "starter",
        type: "contact_info",
        title: "Your name and work email, please.",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "team_role",
        type: "short_text",
        title: "Which team and role have you joined?",
        required: true,
        maxLength: 120,
      },
      { ref: "start_date", type: "date", title: "What was your first day?", required: true },
      { ref: "manager", type: "short_text", title: "Who's your line manager?", required: true, maxLength: 120 },
      {
        ref: "completed",
        type: "multi_select",
        title: "Which of these have you done so far?",
        required: false,
        minSelections: 0,
        maxSelections: 9,
        options: [
          { label: "Read the staff handbook" },
          { label: "Health and safety briefing" },
          { label: "Shown fire exits and first aid points" },
          { label: "Laptop and equipment set up" },
          { label: "All system logins working" },
          { label: "Met my buddy or mentor" },
          { label: "Had a first one-to-one with my manager" },
          { label: "Returned my signed contract" },
          { label: "Sent payroll and bank details" },
        ],
      },
      {
        ref: "blocked",
        type: "yes_no",
        title: "Is anything stopping you from getting on with your work?",
        required: true,
      },

      // Blocked
      {
        ref: "blockers",
        type: "long_text",
        title: "What's missing, and who have you asked about it?",
        description: "A missing login, equipment that hasn't arrived, a meeting nobody set up.",
        required: true,
        maxLength: 1000,
      },

      // Everyone
      {
        ref: "emergency_name",
        type: "short_text",
        title: "Who should we contact in an emergency, and how are they related to you?",
        required: true,
        maxLength: 120,
      },
      { ref: "emergency_phone", type: "phone", title: "What's their phone number?", required: true },
      {
        ref: "readiness",
        type: "opinion_scale",
        title: "How ready do you feel for week two?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not ready at all",
        labelHigh: "Fully ready",
      },
      {
        ref: "open_questions",
        type: "long_text",
        title: "Any questions you haven't had the chance to ask yet?",
        required: false,
        maxLength: 1000,
      },
    ],
    branches: [
      { when: "blocked", is: true, then: "blockers" },
      { when: "blocked", is: false, then: "emergency_name" },
    ],
    ending: {
      title: "Thanks, and welcome to the team 👋",
      body: "Your manager and HR will read this, and if you flagged something that's missing, someone will get back to you about it.",
    },
    guide: {
      questionsToConsider: [
        "Which induction steps are legally required for your workplace, and which are just good practice?",
        "Who owns each item on the checklist, so a gap goes straight to the right person?",
        "When should new starters get this link: the end of day one, the end of week one, or both?",
        "Do remote starters need a different checklist from office-based ones?",
      ],
      howToUseResponses:
        "Check blockers the same day and send each one to its owner, whether that is IT, facilities or the line manager. Compare the checklist with what the starter was meant to finish in week one, and chase anything required, such as the health and safety briefing, before they carry on. A low readiness score is worth a short conversation with the manager this week, not at the probation review.",
      customizeSteps: [
        "Edit the checklist to match your actual induction plan, and put any required steps at the top.",
        "Change the ending to name who will follow up and by when.",
        "Send the link to each new starter on their fifth day, and export responses to CSV to keep a record for each person.",
      ],
      faqs: [
        {
          q: "What should a staff induction form include?",
          a: "The new starter's details, their team and manager, a checklist of induction steps, an emergency contact and space to raise problems or questions.",
        },
        {
          q: "What's the difference between induction and onboarding?",
          a: "Induction is the first days: introductions, policies, safety and setup. Onboarding is the longer process of getting someone fully productive, often over several months.",
        },
        {
          q: "Who should fill in a staff induction form?",
          a: "The new starter, at the end of their first week. It shows what really happened, which can differ from what the induction plan said would happen.",
        },
        {
          q: "Can I use this for contractors or temporary staff?",
          a: "Yes. Remove the payroll and contract items that don't apply, and keep the safety and access checks.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "ghibli-style-form",
    type: "form",
    category: "other",
    goals: ["generate-leads"],
    roles: ["freelancers-agencies"],
    searchName: "Ghibli style form",
    title: "Ghibli-style art request",
    icon: "Paintbrush",
    metaDescription:
      "A request form for artists who draw in a soft, hand-painted anime style. Collect the subject, reference photos, mood, colours, format, deadline and usage.",
    description: "Take illustration requests for soft, hand-painted anime-style portraits and scenes.",
    blurb:
      "For artists who take commissions in the gentle, painterly style people associate with classic hand-drawn anime films. Clients who want a portrait, a pet or a place are asked for reference photos, while original scenes get space to describe them. Anyone ordering for business use is asked where it will appear, so the licence is clear before you start.",
    tags: ["ghibli style art", "anime portrait commission", "illustration request", "art commission", "branching"],
    greeting: "Hello! Tell me about the picture you'd like and I'll see how I can bring it to life.",
    questions: [
      { ref: "name", type: "short_text", title: "What should I call you?", required: true, maxLength: 80 },
      {
        ref: "subject",
        type: "single_select",
        title: "What would you like drawn?",
        required: true,
        options: [
          { label: "Me, a friend or my family" },
          { label: "A couple" },
          { label: "A pet" },
          { label: "My home or a place I love" },
          { label: "An original scene I'll describe" },
        ],
      },

      // Original scenes
      {
        ref: "scene",
        type: "long_text",
        title: "Describe the scene. What's happening, and where?",
        description: "Time of day, the weather, who or what is in it, and the feeling you want it to have.",
        required: true,
        maxLength: 1500,
      },

      // Everyone
      {
        ref: "references",
        type: "file_upload",
        title: "Add reference photos, up to five.",
        description: "Clear faces, outfits, a pet's markings or the view you want. For an original scene, add anything that shows the look you're after, or skip it.",
        required: false,
        accept: ["image/*"],
        maxFiles: 5,
        maxSizeMB: 15,
      },
      {
        ref: "details",
        type: "long_text",
        title: "Any details I mustn't miss?",
        description: "Names, a favourite jumper, a scar, a toy, a colour someone always wears.",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "mood",
        type: "multi_select",
        title: "Pick up to three settings or moods you'd love.",
        required: true,
        minSelections: 1,
        maxSelections: 3,
        options: [
          { label: "Sunny meadow and tall clouds" },
          { label: "Cosy kitchen or bakery" },
          { label: "Rainy day at a bus stop" },
          { label: "Seaside town" },
          { label: "Mossy forest path" },
          { label: "Night sky and lanterns" },
          { label: "Summer train ride" },
        ],
      },
      {
        ref: "palette",
        type: "opinion_scale",
        title: "How should the colours feel?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Soft and pastel",
        labelHigh: "Rich and bright",
      },
      {
        ref: "format",
        type: "single_select",
        title: "What would you like to receive?",
        required: true,
        options: [
          { label: "A digital file" },
          { label: "A digital file and a print" },
          { label: "A file big enough for a poster" },
        ],
      },
      {
        ref: "purpose",
        type: "single_select",
        title: "What's it for?",
        required: true,
        options: [
          { label: "A gift" },
          { label: "Just for me" },
          { label: "A profile picture" },
          { label: "Wedding or event stationery" },
          { label: "My business" },
        ],
      },

      // Business use
      {
        ref: "business_use",
        type: "long_text",
        title: "Where will the art appear?",
        description: "Website, packaging, social posts, printed merchandise. It helps me price the right licence.",
        required: true,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "deadline",
        type: "date",
        title: "Is there a date you need it by?",
        required: false,
        disablePast: true,
      },
      { ref: "email", type: "email", title: "Where should I send sketches and a quote?", required: true },
      {
        ref: "share_ok",
        type: "yes_no",
        title: "Can I share the finished piece on my portfolio and social pages?",
        required: true,
      },
    ],
    branches: [
      { when: "subject", is: "An original scene I'll describe", then: "scene" },
      { when: "subject", is: "Me, a friend or my family", then: "references" },
      { when: "subject", is: "A couple", then: "references" },
      { when: "subject", is: "A pet", then: "references" },
      { when: "subject", is: "My home or a place I love", then: "references" },
      { when: "purpose", is: "My business", then: "business_use" },
      { when: "purpose", is: "A gift", then: "deadline" },
      { when: "purpose", is: "Just for me", then: "deadline" },
      { when: "purpose", is: "A profile picture", then: "deadline" },
      { when: "purpose", is: "Wedding or event stationery", then: "deadline" },
    ],
    ending: {
      title: "Thank you, this sounds lovely 🌿",
      body: "I'll look through your references and reply with a rough sketch idea, a price and a date I can finish by.",
    },
    guide: {
      questionsToConsider: [
        "Which subjects do you actually enjoy drawing, and are there any you'd rather not take on?",
        "Which moods or settings suit your own style best, and should the options show them?",
        "What formats do you deliver, and do you offer prints yourself?",
        "How do you price personal work against business use?",
      ],
      howToUseResponses:
        "Open the reference photos first: they tell you straight away whether the request is doable and how long it will take. Use the mood picks and the colour scale to sketch a rough idea before you quote, so the client is agreeing to something they can see. Check the deadline against your queue, and for business requests price the licence from where the art will appear, not just the time it takes to paint.",
      customizeSteps: [
        "Rewrite the greeting and ending in your own voice, since clients are choosing you as much as the style.",
        "Replace the mood options with settings from your own portfolio, so people pick from things you've shown you can paint.",
        "Link the form from your portfolio, shop or social bio, and read new requests in the dashboard as they arrive.",
      ],
      faqs: [
        {
          q: "Is this form connected to Studio Ghibli?",
          a: "No. It is a commission request form for independent artists who paint in a soft, hand-drawn anime style. Avoid using film stills or characters you don't have the rights to.",
        },
        {
          q: "What should an art commission request form ask?",
          a: "What to draw, reference images, the mood and colours, the format, the deadline, how the art will be used and how to reach the client.",
        },
        {
          q: "Why ask how the artwork will be used?",
          a: "Personal and business use are usually priced differently. Asking up front means the client knows what they are paying for before you start.",
        },
        {
          q: "Can I use this form for other art styles?",
          a: "Yes. Change the mood options and the wording in the greeting, and the rest works for any illustration request.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "employee-onboarding",
    type: "form",
    category: "other",
    goals: [],
    roles: ["hr-people", "operations"],
    searchName: "Employee onboarding form",
    title: "Employee onboarding",
    icon: "UserCheck",
    metaDescription:
      "Collect what a new hire needs before day one: contact details, start date, kit, emergency contact and a signed handbook, with separate remote and office questions.",
    description: "Collect what a new starter needs before day one.",
    blurb:
      "The details that otherwise arrive as five separate emails in the first week: legal name, contact details, kit, an emergency contact and a signature on the handbook. Remote starters get shipping and home-setup questions, office starters pick their site and say how they'll commute, and hybrid starters choose an office and get the home-setup questions too.",
    tags: ["employee onboarding", "new hire form", "people ops", "pre-boarding", "branching"],
    greeting: "Welcome aboard! A few details so everything's ready on your first day.",
    questions: [
      { ref: "legal_name", type: "short_text", title: "What's your full legal name?", required: true, maxLength: 150 },
      {
        ref: "preferred_name",
        type: "short_text",
        title: "What name and pronouns should we use in the team directory?",
        required: false,
        maxLength: 80,
      },
      { ref: "personal_email", type: "email", title: "A personal email we can reach you on before you start", required: true },
      { ref: "phone", type: "phone", title: "Your mobile number?", required: true },
      { ref: "start_date", type: "date", title: "Please confirm your start date.", required: true, disablePast: true },
      {
        ref: "work_location",
        type: "single_select",
        title: "Where will you be working from?",
        required: true,
        options: [{ label: "Remote" }, { label: "The office" }, { label: "A bit of both" }],
      },

      // Office
      {
        ref: "office_site",
        type: "dropdown",
        title: "Which office?",
        required: true,
        options: [{ label: "Head office" }, { label: "North office" }, { label: "South office" }],
      },
      {
        ref: "commute",
        type: "single_select",
        title: "How will you get in?",
        description: "So we know whether to sort a parking space or a bike rack.",
        required: false,
        options: [{ label: "Public transport" }, { label: "Driving" }, { label: "Cycling" }, { label: "Walking" }],
      },

      // Hybrid
      {
        ref: "hybrid_office",
        type: "dropdown",
        title: "Which office will you use on office days?",
        required: true,
        options: [{ label: "Head office" }, { label: "North office" }, { label: "South office" }],
      },

      // Remote and hybrid
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
          { label: "A decent desk chair" },
          { label: "Headset" },
          { label: "Webcam" },
        ],
      },

      // Everyone
      {
        ref: "equipment",
        type: "single_select",
        title: "Which laptop would you like?",
        required: true,
        options: [{ label: "Mac" }, { label: "Windows" }, { label: "Linux" }, { label: "No preference" }],
      },
      {
        ref: "tshirt",
        type: "single_select",
        title: "T-shirt size, for the welcome pack?",
        required: false,
        options: [{ label: "XS" }, { label: "S" }, { label: "M" }, { label: "L" }, { label: "XL" }, { label: "XXL" }],
      },
      { ref: "dietary", type: "short_text", title: "Any dietary needs for team lunches?", required: false, maxLength: 200 },
      {
        ref: "emergency_name",
        type: "short_text",
        title: "Who should we contact in an emergency, and how are they related to you?",
        required: true,
        maxLength: 120,
      },
      { ref: "emergency_phone", type: "phone", title: "Their phone number?", required: true },
      {
        ref: "accessibility",
        type: "long_text",
        title: "Is there anything we should set up so work works well for you?",
        description: "Adjustments, equipment, working hours. Only your manager and HR will see this.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "handbook",
        type: "signature",
        title: "Sign to confirm you've read the employee handbook.",
        required: true,
        drawnNameRequired: true,
      },
    ],
    branches: [
      { when: "work_location", is: "Remote", then: "shipping_address" },
      { when: "work_location", is: "The office", then: "office_site" },
      { when: "work_location", is: "A bit of both", then: "hybrid_office" },
      { when: "commute", always: true, then: "equipment" },
    ],
    ending: { title: "All set 🎊", body: "See you on day one. We'll email your first-week schedule shortly." },
    guide: {
      questionsToConsider: [
        "Which details does payroll or your HR system need before the first day, and which can wait?",
        "What kit do you send remote starters, and how long does shipping take?",
        "Which offices or sites should appear in the list?",
        "Who needs to see the accessibility answer, and who shouldn't?",
      ],
      howToUseResponses:
        "Work back from the start date. Order and ship kit to remote and hybrid starters first, since that takes longest, then pass the laptop choice to IT and the office and commute answers to facilities. Put the emergency contact into your HR records, and have the manager read the accessibility answer before day one so any adjustments are ready rather than promised.",
      customizeSteps: [
        "Replace the office names with your own sites, in both office questions.",
        "Edit the laptop and home setup options to match the kit you actually provide.",
        "Send the link with the offer acceptance email, and export responses to CSV for IT and facilities.",
      ],
      faqs: [
        {
          q: "What should an employee onboarding form include?",
          a: "Legal name, contact details, start date, work location, equipment needs, an emergency contact and a signed acknowledgement of key policies.",
        },
        {
          q: "When should new hires fill in the onboarding form?",
          a: "As soon as they accept the offer. That gives IT time to prepare a laptop and gives remote starters time to receive their kit.",
        },
        {
          q: "Should bank or tax details go in this form?",
          a: "Usually not. Collect those through your payroll system, which is built to handle them, and keep this form to setup and contact details.",
        },
        {
          q: "Can remote and office employees use the same onboarding form?",
          a: "Yes. This one asks where they will work and shows remote, office and hybrid starters only the questions that apply to them.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "referral-submission",
    type: "form",
    category: "other",
    goals: [],
    roles: ["hr-people"],
    searchName: "Employee referral form",
    title: "Employee referral",
    icon: "UserPlus",
    metaDescription:
      "Let staff refer candidates in a few minutes: who they are, which role and why they fit. Recruiters only contact people who know they've been referred.",
    description: "Put a candidate forward with their name, the role and one honest reason they fit.",
    blurb:
      "Kept short on purpose, because people stop referring when it feels like paperwork. The candidate's name, the role and one honest reason are enough for a recruiter to act on. When the candidate already knows, the form asks how to reach them; when they don't, it takes the referrer's word that they'll check first, rather than contact details they shouldn't be sharing.",
    tags: ["employee referral", "referral program", "hiring", "recruiting", "branching"],
    greeting: "Know someone great? Put them forward. It only takes a few minutes.",
    questions: [
      {
        ref: "referrer",
        type: "contact_info",
        title: "First, your name and work email, so we can keep you posted.",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "referrer_team", type: "short_text", title: "Which team are you on?", required: false, maxLength: 80 },
      { ref: "candidate_name", type: "short_text", title: "Who are you referring?", required: true, maxLength: 120 },
      {
        ref: "role",
        type: "dropdown",
        title: "Which role are you referring them for?",
        required: true,
        options: [
          { label: "Engineering" },
          { label: "Design" },
          { label: "Product" },
          { label: "Sales" },
          { label: "Marketing" },
          { label: "Operations" },
          { label: "No specific role yet" },
        ],
      },
      {
        ref: "worked_together",
        type: "single_select",
        title: "How do you know them?",
        required: true,
        options: [
          { label: "We worked together directly" },
          { label: "Same company, different team" },
          { label: "Through a community or event" },
          { label: "Personally" },
        ],
      },
      {
        ref: "has_consent",
        type: "yes_no",
        title: "Do they know you're referring them?",
        required: true,
        yesLabel: "Yes, they're expecting it",
        noLabel: "Not yet",
      },

      // They know
      {
        ref: "candidate_contact",
        type: "short_text",
        title: "How can we reach them? An email or profile link is fine.",
        required: true,
        maxLength: 200,
      },
      {
        ref: "best_approach",
        type: "single_select",
        title: "How should we get in touch?",
        required: false,
        options: [{ label: "An email from a recruiter" }, { label: "A message on a professional network" }, { label: "I'll introduce us" }],
      },
      {
        ref: "cv",
        type: "file_upload",
        title: "Have their CV? Attach it here.",
        required: false,
        accept: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        maxFiles: 1,
        maxSizeMB: 10,
      },

      // They don't know yet
      {
        ref: "will_ask",
        type: "yes_no",
        title: "Will you ask them first?",
        description: "We won't contact anyone who hasn't agreed to it.",
        required: true,
        yesLabel: "Yes, I'll check with them",
        noLabel: "No, just log it for now",
      },

      // Everyone
      {
        ref: "why",
        type: "long_text",
        title: "Why would they be good here?",
        description: "One specific thing you've seen them do beats a list of adjectives.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "strength",
        type: "opinion_scale",
        title: "How strongly would you vouch for them?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Worth a look",
        labelHigh: "Hire them tomorrow",
      },
    ],
    branches: [
      { when: "has_consent", is: true, then: "candidate_contact" },
      { when: "has_consent", is: false, then: "will_ask" },
      { when: "cv", always: true, then: "why" },
    ],
    ending: { title: "Thanks for the referral 🙌", body: "A recruiter will take it from here, and we'll let you know how it goes." },
    guide: {
      questionsToConsider: [
        "Which roles are open right now, and should the list update as they change?",
        "Do you pay a referral bonus, and what does the referrer need to know about it?",
        "Who follows up on referrals where the candidate hasn't been asked yet?",
        "Should referrals for no specific role go into a general talent pool?",
      ],
      howToUseResponses:
        "Contact only the candidates whose referrers said they know about it, and use the approach the referrer suggested. For the ones not yet asked, send the referrer a reminder after a few days. Read the vouching score together with how they know the candidate: a strong vouch from someone who worked with them directly is worth fast-tracking. Tell referrers what happened either way, because silence is what stops people referring again.",
      customizeSteps: [
        "Replace the role list with your open teams or current job titles.",
        "Add a line to the greeting about your referral bonus or policy, if you have one.",
        "Share the link in your internal chat and staff handbook, and check new referrals in the dashboard each week.",
      ],
      faqs: [
        {
          q: "What should an employee referral form include?",
          a: "The referrer's details, the candidate's name and contact, the role, how they know each other and why they would be a good fit.",
        },
        {
          q: "Should the candidate know they've been referred?",
          a: "Yes. Contacting someone who didn't expect it is awkward for everyone. This form asks, and only collects contact details once the candidate is on board.",
        },
        {
          q: "How do you make an employee referral program work?",
          a: "Keep referring quick, follow up with every referrer, and tell them the outcome. People who never hear back tend to stop referring, whatever the bonus.",
        },
      ],
    },
  }),
];
