import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_SCHOOL: TemplateSeed[] = [
  defineTemplate({
    slug: "student-demographics-survey",
    type: "survey",
    category: "school",
    goals: ["conduct-research"],
    roles: ["education"],
    searchName: "Student demographics survey",
    title: "Student demographics",
    icon: "PieChart",
    metaDescription:
      "Learn the make-up of your student group: study mode, age, first-generation status, work and caring duties, with every personal question optional and easy to skip.",
    description: "Background questions that help you plan support, each one optional and easy to skip.",
    blurb:
      "Sticks to background that changes how you plan: how people study, whether they work or care for someone, and whether they are first in their family to study at this level. Every sensitive question is optional with a prefer-not-to-say answer, and anyone who would like a word with student support can ask for one at the end.",
    tags: ["student demographics survey", "student background survey", "education research", "student profile", "enrolment data"],
    greeting: "Welcome! A few quick questions about you help us plan support that fits. Everything personal is optional.",
    questions: [
      {
        ref: "purpose",
        type: "statement",
        title: "Why we're asking",
        description:
          "We use these answers to understand our student group as a whole and to plan support, timetables and resources. Results are reported in groups, never by name. Edit this to say who will see the answers.",
        required: false,
      },
      {
        ref: "programme",
        type: "short_text",
        title: "Which course or programme are you on?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "year",
        type: "dropdown",
        title: "Which year of study are you in?",
        required: true,
        options: [
          { label: "First year" },
          { label: "Second year" },
          { label: "Third year" },
          { label: "Fourth year or later" },
          { label: "Postgraduate" },
          { label: "Other" },
        ],
      },
      {
        ref: "study_mode",
        type: "single_select",
        title: "How are you studying?",
        required: true,
        options: [
          { label: "Full-time, in person" },
          { label: "Part-time, in person" },
          { label: "Mostly online" },
          { label: "A mix of online and in person" },
        ],
      },
      {
        ref: "age_range",
        type: "single_select",
        title: "Which age range are you in?",
        required: false,
        options: [
          { label: "Under 18" },
          { label: "18–20" },
          { label: "21–24" },
          { label: "25–34" },
          { label: "35 or over" },
          { label: "Prefer not to say" },
        ],
      },
      {
        ref: "gender",
        type: "single_select",
        title: "How do you describe your gender?",
        required: false,
        allowOther: true,
        options: [{ label: "Woman" }, { label: "Man" }, { label: "Non-binary" }, { label: "Prefer not to say" }],
      },
      {
        ref: "first_generation",
        type: "single_select",
        title: "Are you the first in your immediate family to study at this level?",
        required: false,
        options: [{ label: "Yes" }, { label: "No" }, { label: "Not sure" }, { label: "Prefer not to say" }],
      },
      {
        ref: "first_language",
        type: "yes_no",
        title: "Is the language you're taught in your first language?",
        required: false,
      },
      {
        ref: "work_hours",
        type: "single_select",
        title: "Do you work alongside your studies?",
        required: false,
        options: [
          { label: "No" },
          { label: "Yes, under 10 hours a week" },
          { label: "Yes, 10–20 hours a week" },
          { label: "Yes, more than 20 hours a week" },
          { label: "Prefer not to say" },
        ],
      },
      {
        ref: "responsibilities",
        type: "multi_select",
        title: "Do any of these apply to you?",
        description: "Pick any that fit, or none.",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "I care for a child" },
          { label: "I care for an adult family member" },
          { label: "I have a disability or long-term health condition" },
          { label: "I commute more than an hour each way" },
          { label: "I've moved here from another country to study" },
        ],
      },
      {
        ref: "support_contact",
        type: "yes_no",
        title: "Would you like someone from student support to get in touch about any of this?",
        required: true,
        yesLabel: "Yes, please",
        noLabel: "No, thanks",
      },
      {
        ref: "contact_email",
        type: "email",
        title: "What email should they use?",
        description: "This is only shared with the student support team.",
        required: true,
      },
    ],
    branches: [
      { when: "support_contact", is: false, then: "end_thanks" },
      { when: "contact_email", always: true, then: "end_support" },
    ],
    endings: [
      {
        ref: "end_support",
        title: "Thanks, we'll be in touch",
        body: "Someone from student support will email you. You don't need to explain anything until you're ready.",
      },
    ],
    ending: {
      title: "Thank you 🎓",
      body: "Your answers help us plan support around the students we actually have.",
    },
    guide: {
      questionsToConsider: [
        "What decision will each question inform? Drop any you can't tie to planning, support or research.",
        "Which categories does your institution already report on, so the answers line up?",
        "Who will see individual answers, and does the opening statement say so?",
        "Should this be anonymous, or does linking it to enrolment records serve a clear purpose?",
      ],
      howToUseResponses:
        "Report results in groups large enough that nobody can be identified, and never quote individual answers in a way that points to a student. Compare study mode, work hours and caring duties against attendance or timetable data to see where support is thin. Pass support requests to the right team straight away, separate from the research data.",
      customizeSteps: [
        "Edit the opening statement to say who runs the survey, who sees the answers and how long they are kept.",
        "Change the year and study mode options to match your school, college or university.",
        "Share the link at enrolment or early in the term, then export to CSV and report the patterns by group.",
      ],
      faqs: [
        {
          q: "What should a student demographics survey include?",
          a: "Only the background that informs a decision: course, year, study mode and whatever affects support, such as work hours, caring duties or first-generation status. Leave out anything you won't use.",
        },
        {
          q: "Should demographic questions be required?",
          a: "Keep the sensitive ones optional and offer prefer not to say. Required personal questions make people guess or drop out, and both spoil the data.",
        },
        {
          q: "How do I keep student demographic data anonymous?",
          a: "Don't ask for a name or student number unless you need to link records, and report results only for groups big enough that no one stands out.",
        },
        {
          q: "When is the best time to run a student demographics survey?",
          a: "At enrolment or in the first weeks of term, when students are already giving information and support can still be planned for the year.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "student-mental-health-check-in-survey",
    type: "survey",
    category: "school",
    goals: ["collect-feedback"],
    roles: ["education"],
    searchName: "Student mental health check-in survey",
    title: "Student wellbeing check-in",
    icon: "HeartHandshake",
    metaDescription:
      "A gentle check-in on how students are feeling: mood, sleep, workload, belonging and what's weighing on them, with a clear way to ask to talk to someone.",
    description: "A short, kind check-in that lets students ask for support without having to say it out loud.",
    blurb:
      "Opens by saying who reads the answers and where to go if help is needed right away. The questions cover mood, sleep, workload and belonging in plain words, and the last one asks whether the student would like to talk to someone: only those who say yes are asked for contact details, and they get their own reassuring ending.",
    tags: ["student mental health survey", "wellbeing check-in", "student wellbeing", "pastoral care", "school counselling"],
    greeting: "Hi. This is a quick check-in on how things are going for you. There are no right answers, and it takes about three minutes.",
    questions: [
      {
        ref: "about",
        type: "statement",
        title: "Before you start",
        description:
          "Your answers are read by the student support team, usually within two school days. This isn't monitored all the time, so if you need help right now, speak to a trusted adult or contact your local emergency services. Edit this to name your team and how to reach them.",
        required: false,
      },
      {
        ref: "year_group",
        type: "dropdown",
        title: "Which year group are you in?",
        required: false,
        options: [{ label: "Year 7" }, { label: "Year 8" }, { label: "Year 9" }, { label: "Year 10" }, { label: "Year 11" }, { label: "Sixth form" }],
      },
      {
        ref: "mood",
        type: "opinion_scale",
        title: "Overall, how have you been feeling over the past two weeks?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Really low",
        labelHigh: "Really good",
      },
      {
        ref: "statements",
        type: "matrix",
        title: "Over the past two weeks, how often has each of these been true for you?",
        required: true,
        rows: [
          "I've been able to keep up with schoolwork",
          "I've slept well enough to feel rested",
          "I've had someone I can talk to",
          "I've felt like I belong at school",
          "I've had time for things I enjoy",
        ],
        columns: ["Rarely", "Sometimes", "Often", "Almost always"],
      },
      {
        ref: "weighing",
        type: "multi_select",
        title: "Is anything weighing on you at the moment?",
        description: "Pick any that fit.",
        required: false,
        minSelections: 1,
        maxSelections: 9,
        allowOther: true,
        options: [
          { label: "Schoolwork or deadlines" },
          { label: "Exams" },
          { label: "Friendships" },
          { label: "Things at home" },
          { label: "Money" },
          { label: "Sleep" },
          { label: "My health" },
          { label: "Things online" },
          { label: "Nothing much right now" },
        ],
      },
      {
        ref: "helps",
        type: "long_text",
        title: "What has helped you get through a tough day lately?",
        required: false,
        maxLength: 800,
        agentHints: {
          askStyle: "Keep it light and optional. Accept a short answer and never push for more on a sensitive topic.",
          examples: [],
        },
      },
      {
        ref: "school_support",
        type: "long_text",
        title: "Is there anything school could do that would make things a bit easier?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "talk",
        type: "single_select",
        title: "Would you like to talk to someone from the support team?",
        required: true,
        options: [{ label: "Yes, soon please" }, { label: "Maybe, but not urgently" }, { label: "No, thanks" }],
      },
      {
        ref: "name",
        type: "short_text",
        title: "What's your name, so the right person can find you?",
        required: true,
        maxLength: 80,
      },
      {
        ref: "reach_by",
        type: "single_select",
        title: "How would you prefer they reach you?",
        required: true,
        options: [
          { label: "Find me quietly during the school day" },
          { label: "Send me a message on the school system" },
          { label: "Email me" },
        ],
      },
    ],
    branches: [
      { when: "talk", is: "No, thanks", then: "end_thanks" },
      { when: "reach_by", always: true, then: "end_talk" },
    ],
    endings: [
      {
        ref: "end_talk",
        title: "Thank you for telling us 💛",
        body: "Someone from the support team will reach out the way you asked. If things feel worse before then, talk to a trusted adult straight away.",
      },
    ],
    ending: {
      title: "Thanks for checking in",
      body: "If you ever want to talk, you can fill this in again or speak to any member of staff you trust.",
    },
    guide: {
      questionsToConsider: [
        "Who reads the responses, how quickly, and does the opening screen say so honestly?",
        "What is your school's route for urgent concerns, and is it written on the first screen?",
        "Should the check-in be anonymous unless a student asks to talk, as this template is?",
        "Has your safeguarding or pastoral lead approved the questions and the follow-up process?",
      ],
      howToUseResponses:
        "Check requests to talk first, every time, and follow up in the way the student chose. Then look at the grid by year group to spot patterns such as poor sleep before exams or a year where belonging drops. Treat the answers as a starting point for a conversation, not an assessment, and follow your school's safeguarding procedure for anything that raises concern.",
      customizeSteps: [
        "Rewrite the opening screen with your support team's name, when answers are read and how to get urgent help.",
        "Change the year groups and the ways to be contacted to match your school.",
        "Share the link at the same point each term, such as tutor time, so you can compare results over the year.",
      ],
      faqs: [
        {
          q: "What questions should a student mental health check-in include?",
          a: "How the student has been feeling, how they are sleeping and coping with work, whether they feel they belong, what is weighing on them and whether they would like to talk to someone.",
        },
        {
          q: "Is a wellbeing check-in a mental health assessment?",
          a: "No. It is a way to start a conversation and spot students who want support. It does not diagnose anything or replace a professional assessment.",
        },
        {
          q: "Should a student wellbeing survey be anonymous?",
          a: "Anonymous answers tend to be more honest, so this template only asks for a name when a student asks to talk. Make sure the opening screen explains that.",
        },
        {
          q: "How often should schools run a wellbeing check-in?",
          a: "Regularly enough to notice change, such as once or twice a term, and at the same point each time so the results can be compared.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "school-climate-survey",
    type: "survey",
    category: "school",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["education"],
    searchName: "School climate survey",
    title: "School climate survey",
    icon: "School",
    metaDescription:
      "Ask students, parents and staff how safe, respected and supported they feel at school, with one follow-up question tailored to each group.",
    description: "One survey for students, parents and staff on safety, respect, belonging and support.",
    blurb:
      "Everyone rates the same statements about respect, safety and fairness, so you can compare how students, parents and staff see the school. Each group then gets one question of its own, and anyone who has seen or experienced bullying is asked what happened, with the option to leave it anonymous.",
    tags: ["school climate survey", "school culture survey", "student safety survey", "parent survey", "staff survey"],
    greeting: "We want to know what our school really feels like from the inside. It takes about five minutes, and answers are anonymous.",
    questions: [
      {
        ref: "statements",
        type: "matrix",
        title: "How much do you agree with each of these?",
        required: true,
        rows: [
          "People here treat each other with respect",
          "Students feel safe at school",
          "Adults here care about students",
          "Rules are fair and applied consistently",
          "Bullying is dealt with when it's reported",
          "It's clear who to go to with a problem",
        ],
        columns: ["Strongly disagree", "Disagree", "Agree", "Strongly agree"],
      },
      {
        ref: "belonging",
        type: "opinion_scale",
        title: "How much do you feel you belong in this school community?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Completely",
      },
      {
        ref: "role",
        type: "single_select",
        title: "And which of these describes you?",
        required: true,
        options: [{ label: "Student" }, { label: "Parent or carer" }, { label: "Member of staff" }],
      },

      // Students
      {
        ref: "learning_support",
        type: "rating",
        title: "When you're stuck with your learning, how easy is it to get help?",
        required: true,
        scale: 5,
      },

      // Parents and carers
      {
        ref: "communication",
        type: "rating",
        title: "How well does the school keep you informed about your child?",
        required: true,
        scale: 5,
      },

      // Staff
      {
        ref: "staff_support",
        type: "rating",
        title: "How well supported do you feel when dealing with behaviour?",
        required: true,
        scale: 5,
      },

      // Everyone
      {
        ref: "less_safe",
        type: "multi_select",
        title: "Are there places or times when students feel less safe?",
        required: false,
        minSelections: 1,
        maxSelections: 7,
        allowOther: true,
        options: [
          { label: "Corridors between lessons" },
          { label: "Toilets" },
          { label: "Playground or outdoor areas" },
          { label: "Lunchtime" },
          { label: "The journey to or from school" },
          { label: "Online" },
          { label: "Nowhere in particular" },
        ],
      },
      {
        ref: "bullying",
        type: "yes_no",
        title: "This term, have you seen, experienced or been told about bullying at school?",
        required: true,
      },
      {
        ref: "bullying_detail",
        type: "long_text",
        title: "If you're comfortable, tell us what happened and whether it was reported.",
        description: "Leave out names if you prefer. This survey is anonymous.",
        required: false,
        maxLength: 1500,
        agentHints: {
          askStyle: "Be gentle and don't press for detail. Remind them they can report it to a member of staff directly too.",
          examples: [],
        },
      },
      {
        ref: "does_well",
        type: "long_text",
        title: "What's one thing the school does really well?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "one_change",
        type: "long_text",
        title: "What's one change that would make the school a better place to be?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "role", is: "Student", then: "learning_support" },
      { when: "role", is: "Parent or carer", then: "communication" },
      { when: "role", is: "Member of staff", then: "staff_support" },
      { when: "learning_support", always: true, then: "less_safe" },
      { when: "communication", always: true, then: "less_safe" },
      { when: "bullying", is: false, then: "does_well" },
    ],
    ending: {
      title: "Thank you for your honesty 🏫",
      body: "We'll share what we heard and what we plan to change once the survey closes.",
    },
    guide: {
      questionsToConsider: [
        "Will you run it for students, parents and staff at the same time, so the answers can be compared?",
        "Are the wording and statements right for your youngest respondents?",
        "Where do bullying reports go, and does someone check the detailed answers promptly?",
        "How will you tell the school community what you learned and what will change?",
      ],
      howToUseResponses:
        "Compare the agreement grid across students, parents and staff: gaps between how staff and students see safety or fairness are often the most useful finding. Look at the places people feel less safe and check whether supervision matches. Read every bullying answer promptly and pass anything specific to the member of staff responsible. Share a short summary and two or three actions with the whole community afterwards.",
      customizeSteps: [
        "Adjust the statements in the grid to your school's values or behaviour policy, keeping the same wording for every group.",
        "Change the places in the safety question to match your site.",
        "Share one link with students, parents and staff, then export to CSV and compare the grid by group.",
      ],
      faqs: [
        {
          q: "What is a school climate survey?",
          a: "A survey that asks students, parents and staff how safe, respected and supported they feel at school. It shows what the school feels like to the people in it.",
        },
        {
          q: "What questions are on a school climate survey?",
          a: "Statements about respect, safety, fairness and belonging, plus questions on where people feel less safe, bullying, and what the school does well or should change.",
        },
        {
          q: "Should students, parents and staff get the same survey?",
          a: "Share the core statements so you can compare groups, then add a question or two for each. This template does that with one link, routing each group to its own question.",
        },
        {
          q: "How often should a school run a climate survey?",
          a: "Once or twice a year is common. Running it at the same time each year lets you see whether changes you made have worked.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "student-feedback",
    type: "survey",
    category: "school",
    goals: ["collect-feedback"],
    roles: ["education"],
    searchName: "Student feedback survey",
    title: "Student feedback",
    icon: "BookOpen",
    metaDescription:
      "Let students rate a class's teaching and material separately, say where the pace went wrong and what would make them recommend it. Use it mid-term or at the end.",
    description: "Feedback from students on a class, separating teaching from material, with follow-ups on pace.",
    blurb:
      "A course can have excellent material and rushed teaching, or the reverse, so the grid rates them apart. Students who found the pace off are asked where it went wrong, and the recommendation score decides the last question: fans can let you quote them, while critics say what would have to change.",
    tags: ["student feedback survey", "teacher feedback from students", "teaching feedback", "class feedback survey", "mid-term feedback"],
    greeting: "How is this class going for you? Five minutes of honest feedback helps us teach it better.",
    questions: [
      {
        ref: "course",
        type: "short_text",
        title: "Which course or class is this about?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each part?",
        required: true,
        rows: ["Course material", "Teaching", "Exercises and activities", "Support outside class", "Assessment"],
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

      // Too slow
      {
        ref: "slow_where",
        type: "short_text",
        title: "Which parts dragged?",
        required: false,
        maxLength: 300,
      },

      // Too fast
      {
        ref: "fast_where",
        type: "short_text",
        title: "Where did you start to lose the thread?",
        required: false,
        maxLength: 300,
      },
      {
        ref: "fast_support",
        type: "yes_no",
        title: "Would catch-up sessions have helped?",
        required: false,
        yesLabel: "Yes, definitely",
        noLabel: "Not really",
      },

      // Everyone
      { ref: "most_useful", type: "long_text", title: "What was most useful?", required: false, maxLength: 800 },
      {
        ref: "least_useful",
        type: "long_text",
        title: "What would you cut or change?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "confidence_now",
        type: "opinion_scale",
        title: "How confident do you feel using what you learned?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Completely",
      },
      { ref: "recommend", type: "nps", title: "How likely are you to recommend this course to another student?", required: true },

      // Critics
      {
        ref: "what_would_change_it",
        type: "long_text",
        title: "What would have to be different for you to recommend it?",
        required: false,
        maxLength: 1000,
      },

      // Fans
      {
        ref: "quote_ok",
        type: "yes_no",
        title: "May we quote your feedback on the course page?",
        required: false,
        yesLabel: "Yes, with my first name",
        noLabel: "Please don't",
      },
      {
        ref: "quote_name",
        type: "short_text",
        title: "What first name should we put next to your quote?",
        required: true,
        maxLength: 40,
      },
    ],
    branches: [
      { when: "pace", is: "Too slow", then: "slow_where" },
      { when: "pace", is: "About right", then: "most_useful" },
      { when: "pace", is: "Too fast", then: "fast_where" },
      { when: "slow_where", always: true, then: "most_useful" },
      { when: "recommend", op: "lte", is: 6, then: "what_would_change_it" },
      { when: "recommend", op: "gte", is: 7, then: "quote_ok" },
      { when: "what_would_change_it", always: true, then: "end_thanks" },
      { when: "quote_ok", is: false, then: "end_thanks" },
    ],
    ending: { title: "Thank you 📚", body: "Every group that follows gets a better course because of answers like these." },
    guide: {
      questionsToConsider: [
        "Is this about one teacher's class or a whole course taught by several people?",
        "Should the survey be anonymous, and if so, is asking for a first name on quotes enough?",
        "Which parts of the course do you most want rated separately?",
        "Will you ask mid-term, while there's still time to change the pace, as well as at the end?",
      ],
      howToUseResponses:
        "Compare the teaching and material rows first: a low score on one but not the other tells you where to focus. Group the pace answers by where students lost the thread, since the same topic coming up again and again marks the lesson to rework. Read every answer from students who would not recommend the course, and keep the quotes you were allowed to use for the course page.",
      customizeSteps: [
        "Rename the rows in the rating grid to the parts of your course, such as labs, reading or group work.",
        "Change the catch-up question to whatever extra help you could actually offer.",
        "Share the link at the end of a lesson so students fill it in before they leave, then export the answers to CSV.",
      ],
      faqs: [
        {
          q: "What questions should a student feedback survey ask?",
          a: "Ratings for the material, teaching, activities and assessment, how the pace felt, what was most and least useful, how confident students feel now and whether they would recommend it.",
        },
        {
          q: "Should student feedback be anonymous?",
          a: "Usually, yes. Students are more honest when they are not named, especially before grades are final. This template only asks for a first name if a student agrees to be quoted.",
        },
        {
          q: "When is the best time to collect student feedback?",
          a: "In the last session, while the course is fresh and before students scatter. A shorter mid-course check can catch pace problems while there is still time to fix them.",
        },
        {
          q: "How do I get honest feedback from students?",
          a: "Keep it anonymous, explain what changed because of last year's answers, and ask about specific parts of the course rather than the teacher as a person.",
        },
      ],
    },
  }),
];
