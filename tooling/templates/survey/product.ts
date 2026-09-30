import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_PRODUCT: TemplateSeed[] = [
  defineTemplate({
    slug: "concept-testing-survey",
    type: "survey",
    category: "product",
    goals: ["conduct-research"],
    roles: ["product-research", "marketing"],
    searchName: "Concept testing survey",
    title: "Concept test",
    icon: "Lightbulb",
    metaDescription:
      "Show people an early idea and learn what they think it does, whether they have the problem, and what worries them. Keen testers can join an early access list.",
    description: "Check whether an early idea is understood, wanted and worth building.",
    blurb:
      "The concept is shown first, then people explain it back in their own words, so you learn whether the idea is clear before you read a single rating. Anyone who rarely has the problem skips the questions about how they solve it today, and people who say they would try it are offered early access while the rest are asked what would change their mind.",
    tags: ["concept testing survey", "concept test", "idea validation", "product research", "early feedback"],
    greeting: "We're working on a new idea and would love your honest first impressions. It takes about four minutes.",
    questions: [
      {
        ref: "concept",
        type: "statement",
        title: "Here's the idea",
        description:
          "Replace this with a short, plain description of your concept: who it is for, the problem it solves and how it works. Add an image or short video if you have one.",
        required: false,
      },
      {
        ref: "first_reaction",
        type: "opinion_scale",
        title: "What's your first reaction?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Not for me",
        labelHigh: "I love it",
      },
      {
        ref: "understanding",
        type: "long_text",
        title: "In a sentence or two, what do you think this does?",
        description: "There's no wrong answer. We want to know if we explained it clearly.",
        required: true,
        maxLength: 600,
      },
      {
        ref: "problem_fit",
        type: "single_select",
        title: "How often do you run into the problem this is meant to solve?",
        required: true,
        options: [{ label: "All the time" }, { label: "Now and then" }, { label: "Rarely" }, { label: "Never" }],
      },
      {
        ref: "current_way",
        type: "long_text",
        title: "How do you deal with it today?",
        required: false,
        maxLength: 800,
        agentHints: {
          askStyle: "Ask for the actual workaround, tool or habit they rely on, not a general opinion.",
          examples: [],
        },
      },
      {
        ref: "appeal",
        type: "matrix",
        title: "How appealing is each part of the idea?",
        required: true,
        rows: ["The main idea", "How it would fit into your day", "How it looks", "How easy it seems to use"],
        columns: ["Not appealing", "Neutral", "Appealing", "Very appealing"],
      },
      {
        ref: "concerns",
        type: "long_text",
        title: "What questions or worries would stop you from trying it?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "try_it",
        type: "single_select",
        title: "If this existed today, how likely would you be to try it?",
        required: true,
        options: [
          { label: "Definitely" },
          { label: "Probably" },
          { label: "Not sure" },
          { label: "Probably not" },
          { label: "Definitely not" },
        ],
      },

      // Unsure or not interested
      {
        ref: "change_mind",
        type: "long_text",
        title: "What would have to change for you to want it?",
        required: false,
        maxLength: 800,
      },

      // Keen
      {
        ref: "early_access",
        type: "yes_no",
        title: "Would you like early access when it's ready?",
        required: true,
        yesLabel: "Yes, count me in",
        noLabel: "Not right now",
      },
      {
        ref: "early_email",
        type: "email",
        title: "Where should we send your invite?",
        required: true,
      },
    ],
    branches: [
      { when: "problem_fit", is: "Rarely", then: "appeal" },
      { when: "problem_fit", is: "Never", then: "appeal" },
      { when: "try_it", is: "Definitely", then: "early_access" },
      { when: "try_it", is: "Probably", then: "early_access" },
      { when: "try_it", is: "Not sure", then: "change_mind" },
      { when: "try_it", is: "Probably not", then: "change_mind" },
      { when: "try_it", is: "Definitely not", then: "change_mind" },
      { when: "change_mind", always: true, then: "end_thanks" },
      { when: "early_access", is: false, then: "end_thanks" },
      { when: "early_email", always: true, then: "end_early" },
    ],
    endings: [
      {
        ref: "end_early",
        title: "You're on the list 🚀",
        body: "Thanks for the honest feedback. We'll email you as soon as there's something to try.",
      },
    ],
    ending: {
      title: "Thank you, that's really useful",
      body: "Critical answers help us most at this stage, so thanks for being straight with us.",
    },
    guide: {
      questionsToConsider: [
        "Can you describe the concept in three or four sentences that someone outside your team would understand?",
        "Which decision is this test meant to inform: build it, change it, or drop it?",
        "Are you testing one concept, or should you send a second version to a different group and compare?",
        "Who should answer: people who already have the problem, or a broader audience?",
      ],
      howToUseResponses:
        "Read the explain-it-back answers first. If people describe something different from what you meant, fix the explanation before trusting any of the ratings. Then compare how appealing the idea was for people who have the problem all the time against those who rarely do, and group the worries into themes. Treat the early access list as your first interview pool rather than as proof of demand.",
      customizeSteps: [
        "Replace the description on the first screen with your concept, and attach a sketch, mockup or short video.",
        "Rename the rows in the appeal grid to the parts of your idea you most need to test.",
        "Send it to a small group first, check that the explain-it-back answers match your intent, then share the link more widely.",
      ],
      faqs: [
        {
          q: "What is a concept testing survey?",
          a: "It shows people an idea before it is built and asks whether they understand it, whether it solves a real problem for them and what would stop them using it.",
        },
        {
          q: "What questions should a concept test include?",
          a: "A first reaction, a check that people understood the idea, how often they have the problem, how appealing each part is, their concerns and how likely they are to try it.",
        },
        {
          q: "How do I avoid biased answers in a concept test?",
          a: "Describe the idea plainly without selling it, ask one thing per question and give people an easy way to say it is not for them. Asking them to explain the idea back also shows who genuinely understood it.",
        },
        {
          q: "Does a positive concept test prove people will buy?",
          a: "No. It tells you the idea is clear and appealing to the people you asked. Follow up with the early access sign-ups to see who actually uses it.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "focus-group-survey",
    type: "survey",
    category: "product",
    goals: ["conduct-research"],
    roles: ["product-research", "marketing"],
    searchName: "Focus group survey",
    title: "Focus group survey",
    icon: "Users",
    metaDescription:
      "One survey for both sides of a focus group: capture each participant's views before the session, then what they held back and what changed their mind after it.",
    description: "Hear from every participant before and after the group discussion, not just the loudest.",
    blurb:
      "The first question asks whether the session is still ahead or already over, and each group gets its own set of questions. Before the session you learn each person's starting view and what they want to discuss; afterwards you learn what they did not get to say and whether the discussion changed their mind.",
    tags: ["focus group survey", "focus group questionnaire", "pre-session survey", "qualitative research", "participant feedback"],
    greeting: "Thanks for taking part in our focus group. A few questions on your own first, so every view gets heard.",
    questions: [
      {
        ref: "name",
        type: "short_text",
        title: "What's your first name?",
        description: "So we can match your answers to the session notes.",
        required: true,
        maxLength: 60,
      },
      {
        ref: "timing",
        type: "single_select",
        title: "Is the session still ahead of you, or has it already happened?",
        required: true,
        options: [{ label: "It's still ahead" }, { label: "I've just taken part" }],
      },

      // Before the session
      {
        ref: "familiarity",
        type: "single_select",
        title: "How familiar are you with the topic we'll be discussing?",
        required: true,
        options: [
          { label: "I use it or deal with it every week" },
          { label: "I've some experience with it" },
          { label: "I've heard of it but not used it" },
          { label: "It's completely new to me" },
        ],
      },
      {
        ref: "starting_view",
        type: "long_text",
        title: "Before we meet, what's your honest view on it?",
        required: true,
        maxLength: 1000,
        agentHints: {
          askStyle: "Reassure them there's no right answer and ask for one concrete example behind their view.",
          examples: [],
        },
      },
      {
        ref: "discuss",
        type: "multi_select",
        title: "Which of these would you most like to talk about?",
        required: false,
        minSelections: 1,
        maxSelections: 3,
        allowOther: true,
        options: [
          { label: "What works well today" },
          { label: "What frustrates me" },
          { label: "Ideas for improving it" },
          { label: "Price and value" },
          { label: "How it compares with other options" },
        ],
      },
      {
        ref: "speaking_comfort",
        type: "opinion_scale",
        title: "How comfortable are you sharing your views in a group?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "I'd rather listen",
        labelHigh: "Very comfortable",
      },
      {
        ref: "access_needs",
        type: "long_text",
        title: "Is there anything we should arrange so you can take part comfortably?",
        required: false,
        maxLength: 500,
      },

      // After the session
      {
        ref: "felt_heard",
        type: "rating",
        title: "How well did the session let you say what you wanted to?",
        required: true,
        scale: 5,
      },
      {
        ref: "unsaid",
        type: "long_text",
        title: "Was there anything you didn't get to say, or held back?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "view_changed",
        type: "single_select",
        title: "Did the discussion change your view?",
        required: true,
        options: [{ label: "Yes, quite a lot" }, { label: "A little" }, { label: "Not at all" }],
      },
      {
        ref: "what_changed",
        type: "long_text",
        title: "What changed your mind, and how do you see it now?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "takeaway",
        type: "long_text",
        title: "If the organisers remember one thing you said, what should it be?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "future_research",
        type: "yes_no",
        title: "Can we invite you to future research sessions?",
        required: false,
      },
    ],
    branches: [
      { when: "timing", is: "It's still ahead", then: "familiarity" },
      { when: "timing", is: "I've just taken part", then: "felt_heard" },
      { when: "access_needs", always: true, then: "end_before" },
      { when: "view_changed", is: "Not at all", then: "takeaway" },
    ],
    endings: [
      {
        ref: "end_before",
        title: "See you at the session 👋",
        body: "Thanks. The moderator will read your answers beforehand, so your view is part of the conversation from the start.",
      },
    ],
    ending: {
      title: "Thank you for taking part",
      body: "Your answers sit alongside the discussion notes, so anything you held back in the room still counts.",
    },
    guide: {
      questionsToConsider: [
        "What is the one topic the session must cover, and should the multiple choice options name its parts?",
        "Will you send the before questions a day ahead, so the moderator can read them first?",
        "Do participants need to stay anonymous in your notes, or is a first name enough?",
        "When will you send the after questions: straight away, or once people have had a day to reflect?",
      ],
      howToUseResponses:
        "Read the before answers ahead of the session and note who sees things differently, so the moderator can invite quieter people in by name. Afterwards, put the held-back comments next to the transcript: they often contain the criticism nobody wanted to say in front of the group. Treat what you learn as the views of this group, and use it to shape a wider survey rather than as a result in itself.",
      customizeSteps: [
        "Rewrite the familiarity and view questions to name your topic, and swap the discussion options for your session plan.",
        "Share the same link before and after the session; the first question sends each person to the right set of questions.",
        "Export the responses to CSV and add them to your discussion notes, matched by participant name.",
      ],
      faqs: [
        {
          q: "What is a focus group survey?",
          a: "A short questionnaire participants fill in on their own, before or after a group discussion. It captures individual views that can get lost when a few people do most of the talking.",
        },
        {
          q: "Should I survey participants before or after a focus group?",
          a: "Both work, for different reasons. Before, you learn each person's starting view; after, you learn what they held back and whether the group changed their mind. This template handles both with one link.",
        },
        {
          q: "What questions should a focus group questionnaire include?",
          a: "Each person's experience with the topic, their honest view, what they want to discuss and anything they need to take part. Afterwards, ask how heard they felt and what they left unsaid.",
        },
        {
          q: "Can focus group results represent my whole market?",
          a: "No. A focus group is a small, chosen group, so it is best for finding ideas and issues to test more widely with a larger survey.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "new-product-survey",
    type: "survey",
    category: "product",
    goals: ["conduct-research", "generate-leads"],
    roles: ["product-research", "marketing"],
    searchName: "New product survey",
    title: "New product survey",
    icon: "Rocket",
    metaDescription:
      "Test a product before launch: how often people face the problem, which features matter, what they'd expect to pay and what they need to know before trying it.",
    description: "Learn who wants your new product, what matters to them and what's stopping them.",
    blurb:
      "People who never have the problem are thanked and let go straight away, so your numbers come from the audience you're actually building for. Everyone else ranks the features, names a price and says what they'd need to know first, and the ones planning to try it can leave an email for the launch.",
    tags: ["new product survey", "product launch survey", "pre-launch research", "feature prioritisation", "pricing research"],
    greeting: "We're getting ready to launch something new and want to build it around what you actually need. About four minutes.",
    questions: [
      {
        ref: "problem_frequency",
        type: "single_select",
        title: "How often do you run into the problem this product is built to solve?",
        description: "Edit this question to name the problem in plain words.",
        required: true,
        options: [
          { label: "Every week or more" },
          { label: "About once a month" },
          { label: "A few times a year" },
          { label: "Never" },
        ],
      },
      {
        ref: "current_solution",
        type: "long_text",
        title: "How do you handle it today?",
        required: true,
        maxLength: 800,
        agentHints: {
          askStyle: "Ask what they use or do now, and what bothers them about it.",
          examples: [],
        },
      },
      {
        ref: "current_satisfaction",
        type: "rating",
        title: "How happy are you with the way you handle it now?",
        required: true,
        scale: 5,
      },
      {
        ref: "features",
        type: "ranking",
        title: "Rank these by how much they matter to you.",
        required: true,
        items: [
          "Quick to set up",
          "Works well on a phone",
          "Fits the tools I already use",
          "Clear, fair pricing",
          "Help from a real person when I need it",
        ],
      },
      {
        ref: "interest",
        type: "opinion_scale",
        title: "From what you know about it so far, how interested are you?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not interested",
        labelHigh: "Very interested",
      },
      {
        ref: "expected_price",
        type: "number",
        title: "What would you expect to pay for it?",
        description: "Your best guess is fine. Say whether that's once, monthly or yearly.",
        required: false,
        min: 0,
      },
      {
        ref: "need_to_know",
        type: "long_text",
        title: "What would you need to know before you'd try it?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "intent",
        type: "single_select",
        title: "When it launches, what are you most likely to do?",
        required: true,
        options: [
          { label: "Buy it straight away" },
          { label: "Try a free version first" },
          { label: "Wait to hear what others think" },
          { label: "Probably skip it" },
        ],
      },

      // Planning to skip it
      {
        ref: "why_skip",
        type: "long_text",
        title: "What makes it not quite right for you?",
        required: false,
        maxLength: 800,
      },

      // Planning to try it
      {
        ref: "notify",
        type: "yes_no",
        title: "Shall we tell you when it launches?",
        required: true,
      },
      { ref: "email", type: "email", title: "What's the best email for that?", required: true },
    ],
    branches: [
      { when: "problem_frequency", is: "Never", then: "end_not_for_you" },
      { when: "intent", is: "Buy it straight away", then: "notify" },
      { when: "intent", is: "Try a free version first", then: "notify" },
      { when: "intent", is: "Wait to hear what others think", then: "notify" },
      { when: "intent", is: "Probably skip it", then: "why_skip" },
      { when: "why_skip", always: true, then: "end_thanks" },
      { when: "notify", is: false, then: "end_thanks" },
      { when: "email", always: true, then: "end_launch" },
    ],
    endings: [
      {
        ref: "end_not_for_you",
        title: "Thanks, that's useful to know",
        body: "It sounds like this isn't a problem you have, so we won't keep you. Thanks for stopping by.",
      },
      {
        ref: "end_launch",
        title: "You'll be the first to know 🚀",
        body: "Thanks for helping shape it. We'll send one email when it launches.",
      },
    ],
    ending: {
      title: "Thank you, that helps a lot",
      body: "Every answer shapes what goes into the first release, including the ones that tell us what isn't working.",
    },
    guide: {
      questionsToConsider: [
        "How will you describe the problem in the first question so people recognise it instantly?",
        "Which five features are you really deciding between, and would ranking them settle the argument?",
        "Do you want a price guess, or is it too early to ask about money?",
        "Who should get the survey: your existing customers, a waitlist, or people who have never heard of you?",
      ],
      howToUseResponses:
        "Start with the people who face the problem weekly or monthly, because they are the ones most likely to buy. Look at their feature rankings to decide what goes in the first release, and read what they need to know before trying it: those answers become your launch page and your FAQ. Keep the launch list separate and invite a few of them to try an early version.",
      customizeSteps: [
        "Name the problem in the first question and replace the ranking items with your real features.",
        "Add a short description, image or video of the product above the interest question so people know what they are rating.",
        "Share the link with your target audience, then export the answers to CSV and filter by how often people face the problem.",
      ],
      faqs: [
        {
          q: "What should a new product survey ask?",
          a: "How often people have the problem, how they solve it now, which features matter most, how interested they are, what they would pay and what they need to know before trying it.",
        },
        {
          q: "When should I send a new product survey?",
          a: "Once the product is defined enough to describe, but early enough that the answers can still change the features, the price or the launch message.",
        },
        {
          q: "Why screen out people who never have the problem?",
          a: "Their interest scores would dilute the answers from people who might actually buy. This template thanks them and ends early, so the rest of the data reflects your real audience.",
        },
        {
          q: "Can I collect emails for a launch list with this survey?",
          a: "Yes. People who plan to buy or try it are asked if they want to hear about the launch, and only those who say yes are asked for an email.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "product-satisfaction-survey",
    type: "survey",
    category: "product",
    goals: ["conduct-research", "collect-feedback"],
    roles: ["product-research", "customer-success"],
    searchName: "Product satisfaction survey",
    title: "Product satisfaction",
    icon: "ThumbsUp",
    metaDescription:
      "Ask buyers how well your product lived up to expectations, rate quality, ease of use and value, and offer to follow up with anyone it let down.",
    description: "Find out whether the product lived up to what buyers expected, and why.",
    blurb:
      "One question splits the survey: did the product turn out better, about the same or worse than expected? Buyers it pleased say what they like most, and buyers it disappointed say what fell short and can ask to be contacted so you can put it right.",
    tags: ["product satisfaction survey", "product feedback", "customer satisfaction", "post-purchase survey", "product review"],
    greeting: "Thanks for your purchase. Now that you've had some time with it, how is it going?",
    questions: [
      {
        ref: "product",
        type: "short_text",
        title: "Which product are you reviewing?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "time_used",
        type: "single_select",
        title: "How long have you been using it?",
        required: true,
        options: [
          { label: "Less than a week" },
          { label: "A few weeks" },
          { label: "A few months" },
          { label: "More than six months" },
        ],
      },
      {
        ref: "satisfaction",
        type: "rating",
        title: "Overall, how satisfied are you with it?",
        required: true,
        scale: 5,
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each of these?",
        required: true,
        rows: ["Quality", "Ease of use", "Reliability", "Value for money", "Look and feel"],
        columns: ["Poor", "Fair", "Good", "Excellent"],
      },
      {
        ref: "expectations",
        type: "single_select",
        title: "Compared with what you expected, the product has been...",
        required: true,
        options: [{ label: "Better than I expected" }, { label: "About what I expected" }, { label: "Worse than I expected" }],
      },

      // Met or beat expectations
      {
        ref: "best_part",
        type: "long_text",
        title: "What do you like most about it?",
        required: false,
        maxLength: 800,
      },

      // Fell short
      {
        ref: "fell_short",
        type: "long_text",
        title: "What fell short of what you expected?",
        required: true,
        maxLength: 1000,
        agentHints: {
          askStyle: "Ask for the specific moment or feature that disappointed them.",
          examples: [],
        },
      },
      {
        ref: "contact_ok",
        type: "yes_no",
        title: "Would you like someone from our team to get in touch to help?",
        required: true,
      },
      { ref: "contact_email", type: "email", title: "Which email should we use?", required: true },

      // Everyone
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend it to a friend or colleague?",
        required: true,
      },
      {
        ref: "improvements",
        type: "multi_select",
        title: "What would make it better?",
        required: false,
        minSelections: 1,
        maxSelections: 3,
        allowOther: true,
        options: [
          { label: "Better quality or durability" },
          { label: "Easier to use" },
          { label: "Clearer instructions" },
          { label: "More features" },
          { label: "A lower price" },
          { label: "Nothing, it's great as it is" },
        ],
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Anything else you'd like us to know?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "expectations", is: "Better than I expected", then: "best_part" },
      { when: "expectations", is: "About what I expected", then: "best_part" },
      { when: "expectations", is: "Worse than I expected", then: "fell_short" },
      { when: "best_part", always: true, then: "recommend" },
      { when: "contact_ok", is: false, then: "recommend" },
    ],
    ending: {
      title: "Thanks for the feedback 🙌",
      body: "We read every response. If you asked us to get in touch, we'll email you soon.",
    },
    guide: {
      questionsToConsider: [
        "How long should buyers use the product before you ask, given how often it is used?",
        "Which qualities decide whether your product is good: durability, taste, speed, comfort?",
        "Who replies to buyers who ask for help, and how quickly?",
        "Will you send one link per product, or ask buyers to name it?",
      ],
      howToUseResponses:
        "Split the answers by how long people have used the product, because first-week impressions and six-month verdicts tell different stories. Reply to every buyer who asked for contact before you analyse anything else. Then look at which row of the rating grid drags the score down, and read the written answers from disappointed buyers to find out why.",
      customizeSteps: [
        "Rename the rows in the rating grid to the qualities that matter for your product.",
        "Change the improvement options to the changes you could realistically make.",
        "Send the link a few weeks after delivery, and use a separate link per product if you sell several.",
      ],
      faqs: [
        {
          q: "When should I send a product satisfaction survey?",
          a: "After the buyer has used the product enough to judge it. For something used daily that might be a couple of weeks; for something seasonal, longer.",
        },
        {
          q: "What questions should a product satisfaction survey include?",
          a: "An overall rating, ratings for the qualities that matter, whether it met expectations, what they like or what fell short, and how likely they are to recommend it.",
        },
        {
          q: "How is product satisfaction different from customer satisfaction?",
          a: "Product satisfaction is about the item itself. Customer satisfaction also covers delivery, support and the buying experience, so keep those questions separate if you want to know which one to fix.",
        },
        {
          q: "Can I follow up with unhappy buyers?",
          a: "Yes. Buyers who say the product was worse than expected are asked if they want to be contacted, and only those who say yes are asked for an email.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "product-testing-survey",
    type: "survey",
    category: "product",
    goals: ["conduct-research", "collect-feedback"],
    roles: ["product-research"],
    searchName: "Product testing survey",
    title: "Product testing survey",
    icon: "FlaskConical",
    metaDescription:
      "Collect what happened when testers tried your product: whether they finished the task, where they got stuck, what they expected and any bugs they hit.",
    description: "Find out what testers tried, where they struggled and what they expected instead.",
    blurb:
      "Anchored to the task you set: testers who finished easily move on, testers who struggled say which step was hardest, and testers who got stuck say where and can attach a screenshot. Everyone then says what they expected to happen, rates ease and quality, and reports any bugs they spotted.",
    tags: ["product testing survey", "user testing", "beta test feedback", "usability testing", "bug reports"],
    greeting: "Thanks for testing for us. Tell us what happened while it's fresh; the problems are the most useful part.",
    questions: [
      {
        ref: "tester",
        type: "short_text",
        title: "What's your name or tester ID?",
        required: true,
        maxLength: 60,
      },
      {
        ref: "device",
        type: "dropdown",
        title: "What did you test it on?",
        required: true,
        options: [{ label: "Phone" }, { label: "Tablet" }, { label: "Laptop or desktop" }, { label: "Something else" }],
      },
      {
        ref: "task_result",
        type: "single_select",
        title: "Were you able to finish the task we gave you?",
        required: true,
        options: [{ label: "Yes, easily" }, { label: "Yes, but it took some effort" }, { label: "No, I got stuck" }],
      },

      // Took effort
      {
        ref: "hardest_step",
        type: "long_text",
        title: "Which step was hardest, and why?",
        required: true,
        maxLength: 800,
      },

      // Got stuck
      {
        ref: "stuck_where",
        type: "long_text",
        title: "Where did you get stuck? Tell us what you were trying to do and what happened.",
        required: true,
        maxLength: 1000,
        agentHints: {
          askStyle: "Ask them to walk through the steps in order, including what they clicked or pressed last.",
          examples: [],
        },
      },
      {
        ref: "screenshot",
        type: "file_upload",
        title: "Got a screenshot or recording of the moment? Add it here.",
        required: false,
        accept: ["image/*", "video/*"],
        maxFiles: 3,
        maxSizeMB: 25,
      },

      // Everyone who struggled
      {
        ref: "expected",
        type: "long_text",
        title: "What did you expect to happen instead?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "ease",
        type: "opinion_scale",
        title: "Overall, how easy was it to use?",
        required: true,
        steps: 7,
        startAt: 1,
        labelLow: "Very difficult",
        labelHigh: "Very easy",
      },
      {
        ref: "quality",
        type: "rating",
        title: "How would you rate the quality of what you tested?",
        required: true,
        scale: 5,
      },
      {
        ref: "bugs",
        type: "yes_no",
        title: "Did you notice anything broken or behaving oddly?",
        required: true,
      },
      {
        ref: "bug_detail",
        type: "long_text",
        title: "What did you notice, and can you make it happen again?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "would_use",
        type: "single_select",
        title: "Based on this test, would you use it for real?",
        required: true,
        options: [{ label: "Yes, as it is" }, { label: "Yes, once the problems are fixed" }, { label: "Probably not" }],
      },
      {
        ref: "one_change",
        type: "long_text",
        title: "If you could change one thing before launch, what would it be?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "task_result", is: "Yes, easily", then: "ease" },
      { when: "task_result", is: "Yes, but it took some effort", then: "hardest_step" },
      { when: "task_result", is: "No, I got stuck", then: "stuck_where" },
      { when: "hardest_step", always: true, then: "expected" },
      { when: "bugs", is: false, then: "would_use" },
    ],
    ending: {
      title: "Thanks for testing 🧪",
      body: "Every issue you reported goes to the team building it. We'll let you know when there's a new version to try.",
    },
    guide: {
      questionsToConsider: [
        "What exact task will you give testers, and where will you describe it: in the invite or in the form?",
        "Which version or build are they testing, and should testers be asked to name it?",
        "Do you need screen recordings, or are screenshots enough to reproduce a problem?",
        "Who triages bug reports, and how quickly should testers hear back?",
      ],
      howToUseResponses:
        "Group the answers by task result first. Anyone who got stuck has shown you a blocker, so try to reproduce each one using their steps and screenshots. Then compare what testers expected with what happened: repeated mismatches point to a design problem rather than a bug. Keep bug reports and usability complaints in separate lists, since they usually go to different people.",
      customizeSteps: [
        "Describe the test task in the greeting or in the invite, and rename the device options to what you support.",
        "Add a question for the build or version number if you send the link for more than one release.",
        "Share the link with testers right after each session, and export the responses to CSV for your bug tracker.",
      ],
      faqs: [
        {
          q: "What questions should a product testing survey ask?",
          a: "Whether the tester finished the task, where they struggled, what they expected instead, how easy and good it felt, any bugs they saw and whether they would use it for real.",
        },
        {
          q: "Should every tester do the same task?",
          a: "If you want to compare results, yes. Give free exploration its own round so you can tell which findings came from which kind of test.",
        },
        {
          q: "How do I get useful bug reports from testers?",
          a: "Ask what they were trying to do, what happened, whether they can make it happen again, and for a screenshot. This template asks all of these only of testers who hit a problem.",
        },
        {
          q: "Can testers upload screenshots?",
          a: "Yes. Testers who got stuck can attach images or short videos of the problem.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "product-market-fit",
    type: "survey",
    category: "product",
    goals: ["conduct-research"],
    roles: ["product-research", "marketing"],
    searchName: "Product-market fit survey",
    title: "Product-market fit survey",
    icon: "Target",
    metaDescription:
      "Measure product-market fit with the 'how disappointed would you be' question, then a different follow-up for each answer, plus alternatives and where it falls short.",
    description: "The disappointment question, a different follow-up for each answer, and who your fans are.",
    blurb:
      "Asks how disappointed people would be if the product disappeared, then gives each answer its own conversation: fans describe the benefit in their own words, the somewhat disappointed say what's missing, and the rest say why it isn't useful. Everyone then names their alternative and where it falls short, and the role and team questions show who your fans are.",
    tags: ["product market fit survey", "pmf survey", "startup research", "customer research", "product market fit questions"],
    greeting: "A few questions about how you use us. Honest answers help most, including critical ones.",
    questions: [
      {
        ref: "usage",
        type: "single_select",
        title: "How often do you use the product?",
        required: true,
        options: [{ label: "Every day" }, { label: "A few times a week" }, { label: "A few times a month" }, { label: "Rarely" }],
      },
      {
        ref: "disappointment",
        type: "single_select",
        title: "How would you feel if you could no longer use this product?",
        required: true,
        options: [{ label: "Very disappointed" }, { label: "Somewhat disappointed" }, { label: "Not disappointed" }],
      },

      // Very disappointed: the people you are building for
      {
        ref: "main_benefit",
        type: "long_text",
        title: "What's the main benefit you get from it?",
        description: "In your own words. We often learn the best way to describe us from answers like yours.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "who_benefits",
        type: "long_text",
        title: "What type of person do you think would benefit most from it?",
        required: true,
        maxLength: 600,
      },

      // Somewhat disappointed: the people you can win over
      {
        ref: "whats_missing",
        type: "long_text",
        title: "What would have to be true for you to be very disappointed without it?",
        required: true,
        maxLength: 800,
      },

      // Not disappointed: the people you are not for yet
      {
        ref: "not_useful",
        type: "long_text",
        title: "What stops it being useful to you?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "alternative",
        type: "short_text",
        title: "If it disappeared tomorrow, what would you use instead?",
        required: false,
        maxLength: 200,
      },
      {
        ref: "falls_short",
        type: "long_text",
        title: "Where does it still fall short for you?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "role",
        type: "single_select",
        title: "What best describes your role?",
        required: false,
        options: [
          { label: "Founder or exec" },
          { label: "Engineering" },
          { label: "Design" },
          { label: "Marketing" },
          { label: "Operations" },
          { label: "Something else" },
        ],
      },
      {
        ref: "team_size",
        type: "single_select",
        title: "How big is the team you work in?",
        required: false,
        options: [{ label: "Just me" }, { label: "2–10" }, { label: "11–50" }, { label: "51–200" }, { label: "200+" }],
      },
    ],
    branches: [
      { when: "disappointment", is: "Very disappointed", then: "main_benefit" },
      { when: "disappointment", is: "Somewhat disappointed", then: "whats_missing" },
      { when: "disappointment", is: "Not disappointed", then: "not_useful" },
      { when: "who_benefits", always: true, then: "alternative" },
      { when: "whats_missing", always: true, then: "alternative" },
    ],
    ending: {
      title: "Really useful, thank you 🙏",
      body: "We read every answer, and the critical ones shape what we build next.",
    },
    guide: {
      questionsToConsider: [
        "Who should get this: everyone, or only people who have used the product recently and more than once?",
        "Which roles and team sizes do you suspect love you most, and are they in the options?",
        "Will you run it again after a big release, so you can compare the very disappointed share over time?",
        "What will you do with the answers from people who are not disappointed?",
      ],
      howToUseResponses:
        "Work out what share of people chose very disappointed, then filter to just that group. Read their main benefit answers for the words to use in your marketing, and check their role and team size to see who your core audience really is. The somewhat disappointed answers are your roadmap: what's missing for them is what stands between you and more fans.",
      customizeSteps: [
        "Replace 'this product' with your product's name in the disappointment and benefit questions.",
        "Update the role and team size options to match the audiences you sell to.",
        "Send it to active users, then export to CSV and filter by the disappointment answer to compare the three groups.",
      ],
      faqs: [
        {
          q: "How do you measure product-market fit with a survey?",
          a: "Ask users how they would feel if they could no longer use the product. The share who say very disappointed is the headline number, and what that group says about the benefit tells you why.",
        },
        {
          q: "What is a good product-market fit score?",
          a: "Sean Ellis, who popularised the question, suggested that around 40 percent of users answering very disappointed is a sign of fit. Treat it as one signal alongside retention and usage.",
        },
        {
          q: "Who should answer a product-market fit survey?",
          a: "People who have used the product enough to judge it. Surveying sign-ups who never got started will pull the score down without telling you much.",
        },
        {
          q: "Why does each answer get different follow-up questions?",
          a: "Each group tells you something different. Fans explain the value, the somewhat disappointed explain the gap, and the rest explain why it isn't for them, so asking everyone the same thing wastes their time.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "sean-ellis-test-product-market-fit-survey",
    type: "survey",
    category: "product",
    goals: ["conduct-research"],
    roles: ["product-research", "marketing"],
    searchName: "Sean Ellis test survey",
    title: "Sean Ellis test",
    icon: "Gauge",
    metaDescription:
      "Run the Sean Ellis test the standard way: screen for recent users, ask the four core questions and invite your most engaged fans to a follow-up interview.",
    description: "The four classic Sean Ellis questions, asked only of people who have really used the product.",
    blurb:
      "Keeps the standard Sean Ellis questions and asks them of everyone in the same order, so your result is comparable from one round to the next. A first question thanks and releases people who have barely used the product, and anyone happy to talk more can leave an email for a follow-up interview.",
    tags: ["sean ellis test", "40 percent test", "product market fit", "pmf survey", "startup metrics"],
    greeting: "We'd love your honest take on the product. A handful of short questions, about two minutes.",
    questions: [
      {
        ref: "recent_use",
        type: "single_select",
        title: "How much have you used the product recently?",
        required: true,
        options: [
          { label: "Regularly in the past couple of weeks" },
          { label: "A few times in the past month" },
          { label: "Not for a while" },
          { label: "I only tried it once" },
        ],
      },
      {
        ref: "disappointment",
        type: "single_select",
        title: "How would you feel if you could no longer use the product?",
        required: true,
        options: [
          { label: "Very disappointed" },
          { label: "Somewhat disappointed" },
          { label: "Not disappointed, it isn't that useful" },
        ],
      },
      {
        ref: "alternative",
        type: "short_text",
        title: "What would you use instead if it were no longer available?",
        required: false,
        maxLength: 200,
      },
      {
        ref: "main_benefit",
        type: "long_text",
        title: "What is the main benefit you get from the product?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "ideal_user",
        type: "long_text",
        title: "What type of people do you think would benefit most from it?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "improve",
        type: "long_text",
        title: "How could we improve the product to better meet your needs?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "interview",
        type: "yes_no",
        title: "Would you be up for a short follow-up chat about how you use it?",
        required: true,
      },
      { ref: "interview_email", type: "email", title: "Great. Which email should we use to set it up?", required: true },
    ],
    branches: [
      { when: "recent_use", is: "Not for a while", then: "end_not_yet" },
      { when: "recent_use", is: "I only tried it once", then: "end_not_yet" },
      { when: "interview", is: false, then: "end_thanks" },
      { when: "interview_email", always: true, then: "end_interview" },
    ],
    endings: [
      {
        ref: "end_not_yet",
        title: "Thanks for letting us know",
        body: "This survey is for people who use the product regularly, so we won't take more of your time. We'd still love to hear from you if you come back to it.",
      },
      {
        ref: "end_interview",
        title: "Thank you, we'll be in touch 📅",
        body: "Someone from the team will email you to find a time that suits you.",
      },
    ],
    ending: {
      title: "Thank you 🙏",
      body: "Your answers go straight to the team deciding what to build next.",
    },
    guide: {
      questionsToConsider: [
        "How do you define an active user for your product, and does the screening question match it?",
        "Will you send it to a random sample of active users, or to everyone at once?",
        "How often will you repeat the test, and what change would make you act?",
        "Who will run the follow-up interviews, and how many can you handle?",
      ],
      howToUseResponses:
        "Count only the people who passed the screening question, then work out what share answered very disappointed. Read the main benefit answers from that group side by side: the phrases that repeat are how your best users describe you. Look at what the somewhat disappointed would use instead, since that's who you're really competing with, and book the interviews while the answers are fresh.",
      customizeSteps: [
        "Replace 'the product' with your product's name, and adjust the screening options to match how often people normally use it.",
        "Keep the four core questions as they are if you want to compare results with earlier rounds.",
        "Send the link to active users only, then export to CSV and read the very disappointed group's answers on their own.",
      ],
      faqs: [
        {
          q: "What is the Sean Ellis test?",
          a: "A short survey that asks users how they would feel if they could no longer use a product. The share who say very disappointed is used as a signal of product-market fit.",
        },
        {
          q: "What is the 40 percent rule?",
          a: "Sean Ellis suggested that if around 40 percent of active users would be very disappointed without your product, you are likely close to product-market fit. It is a benchmark, not a guarantee.",
        },
        {
          q: "What are the four Sean Ellis questions?",
          a: "How would you feel if you could no longer use the product, what would you use instead, what is the main benefit you get, and how could we improve it. Many teams also ask who would benefit most.",
        },
        {
          q: "Who should take the Sean Ellis survey?",
          a: "People who have used the product recently and more than once. This template screens out anyone who hasn't, so the score reflects real users.",
        },
      ],
    },
  }),
];
