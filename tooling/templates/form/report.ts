import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_REPORT: TemplateSeed[] = [
  defineTemplate({
    slug: "online-activity-log",
    type: "form",
    category: "report",
    goals: [],
    roles: ["operations", "freelancers-agencies", "hr-people"],
    searchName: "Online activity log",
    title: "Activity log",
    icon: "ClipboardList",
    metaDescription:
      "Log what you worked on, when and for how long, with a status for each entry. Blocked work gets its own follow-up so someone can step in before it slips.",
    description: "Record one piece of work at a time, with the time it took and where it stands.",
    blurb:
      "One entry per task: the day, the kind of work, the hours and whether it is done. Anyone who marks a task as blocked is asked what is in the way and whether they need help, so the log doubles as an early warning rather than just a timesheet.",
    tags: ["activity log", "work log", "time tracking", "daily log", "timesheet"],
    greeting: "Time to log an entry. It takes about a minute.",
    questions: [
      { ref: "logged_by", type: "short_text", title: "Who is logging this entry?", required: true, maxLength: 120 },
      { ref: "entry_date", type: "date", title: "Which day was this work done?", required: true },
      {
        ref: "category",
        type: "single_select",
        title: "What kind of work was it?",
        required: true,
        allowOther: true,
        options: [
          { label: "Client or customer work" },
          { label: "Internal project" },
          { label: "Meetings and calls" },
          { label: "Admin and email" },
          { label: "Training or learning" },
        ],
      },
      {
        ref: "task",
        type: "short_text",
        title: "What did you work on?",
        description: "A short name someone else would recognise, like a project or ticket name.",
        required: true,
        maxLength: 200,
      },
      {
        ref: "hours",
        type: "number",
        title: "How many hours did it take?",
        description: "Use decimals for part hours, so 1.5 is an hour and a half.",
        required: true,
        min: 0,
        max: 24,
      },
      {
        ref: "status",
        type: "single_select",
        title: "Where does it stand now?",
        required: true,
        options: [{ label: "Done" }, { label: "Still in progress" }, { label: "Blocked" }],
      },

      // Done or in progress
      {
        ref: "outcome",
        type: "long_text",
        title: "What came out of it?",
        description: "A result, a decision, or what's left to do.",
        required: false,
        maxLength: 800,
      },

      // Blocked
      {
        ref: "blocker",
        type: "long_text",
        title: "What's in the way?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "needs_help",
        type: "yes_no",
        title: "Do you need someone to step in to get it moving?",
        required: true,
      },

      // Everyone
      {
        ref: "focus",
        type: "opinion_scale",
        title: "How focused was that time?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Constant interruptions",
        labelHigh: "Deep, uninterrupted work",
      },
      {
        ref: "next_step",
        type: "short_text",
        title: "What's the next step, and who owns it?",
        required: false,
        maxLength: 200,
      },
      {
        ref: "attachment",
        type: "file_upload",
        title: "Anything worth keeping with this entry?",
        description: "Optional. A screenshot, a document or meeting notes.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 3,
        maxSizeMB: 10,
      },
    ],
    branches: [
      { when: "status", is: "Done", then: "outcome" },
      { when: "status", is: "Still in progress", then: "outcome" },
      { when: "status", is: "Blocked", then: "blocker" },
      { when: "outcome", always: true, then: "focus" },
    ],
    ending: {
      title: "Entry logged",
      body: "Thanks. If you flagged a blocker, whoever reviews the log will see it first.",
    },
    guide: {
      questionsToConsider: [
        "Will people log each task as they finish it, or fill in a whole day at once?",
        "Which work categories match how your team actually splits its time?",
        "Should hours be exact, or is the nearest half hour good enough?",
        "Who reads the blocked entries, and how quickly are they expected to respond?",
      ],
      howToUseResponses:
        "Export the log to CSV each week and total the hours by person and category, which shows where time really goes compared with where you planned it. Read the blocked entries first, especially any where someone asked for help, and reply the same day. Over a month, the focus scores next to each category point to the kinds of work that get interrupted most.",
      customizeSteps: [
        "Replace the work categories with the ones your team uses in its own reports, so totals line up.",
        "Turn the name question into a dropdown of your team members, so entries always match when you total them.",
        "Bookmark the link or pin it where people end their day, so logging becomes a habit rather than a Friday scramble.",
      ],
      faqs: [
        {
          q: "What should an activity log include?",
          a: "The date, what was worked on, the time spent and its status. A short note on the result or the next step makes the log useful to someone other than the person who wrote it.",
        },
        {
          q: "Can a whole team use one activity log?",
          a: "Yes. Everyone fills in the same form, and the name on each entry lets you filter the responses by person in the dashboard or after exporting them to CSV.",
        },
        {
          q: "How is this different from a timesheet?",
          a: "A timesheet records hours for pay or billing. An activity log also records what happened and what is stuck, so it helps with planning and spotting problems as well as counting time.",
        },
        {
          q: "Can I change the questions?",
          a: "Yes. Use this template copies it into your account, where you can edit every question, add or remove categories and change the follow-up for blocked work.",
        },
      ],
    },
  }),
];
