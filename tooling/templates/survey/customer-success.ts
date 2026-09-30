import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_CUSTOMER_SUCCESS: TemplateSeed[] = [
  defineTemplate({
    slug: "nps-survey",
    type: "survey",
    category: "customer-success",
    goals: ["collect-feedback"],
    roles: ["customer-success", "product-research", "marketing"],
    searchName: "NPS survey",
    title: "NPS survey",
    icon: "Gauge",
    metaDescription:
      "A Net Promoter Score survey that asks detractors, passives and promoters different follow-ups, so every score arrives with a reason your team can act on.",
    description: "Measure loyalty, then ask detractors, passives and promoters different things.",
    blurb:
      "The score on its own tells you almost nothing you can act on, and one follow-up cannot serve every part of the scale. A 3 is asked what went wrong and whether they are thinking of leaving, a 7 is asked what would make it a 9, and a 10 is asked what to quote, so one survey produces a fix list, a wish list and a testimonial list.",
    tags: ["nps survey", "net promoter score", "customer loyalty", "recommendation score", "branching"],
    greeting: "One quick question, plus a follow-up. It takes about a minute.",
    questions: [
      { ref: "score", type: "nps", title: "How likely are you to recommend us to a friend or colleague?", required: true },

      // 7–8: passives, reached by falling through
      {
        ref: "passive_gap",
        type: "long_text",
        title: "What would it take for you to give us a 9 or a 10?",
        required: true,
        maxLength: 800,
      },

      // 0–6: detractors
      {
        ref: "went_wrong",
        type: "long_text",
        title: "What's gone wrong?",
        description: "Be blunt. The people who can fix it read these.",
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
        allowOther: true,
      },
      {
        ref: "at_risk",
        type: "yes_no",
        title: "Are you thinking about leaving?",
        required: false,
        yesLabel: "Honestly, yes",
        noLabel: "Not right now",
      },

      // 9–10: promoters
      {
        ref: "what_works",
        type: "long_text",
        title: "What do you like most about working with us?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "quote_ok",
        type: "yes_no",
        title: "May we quote that publicly?",
        description: "We would use your words without your name unless you tell us otherwise.",
        required: false,
        yesLabel: "Yes, go ahead",
        noLabel: "Please don't",
      },
      {
        ref: "improvement",
        type: "long_text",
        title: "Is there one thing we could still do better?",
        required: false,
        maxLength: 800,
      },

      // everyone
      {
        ref: "follow_up_ok",
        type: "yes_no",
        title: "Would it be alright if someone followed up about your answer?",
        required: false,
        yesLabel: "Sure",
        noLabel: "No thanks",
      },
      { ref: "email", type: "email", title: "Where should we reach you?", required: true },
    ],
    branches: [
      { when: "score", op: "lte", is: 6, then: "went_wrong" },
      { when: "score", op: "gte", is: 9, then: "what_works" },
      { when: "passive_gap", always: true, then: "follow_up_ok" },
      { when: "at_risk", always: true, then: "follow_up_ok" },
      { when: "follow_up_ok", is: false, then: "end_thanks" },
      { when: "email", always: true, then: "end_follow_up" },
    ],
    ending: { title: "Thank you 💛", body: "Your answer goes straight to the team deciding what to improve next." },
    endings: [
      {
        ref: "end_follow_up",
        title: "Thanks, we'll be in touch",
        body: "Someone who can act on your answer will email you within a few working days.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Is this a relationship survey sent on a schedule, or a check after a specific moment like renewal or a support case?",
        "Who owns the follow-up with detractors, and how quickly should they reply?",
        "Where will promoter quotes be published, and does the quote question say so?",
        "Do you want to know which customer answered, or should the survey stay anonymous?",
      ],
      howToUseResponses:
        "Work out the score the standard way: the share of 9s and 10s minus the share of 0s to 6s, with the 7s and 8s counted in the total. Then read the written answers by group. The detractor answers, sorted by trouble area, are your fix list, and anyone who said they are thinking of leaving and agreed to a follow-up should hear from a person within days. The passive answers tell you what separates good from great, and the approved promoter quotes can go on your site.",
      customizeSteps: [
        "Replace \"us\" in the first question with your company or product name so people know exactly what they are scoring.",
        "Edit the trouble areas so they match the parts of your business a detractor could be unhappy with.",
        "Share the link after a meaningful moment, such as a month after signup or right after renewal, and keep the timing the same each round so scores compare fairly.",
      ],
      faqs: [
        {
          q: "How do you calculate a Net Promoter Score?",
          a: "Subtract the percentage of detractors (0 to 6) from the percentage of promoters (9 and 10). Passives (7 and 8) count toward the total number of responses but not toward either group.",
        },
        {
          q: "What should you ask after the NPS question?",
          a: "Ask why, and ask it differently for each group. Detractors can tell you what is broken, passives what would win them over, and promoters what they would say about you publicly.",
        },
        {
          q: "How often should I send an NPS survey?",
          a: "Most teams send a relationship survey once or twice a year to each customer, or after key moments like onboarding and renewal. Keep the timing consistent so you compare like with like.",
        },
        {
          q: "Is NPS the same as customer satisfaction?",
          a: "No. NPS asks whether someone would recommend you, which reflects the whole relationship. A satisfaction question asks how happy they were with one product, service or interaction.",
        },
        {
          q: "Can I use this NPS survey for free?",
          a: "Yes. Use this template copies it into your account, where you can edit every question and the branching, then share it by link or embed it on your site.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-development-survey",
    type: "survey",
    category: "customer-success",
    goals: ["conduct-research"],
    roles: ["product-research", "customer-success"],
    searchName: "Customer development survey",
    title: "Customer development",
    icon: "Search",
    metaDescription:
      "Learn how people handle a problem today before you pitch a fix. Asks about the last time it happened, their workarounds, time lost and whether they would talk.",
    description: "Understand a problem through people's real behaviour, before you build anything.",
    blurb:
      "Built around what people have actually done, not what they say they would buy. It asks about the last time the problem came up, what they use now and how many hours it eats, then screens out anyone who never faces it. Only people who have tried to fix it are asked what failed, and anyone willing to talk is asked for an email.",
    tags: ["customer development", "problem interview", "customer discovery", "startup research", "product validation"],
    greeting: "We're trying to understand how people plan staff shifts today. No sales pitch, just a few questions.",
    questions: [
      {
        ref: "role",
        type: "single_select",
        title: "Which of these describes you best?",
        required: true,
        options: [
          { label: "I own or run the business" },
          { label: "I manage a team" },
          { label: "I'm on a team that gets scheduled" },
        ],
        allowOther: true,
      },
      {
        ref: "last_time",
        type: "single_select",
        title: "When did you last have to plan staff shifts?",
        required: true,
        options: [
          { label: "This week" },
          { label: "This month" },
          { label: "A few months ago" },
          { label: "I never do this" },
        ],
      },
      {
        ref: "last_story",
        type: "long_text",
        title: "Walk us through that last time. What did you do, step by step?",
        description: "The small details are the useful part.",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "current_tools",
        type: "multi_select",
        title: "What do you use for it today?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "A spreadsheet" },
          { label: "Paper or a whiteboard" },
          { label: "Messages in a group chat" },
          { label: "Scheduling software" },
          { label: "Someone else handles it" },
        ],
        allowOther: true,
      },
      {
        ref: "hours",
        type: "number",
        title: "Roughly how many hours a week does it take, including fixing changes?",
        required: false,
        min: 0,
        max: 80,
      },
      {
        ref: "hardest",
        type: "long_text",
        title: "What's the most frustrating part of it?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "pain",
        type: "opinion_scale",
        title: "How much of a problem is this for you right now?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "I barely notice it",
        labelHigh: "It costs us every week",
      },
      {
        ref: "tried_fix",
        type: "yes_no",
        title: "Have you tried or paid for anything to fix it?",
        required: true,
      },
      {
        ref: "tried_what",
        type: "long_text",
        title: "What did you try, and why didn't it stick?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "interview",
        type: "yes_no",
        title: "Would you be up for a 20-minute call to talk it through?",
        required: true,
        yesLabel: "Happy to",
        noLabel: "Not this time",
      },
      { ref: "email", type: "email", title: "What's the best email to arrange it?", required: true },
    ],
    branches: [
      { when: "last_time", is: "I never do this", then: "end_not_fit" },
      { when: "tried_fix", is: false, then: "interview" },
      { when: "interview", is: false, then: "end_thanks" },
      { when: "email", always: true, then: "end_call" },
    ],
    ending: { title: "Thank you", body: "Your story is exactly what we needed. We read every answer ourselves." },
    endings: [
      {
        ref: "end_not_fit",
        title: "Thanks for stopping by",
        body: "This one is for people who plan shifts, so we won't take more of your time.",
      },
      {
        ref: "end_call",
        title: "Thanks, talk soon 👋",
        body: "We'll email you a couple of times to choose from. No slides, just questions.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What decision will this research inform: whether to build, who to build for, or what to build first?",
        "Who has the problem often enough to describe it in detail, and where will you find them?",
        "Which answer would tell you the problem is not worth solving?",
        "How many follow-up calls can you realistically hold in the next two weeks?",
      ],
      howToUseResponses:
        "Sort answers by how recently the problem happened and how painful people rated it. Someone who planned shifts this week, spends hours on it and has already tried to fix it is your strongest signal, and they should be first on your call list. Read the step-by-step stories side by side and note the workarounds that keep appearing. A pattern of spreadsheets plus group chats says more about the gap than any feature request.",
      customizeSteps: [
        "Replace \"plan staff shifts\" in the greeting and questions with the problem you are researching, and rewrite the tool options to match how people handle it today.",
        "Keep your idea out of the survey. Asking about past behaviour first stops people from being polite about a product they have not seen.",
        "Share the link in the communities where your target users already talk, and book calls with the most detailed respondents while their answers are fresh.",
      ],
      faqs: [
        {
          q: "What is a customer development survey?",
          a: "It is a short set of questions about a problem people already have: how often it happens, how they deal with it now and what it costs them. It comes before any pitch, so the answers are about behaviour, not opinions of your idea.",
        },
        {
          q: "What questions should I ask in customer development?",
          a: "Ask about the last time the problem happened, what they did, what they use today and what they have already tried. Avoid asking whether they would buy something, because people say yes to be kind.",
        },
        {
          q: "Is a survey enough for customer development?",
          a: "It is a good filter, not a replacement for conversations. Use it to find the people with the sharpest version of the problem, then talk to them.",
        },
        {
          q: "Why screen out people who never face the problem?",
          a: "Their answers would be guesses. This template ends the survey politely for them, so your results only contain real experience.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-loyalty-survey",
    type: "survey",
    category: "customer-success",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["customer-success", "marketing"],
    searchName: "Customer loyalty survey",
    title: "Customer loyalty",
    icon: "HeartHandshake",
    metaDescription:
      "Find out why customers stay, what would make them switch and whether they're shopping around. Customers wavering on a return get their own follow-up question.",
    description: "Learn what keeps customers coming back and what could pull them away.",
    blurb:
      "Satisfied customers still leave, so this survey asks about the relationship rather than one visit: why people come back, how much they trust you and what would make them switch. Anyone unlikely to return is asked why straight away instead of being asked what keeps them, and only customers who have looked at alternatives are asked what they found.",
    tags: ["customer loyalty", "retention survey", "repeat customers", "switching risk", "branching"],
    greeting: "You've stuck with us, and we'd love to know why. A few quick questions.",
    questions: [
      {
        ref: "tenure",
        type: "single_select",
        title: "How long have you been a customer?",
        required: true,
        options: [
          { label: "Less than 6 months" },
          { label: "6 to 12 months" },
          { label: "1 to 3 years" },
          { label: "More than 3 years" },
        ],
      },
      {
        ref: "return_likely",
        type: "opinion_scale",
        title: "How likely are you to buy from us again?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Very unlikely",
        labelHigh: "Very likely",
      },
      {
        ref: "low_reason",
        type: "long_text",
        title: "What's making you less likely to come back?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "why_stay",
        type: "multi_select",
        title: "What keeps you choosing us?",
        required: true,
        minSelections: 1,
        maxSelections: 3,
        description: "Pick up to three.",
        options: [
          { label: "Quality of what we sell" },
          { label: "Fair prices" },
          { label: "Friendly, helpful service" },
          { label: "It's convenient" },
          { label: "I trust you to get it right" },
          { label: "Honestly, habit" },
        ],
        allowOther: true,
      },
      {
        ref: "trust",
        type: "rating",
        title: "How much do you trust us to get things right when something goes wrong?",
        required: true,
        scale: 5,
      },
      {
        ref: "shopped_around",
        type: "yes_no",
        title: "Have you looked at other options in the last six months?",
        required: true,
      },
      {
        ref: "alternatives",
        type: "long_text",
        title: "What made you look, and what did you find?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "switch_trigger",
        type: "single_select",
        title: "What would be most likely to make you switch?",
        required: true,
        options: [
          { label: "A price increase" },
          { label: "A drop in quality" },
          { label: "Poor service when something goes wrong" },
          { label: "A competitor with a better offer" },
          { label: "Nothing I can think of" },
        ],
      },
      { ref: "recommend", type: "nps", title: "How likely are you to recommend us to a friend?", required: true },
      {
        ref: "one_thing",
        type: "long_text",
        title: "What's one thing we could do to earn your next purchase?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "return_likely", op: "gte", is: 3, then: "why_stay" },
      { when: "low_reason", always: true, then: "trust" },
      { when: "shopped_around", is: false, then: "switch_trigger" },
    ],
    ending: { title: "Thanks for being straight with us 🙌", body: "We'll use your answers to keep doing what you value and fix what you don't." },
    guide: {
      questionsToConsider: [
        "Do you want to survey every customer, or only people who have bought at least twice?",
        "Which reasons for staying are you trying to protect, and are they in the options?",
        "What will you do for a customer who says they are unlikely to come back?",
        "Should answers be linked to a customer account so you can compare them with purchase history?",
      ],
      howToUseResponses:
        "Start with the customers who scored themselves unlikely to return, since their written reasons are your earliest warning. Compare the reasons for staying across tenure groups: if newer customers stay for price and older ones for service, a discount war will not keep your best customers. Watch the switch triggers too, and treat any rise in customers who have shopped around as a sign to act before renewals or repeat orders are due.",
      customizeSteps: [
        "Edit the reasons for staying so they name what your business actually competes on.",
        "Change the tenure bands to fit how often your customers buy, such as visits for a café or years for a service contract.",
        "Send it to repeat customers by email or after a second purchase, and add a customer ID as a hidden field if you want to match answers to accounts.",
      ],
      faqs: [
        {
          q: "What questions should a customer loyalty survey ask?",
          a: "Ask how likely people are to buy again, why they keep choosing you, how much they trust you, whether they have looked elsewhere and what would make them switch. A recommendation question rounds it off.",
        },
        {
          q: "What is the difference between loyalty and satisfaction?",
          a: "Satisfaction is how someone felt about a recent experience. Loyalty is whether they will keep choosing you when other options are available, which is why this survey asks about alternatives and switching.",
        },
        {
          q: "How do you measure customer loyalty?",
          a: "Combine a repeat purchase question, a recommendation score and the reasons behind both. Tracking the same questions over time shows whether loyalty is growing or slipping.",
        },
        {
          q: "Can I change the questions in this template?",
          a: "Yes. Use this template copies it into your account, where every question, option and branch can be edited before you share it.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-needs-survey",
    type: "survey",
    category: "customer-success",
    goals: ["conduct-research", "collect-feedback"],
    roles: ["product-research", "customer-success"],
    searchName: "Customer needs survey",
    title: "Customer needs",
    icon: "Target",
    metaDescription:
      "Ask customers what they're trying to get done, what gets in the way and which improvements matter most. People who feel poorly served get asked what's missing.",
    description: "Find out what customers are trying to achieve and what stands in their way.",
    blurb:
      "Starts from the customer's goal instead of your feature list, then asks what slows them down, how much each quality matters and which improvements they would rank first. Customers who say current options only partly work, or not at all, are asked what's missing before anything else.",
    tags: ["customer needs", "needs assessment", "customer research", "feature priorities", "branching"],
    greeting: "Help us understand what you need from us. It takes about three minutes.",
    questions: [
      {
        ref: "goal",
        type: "long_text",
        title: "What are you trying to get done when you come to us?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "frequency",
        type: "single_select",
        title: "How often do you need to do that?",
        required: true,
        options: [{ label: "Every day" }, { label: "Every week" }, { label: "Every month" }, { label: "Less often" }],
      },
      {
        ref: "obstacles",
        type: "multi_select",
        title: "What gets in the way most often?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "It takes too long" },
          { label: "Too many steps or tools" },
          { label: "It's hard to learn" },
          { label: "It costs too much" },
          { label: "Getting help is slow" },
          { label: "Nothing really" },
        ],
        allowOther: true,
      },
      {
        ref: "obstacle_story",
        type: "long_text",
        title: "Tell us about the last time something slowed you down.",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "importance",
        type: "matrix",
        title: "How much does each of these matter to you?",
        required: true,
        rows: ["Speed", "Ease of use", "Price", "Reliability", "Help from a real person"],
        columns: ["Not much", "Somewhat", "A lot", "It's essential"],
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Which improvements would help you most? Put the best first.",
        required: true,
        items: [
          "Faster results",
          "Simpler setup",
          "Better guides and help content",
          "More ways to get support",
          "More flexible pricing",
        ],
      },
      {
        ref: "needs_met",
        type: "single_select",
        title: "How well do the options available to you today meet your needs?",
        required: true,
        options: [{ label: "Fully" }, { label: "Mostly" }, { label: "Only partly" }, { label: "Not at all" }],
      },
      {
        ref: "missing",
        type: "long_text",
        title: "What's missing? What would a good solution do that nothing does now?",
        required: true,
        maxLength: 1200,
      },
      {
        ref: "follow_up_ok",
        type: "yes_no",
        title: "Could we contact you to hear more?",
        required: true,
        yesLabel: "Yes, that's fine",
        noLabel: "No, thanks",
      },
      { ref: "email", type: "email", title: "What email should we use?", required: true },
    ],
    branches: [
      { when: "needs_met", is: "Fully", then: "follow_up_ok" },
      { when: "needs_met", is: "Mostly", then: "follow_up_ok" },
      { when: "follow_up_ok", is: false, then: "end_thanks" },
    ],
    ending: { title: "Thank you", body: "Your answers go straight into how we plan the next few months." },
    guide: {
      questionsToConsider: [
        "Which decision are these answers meant to inform, such as a new service, a product change or better support?",
        "Are the improvements in the ranking ones you could actually deliver?",
        "Do you want to compare needs across customer types, and if so, which question tells them apart?",
        "Who will follow up with customers who agree to talk?",
      ],
      howToUseResponses:
        "Group the goals people describe in their own words before you look at anything else, because customers with different goals will rank improvements differently. Then compare the ranking with the importance grid: an improvement ranked first by people who say price is essential means something different from one ranked first by people who care most about speed. The customers who said their needs are only partly met, or not at all, wrote the most useful answers, so read every one.",
      customizeSteps: [
        "Rewrite the improvements in the ranking to the options your team is weighing up.",
        "Adjust the rows in the importance grid to the qualities your customers compare you on.",
        "Send it to a mix of new and long-standing customers, and export the answers to CSV if you want to sort them by goal.",
      ],
      faqs: [
        {
          q: "What is a customer needs survey?",
          a: "It asks customers what they are trying to achieve, what gets in their way and what would help. It is used before deciding what to build, change or offer.",
        },
        {
          q: "What should a customer needs survey include?",
          a: "A question about the customer's goal, one about obstacles, a way to weigh what matters to them and a way to prioritise improvements. An open question about what is missing catches needs you had not thought of.",
        },
        {
          q: "How do I avoid leading questions in a needs survey?",
          a: "Ask about goals and recent experiences before naming any solution, and keep options neutral. Include a choice like \"Nothing really\" so people are not pushed into complaining.",
        },
        {
          q: "How is this different from a satisfaction survey?",
          a: "A satisfaction survey looks back at how you did. A needs survey looks forward at what customers are trying to do and where the gaps are.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "help-desk-feedback-survey",
    type: "survey",
    category: "customer-success",
    goals: ["collect-feedback"],
    roles: ["customer-success", "operations"],
    searchName: "Help desk feedback survey",
    title: "Help desk feedback",
    icon: "LifeBuoy",
    metaDescription:
      "Ask users whether the help desk understood their request, explained the fix clearly and got them working again. Unresolved tickets get a chance to reopen.",
    description: "Check whether a help desk request was understood, explained and actually fixed.",
    blurb:
      "Sent after a ticket closes, it asks the question most help desk surveys skip: is the problem really fixed? Anyone who says no is asked what still isn't working and whether to reopen the ticket, before rating how well the request was understood and explained.",
    tags: ["help desk survey", "it support feedback", "ticket feedback", "service desk", "branching"],
    greeting: "Your help desk request was closed. Mind telling us how it went? It takes a minute.",
    questions: [
      {
        ref: "ticket",
        type: "short_text",
        title: "What was the ticket number, if you have it?",
        required: false,
        maxLength: 40,
      },
      {
        ref: "request_type",
        type: "dropdown",
        title: "What did you contact us about?",
        required: true,
        options: [
          { label: "Password or login" },
          { label: "Laptop, phone or other hardware" },
          { label: "Software or an app" },
          { label: "Access or permissions" },
          { label: "Email or calendar" },
          { label: "Network or Wi-Fi" },
          { label: "Something else" },
        ],
      },
      {
        ref: "resolved",
        type: "single_select",
        title: "Is the problem fixed?",
        required: true,
        options: [{ label: "Yes, fully" }, { label: "Partly" }, { label: "No, not yet" }],
      },

      // Not fixed
      {
        ref: "still_broken",
        type: "long_text",
        title: "What's still not working?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "reopen",
        type: "yes_no",
        title: "Should we reopen the ticket?",
        required: true,
        yesLabel: "Yes, please",
        noLabel: "No, I'll manage",
      },

      // Everyone
      {
        ref: "understood",
        type: "opinion_scale",
        title: "How well did we understand your request the first time you explained it?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Completely",
      },
      {
        ref: "clarity",
        type: "rating",
        title: "How clear was the explanation or next step we gave you?",
        required: true,
        scale: 5,
      },
      {
        ref: "time_to_fix",
        type: "single_select",
        title: "How long did it take from asking to having an answer?",
        required: true,
        options: [
          { label: "Under an hour" },
          { label: "Same day" },
          { label: "1 to 2 days" },
          { label: "Longer than 2 days" },
        ],
      },
      {
        ref: "work_blocked",
        type: "yes_no",
        title: "Were you unable to work while you waited?",
        required: true,
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how satisfied are you with the help you got?",
        required: true,
        scale: 5,
      },
      {
        ref: "comments",
        type: "long_text",
        title: "Anything that would have made this easier?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "resolved", is: "Yes, fully", then: "understood" },
      { when: "resolved", is: "Partly", then: "understood" },
    ],
    ending: { title: "Thanks for the feedback", body: "If you asked us to reopen your ticket, someone will pick it up today." },
    guide: {
      questionsToConsider: [
        "Will you send this after every closed ticket, or to a sample so people are not over-surveyed?",
        "Do the request types in the dropdown match the categories your ticketing system uses?",
        "Who watches for reopen requests, and how fast should they act?",
        "Do you want answers tied to a ticket number, or kept anonymous?",
      ],
      howToUseResponses:
        "Check reopen requests first, every day, because they are live problems. Then look at resolution by request type: if access requests are often only partly fixed, the process behind them needs work, not the person who answered. Low scores for understanding the request usually point to a vague intake form, and low clarity scores point to missing how-to articles. Compare time to fix with whether people could work while they waited to see which delays really hurt.",
      customizeSteps: [
        "Edit the request types to match your help desk categories, so you can compare results by category.",
        "Add the ticket number as a hidden field in the link your system sends, and remove the ticket question.",
        "Send the link automatically when a ticket closes, while the experience is still fresh.",
      ],
      faqs: [
        {
          q: "What questions should a help desk survey ask?",
          a: "Ask whether the issue is fixed, how well the request was understood, how clear the explanation was and how long it took. One open question for anything else is enough.",
        },
        {
          q: "When should I send a help desk feedback survey?",
          a: "Straight after the ticket closes. A day later, people remember the wait more than the help.",
        },
        {
          q: "Why ask whether the problem is fixed if the ticket is closed?",
          a: "Tickets are often closed before the user agrees the problem is gone. This question catches those cases and lets the person ask for the ticket to be reopened.",
        },
        {
          q: "Can I send this survey from my ticket system?",
          a: "Yes. Put the survey link in the email your ticket system sends when a ticket closes, or embed the survey on an intranet page.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "hotel-feedback-survey",
    type: "survey",
    category: "customer-success",
    goals: ["collect-feedback"],
    roles: ["operations", "customer-success"],
    searchName: "Hotel feedback survey",
    title: "Hotel guest feedback",
    icon: "Hotel",
    metaDescription:
      "Ask guests about the room, the staff, the facilities and anything that went wrong. Guests who want a reply are routed to the manager with their email.",
    description: "Hear how a stay really went, from check-in to anything that went wrong.",
    blurb:
      "Covers each part of a stay in one grid, then asks the question that matters most to a hotel manager: did anything go wrong, and did the team fix it? Guests with no problems skip straight past it, and anyone who wants the manager to reply leaves an email and gets a different sign-off.",
    tags: ["hotel feedback", "guest survey", "hospitality", "post-stay survey", "branching"],
    greeting: "Thanks for staying with us. How was it? A few questions, about two minutes.",
    questions: [
      { ref: "checkout", type: "date", title: "When did you check out?", required: false },
      {
        ref: "purpose",
        type: "single_select",
        title: "What brought you here?",
        required: true,
        options: [{ label: "Work" }, { label: "A holiday or break" }, { label: "A wedding or event" }, { label: "Passing through" }],
      },
      { ref: "overall", type: "rating", title: "How was your stay overall?", required: true, scale: 5 },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each part of your stay?",
        required: true,
        rows: ["Check-in", "Room cleanliness", "Bed and a good night's sleep", "Staff friendliness", "Breakfast", "Wi-Fi"],
        columns: ["Poor", "Fair", "Good", "Excellent", "Didn't use"],
      },
      {
        ref: "facilities",
        type: "multi_select",
        title: "Which facilities did you use?",
        required: false,
        minSelections: 0,
        maxSelections: 8,
        options: [
          { label: "Restaurant" },
          { label: "Bar" },
          { label: "Pool" },
          { label: "Gym" },
          { label: "Spa" },
          { label: "Room service" },
          { label: "Parking" },
          { label: "None of these" },
        ],
      },
      {
        ref: "had_issue",
        type: "yes_no",
        title: "Did anything go wrong during your stay?",
        required: true,
      },

      // Something went wrong
      {
        ref: "issue_detail",
        type: "long_text",
        title: "What happened?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "issue_fixed",
        type: "single_select",
        title: "Did our team sort it out?",
        required: true,
        options: [
          { label: "Yes, quickly" },
          { label: "Yes, but it took a while" },
          { label: "No" },
          { label: "I didn't mention it" },
        ],
      },

      // Everyone
      { ref: "recommend", type: "nps", title: "How likely are you to recommend us to friends or family?", required: true },
      {
        ref: "keep",
        type: "long_text",
        title: "What's one thing we should never change?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "manager_reply",
        type: "yes_no",
        title: "Would you like the manager to reply to you personally?",
        required: true,
        yesLabel: "Yes, please",
        noLabel: "No need",
      },
      { ref: "email", type: "email", title: "What email should the manager use?", required: true },
    ],
    branches: [
      { when: "had_issue", is: false, then: "recommend" },
      { when: "manager_reply", is: false, then: "end_thanks" },
      { when: "email", always: true, then: "end_manager" },
    ],
    ending: { title: "Thank you, we hope to see you again 🏨", body: "Every answer is read by the team who looked after you." },
    endings: [
      {
        ref: "end_manager",
        title: "Thank you, the manager will be in touch",
        body: "Expect an email within two days. If it's urgent, call the front desk.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Which parts of a stay do you want rated separately, and does the grid list them?",
        "Which facilities do you actually offer? Remove the ones you don't.",
        "Who replies to guests who ask for the manager, and within how long?",
        "Will you send this at checkout, or by email the day after?",
      ],
      howToUseResponses:
        "Reply to every guest who asked for the manager first, especially those who had a problem that wasn't fixed. Then look at problems by whether the team sorted them out: issues fixed quickly often still earn a good score, while ones nobody heard about point to guests who didn't feel able to speak up. Read the grid by department and share each row with the team that owns it, along with the things guests said you should never change.",
      customizeSteps: [
        "Edit the rows in the grid and the facilities list so they match your property.",
        "Add your hotel's name to the greeting and the recommendation question.",
        "Send the link in the post-stay email, or show a QR code at checkout so guests can answer before they leave.",
      ],
      faqs: [
        {
          q: "What questions should a hotel feedback survey ask?",
          a: "Ask about the stay overall, then the room, sleep, staff, breakfast and facilities, and whether anything went wrong. A recommendation question and an open comment round it off.",
        },
        {
          q: "When should I send a hotel guest survey?",
          a: "On the day of checkout or the day after. Guests remember the details, and anyone with a complaint can still be reached before they write a public review.",
        },
        {
          q: "How do I follow up on a bad hotel review from a survey?",
          a: "Reply personally and quickly, name the problem, say what you have changed and offer something where it fits. This survey asks guests whether they want a reply, so you know who expects one.",
        },
        {
          q: "Can I put this survey on a QR code in rooms?",
          a: "Yes. Share it as a link, which can go on a QR code, or embed it on your website.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "service-evaluation-survey",
    type: "survey",
    category: "customer-success",
    goals: ["collect-feedback"],
    roles: ["operations", "customer-success", "freelancers-agencies"],
    searchName: "Service evaluation survey",
    title: "Service evaluation",
    icon: "ClipboardCheck",
    metaDescription:
      "Judge a service against the job it was meant to do. Rates delivery, quality and usefulness, then asks what went well or where it went wrong, based on the answer.",
    description: "Evaluate a service against the job it was hired to do.",
    blurb:
      "Asks what the client needed the service to do before asking how it went, so every rating has something to be measured against. If the service did the job, it asks which step worked best; if it only partly did, it asks where things went wrong and how much that mattered.",
    tags: ["service evaluation", "service quality", "client survey", "delivery review", "branching"],
    greeting: "We'd like to know how well our service did its job for you. About two minutes.",
    questions: [
      { ref: "service", type: "short_text", title: "Which service are you evaluating?", required: true, maxLength: 120 },
      {
        ref: "job",
        type: "long_text",
        title: "What did you need this service to do for you?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How did we do on each of these?",
        required: true,
        rows: ["Delivered on time", "Matched what was agreed", "Quality of the work", "Keeping you updated", "Value for what it cost"],
        columns: ["Poor", "Fair", "Good", "Excellent"],
      },
      {
        ref: "usefulness",
        type: "opinion_scale",
        title: "How useful has the result been since?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not useful",
        labelHigh: "Very useful",
      },
      {
        ref: "did_job",
        type: "single_select",
        title: "Did the service do the job you needed?",
        required: true,
        options: [{ label: "Yes, completely" }, { label: "Mostly" }, { label: "Only partly" }, { label: "Not at all" }],
      },

      // It worked
      {
        ref: "went_well",
        type: "long_text",
        title: "Which part or step worked best for you?",
        required: false,
        maxLength: 800,
      },

      // It fell short
      {
        ref: "went_wrong",
        type: "long_text",
        title: "Where did things go wrong or slow down?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "impact",
        type: "single_select",
        title: "How much did that affect you?",
        required: true,
        options: [
          { label: "A little, easy to work around" },
          { label: "Noticeably, it cost us time" },
          { label: "Seriously, we missed something important" },
        ],
      },

      // Everyone
      { ref: "use_again", type: "yes_no", title: "Would you use this service again?", required: true },
      {
        ref: "suggestions",
        type: "long_text",
        title: "What should we change before the next client?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "did_job", is: "Yes, completely", then: "went_well" },
      { when: "did_job", is: "Mostly", then: "went_well" },
      { when: "did_job", is: "Only partly", then: "went_wrong" },
      { when: "did_job", is: "Not at all", then: "went_wrong" },
      { when: "went_well", always: true, then: "use_again" },
    ],
    ending: { title: "Thanks for the honest review", body: "We'll go through it as a team and let you know what changes." },
    guide: {
      questionsToConsider: [
        "Is this for one service or several? If several, should the first question be a dropdown instead of a text box?",
        "Which parts of delivery matter most to your clients, and are they rows in the grid?",
        "How long after delivery can people judge whether the result was useful?",
        "Who reviews answers where the service did not do the job?",
      ],
      howToUseResponses:
        "Read the job each client described next to their answer about whether the service did it. That pairing shows where your service fits well and where clients hire you for something you don't really deliver. Group the problem answers by impact and fix the serious ones first. Across many responses, the grid shows which part of delivery is slipping, and the steps that worked best are worth writing into your process so they happen every time.",
      customizeSteps: [
        "Swap the service question for a dropdown of your services if you offer a fixed list.",
        "Edit the grid rows to the promises you make in your proposals, such as turnaround time or number of revisions.",
        "Send the link a week or two after delivery, once the client has had time to use the result.",
      ],
      faqs: [
        {
          q: "What is a service evaluation survey?",
          a: "It measures how well a service did the job a client needed, looking at delivery, quality, usefulness and value. It is usually sent once the work is done.",
        },
        {
          q: "What questions should I ask to evaluate a service?",
          a: "Ask what the client needed, whether the service delivered it, how each part of delivery went and whether they would use it again. Ask what worked or what went wrong depending on their answer.",
        },
        {
          q: "How is service evaluation different from customer satisfaction?",
          a: "Satisfaction is how someone felt. An evaluation checks the service against a goal, so it tells you whether the service worked, not only whether the client was pleased.",
        },
        {
          q: "Can I use this for internal services?",
          a: "Yes. Change the wording from client to colleague and it works for internal teams like facilities, finance or IT.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "software-customer-satisfaction-survey",
    type: "survey",
    category: "customer-success",
    goals: ["collect-feedback"],
    roles: ["product-research", "customer-success"],
    searchName: "Software customer satisfaction survey",
    title: "Software satisfaction",
    icon: "Laptop",
    metaDescription:
      "Ask users how satisfied they are with your software, which parts work well, what's missing and whether bugs got in the way. Unhappy users say why first.",
    description: "Measure how users feel about your software, and catch bugs and gaps along the way.",
    blurb:
      "Built for software teams: a satisfaction score, a grid for ease of use, speed, features, docs and support, and a ranking of what users value most. Unhappy users are asked why before anything else, and only people who hit a bug are asked to describe it and attach a screenshot.",
    tags: ["software satisfaction survey", "saas csat", "user feedback", "product survey", "bug report", "branching"],
    greeting: "Help us make the software better for you. About three minutes.",
    questions: [
      {
        ref: "usage_length",
        type: "single_select",
        title: "How long have you been using our software?",
        required: true,
        options: [
          { label: "Less than a month" },
          { label: "1 to 6 months" },
          { label: "6 to 12 months" },
          { label: "More than a year" },
        ],
      },
      {
        ref: "usage_frequency",
        type: "single_select",
        title: "How often do you use it?",
        required: true,
        options: [{ label: "Every day" }, { label: "A few times a week" }, { label: "A few times a month" }, { label: "Rarely" }],
      },
      { ref: "csat", type: "rating", title: "Overall, how satisfied are you with the software?", required: true, scale: 5 },
      {
        ref: "low_reason",
        type: "long_text",
        title: "Sorry it's not working for you. What's the main problem?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each of these?",
        required: true,
        rows: ["Ease of use", "Speed and reliability", "Has the features I need", "Help docs", "Support team"],
        columns: ["Poor", "Fair", "Good", "Excellent"],
      },
      {
        ref: "values",
        type: "ranking",
        title: "What matters most to you? Put the most important first.",
        required: true,
        items: ["Saves me time", "Easy to learn", "Works reliably", "Fits how my team works", "Good support"],
      },
      {
        ref: "missing",
        type: "long_text",
        title: "Is there something you expected it to do that it doesn't?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "hit_bug",
        type: "yes_no",
        title: "Have you run into a bug or error in the last month?",
        required: true,
      },
      {
        ref: "bug_detail",
        type: "long_text",
        title: "What happened, and where in the app were you?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "bug_screenshot",
        type: "file_upload",
        title: "Got a screenshot? Drop it here.",
        required: false,
        accept: ["image/*"],
        maxFiles: 3,
        maxSizeMB: 10,
      },
      { ref: "recommend", type: "nps", title: "How likely are you to recommend the software to a colleague?", required: true },
      { ref: "email", type: "email", title: "Your email, if you're happy for us to follow up", required: false },
    ],
    branches: [
      { when: "csat", op: "gte", is: 3, then: "aspects" },
      { when: "hit_bug", is: false, then: "recommend" },
    ],
    ending: { title: "Thank you 🙏", body: "Your answers go to the product and support teams this week." },
    guide: {
      questionsToConsider: [
        "Do you want answers from every user, or from admins and power users only?",
        "Which parts of the product should the grid rate separately?",
        "Who picks up bug reports that arrive through the survey, and how?",
        "Should you ask this in the app, by email, or both?",
      ],
      howToUseResponses:
        "Pass bug reports with screenshots to whoever handles support the same day, and reply to anyone who left an email. Split the satisfaction score by how long people have used the software: low scores from new users usually point to onboarding, while low scores from long-time users point to missing features or reliability. Compare the ranking with the grid, because a low rating on the thing users value most is the gap to fix first.",
      customizeSteps: [
        "Replace \"our software\" with your product's name, and edit the grid rows to match its main areas.",
        "Add the user's plan or account ID as a hidden field so you can compare answers by customer type.",
        "Send it to active users after they have used the product for a few weeks, and repeat it every quarter with the same questions.",
      ],
      faqs: [
        {
          q: "What questions should a software satisfaction survey include?",
          a: "An overall satisfaction score, ratings for ease of use, reliability, features, docs and support, a question about what's missing and a recommendation score. Asking about recent bugs is useful too.",
        },
        {
          q: "What is the difference between CSAT and NPS for software?",
          a: "CSAT asks how satisfied someone is right now. NPS asks whether they would recommend the product, which reflects loyalty over time. This template asks both.",
        },
        {
          q: "How often should I survey software users?",
          a: "Quarterly works for most products. Keep the questions the same each time so you can see whether satisfaction is moving.",
        },
        {
          q: "Can users attach screenshots of bugs?",
          a: "Yes. Users who say they hit a bug can upload up to three images with their description.",
        },
      ],
    },
  }),
];
