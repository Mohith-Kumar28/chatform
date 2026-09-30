import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_EVALUATION: TemplateSeed[] = [
  defineTemplate({
    slug: "manager-effectiveness-survey",
    type: "survey",
    category: "evaluation",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["hr-people", "operations"],
    searchName: "Manager effectiveness survey",
    title: "Manager effectiveness",
    icon: "UserCheck",
    metaDescription:
      "Ask direct reports how their manager handles priorities, feedback, decisions and growth. Low scores lead to one concrete change; high scores to what to keep.",
    description: "Hear from a team how their manager really supports them, one behaviour at a time.",
    blurb:
      "Rates the specific things a manager does, such as setting priorities, giving feedback and making timely decisions, instead of asking for one vague grade. People who score their manager low are asked for the single change that would help most and can request a private follow-up, while those who score high are asked what the manager should keep doing.",
    tags: ["manager effectiveness survey", "upward feedback", "manager evaluation", "leadership feedback", "employee survey"],
    greeting:
      "This is a few minutes of honest feedback about your manager. Answer for how things usually are, not your best or worst week.",
    questions: [
      {
        ref: "manager_name",
        type: "short_text",
        title: "Which manager is this feedback about?",
        description: "Only HR sees this. It is used to group answers by manager.",
        required: true,
        maxLength: 120,
      },
      {
        ref: "tenure_with_manager",
        type: "single_select",
        title: "How long have you reported to this manager?",
        required: true,
        options: [
          { label: "Less than 3 months" },
          { label: "3 to 12 months" },
          { label: "1 to 2 years" },
          { label: "More than 2 years" },
        ],
      },
      {
        ref: "behaviours",
        type: "matrix",
        title: "How much do you agree with each of these about your manager?",
        required: true,
        rows: [
          "Makes it clear what matters most right now",
          "Gives me feedback I can act on",
          "Makes decisions promptly when the team needs one",
          "Is available when I'm stuck",
          "Notices and credits good work",
          "Takes an interest in where my career is going",
          "Treats everyone on the team fairly",
        ],
        columns: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
      },
      {
        ref: "one_on_ones",
        type: "single_select",
        title: "How often do you get a one-to-one with them?",
        required: true,
        options: [
          { label: "Weekly" },
          { label: "Every two weeks" },
          { label: "Monthly" },
          { label: "Less than monthly" },
          { label: "We don't have them" },
        ],
      },
      {
        ref: "psych_safety",
        type: "opinion_scale",
        title: "How comfortable are you raising a problem or a mistake with them?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Completely",
      },
      {
        ref: "overall",
        type: "opinion_scale",
        title: "Overall, how well does your manager help you do your best work?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Extremely well",
      },

      // Scored 6 or higher
      {
        ref: "keep_doing",
        type: "long_text",
        title: "What is one thing they do that you'd want them to keep doing?",
        description: "A specific example is more useful than a general compliment.",
        required: false,
        maxLength: 800,
      },

      // Scored 5 or lower
      {
        ref: "one_change",
        type: "long_text",
        title: "What one change from your manager would make the biggest difference to your work?",
        description: "Describe the behaviour and what it would change for you.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "private_follow_up",
        type: "yes_no",
        title: "Would you like someone from HR to follow up with you privately?",
        required: true,
        yesLabel: "Yes, please",
        noLabel: "No, thanks",
      },
      {
        ref: "follow_up_email",
        type: "email",
        title: "What email should HR use to reach you?",
        description: "This is for HR only and is not passed to your manager.",
        required: true,
      },

      // Everyone
      {
        ref: "more_of",
        type: "ranking",
        title: "Rank what you'd most like more of from your manager",
        required: false,
        items: [
          "Clear priorities",
          "Regular feedback",
          "Recognition",
          "Room to decide for myself",
          "Help with career growth",
          "Protection from distractions",
        ],
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Anything else your manager should hear?",
        required: false,
        maxLength: 1000,
      },
    ],
    branches: [
      { when: "overall", op: "gte", is: 6, then: "keep_doing" },
      { when: "overall", op: "lte", is: 5, then: "one_change" },
      { when: "keep_doing", always: true, then: "more_of" },
      { when: "private_follow_up", is: false, then: "more_of" },
    ],
    ending: {
      title: "Thanks, your manager will hear the themes",
      body: "HR reads every answer and shares themes with your manager, not individual replies.",
    },
    guide: {
      questionsToConsider: [
        "How many people report to each manager, and is that enough to keep individual answers from being recognised?",
        "Which behaviours does your company actually expect from managers, and do the matrix rows match them?",
        "Who reads the raw written answers: HR only, or the manager's own manager too?",
        "Will managers see their results before a development conversation, or during it?",
        "How often will you repeat the survey so a manager can see whether a change landed?",
      ],
      howToUseResponses:
        "Look at each manager's matrix for patterns, not single low marks: a team that agrees priorities are clear but disagrees that decisions come promptly points to one specific habit. Read the one-change answers together and pull out themes before sharing anything, and reply within a week to anyone who asked HR to follow up. Give each manager a short summary with two or three behaviours to work on, then run the same survey again next cycle to see whether those rows moved.",
      customizeSteps: [
        "Rewrite the matrix rows to match the behaviours your manager training or competency framework already names.",
        "Swap the manager name question for a dropdown of your managers, so every answer is spelled the same and grouping in the export is exact.",
        "Tell people before you send it who will read the answers and how results are shared, then send the link by email or embed it on your intranet.",
      ],
      faqs: [
        {
          q: "What questions should a manager effectiveness survey include?",
          a: "Ask about observable behaviours: setting priorities, giving feedback, making decisions, being available, recognising work, supporting growth and treating people fairly. Pair the ratings with at least one open question that asks for an example.",
        },
        {
          q: "Should a manager effectiveness survey be anonymous?",
          a: "Usually yes, because people rate their manager more honestly when they are not named. Only report results for groups large enough that one person's answers can't be picked out, and keep any contact details optional.",
        },
        {
          q: "How often should you run a manager effectiveness survey?",
          a: "Once or twice a year works for most teams. That is often enough to see whether a manager's changes are noticed, without asking people to repeat themselves every month.",
        },
        {
          q: "How do you share manager feedback without it feeling like an attack?",
          a: "Share themes rather than quotes, start with what the team wants kept, and agree two or three behaviours to work on. Treat the results as the start of a development conversation, not a verdict.",
        },
      ],
    },
  }),
];
