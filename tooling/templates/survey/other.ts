import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_OTHER: TemplateSeed[] = [
  defineTemplate({
    slug: "commuting-survey",
    type: "survey",
    category: "other",
    goals: ["conduct-research", "collect-feedback"],
    roles: ["operations", "hr-people"],
    searchName: "Commuting survey",
    title: "Commuting survey",
    icon: "Bike",
    metaDescription:
      "Find out how people get to work or study: how often, how long, by what means and what gets in the way. Unhappy commuters are asked what makes the trip hard.",
    description: "Learn how people travel in, what it costs them and what would make the trip easier.",
    blurb:
      "A travel survey for employers, campuses and site managers planning parking, flexible hours or transport support. People who never travel in are thanked and let go at the first question, and anyone who rates their commute poorly is asked what makes it hard before everyone ranks the changes that would help most.",
    tags: ["commuting survey", "travel to work survey", "staff travel plan", "transport survey", "commute questionnaire"],
    greeting: "We're planning how to make getting here easier. Tell us about your usual journey in; it takes about two minutes.",
    questions: [
      {
        ref: "days_in",
        type: "single_select",
        title: "In a typical week, how many days do you travel in?",
        required: true,
        options: [
          { label: "5 days or more" },
          { label: "3 to 4 days" },
          { label: "1 to 2 days" },
          { label: "Less than once a week" },
          { label: "I don't travel in at all" },
        ],
      },
      {
        ref: "main_mode",
        type: "single_select",
        title: "How do you cover the longest part of your journey?",
        required: true,
        allowOther: true,
        options: [
          { label: "Walking" },
          { label: "Bicycle or e-scooter" },
          { label: "Motorbike or moped" },
          { label: "Driving alone" },
          { label: "Car share or getting a lift" },
          { label: "Bus or coach" },
          { label: "Train, tram or metro" },
        ],
      },
      {
        ref: "journey_time",
        type: "single_select",
        title: "Door to door, how long does the trip usually take one way?",
        required: true,
        options: [
          { label: "Under 15 minutes" },
          { label: "15 to 30 minutes" },
          { label: "30 to 45 minutes" },
          { label: "45 to 60 minutes" },
          { label: "Over an hour" },
        ],
      },
      {
        ref: "area",
        type: "short_text",
        title: "Which town, neighbourhood or postcode district do you travel from?",
        description: "A rough area is plenty. We never need your street address.",
        required: false,
        maxLength: 80,
      },
      {
        ref: "monthly_cost",
        type: "number",
        title: "Roughly how much does commuting cost you in a typical month?",
        description: "Fares, fuel and parking together. A best guess is fine.",
        required: false,
        min: 0,
      },
      {
        ref: "commute_feeling",
        type: "opinion_scale",
        title: "How do you feel about your commute on a normal day?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "I dread it",
        labelHigh: "It's easy",
      },

      // Hard commutes
      {
        ref: "worst_part",
        type: "long_text",
        title: "What's the hardest part of the journey for you?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "obstacles",
        type: "multi_select",
        title: "Which of these get in the way of travelling in more easily?",
        required: true,
        allowOther: true,
        options: [
          { label: "Cost of fares or fuel" },
          { label: "Unreliable or infrequent public transport" },
          { label: "Traffic and congestion" },
          { label: "Not enough parking" },
          { label: "No safe cycling or walking route" },
          { label: "Nowhere to store a bike or change" },
          { label: "Feeling unsafe at certain times" },
          { label: "Caring duties before or after work" },
          { label: "Nothing really" },
        ],
      },
      {
        ref: "helps_most",
        type: "ranking",
        title: "Put these in order of how much they would help you.",
        required: true,
        items: [
          "Flexible start and finish times",
          "More days working from home",
          "A discounted public transport pass",
          "Secure bike parking and showers",
          "Help finding someone to car share with",
          "More or better parking",
        ],
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Anything else about getting here that we should know?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "days_in", is: "I don't travel in at all", then: "end_remote" },
      { when: "commute_feeling", op: "lte", is: 2, then: "worst_part" },
      { when: "commute_feeling", op: "gte", is: 3, then: "obstacles" },
    ],
    ending: {
      title: "Thanks for sharing your journey 🙌",
      body: "We'll look at the answers together and share what we plan to change.",
    },
    endings: [
      {
        ref: "end_remote",
        title: "Thanks, that's all we need",
        body: "This survey is about journeys in, so there's nothing more to ask you. We appreciate you letting us know.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What decision will this inform: parking, shift times, a transport pass, bike facilities or a move to a new site?",
        "Do you need to compare answers by site, team or shift pattern, and should you ask for it?",
        "Is a rough area enough for planning, or do you truly need anything more precise?",
        "Should people who work fully remotely be counted and thanked, or left out of the link entirely?",
      ],
      howToUseResponses:
        "Start with the mix of travel modes and journey times, then read the obstacles against them: a car driver stuck in traffic and a bus rider facing a missed connection need different fixes. The ranking shows which change would help the most people, and the written answers from people who dread their trip tell you what the numbers miss. Share a short summary back so people see their answers led somewhere.",
      customizeSteps: [
        "Rename the options in the ranking to changes you could actually make, and remove any that are off the table.",
        "Add a question for site or shift if you run more than one, so you can compare locations.",
        "Share the link by email or on your intranet, and keep it open for about two weeks so part-time staff can answer.",
      ],
      faqs: [
        {
          q: "What should a commuting survey ask?",
          a: "How often people travel, how they get there, how long it takes, what it costs and what makes it hard. A question on which changes would help turns the answers into a plan.",
        },
        {
          q: "Should I ask for a home address in a commuting survey?",
          a: "Usually not. A town or postcode district is enough to spot clusters for car sharing or a shuttle route, and people answer more honestly when they are not asked for a street.",
        },
        {
          q: "Can I make the commuting survey anonymous?",
          a: "Yes. This version asks for no name or email, so you can share one link with everyone and still read every response in the dashboard.",
        },
        {
          q: "Can I use this for students instead of staff?",
          a: "Yes. Use this template copies it into your account, where you can change the wording from work to study and edit any option before sharing the link.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "market-research-survey",
    type: "survey",
    category: "other",
    goals: ["conduct-research"],
    roles: ["marketing", "product-research"],
    searchName: "Market research survey",
    title: "Market research survey",
    icon: "PieChart",
    metaDescription:
      "Explore a market before you commit: the problem people have, how they solve it today, what they pay and what would put them off. Screens out the wrong people.",
    description: "Test a market before you build or sell: the problem, the alternatives and the buying criteria.",
    blurb:
      "Written around a real example, weekly meal planning, so you can see how good market research questions sound before swapping in your own market. People who aren't the decision maker are screened out politely, those who already pay for a solution are asked what they bought, and only volunteers are asked for an email.",
    tags: ["market research survey", "market validation", "customer research", "buying criteria", "business idea survey"],
    greeting: "We're researching how households plan and cook their weekly meals. It takes about three minutes, and there are no right answers.",
    questions: [
      {
        ref: "planner",
        type: "single_select",
        title: "Who usually decides what gets cooked in your home?",
        required: true,
        options: [
          { label: "Mostly me" },
          { label: "It's shared" },
          { label: "Someone else, almost always" },
        ],
      },
      {
        ref: "household",
        type: "number",
        title: "How many people do you usually cook for, including yourself?",
        required: true,
        min: 1,
        max: 20,
        integerOnly: true,
      },
      {
        ref: "cook_frequency",
        type: "single_select",
        title: "On a typical weekday, how often is dinner cooked at home?",
        required: true,
        options: [
          { label: "Almost every day" },
          { label: "Three or four days" },
          { label: "Once or twice" },
          { label: "Rarely" },
        ],
      },
      {
        ref: "hassle",
        type: "opinion_scale",
        title: "How much of a hassle is deciding what to cook each week?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "No hassle",
        labelHigh: "A real headache",
      },
      {
        ref: "current_approach",
        type: "multi_select",
        title: "How do you handle meal planning today?",
        required: true,
        allowOther: true,
        options: [
          { label: "I decide on the day" },
          { label: "A written plan or shopping list" },
          { label: "Recipe websites or apps" },
          { label: "Cookbooks" },
          { label: "Meal kit deliveries" },
          { label: "Ready meals or takeaway" },
        ],
      },
      {
        ref: "has_paid",
        type: "yes_no",
        title: "In the last year, have you paid for anything to make this easier?",
        description: "An app, a meal kit, a subscription, anything.",
        required: true,
      },
      {
        ref: "paid_for",
        type: "long_text",
        title: "What did you pay for, and do you still use it? If you stopped, why?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "criteria",
        type: "ranking",
        title: "When choosing something to help with meals, what matters most to you?",
        required: true,
        items: [
          "Price",
          "Time saved",
          "Healthy meals",
          "Less food waste",
          "Fits our dietary needs",
          "Everyone will actually eat it",
        ],
      },
      {
        ref: "fair_spend",
        type: "single_select",
        title: "If something solved this well, what would feel like a fair monthly spend?",
        required: true,
        options: [
          { label: "Nothing, I'd only use a free option" },
          { label: "Less than one takeaway meal" },
          { label: "About one takeaway meal" },
          { label: "Two or three takeaway meals" },
          { label: "More than that" },
        ],
      },
      {
        ref: "put_off",
        type: "long_text",
        title: "What would put you off trying a new product for this?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "follow_up",
        type: "yes_no",
        title: "Would you be up for a 20-minute follow-up chat with our team?",
        required: true,
      },
      {
        ref: "email",
        type: "email",
        title: "Great. What's the best email to reach you?",
        required: true,
      },
    ],
    branches: [
      { when: "planner", is: "Someone else, almost always", then: "end_not_fit" },
      { when: "has_paid", is: true, then: "paid_for" },
      { when: "has_paid", is: false, then: "criteria" },
      { when: "follow_up", is: false, then: "end_thanks" },
    ],
    ending: {
      title: "Thank you, this is really useful",
      body: "Your answers go straight to the team shaping what we build next.",
    },
    endings: [
      {
        ref: "end_not_fit",
        title: "Thanks for stopping by",
        body: "We're looking for the person who plans the meals this time, so we won't take more of your time.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Which one decision should this research inform: whether to enter the market, who to target, or what to charge?",
        "Who exactly should answer, and which first question screens out everyone else?",
        "What past behaviour, such as money already spent, would show the problem is real rather than just nice to solve?",
        "Which alternatives do people use today, including doing nothing?",
      ],
      howToUseResponses:
        "Split the answers by who has already paid to solve the problem and who hasn't: people spending money today are the clearest evidence of demand, and their stories of why they stopped tell you what a competitor gets wrong. Compare the ranking against the fair spend answers to see whether price or time drives the choice. Treat a small sample as a set of leads for the follow-up chats, not as proof of what the whole market thinks.",
      customizeSteps: [
        "Replace meal planning with your market, keeping the same order: screen, current behaviour, spend, criteria, objections.",
        "Rewrite the options in the ranking and the current approach question to the real alternatives in your market.",
        "Share the link where your target audience already gathers, and read the first ten responses before sending it wider.",
      ],
      faqs: [
        {
          q: "What questions should a market research survey include?",
          a: "A screening question, how people handle the problem today, whether they've paid to solve it, what matters when they choose, and what would put them off. Past behaviour is more reliable than what people say they might do.",
        },
        {
          q: "How many responses do I need for market research?",
          a: "It depends on the decision. A few dozen answers from the right people can show you patterns worth exploring, but they don't prove what a whole market thinks.",
        },
        {
          q: "How do I avoid leading questions?",
          a: "Describe the problem rather than your product, use balanced options, and ask about what people did recently instead of whether they like an idea.",
        },
        {
          q: "Can I adapt this survey to my own market?",
          a: "Yes. Use this template copies it into your account, where you can rewrite every question and option, then share it by link or embed it on your website.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "product-research-survey",
    type: "survey",
    category: "other",
    goals: ["conduct-research"],
    roles: ["product-research"],
    searchName: "Product research survey",
    title: "Product research survey",
    icon: "FlaskConical",
    metaDescription:
      "Learn how people do a task today, the tools they use and where it breaks, before you design a product. Asks why they abandoned past tools and who will try a beta.",
    description: "Understand the task, the current workaround and the unsolved problems before you build.",
    blurb:
      "Built around one example task, sending invoices, to show how product research questions work: the last time they did it, the tools they use, and a grid of which problems are real. People who never do the task are thanked and let go, anyone who gave up on a tool is asked why, and only willing testers leave an email.",
    tags: ["product research survey", "user research", "jobs to be done", "product discovery", "problem validation"],
    greeting: "We're trying to understand how people handle invoicing before we build anything. It's about four minutes, and honest answers help most.",
    questions: [
      {
        ref: "work_type",
        type: "single_select",
        title: "Which best describes your work?",
        required: true,
        allowOther: true,
        options: [
          { label: "Freelancer or sole trader" },
          { label: "Owner of a small business" },
          { label: "Finance or admin at a larger company" },
        ],
      },
      {
        ref: "task_frequency",
        type: "single_select",
        title: "How often do you send invoices?",
        required: true,
        options: [
          { label: "Several times a week" },
          { label: "A few times a month" },
          { label: "Once a month or less" },
          { label: "I don't send invoices" },
        ],
      },
      {
        ref: "last_time",
        type: "long_text",
        title: "Think about the last invoice you sent. Walk us through what you did, from start to finish.",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "tools",
        type: "multi_select",
        title: "What do you use for invoicing today?",
        required: true,
        allowOther: true,
        options: [
          { label: "A spreadsheet" },
          { label: "A document template" },
          { label: "Accounting software" },
          { label: "A dedicated invoicing app" },
          { label: "My payment provider's invoices" },
          { label: "Pen and paper" },
        ],
      },
      {
        ref: "time_taken",
        type: "single_select",
        title: "How long does one invoice take, from starting it to sending it?",
        required: true,
        options: [
          { label: "Under 5 minutes" },
          { label: "5 to 15 minutes" },
          { label: "15 to 30 minutes" },
          { label: "Longer than 30 minutes" },
        ],
      },
      {
        ref: "problems",
        type: "matrix",
        title: "How much of a problem is each of these for you?",
        required: true,
        rows: [
          "Getting paid on time",
          "Keeping track of who has paid",
          "Getting client details and amounts right",
          "Handling tax on invoices",
          "Matching payments to invoices",
        ],
        columns: ["Not a problem", "Minor annoyance", "Real problem"],
      },
      {
        ref: "setup_fit",
        type: "opinion_scale",
        title: "Overall, how well does your current setup work for you?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Very badly",
        labelHigh: "Perfectly",
      },
      {
        ref: "abandoned",
        type: "yes_no",
        title: "Have you ever tried a different tool for this and gone back?",
        required: true,
      },
      {
        ref: "why_abandoned",
        type: "long_text",
        title: "What was it, and what made you give up on it?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "one_fix",
        type: "long_text",
        title: "If you could fix one thing about invoicing tomorrow, what would it be?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "beta",
        type: "yes_no",
        title: "Would you try an early version and tell us what you think?",
        required: true,
      },
      {
        ref: "email",
        type: "email",
        title: "Thanks. Where should we send the invite?",
        required: true,
      },
    ],
    branches: [
      { when: "task_frequency", is: "I don't send invoices", then: "end_not_fit" },
      { when: "abandoned", is: true, then: "why_abandoned" },
      { when: "abandoned", is: false, then: "one_fix" },
      { when: "beta", is: false, then: "end_thanks" },
    ],
    ending: {
      title: "Thank you for walking us through it",
      body: "Every answer is read by the people designing the product.",
    },
    endings: [
      {
        ref: "end_not_fit",
        title: "Thanks, that's all for now",
        body: "This research is for people who send invoices, so we won't ask you anything more.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What is the one task you want to understand, and who does it often enough to describe it well?",
        "Which problems do you already suspect, and could the grid include one you think is not a problem at all as a check?",
        "Do you want to hear from people who gave up on existing tools, and what would you ask them?",
        "Will you follow up with interviews or a beta, and do you need contact details only from volunteers?",
      ],
      howToUseResponses:
        "Read the step-by-step answers first: they show the real workflow, including the copy and paste and the reminders nobody mentions in a checkbox. Then sort the grid by how many people marked each row a real problem, and check it against the one fix they asked for. The reasons people abandoned other tools are a list of mistakes to avoid. Invite the most detailed respondents to a follow-up chat before you design anything.",
      customizeSteps: [
        "Swap invoicing for your task and rewrite the first two questions so only people who do it carry on.",
        "Replace the rows in the problem grid with the pain points you suspect, and the tools list with real alternatives.",
        "Share the link with a small group first, read the walk-through answers, then adjust wording before sending it widely.",
      ],
      faqs: [
        {
          q: "What is a product research survey?",
          a: "A survey that studies the task and the problems behind a product decision, before you commit to a solution. It asks how people work today rather than whether they like your idea.",
        },
        {
          q: "What questions should I ask in product research?",
          a: "Ask about the last time they did the task, what they use, how long it takes, which problems are real and what they have tried and abandoned. Specific recent examples beat hypothetical questions.",
        },
        {
          q: "Is a survey enough for product discovery?",
          a: "It is a good way to find patterns and recruit people, but it works best alongside interviews. This template ends by asking who would try an early version, so you have people to talk to next.",
        },
        {
          q: "Can the survey ask follow-up questions?",
          a: "Yes. Each person is asked one question at a time, and when an answer is vague a short AI follow-up asks for the detail, which helps most on the walk-through question.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "candidate-experience-survey",
    type: "survey",
    category: "other",
    goals: ["collect-feedback"],
    roles: ["hr-people"],
    searchName: "Candidate experience survey",
    title: "Candidate experience survey",
    icon: "UserPlus",
    metaDescription:
      "Ask applicants how your hiring process felt: the job ad, the interviews, how fast you replied and whether they felt respected, whatever the outcome.",
    description: "Hear from applicants about your job ads, interviews and communication, at every stage.",
    blurb:
      "One survey for every applicant, whether they were hired or not. People who only applied skip the interview questions, and anyone who didn't feel treated with respect is asked what happened, so the complaints worth acting on come with detail.",
    tags: ["candidate experience survey", "recruitment feedback", "interview feedback", "hiring process survey", "applicant survey"],
    greeting: "Thanks for applying to work with us. Whatever the outcome, we'd value two minutes of honest feedback on how our process felt.",
    questions: [
      {
        ref: "role",
        type: "short_text",
        title: "Which role did you apply for?",
        required: false,
        maxLength: 120,
      },
      {
        ref: "ad_clarity",
        type: "opinion_scale",
        title: "How clearly did the job ad describe the role and what it would involve?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not clear at all",
        labelHigh: "Very clear",
      },
      {
        ref: "stage",
        type: "single_select",
        title: "How far did you get in the process?",
        required: true,
        options: [
          { label: "I applied but wasn't invited to interview" },
          { label: "I had a first call or screening" },
          { label: "I completed one or more interviews" },
          { label: "I received an offer" },
        ],
      },

      // Interviewed candidates
      {
        ref: "interviews",
        type: "matrix",
        title: "Thinking about your interviews, how much do you agree with each of these?",
        required: true,
        rows: [
          "Scheduling was easy",
          "My interviewers were prepared",
          "The questions related to the actual job",
          "I had time to ask my own questions",
          "I understood the next steps afterwards",
        ],
        columns: ["Disagree", "Neutral", "Agree"],
      },

      // Everyone
      {
        ref: "kept_informed",
        type: "rating",
        title: "How well did we keep you informed along the way?",
        required: true,
        scale: 5,
      },
      {
        ref: "longest_wait",
        type: "single_select",
        title: "What was the longest you waited to hear back from us?",
        required: true,
        options: [
          { label: "A few days" },
          { label: "About a week" },
          { label: "Two weeks or more" },
          { label: "I never heard back" },
        ],
      },
      {
        ref: "respected",
        type: "yes_no",
        title: "Did you feel treated with respect throughout?",
        required: true,
      },
      {
        ref: "respect_detail",
        type: "long_text",
        title: "We're sorry. What happened that made you feel that way?",
        description: "Share as much or as little as you like.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "one_change",
        type: "long_text",
        title: "What one change would have made the process better for you?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to encourage a friend to apply here?",
        required: true,
      },
    ],
    branches: [
      { when: "stage", is: "I applied but wasn't invited to interview", then: "kept_informed" },
      { when: "respected", is: true, then: "one_change" },
      { when: "respected", is: false, then: "respect_detail" },
    ],
    ending: {
      title: "Thank you for telling us",
      body: "Your feedback has no effect on any application, now or later. It helps us treat the next candidate better.",
    },
    guide: {
      questionsToConsider: [
        "When will you send it: after rejection, after an offer, or at a fixed point for everyone?",
        "Should it be anonymous, or do you want to link answers to a role or a hiring manager?",
        "Which stages of your process deserve their own rows, such as a take-home task or an assessment day?",
        "Who reads the answers about respect, and how quickly will they act on them?",
      ],
      howToUseResponses:
        "Look at answers by stage: people rejected after applying mostly judge your communication, while interviewed candidates can tell you whether interviewers were prepared and questions were fair. A pattern of long waits or never hearing back is usually the quickest fix. Read every answer about respect as soon as it arrives, and share themes with hiring managers each quarter rather than single comments that could identify someone.",
      customizeSteps: [
        "Rename the interview rows to match your own stages, adding one for any task or assessment you set.",
        "Turn the role question into a dropdown of your open roles, so answers group cleanly by vacancy.",
        "Share the link in your decision email or embed it on your careers page, with a line saying feedback cannot affect any application.",
      ],
      faqs: [
        {
          q: "What is a candidate experience survey?",
          a: "A short survey sent to job applicants about how the hiring process felt, from the job ad to the final decision. It shows where good candidates lose interest or leave with a poor impression.",
        },
        {
          q: "Should I send it to rejected candidates?",
          a: "Yes. They are the people most likely to notice slow replies and unclear next steps, and hearing from them is how you find out. Say clearly that their answers won't affect any application.",
        },
        {
          q: "What should a candidate experience survey ask?",
          a: "How clear the job ad was, how interviews went, how well you kept them informed, how long they waited, and whether they felt respected. A question on whether they'd encourage a friend to apply sums it up.",
        },
        {
          q: "When should I send a candidate experience survey?",
          a: "A day or two after the final decision, while the process is fresh but the outcome has sunk in. Sending it to everyone at the same point keeps the answers comparable.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "job-satisfaction-survey",
    type: "survey",
    category: "other",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["hr-people"],
    searchName: "Job satisfaction survey",
    title: "Job satisfaction survey",
    icon: "SmilePlus",
    metaDescription:
      "Ask employees how they feel about the work, their workload, pay, recognition and growth. Low scorers are asked what's wrong; high scorers what's worth protecting.",
    description: "Measure how people feel about the job itself, with a different follow-up for low and high scores.",
    blurb:
      "Covers the parts of a job that shape how people feel about it, from the work itself to recognition and room to grow. The overall score decides the follow-up: someone struggling is asked what's making the job hard, someone content is asked what's worth protecting, and everyone says whether they see themselves here in a year.",
    tags: ["job satisfaction survey", "employee satisfaction", "staff survey", "employee engagement", "workplace survey"],
    greeting: "This survey is about how your job feels right now. It takes about three minutes, and answers are reported only as team totals.",
    questions: [
      {
        ref: "department",
        type: "dropdown",
        title: "Which part of the organisation do you work in?",
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
          { label: "Less than 6 months" },
          { label: "6 months to 2 years" },
          { label: "2 to 5 years" },
          { label: "More than 5 years" },
        ],
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How satisfied are you with each part of your job?",
        required: true,
        rows: [
          "The work itself",
          "My workload",
          "Pay and benefits",
          "Recognition for good work",
          "My relationship with my manager",
          "My relationship with colleagues",
          "Chances to learn and grow",
        ],
        columns: ["Dissatisfied", "Neutral", "Satisfied"],
      },
      {
        ref: "clear_expectations",
        type: "yes_no",
        title: "Do you know clearly what's expected of you in your role?",
        required: true,
      },
      {
        ref: "overall",
        type: "opinion_scale",
        title: "All things considered, how satisfied are you with your job right now?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Completely",
      },

      // Lower scores
      {
        ref: "whats_hard",
        type: "long_text",
        title: "What's making the job harder to enjoy at the moment?",
        required: true,
        maxLength: 1000,
      },

      // Higher scores
      {
        ref: "worth_protecting",
        type: "long_text",
        title: "What about your job would you most hate to lose?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "growth_path",
        type: "single_select",
        title: "Can you see a way to grow here over the next year?",
        required: true,
        options: [
          { label: "Yes, clearly" },
          { label: "Maybe, but it's unclear how" },
          { label: "Not really" },
        ],
      },
      {
        ref: "one_year",
        type: "single_select",
        title: "Do you see yourself working here a year from now?",
        required: true,
        options: [{ label: "Yes" }, { label: "Not sure" }, { label: "Probably not" }],
      },
      {
        ref: "one_change",
        type: "long_text",
        title: "If you could change one thing about your job, what would it be?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "overall", op: "lte", is: 5, then: "whats_hard" },
      { when: "overall", op: "gte", is: 6, then: "worth_protecting" },
      { when: "whats_hard", always: true, then: "growth_path" },
    ],
    ending: {
      title: "Thank you for being honest",
      body: "We'll share what we learned with the whole team and what we plan to do about it.",
    },
    guide: {
      questionsToConsider: [
        "Are your teams big enough that reporting by department keeps individuals anonymous?",
        "Which parts of the job matter most in your organisation, and should any rows be added, such as shift patterns or tools?",
        "Where is the line between a low score and a follow-up you must act on, and who reads those answers?",
        "How often will you run it, so the same questions can be compared over time?",
      ],
      howToUseResponses:
        "Read the grid by department to find where a single part of the job is dragging satisfaction down, then read the written answers from people who scored five or lower for the reasons behind it. Watch the one-year question closely: a team full of 'probably not' answers needs a conversation before resignations arrive. Share a summary and one or two commitments within a month, or the next round will get fewer and blander answers.",
      customizeSteps: [
        "Change the department list to your real teams, merging any small enough to identify people.",
        "Edit the rows in the grid to the parts of the job you can influence, and keep them fixed between rounds.",
        "Share the link with a clear note on anonymity and a closing date, and send one reminder a few days before it.",
      ],
      faqs: [
        {
          q: "What questions should a job satisfaction survey include?",
          a: "Questions on the work itself, workload, pay, recognition, relationships, growth and clarity of expectations, plus an overall score. An open question on what to change gives you something to act on.",
        },
        {
          q: "How often should you run a job satisfaction survey?",
          a: "Once or twice a year works for most teams, with the same core questions so you can compare results over time.",
        },
        {
          q: "Should a job satisfaction survey be anonymous?",
          a: "Usually yes, because people are more candid when they can't be identified. This version asks for no name, and department is the only grouping, so merge small teams before you share it.",
        },
        {
          q: "Can I export the results?",
          a: "Yes. Every response appears in the dashboard, and you can export them to CSV to compare departments or rounds in a spreadsheet.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "performance-appraisal-survey",
    type: "survey",
    category: "other",
    goals: ["collect-feedback"],
    roles: ["hr-people", "operations"],
    searchName: "Performance appraisal survey",
    title: "Performance appraisal",
    icon: "ClipboardCheck",
    metaDescription:
      "A self-appraisal employees fill in before their review: goals met, work they're proud of, a self-rating, support needed and goals for the next period.",
    description: "Help employees prepare for their review with goals, examples, a self-rating and next steps.",
    blurb:
      "Sent before a review meeting so the conversation starts from the employee's own account. Anyone who met only some of their goals is asked what got in the way before sharing their best work, and it ends with the support they need and the goals they'd set next, so the meeting can move straight to agreeing a plan.",
    tags: ["performance appraisal survey", "self appraisal form", "performance review", "self-assessment", "employee review"],
    greeting: "Your review is coming up. This helps you and your manager start from the same page, and takes about ten minutes to answer thoughtfully.",
    questions: [
      {
        ref: "name",
        type: "short_text",
        title: "What's your name?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "job_title",
        type: "short_text",
        title: "What's your current job title?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "period",
        type: "short_text",
        title: "Which period does this review cover?",
        required: true,
        maxLength: 80,
        placeholder: "e.g. January to June",
      },
      {
        ref: "goals_met",
        type: "single_select",
        title: "Looking at the goals you agreed for this period, how many did you meet?",
        required: true,
        options: [
          { label: "All of them" },
          { label: "Most of them" },
          { label: "Some of them" },
          { label: "Few or none" },
          { label: "We didn't set clear goals" },
        ],
      },

      // Goals partly met
      {
        ref: "blockers",
        type: "long_text",
        title: "What got in the way of the goals you didn't reach?",
        description: "Changed priorities, missing resources, things outside your control: all worth naming.",
        required: true,
        maxLength: 1500,
      },

      // Everyone
      {
        ref: "achievements",
        type: "long_text",
        title: "Describe two or three pieces of work you're proudest of this period.",
        description: "Specific examples help most: what you did, and what changed because of it.",
        required: true,
        maxLength: 2500,
      },
      {
        ref: "evidence",
        type: "file_upload",
        title: "Want to attach anything that shows your work?",
        description: "Optional. A report, a message of thanks, a screenshot.",
        required: false,
        accept: ["application/pdf", "image/*", ".docx", ".xlsx"],
        maxFiles: 3,
      },
      {
        ref: "competencies",
        type: "matrix",
        title: "How would you rate yourself on each of these?",
        required: true,
        rows: [
          "Quality of work",
          "Meeting deadlines",
          "Communication",
          "Working with others",
          "Solving problems",
          "Taking initiative",
        ],
        columns: ["Needs work", "Solid", "A strength"],
      },
      {
        ref: "self_rating",
        type: "opinion_scale",
        title: "Overall, how would you rate your performance this period?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Below expectations",
        labelHigh: "Well above expectations",
      },
      {
        ref: "support",
        type: "long_text",
        title: "What support from your manager or the company would help you most next period?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "development",
        type: "multi_select",
        title: "Which areas would you like to develop?",
        required: false,
        minSelections: 0,
        allowOther: true,
        options: [
          { label: "Technical or job skills" },
          { label: "Leading people" },
          { label: "Managing projects" },
          { label: "Presenting and communicating" },
          { label: "Knowledge of the wider business" },
        ],
      },
      {
        ref: "next_goals",
        type: "long_text",
        title: "What goals would you like to set for the next period?",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "to_discuss",
        type: "long_text",
        title: "Anything else you want to make sure comes up in the meeting?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "goals_met", is: "All of them", then: "achievements" },
      { when: "goals_met", is: "Most of them", then: "achievements" },
      { when: "goals_met", is: "We didn't set clear goals", then: "achievements" },
      { when: "goals_met", is: "Some of them", then: "blockers" },
      { when: "goals_met", is: "Few or none", then: "blockers" },
    ],
    ending: {
      title: "All done, thank you",
      body: "Your manager will read this before your review, so you can spend the meeting on what comes next.",
    },
    guide: {
      questionsToConsider: [
        "Will the employee see their manager's assessment too, or is this only their side?",
        "Do the competency rows match the ones in your job descriptions or review framework?",
        "How long before the meeting should it be sent, so the manager has time to read it?",
        "Should goals be pasted into the form, or will people have their last review to hand?",
      ],
      howToUseResponses:
        "Read each self-appraisal before the meeting and note where the employee's view and yours differ, especially on the competency grid and the overall rating: those gaps are the conversation. Treat the blockers answer as a list of things the organisation may need to fix, not excuses. Turn the support and next goals answers into written actions at the end of the meeting, and bring them back at the next review.",
      customizeSteps: [
        "Replace the competency rows with the ones your organisation reviews against.",
        "Add a question for the manager's name if one link goes to the whole company, so each appraisal reaches the right reviewer.",
        "Send it about a week before the review meeting, and agree with managers to read it before they write their own notes.",
      ],
      faqs: [
        {
          q: "What should a performance appraisal survey include?",
          a: "The goals agreed for the period, what got in the way, specific examples of good work, a self-rating, the support needed and goals for next time. That gives the review meeting a clear agenda.",
        },
        {
          q: "What is the difference between a self-appraisal and a performance review?",
          a: "A self-appraisal is the employee's own account, written before the meeting. The review is the conversation where it's compared with the manager's view and next steps are agreed.",
        },
        {
          q: "How do I write good self-appraisal answers?",
          a: "Be specific: name the piece of work, what you did and what changed because of it. Be honest about what didn't go well and what would help next time.",
        },
        {
          q: "Can employees attach documents?",
          a: "Yes. The form includes an optional upload for up to three files, such as reports or thank-you messages, which appear with the response in the dashboard.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "supervisor-evaluation-survey",
    type: "survey",
    category: "other",
    goals: ["collect-feedback"],
    roles: ["hr-people", "operations"],
    searchName: "Supervisor evaluation survey",
    title: "Supervisor evaluation",
    icon: "UserCheck",
    metaDescription:
      "Let shift and frontline teams rate day-to-day supervision: clear instructions, fair shifts, handovers and coaching on the job, plus how mistakes get handled.",
    description: "Anonymous feedback from shift and frontline teams on how their supervisor runs the shift.",
    blurb:
      "Built for shift-based and frontline teams, where supervision is about the shift in front of you: clear instructions, fair rotas, proper handovers and help on the job. Anyone whose supervisor blames people or stays out of it when something goes wrong is asked for an example, which is often the most useful answer in the whole survey.",
    tags: ["supervisor evaluation", "supervisor feedback survey", "upward feedback", "team leader evaluation", "shift supervisor feedback"],
    greeting: "Tell us how supervision works on your shifts. It's anonymous and takes about three minutes.",
    questions: [
      {
        ref: "supervisor",
        type: "short_text",
        title: "Who is the supervisor you're giving feedback on?",
        description: "Only HR sees names. Supervisors see combined results from three or more people.",
        required: true,
        maxLength: 120,
      },
      {
        ref: "shift",
        type: "single_select",
        title: "Which shift do you usually work with them?",
        required: true,
        options: [
          { label: "Days" },
          { label: "Evenings" },
          { label: "Nights" },
          { label: "Rotating shifts" },
          { label: "Regular office hours" },
        ],
      },
      {
        ref: "behaviours",
        type: "matrix",
        title: "How often does your supervisor do each of these?",
        required: true,
        rows: [
          "Gives clear instructions at the start of a shift or task",
          "Is around when I need a decision or help",
          "Shares out shifts and tasks fairly",
          "Applies the rules the same way to everyone",
          "Makes sure handovers between shifts are clear",
          "Sorts out missing tools, equipment or cover",
        ],
        columns: ["Rarely", "Sometimes", "Usually", "Always"],
      },
      {
        ref: "on_job_coaching",
        type: "single_select",
        title: "How often do they show you how to do something better while you're working?",
        required: true,
        options: [
          { label: "Most shifts" },
          { label: "Now and then" },
          { label: "Only when something goes wrong" },
          { label: "Hardly ever" },
        ],
      },
      {
        ref: "when_wrong",
        type: "single_select",
        title: "When something goes wrong on a shift, what does your supervisor usually do?",
        required: true,
        options: [
          { label: "Helps put it right and explains what to do next time" },
          { label: "Fixes it themselves without explaining" },
          { label: "Looks for someone to blame" },
          { label: "Stays out of it" },
          { label: "Nothing has gone wrong while I've worked with them" },
        ],
      },

      // Blame or no support
      {
        ref: "wrong_example",
        type: "long_text",
        title: "Can you describe a recent time that happened? What would have helped instead?",
        description: "Leave out names of colleagues if you can.",
        required: false,
        maxLength: 1000,
      },

      // Everyone
      {
        ref: "raise_concern",
        type: "yes_no",
        title: "Would you feel able to tell your supervisor about a safety or workload concern?",
        required: true,
      },
      {
        ref: "keep_or_start",
        type: "long_text",
        title: "What's one thing your supervisor should start doing, or keep doing?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how would you rate the supervision on your shifts?",
        required: true,
        scale: 5,
      },
    ],
    branches: [
      { when: "when_wrong", is: "Looks for someone to blame", then: "wrong_example" },
      { when: "when_wrong", is: "Stays out of it", then: "wrong_example" },
      { when: "when_wrong", is: "Helps put it right and explains what to do next time", then: "raise_concern" },
      { when: "when_wrong", is: "Fixes it themselves without explaining", then: "raise_concern" },
      { when: "when_wrong", is: "Nothing has gone wrong while I've worked with them", then: "raise_concern" },
    ],
    ending: {
      title: "Thanks for your honesty",
      body: "Your supervisor will see combined results, never your individual answers.",
    },
    guide: {
      questionsToConsider: [
        "Is each supervisor's team large enough to share results without identifying anyone?",
        "Who sees the individual answers, and have you told respondents that plainly?",
        "Which parts of a shift matter most in your setting, such as safety briefings, stock checks or patient handovers?",
        "How will supervisors receive their results, and who helps them act on it?",
      ],
      howToUseResponses:
        "Group the answers by supervisor and shift, and share combined results only where at least three people answered. The grid shows patterns, such as clear instructions but messy handovers, which is a concrete thing to coach. Read the examples of blame or absence yourself before anything is shared, and treat any 'no' on raising a safety concern as urgent, since those can need HR or a safety lead rather than coaching. Agree one or two changes with each supervisor and repeat the survey in six months.",
      customizeSteps: [
        "Change the shift options and the rows in the grid to match how your sites actually run.",
        "Replace the name question with a dropdown of supervisors if you want consistent spelling in the results.",
        "Send it to each team at the same time, state who will see what, and close it after one or two weeks.",
      ],
      faqs: [
        {
          q: "What questions should a supervisor evaluation include?",
          a: "How clearly they give instructions, whether they are around when needed, how fairly they share out shifts, how they handle mistakes and whether people feel able to raise a concern. An open question on what to start or keep doing makes it actionable.",
        },
        {
          q: "Should supervisor evaluations be anonymous?",
          a: "Yes, as far as possible. People rarely criticise the person who sets their shifts by name, so share only combined results and tell respondents who can see what.",
        },
        {
          q: "How is this different from a manager effectiveness survey?",
          a: "It focuses on the shift itself, such as instructions, handovers, fair rotas and what happens when something goes wrong, rather than one-to-ones or career development. That suits frontline and shift-based teams.",
        },
        {
          q: "Can I send it to several teams at once?",
          a: "Yes. Share one link with every team; each response records the supervisor's name, and you can export them to CSV to compare supervisors and shifts.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "demographic-survey-questionnaire",
    type: "survey",
    category: "other",
    goals: ["conduct-research"],
    roles: ["product-research", "marketing", "education"],
    searchName: "Demographic survey questionnaire",
    title: "Demographic questionnaire",
    icon: "Users",
    metaDescription:
      "Collect respondent background for research: age, gender, location, education, work and household, with a prefer-not-to-say option and consent asked up front.",
    description: "Background questions for research, with consent first and a way to skip anything personal.",
    blurb:
      "A set of respectful demographic questions to add to research or use on its own, with consent asked first and a 'prefer not to say' on every sensitive question. Anyone under 18 is stopped at the age question and let go kindly, so you don't collect data you shouldn't from minors.",
    tags: ["demographic survey", "demographic questions", "research questionnaire", "respondent profile", "audience research"],
    greeting: "A few questions about you. They help us understand who took part, and you can skip anything you'd rather not share.",
    questions: [
      {
        ref: "consent",
        type: "legal_consent",
        title: "How we'll use your answers",
        required: true,
        consentText:
          "I agree that my answers can be used for this research. They will be reported only in combined form, never linked to my name, and I can skip any question I prefer not to answer.",
      },
      {
        ref: "age_range",
        type: "single_select",
        title: "How old are you?",
        required: true,
        options: [
          { label: "Under 18" },
          { label: "18 to 24" },
          { label: "25 to 34" },
          { label: "35 to 44" },
          { label: "45 to 54" },
          { label: "55 to 64" },
          { label: "65 or older" },
          { label: "Prefer not to say" },
        ],
      },
      {
        ref: "gender",
        type: "single_select",
        title: "How do you describe your gender?",
        required: false,
        allowOther: true,
        options: [
          { label: "Woman" },
          { label: "Man" },
          { label: "Non-binary" },
          { label: "Prefer not to say" },
        ],
      },
      {
        ref: "country",
        type: "short_text",
        title: "Which country do you live in?",
        required: false,
        maxLength: 80,
      },
      {
        ref: "area_type",
        type: "single_select",
        title: "Which best describes where you live?",
        required: false,
        options: [
          { label: "A city" },
          { label: "A town or suburb" },
          { label: "A village or rural area" },
          { label: "Prefer not to say" },
        ],
      },
      {
        ref: "education",
        type: "single_select",
        title: "What's the highest level of education you've completed?",
        required: false,
        options: [
          { label: "Secondary school or less" },
          { label: "Vocational or trade qualification" },
          { label: "Some university or college" },
          { label: "Undergraduate degree" },
          { label: "Postgraduate degree" },
          { label: "Prefer not to say" },
        ],
      },
      {
        ref: "employment",
        type: "single_select",
        title: "Which best describes your current situation?",
        required: false,
        allowOther: true,
        options: [
          { label: "Employed full time" },
          { label: "Employed part time" },
          { label: "Self-employed" },
          { label: "Looking for work" },
          { label: "Student" },
          { label: "Retired" },
          { label: "Caring for family full time" },
          { label: "Prefer not to say" },
        ],
      },
      {
        ref: "household_size",
        type: "number",
        title: "How many people live in your household, including you?",
        required: false,
        min: 1,
        max: 20,
        integerOnly: true,
      },
      {
        ref: "finances",
        type: "single_select",
        title: "Which best describes your household's finances at the moment?",
        required: false,
        options: [
          { label: "Living comfortably" },
          { label: "Doing all right" },
          { label: "Just about getting by" },
          { label: "Finding it difficult" },
          { label: "Prefer not to say" },
        ],
      },
      {
        ref: "home_language",
        type: "short_text",
        title: "Which language do you mainly speak at home?",
        required: false,
        maxLength: 60,
      },
      {
        ref: "health_condition",
        type: "single_select",
        title: "Do you have a disability or long-term health condition that affects your daily life?",
        required: false,
        options: [{ label: "Yes" }, { label: "No" }, { label: "Prefer not to say" }],
      },
    ],
    branches: [{ when: "age_range", is: "Under 18", then: "end_under_18" }],
    ending: {
      title: "Thank you for taking part",
      body: "Your answers help us understand who we heard from, and they'll only ever be reported as combined totals.",
    },
    endings: [
      {
        ref: "end_under_18",
        title: "Thanks for your interest",
        body: "This research is only open to people aged 18 or over, so we won't ask you anything more. Nothing else you've shared will be used.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Which of these characteristics do you actually need to compare groups or check who you reached, and which can you delete?",
        "Do the age bands and education levels match the ones in any data you plan to compare against?",
        "Is your research open to under-18s, and if so, what extra consent do you need?",
        "Who will see individual answers, and how long will you keep them?",
      ],
      howToUseResponses:
        "Use the answers to check who you actually heard from against who you meant to reach: if most responses came from one age group or from cities, say so when you report findings. Compare the main research answers across groups only where each group has enough people to be meaningful, and report combined figures rather than anything that could identify a person. Count 'prefer not to say' as its own group rather than dropping it.",
      customizeSteps: [
        "Delete every question your research doesn't need; fewer personal questions means more people finish.",
        "Match the age bands, education levels and regions to the categories used in any data you'll compare with.",
        "Copy these questions into the end of your main survey or share this form on its own, and state in the consent text who will see the answers.",
      ],
      faqs: [
        {
          q: "What are demographic survey questions?",
          a: "Questions about a respondent's background, such as age, gender, location, education, work and household. They help you describe who took part and compare answers between groups.",
        },
        {
          q: "Where should demographic questions go in a survey?",
          a: "Usually at the end, once people have answered the main questions, so personal questions don't put them off early. Screening questions such as age can go first when they decide who may take part.",
        },
        {
          q: "Should demographic questions be optional?",
          a: "Yes, for anything sensitive. Every personal question here is optional or offers 'prefer not to say', which keeps people answering instead of abandoning the survey.",
        },
        {
          q: "How should I ask about gender in a survey?",
          a: "Offer a few common options, a way to describe it in their own words and a 'prefer not to say'. Only ask if you need it for your research.",
        },
      ],
    },
  }),
];
