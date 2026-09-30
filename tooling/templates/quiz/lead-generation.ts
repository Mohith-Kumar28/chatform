import { defineTemplate, type TemplateSeed } from "../define.js";

export const QUIZ_LEAD_GENERATION: TemplateSeed[] = [
  defineTemplate({
    slug: "facebook-lead-generation",
    type: "quiz",
    category: "lead-generation",
    goals: ["generate-leads", "engage-with-quizzes"],
    roles: ["marketing", "sales"],
    searchName: "Facebook lead generation quiz",
    title: "Facebook lead quiz",
    icon: "Target",
    metaDescription:
      "Turn clicks from a Facebook ad into qualified leads with a short plan-finder quiz. People who want to start this week are asked for a number to call.",
    description: "A plan-finder quiz for ad traffic that scores fit and flags who wants to start now.",
    blurb:
      "People who click an ad want the thing the ad promised, not a contact form. This quiz gives them a starting plan matched to their answers, scored on how active and experienced they already are. Anyone who says they want to start this week is asked for a phone number, so your hottest leads are easy to call first.",
    tags: ["facebook lead generation", "lead quiz", "facebook ads", "qualifying leads", "fitness coaching"],
    greeting: "You came from our ad about getting fit at home. Answer a few quick questions and we'll match you to a starting plan.",
    questions: [
      {
        ref: "goal",
        type: "single_select",
        title: "What's the main thing you want to change?",
        required: true,
        options: [
          { label: "Lose some weight" },
          { label: "Get stronger" },
          { label: "Have more energy" },
          { label: "Train for an event" },
        ],
      },
      {
        ref: "activity",
        type: "single_select",
        title: "How often do you exercise right now?",
        required: true,
        options: [
          { label: "Hardly at all", score: 0 },
          { label: "Once or twice a week", score: 1 },
          { label: "Three or four times a week", score: 2 },
          { label: "Five times or more", score: 3 },
        ],
      },
      {
        ref: "strength_experience",
        type: "single_select",
        title: "Have you done strength training before?",
        required: true,
        options: [
          { label: "Never tried it", score: 0 },
          { label: "A bit, on and off", score: 1 },
          { label: "Yes, regularly", score: 2 },
        ],
      },
      {
        ref: "session_time",
        type: "single_select",
        title: "How long could a typical workout be?",
        required: true,
        options: [
          { label: "15–20 minutes", score: 0 },
          { label: "30–45 minutes", score: 1 },
          { label: "An hour or more", score: 2 },
        ],
      },
      {
        ref: "obstacles",
        type: "multi_select",
        title: "What has got in the way before?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "Not enough time" },
          { label: "Losing motivation" },
          { label: "Not knowing what to do" },
          { label: "Injuries or pain" },
          { label: "Getting bored" },
        ],
      },
      {
        ref: "start_when",
        type: "single_select",
        title: "When would you like to get going?",
        required: true,
        options: [{ label: "This week" }, { label: "Within the next month" }, { label: "Just looking for now" }],
      },

      // Ready to start now
      {
        ref: "phone",
        type: "phone",
        title: "What's the best number for a short call with a coach?",
        description: "Ten minutes to set up your first week. You can skip this if you'd rather use email.",
        required: false,
      },

      // Everyone
      {
        ref: "contact",
        type: "contact_info",
        title: "Where should we send your plan?",
        required: true,
        fields: ["first_name", "email"],
      },
      {
        ref: "consent",
        type: "legal_consent",
        title: "Hearing from us",
        required: true,
        consentText:
          "Send me my plan and occasional emails about coaching. I can unsubscribe at any time.",
      },
    ],
    branches: [
      { when: "start_when", is: "This week", then: "phone" },
      { when: "start_when", is: "Within the next month", then: "contact" },
      { when: "start_when", is: "Just looking for now", then: "contact" },
    ],
    scoreEndings: [
      { atLeast: 5, then: "end_performance" },
      { atLeast: 2, then: "end_build" },
    ],
    endings: [
      {
        ref: "end_performance",
        title: "Your plan: Performance block 🏋️",
        body: "You already train regularly and have a base to build on, so this plan adds structure and progression: four focused sessions a week that build on each other. Your full plan is on its way to your inbox.",
      },
      {
        ref: "end_build",
        title: "Your plan: Build-up programme 💪",
        body: "You have some habits to build on. Three sessions a week mix strength and cardio, with a small step up every fortnight so it never feels like starting over. Your full plan is on its way to your inbox.",
      },
    ],
    ending: {
      title: "Your plan: Fresh start 🌱",
      body: "Short, simple home sessions you can fit into a busy day, with no equipment needed at first. The aim is to make moving a habit before making it hard. Your full plan is on its way to your inbox.",
    },
    guide: {
      questionsToConsider: [
        "What did the ad promise, and does the greeting repeat that promise in its first line?",
        "Which answers show that someone is ready to buy, and who calls them, and how fast?",
        "Do the results name real plans or packages you sell, so the follow-up feels like the next step?",
        "Should people see their result before or after giving an email, for this particular offer?",
      ],
      howToUseResponses:
        "Call everyone who chose \"This week\" and left a number first, ideally the same day, while the ad is still fresh in their mind. Sort the rest by result so each group gets a follow-up email that talks about their plan, not a generic welcome. The obstacles question is your objection list: if most people pick \"Losing motivation\", lead with accountability in your next ad and your sales calls.",
      customizeSteps: [
        "Rewrite the greeting to repeat your ad's headline, and swap the goal options for the outcomes your offer delivers.",
        "Rename the three results to your real plans or packages, and move the score bands if you add or remove scored questions.",
        "Put the quiz link in your ad or on the landing page it points to, then read new leads in the dashboard or export them to CSV.",
      ],
      faqs: [
        {
          q: "Is this the same as a Facebook lead ad form?",
          a: "No. It is a quiz you link to from your ad or landing page, so you control the questions, the branching and the result each person sees.",
        },
        {
          q: "Why use a quiz for Facebook lead generation?",
          a: "A quiz gives people something useful in return for their details, a result that matches their answers. That usually feels like a fairer trade than a plain signup form.",
        },
        {
          q: "How does the quiz decide which result to show?",
          a: "Three questions carry points for current activity, experience and available time. The total picks one of three plans, and you can move the thresholds.",
        },
        {
          q: "How do I spot the hottest leads?",
          a: "Anyone who wants to start this week is asked for a phone number. Filter by that answer in your responses and call them first.",
        },
        {
          q: "Can I use this quiz for a business that isn't fitness?",
          a: "Yes. Keep the structure of goal, current situation, timing and contact, and rewrite the questions and results for your own offer.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "multiple-choice-quiz",
    type: "quiz",
    category: "lead-generation",
    goals: ["generate-leads", "engage-with-quizzes"],
    roles: ["marketing", "education", "sales"],
    searchName: "Multiple choice quiz",
    title: "Money basics quiz",
    icon: "ListChecks",
    metaDescription:
      "A scored multiple choice quiz on everyday money: interest, inflation, risk and credit. Players who want the explained answers leave an email to get them.",
    description: "Eight multiple choice questions on money basics, scored into three results, with an explained answer sheet by email.",
    blurb:
      "Seven single-answer questions on interest, inflation and risk, plus one pick-all-that-apply round where a wrong pick costs a point, so ticking everything does not pay. The total picks one of three results. Players who want each answer explained leave their email, and a closing question on what they want to get better at tells you what to send them next.",
    tags: ["multiple choice quiz", "financial literacy quiz", "money quiz", "scored quiz", "quiz lead magnet"],
    greeting: "How well do you know your money? Eight multiple choice questions, no calculator needed.",
    questions: [
      {
        ref: "simple_interest",
        type: "single_select",
        title: "You put 100 into a savings account paying 5% interest a year. How much is there after one year, if you take nothing out?",
        required: true,
        options: [{ label: "95" }, { label: "100" }, { label: "105", score: 1 }, { label: "150" }],
      },
      {
        ref: "compound",
        type: "single_select",
        title: "What does compound interest mean?",
        required: true,
        options: [
          { label: "Interest charged only on loans" },
          { label: "Interest earned on your savings and on the interest they already earned", score: 1 },
          { label: "A fixed amount added every year" },
          { label: "Interest paid only when you close the account" },
        ],
      },
      {
        ref: "inflation",
        type: "single_select",
        title: "Your savings earn 1% a year and prices rise 3% a year. After a year, what can your money buy?",
        required: true,
        options: [
          { label: "More than today" },
          { label: "Exactly the same as today" },
          { label: "Less than today", score: 1 },
        ],
      },
      {
        ref: "rule_of_72",
        type: "single_select",
        title: "Money growing at 6% a year, with interest reinvested, roughly doubles in about how long?",
        required: true,
        options: [{ label: "6 years" }, { label: "12 years", score: 1 }, { label: "20 years" }, { label: "36 years" }],
      },
      {
        ref: "risk",
        type: "single_select",
        title: "Which is usually riskier to put all your money into?",
        required: true,
        options: [
          { label: "The shares of one single company", score: 1 },
          { label: "A fund that holds hundreds of companies" },
          { label: "They carry the same risk" },
        ],
      },
      {
        ref: "diversification",
        type: "single_select",
        title: "What does diversification mean for an investor?",
        required: true,
        options: [
          { label: "Moving money in and out of the market often" },
          { label: "Spreading money across many different investments", score: 1 },
          { label: "Only buying from one industry you know well" },
          { label: "Keeping all your savings in cash" },
        ],
      },
      {
        ref: "apr",
        type: "single_select",
        title: "On a loan or credit card, what does APR stand for?",
        required: true,
        options: [
          { label: "Annual percentage rate", score: 1 },
          { label: "Average payment ratio" },
          { label: "Approved payment record" },
          { label: "Annual principal repayment" },
        ],
      },
      {
        ref: "credit_history",
        type: "multi_select",
        title: "Which of these help build a good credit history? Pick all that apply.",
        description: "Each right pick earns a point, and each wrong one takes a point away.",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Paying every bill on time", score: 1 },
          { label: "Missing a payment now and then", score: -1 },
          { label: "Keeping card balances well below the limit", score: 1 },
          { label: "Using your full credit limit every month", score: -1 },
        ],
      },
      {
        ref: "want_answers",
        type: "yes_no",
        title: "Want the answer sheet, with a short explanation of each answer?",
        required: true,
        yesLabel: "Yes, send it",
        noLabel: "Just my score",
      },

      // Wants the answers
      {
        ref: "email",
        type: "email",
        title: "Where should we send it?",
        description: "The answer sheet, plus the odd money tip. Unsubscribe any time.",
        required: true,
      },

      // Everyone
      {
        ref: "improve",
        type: "multi_select",
        title: "Last one: what would you most like to get better at with money?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "Budgeting" },
          { label: "Building savings" },
          { label: "Paying off debt" },
          { label: "Starting to invest" },
          { label: "Understanding credit" },
        ],
      },
    ],
    branches: [
      { when: "want_answers", is: true, then: "email" },
      { when: "want_answers", is: false, then: "improve" },
    ],
    scoreEndings: [
      { atLeast: 8, then: "end_top" },
      { atLeast: 5, then: "end_mid" },
    ],
    endings: [
      {
        ref: "end_top",
        title: "Money sharp 🏆",
        body: "You know how interest, inflation, risk and credit work, and very little caught you out. Your next step is putting that knowledge to work on a plan of your own.",
      },
      {
        ref: "end_mid",
        title: "Solid footing",
        body: "You have the basics down and one or two questions caught you out. The inflation and doubling questions are the usual culprits, and they are worth a second look because they shape how savings grow.",
      },
    ],
    ending: {
      title: "A good place to start 📘",
      body: "Money terms are rarely explained well, so this score is common. Learning how interest and inflation work is the quickest win, and those two ideas explain most of the other questions too.",
    },
    guide: {
      questionsToConsider: [
        "What subject will your audience enjoy and also connect with what you sell or teach? Money basics suits a bank, adviser or finance course; swap it for your own field.",
        "How will each correct answer be explained: on an emailed answer sheet, in a follow-up lesson, or in the result text?",
        "Should wrong picks in the pick-all-that-apply round cost a point, or simply earn nothing?",
        "What does someone get for their email, and is that promise worded plainly in the question that asks for it?",
      ],
      howToUseResponses:
        "Sort responses by score to see where your audience really stands before you plan content. Find the question most people got wrong: if nearly everyone missed it, it is either a genuine gap worth a guide of its own or a badly worded question to fix. Group email subscribers by what they said they want to get better at, and send each group material on that topic first.",
      customizeSteps: [
        "Replace the questions with your own subject, keeping exactly one option with a score of 1 on each single-answer question and three believable wrong ones.",
        "Recount the highest possible score and move the result bands so the top result still needs nearly every answer right.",
        "Rewrite the email promise and the closing question to match what you will really send, then share the link or embed the quiz.",
      ],
      faqs: [
        {
          q: "How do I write good multiple choice questions?",
          a: "Give one clearly correct answer and wrong options that sound believable to someone who does not know. Keep the wording plain, avoid \"all of the above\", and make the options similar in length so the right one does not stand out.",
        },
        {
          q: "How many options should a multiple choice question have?",
          a: "Three or four is usually enough. More options rarely make a question fairer, and weak filler options are easy to rule out.",
        },
        {
          q: "How is this multiple choice quiz scored?",
          a: "Each correct answer is worth one point. In the credit round each right pick adds a point and each wrong pick removes one, and the total out of nine chooses one of three results.",
        },
        {
          q: "Can I use a multiple choice quiz to collect leads?",
          a: "Yes. This one offers an explained answer sheet in exchange for an email, and players who say no still get their result.",
        },
        {
          q: "Can I use this quiz in a classroom?",
          a: "Yes. Swap in your lesson content, remove the email question, and read each student's score in the responses or export them to CSV.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "personality-quiz",
    type: "quiz",
    category: "lead-generation",
    goals: ["generate-leads", "engage-with-quizzes"],
    roles: ["marketing", "hr-people"],
    searchName: "Personality quiz",
    title: "Work style personality quiz",
    icon: "Brain",
    metaDescription:
      "A light personality quiz on planning style: are you an Architect, a Steady Hand, an Adapter or an Improviser? Players can get their full profile by email.",
    description: "Six everyday scenarios that place people on a planner to improviser scale, with four result types.",
    blurb:
      "Six everyday situations, from a free Saturday to a looming deadline, each with four honest answers and no wrong one. Every answer adds to a score from planner to improviser, and the total lands on one of four types with a short explanation. Players who want the longer profile leave an email, which makes it a friendly lead magnet.",
    tags: ["personality quiz", "work style quiz", "personality test", "fun quiz", "quiz lead magnet"],
    greeting: "Do you plan the week on Sunday or decide on Monday morning? Answer six everyday situations to find your work style.",
    questions: [
      { ref: "first_name", type: "short_text", title: "Whose work style are we reading today?", description: "A first name is plenty.", required: true, maxLength: 40 },
      {
        ref: "saturday",
        type: "single_select",
        title: "A free Saturday opens up. What happens?",
        required: true,
        options: [
          { label: "It's planned by Friday night", score: 3 },
          { label: "I jot down a loose list", score: 2 },
          { label: "I pick one thing and see where it goes", score: 1 },
          { label: "I wake up and decide", score: 0 },
        ],
      },
      {
        ref: "new_project",
        type: "single_select",
        title: "You're handed a new project. What's your first move?",
        required: true,
        options: [
          { label: "Write out every step and a timeline", score: 3 },
          { label: "Sketch the big milestones", score: 2 },
          { label: "Start on the part that excites me", score: 1 },
          { label: "Dive in and work it out as I go", score: 0 },
        ],
      },
      {
        ref: "plans_change",
        type: "single_select",
        title: "Plans change at the last minute. How do you feel?",
        required: true,
        options: [
          { label: "Thrown, until I have a new plan", score: 3 },
          { label: "A little annoyed, then I adjust", score: 2 },
          { label: "Fine, it happens", score: 1 },
          { label: "Quietly pleased, something new", score: 0 },
        ],
      },
      {
        ref: "desk",
        type: "single_select",
        title: "Be honest: what does your desk or inbox look like right now?",
        required: true,
        options: [
          { label: "Sorted into folders", score: 3 },
          { label: "Mostly tidy", score: 2 },
          { label: "Organised chaos", score: 1 },
          { label: "Best not to ask", score: 0 },
        ],
      },
      {
        ref: "packing",
        type: "single_select",
        title: "How do you pack for a trip?",
        required: true,
        options: [
          { label: "From a checklist, days ahead", score: 3 },
          { label: "The night before, from memory", score: 2 },
          { label: "An hour before I leave", score: 1 },
          { label: "I'll buy whatever I forget", score: 0 },
        ],
      },
      {
        ref: "deadlines",
        type: "single_select",
        title: "Which sounds most like you and deadlines?",
        required: true,
        options: [
          { label: "I finish days early", score: 3 },
          { label: "I finish right on time", score: 2 },
          { label: "The pressure helps me focus", score: 1 },
          { label: "The deadline is when I really start", score: 0 },
        ],
      },
      {
        ref: "want_profile",
        type: "yes_no",
        title: "Want your full profile by email, with tips for working with the other three types?",
        required: true,
        yesLabel: "Yes, send it",
        noLabel: "Just show me my type",
      },

      // Wants the profile
      {
        ref: "email",
        type: "email",
        title: "Where should we send it?",
        description: "Your profile, plus the occasional note from us. Unsubscribe any time.",
        required: true,
      },

      // Everyone
      {
        ref: "self_guess",
        type: "opinion_scale",
        title: "Before the reveal: where do you think you'll land?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Total improviser",
        labelHigh: "Total planner",
      },
    ],
    branches: [
      { when: "want_profile", is: true, then: "email" },
      { when: "want_profile", is: false, then: "self_guess" },
    ],
    scoreEndings: [
      { atLeast: 14, then: "end_architect" },
      { atLeast: 9, then: "end_steady" },
      { atLeast: 5, then: "end_adapter" },
    ],
    endings: [
      {
        ref: "end_architect",
        title: "You're the Architect 📐",
        body: "You like to see the whole plan before you start, and it shows: things get done early and properly. Your growth edge is leaving a little room for the plan to change without it feeling like a setback.",
      },
      {
        ref: "end_steady",
        title: "You're the Steady Hand",
        body: "You plan enough to feel in control but not so much that a change throws you. Teams lean on you because you are reliable without being rigid.",
      },
      {
        ref: "end_adapter",
        title: "You're the Adapter",
        body: "You set a direction and then follow the energy, adjusting as you learn. You do well when things are moving fast, and a short checklist for the boring parts keeps you on time.",
      },
    ],
    ending: {
      title: "You're the Improviser ⚡",
      body: "You think best on your feet and some of your best ideas arrive at the last minute. Pair up with a planner on big projects and you'll bring the spark while they keep the dates.",
    },
    guide: {
      questionsToConsider: [
        "What are your result types, and what will each person do with theirs? Write the four results before you edit the questions.",
        "Does every answer option feel like something a reasonable person might pick, with no option that reads as the wrong one?",
        "What will the emailed profile contain, and is it worth an email address to the player?",
        "Is this for fun on social media, a team workshop, or a hiring event? The tone of the results should match.",
      ],
      howToUseResponses:
        "Count how many people land in each type: if nearly everyone gets the same result, move the score bands or rewrite the questions that everyone answers the same way. Compare the self-guess with the actual result for a fun follow-up post. Send each email subscriber content that suits their type, and use the spread of types in a team session to talk about how people like to work.",
      customizeSteps: [
        "Decide your own types first, then rewrite each question so its answers run from one end of your scale to the other, scored 3 down to 0.",
        "Rename the four results and adjust the score bands so each type is reachable, then take the quiz a few times with different answers to check.",
        "Change what the email question promises, then share the link on social media or embed the quiz on a landing page.",
      ],
      faqs: [
        {
          q: "How do you make a personality quiz?",
          a: "Start with the results, then write questions where each answer points toward one of them. Keep every option believable, so nobody feels there is a wrong answer.",
        },
        {
          q: "How does this personality quiz decide the result?",
          a: "Each answer carries between 0 and 3 points, from improviser to planner. The total out of 18 picks one of four types, and you can move the thresholds.",
        },
        {
          q: "Is this a scientific personality test?",
          a: "No. It is a light, fun quiz about everyday habits. Say so in your greeting if you use it at work, so nobody takes the result too seriously.",
        },
        {
          q: "Can a personality quiz help me collect leads?",
          a: "Yes. People like sharing their type, and offering a longer profile by email gives them a real reason to leave their address.",
        },
      ],
    },
  }),
];
