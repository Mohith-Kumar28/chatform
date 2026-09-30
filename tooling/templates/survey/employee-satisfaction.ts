import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_EMPLOYEE_SATISFACTION: TemplateSeed[] = [
  defineTemplate({
    slug: "company-satisfaction-survey",
    type: "survey",
    category: "employee-satisfaction",
    goals: ["collect-feedback"],
    roles: ["hr-people", "operations"],
    searchName: "Company satisfaction survey",
    title: "Company satisfaction",
    icon: "Building2",
    metaDescription:
      "Ask employees how they feel about their work, manager, pay, workload and leadership. Unhappy staff are asked if they've thought about leaving, and why.",
    description: "Learn how people feel about working here, and who might be thinking of leaving.",
    blurb:
      "Covers the whole job in one grid, from day-to-day work to pay and leadership, then asks people to rank the changes that would matter most. Staff who wouldn't recommend working here are asked whether they have thought about leaving and what is behind it, while happier staff are asked what's worth protecting.",
    tags: ["employee satisfaction survey", "company culture", "staff survey", "employee retention", "branching"],
    greeting: "This survey is anonymous and takes about four minutes. Honest answers help most.",
    questions: [
      {
        ref: "department",
        type: "dropdown",
        title: "Which part of the company do you work in?",
        description: "Only used to group results, never to identify you.",
        required: true,
        options: [
          { label: "Operations" },
          { label: "Sales and marketing" },
          { label: "Product and engineering" },
          { label: "Customer support" },
          { label: "Finance and admin" },
          { label: "People and HR" },
          { label: "Other" },
        ],
      },
      {
        ref: "tenure",
        type: "single_select",
        title: "How long have you worked here?",
        required: true,
        options: [
          { label: "Less than a year" },
          { label: "1 to 3 years" },
          { label: "3 to 5 years" },
          { label: "More than 5 years" },
        ],
      },
      { ref: "overall", type: "rating", title: "Overall, how satisfied are you working here?", required: true, scale: 5 },
      {
        ref: "areas",
        type: "matrix",
        title: "How do you feel about each of these?",
        required: true,
        rows: [
          "Your day-to-day work",
          "Your manager",
          "Your team",
          "Pay and benefits",
          "Your workload",
          "Chances to learn and grow",
          "Communication from leadership",
        ],
        columns: ["Unhappy", "Mixed", "Happy", "Very happy"],
      },
      {
        ref: "direction",
        type: "opinion_scale",
        title: "I understand where the company is heading and why.",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Strongly disagree",
        labelHigh: "Strongly agree",
      },
      {
        ref: "tools",
        type: "opinion_scale",
        title: "I have what I need to do my job well.",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Strongly disagree",
        labelHigh: "Strongly agree",
      },
      {
        ref: "changes",
        type: "ranking",
        title: "Which changes would make the biggest difference to you? Put the biggest first.",
        required: true,
        items: [
          "Clearer communication",
          "Better pay or benefits",
          "More flexible hours",
          "Better tools and equipment",
          "More training",
          "A fairer workload",
        ],
      },
      { ref: "enps", type: "nps", title: "How likely are you to recommend working here to a friend?", required: true },

      // Would not recommend
      {
        ref: "thought_leaving",
        type: "yes_no",
        title: "Have you thought about leaving in the last six months?",
        required: true,
        yesLabel: "Yes",
        noLabel: "No",
      },
      {
        ref: "leave_reason",
        type: "long_text",
        title: "What's behind that? What would change your mind?",
        description: "Still anonymous. Nobody will try to work out who wrote this.",
        required: false,
        maxLength: 1000,
      },

      // Would recommend
      {
        ref: "best_thing",
        type: "long_text",
        title: "What's the best thing about working here?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "one_change",
        type: "long_text",
        title: "If you could change one thing tomorrow, what would it be?",
        required: false,
        maxLength: 1000,
      },
    ],
    branches: [
      { when: "enps", op: "gte", is: 7, then: "best_thing" },
      { when: "thought_leaving", is: false, then: "one_change" },
      { when: "leave_reason", always: true, then: "one_change" },
    ],
    ending: { title: "Thank you for being honest 💬", body: "We'll share what we heard, and what we plan to do about it, within a month." },
    guide: {
      questionsToConsider: [
        "How will you keep answers anonymous, especially in small teams?",
        "Do the departments in the dropdown match how you want to report results?",
        "Which of the changes in the ranking are you actually willing to make?",
        "When will you share results with staff, and who will present them?",
      ],
      howToUseResponses:
        "Look at the grid by department before you look at the company average, because one unhappy team can hide inside a decent overall score. The share of people who have thought about leaving, read alongside their reasons, is the number leadership should see first. Compare the ranked changes with what you can realistically do this year, then tell staff what you heard and which two or three things you will act on. A survey with no visible follow-up gets fewer honest answers next time.",
      customizeSteps: [
        "Edit the departments to match your structure, and merge small teams so no one can be identified.",
        "Change the rows in the grid if there are parts of the job you want to hear about, such as office space or remote work.",
        "Share the link company-wide with a clear closing date, and send one reminder halfway through.",
      ],
      faqs: [
        {
          q: "What questions should a company satisfaction survey include?",
          a: "Cover the work itself, the manager, the team, pay, workload, growth and communication from leadership. Add a question about whether people would recommend working here, and an open question about what to change.",
        },
        {
          q: "Should an employee satisfaction survey be anonymous?",
          a: "Usually yes, because people are more honest when they can't be identified. Avoid asking for names, and don't report results for groups so small that answers could be traced back to someone.",
        },
        {
          q: "How often should we run a company satisfaction survey?",
          a: "Once or twice a year for a full survey like this one, with a shorter pulse survey in between if you want to track change.",
        },
        {
          q: "What is an eNPS question?",
          a: "It asks employees how likely they are to recommend the company as a place to work, on a 0 to 10 scale. It is scored the same way as a customer NPS.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "employee-on-boarding-survey",
    type: "survey",
    category: "employee-satisfaction",
    goals: ["collect-feedback"],
    roles: ["hr-people", "operations"],
    searchName: "Employee onboarding survey",
    title: "New hire onboarding",
    icon: "UserCheck",
    metaDescription:
      "Ask new hires whether their equipment was ready, who they met and what still feels unclear. Anyone with open questions can ask HR to get in touch.",
    description: "Find out whether new starters got what they needed in their first weeks.",
    blurb:
      "Asks the practical questions first: was the laptop ready, did the logins work, who introduced themselves. Then it checks whether the new hire knows what's expected of them. Anyone still unsure is asked what about, and can leave their details for HR to follow up.",
    tags: ["onboarding survey", "new hire survey", "employee onboarding", "first 30 days", "branching"],
    greeting: "Welcome aboard! Tell us how your first few weeks have gone. About three minutes.",
    questions: [
      {
        ref: "time_in_role",
        type: "single_select",
        title: "How long ago did you start?",
        required: true,
        options: [{ label: "Less than two weeks" }, { label: "Two to four weeks" }, { label: "One to three months" }, { label: "Longer than that" }],
      },
      {
        ref: "team",
        type: "short_text",
        title: "Which team did you join?",
        description: "Leave it blank if your team is small enough that this would identify you.",
        required: false,
        maxLength: 80,
      },
      {
        ref: "first_day",
        type: "rating",
        title: "How did your first day feel?",
        required: true,
        scale: 5,
        shape: "heart",
      },
      {
        ref: "ready",
        type: "matrix",
        title: "When were these ready for you?",
        required: true,
        rows: ["Laptop and equipment", "Logins and accounts", "A place to work", "A plan for your first week"],
        columns: ["On day one", "Within a few days", "After a week or more", "Still waiting"],
      },
      {
        ref: "intros",
        type: "multi_select",
        title: "Who gave you a proper introduction?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "My manager" },
          { label: "My team" },
          { label: "A buddy or mentor" },
          { label: "People in other teams I work with" },
          { label: "Nobody really" },
        ],
      },
      {
        ref: "checkins",
        type: "single_select",
        title: "How often has your manager checked in with you so far?",
        required: true,
        options: [
          { label: "Every day" },
          { label: "A few times a week" },
          { label: "About once a week" },
          { label: "Less than that" },
        ],
      },
      {
        ref: "expectations",
        type: "opinion_scale",
        title: "I know what's expected of me in my role.",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Strongly disagree",
        labelHigh: "Strongly agree",
      },
      {
        ref: "most_helpful",
        type: "long_text",
        title: "What helped you most in your first weeks?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "still_unsure",
        type: "yes_no",
        title: "Is there anything you're still unsure about?",
        required: true,
      },

      // Still unsure
      {
        ref: "unsure_what",
        type: "long_text",
        title: "What's still unclear?",
        description: "Pay, policies, tools, your role: anything counts.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "hr_contact",
        type: "yes_no",
        title: "Would you like someone from HR to get in touch about it?",
        required: true,
        yesLabel: "Yes, please",
        noLabel: "No, I'll ask around",
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "How can HR reach you?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },

      // Everyone
      {
        ref: "prepared",
        type: "opinion_scale",
        title: "Overall, how well did onboarding prepare you for the job?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Very well",
      },
      {
        ref: "suggestion",
        type: "long_text",
        title: "What should we do differently for the next new starter?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "still_unsure", is: false, then: "prepared" },
      { when: "hr_contact", is: false, then: "prepared" },
    ],
    ending: { title: "Thanks, and welcome again 🎉", body: "Your answers help us make the next person's first weeks smoother." },
    guide: {
      questionsToConsider: [
        "When should new hires get this: after two weeks, after a month, or both?",
        "Which items should be ready on day one at your company, and are they rows in the grid?",
        "Do you assign buddies or mentors? If not, remove that option.",
        "Who in HR follows up with new hires who ask for help, and how quickly?",
      ],
      howToUseResponses:
        "Follow up with every new hire who asked HR to get in touch within a couple of days, since early confusion is when people start to doubt a new job. Then look at the readiness grid across all starters: if logins keep arriving after a week, that is a process fix for IT and HR, not a one-off. Compare the manager check-in answers with how clear people feel about their role, and share patterns with managers who hire often.",
      customizeSteps: [
        "Edit the grid rows to the things your company promises to have ready on day one.",
        "Change the team question to a dropdown of your departments if you want cleaner reports, merging small teams so new starters stay anonymous.",
        "Send the link automatically two or four weeks after each start date, and export results to CSV each quarter to spot trends.",
      ],
      faqs: [
        {
          q: "When should you send an onboarding survey to new employees?",
          a: "Two to four weeks after their start date works well. They have seen enough to judge, and still remember the first days clearly. Some teams send a second one at around 90 days.",
        },
        {
          q: "What questions should an employee onboarding survey ask?",
          a: "Ask whether equipment and accounts were ready, who introduced themselves, how often the manager checked in, whether expectations are clear and what is still confusing.",
        },
        {
          q: "Should an onboarding survey be anonymous?",
          a: "It can be, but new starter groups are often small, so full anonymity is hard. This template asks for a start range instead of a date, makes the team optional and only asks for a name when someone wants HR to follow up.",
        },
        {
          q: "Can I edit this onboarding survey?",
          a: "Yes. Use this template copies it into your account, where you can change every question and the branching before you share it.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "it-satisfaction-survey",
    type: "survey",
    category: "employee-satisfaction",
    goals: ["collect-feedback"],
    roles: ["operations", "hr-people"],
    searchName: "IT satisfaction survey",
    title: "IT satisfaction",
    icon: "Wrench",
    metaDescription:
      "Ask staff how well their laptops, Wi-Fi, apps and IT support work for them, how often tech gets in the way and what would help. Only help desk users rate support.",
    description: "Find out how well everyday tech and IT support are working for your team.",
    blurb:
      "Rates each everyday system in one grid, from laptops to video calls, and asks how often tech problems interrupt real work. Only people who have asked IT for help recently are asked to rate the support, so the scores come from people who have actually used it.",
    tags: ["it satisfaction survey", "internal it survey", "tech feedback", "help desk", "employee survey", "branching"],
    greeting: "How well is your tech working for you? A few quick questions for the IT team.",
    questions: [
      {
        ref: "work_setup",
        type: "single_select",
        title: "Where do you mostly work?",
        required: true,
        options: [{ label: "In the office" }, { label: "At home" }, { label: "A mix of both" }, { label: "On the road or on site" }],
      },
      { ref: "overall", type: "rating", title: "Overall, how satisfied are you with IT at work?", required: true, scale: 5 },
      {
        ref: "systems",
        type: "matrix",
        title: "How well does each of these work for you?",
        required: true,
        rows: ["Laptop or computer", "Wi-Fi and network", "Email and calendar", "Video calls", "The main apps you work in", "Printing"],
        columns: ["Poor", "Fair", "Good", "Excellent", "Don't use"],
      },
      {
        ref: "interruptions",
        type: "single_select",
        title: "How often do tech problems stop you from working?",
        required: true,
        options: [
          { label: "Rarely or never" },
          { label: "A few times a month" },
          { label: "Every week" },
          { label: "Most days" },
        ],
      },
      {
        ref: "asked_it",
        type: "yes_no",
        title: "Have you asked IT for help in the last three months?",
        required: true,
      },

      // Used support
      {
        ref: "support_speed",
        type: "opinion_scale",
        title: "How quickly did you get help?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Far too slow",
        labelHigh: "Very quickly",
      },
      {
        ref: "support_quality",
        type: "rating",
        title: "How well was your problem solved?",
        required: true,
        scale: 5,
      },

      // Everyone
      {
        ref: "biggest_blocker",
        type: "long_text",
        title: "Which tech problem costs you the most time?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "wishes",
        type: "multi_select",
        title: "What would help you most? Pick up to three.",
        required: true,
        minSelections: 1,
        maxSelections: 3,
        options: [
          { label: "A faster laptop" },
          { label: "Better Wi-Fi" },
          { label: "Fewer passwords and logins" },
          { label: "Training on the tools we use" },
          { label: "Quicker help desk replies" },
          { label: "Better equipment for working from home" },
        ],
        allowOther: true,
      },
      {
        ref: "comments",
        type: "long_text",
        title: "Anything else the IT team should know?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [{ when: "asked_it", is: false, then: "biggest_blocker" }],
    ending: { title: "Thanks for helping us fix things 🔧", body: "The IT team will share what they're changing next quarter." },
    guide: {
      questionsToConsider: [
        "Which systems do most of your staff rely on every day, and are they rows in the grid?",
        "Do you want results split by office, home and field workers?",
        "What budget or time do you have to act on the top requests?",
        "Will you share the results with staff, and how?",
      ],
      howToUseResponses:
        "Start with the people who say tech stops them working every week or most days, and read what they say costs them the most time. Then split the grid by where people work: poor Wi-Fi scores from home workers call for a different fix than poor scores in the office. Support ratings only come from people who used the help desk, so read them next to how often those people are interrupted. Pick the top two requests and tell staff what you are changing.",
      customizeSteps: [
        "Replace the rows in the grid with the systems your company actually runs, including the main apps by name.",
        "Edit the list of things that would help so it only offers changes IT can realistically make.",
        "Share the link across the company once or twice a year, and export results to CSV to compare with the last round.",
      ],
      faqs: [
        {
          q: "What should an IT satisfaction survey ask?",
          a: "Ask how well each everyday system works, how often tech problems interrupt work, how good the help desk is for people who used it and what would help most.",
        },
        {
          q: "How often should we run an internal IT survey?",
          a: "Once or twice a year is enough for most companies. Run it again after a big change, like new laptops or a new system, to see whether it helped.",
        },
        {
          q: "Why only ask some people about IT support?",
          a: "People who haven't asked for help recently can only guess. This survey asks everyone about their tools, and only recent help desk users about support.",
        },
        {
          q: "Can I make this IT survey anonymous?",
          a: "Yes. This template doesn't ask for names or emails, so answers can't be tied to a person unless you add a question that does.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "engagement-pulse",
    type: "survey",
    category: "employee-satisfaction",
    goals: ["collect-feedback"],
    roles: ["hr-people"],
    searchName: "Employee pulse survey",
    title: "Engagement pulse",
    icon: "HeartPulse",
    metaDescription:
      "A short anonymous pulse survey to send monthly: five statements, an eNPS score and a follow-up asking anyone who is struggling what's weighing on them.",
    description: "A short, repeatable check that follows up with the people who are struggling.",
    blurb:
      "Short enough to send every month and consistent enough to trend: five statements on workload, clarity, support, growth and belonging, plus an eNPS score. Anyone who scores 6 or below is asked what's weighing on them and what would help this month, which is where the comments worth reading come from.",
    tags: ["pulse survey", "employee engagement", "enps", "monthly check-in", "branching"],
    greeting: "Quick pulse check. Anonymous, and under two minutes.",
    questions: [
      {
        ref: "team",
        type: "dropdown",
        title: "Which team are you in?",
        description: "Only used to group results, never to identify you.",
        required: false,
        options: [{ label: "Operations" }, { label: "Sales and marketing" }, { label: "Product and engineering" }, { label: "Support" }, { label: "Other" }],
      },
      { ref: "workload", type: "opinion_scale", title: "My workload is manageable.", required: true, steps: 5, startAt: 1, labelLow: "Strongly disagree", labelHigh: "Strongly agree" },
      { ref: "clarity", type: "opinion_scale", title: "I'm clear on what's expected of me.", required: true, steps: 5, startAt: 1, labelLow: "Strongly disagree", labelHigh: "Strongly agree" },
      { ref: "support", type: "opinion_scale", title: "I get the support I need from my manager.", required: true, steps: 5, startAt: 1, labelLow: "Strongly disagree", labelHigh: "Strongly agree" },
      { ref: "growth", type: "opinion_scale", title: "I'm learning and growing here.", required: true, steps: 5, startAt: 1, labelLow: "Strongly disagree", labelHigh: "Strongly agree" },
      { ref: "belonging", type: "opinion_scale", title: "I can be myself at work.", required: true, steps: 5, startAt: 1, labelLow: "Strongly disagree", labelHigh: "Strongly agree" },
      { ref: "enps", type: "nps", title: "How likely are you to recommend us as a place to work?", required: true },

      // 0–6: not doing well
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
        allowOther: true,
      },
      {
        ref: "low_detail",
        type: "long_text",
        title: "What would help most, this month?",
        description: "Still anonymous. Answers are summarised, never quoted with a name.",
        required: false,
        maxLength: 1000,
      },

      // everyone
      {
        ref: "win",
        type: "short_text",
        title: "What went well for you this month?",
        required: false,
        maxLength: 300,
      },
      { ref: "anything_else", type: "long_text", title: "Anything else on your mind?", required: false, maxLength: 1000 },
    ],
    branches: [
      { when: "enps", op: "lte", is: 6, then: "low_area" },
      { when: "enps", op: "gte", is: 7, then: "win" },
    ],
    ending: { title: "Thanks 💬", body: "Results are shared with the whole team, along with what we'll do about them." },
    guide: {
      questionsToConsider: [
        "How often will you send it: monthly, every two weeks or quarterly?",
        "How small can a team be before you combine it with another to protect anonymity?",
        "Who reads the comments from people who are struggling, and what will they do with them?",
        "Which of the five statements matter most to your company right now?",
      ],
      howToUseResponses:
        "Track each statement month by month rather than reading one round on its own: a workload score that drops three months in a row matters more than a single low month. Read the comments from people who scored 6 or below in full, and group what's weighing on them into themes you can share. Tell the team what you heard and one thing you will change before the next pulse goes out, or people will stop answering.",
      customizeSteps: [
        "Edit the teams in the dropdown to match your structure, or remove it if your company is small enough that it would identify people.",
        "Keep the five statements identical every round, so results can be compared over time.",
        "Send the link on the same day each month and close it after a week, then export the answers to CSV to chart the trend.",
      ],
      faqs: [
        {
          q: "What is an employee pulse survey?",
          a: "A short survey sent often, usually monthly or quarterly, that asks the same few questions each time. It shows how engagement changes rather than giving one big annual snapshot.",
        },
        {
          q: "How many questions should a pulse survey have?",
          a: "Somewhere between five and ten, so it takes a couple of minutes. This one asks nine short questions, plus two more for anyone who is struggling.",
        },
        {
          q: "How often should you run a pulse survey?",
          a: "Monthly or every two weeks suits fast-moving teams, and quarterly suits most others. Pick a rhythm you can act on, because sending it more often than you respond wears people out.",
        },
        {
          q: "What is eNPS?",
          a: "Employee Net Promoter Score asks how likely people are to recommend the company as a place to work, on a 0 to 10 scale. Subtract the share of 0 to 6 answers from the share of 9 and 10 answers.",
        },
      ],
    },
  }),
];
