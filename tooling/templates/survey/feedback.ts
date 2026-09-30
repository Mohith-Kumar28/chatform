import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_FEEDBACK: TemplateSeed[] = [
  defineTemplate({
    slug: "product-feedback-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["product-research", "customer-success"],
    searchName: "Product feedback survey",
    title: "Product feedback",
    icon: "ThumbsUp",
    metaDescription:
      "Ask users what they use your product for, where it gets in the way and what to build next. Low scores get asked about the obstacle, high scores about what works.",
    description: "Learn what users rely on, what gets in their way and what they want next.",
    blurb:
      "Starts with the job people hire your product for, then rates it on the things that matter. The overall score decides the next question: happy users are asked what they would hate to lose, and unhappy ones describe the last time it got in their way and whether it blocks them outright.",
    tags: ["product feedback survey", "user feedback", "feature requests", "product research", "branching"],
    greeting: "Thanks for using the product. Five minutes of your honest opinion will shape what we build next.",
    questions: [
      {
        ref: "use_for",
        type: "short_text",
        title: "In a sentence, what do you mainly use it for?",
        required: true,
        maxLength: 200,
      },
      {
        ref: "frequency",
        type: "single_select",
        title: "How often do you use it?",
        required: true,
        options: [
          { label: "Every day" },
          { label: "A few times a week" },
          { label: "A few times a month" },
          { label: "Rarely" },
        ],
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How does it do on each of these?",
        required: false,
        rows: ["Ease of use", "Reliability", "Speed", "Has the features I need", "Help and documentation"],
        columns: ["Poor", "Okay", "Good", "Great"],
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how well does it do the job you use it for?",
        required: true,
        scale: 5,
      },

      // Satisfied users
      {
        ref: "best_part",
        type: "long_text",
        title: "What works best for you? What would you miss most if it disappeared?",
        required: false,
        maxLength: 800,
      },

      // Unhappy users
      {
        ref: "obstacle",
        type: "long_text",
        title: "Tell us about the last time it got in your way. What were you trying to do?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "blocker",
        type: "yes_no",
        title: "Does that stop you getting the work done, or just slow you down?",
        required: true,
        yesLabel: "It stops me",
        noLabel: "It slows me down",
      },

      // Everyone
      {
        ref: "one_change",
        type: "long_text",
        title: "If you could change one thing about the product, what would it be?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Rank these by what you would like us to work on first.",
        required: false,
        items: ["Fixing bugs", "Making it faster", "Making it easier to learn", "New features", "Working with other tools I use"],
      },
      {
        ref: "disappointed",
        type: "single_select",
        title: "How would you feel if you could no longer use the product?",
        required: true,
        options: [{ label: "Very disappointed" }, { label: "Somewhat disappointed" }, { label: "Not disappointed" }],
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend it to a friend or colleague?",
        required: true,
      },
      {
        ref: "follow_up",
        type: "yes_no",
        title: "Could someone from the product team get in touch about your answers?",
        required: true,
      },
      {
        ref: "email",
        type: "email",
        title: "What's the best email to reach you on?",
        description: "We'll only use it to talk about this feedback.",
        required: true,
      },
    ],
    branches: [
      { when: "overall", op: "gte", is: 3, then: "best_part" },
      { when: "overall", op: "lte", is: 2, then: "obstacle" },
      { when: "best_part", always: true, then: "one_change" },
      { when: "follow_up", is: false, then: "end_thanks" },
    ],
    ending: {
      title: "Thank you, this goes straight to the product team",
      body: "We read every answer, and the patterns decide what we fix and build next.",
    },
    guide: {
      questionsToConsider: [
        "Which parts of the product do you want rated separately in the grid?",
        "Should you ask only users who have been active for a few weeks, so they have real experience to report?",
        "What score counts as unhappy for your product, and should it trigger the obstacle questions?",
        "Who on the team will reply to users who agree to be contacted?",
      ],
      howToUseResponses:
        "Group the written answers by the job people use the product for, because the same complaint means different things to a daily user and an occasional one. Treat obstacles marked as blocking as bugs to triage this week. Track the share of users who would be very disappointed to lose the product over time, and reply to everyone who left an email before you start building what they asked for.",
      customizeSteps: [
        "Replace the rows in the grid with the areas of your product you can actually change, such as reporting or the mobile app.",
        "Edit the ranking list so every item is something your team is genuinely weighing up for the roadmap.",
        "Send the link inside the product or by email to active users, and add their plan or account type as a hidden field if you want to compare groups.",
      ],
      faqs: [
        {
          q: "What questions should a product feedback survey ask?",
          a: "Ask what people use the product for, how well it does that job, what gets in their way and what they would change. A recommendation score and a question about how disappointed they would be without it help you track the trend.",
        },
        {
          q: "Should I ask users which feature to build next?",
          a: "Ask what problem the feature would solve rather than taking the request as written. This survey asks for the last time the product got in the way, which usually points to the real need.",
        },
        {
          q: "How often should I send a product feedback survey?",
          a: "Every few months to the same group is enough to spot trends without tiring people out. Send it sooner after a big release.",
        },
        {
          q: "Can I change the questions?",
          a: "Yes. Use this template copies the survey into your account, where you can edit every question and branch, then share it as a link or embed it in your product or website.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "branding-questionnaire",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "onboard-clients"],
    roles: ["freelancers-agencies", "marketing"],
    searchName: "Branding questionnaire",
    title: "Branding questionnaire",
    icon: "Palette",
    metaDescription:
      "A brand discovery questionnaire for designers and agencies: business, audience, personality, competitors and deliverables. Rebrands also get asked what to keep.",
    description: "Everything a designer needs to know about a business before brand work starts.",
    blurb:
      "Covers the business, the customer, the personality and the practical scope, so the first meeting starts from answers instead of a blank page. Clients refreshing an existing brand are asked what works now, what doesn't and to upload their current files. A brand new business skips straight to its audience.",
    tags: ["branding questionnaire", "brand discovery", "design brief", "client onboarding", "agency intake"],
    greeting: "Before we start on your brand, we'd like to understand the business behind it. This takes about ten minutes.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, who are we working with?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "business_name", type: "short_text", title: "What's the name of the business?", required: true, maxLength: 120 },
      { ref: "website", type: "url", title: "Do you have a website? Paste the link if so.", required: false },
      {
        ref: "what_you_do",
        type: "long_text",
        title: "Describe what the business does, the way you'd explain it to a friend.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "stage",
        type: "single_select",
        title: "Which of these fits best?",
        required: true,
        options: [
          { label: "A new business with no brand yet" },
          { label: "A refresh of our existing brand" },
          { label: "A full rebrand" },
        ],
      },

      // Existing brands
      {
        ref: "keep",
        type: "long_text",
        title: "What about the current brand is working and should stay?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "change_why",
        type: "long_text",
        title: "What isn't working any more? What made you decide to change it now?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "current_files",
        type: "file_upload",
        title: "Upload your current logo and any brand files you have.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
        maxSizeMB: 20,
      },

      // Everyone
      {
        ref: "audience",
        type: "long_text",
        title: "Who is your ideal customer? Describe one real person if you can.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "competitors",
        type: "long_text",
        title: "Name two or three competitors, and how you want people to see you differently from them.",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "personality",
        type: "multi_select",
        title: "Pick three words that should describe the brand.",
        required: true,
        minSelections: 3,
        maxSelections: 3,
        options: [
          { label: "Friendly" },
          { label: "Premium" },
          { label: "Bold" },
          { label: "Calm" },
          { label: "Playful" },
          { label: "Trustworthy" },
          { label: "Expert" },
          { label: "Down to earth" },
          { label: "Inventive" },
          { label: "Warm" },
        ],
      },
      {
        ref: "tone",
        type: "opinion_scale",
        title: "Where should the brand sit between playful and serious?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Playful",
        labelHigh: "Serious",
      },
      {
        ref: "admired",
        type: "long_text",
        title: "Which brands, in any industry, do you admire? What do you like about them?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "avoid",
        type: "long_text",
        title: "Is anything off the table? Colours, styles or ideas you don't want.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "deliverables",
        type: "multi_select",
        title: "What do you need from this project?",
        required: true,
        options: [
          { label: "Logo" },
          { label: "Colour palette and typography" },
          { label: "Brand guidelines" },
          { label: "Messaging and tagline" },
          { label: "Website design" },
          { label: "Social media templates" },
          { label: "Packaging or print" },
        ],
      },
      {
        ref: "deadline",
        type: "date",
        title: "Is there a launch date we should work toward?",
        required: false,
        disablePast: true,
      },
      {
        ref: "decision_maker",
        type: "short_text",
        title: "Who has the final say on the brand, and will they be in the review meetings?",
        required: false,
        maxLength: 200,
      },
    ],
    branches: [
      { when: "stage", is: "A new business with no brand yet", then: "audience" },
      { when: "stage", is: "A refresh of our existing brand", then: "keep" },
      { when: "stage", is: "A full rebrand", then: "keep" },
    ],
    ending: {
      title: "Thank you, that's a great start 🎨",
      body: "We'll read through your answers before our first call and come prepared with questions.",
    },
    guide: {
      questionsToConsider: [
        "Which deliverables do you actually offer, and should the list match your service packages?",
        "Do you want the personality words chosen by one person, or collected from several people at the client?",
        "Should the budget be asked here, or saved for the first call?",
        "What files do you need from a client who is refreshing an existing brand?",
      ],
      howToUseResponses:
        "Turn the answers into a one-page brief before the kickoff call: the business in one sentence, the ideal customer, the three personality words and what is off the table. Where the client's words and their competitor answers pull in different directions, raise it early, because that tension is usually where the positioning work is. Keep the uploaded files with the project so nobody asks for them twice.",
      customizeSteps: [
        "Edit the deliverables list to match the services you sell, and remove anything you don't offer.",
        "Swap the personality words for a set that suits the industries you usually work in.",
        "Send the link as soon as a client signs, and ask for it back before the kickoff meeting is booked.",
      ],
      faqs: [
        {
          q: "What should a branding questionnaire include?",
          a: "What the business does, who it serves, how it differs from competitors, the personality it should have and the practical scope, such as deliverables and deadlines. For a rebrand, also ask what should stay and why the change is happening now.",
        },
        {
          q: "Who should fill in a branding questionnaire?",
          a: "The person who makes the final decision, plus anyone who knows the customers well. If several people answer, compare their responses before the first meeting, since disagreement is common and worth resolving early.",
        },
        {
          q: "How long should a brand questionnaire take?",
          a: "About ten to fifteen minutes. Long enough to give the designer real material, short enough that the client finishes it in one sitting.",
        },
        {
          q: "Can I add my own questions?",
          a: "Yes. Use this template copies it into your account, where you can edit every question and branch, then send it as a link or embed it on your website.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "cancellation-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["product-research", "customer-success"],
    searchName: "Cancellation survey",
    title: "Cancellation survey",
    icon: "DoorOpen",
    metaDescription:
      "Find out why customers cancel a subscription or service. The reason they pick decides the one follow-up worth asking, and nobody is pushed to stay.",
    description: "Find out why people leave, and ask each of them the one follow-up that fits.",
    blurb:
      "The exit is the most honest moment you get, and the reason decides what is worth asking next. Price gets a question about what would have felt fair, a missing feature gets asked which one, and a switch to a competitor gets asked what they do better. \"No longer need it\" is left alone. Nobody is talked out of leaving.",
    tags: ["cancellation survey", "churn survey", "exit survey", "subscription cancellation", "branching"],
    greeting: "Sorry to see you go. A couple of quick questions, and then you're done. Your cancellation goes ahead either way.",
    questions: [
      {
        ref: "reason",
        type: "single_select",
        title: "What's the main reason you're cancelling?",
        required: true,
        options: [
          { label: "Too expensive" },
          { label: "Missing a feature I need" },
          { label: "Too hard to use" },
          { label: "Found a better alternative" },
          { label: "I didn't use it enough" },
          { label: "No longer need it" },
          { label: "Something else" },
        ],
      },

      // Price
      {
        ref: "price_fair",
        type: "single_select",
        title: "What would have felt fair?",
        required: false,
        options: [
          { label: "A lower price for the same thing" },
          { label: "A smaller plan with fewer features" },
          { label: "The price was fine, the value wasn't there" },
          { label: "Paying monthly instead of yearly, or the other way round" },
        ],
      },

      // Missing feature
      { ref: "missing_feature", type: "short_text", title: "Which feature were you missing?", required: true, maxLength: 200 },
      {
        ref: "missing_blocked",
        type: "yes_no",
        title: "Did that block you outright, or just slow you down?",
        required: false,
        yesLabel: "Blocked me",
        noLabel: "Slowed me down",
      },

      // Too hard to use
      {
        ref: "hard_where",
        type: "long_text",
        title: "Where did it lose you?",
        required: false,
        maxLength: 800,
      },

      // A competitor
      { ref: "competitor", type: "short_text", title: "What are you moving to?", required: false, maxLength: 120 },
      {
        ref: "competitor_why",
        type: "long_text",
        title: "What do they do better?",
        required: false,
        maxLength: 800,
      },

      // Didn't use it enough
      {
        ref: "low_use_why",
        type: "single_select",
        title: "What got in the way of using it more?",
        required: false,
        options: [
          { label: "I never finished setting it up" },
          { label: "I forgot about it" },
          { label: "It didn't fit how I work" },
          { label: "I didn't have the time" },
        ],
      },

      // Everyone
      {
        ref: "tenure",
        type: "single_select",
        title: "How long were you with us?",
        required: false,
        options: [
          { label: "Less than a month" },
          { label: "1–6 months" },
          { label: "6–12 months" },
          { label: "Over a year" },
        ],
      },
      { ref: "detail", type: "long_text", title: "Anything else you'd like us to know?", required: false, maxLength: 1000 },
      {
        ref: "would_return",
        type: "yes_no",
        title: "Would you consider coming back if we fixed what made you leave?",
        required: false,
        yesLabel: "Maybe",
        noLabel: "Unlikely",
      },
      {
        ref: "keep_in_touch",
        type: "email",
        title: "Want us to tell you when we do? Leave your email.",
        description: "Only for this. No marketing.",
        required: false,
      },
    ],
    branches: [
      { when: "reason", is: "Too expensive", then: "price_fair" },
      { when: "reason", is: "Missing a feature I need", then: "missing_feature" },
      { when: "reason", is: "Too hard to use", then: "hard_where" },
      { when: "reason", is: "Found a better alternative", then: "competitor" },
      { when: "reason", is: "I didn't use it enough", then: "low_use_why" },
      { when: "reason", is: "No longer need it", then: "tenure" },
      { when: "reason", is: "Something else", then: "tenure" },
      { when: "price_fair", always: true, then: "tenure" },
      { when: "missing_blocked", always: true, then: "tenure" },
      { when: "hard_where", always: true, then: "tenure" },
      { when: "competitor_why", always: true, then: "tenure" },
      { when: "would_return", is: false, then: "end_thanks" },
      { when: "keep_in_touch", op: "is_not_empty", then: "end_notify" },
    ],
    ending: {
      title: "Thanks for the honesty 👋",
      body: "Your cancellation is not affected by anything you said here.",
    },
    endings: [
      {
        ref: "end_notify",
        title: "Thanks, we'll let you know",
        body: "We'll write once, when what you told us about has changed. Your cancellation goes ahead as normal.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Do the reasons in the first question match the reasons your support team hears most often?",
        "Should the survey appear inside the cancellation flow, or arrive by email right after it?",
        "Who reads the answers from people who switched to a competitor?",
        "Will you really write to people who leave an email, and who owns that promise?",
      ],
      howToUseResponses:
        "Count the reasons every month and watch which one grows. Read the follow-ups by reason, not all at once: a price complaint and a missing feature need different owners. Send the competitor answers to whoever plans the roadmap, and keep a list of emails against the problem each person named so you can write to them when it is fixed.",
      customizeSteps: [
        "Edit the reasons to match your product, and add a follow-up for any new reason that deserves one.",
        "Show the link on the cancellation confirmation page or in the confirmation email, never as a step people must complete to cancel.",
        "Add the customer's plan as a hidden field so you can see which plans lose people and why.",
      ],
      faqs: [
        {
          q: "What should a cancellation survey ask?",
          a: "Start with the main reason for leaving, then ask one follow-up that fits that reason. An optional comment and a question about whether they would come back are usually all you need.",
        },
        {
          q: "Should a cancellation survey be required?",
          a: "No. Making people explain themselves before they can leave frustrates them and produces rushed answers. Keep it optional and separate from the cancellation itself.",
        },
        {
          q: "How long should a cancellation survey be?",
          a: "Short. Each person here answers the reason, one or two follow-ups and a few optional questions, because the branching skips everything that doesn't apply.",
        },
        {
          q: "What is the difference between a cancellation survey and a churn survey?",
          a: "A cancellation survey is shown at the moment someone cancels. A churn survey is often sent later, to people who stopped using the product, and can ask more about what changed.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-success-story-questionnaire",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["marketing", "customer-success"],
    searchName: "Customer success story questionnaire",
    title: "Customer success story",
    icon: "Quote",
    metaDescription:
      "Gather material for a case study: the problem, why they chose you, how they use it and the results, and permission to publish with their name or anonymously.",
    description: "Collect a customer's story in their own words, ready to shape into a case study.",
    blurb:
      "Walks a customer through the story in the order a case study is written: before, the decision, the day to day and the results. Anyone with a figure to share is asked how they measured it. Customers who agree to be named are asked for a headshot, and those who prefer to stay anonymous are asked how they'd like to be described.",
    tags: ["customer success story", "case study questionnaire", "customer testimonial", "case study interview", "b2b marketing"],
    greeting: "Thanks for agreeing to share your story. Answer in your own words; we'll do the tidying up and show you the draft before anything goes out.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Let's start with your details.",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "Which company do you work for?", required: true, maxLength: 120 },
      { ref: "job_title", type: "short_text", title: "What's your job title?", required: true, maxLength: 120 },
      {
        ref: "company_does",
        type: "long_text",
        title: "In two or three sentences, what does your company do?",
        required: true,
        maxLength: 600,
      },
      {
        ref: "before",
        type: "long_text",
        title: "Before you started working with us, what problem were you trying to solve?",
        description: "What was it costing you in time, money or stress?",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "previous",
        type: "single_select",
        title: "How were you handling it before?",
        required: false,
        allowOther: true,
        options: [
          { label: "With another product like ours" },
          { label: "With spreadsheets or manual work" },
          { label: "With an agency or contractor" },
          { label: "We weren't handling it at all" },
        ],
      },
      {
        ref: "why_chose",
        type: "long_text",
        title: "Why did you choose us over the other options?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "how_use",
        type: "long_text",
        title: "How does your team use it day to day?",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "results",
        type: "long_text",
        title: "What has changed since you started?",
        description: "Think about time saved, money saved, growth, or things you can do now that you couldn't before.",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "has_figure",
        type: "yes_no",
        title: "Do you have a figure we could publish, such as hours saved each week?",
        required: true,
      },
      {
        ref: "figure",
        type: "short_text",
        title: "What's the figure, and how did you measure it?",
        required: true,
        maxLength: 300,
      },
      {
        ref: "advice",
        type: "long_text",
        title: "What would you say to someone who is weighing us up right now?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "named",
        type: "yes_no",
        title: "Can we publish the story with your name, job title and company?",
        description: "You'll approve the final wording either way.",
        required: true,
        yesLabel: "Yes, name me",
        noLabel: "Keep me anonymous",
      },

      // Named
      {
        ref: "headshot",
        type: "file_upload",
        title: "Could you upload a photo of yourself to go with your quote?",
        description: "A clear, well-lit headshot works best. Team or office photos are welcome too.",
        required: false,
        accept: ["image/*"],
        maxFiles: 4,
        maxSizeMB: 15,
      },

      // Anonymous
      {
        ref: "anon_description",
        type: "short_text",
        title: "How should we describe you instead?",
        description: "For example, \"Operations lead at a logistics company\".",
        required: true,
        maxLength: 150,
      },

      // Everyone
      {
        ref: "call_ok",
        type: "yes_no",
        title: "Would you be open to a short call so we can fill in any gaps?",
        required: true,
      },
    ],
    branches: [
      { when: "has_figure", is: false, then: "advice" },
      { when: "named", is: true, then: "headshot" },
      { when: "named", is: false, then: "anon_description" },
      { when: "headshot", always: true, then: "call_ok" },
      { when: "call_ok", is: true, then: "end_call" },
    ],
    ending: {
      title: "Thank you for sharing your story",
      body: "We'll write it up and send you the draft to approve before anything is published.",
    },
    endings: [
      {
        ref: "end_call",
        title: "Thank you, we'll be in touch to book a call 🙌",
        body: "Expect an email with a few times to choose from. We'll send the draft after we speak.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Which results matter most to your prospects, and should the results question name them?",
        "Do you need legal sign-off before publishing a customer's name or figures?",
        "Will you write the story from these answers alone, or use them to prepare for an interview?",
        "Where will the story appear: your website, sales decks, or social posts?",
      ],
      howToUseResponses:
        "Read the answers in order and you have the outline of the case study: the problem, the decision, the day to day and the result. Check every figure against how the customer said they measured it before it goes near a headline. Send the draft back for approval, and use the call for the details the written answers left thin, such as a memorable quote.",
      customizeSteps: [
        "Rename the options in the \"How were you handling it before?\" question to the alternatives your customers actually leave behind.",
        "Edit the results question to prompt for the outcomes your product is known for.",
        "Send the link to customers your team already knows are happy, with a short personal note, rather than to your whole list.",
      ],
      faqs: [
        {
          q: "What questions should I ask for a customer success story?",
          a: "Ask about the problem before they found you, why they chose you, how they use your product or service and what has changed since. A figure with a clear source makes the story far more convincing.",
        },
        {
          q: "Can I publish a customer's answers as a case study?",
          a: "Only with their permission. This questionnaire asks whether they want to be named, and you should still send the finished story for approval before publishing it.",
        },
        {
          q: "Should a case study questionnaire replace the interview?",
          a: "It can for a short story. For a longer one, use the answers to prepare, then use the call to dig into the most interesting parts.",
        },
        {
          q: "Can I edit this questionnaire?",
          a: "Yes. Use this template copies it into your account, where you can edit every question, then send it as a link to the customers you choose.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "email-design-questionnaire",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "onboard-clients"],
    roles: ["freelancers-agencies", "marketing"],
    searchName: "Email design questionnaire",
    title: "Email design brief",
    icon: "Mail",
    metaDescription:
      "Brief an email designer properly: the type of email, audience, main action, copy, brand files, sending platform and deadline. Series and brand files get follow-ups.",
    description: "Collect the audience, message, action and practical limits before designing an email.",
    blurb:
      "Asks what a designer needs before opening a layout tool: who the email is for, the one action it should drive, who writes the copy and what it must work with. Clients ordering a series are asked how many emails, and anyone with brand guidelines is asked to upload them.",
    tags: ["email design questionnaire", "email design brief", "newsletter design", "email template request", "client intake"],
    greeting: "Let's plan your email. A few questions now saves a round of revisions later.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should we send the designs to?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "Which company or brand is this for?", required: true, maxLength: 120 },
      {
        ref: "email_type",
        type: "single_select",
        title: "What kind of email is it?",
        required: true,
        allowOther: true,
        options: [
          { label: "Newsletter" },
          { label: "Promotion or sale" },
          { label: "Product announcement" },
          { label: "Welcome or onboarding email" },
          { label: "Event invitation" },
          { label: "Receipt or confirmation" },
        ],
      },
      {
        ref: "scope",
        type: "single_select",
        title: "Is this a single email or something you'll reuse?",
        required: true,
        options: [{ label: "A one-off send" }, { label: "A reusable template" }, { label: "A series of emails" }],
      },
      {
        ref: "series_count",
        type: "number",
        title: "How many emails are in the series?",
        required: true,
        min: 2,
        max: 30,
        integerOnly: true,
      },
      {
        ref: "audience",
        type: "long_text",
        title: "Who will receive it, and what do they already know about you?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "main_action",
        type: "long_text",
        title: "What is the one thing a reader should do after opening it?",
        required: true,
        maxLength: 400,
      },
      { ref: "cta_link", type: "url", title: "Where should the main button link to?", required: false },
      {
        ref: "copy",
        type: "single_select",
        title: "Who is writing the words?",
        required: true,
        options: [
          { label: "We'll supply final copy" },
          { label: "We have a draft that needs editing" },
          { label: "We need you to write it" },
        ],
      },
      {
        ref: "has_brand",
        type: "yes_no",
        title: "Do you have brand guidelines, such as a logo, colours and fonts?",
        required: true,
      },
      {
        ref: "brand_files",
        type: "file_upload",
        title: "Upload your logo and brand guidelines.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
        maxSizeMB: 20,
      },
      {
        ref: "platform",
        type: "short_text",
        title: "Which email platform will you send it from?",
        description: "We'll build and test it in the tool you'll actually send with.",
        required: false,
        maxLength: 120,
      },
      {
        ref: "must_haves",
        type: "multi_select",
        title: "Which of these does it need to handle?",
        required: false,
        minSelections: 0,
        options: [
          { label: "Looks right in dark mode" },
          { label: "A plain-text version" },
          { label: "Personal details like the reader's first name" },
          { label: "More than one language" },
          { label: "Easy to read with a screen reader" },
          { label: "Images we can swap for each send" },
        ],
      },
      {
        ref: "examples",
        type: "long_text",
        title: "Share a couple of emails you've enjoyed receiving, and what you liked about them.",
        required: false,
        maxLength: 800,
      },
      {
        ref: "send_date",
        type: "date",
        title: "When does it need to go out?",
        required: false,
        disablePast: true,
      },
    ],
    branches: [
      { when: "scope", is: "A series of emails", then: "series_count" },
      { when: "scope", is: "A one-off send", then: "audience" },
      { when: "scope", is: "A reusable template", then: "audience" },
      { when: "has_brand", is: false, then: "platform" },
    ],
    ending: {
      title: "Thanks, we have what we need to start",
      body: "We'll review the brief and come back with any questions before the first draft.",
    },
    guide: {
      questionsToConsider: [
        "Do you also write copy, or should the copy question only ask whether it will be ready on time?",
        "Which sending platforms can you build for, and should the platform question list only those?",
        "What do you need to see before quoting a series of emails rather than one?",
        "Should you ask for past campaign results, or keep this brief about the design only?",
      ],
      howToUseResponses:
        "Write the main action at the top of your design file and check every draft against it; if the button isn't the obvious next step, the layout needs work. Plan time for copy when the client asked you to write or edit it. Build and test in the platform they named, and use the must-haves list as your checklist before you send the proof.",
      customizeSteps: [
        "Edit the email types to the ones you design most, and remove the copy question if you never write copy.",
        "Replace the must-haves list with the technical checks you include in every project.",
        "Put the link in your proposal or first reply to a new client, and ask for it back before you start the first draft.",
      ],
      faqs: [
        {
          q: "What should an email design brief include?",
          a: "The type of email, who receives it, the one action it should drive, where the button links, who writes the copy, brand files, the sending platform and the send date.",
        },
        {
          q: "What should you decide before designing an email?",
          a: "The audience and the main action. Layout, imagery and length follow from those, and without them the design turns into guesswork.",
        },
        {
          q: "Why ask which platform will send the email?",
          a: "Each platform handles layout and editing a little differently. Knowing it up front means the design is built and tested where it will actually be sent.",
        },
        {
          q: "Can I change the questions for my clients?",
          a: "Yes. Use this template copies the questionnaire into your account, where you can edit every question and branch, then share it as a link or embed it on your site.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "lead-generation-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "generate-leads", "conduct-research"],
    roles: ["marketing", "sales"],
    searchName: "Lead generation survey",
    title: "Lead generation survey",
    icon: "Target",
    metaDescription:
      "A lead generation survey that asks about needs first and contact details last. People who want a call get their own path; others can leave without sharing an email.",
    description: "Learn what potential buyers need, then invite the ones who want help to talk.",
    blurb:
      "Asks about the problem, what has been tried and how urgent it is before asking for any details, so people answer as themselves rather than as a lead. At the end they choose what they want from you: a call, a written summary, or nothing at all. Each choice gets its own path and its own sign-off.",
    tags: ["lead generation survey", "lead capture", "prospect research", "b2b survey", "branching"],
    greeting: "We're learning how teams like yours handle this problem. A few quick questions, and you decide at the end whether we follow up.",
    questions: [
      {
        ref: "role",
        type: "single_select",
        title: "Which best describes your role?",
        required: true,
        allowOther: true,
        options: [{ label: "Founder or owner" }, { label: "Marketing" }, { label: "Sales" }, { label: "Operations" }],
      },
      {
        ref: "company_size",
        type: "single_select",
        title: "How many people work at your company?",
        required: true,
        options: [
          { label: "Just me" },
          { label: "2–10" },
          { label: "11–50" },
          { label: "51–200" },
          { label: "More than 200" },
        ],
      },
      {
        ref: "challenge",
        type: "long_text",
        title: "What's the biggest challenge you're trying to solve right now?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "tried",
        type: "multi_select",
        title: "What have you tried so far?",
        required: true,
        options: [
          { label: "Handling it ourselves" },
          { label: "Hiring someone for it" },
          { label: "Software or a tool" },
          { label: "An agency or consultant" },
          { label: "Nothing yet" },
        ],
      },
      {
        ref: "impact",
        type: "opinion_scale",
        title: "How much is this problem holding you back?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "A minor nuisance",
        labelHigh: "A serious problem",
      },
      {
        ref: "timeline",
        type: "single_select",
        title: "When would you like it solved?",
        required: true,
        options: [
          { label: "Within a month" },
          { label: "In the next 1–3 months" },
          { label: "Later this year" },
          { label: "No plans, just researching" },
        ],
      },
      {
        ref: "next_step",
        type: "single_select",
        title: "What would be most useful from us?",
        required: true,
        options: [
          { label: "A short call to talk it through" },
          { label: "A written summary with suggestions" },
          { label: "The survey findings when they're ready" },
          { label: "Nothing for now, thanks" },
        ],
      },

      // Wants a call
      {
        ref: "call_contact",
        type: "contact_info",
        title: "Where can we reach you to set up the call?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },

      // Wants something in writing
      {
        ref: "email_contact",
        type: "contact_info",
        title: "Where should we send it?",
        description: "We'll only use this to send what you asked for.",
        required: true,
        fields: ["first_name", "email"],
      },
    ],
    branches: [
      { when: "next_step", is: "A short call to talk it through", then: "call_contact" },
      { when: "next_step", is: "A written summary with suggestions", then: "email_contact" },
      { when: "next_step", is: "The survey findings when they're ready", then: "email_contact" },
      { when: "next_step", is: "Nothing for now, thanks", then: "end_research" },
      { when: "call_contact", always: true, then: "end_call" },
    ],
    ending: {
      title: "Thanks, we'll send it by email",
      body: "Look out for it in your inbox. We'll only send what you asked for.",
    },
    endings: [
      {
        ref: "end_call",
        title: "Thanks, we'll be in touch to book a call 📞",
        body: "Someone who knows this problem well will contact you within a couple of working days.",
      },
      {
        ref: "end_research",
        title: "Thanks for your answers",
        body: "That's everything. We won't contact you, but you're welcome to come back if that changes.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What is the problem your product or service solves, and does the challenge question name it clearly enough?",
        "Which answers make someone a strong lead for you: company size, urgency, or both?",
        "What will you actually send to people who ask for a written summary, and how quickly?",
        "Will you publish the findings, and when?",
      ],
      howToUseResponses:
        "Call the people who asked for a call first, starting with those who need it solved within a month and rated the problem as serious. Use their own words from the challenge question when you open the conversation. Read the answers from people who chose nothing as research: they tell you how the market describes the problem without any sales pressure on the answer.",
      customizeSteps: [
        "Rewrite the greeting and the challenge question around the specific problem your business solves.",
        "Edit the company size bands and roles to match the buyers you want to hear from.",
        "Share the link in a newsletter, on social media or embedded on a relevant page, and add the source as a hidden field so you know which channel brought the best leads.",
      ],
      faqs: [
        {
          q: "What is a lead generation survey?",
          a: "A short survey that asks potential customers about their needs and invites them to share contact details if they want a follow-up. It gives you useful research and warmer leads in one step.",
        },
        {
          q: "How is a lead generation survey different from a lead form?",
          a: "A lead form asks for contact details first. A survey asks about the person's situation first, so the follow-up can be about their problem rather than a generic pitch.",
        },
        {
          q: "Should I ask for an email at the start or the end?",
          a: "At the end, and only from people who want something from you. People answer more honestly when they haven't been asked to identify themselves first.",
        },
        {
          q: "Can I route strong leads to my sales team?",
          a: "This survey sends people who ask for a call to their own ending, and you can see them in the dashboard or export responses to CSV. You can add branches for other signals, such as company size.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "saas-onboarding-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "onboard-clients"],
    roles: ["product-research", "customer-success"],
    searchName: "SaaS onboarding survey",
    title: "SaaS onboarding survey",
    icon: "Rocket",
    metaDescription:
      "Ask new users what they signed up to do, whether they got there and where setup got hard. Stuck users get their own follow-up and can ask for a walkthrough.",
    description: "Find out whether new users reached their first goal, and where setup stopped them.",
    blurb:
      "Built around the first thing a new user wanted to get done. People who got there easily move on quickly, people who struggled say which part took effort, and people who are still stuck name the step and describe it. Anyone can ask for a walkthrough at the end, and those who do get their own ending.",
    tags: ["saas onboarding survey", "user onboarding", "activation", "customer effort score", "branching"],
    greeting: "Welcome aboard. Tell us how your first few days went, so we can make them easier for you and everyone after you.",
    questions: [
      {
        ref: "first_goal",
        type: "long_text",
        title: "When you signed up, what were you hoping to get done first?",
        required: true,
        maxLength: 600,
      },
      {
        ref: "team_setup",
        type: "single_select",
        title: "How are you using it?",
        required: true,
        options: [
          { label: "Just for myself" },
          { label: "With a small team" },
          { label: "I'm setting it up for my whole company" },
        ],
      },
      {
        ref: "got_there",
        type: "single_select",
        title: "Have you managed to do that yet?",
        required: true,
        options: [{ label: "Yes, easily" }, { label: "Yes, but it took some effort" }, { label: "Not yet" }],
      },

      // Still stuck
      {
        ref: "stuck_where",
        type: "single_select",
        title: "Where did you get stuck?",
        required: true,
        allowOther: true,
        options: [
          { label: "Signing up or signing in" },
          { label: "Bringing in my data" },
          { label: "Connecting other tools" },
          { label: "Inviting my team" },
          { label: "Understanding how it works" },
          { label: "Finding the feature I needed" },
        ],
      },
      {
        ref: "stuck_detail",
        type: "long_text",
        title: "What happened at that point?",
        required: false,
        maxLength: 1000,
      },

      // Took effort
      {
        ref: "effort_where",
        type: "long_text",
        title: "Which part took the most effort, and why?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "setup_ease",
        type: "opinion_scale",
        title: "Overall, how easy was it to get set up?",
        required: true,
        steps: 7,
        startAt: 1,
        labelLow: "Very difficult",
        labelHigh: "Very easy",
      },
      {
        ref: "clarity",
        type: "matrix",
        title: "How clear was each of these?",
        required: false,
        rows: ["What the product does", "Your first steps after signing up", "Where to find help", "What your plan includes"],
        columns: ["Clear", "Somewhat clear", "Confusing"],
      },
      {
        ref: "helped",
        type: "multi_select",
        title: "What helped you get started?",
        required: false,
        minSelections: 0,
        options: [
          { label: "The in-app guide or checklist" },
          { label: "Help articles" },
          { label: "Videos" },
          { label: "Talking to our team" },
          { label: "I worked it out myself" },
        ],
      },
      {
        ref: "confidence",
        type: "rating",
        title: "How confident do you feel using it on your own now?",
        required: true,
        scale: 5,
      },
      {
        ref: "first_week",
        type: "long_text",
        title: "What's one thing that would have made your first week easier?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "want_help",
        type: "yes_no",
        title: "Would you like a short walkthrough with someone from our team?",
        required: true,
      },
      {
        ref: "help_email",
        type: "email",
        title: "What's the best email to arrange it?",
        required: true,
      },
    ],
    branches: [
      { when: "got_there", is: "Not yet", then: "stuck_where" },
      { when: "got_there", is: "Yes, but it took some effort", then: "effort_where" },
      { when: "got_there", is: "Yes, easily", then: "setup_ease" },
      { when: "stuck_detail", always: true, then: "setup_ease" },
      { when: "want_help", is: false, then: "end_thanks" },
      { when: "help_email", always: true, then: "end_help" },
    ],
    ending: {
      title: "Thanks, this helps the next person too",
      body: "We look at every answer to find the steps that slow people down.",
    },
    endings: [
      {
        ref: "end_help",
        title: "Thanks, we'll be in touch 🚀",
        body: "Someone from our team will email you to find a time for your walkthrough.",
      },
    ],
    guide: {
      questionsToConsider: [
        "How many days after sign-up has a new user done enough to answer well?",
        "Do the options in \"Where did you get stuck?\" match the real steps of your setup?",
        "Who replies to walkthrough requests, and how quickly can they respond?",
        "Should admins setting up a whole company get extra questions about permissions or rollout?",
      ],
      howToUseResponses:
        "Count where stuck users got stuck: the step named most often is the one to fix first. Compare the ease score between people who used the in-app guide and people who worked it out themselves. Reply to every walkthrough request within a day, because a new user who asked for help and heard nothing rarely comes back.",
      customizeSteps: [
        "Edit the stuck options to match the actual steps of your product's setup, in order.",
        "Change the clarity grid rows to the moments in your onboarding you are least sure about.",
        "Send the link by email a few days after sign-up, and add the user's plan or sign-up date as a hidden field.",
      ],
      faqs: [
        {
          q: "When should I send a SaaS onboarding survey?",
          a: "A few days to a week after sign-up, once people have tried the product but before they have given up on it. Too early and there is nothing to report; too late and the struggling users are gone.",
        },
        {
          q: "What should an onboarding survey ask?",
          a: "What the user wanted to do first, whether they managed it, where they got stuck and how easy setup felt. Those answers point straight at the steps to fix.",
        },
        {
          q: "What is a customer effort score?",
          a: "A rating of how easy something was to do, usually on a scale from very difficult to very easy. This survey uses one for setup as a whole.",
        },
        {
          q: "Can I edit this onboarding survey?",
          a: "Yes. Use this template copies it into your account, where you can change every question and branch, then share it by link or embed it in your app.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "client-satisfaction-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["customer-success", "freelancers-agencies", "operations"],
    searchName: "Client satisfaction survey",
    title: "Client satisfaction",
    icon: "SmilePlus",
    metaDescription:
      "A client satisfaction survey for ongoing clients: results, communication and value. Clients unsure about renewing are offered a call before they decide.",
    description: "Check in with ongoing clients on results, communication and whether they plan to stay.",
    blurb:
      "Made for a regular check-in with retained clients rather than a one-off project debrief. Clients whose results fell short are asked where and what would put it right, and the rest are asked what they'd hate to lose. Anyone unsure about continuing is offered a call from their account lead, and those who accept get their own ending.",
    tags: ["client satisfaction survey", "client check-in", "account review", "client retention", "agency survey"],
    greeting: "Thanks for working with us. We'd like to know how things are really going. This takes about three minutes.",
    questions: [
      {
        ref: "service",
        type: "short_text",
        title: "Which service or account are you answering about?",
        required: true,
        maxLength: 150,
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how satisfied are you with working with us?",
        required: true,
        scale: 5,
      },
      {
        ref: "areas",
        type: "matrix",
        title: "How satisfied are you with each of these?",
        required: false,
        rows: [
          "Quality of the work",
          "How quickly we respond",
          "Updates on progress",
          "How well we understand your business",
          "Value for money",
        ],
        columns: ["Dissatisfied", "Neutral", "Satisfied", "Very satisfied"],
      },
      {
        ref: "expectations",
        type: "single_select",
        title: "Compared with what you expected when you hired us, the results have been...",
        required: true,
        options: [{ label: "Better than expected" }, { label: "About what I expected" }, { label: "Below what I expected" }],
      },

      // Meeting expectations
      {
        ref: "keep_doing",
        type: "long_text",
        title: "What's one thing we do that you'd hate to lose?",
        required: false,
        maxLength: 600,
      },

      // Below expectations
      {
        ref: "shortfall",
        type: "long_text",
        title: "Where have we fallen short?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "put_right",
        type: "long_text",
        title: "What would put it right?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "update_pref",
        type: "single_select",
        title: "How often would you like to hear from us?",
        required: false,
        options: [
          { label: "Every week" },
          { label: "Every two weeks" },
          { label: "Once a month" },
          { label: "Only when something needs my input" },
        ],
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend us to someone in your position?",
        required: true,
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Anything else you'd like us to know?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "continue",
        type: "single_select",
        title: "Are you planning to keep working with us?",
        required: true,
        options: [{ label: "Yes" }, { label: "Probably" }, { label: "Not sure yet" }, { label: "Planning to stop" }],
      },
      {
        ref: "callback",
        type: "yes_no",
        title: "Would you like a call with your account lead before you decide?",
        required: true,
      },
    ],
    branches: [
      { when: "expectations", is: "Better than expected", then: "keep_doing" },
      { when: "expectations", is: "About what I expected", then: "keep_doing" },
      { when: "expectations", is: "Below what I expected", then: "shortfall" },
      { when: "keep_doing", always: true, then: "update_pref" },
      { when: "continue", is: "Yes", then: "end_thanks" },
      { when: "continue", is: "Probably", then: "end_thanks" },
      { when: "callback", is: true, then: "end_callback" },
    ],
    ending: {
      title: "Thank you for the honest feedback",
      body: "Your account lead will read your answers this week.",
    },
    endings: [
      {
        ref: "end_callback",
        title: "Thanks, your account lead will call you",
        body: "Expect to hear from them within a couple of working days, so you can talk it through before deciding anything.",
      },
    ],
    guide: {
      questionsToConsider: [
        "How often should clients get this survey: quarterly, or at each renewal?",
        "Which parts of your service should be rated separately in the grid?",
        "Who calls a client who is unsure about continuing, and how fast?",
        "Should the account or service be a hidden field instead of a question the client types?",
      ],
      howToUseResponses:
        "Look at every client who picked \"Below what I expected\" or \"Planning to stop\" before anything else, and make sure a senior person replies. Compare the grid across accounts every quarter to see whether one area, such as progress updates, is slipping everywhere. Use the update preference to set each client's reporting rhythm, which is a small change clients notice.",
      customizeSteps: [
        "Rename the grid rows to the parts of the service you deliver, such as reporting, strategy or support.",
        "Change the renewal question to match how your contracts work, such as monthly retainers or annual terms.",
        "Send the link from the account lead's own email, and add the client name as a hidden field if you send it to many accounts.",
      ],
      faqs: [
        {
          q: "What questions should a client satisfaction survey include?",
          a: "Overall satisfaction, ratings for the parts of your service that matter, whether results met expectations, a recommendation question and whether they plan to continue. Leave room for comments, because the reasons are more useful than the scores.",
        },
        {
          q: "How often should I send a client satisfaction survey?",
          a: "Quarterly works for most retained clients, with an extra one a month or two before renewal. More often than that starts to feel like admin.",
        },
        {
          q: "How is a client satisfaction survey different from a feedback form?",
          a: "A feedback form usually reviews one finished project. A satisfaction survey checks the health of an ongoing relationship, so it also asks about communication and whether the client plans to stay.",
        },
        {
          q: "Can I customize this survey?",
          a: "Yes. Use this template copies it into your account, where you can edit every question and branch, then send it as a link or embed it on your client portal.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "communication-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["hr-people", "operations"],
    searchName: "Communication survey",
    title: "Internal communication survey",
    icon: "MessagesSquare",
    metaDescription:
      "An internal communication survey for employees: clarity of goals, access to information, useful channels, handoffs and whether people feel able to raise concerns.",
    description: "Find out where information flows well at work, and where it gets lost.",
    blurb:
      "Asks employees whether they understand the goals, can find what they need and hear about changes in time, then has them rank the channels they actually rely on. Anyone who says they would keep a concern to themselves is asked what would make speaking up easier, a question most surveys never reach.",
    tags: ["communication survey", "internal communication", "employee survey", "workplace communication", "team handoffs"],
    greeting: "This survey is about how information moves around here. There are no right answers, and honest ones help most.",
    questions: [
      {
        ref: "team",
        type: "dropdown",
        title: "Which part of the organisation do you work in?",
        description: "We only report results for groups large enough that nobody can be singled out.",
        required: true,
        options: [
          { label: "Leadership" },
          { label: "Operations" },
          { label: "Sales and marketing" },
          { label: "Product and engineering" },
          { label: "Customer support" },
          { label: "Finance and admin" },
          { label: "Other" },
        ],
      },
      {
        ref: "work_setup",
        type: "single_select",
        title: "Where do you usually work?",
        required: true,
        options: [{ label: "On site" }, { label: "Remote" }, { label: "A mix of both" }],
      },
      {
        ref: "statements",
        type: "matrix",
        title: "How much do you agree with each of these?",
        required: true,
        rows: [
          "I understand what the organisation is trying to achieve this year",
          "I know how my work contributes to those goals",
          "I hear about changes that affect me before they happen",
          "I can find the information I need to do my job",
          "I trust the information I get from leadership",
        ],
        columns: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
      },
      {
        ref: "manager",
        type: "rating",
        title: "How well does your direct manager keep you informed?",
        required: true,
        scale: 5,
      },
      {
        ref: "volume",
        type: "opinion_scale",
        title: "How manageable is the number of messages you get each day?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Overwhelming",
        labelHigh: "Easy to keep up with",
      },
      {
        ref: "channels",
        type: "ranking",
        title: "Rank these by how useful they are for getting the information you need.",
        required: false,
        items: [
          "Team meetings",
          "One-to-ones with my manager",
          "Company-wide email",
          "Chat channels",
          "Intranet or wiki",
          "All-hands meetings",
          "Talking to colleagues",
        ],
      },
      {
        ref: "unclear",
        type: "multi_select",
        title: "Which topics could be communicated more clearly?",
        required: false,
        minSelections: 0,
        allowOther: true,
        options: [
          { label: "Strategy and priorities" },
          { label: "Decisions that affect my team" },
          { label: "Changes to processes or tools" },
          { label: "Pay, benefits and promotions" },
          { label: "Handoffs between teams" },
          { label: "What customers are saying" },
        ],
      },
      {
        ref: "concern",
        type: "single_select",
        title: "If something was bothering you at work, what would you most likely do?",
        required: true,
        options: [
          { label: "Raise it with my manager" },
          { label: "Raise it with HR or someone senior" },
          { label: "Talk to colleagues about it" },
          { label: "Keep it to myself" },
        ],
      },

      // Would stay quiet
      {
        ref: "speak_up",
        type: "long_text",
        title: "What would make it easier to speak up?",
        description: "Optional. Leave out anything that could identify you if you'd prefer.",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "handoff",
        type: "long_text",
        title: "Think of a recent handoff between people or teams that went wrong. What was missing?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "one_change",
        type: "long_text",
        title: "If you could change one thing about how we communicate, what would it be?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "concern", is: "Keep it to myself", then: "speak_up" },
      { when: "concern", is: "Raise it with my manager", then: "handoff" },
      { when: "concern", is: "Raise it with HR or someone senior", then: "handoff" },
      { when: "concern", is: "Talk to colleagues about it", then: "handoff" },
    ],
    ending: {
      title: "Thank you for taking part",
      body: "We'll share what we learned and what we plan to change once the survey closes.",
    },
    guide: {
      questionsToConsider: [
        "Are your teams large enough that the department question can't identify anyone?",
        "Which channels does your organisation actually use, and should the ranking list only those?",
        "Do you want to compare on-site and remote staff, and are both groups big enough to compare?",
        "Who will share the results with everyone, and by when?",
      ],
      howToUseResponses:
        "Start with the statement people disagreed with most, since that is usually the one to fix. Compare on-site and remote answers, because the gap between them often explains the rest. Treat the share of people who would keep a concern to themselves as a warning sign worth its own conversation with leadership. Share a short summary and one or two concrete changes within a few weeks, or the next survey will get fewer answers.",
      customizeSteps: [
        "Edit the department list to match your organisation, merging small teams so nobody can be identified.",
        "Replace the channel list with the tools and meetings you really use.",
        "Share the link through your usual internal channel, say how long it will stay open, and don't collect names if you promise anonymity.",
      ],
      faqs: [
        {
          q: "What questions should an internal communication survey ask?",
          a: "Whether people understand the goals, can find the information they need, hear about changes in time and trust what they are told. Ask which channels they rely on and whether they feel able to raise a concern.",
        },
        {
          q: "Should an employee communication survey be anonymous?",
          a: "Usually, yes, because people are more candid. Avoid asking for names, and check that department or location answers can't narrow a response down to one person.",
        },
        {
          q: "How often should I run a communication survey?",
          a: "Once or twice a year is enough for most organisations, plus once after a big change such as a reorganisation or a move to remote work.",
        },
        {
          q: "Can I adapt this for a single team?",
          a: "Yes. Use this template copies it into your account, where you can edit every question, remove the department question and share it by link with just that team.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "employee-benefits-survey",
    type: "survey",
    category: "feedback",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["hr-people"],
    searchName: "Employee benefits survey",
    title: "Employee benefits survey",
    icon: "Gift",
    metaDescription:
      "Find out which benefits employees know about, use and value, where access breaks down and what is missing. Low scores and failed claims get their own follow-up.",
    description: "Learn which benefits people know about, use and value, and which ones they can't reach.",
    blurb:
      "Separates the three reasons a benefit fails: nobody knows it exists, nobody values it, or it is too hard to use. A low satisfaction score gets a question about why, and anyone who gave up on using a benefit is asked which one and what got in the way. It ends with a ranking of where to invest next.",
    tags: ["employee benefits survey", "benefits feedback", "hr survey", "employee perks", "total rewards"],
    greeting: "We're reviewing our benefits and want to spend on what matters to you. Your answers are anonymous and take about five minutes.",
    questions: [
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
        ref: "aware",
        type: "multi_select",
        title: "Which of these benefits did you know we offer?",
        required: false,
        minSelections: 0,
        options: [
          { label: "Health insurance" },
          { label: "Retirement or pension plan" },
          { label: "Paid time off" },
          { label: "Parental leave" },
          { label: "Flexible or remote working" },
          { label: "Learning and development budget" },
          { label: "Wellbeing and mental health support" },
        ],
      },
      {
        ref: "used",
        type: "multi_select",
        title: "Which have you used in the last year?",
        required: false,
        minSelections: 0,
        options: [
          { label: "Health insurance" },
          { label: "Retirement or pension plan" },
          { label: "Paid time off" },
          { label: "Parental leave" },
          { label: "Flexible or remote working" },
          { label: "Learning and development budget" },
          { label: "Wellbeing and mental health support" },
          { label: "None of these" },
        ],
      },
      {
        ref: "importance",
        type: "matrix",
        title: "How important is each of these to you?",
        required: true,
        rows: [
          "Health insurance",
          "Retirement or pension plan",
          "Paid time off",
          "Parental leave",
          "Flexible or remote working",
          "Learning and development budget",
          "Wellbeing and mental health support",
        ],
        columns: ["Not important", "Somewhat important", "Very important", "Doesn't apply to me"],
      },
      {
        ref: "satisfaction",
        type: "opinion_scale",
        title: "Overall, how satisfied are you with your benefits?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Very dissatisfied",
        labelHigh: "Very satisfied",
      },

      // Low scores
      {
        ref: "low_why",
        type: "long_text",
        title: "What's the main reason for that score?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "access",
        type: "single_select",
        title: "When you've tried to use a benefit, how did it go?",
        required: true,
        options: [
          { label: "It was easy" },
          { label: "Some hassle, but I managed" },
          { label: "Hard enough that I gave up" },
          { label: "I haven't tried" },
        ],
      },
      {
        ref: "access_detail",
        type: "long_text",
        title: "Which benefit was it, and what got in the way?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "know_where",
        type: "yes_no",
        title: "Do you know where to find the details of what you're entitled to?",
        required: true,
      },
      {
        ref: "invest",
        type: "ranking",
        title: "If we could improve one area, which matters most to you? Rank them.",
        required: true,
        items: [
          "Health cover",
          "Time off",
          "Flexible working",
          "Retirement savings",
          "Learning and development",
          "Wellbeing and mental health support",
          "Family support, such as childcare",
        ],
      },
      {
        ref: "missing",
        type: "long_text",
        title: "Is there a benefit we don't offer that would make a real difference to you?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "satisfaction", op: "lte", is: 5, then: "low_why" },
      { when: "satisfaction", op: "gte", is: 6, then: "access" },
      { when: "access", is: "Hard enough that I gave up", then: "access_detail" },
      { when: "access", is: "It was easy", then: "know_where" },
      { when: "access", is: "Some hassle, but I managed", then: "know_where" },
      { when: "access", is: "I haven't tried", then: "know_where" },
    ],
    ending: {
      title: "Thank you, your answers will shape the review",
      body: "We'll share what we heard and what we decide to change once the survey closes.",
    },
    guide: {
      questionsToConsider: [
        "Do the benefit lists match exactly what you offer, including anything specific to your country?",
        "Is the tenure question broad enough that nobody can be identified by it?",
        "Which changes are realistic this year, and should the ranking only include those?",
        "Who will explain the results to employees, and when?",
      ],
      howToUseResponses:
        "Compare the awareness and usage answers first: a benefit people rate as important but don't know about is a communication problem, not a budget one. Read the answers from people who gave up on a benefit and fix the process behind it before adding anything new. Use the ranking to shortlist where to spend, and tell employees what you found, including what you can't change and why.",
      customizeSteps: [
        "Replace the benefit lists and grid rows with the benefits you actually offer, using the names employees know them by.",
        "Edit the ranking to the areas you are genuinely able to invest in this year.",
        "Share the link through your usual internal channel, say it is anonymous, and avoid adding questions that could identify someone in a small team.",
      ],
      faqs: [
        {
          q: "What should an employee benefits survey ask?",
          a: "Which benefits people know about, which they use, how important each one is to them, how easy they are to access and what is missing. Together those tell you whether a problem is awareness, value or access.",
        },
        {
          q: "Should an employee benefits survey be anonymous?",
          a: "Yes, in most cases. People are more open about pay and benefits when they can't be identified, so leave out names and keep demographic questions broad.",
        },
        {
          q: "How often should I survey employees about benefits?",
          a: "Once a year, ideally a few months before your benefits renewal, so the results can inform what you choose.",
        },
        {
          q: "Can I change the benefits listed?",
          a: "Yes. Use this template copies the survey into your account, where you can edit every question, option and branch before sharing it by link.",
        },
      ],
    },
  }),
];
