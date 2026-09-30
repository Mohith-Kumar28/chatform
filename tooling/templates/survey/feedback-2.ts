import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_FEEDBACK_2: TemplateSeed[] = [
  defineTemplate({
    slug: "professional-development-feedback-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["hr-people", "operations"],
    searchName: "Professional development feedback survey",
    title: "Professional development feedback",
    icon: "TrendingUp",
    metaDescription:
      "Find out whether training, mentoring and learning time actually help your people grow, what gets in the way, and which support they want more of next year.",
    description: "Check whether development support is useful, and what people need to put new skills to work.",
    blurb:
      "Built for an annual or half-year review of your learning programme. The usefulness score decides the follow-up: people who got value are asked what helped most, and people who didn't are asked what got in the way. Anyone who took part in nothing skips the usefulness questions and goes straight to what held them back. It ends by asking who wants a conversation about their own development plan, and only those people are asked for an email.",
    tags: [
      "professional development survey",
      "learning and development",
      "training needs",
      "employee growth",
      "L&D feedback",
    ],
    greeting: "We want to spend next year's development time and budget where it helps you most. Five minutes?",
    questions: [
      {
        ref: "role_level",
        type: "single_select",
        title: "Which best describes your role?",
        required: true,
        options: [
          { label: "Individual contributor" },
          { label: "Team lead" },
          { label: "Manager of managers" },
          { label: "Senior leader" },
        ],
      },
      {
        ref: "activities",
        type: "multi_select",
        title: "Which of these did you take part in over the last year?",
        required: true,
        minSelections: 1,
        maxSelections: 7,
        options: [
          { label: "Workshops or in-house courses" },
          { label: "External courses or certifications" },
          { label: "Conferences or events" },
          { label: "Mentoring or coaching" },
          { label: "Online learning" },
          { label: "Stretch projects or job shadowing" },
          { label: "None of these" },
        ],
      },
      {
        ref: "usefulness",
        type: "rating",
        title: "Overall, how useful was the development support you had this year?",
        required: true,
        scale: 5,
      },

      // Found it useful
      {
        ref: "most_valuable",
        type: "long_text",
        title: "Which one thing helped you most, and what did it change in your work?",
        required: false,
        maxLength: 800,
      },

      // Didn't
      {
        ref: "not_useful",
        type: "long_text",
        title: "What got in the way of it being useful to you?",
        description: "Timing, topic, format, anything. Specifics help us fix it.",
        required: true,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "application",
        type: "matrix",
        title: "How much do you agree with each of these?",
        required: true,
        rows: [
          "What I learned matched what my role needs",
          "I had time to practise what I learned",
          "My manager helped me use it in my work",
          "I know where to find development opportunities",
        ],
        columns: ["Strongly disagree", "Disagree", "Agree", "Strongly agree"],
      },
      {
        ref: "barriers",
        type: "multi_select",
        title: "What makes it harder to develop your skills here?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Not enough time" },
          { label: "Limited budget" },
          { label: "Not sure what's on offer" },
          { label: "Options don't fit my role" },
          { label: "Little support from my manager" },
          { label: "Nothing major" },
        ],
      },
      {
        ref: "support_ranking",
        type: "ranking",
        title: "Rank the support you'd most like more of next year.",
        required: true,
        items: [
          "Formal training courses",
          "Mentoring or coaching",
          "Stretch projects",
          "Conference or event budget",
          "Protected learning time each month",
        ],
      },
      {
        ref: "skill_goal",
        type: "short_text",
        title: "Which skill do you most want to build in the next twelve months?",
        required: true,
        maxLength: 200,
      },
      {
        ref: "apply_help",
        type: "long_text",
        title: "What would help you put new skills to use in your day-to-day work?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "plan_chat",
        type: "yes_no",
        title: "Would you like someone from the people team to talk through a development plan with you?",
        required: true,
      },
      {
        ref: "work_email",
        type: "email",
        title: "What's your work email, so we can set that up?",
        required: true,
      },
    ],
    branches: [
      { when: "activities", op: "includes", is: "None of these", then: "barriers" },
      { when: "usefulness", op: "gte", is: 3, then: "most_valuable" },
      { when: "usefulness", op: "lte", is: 2, then: "not_useful" },
      { when: "most_valuable", always: true, then: "application" },
      { when: "plan_chat", is: true, then: "work_email" },
      { when: "plan_chat", is: false, then: "end_thanks" },
      { when: "work_email", always: true, then: "end_plan" },
    ],
    endings: [
      {
        ref: "end_plan",
        title: "Thanks, we'll be in touch 📅",
        body: "Someone from the people team will email you within two weeks to find a time.",
      },
    ],
    ending: {
      title: "Thank you for the honest feedback",
      body: "We'll share what we heard, and what we're changing, once everyone has answered.",
    },
    guide: {
      questionsToConsider: [
        "Is this survey anonymous, and if so, does asking for an email at the end change how honest people are?",
        "Which development activities do you actually offer? Trim the list so nobody is asked about something that doesn't exist.",
        "Will you compare answers by role level, and are your groups big enough that nobody can be identified?",
        "Who has the time to follow up with everyone who asks for a development conversation?",
      ],
      howToUseResponses:
        "Start with the agreement grid: if people say the content fits but they had no time to practise, more courses won't help, protected time will. Group the barriers by role level to see whether managers and individual contributors hit different walls. Use the ranking to shape next year's budget, and book every development conversation people asked for before you publish the results.",
      customizeSteps: [
        "Edit the activity list and the ranking items to match the programmes and budget you really have.",
        "Decide whether to keep the email question; remove it and its branch if you promise full anonymity.",
        "Send the link a few weeks before you plan next year's learning budget, so the answers can still change it.",
      ],
      faqs: [
        {
          q: "What should a professional development survey ask?",
          a: "What people took part in, whether it was useful, what stopped them applying it, and what they want next. Asking about barriers matters as much as asking about satisfaction.",
        },
        {
          q: "How often should we run a professional development feedback survey?",
          a: "Once or twice a year is enough, timed before budgets and learning plans are set so the answers can shape them.",
        },
        {
          q: "Should a professional development survey be anonymous?",
          a: "Usually yes for the ratings. This version only asks for an email from people who want a follow-up conversation, so everyone else can stay anonymous.",
        },
        {
          q: "Can I change the questions?",
          a: "Yes. Use this template copies it into your account, where you can edit every question and branch, then share it by link or embed it on your intranet.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "mobile-app-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["product-research", "marketing"],
    searchName: "Mobile app survey",
    title: "Mobile app survey",
    icon: "Smartphone",
    metaDescription:
      "Ask users what they open your app to do, how easy it is, what breaks and what they'd change. Problems get a follow-up, and keen users can join your beta list.",
    description: "Learn how people use your app, where it frustrates them and what would make it more useful.",
    blurb:
      "Starts with the one job people open the app for, then asks how easy that job is. Anyone who struggles is asked where they get stuck, and anyone who reports crashes or slowness describes the last time it happened, which is what your developers need. Users who want to test new features leave an email and get their own ending.",
    tags: ["mobile app survey", "app feedback", "in-app survey", "user research", "beta testers"],
    greeting: "Hi! A few quick questions about the app. Your answers go straight to the people who build it.",
    questions: [
      {
        ref: "platform",
        type: "single_select",
        title: "Which phone do you use the app on?",
        required: true,
        options: [{ label: "iPhone" }, { label: "Android" }, { label: "Both" }],
      },
      {
        ref: "frequency",
        type: "single_select",
        title: "How often do you open the app?",
        required: true,
        options: [
          { label: "Every day" },
          { label: "A few times a week" },
          { label: "About once a week" },
          { label: "Less often than that" },
        ],
      },
      {
        ref: "main_task",
        type: "short_text",
        title: "What's the main thing you open the app to do?",
        required: true,
        maxLength: 200,
      },
      {
        ref: "task_ease",
        type: "opinion_scale",
        title: "How easy is it to get that done?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Very hard",
        labelHigh: "Very easy",
      },
      {
        ref: "stuck_point",
        type: "long_text",
        title: "Where do you get stuck or slowed down?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "problems",
        type: "multi_select",
        title: "Have you run into any of these in the last month?",
        required: true,
        minSelections: 1,
        maxSelections: 7,
        options: [
          { label: "Crashes or freezes" },
          { label: "Slow loading" },
          { label: "Trouble logging in" },
          { label: "Notifications not arriving" },
          { label: "Heavy battery or data use" },
          { label: "Something not saving" },
          { label: "None of these" },
        ],
      },
      {
        ref: "problem_detail",
        type: "long_text",
        title: "Tell us about the last time that happened. What were you doing just before?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each of these?",
        required: true,
        rows: ["Finding your way around", "Speed", "How it looks", "Notifications"],
        columns: ["Poor", "Okay", "Good", "Great"],
      },
      {
        ref: "wish",
        type: "long_text",
        title: "What one change would make the app more useful to you?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend the app to a friend?",
        required: true,
      },
      {
        ref: "beta",
        type: "yes_no",
        title: "Would you like to try new features before everyone else?",
        required: true,
      },
      {
        ref: "beta_email",
        type: "email",
        title: "Great. Which email should we send beta invites to?",
        required: true,
      },
    ],
    branches: [
      { when: "task_ease", op: "gte", is: 4, then: "problems" },
      { when: "problems", op: "includes", is: "None of these", then: "aspects" },
      { when: "beta", is: false, then: "end_thanks" },
      { when: "beta", is: true, then: "beta_email" },
      { when: "beta_email", always: true, then: "end_beta" },
    ],
    endings: [
      {
        ref: "end_beta",
        title: "You're on the beta list 🚀",
        body: "We'll email you when there's something new to try. Thanks for helping us shape it.",
      },
    ],
    ending: {
      title: "Thanks for the feedback",
      body: "Every answer is read by the product team, and the problems you reported go into our bug queue.",
    },
    guide: {
      questionsToConsider: [
        "Will you show this inside the app, or send the link by email or push notification? In-app reaches active users, email reaches the ones who drifted away.",
        "Do you already know the app version and device from your analytics, or do you need to ask?",
        "Which problems in the checklist are ones you've seen in crash reports, and which are you guessing at?",
        "What will you give beta testers in return, and how many can your team actually support?",
      ],
      howToUseResponses:
        "Read the main tasks first and group them: the top few are what the app is really for, whatever the roadmap says. Compare ease scores across those groups to see which job is hardest. Pass every problem description to engineering with the platform attached, since a crash reported only on Android points somewhere very different from one on both. Invite the beta list before your next release.",
      customizeSteps: [
        "Rename the rows in the rating grid to the parts of your app people actually use, such as search, checkout or messages.",
        "Edit the problem list to match what shows up in your support tickets and crash reports.",
        "Share the link inside the app after someone completes a key task, or email it to users who haven't opened the app in a while.",
      ],
      faqs: [
        {
          q: "What questions should a mobile app survey ask?",
          a: "What people use the app for, how easy that is, what goes wrong, and what they'd change. A recommendation score gives you a number to track between releases.",
        },
        {
          q: "When is the best time to ask for app feedback?",
          a: "Right after someone finishes a task in the app, while it's fresh. Avoid interrupting them halfway through something.",
        },
        {
          q: "How do I get useful bug reports from users?",
          a: "Ask what they were doing just before the problem. This survey only asks that of people who reported a problem, so everyone else skips it.",
        },
        {
          q: "Can I embed this survey in my app?",
          a: "You can share it as a link, which opens in the phone's browser or an in-app web view, or embed it on a website.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "course-feedback-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["education"],
    searchName: "Course feedback survey",
    title: "Course feedback",
    icon: "BookOpen",
    metaDescription:
      "An end-of-course survey for students: content, teaching, workload and the support that would have helped. Low scores get a follow-up about what went wrong.",
    description: "Hear how students found the content, teaching and workload, and what would help them learn.",
    blurb:
      "Covers the things you can actually change before the next run: clarity, pace, materials, assessment and workload in hours rather than adjectives. Students who rate the course low are asked what made it hard, students who rate it well are asked what helped, and everyone says what support would have made the material easier to understand.",
    tags: ["course feedback survey", "student feedback", "course evaluation", "end of course survey", "teaching feedback"],
    greeting: "Thanks for taking the course. Your feedback shapes how it runs next time, and it takes about four minutes.",
    questions: [
      {
        ref: "course",
        type: "short_text",
        title: "Which course are you giving feedback on?",
        required: true,
        maxLength: 150,
      },
      {
        ref: "teaching",
        type: "matrix",
        title: "How much do you agree with each of these?",
        required: true,
        rows: [
          "Explanations were clear",
          "The pace was about right",
          "The materials helped me learn",
          "Assessments matched what was taught",
          "I could get help when I needed it",
        ],
        columns: ["Disagree", "Somewhat disagree", "Somewhat agree", "Agree"],
      },
      {
        ref: "workload",
        type: "single_select",
        title: "How was the workload compared with your other courses?",
        required: true,
        options: [
          { label: "Much lighter" },
          { label: "A bit lighter" },
          { label: "About the same" },
          { label: "A bit heavier" },
          { label: "Much heavier" },
        ],
      },
      {
        ref: "hours",
        type: "number",
        title: "Roughly how many hours a week did you spend on it outside class?",
        required: false,
        min: 0,
        max: 80,
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how would you rate the course?",
        required: true,
        scale: 5,
      },

      // Rated it well
      {
        ref: "best_part",
        type: "long_text",
        title: "What helped you learn the most?",
        description: "A lecture, an exercise, a resource, a way it was taught.",
        required: false,
        maxLength: 800,
      },

      // Rated it low
      {
        ref: "struggle",
        type: "long_text",
        title: "What made it hard to get value from the course?",
        required: true,
        maxLength: 1000,
      },

      // Everyone
      {
        ref: "confidence",
        type: "opinion_scale",
        title: "How confident are you that you could use what you learned?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Very confident",
      },
      {
        ref: "support",
        type: "multi_select",
        title: "What would have helped you understand the material better?",
        required: true,
        minSelections: 1,
        maxSelections: 7,
        options: [
          { label: "More worked examples" },
          { label: "Recordings of sessions" },
          { label: "More office hours" },
          { label: "Practice questions with answers" },
          { label: "Smaller group sessions" },
          { label: "Clearer assignment briefs" },
          { label: "Nothing, it worked for me" },
        ],
      },
      {
        ref: "one_change",
        type: "long_text",
        title: "If you could change one thing about the course, what would it be?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "recommend",
        type: "single_select",
        title: "Would you recommend this course to another student?",
        required: true,
        options: [{ label: "Yes" }, { label: "Maybe" }, { label: "No" }],
      },
    ],
    branches: [
      { when: "overall", op: "gte", is: 3, then: "best_part" },
      { when: "overall", op: "lte", is: 2, then: "struggle" },
      { when: "best_part", always: true, then: "confidence" },
    ],
    ending: {
      title: "Thank you 🎓",
      body: "Your answers go to the course team once grades are final, so nothing you said here can affect your marks.",
    },
    guide: {
      questionsToConsider: [
        "Will students trust that feedback can't affect their grade? Say when the teaching team will see it.",
        "Are you asking about one course, or one link for several? If several, make the course name a dropdown.",
        "Which of the agreement statements match promises you made in the course outline?",
        "Do you want the hours question to check a stated workload, like a set number of study hours a week?",
      ],
      howToUseResponses:
        "Look at the agreement grid row by row rather than the overall rating: a course can score well overall while 'assessments matched what was taught' sinks, which is the most fixable problem you have. Compare reported hours with the workload you intended. Read every answer to what made it hard, and pick the two or three changes students asked for most to announce at the start of the next run.",
      customizeSteps: [
        "Change the course question to a dropdown if you run several courses from one link.",
        "Edit the support options to match what you could realistically add, such as recordings or extra sessions.",
        "Send the link in the last week of the course, before exams take over, and give class time to fill it in if you can.",
      ],
      faqs: [
        {
          q: "What questions should a course feedback survey include?",
          a: "Clarity of teaching, pace, materials, how well assessments matched the content, workload, and what would have helped. One open question about the single biggest change is often the most useful.",
        },
        {
          q: "When should students fill in a course feedback survey?",
          a: "In the last week or two of the course, before exams. Running a short one halfway through lets you fix things for the same group.",
        },
        {
          q: "Should course feedback be anonymous?",
          a: "Yes, in most cases. This template asks no name or email, and students are more candid when they know grades are done before anyone reads it.",
        },
        {
          q: "Can I use this for online courses?",
          a: "Yes. Edit the support options to fit, for example swapping office hours for a discussion forum, and share the link in your course platform.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "sponsorship-satisfaction-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "run-events"],
    roles: ["marketing", "sales", "operations"],
    searchName: "Sponsorship satisfaction survey",
    title: "Sponsorship satisfaction",
    icon: "Handshake",
    metaDescription:
      "Ask sponsors what they got from your event or programme: delivery of each benefit, audience fit, communication, and whether they would sign on again next time.",
    description: "Review the value sponsors received, and find out who is ready to renew.",
    blurb:
      "Asks sponsors to score each benefit you promised, from logo placement to attendee data, so you see what was delivered rather than a vague satisfaction score. Sponsors who got what they came for describe the highlight, the rest explain what fell short, and anyone ready to sponsor again lands on an ending that tells them you'll reach out first.",
    tags: ["sponsorship survey", "sponsor feedback", "event sponsor", "sponsor renewal", "partnership feedback"],
    greeting: "Thank you for sponsoring. We'd like to know what worked for you and what we should do better next time.",
    questions: [
      {
        ref: "company",
        type: "short_text",
        title: "Which company are you answering for?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "tier",
        type: "single_select",
        title: "Which sponsorship level did you have?",
        required: true,
        options: [
          { label: "Headline or title sponsor" },
          { label: "Main tier" },
          { label: "Supporting tier" },
          { label: "In-kind or media partner" },
        ],
      },
      {
        ref: "goals",
        type: "multi_select",
        title: "What were you hoping to get out of it?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Brand awareness" },
          { label: "Leads for sales" },
          { label: "Hiring" },
          { label: "Product demos or launches" },
          { label: "Supporting the community" },
          { label: "Meeting partners" },
        ],
      },
      {
        ref: "delivery",
        type: "matrix",
        title: "How did we deliver on each part of your package?",
        required: true,
        rows: [
          "Logo and brand placement",
          "Booth or on-site presence",
          "Speaking or stage time",
          "Mentions in emails and social posts",
          "Attendee or lead information",
        ],
        columns: ["Not included", "Below what was promised", "As promised", "Better than promised"],
      },
      {
        ref: "audience_fit",
        type: "opinion_scale",
        title: "How well did the audience match the people you wanted to reach?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Poor match",
        labelHigh: "Spot on",
      },
      {
        ref: "communication",
        type: "rating",
        title: "How was communication with our team before and during the event?",
        required: true,
        scale: 5,
      },
      {
        ref: "goals_met",
        type: "single_select",
        title: "Did you get what you came for?",
        required: true,
        options: [{ label: "Yes" }, { label: "Partly" }, { label: "No" }],
      },

      // Got it
      {
        ref: "highlight",
        type: "long_text",
        title: "What was the most valuable part for your team?",
        required: false,
        maxLength: 800,
      },

      // Partly or not
      {
        ref: "shortfall",
        type: "long_text",
        title: "What fell short of what you expected?",
        required: true,
        maxLength: 1000,
      },

      // Everyone
      {
        ref: "improve",
        type: "long_text",
        title: "What would make a future partnership more valuable to you?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "renew",
        type: "single_select",
        title: "Would you sponsor again next time?",
        required: true,
        options: [
          { label: "Yes, very likely" },
          { label: "Maybe, depending on changes" },
          { label: "Unlikely" },
        ],
      },
      {
        ref: "renew_blocker",
        type: "long_text",
        title: "What would need to change for it to be an easy yes?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "goals_met", is: "Yes", then: "highlight" },
      { when: "goals_met", is: "Partly", then: "shortfall" },
      { when: "goals_met", is: "No", then: "shortfall" },
      { when: "highlight", always: true, then: "improve" },
      { when: "renew", is: "Yes, very likely", then: "end_renew" },
    ],
    endings: [
      {
        ref: "end_renew",
        title: "Glad to hear it 🤝",
        body: "We'll contact you before sponsorship opens to anyone else, with next year's options.",
      },
    ],
    ending: {
      title: "Thank you for the candid feedback",
      body: "Our partnerships lead will read this and follow up with you personally.",
    },
    guide: {
      questionsToConsider: [
        "Do the rows in the delivery grid match the benefits you actually sold in each package?",
        "Who fills this in: the person who signed the contract, or the team who staffed the booth? They see different things.",
        "How soon after the event will you send it, before or after sponsors have measured their leads?",
        "Who follows up with sponsors who said maybe, and what can they offer?",
      ],
      howToUseResponses:
        "Read the delivery grid first: anything marked below what was promised needs an apology and a fix before you ask that sponsor to renew. Compare audience fit by tier to see whether headline sponsors and smaller ones wanted different people. Call every sponsor who answered 'Yes, very likely' within a week while the goodwill is fresh, and treat each 'maybe' answer as the start of a renewal conversation.",
      customizeSteps: [
        "Rename the tiers and the delivery grid rows to match your own sponsorship packages.",
        "Edit the renewal ending so it says what you'll really do next, such as sending a proposal by a date.",
        "Email the link to your sponsor contacts within a week of the event, one link per company or with the company prefilled.",
      ],
      faqs: [
        {
          q: "What should a sponsor feedback survey ask?",
          a: "What the sponsor wanted, whether each promised benefit was delivered, how well the audience fit, how communication went, and whether they would come back.",
        },
        {
          q: "When should I send a sponsorship satisfaction survey?",
          a: "Within a week or two of the event. Late enough that sponsors have looked at their leads, early enough that they still remember the details.",
        },
        {
          q: "How do I use sponsor feedback to get renewals?",
          a: "Fix what they said fell short and tell them you did. This survey sends sponsors who are ready to renew to their own ending, so you know who to call first.",
        },
        {
          q: "Can I use this for programmes, not just events?",
          a: "Yes. Edit the delivery rows to cover what a programme sponsor receives, such as content placements or report mentions.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "volunteer-feedback-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "run-events"],
    roles: ["operations", "hr-people"],
    searchName: "Volunteer feedback survey",
    title: "Volunteer feedback",
    icon: "HandHeart",
    metaDescription:
      "Ask volunteers how prepared, supported and valued they felt, what made the day hard, and what would bring them back. Bad experiences get a coordinator follow-up.",
    description: "Find out how volunteers experienced the day and what would make them come back.",
    blurb:
      "Checks the basics that decide whether a volunteer returns: did they know their role, have what they needed, know who to ask and feel their time was valued. Someone who had a rough day is asked what went wrong and whether the coordinator can get in touch, and only people who say yes leave their details, so everyone else stays anonymous. Everyone says what would make it easier to help again.",
    tags: ["volunteer feedback survey", "volunteer survey", "nonprofit", "volunteer retention", "event volunteers"],
    greeting: "Thank you for giving your time. Could you tell us how it went? It takes about three minutes.",
    questions: [
      {
        ref: "activity",
        type: "short_text",
        title: "Which activity or event did you volunteer at?",
        required: true,
        maxLength: 150,
      },
      {
        ref: "first_time",
        type: "yes_no",
        title: "Was this your first time volunteering with us?",
        required: true,
      },
      {
        ref: "preparation",
        type: "matrix",
        title: "Before and during your shift, was this true for you?",
        required: true,
        rows: [
          "I knew what my role involved before I arrived",
          "The briefing prepared me for the day",
          "I knew who to ask for help",
          "I had the equipment or supplies I needed",
        ],
        columns: ["No", "Partly", "Yes"],
      },
      {
        ref: "shift_length",
        type: "single_select",
        title: "How did the length of your shift feel?",
        required: true,
        options: [{ label: "Too short" }, { label: "About right" }, { label: "Too long" }],
      },
      {
        ref: "valued",
        type: "opinion_scale",
        title: "How valued did you feel as a volunteer?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Very valued",
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how was the experience?",
        required: true,
        scale: 5,
        shape: "heart",
      },

      // Good day
      {
        ref: "highlight",
        type: "long_text",
        title: "What was the best part?",
        required: false,
        maxLength: 800,
      },

      // Rough day
      {
        ref: "what_wrong",
        type: "long_text",
        title: "Sorry it wasn't a good day. What went wrong?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "coordinator_call",
        type: "yes_no",
        title: "Would you like our volunteer coordinator to get in touch about it?",
        required: true,
      },
      {
        ref: "coordinator_contact",
        type: "contact_info",
        title: "Who should the coordinator contact, and how?",
        required: true,
        fields: ["first_name", "email", "phone"],
      },

      // Everyone
      {
        ref: "again",
        type: "single_select",
        title: "Would you volunteer with us again?",
        required: true,
        options: [{ label: "Yes, definitely" }, { label: "Maybe" }, { label: "Probably not" }],
      },
      {
        ref: "easier",
        type: "multi_select",
        title: "What would make it easier to volunteer again?",
        required: false,
        minSelections: 0,
        maxSelections: 7,
        options: [
          { label: "More notice of dates" },
          { label: "Shorter shifts" },
          { label: "Flexible or remote roles" },
          { label: "A better briefing" },
          { label: "Volunteering with a friend" },
          { label: "Help with travel costs" },
          { label: "Nothing, it's easy already" },
        ],
      },
      {
        ref: "suggestions",
        type: "long_text",
        title: "Anything else we should know or change?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "overall", op: "gte", is: 3, then: "highlight" },
      { when: "overall", op: "lte", is: 2, then: "what_wrong" },
      { when: "highlight", always: true, then: "again" },
      { when: "coordinator_call", is: false, then: "again" },
    ],
    ending: {
      title: "Thank you for all you did 💛",
      body: "We read every response, and we'll use yours to make the next shift better for everyone.",
    },
    guide: {
      questionsToConsider: [
        "Who is the coordinator that follows up with unhappy volunteers, and can they reply within a few days?",
        "Is a heart rating right for your organisation, or would stars or numbers fit better?",
        "Which items in the 'easier to volunteer' list could you actually offer, such as travel help?",
        "Should first-time volunteers get extra questions about how they were welcomed?",
      ],
      howToUseResponses:
        "Look at the preparation grid split by first-timers and regulars: new volunteers who didn't know who to ask for help is a briefing problem you can fix before the next event. Anyone who asked for the coordinator to get in touch should hear back within a few days. Use the 'easier to volunteer' answers to plan the next rota, and count the 'probably not' answers against the reasons people gave.",
      customizeSteps: [
        "Edit the preparation rows to match how you brief volunteers, such as an online induction or a morning huddle.",
        "Put your coordinator's name in the follow-up question so volunteers know who will get in touch.",
        "Send the link the same evening or the next day, while the shift is fresh, and thank people before you ask.",
      ],
      faqs: [
        {
          q: "What should I ask in a volunteer feedback survey?",
          a: "Whether volunteers understood their role, felt prepared and supported, felt valued, and would come back. Ask what would make it easier, since small changes like more notice often decide who returns.",
        },
        {
          q: "When should I send a volunteer survey?",
          a: "Within a day of the shift or event. For long-term volunteers, a short survey every few months works better than one a year.",
        },
        {
          q: "How can volunteer feedback improve retention?",
          a: "It shows where people drop off, such as a confusing first shift or unclear contacts. Fixing those and telling volunteers you did is one of the best reasons to come back.",
        },
        {
          q: "Can I edit this survey for a single event?",
          a: "Yes. Use this template copies it into your account, where you can change every question, then share the link by email or message.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "brand-awareness-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["marketing", "product-research"],
    searchName: "Brand awareness survey",
    title: "Brand awareness survey",
    icon: "Megaphone",
    metaDescription:
      "Measure unaided recall before naming your brand, then recognition, where people saw you and what they think. People who don't know you skip straight past it.",
    description: "Find out who remembers your brand unprompted, who recognises it, and where they came across it.",
    blurb:
      "Asks the unprompted question first, before your brand name appears anywhere, so recall is real. Only people who recognise the brand are asked where they saw it, whether they've bought it and how it comes across, while everyone else skips ahead to what drives their choices. Written for a coffee brand as an example, so swap in your own category and names.",
    tags: ["brand awareness survey", "brand recall", "brand recognition", "market research", "marketing survey"],
    greeting: "Hi! We're asking people about the brands they buy. There are no right answers, and it takes about three minutes.",
    questions: [
      {
        ref: "buy_frequency",
        type: "single_select",
        title: "How often do you buy coffee to make at home?",
        required: true,
        options: [
          { label: "Every week or more" },
          { label: "About once a month" },
          { label: "A few times a year" },
          { label: "Never" },
        ],
      },
      {
        ref: "unaided",
        type: "long_text",
        title: "When you think of coffee to make at home, which brands come to mind? List as many as you like.",
        required: true,
        maxLength: 500,
      },
      {
        ref: "aided",
        type: "multi_select",
        title: "Which of these brands have you heard of?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Nescafé" },
          { label: "Lavazza" },
          { label: "Brightside Coffee" },
          { label: "Starbucks" },
          { label: "Illy" },
          { label: "None of these" },
        ],
      },

      // Knows the brand
      {
        ref: "where_seen",
        type: "multi_select",
        title: "Where have you come across Brightside Coffee?",
        required: true,
        minSelections: 1,
        maxSelections: 7,
        options: [
          { label: "On a supermarket shelf" },
          { label: "Social media" },
          { label: "An online ad" },
          { label: "A friend or family member" },
          { label: "In a café" },
          { label: "News or a review" },
          { label: "I can't remember" },
        ],
      },
      {
        ref: "bought",
        type: "single_select",
        title: "Have you ever bought it?",
        required: true,
        options: [{ label: "Yes, regularly" }, { label: "Once or twice" }, { label: "No" }],
      },
      {
        ref: "impression",
        type: "opinion_scale",
        title: "What's your overall impression of Brightside Coffee?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Very negative",
        labelHigh: "Very positive",
      },
      {
        ref: "three_words",
        type: "short_text",
        title: "Which three words would you use to describe it?",
        required: false,
        maxLength: 120,
      },

      // Everyone
      {
        ref: "choice_factors",
        type: "ranking",
        title: "Rank what matters most when you choose a coffee.",
        required: true,
        items: ["Taste", "Price", "Ethical sourcing", "A brand I trust", "Easy to find in shops"],
      },
      {
        ref: "discovery",
        type: "multi_select",
        title: "Where do you usually find out about new food and drink brands?",
        required: true,
        minSelections: 1,
        maxSelections: 7,
        options: [
          { label: "In the shop" },
          { label: "Social media" },
          { label: "Friends and family" },
          { label: "Online ads" },
          { label: "Food blogs or reviews" },
          { label: "TV or radio" },
          { label: "Newsletters" },
        ],
      },
      {
        ref: "age_band",
        type: "dropdown",
        title: "Which age group are you in?",
        required: false,
        options: [
          { label: "Under 18" },
          { label: "18–24" },
          { label: "25–34" },
          { label: "35–44" },
          { label: "45–54" },
          { label: "55–64" },
          { label: "65 or over" },
          { label: "Prefer not to say" },
        ],
      },
    ],
    branches: [
      { when: "buy_frequency", is: "Never", then: "end_screen" },
      { when: "aided", op: "not_contains", is: "Brightside Coffee", then: "choice_factors" },
    ],
    endings: [
      {
        ref: "end_screen",
        title: "Thanks for stopping by",
        body: "This survey is for people who buy coffee to make at home, so that's all we need from you.",
      },
    ],
    ending: {
      title: "Thank you ☕",
      body: "That's everything. Your answers help us understand how people find and choose coffee.",
    },
    guide: {
      questionsToConsider: [
        "Who is your audience? Screen out people outside the category so they don't dilute your numbers.",
        "Which competitors belong in the recognition list? Pick the brands your buyers actually compare you with.",
        "Is this a one-off, or a baseline you'll repeat after a campaign to measure the change?",
        "Where will you find respondents who haven't already heard of you? Your own email list will overstate awareness.",
      ],
      howToUseResponses:
        "Count how many people named your brand in the unprompted answer; that is your unaided recall, and it matters more than recognition. Compare it with the share who picked it from the list. Among people who know you, the 'where did you see us' answers show which channels are doing the work, and the three-word answers show whether people describe you the way you hoped. Rerun the same survey after a campaign and compare.",
      customizeSteps: [
        "Replace coffee with your own category and Brightside Coffee with your brand name in every question where it appears.",
        "Swap the competitor names in the recognition list for the brands your customers really choose between.",
        "Share the link with an audience beyond your own customers, such as a research panel or social ads, so the results aren't skewed.",
      ],
      faqs: [
        {
          q: "What is the difference between unaided and aided brand awareness?",
          a: "Unaided awareness is when someone names your brand without being prompted. Aided awareness is when they recognise it from a list. Ask the unaided question first, or the list gives the answer away.",
        },
        {
          q: "What questions should a brand awareness survey include?",
          a: "An unprompted recall question, a recognition list, where people encountered the brand, whether they've bought it, and their impression. A screening question keeps out people outside your category.",
        },
        {
          q: "How often should I run a brand awareness survey?",
          a: "Before and after a major campaign, or at a regular interval such as twice a year. Keep the questions identical so results can be compared.",
        },
        {
          q: "Why does this survey skip questions for some people?",
          a: "Anyone who doesn't recognise your brand can't say where they saw it, so they skip straight to the questions about how they choose.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "management-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["hr-people", "operations"],
    searchName: "Management survey",
    title: "Management survey",
    icon: "Briefcase",
    metaDescription:
      "Ask teams how work is managed: clear priorities, how decisions are made and shared, manager support and what slows them down. Anonymous and quick to answer.",
    description: "Hear how priorities, decisions, communication and support feel from inside the team.",
    blurb:
      "Separates the parts of management people usually lump together: whether priorities are clear and stable, who actually makes decisions, whether work is shared fairly and how much their own manager helps. People who rate their manager's support low pick what's missing, and people who rate it high name the habit worth spreading. It closes by asking how confident they are that anything will change.",
    tags: ["management survey", "manager feedback", "team survey", "leadership feedback", "employee survey"],
    greeting: "This survey is anonymous. We want to know how work is managed here, honestly, so we can fix what isn't working.",
    questions: [
      {
        ref: "department",
        type: "dropdown",
        title: "Which area do you work in?",
        description: "Only used to group answers. Groups with fewer than five people won't be reported separately.",
        required: true,
        options: [
          { label: "Operations" },
          { label: "Sales" },
          { label: "Marketing" },
          { label: "Product and engineering" },
          { label: "Customer support" },
          { label: "Finance and admin" },
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
          { label: "1–3 years" },
          { label: "3–5 years" },
          { label: "More than 5 years" },
        ],
      },
      {
        ref: "how_managed",
        type: "matrix",
        title: "How much do you agree with each of these?",
        required: true,
        rows: [
          "I know what my team's top priorities are",
          "Priorities stay steady long enough to finish work",
          "Decisions are explained, not just announced",
          "I have a say in decisions that affect my work",
          "Work is shared fairly across the team",
        ],
        columns: ["Strongly disagree", "Disagree", "Agree", "Strongly agree"],
      },
      {
        ref: "manager_support",
        type: "rating",
        title: "How well does your direct manager help you do your job?",
        required: true,
        scale: 5,
      },

      // Low support
      {
        ref: "support_missing",
        type: "multi_select",
        title: "What's missing? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Regular one-to-ones" },
          { label: "Clear, useful feedback" },
          { label: "Help removing blockers" },
          { label: "Recognition for good work" },
          { label: "Backing in difficult situations" },
          { label: "Room to decide how I work" },
        ],
      },

      // Good support
      {
        ref: "manager_best",
        type: "long_text",
        title: "What does your manager do that helps your team deliver, and that other teams should copy?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "decision_style",
        type: "single_select",
        title: "How are decisions about your team's work usually made?",
        required: true,
        options: [
          { label: "My manager decides without asking us" },
          { label: "My manager decides after hearing the team" },
          { label: "The team decides together" },
          { label: "Someone higher up decides and it's passed down" },
          { label: "It's often unclear who decides" },
        ],
      },
      {
        ref: "slowdowns",
        type: "ranking",
        title: "Rank what slows your team down, from most to least.",
        required: true,
        items: [
          "Unclear or shifting priorities",
          "Too many meetings",
          "Slow approvals",
          "Not enough people",
          "Tools and systems",
        ],
      },
      {
        ref: "one_change",
        type: "long_text",
        title: "If you could change one thing about how work is managed here, what would it be?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "change_confidence",
        type: "opinion_scale",
        title: "How confident are you that this survey will lead to real changes?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Very confident",
      },
    ],
    branches: [
      { when: "manager_support", op: "lte", is: 2, then: "support_missing" },
      { when: "manager_support", op: "gte", is: 3, then: "manager_best" },
      { when: "support_missing", always: true, then: "decision_style" },
    ],
    ending: {
      title: "Thank you for being straight with us",
      body: "We'll share the overall results and what we plan to change within a month of the survey closing.",
    },
    guide: {
      questionsToConsider: [
        "Is it truly anonymous? With small teams, the area and tenure questions together can identify someone, so merge groups if needed.",
        "Who sees the results: senior leaders only, or each manager for their own team?",
        "Which of the agreement statements do you most need an answer to right now?",
        "What will you commit to sharing back, and by when?",
      ],
      howToUseResponses:
        "Compare the agreement grid across areas: if one team knows its priorities and another doesn't, look at how those managers run planning rather than rewriting company goals. Count the 'what's missing' picks to choose one manager habit to fix first, often regular one-to-ones. Share the headline results and one or two concrete changes within a month, then rerun the survey and watch the final confidence question move.",
      customizeSteps: [
        "Edit the area list to match your organisation, and merge small teams so nobody can be singled out.",
        "Change the ranking items to the slowdowns you hear about most in retrospectives or one-to-ones.",
        "Share the link with a clear closing date and a promise of when results will be shared, then keep that promise.",
      ],
      faqs: [
        {
          q: "What should a management survey ask employees?",
          a: "Whether priorities are clear, how decisions are made and communicated, how much their manager supports them, and what slows them down. End with an open question about the one change they'd make.",
        },
        {
          q: "How do you keep a management survey anonymous?",
          a: "Don't ask for names, keep demographic questions broad, and only report groups big enough that no one can be identified. This template asks for area and tenure only.",
        },
        {
          q: "How often should we run a management survey?",
          a: "Once or twice a year is typical. Running it again after you've made changes shows whether they worked.",
        },
        {
          q: "Can managers see their own team's results?",
          a: "That's up to you. Every response lands in your dashboard and can be exported to CSV, so you can decide how to group and share it.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "post-training-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["hr-people", "education"],
    searchName: "Post-training survey",
    title: "Post-training survey",
    icon: "ClipboardCheck",
    metaDescription:
      "After a training session, ask what people understood, how their confidence changed, what they'll try first and what could get in the way of using it at work.",
    description: "Find out what learners can actually use after training, and what might stop them.",
    blurb:
      "Goes past 'did you enjoy it' to whether the training will change anything: a before-and-after confidence check, the first thing each person plans to try, and the obstacles they expect. Anyone who says little of it applies to their job explains why, and people who want a check-in a month later leave an email and get their own ending.",
    tags: ["post-training survey", "training evaluation", "training feedback", "learning transfer", "workshop feedback"],
    greeting: "Thanks for joining the training. A few questions about what you'll take back to work, about three minutes.",
    questions: [
      {
        ref: "training",
        type: "short_text",
        title: "Which training did you attend?",
        required: true,
        maxLength: 150,
      },
      {
        ref: "format",
        type: "single_select",
        title: "How did you take it?",
        required: true,
        options: [{ label: "In person" }, { label: "Live online" }, { label: "Self-paced online" }],
      },
      {
        ref: "understanding",
        type: "opinion_scale",
        title: "How well do you understand the material now?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Still lost",
        labelHigh: "Very clear",
      },
      {
        ref: "confidence_before",
        type: "opinion_scale",
        title: "Before the training, how confident were you doing this in your job?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Completely",
      },
      {
        ref: "confidence_after",
        type: "opinion_scale",
        title: "And how confident are you now?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Completely",
      },
      {
        ref: "relevance",
        type: "single_select",
        title: "How much of it applies to the work you actually do?",
        required: true,
        options: [{ label: "Almost all of it" }, { label: "Some of it" }, { label: "Very little" }],
      },
      {
        ref: "relevance_gap",
        type: "long_text",
        title: "What would have made it relevant to your role?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "first_use",
        type: "long_text",
        title: "What's the first thing you'll try at work in the next two weeks?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "obstacles",
        type: "multi_select",
        title: "What might get in the way of using it?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "No time to practise" },
          { label: "My manager isn't on board" },
          { label: "Our tools or process don't allow it" },
          { label: "I need more practice first" },
          { label: "I'll forget the details" },
          { label: "Nothing I can think of" },
        ],
      },
      {
        ref: "support",
        type: "multi_select",
        title: "Which of these would help you apply it?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "A one-page reference sheet" },
          { label: "A short follow-up session" },
          { label: "Practice with a colleague" },
          { label: "Time with the trainer" },
          { label: "Examples from our own work" },
        ],
      },
      {
        ref: "trainer",
        type: "rating",
        title: "How would you rate the trainer?",
        required: true,
        scale: 5,
      },
      {
        ref: "checkin",
        type: "yes_no",
        title: "Would you like a quick check-in in a month to see how it's going?",
        required: true,
      },
      {
        ref: "checkin_email",
        type: "email",
        title: "Which email should we use for that?",
        required: true,
      },
    ],
    branches: [
      { when: "relevance", is: "Almost all of it", then: "first_use" },
      { when: "relevance", is: "Some of it", then: "first_use" },
      { when: "checkin", is: false, then: "end_thanks" },
      { when: "checkin", is: true, then: "checkin_email" },
      { when: "checkin_email", always: true, then: "end_checkin" },
    ],
    endings: [
      {
        ref: "end_checkin",
        title: "We'll check in next month 📬",
        body: "Expect a short email in about four weeks asking how the first try went.",
      },
    ],
    ending: {
      title: "Thank you, and good luck trying it out",
      body: "Your answers go to the training team to shape the next session.",
    },
    guide: {
      questionsToConsider: [
        "Will you send this straight after the session, or a day later once people have had time to think?",
        "Do you want the before-and-after confidence question, or do you already measure skills another way?",
        "Who will actually run the one-month check-ins, and how many can they handle?",
        "Should managers see what their team members plan to try first, so they can support it?",
      ],
      howToUseResponses:
        "Subtract the before score from the after score for each person: a small shift with high understanding usually means people know the theory but haven't practised. Read the 'first thing I'll try' answers to see whether the training landed on the behaviour you wanted. Count the obstacles, because a room full of 'my manager isn't on board' needs a manager briefing rather than a better course. Follow up with everyone who asked for a check-in.",
      customizeSteps: [
        "Change the training question to a dropdown if you use one link across several sessions.",
        "Edit the support options to the follow-ups you can really offer, such as a reference sheet or drop-in session.",
        "Share the link in the last five minutes of the session and give people time to answer before they leave.",
      ],
      faqs: [
        {
          q: "What questions should I ask after a training session?",
          a: "Ask what people understood, how confident they feel now compared with before, how relevant it was, what they'll try first and what could stop them. That tells you far more than a satisfaction score.",
        },
        {
          q: "When should a post-training survey be sent?",
          a: "Straight after the session, while it's fresh. A second short survey a month later shows whether people actually used what they learned.",
        },
        {
          q: "How is this different from a training evaluation form?",
          a: "A general evaluation rates the session. This survey focuses on transfer: whether learners can use the material at work and what support they need.",
        },
        {
          q: "Can I use this for online courses?",
          a: "Yes. The format question already covers live online and self-paced learning, and you can share the link at the end of any course.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "exit-interview",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["hr-people"],
    searchName: "Exit interview survey",
    title: "Exit interview",
    icon: "LogOut",
    metaDescription:
      "Ask departing employees why they're leaving in a way they can answer honestly. The follow-up matches their main reason, from pay and growth to their manager.",
    description: "Ask why someone is leaving in a way they can answer honestly.",
    blurb:
      "Leaving is when people say what they meant. Structured enough to count across a year of departures, open enough to catch what no option covers, and the follow-up matches the reason, so someone leaving over their manager is not asked about salary bands. It ends with whether they'd come back, which is worth knowing.",
    tags: ["exit interview", "exit survey", "employee offboarding", "retention", "people ops"],
    greeting: "Before you go: your honest answers help the people who are staying. This is confidential.",
    questions: [
      {
        ref: "tenure",
        type: "single_select",
        title: "How long have you worked here?",
        required: true,
        options: [
          { label: "Less than a year" },
          { label: "1–2 years" },
          { label: "3–5 years" },
          { label: "More than 5 years" },
        ],
      },
      {
        ref: "ratings",
        type: "matrix",
        title: "How would you rate each of these?",
        required: true,
        rows: [
          "Your manager",
          "Your team",
          "Pay and benefits",
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
          { label: "Pay and benefits" },
          { label: "Career growth" },
          { label: "Manager or team" },
          { label: "Work-life balance" },
          { label: "Company direction" },
          { label: "Personal reasons" },
        ],
      },

      // Pay
      {
        ref: "comp_gap",
        type: "single_select",
        title: "Roughly how far below what you expected, or were offered elsewhere, was your pay?",
        required: false,
        options: [
          { label: "Under 10%" },
          { label: "10–25%" },
          { label: "More than 25%" },
          { label: "Not the number itself, the way it was decided" },
        ],
      },

      // Growth
      {
        ref: "growth_missing",
        type: "long_text",
        title: "What did you want to be doing that you weren't?",
        required: false,
        maxLength: 800,
      },

      // Manager or team
      {
        ref: "manager_detail",
        type: "long_text",
        title: "What would have made the difference?",
        description: "Goes to HR only, and is never shown to your manager with your name on it.",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "raised_it",
        type: "yes_no",
        title: "Did you raise it with anyone at the time?",
        required: false,
      },

      // Work-life balance
      {
        ref: "balance_detail",
        type: "single_select",
        title: "What tipped it?",
        required: false,
        options: [
          { label: "Long hours" },
          { label: "Always-on expectations" },
          { label: "Travel or commute" },
          { label: "Not enough flexibility" },
        ],
      },

      // Direction
      {
        ref: "direction_detail",
        type: "long_text",
        title: "What about the direction didn't sit right with you?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "could_have_stayed",
        type: "yes_no",
        title: "Was there anything we could have done that would have kept you?",
        required: true,
      },
      {
        ref: "what_would_keep",
        type: "long_text",
        title: "What would it have been?",
        required: true,
        maxLength: 800,
      },
      { ref: "what_worked", type: "long_text", title: "What worked well here?", required: false, maxLength: 1000 },
      {
        ref: "what_to_change",
        type: "long_text",
        title: "What should we change for the people still here?",
        required: false,
        maxLength: 1200,
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend us as a place to work?",
        required: false,
      },
      {
        ref: "boomerang",
        type: "yes_no",
        title: "Would you consider working here again one day?",
        required: false,
      },
    ],
    branches: [
      { when: "primary_reason", is: "Pay and benefits", then: "comp_gap" },
      { when: "primary_reason", is: "Career growth", then: "growth_missing" },
      { when: "primary_reason", is: "Manager or team", then: "manager_detail" },
      { when: "primary_reason", is: "Work-life balance", then: "balance_detail" },
      { when: "primary_reason", is: "Company direction", then: "direction_detail" },
      { when: "primary_reason", is: "Personal reasons", then: "could_have_stayed" },
      { when: "comp_gap", always: true, then: "could_have_stayed" },
      { when: "growth_missing", always: true, then: "could_have_stayed" },
      { when: "raised_it", always: true, then: "could_have_stayed" },
      { when: "balance_detail", always: true, then: "could_have_stayed" },
      { when: "could_have_stayed", is: true, then: "what_would_keep" },
      { when: "could_have_stayed", is: false, then: "what_worked" },
    ],
    ending: { title: "Thank you, genuinely 🙏", body: "All the best for what's next." },
    guide: {
      questionsToConsider: [
        "Who reads the answers, and can you promise that managers never see them with a name attached?",
        "Will you send it before the last day, or a week after, when people may speak more freely?",
        "Do the reasons for leaving match the categories you already track in your HR records?",
        "Is someone ready to act on a pattern, for example a manager named in several exits?",
      ],
      howToUseResponses:
        "Count main reasons by quarter and by team: one resignation over a manager is a story, three from the same team is a pattern to act on. Compare the rating grid of people who left with your engagement survey to see which scores predicted departures. Read every answer to 'what would have kept you', since those are the fixes with evidence behind them, and keep a list of people open to coming back.",
      customizeSteps: [
        "Edit the reasons for leaving so they match the categories you report on, and keep one follow-up per reason.",
        "Rewrite the greeting to say exactly who will read the answers, because that promise decides how honest people are.",
        "Send the link in the final week or shortly after the last day, and make it clear that answering is optional.",
      ],
      faqs: [
        {
          q: "What questions should an exit interview ask?",
          a: "Why the person is leaving, how they'd rate their manager, team, pay and growth, whether anything could have kept them, and what should change. A follow-up that matches their reason gets more detail than a generic list.",
        },
        {
          q: "Is an exit survey better than a face-to-face exit interview?",
          a: "Many people are more candid in writing, especially about their manager. Some teams use both: the survey first, then a conversation for anyone who wants one.",
        },
        {
          q: "Should exit interview answers be confidential?",
          a: "Yes. Tell people who will read the answers and that managers won't see comments with names attached, then keep that promise.",
        },
        {
          q: "Can I change the reasons for leaving?",
          a: "Yes. Use this template copies it into your account, where you can edit each reason and its follow-up question.",
        },
      ],
    },
  }),
];
