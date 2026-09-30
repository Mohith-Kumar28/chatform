import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_MARKETING_4: TemplateSeed[] = [
  defineTemplate({
    slug: "social-media-survey",
    type: "survey",
    category: "marketing",
    goals: ["conduct-research", "collect-feedback"],
    roles: ["marketing"],
    searchName: "Social media survey",
    title: "Social media survey",
    icon: "Megaphone",
    metaDescription:
      "Ask your audience which platforms they use, which formats and topics help them, and what makes them unfollow. Followers and non-followers get different questions.",
    description: "Learn where your audience spends time online and what they want to see from you there.",
    blurb:
      "Starts with the platforms people actually use, then splits: people who already follow you say why and how useful your posts are, and people who don't say what has kept them away. Everyone then ranks formats, picks topics and names what makes them unfollow an account.",
    tags: ["social media survey", "audience research", "content preferences", "social media questionnaire", "content strategy"],
    greeting: "We're planning what to post next and would rather ask than guess. Two or three minutes, and every answer shapes what you'll see from us.",
    questions: [
      {
        ref: "platforms",
        type: "multi_select",
        title: "Which of these do you use at least once a week?",
        required: true,
        allowOther: true,
        options: [
          { label: "Instagram" },
          { label: "Facebook" },
          { label: "LinkedIn" },
          { label: "YouTube" },
          { label: "TikTok" },
          { label: "X" },
          { label: "Pinterest" },
          { label: "Reddit" },
          { label: "WhatsApp or other messaging apps" },
        ],
      },
      {
        ref: "check_frequency",
        type: "single_select",
        title: "How often do you scroll through social media on a typical day?",
        required: true,
        options: [
          { label: "Many times a day" },
          { label: "Once or twice a day" },
          { label: "A few times a week" },
          { label: "Rarely" },
        ],
      },
      {
        ref: "follows_us",
        type: "single_select",
        title: "Do you follow us on any of those platforms?",
        required: true,
        options: [{ label: "Yes" }, { label: "No" }, { label: "I'm not sure" }],
      },

      // Followers
      {
        ref: "follow_reason",
        type: "multi_select",
        title: "What made you follow us?",
        required: false,
        allowOther: true,
        options: [
          { label: "I'm a customer" },
          { label: "Useful tips and advice" },
          { label: "Offers and discounts" },
          { label: "News about new products or services" },
          { label: "Someone shared one of your posts" },
          { label: "I like the people behind it" },
        ],
      },
      {
        ref: "posts_useful",
        type: "rating",
        title: "How useful are our posts to you?",
        required: true,
        scale: 5,
      },

      // Not following
      {
        ref: "not_following",
        type: "single_select",
        title: "What's the main reason you haven't followed us?",
        required: false,
        allowOther: true,
        options: [
          { label: "I didn't know you were on social media" },
          { label: "Your posts don't seem relevant to me" },
          { label: "I'd rather hear from you by email or on your website" },
          { label: "I keep the accounts I follow to a minimum" },
        ],
      },

      // Everyone
      {
        ref: "formats",
        type: "ranking",
        title: "Rank these formats, most useful to you first.",
        required: true,
        items: [
          "Short videos",
          "Photos and carousels",
          "Longer videos or tutorials",
          "Written posts and threads",
          "Live sessions",
          "Stories and quick updates",
        ],
      },
      {
        ref: "topics",
        type: "multi_select",
        title: "Which topics would you like to see more of?",
        required: true,
        allowOther: true,
        maxSelections: 3,
        options: [
          { label: "How-to tips" },
          { label: "Behind the scenes" },
          { label: "Product news and launches" },
          { label: "Stories from customers" },
          { label: "Offers and giveaways" },
          { label: "News from our industry" },
          { label: "Events and meetups" },
        ],
      },
      {
        ref: "unfollow_triggers",
        type: "multi_select",
        title: "What makes you mute or unfollow a brand?",
        required: false,
        options: [
          { label: "Posting too often" },
          { label: "Constant selling" },
          { label: "Content that feels copied or generic" },
          { label: "Ignoring comments and questions" },
          { label: "Clickbait headlines" },
          { label: "Going quiet for months" },
        ],
      },
      {
        ref: "post_frequency",
        type: "single_select",
        title: "How often would you like to see a post from us?",
        required: true,
        options: [
          { label: "Every day" },
          { label: "A few times a week" },
          { label: "Once a week" },
          { label: "Only when there's something worth saying" },
        ],
      },
      {
        ref: "question_for_us",
        type: "long_text",
        title: "Is there a question you'd like us to answer in a post?",
        required: false,
        maxLength: 500,
      },
      {
        ref: "age_group",
        type: "dropdown",
        title: "Which age group are you in?",
        required: false,
        options: [
          { label: "Under 18" },
          { label: "18 to 24" },
          { label: "25 to 34" },
          { label: "35 to 44" },
          { label: "45 to 54" },
          { label: "55 to 64" },
          { label: "65 or over" },
          { label: "Prefer not to say" },
        ],
      },
    ],
    branches: [
      { when: "follows_us", is: "Yes", then: "follow_reason" },
      { when: "follows_us", is: "No", then: "not_following" },
      { when: "follows_us", is: "I'm not sure", then: "formats" },
      { when: "posts_useful", always: true, then: "formats" },
    ],
    ending: {
      title: "Thanks, that's really helpful 🙌",
      body: "We'll use your answers to plan the next few months of posts. Keep an eye out for the topics you picked.",
    },
    guide: {
      questionsToConsider: [
        "Which platforms are you actually willing to post on every week, and should the list only include those?",
        "Are you surveying current followers, customers who don't follow you, or both?",
        "Which topics are you able to cover well, so you don't list ones you can't deliver?",
        "Do you need the age question at all, or will platform and topic answers tell you enough?",
      ],
      howToUseResponses:
        "Compare what followers ranked with what your posts already are: if short videos top the ranking and you mostly post photos, that's the first test to run. Read the non-follower reasons separately, since \"I didn't know you were there\" is a promotion problem while \"not relevant\" is a content problem. Then check stated preferences against your real engagement over the next month before you commit to a new plan.",
      customizeSteps: [
        "Trim the platform list to the channels your audience and your team can realistically cover.",
        "Rewrite the topic options around what you sell or teach, and keep an Other option so people can add their own.",
        "Share the link in your newsletter, on your website and in a post on each channel, so you hear from non-followers too.",
      ],
      faqs: [
        {
          q: "What questions should a social media survey ask?",
          a: "Which platforms people use, how often, which formats and topics help them, and what makes them unfollow. Asking followers and non-followers different follow-ups tells you both what to post and why people aren't finding you.",
        },
        {
          q: "How do I get people to take a social media survey?",
          a: "Post the link on each platform you use and in your email list, and say what you'll change based on the answers. A short, conversational survey like this one is easier to finish on a phone.",
        },
        {
          q: "Should I ask about every social platform?",
          a: "No. List the ones your audience is likely to use and add an Other option for anything you missed.",
        },
        {
          q: "Can I change the questions in this template?",
          a: "Yes. Use this template copies it into your account, where you can edit every question and option, then share it as a link or embed it on your site.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "sustainability-survey",
    type: "survey",
    category: "marketing",
    goals: ["conduct-research", "collect-feedback"],
    roles: ["marketing", "operations"],
    searchName: "Sustainability survey",
    title: "Sustainability survey",
    icon: "Leaf",
    metaDescription:
      "Ask customers which sustainability changes matter, what they already do, what stops them and which claims they trust. People who know your efforts get to rate them.",
    description: "Find out which green changes your customers care about and what gets in the way of choosing them.",
    blurb:
      "Asks about everyday habits and obstacles before any talk of your own plans, so the answers aren't shaped by what people think you want to hear. Only customers who already know about your efforts are asked to rate them; everyone ranks the changes they'd value most and says what would make a green claim believable.",
    tags: ["sustainability survey", "environmental survey", "green consumer survey", "eco-friendly feedback", "customer research"],
    greeting: "We're deciding which changes to make first to reduce our environmental impact, and we'd like your view. It takes about three minutes.",
    questions: [
      {
        ref: "importance",
        type: "opinion_scale",
        title: "When you choose where to buy, how much does a company's environmental impact matter to you?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "A great deal",
      },
      {
        ref: "current_habits",
        type: "multi_select",
        title: "Which of these do you already do most of the time?",
        required: true,
        options: [
          { label: "Recycle at home" },
          { label: "Bring my own bags, cups or containers" },
          { label: "Buy second-hand or refurbished" },
          { label: "Pick products with less packaging" },
          { label: "Repair things before replacing them" },
          { label: "Walk, cycle or use public transport where I can" },
          { label: "None of these right now" },
        ],
      },
      {
        ref: "aware",
        type: "single_select",
        title: "Before today, had you heard about anything we do to reduce our impact?",
        required: true,
        options: [
          { label: "Yes, I could name something" },
          { label: "I've heard something, but vaguely" },
          { label: "No" },
        ],
      },

      // Aware of our efforts
      {
        ref: "aware_which",
        type: "short_text",
        title: "What comes to mind?",
        required: false,
        maxLength: 200,
      },
      {
        ref: "our_rating",
        type: "rating",
        title: "How would you rate our efforts so far?",
        required: true,
        scale: 5,
      },

      // Everyone
      {
        ref: "priorities",
        type: "ranking",
        title: "Rank these changes by how much you'd like us to make them.",
        required: true,
        items: [
          "Less packaging, and packaging that's easy to recycle",
          "Lower-impact materials or ingredients",
          "Repair, refill or take-back options",
          "Sourcing more locally",
          "Cutting our energy use and emissions",
          "Fair pay and conditions in our supply chain",
        ],
      },
      {
        ref: "barriers",
        type: "multi_select",
        title: "What stops you choosing the greener option more often?",
        required: true,
        allowOther: true,
        options: [
          { label: "It usually costs more" },
          { label: "It's hard to tell which option is really better" },
          { label: "It isn't sold where I shop" },
          { label: "It's less convenient" },
          { label: "I don't trust the claims" },
          { label: "The quality isn't as good" },
          { label: "Nothing, I already choose it when I can" },
        ],
      },
      {
        ref: "pay_more",
        type: "single_select",
        title: "Would you pay a little more for a lower-impact version of something you already buy from us?",
        required: true,
        options: [
          { label: "Yes, happily" },
          { label: "Yes, if the difference is small" },
          { label: "Only if the quality is better too" },
          { label: "No" },
        ],
      },
      {
        ref: "trust",
        type: "matrix",
        title: "How much would each of these make you believe a company's green claims?",
        required: false,
        rows: [
          "Certification from an independent body",
          "Specific targets and yearly progress reports",
          "Clear details on the product or packaging",
          "Being open about what hasn't worked yet",
        ],
        columns: ["Not at all", "A little", "A lot"],
      },
      {
        ref: "ideas",
        type: "long_text",
        title: "Is there one change you'd most like to see from us?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "updates",
        type: "yes_no",
        title: "Would you like an occasional update on how these changes are going?",
        required: true,
      },
      {
        ref: "updates_email",
        type: "email",
        title: "Which email should we send them to?",
        required: true,
      },
    ],
    branches: [
      { when: "aware", is: "Yes, I could name something", then: "aware_which" },
      { when: "aware", is: "I've heard something, but vaguely", then: "our_rating" },
      { when: "aware", is: "No", then: "priorities" },
      { when: "updates", is: false, then: "end_thanks" },
      { when: "updates_email", always: true, then: "end_updates" },
    ],
    endings: [
      {
        ref: "end_updates",
        title: "Thank you, we'll keep you posted 🌱",
        body: "You'll hear from us when there's real progress to report, not before.",
      },
    ],
    ending: {
      title: "Thank you for your thoughts",
      body: "Your answers will help us decide which changes to make first.",
    },
    guide: {
      questionsToConsider: [
        "Which changes can you realistically make in the next year, so the ranking only lists real options?",
        "Do you want to hear from existing customers only, or from people who haven't bought yet?",
        "Is the price question worth asking before you know what a greener version would cost?",
        "Who will send the progress updates, and how often?",
      ],
      howToUseResponses:
        "Look at the ranking next to the barriers: a change people want but won't pay extra for tells you to absorb the cost or make it the default. Separate the ratings from customers who could name an effort from those who only half remembered it, because the gap between them is a communication problem you can fix quickly. When you report back, share specific steps and what didn't work, since the trust grid shows that's what people believe.",
      customizeSteps: [
        "Replace the ranking items with the changes you are actually weighing up for your business.",
        "Edit the greeting to name your company, and say briefly why you're asking now.",
        "Share the link after a purchase or in your newsletter, and embed it on the page where you talk about sustainability.",
      ],
      faqs: [
        {
          q: "What should a sustainability survey ask customers?",
          a: "What they already do, which changes they'd value from you, what stops them choosing greener options and what would make them trust your claims. Asking about habits before your plans keeps the answers more honest.",
        },
        {
          q: "How do I avoid leading questions in a sustainability survey?",
          a: "Ask about behaviour and obstacles in neutral terms, and give an easy way to say none of these apply. Avoid wording that makes one answer sound like the responsible one.",
        },
        {
          q: "Will customers say they'll pay more and then not do it?",
          a: "Often, yes. Treat the price answer as a sign of interest and check it against what people actually buy once a greener option is on sale.",
        },
        {
          q: "Can I use this for employees instead of customers?",
          a: "Yes. Copy the template, change the greeting and swap the ranking items for workplace changes such as travel, energy use or waste.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "target-market-survey",
    type: "survey",
    category: "marketing",
    goals: ["conduct-research"],
    roles: ["marketing", "product-research"],
    searchName: "Target market survey",
    title: "Target market survey",
    icon: "Target",
    metaDescription:
      "Find out who has the problem your product solves, how badly, and how they deal with it now. People without the problem are screened out; keen ones can offer to talk.",
    description: "Test who needs what you're building, before you decide which audience to focus on.",
    blurb:
      "Starts with how often the problem comes up, and anyone who doesn't have it explains why and leaves early instead of padding your data. Everyone else rates the pain, describes their current fix, says who decides and what they'd judge a new option on, and can volunteer for a follow-up conversation.",
    tags: ["target market survey", "customer research", "market validation", "audience research", "problem validation"],
    greeting: "We're working on a way to make keeping track of household bills less of a chore, and we're trying to learn who struggles with it most. About three minutes.",
    questions: [
      {
        ref: "buying_for",
        type: "single_select",
        title: "Who would you be solving this for?",
        required: true,
        options: [
          { label: "Just me" },
          { label: "My household or family" },
          { label: "A small business I run or work at" },
          { label: "A larger company or organisation" },
        ],
      },
      {
        ref: "how_often",
        type: "single_select",
        title: "How often does this problem come up for you?",
        required: true,
        options: [
          { label: "Every day" },
          { label: "Every week" },
          { label: "A few times a month" },
          { label: "Rarely" },
          { label: "It isn't a problem for me" },
        ],
      },

      // Screened out
      {
        ref: "not_a_problem",
        type: "long_text",
        title: "What makes it a non-issue for you? If you've found something that works, we'd love to know what.",
        required: false,
        maxLength: 600,
      },

      // Has the problem
      {
        ref: "pain",
        type: "opinion_scale",
        title: "When it happens, how much does it bother you?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "I barely notice",
        labelHigh: "It really costs me",
      },
      {
        ref: "current_fix",
        type: "multi_select",
        title: "How do you handle it today?",
        required: true,
        allowOther: true,
        options: [
          { label: "A spreadsheet or notes" },
          { label: "An app or piece of software" },
          { label: "I pay someone to handle it" },
          { label: "I ask friends, family or colleagues" },
          { label: "I just put up with it" },
        ],
      },
      {
        ref: "current_gaps",
        type: "long_text",
        title: "What's missing or annoying about the way you handle it now?",
        required: true,
        maxLength: 800,
        agentHints: {
          askStyle: "If the answer is general, ask for the last time it went wrong and what that cost them.",
          examples: [],
        },
      },
      {
        ref: "spent_before",
        type: "single_select",
        title: "Have you spent money trying to solve this in the past year?",
        required: true,
        options: [
          { label: "Yes, I pay for something regularly" },
          { label: "Yes, once or twice" },
          { label: "No, but I would for the right thing" },
          { label: "No, and I wouldn't" },
        ],
      },
      {
        ref: "decider",
        type: "single_select",
        title: "If you found something that worked, who would decide whether to buy it?",
        required: true,
        options: [{ label: "Me alone" }, { label: "Me, together with someone else" }, { label: "Someone else" }],
      },
      {
        ref: "criteria",
        type: "ranking",
        title: "Rank what would matter most when choosing a new option.",
        required: true,
        items: ["Price", "Ease of use", "Time it saves", "A recommendation from someone I trust", "Reliability", "Help when I get stuck"],
      },
      {
        ref: "where_look",
        type: "multi_select",
        title: "Where would you look for a solution?",
        required: true,
        allowOther: true,
        options: [
          { label: "Search engines" },
          { label: "Social media" },
          { label: "Friends, family or colleagues" },
          { label: "Review or comparison sites" },
          { label: "Online communities and forums" },
          { label: "App stores" },
        ],
      },
      {
        ref: "age_group",
        type: "dropdown",
        title: "Which age group are you in?",
        required: false,
        options: [
          { label: "18 to 24" },
          { label: "25 to 34" },
          { label: "35 to 44" },
          { label: "45 to 54" },
          { label: "55 to 64" },
          { label: "65 or over" },
          { label: "Prefer not to say" },
        ],
      },
      {
        ref: "interview",
        type: "yes_no",
        title: "Would you be open to a short follow-up conversation about this?",
        required: true,
      },
      {
        ref: "interview_email",
        type: "email",
        title: "Great. Which email should we use to arrange it?",
        required: true,
      },
    ],
    branches: [
      { when: "how_often", is: "It isn't a problem for me", then: "not_a_problem" },
      { when: "how_often", is: "Every day", then: "pain" },
      { when: "how_often", is: "Every week", then: "pain" },
      { when: "how_often", is: "A few times a month", then: "pain" },
      { when: "how_often", is: "Rarely", then: "pain" },
      { when: "not_a_problem", always: true, then: "end_not_fit" },
      { when: "interview", is: false, then: "end_thanks" },
      { when: "interview_email", always: true, then: "end_interview" },
    ],
    endings: [
      {
        ref: "end_not_fit",
        title: "Thanks, that's useful to know",
        body: "Knowing who doesn't have this problem helps us as much as knowing who does. That's all we need from you.",
      },
      {
        ref: "end_interview",
        title: "Thank you, we'll be in touch 📬",
        body: "We'll email you to find a time that suits. It's a conversation, not a sales call.",
      },
    ],
    ending: {
      title: "Thanks for your time",
      body: "Your answers help us work out who we should build this for first.",
    },
    guide: {
      questionsToConsider: [
        "How will you describe the problem in the greeting so it's specific but doesn't sell your answer?",
        "Which audiences are you choosing between, and do the first question's options reflect them?",
        "Do you need the age question, or would job, industry or location split your audience better?",
        "Who will run the follow-up conversations, and how quickly can they reach out?",
      ],
      howToUseResponses:
        "Group respondents by who they're solving for, then compare how often the problem comes up and how much it hurts. The audience worth targeting first is usually the one that has the problem often, rates it highly and already spends money on it. Read the written gaps for the words people use, since those make better headlines than your own, and book the follow-up calls while answers are fresh.",
      customizeSteps: [
        "Rewrite the greeting to describe your problem in one plain sentence, without naming your product.",
        "Change the first question's options to the audiences you are deciding between.",
        "Share the link in communities where each audience gathers, and add a hidden field for the source so you can compare them.",
      ],
      faqs: [
        {
          q: "What questions should a target market survey include?",
          a: "Who the person is buying for, how often the problem affects them, how much it hurts, what they use today, who decides and what they'd judge a new option on. Those answers show which group needs you most.",
        },
        {
          q: "How is a target market survey different from market segmentation?",
          a: "A target market survey asks which audience is the best fit for your offer. Segmentation looks for useful differences inside a market you've already chosen.",
        },
        {
          q: "Should I screen out people who don't have the problem?",
          a: "Yes. This template asks them one short question and ends, so their answers don't blur the picture of the people who do.",
        },
        {
          q: "How many responses do I need?",
          a: "Enough from each audience to see a clear pattern, and a handful of follow-up conversations to explain it. A small sample can point the way but can't speak for a whole market.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "technology-survey",
    type: "survey",
    category: "marketing",
    goals: ["conduct-research", "collect-feedback"],
    roles: ["operations", "hr-people"],
    searchName: "Technology survey",
    title: "Technology survey",
    icon: "Laptop",
    metaDescription:
      "Ask your team which tools they rely on, how confident they feel, how much time tech problems cost them and how they like to learn before you roll out a change.",
    description: "Understand how people use technology at work, where it slows them down and what support they need.",
    blurb:
      "A workplace technology check that goes past a satisfaction score. People rate each part of their setup, say how much time they lose each week, and only those losing real time are asked to describe the problem. It ends on how they feel about new tools and how they'd like to learn one, which is what you need before any change.",
    tags: ["technology survey", "workplace technology survey", "IT survey", "digital tools survey", "employee technology"],
    greeting: "We're reviewing the tools and devices people use at work. Tell us what helps and what gets in the way. It takes about three minutes.",
    questions: [
      {
        ref: "team",
        type: "dropdown",
        title: "Which team are you in?",
        required: true,
        options: [
          { label: "Operations" },
          { label: "Sales" },
          { label: "Marketing" },
          { label: "Finance" },
          { label: "HR and people" },
          { label: "Customer support" },
          { label: "Engineering or IT" },
          { label: "Leadership" },
          { label: "Other" },
        ],
      },
      {
        ref: "devices",
        type: "multi_select",
        title: "Which devices do you use for work?",
        required: true,
        options: [
          { label: "A laptop" },
          { label: "A desktop computer" },
          { label: "A work phone" },
          { label: "My own phone" },
          { label: "A tablet" },
          { label: "A shared computer or terminal" },
        ],
      },
      {
        ref: "main_tools",
        type: "long_text",
        title: "Which tools or apps do you rely on most in a normal day?",
        required: true,
        maxLength: 500,
      },
      {
        ref: "confidence",
        type: "opinion_scale",
        title: "How confident do you feel using the technology your job needs?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not confident",
        labelHigh: "Very confident",
      },
      {
        ref: "tool_ratings",
        type: "matrix",
        title: "How well does each of these work for you?",
        required: true,
        rows: [
          "Email and calendar",
          "Chat and video calls",
          "Storing and sharing files",
          "The main system for your role",
          "Your computer itself",
        ],
        columns: ["Gets in my way", "It's okay", "Works well", "I don't use it"],
      },
      {
        ref: "time_lost",
        type: "single_select",
        title: "In a typical week, how much time do you lose to tech problems or workarounds?",
        required: true,
        options: [
          { label: "Almost none" },
          { label: "Less than an hour" },
          { label: "1–3 hours" },
          { label: "More than 3 hours" },
        ],
      },

      // Losing real time
      {
        ref: "biggest_blocker",
        type: "long_text",
        title: "What eats up most of that time? Describe the last time it happened.",
        required: true,
        maxLength: 1000,
        agentHints: {
          askStyle: "If they name a tool, ask what they were trying to do when it went wrong.",
          examples: [],
        },
      },

      // Everyone
      {
        ref: "support",
        type: "rating",
        title: "When something breaks, how good is the help you get?",
        required: true,
        scale: 5,
      },
      {
        ref: "learn_pref",
        type: "multi_select",
        title: "How do you prefer to learn a new tool?",
        required: true,
        maxSelections: 2,
        options: [
          { label: "Short videos" },
          { label: "Written step-by-step guides" },
          { label: "A live training session" },
          { label: "One-to-one help" },
          { label: "A colleague shows me" },
          { label: "I figure it out myself" },
        ],
      },
      {
        ref: "new_tools",
        type: "single_select",
        title: "When a new tool is introduced, how do you usually feel?",
        required: true,
        options: [
          { label: "Keen to try it" },
          { label: "Fine, if someone shows me how" },
          { label: "Wary, it often adds work" },
          { label: "I'd rather keep what we have" },
        ],
      },
      {
        ref: "one_fix",
        type: "long_text",
        title: "If you could fix or replace one piece of technology you use, what would it be?",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "time_lost", is: "1–3 hours", then: "biggest_blocker" },
      { when: "time_lost", is: "More than 3 hours", then: "biggest_blocker" },
      { when: "time_lost", is: "Almost none", then: "support" },
      { when: "time_lost", is: "Less than an hour", then: "support" },
    ],
    ending: {
      title: "Thank you, that's a big help",
      body: "We'll share what we heard and what we plan to change once everyone has had a chance to answer.",
    },
    guide: {
      questionsToConsider: [
        "Which systems should the rating grid name, so people rate the tools you can actually change?",
        "Is the survey anonymous, and does asking for the team make small teams identifiable?",
        "Are you planning a specific rollout, and should you ask about that tool directly?",
        "Who will read the written problems and decide what to fix first?",
      ],
      howToUseResponses:
        "Start with the people losing more than an hour a week and read what they wrote, since those are the fixes that pay back fastest. Split the grid by team: a system that gets in the way for support but works for sales usually needs different settings or training, not a replacement. Use the learning preferences and the answers about new tools to plan how you introduce the next change, and tell everyone what you're doing about the top problems.",
      customizeSteps: [
        "Rename the grid rows to your real systems, such as your CRM, help desk or finance software.",
        "Edit the team list to match your organisation, or remove it if teams are small enough to identify people.",
        "Send the link from someone people trust, say whether answers are anonymous, and give a deadline.",
      ],
      faqs: [
        {
          q: "What should a workplace technology survey ask?",
          a: "Which tools people rely on, how well each works, how much time problems cost, how good support is, and how people prefer to learn something new. That covers both what to fix and how to roll out changes.",
        },
        {
          q: "Should a technology survey be anonymous?",
          a: "Usually, yes, so people can criticise tools a manager chose. If you ask for the team, check each team is large enough that nobody can be picked out.",
        },
        {
          q: "When should I run a technology survey?",
          a: "Before choosing or replacing a tool, and again a few months after rollout, so you can compare the time lost and the ratings.",
        },
        {
          q: "Can I adapt this for customers instead of staff?",
          a: "Yes. Copy the template, change the greeting and swap the team and grid rows for the parts of your product customers use.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "training-evaluation-survey",
    type: "survey",
    category: "marketing",
    goals: ["collect-feedback", "run-events"],
    roles: ["hr-people", "education"],
    searchName: "Training evaluation survey",
    title: "Training evaluation",
    icon: "GraduationCap",
    metaDescription:
      "Rate a training session on clarity, relevance, practice time, pace, level and delivery. Anyone who wouldn't recommend it as it stands says what should change.",
    description: "Find out how well a training session was designed and delivered, and what to change for the next group.",
    blurb:
      "Written for the people who run the training. It rates the parts you can change, from objectives and examples to practice time, pace and level, then asks whether the learner would recommend the session. A yes leads to what worked best; anything less leads to what would need to change first.",
    tags: ["training evaluation survey", "training feedback form", "course evaluation", "trainer feedback", "session evaluation"],
    greeting: "Thanks for taking part. A few quick questions about how the session was run, so the next group gets a better one.",
    questions: [
      {
        ref: "session",
        type: "short_text",
        title: "Which session did you attend?",
        required: true,
        maxLength: 150,
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how would you rate the session?",
        required: true,
        scale: 5,
      },
      {
        ref: "statements",
        type: "matrix",
        title: "How far do you agree with each of these?",
        required: true,
        rows: [
          "The objectives were clear from the start",
          "The content matched what was advertised",
          "The examples fit my kind of work",
          "There was enough time to practise",
          "The materials will be useful afterwards",
        ],
        columns: ["Strongly disagree", "Disagree", "Agree", "Strongly agree"],
      },
      {
        ref: "pace",
        type: "single_select",
        title: "How was the pace?",
        required: true,
        options: [{ label: "Too slow" }, { label: "About right" }, { label: "Too fast" }],
      },
      {
        ref: "level",
        type: "single_select",
        title: "How did the level suit you?",
        required: true,
        options: [{ label: "Too basic for me" }, { label: "About right" }, { label: "Too advanced for me" }],
      },
      {
        ref: "trainer",
        type: "rating",
        title: "How would you rate the trainer's delivery?",
        required: true,
        scale: 5,
      },
      {
        ref: "recommend",
        type: "single_select",
        title: "Would you recommend this session to a colleague?",
        required: true,
        options: [{ label: "Yes, as it is" }, { label: "Yes, with some changes" }, { label: "No" }],
      },

      // Would recommend
      {
        ref: "worked_best",
        type: "long_text",
        title: "Which part worked best for you?",
        required: false,
        maxLength: 600,
      },

      // Would change it
      {
        ref: "change_first",
        type: "long_text",
        title: "What would need to change before you'd recommend it without hesitation?",
        required: true,
        maxLength: 1000,
        agentHints: {
          askStyle: "If they say something general like 'more practical', ask which part of the session they mean.",
          examples: [],
        },
      },

      // Everyone
      {
        ref: "format",
        type: "single_select",
        title: "For a topic like this, which format suits you best?",
        required: true,
        options: [
          { label: "In person" },
          { label: "Live online" },
          { label: "Self-paced online" },
          { label: "A mix of these" },
        ],
      },
      {
        ref: "next_topic",
        type: "long_text",
        title: "What would you like a future session to cover?",
        required: false,
        maxLength: 500,
      },
    ],
    branches: [
      { when: "recommend", is: "Yes, as it is", then: "worked_best" },
      { when: "recommend", is: "Yes, with some changes", then: "change_first" },
      { when: "recommend", is: "No", then: "change_first" },
      { when: "worked_best", always: true, then: "format" },
    ],
    ending: {
      title: "Thank you for the feedback",
      body: "The trainer will read every answer before the next session runs.",
    },
    guide: {
      questionsToConsider: [
        "Which parts of the session are you able to change, and does the grid ask about those?",
        "Should the session name be filled in for people through the link, rather than typed?",
        "Do you want trainers to see their own results, and have you told them?",
        "Are you measuring reaction to the session here, and learning or behaviour change somewhere else?",
      ],
      howToUseResponses:
        "Read the change requests first and group them by part of the session, then check them against the grid: if many people disagree that there was time to practise, that's a design fix rather than a trainer fix. Compare pace and level answers across groups before changing the content, since a split between too basic and too advanced usually means the audience needs sorting, not the material. Share the results with the trainer alongside the quotes about what worked best.",
      customizeSteps: [
        "Rewrite the grid statements to match the session's stated objectives and format.",
        "Add the session name to the link as a hidden field if you run several sessions, so nobody has to type it.",
        "Send the link at the end of the session, before people leave the room or the call.",
      ],
      faqs: [
        {
          q: "What should a training evaluation survey include?",
          a: "An overall rating, whether the objectives, content and examples fit, whether there was time to practise, the pace and level, the trainer's delivery, and one open question about what to change.",
        },
        {
          q: "When should I send a training evaluation?",
          a: "In the last few minutes of the session or straight after it. The longer you wait, the fewer people answer and the vaguer the answers get.",
        },
        {
          q: "What is the difference between a training evaluation and a post-training survey?",
          a: "A training evaluation judges the session itself so you can improve it. A post-training survey looks at what learners will apply at work afterwards; many teams run both.",
        },
        {
          q: "Should training feedback be anonymous?",
          a: "It usually gets more honest answers. This template doesn't ask for a name, and you can add one if you need to follow up with individuals.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "user-satisfaction-survey",
    type: "survey",
    category: "marketing",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["product-research", "customer-success"],
    searchName: "User satisfaction survey",
    title: "User satisfaction survey",
    icon: "SmilePlus",
    metaDescription:
      "Ask users what they were trying to do, whether they managed it and why they gave their score. People who struggled or gave up get their own follow-up questions.",
    description: "Learn how well your product works for the people using it, and the reason behind each score.",
    blurb:
      "Anchors every answer to a real task instead of a general impression. Users who finished easily move straight to the rating, users who struggled say what made it hard, and users who gave up say where it broke and what they did instead. Each score comes with a reason, and the AI follow-up asks for more when that reason is vague.",
    tags: ["user satisfaction survey", "product satisfaction", "user feedback", "UX survey", "customer satisfaction"],
    greeting: "We'd like to know how using our product is going for you. Five minutes at most, and your answers go straight to the team building it.",
    questions: [
      {
        ref: "task",
        type: "long_text",
        title: "The last time you used it, what were you trying to get done?",
        required: true,
        maxLength: 500,
      },
      {
        ref: "completed",
        type: "single_select",
        title: "Did you manage it?",
        required: true,
        options: [{ label: "Yes, easily" }, { label: "Yes, but it took some effort" }, { label: "No" }],
      },

      // Struggled
      {
        ref: "hard_part",
        type: "long_text",
        title: "What made it harder than it should have been?",
        required: true,
        maxLength: 800,
      },

      // Gave up
      {
        ref: "where_broke",
        type: "long_text",
        title: "Where did it go wrong?",
        required: true,
        maxLength: 800,
        agentHints: {
          askStyle: "Ask for the step they were on and what they saw, not their opinion of the product.",
          examples: [],
        },
      },
      {
        ref: "instead",
        type: "single_select",
        title: "What did you do instead?",
        required: true,
        allowOther: true,
        options: [
          { label: "Tried again later" },
          { label: "Asked for help" },
          { label: "Used a different tool" },
          { label: "Gave up on it for now" },
        ],
      },

      // Everyone
      {
        ref: "satisfaction",
        type: "rating",
        title: "Overall, how satisfied are you with it?",
        required: true,
        scale: 5,
      },
      {
        ref: "reason",
        type: "long_text",
        title: "What's the main reason for that score?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "qualities",
        type: "matrix",
        title: "How would you rate each of these?",
        required: false,
        rows: ["Speed", "Reliability", "Finding what you need", "How it looks and feels", "Help when you're stuck"],
        columns: ["Poor", "Fair", "Good", "Excellent"],
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
          { label: "Less often" },
        ],
      },
      {
        ref: "without_it",
        type: "single_select",
        title: "How would you feel if you could no longer use it?",
        required: true,
        options: [{ label: "Very disappointed" }, { label: "Somewhat disappointed" }, { label: "Not disappointed" }],
      },
      {
        ref: "one_improvement",
        type: "long_text",
        title: "If we could improve one thing for you next, what should it be?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "follow_up",
        type: "yes_no",
        title: "Could someone from the team follow up with you about your answers?",
        required: true,
      },
      {
        ref: "follow_up_email",
        type: "email",
        title: "What's the best email to reach you?",
        required: true,
      },
    ],
    branches: [
      { when: "completed", is: "Yes, easily", then: "satisfaction" },
      { when: "completed", is: "Yes, but it took some effort", then: "hard_part" },
      { when: "completed", is: "No", then: "where_broke" },
      { when: "hard_part", always: true, then: "satisfaction" },
      { when: "follow_up", is: false, then: "end_thanks" },
      { when: "follow_up_email", always: true, then: "end_follow_up" },
    ],
    endings: [
      {
        ref: "end_follow_up",
        title: "Thanks, we'll be in touch",
        body: "Someone from the team will email you soon to hear more.",
      },
    ],
    ending: {
      title: "Thank you, this helps us a lot 🙏",
      body: "Every answer is read by the people who decide what we build next.",
    },
    guide: {
      questionsToConsider: [
        "Do you want feedback on the product as a whole, or on one feature or flow?",
        "Should you send it after a specific action, so the task question has a clear answer?",
        "Who will reply to the people who agree to a follow-up, and how soon?",
        "Which qualities in the grid do you actually have the power to change?",
      ],
      howToUseResponses:
        "Read the answers from people who gave up first, grouped by where it broke, because each one is a task your product failed at. Then set the scores next to their reasons: a 3 with a complaint about speed is a different fix from a 3 about missing features. Watch the share of users who'd be very disappointed without you over time, and follow up with volunteers while the problem is still fresh in their minds.",
      customizeSteps: [
        "Replace \"our product\" in the greeting with your product's name, and narrow the task question if you're studying one feature.",
        "Rename the grid rows to the qualities your users care about most.",
        "Trigger the link after users complete or abandon a key task, or share it in your product's help menu.",
      ],
      faqs: [
        {
          q: "What questions should a user satisfaction survey ask?",
          a: "What the person was trying to do, whether they managed it, an overall score and the reason for it, and what to improve next. Tying the score to a real task makes it far easier to act on.",
        },
        {
          q: "What is the difference between user satisfaction and NPS?",
          a: "Satisfaction asks how well the product works for someone, while NPS asks whether they'd recommend it. This template focuses on satisfaction and the reason behind it; you can add an NPS question if you track both.",
        },
        {
          q: "How often should I run a user satisfaction survey?",
          a: "Send it after meaningful tasks rather than on a fixed schedule, and avoid asking the same person more than once every few months.",
        },
        {
          q: "Can I send different questions to people who had a bad experience?",
          a: "Yes. This template already does: people who struggled or gave up get their own follow-ups, and you can edit the branching in the builder.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "value-proposition-survey",
    type: "survey",
    category: "marketing",
    goals: ["conduct-research"],
    roles: ["marketing", "product-research"],
    searchName: "Value proposition survey",
    title: "Value proposition test",
    icon: "Lightbulb",
    metaDescription:
      "Show people your offer's promise, then ask what they think it does, which benefit matters, how believable it is and what would convince them. Poor fits leave early.",
    description: "Test whether your offer's promise is understood, relevant and believable before you build a campaign on it.",
    blurb:
      "Shows the promise, then asks people to explain it back in their own words, which catches confusing messaging faster than any rating. Anyone for whom it isn't relevant says who it would suit and leaves. The rest rank the benefits, score how believable the claim is, name their doubts and say what proof would win them over.",
    tags: ["value proposition survey", "message testing", "positioning research", "concept test", "marketing research"],
    greeting: "We're testing how we describe something new, and we'd value your honest first reaction. About three minutes.",
    questions: [
      {
        ref: "the_offer",
        type: "statement",
        title: "Here's how we describe it: \"Plan a week of dinners in ten minutes, with one shopping list and no wasted food.\"",
        description: "Read it once, then answer the next few questions from memory.",
      },
      {
        ref: "understanding",
        type: "long_text",
        title: "In your own words, what does this offer do, and who is it for?",
        required: true,
        maxLength: 600,
      },
      {
        ref: "clarity",
        type: "opinion_scale",
        title: "How clear was that description?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Confusing",
        labelHigh: "Completely clear",
      },
      {
        ref: "relevance",
        type: "single_select",
        title: "How relevant is it to you right now?",
        required: true,
        options: [
          { label: "Very, I have this problem now" },
          { label: "Somewhat, it comes up now and then" },
          { label: "Not really" },
        ],
      },

      // Not relevant
      {
        ref: "who_instead",
        type: "long_text",
        title: "Who do you think it would suit instead?",
        required: false,
        maxLength: 400,
      },

      // Relevant
      {
        ref: "today",
        type: "long_text",
        title: "How do you handle this today?",
        required: true,
        maxLength: 600,
      },
      {
        ref: "benefits",
        type: "ranking",
        title: "Rank these benefits by how much they'd matter to you.",
        required: true,
        items: [
          "It saves me time",
          "It costs less than what I do now",
          "It's easier than what I do now",
          "It gets a better result",
          "It's one less thing to think about",
        ],
      },
      {
        ref: "believable",
        type: "opinion_scale",
        title: "How believable is the main promise?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Not at all",
        labelHigh: "Completely",
      },
      {
        ref: "doubts",
        type: "multi_select",
        title: "What makes you hesitate, if anything?",
        required: true,
        allowOther: true,
        options: [
          { label: "It sounds too good to be true" },
          { label: "I'm not sure it would work for someone like me" },
          { label: "I'm worried about the price" },
          { label: "Switching from what I do now would be a hassle" },
          { label: "Nothing, I believe it" },
        ],
      },
      {
        ref: "proof",
        type: "multi_select",
        title: "What would convince you it's true?",
        required: true,
        maxSelections: 3,
        options: [
          { label: "Reviews from people like me" },
          { label: "A free trial" },
          { label: "A short demo" },
          { label: "A money-back guarantee" },
          { label: "Clear pricing up front" },
          { label: "A detailed example or case study" },
        ],
      },
      {
        ref: "likelihood",
        type: "opinion_scale",
        title: "If it were available today, how likely would you be to try it?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Definitely not",
        labelHigh: "Definitely",
      },
      {
        ref: "describe_it",
        type: "short_text",
        title: "How would you describe it to a friend, in one sentence?",
        required: false,
        maxLength: 200,
      },
    ],
    branches: [
      { when: "relevance", is: "Not really", then: "who_instead" },
      { when: "relevance", is: "Very, I have this problem now", then: "today" },
      { when: "relevance", is: "Somewhat, it comes up now and then", then: "today" },
      { when: "who_instead", always: true, then: "end_not_for_me" },
    ],
    endings: [
      {
        ref: "end_not_for_me",
        title: "Thanks for being honest",
        body: "Knowing who this isn't for is just as useful to us. That's everything we needed.",
      },
    ],
    ending: {
      title: "Thank you, that's really useful 💡",
      body: "Your first reaction is exactly what we needed. We'll use it to sharpen how we describe the offer.",
    },
    guide: {
      questionsToConsider: [
        "What is the one sentence you want to test, and is it the same one that will appear on your website?",
        "Are you testing one version, or sending different versions of the statement to different groups?",
        "Which benefits are you really choosing between for your headline?",
        "Do the respondents match the audience you plan to reach, or are they friends being kind?",
      ],
      howToUseResponses:
        "Read the explain-it-back answers before any score. If people describe something different from what you meant, fix the words before worrying about believability. Then compare the top-ranked benefit with the one your current headline leads with, and use the doubts and proof answers to decide what goes directly under it: reviews, a trial, a guarantee or clear pricing. The one-sentence descriptions are often better copy than the original.",
      customizeSteps: [
        "Replace the example in the statement with your own value proposition, written exactly as it will appear.",
        "Rewrite the benefit and doubt options around your offer, keeping one neutral choice in each.",
        "Duplicate the survey for each version you want to compare, and send each link to a similar group.",
      ],
      faqs: [
        {
          q: "How do you test a value proposition?",
          a: "Show the statement to people in your target audience, ask them to explain it back, then ask how relevant, believable and appealing it is. Misunderstandings in their own words are the fastest signal that the message needs work.",
        },
        {
          q: "What questions should a value proposition survey ask?",
          a: "What people think the offer does, how clear it is, how relevant it is to them, which benefit matters most, how believable the claim is and what would convince them.",
        },
        {
          q: "Can I test two versions of my messaging?",
          a: "Yes. Copy the survey, change the statement in the copy and send each version to a comparable group, then compare the results in the dashboard or a CSV export.",
        },
        {
          q: "Why ask people to explain the offer in their own words?",
          a: "A clarity score tells you people think they understood. Their own words show whether they actually did.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "vendor-satisfaction-survey",
    type: "survey",
    category: "marketing",
    goals: ["collect-feedback"],
    roles: ["operations"],
    searchName: "Vendor satisfaction survey",
    title: "Vendor satisfaction survey",
    icon: "Handshake",
    metaDescription:
      "Ask suppliers how working with you really goes: orders, replies, forecasts, paperwork and payment on time. Late-payment problems and call requests get follow-ups.",
    description: "Hear how suppliers experience working with your organisation, and fix what makes you a hard customer.",
    blurb:
      "Turns the usual supplier review around so vendors rate you. They score the parts of the relationship you control, and anyone who says invoices are often paid late is asked what holds them up. It finishes with what would help most and an offer of a call with your purchasing team, which gets its own ending.",
    tags: ["vendor satisfaction survey", "supplier satisfaction survey", "supplier feedback", "procurement survey", "vendor relationship"],
    greeting: "We rely on our suppliers, and we'd like to be a customer that's easy to work with. Tell us honestly how we're doing. About four minutes.",
    questions: [
      {
        ref: "company",
        type: "short_text",
        title: "Which company are you answering for?",
        description: "Leave it blank if you'd rather stay anonymous.",
        required: false,
        maxLength: 150,
      },
      {
        ref: "relationship_length",
        type: "single_select",
        title: "How long have you been supplying us?",
        required: true,
        options: [{ label: "Less than a year" }, { label: "1–3 years" }, { label: "More than 3 years" }],
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how would you rate us as a customer?",
        required: true,
        scale: 5,
      },
      {
        ref: "areas",
        type: "matrix",
        title: "How do we do on each of these?",
        required: true,
        rows: [
          "Clear orders and specifications",
          "Replying to your questions quickly",
          "Forecasts and advance notice",
          "Fairness in negotiations",
          "Onboarding and paperwork",
          "Feedback on your performance",
        ],
        columns: ["Poor", "Fair", "Good", "Excellent"],
      },
      {
        ref: "payment",
        type: "single_select",
        title: "How often are your invoices paid within the agreed terms?",
        required: true,
        options: [{ label: "Always" }, { label: "Usually" }, { label: "Sometimes" }, { label: "Rarely" }],
      },

      // Late payment
      {
        ref: "payment_issue",
        type: "long_text",
        title: "What usually holds payment up?",
        required: true,
        maxLength: 800,
        agentHints: {
          askStyle: "Ask where in the process it stalls, such as approval, missing purchase order numbers or disputes.",
          examples: [],
        },
      },

      // Everyone
      {
        ref: "one_contact",
        type: "yes_no",
        title: "Do you have one clear contact on our side who can answer your questions?",
        required: true,
      },
      {
        ref: "hardest",
        type: "long_text",
        title: "What's the hardest part of working with us?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "would_help",
        type: "multi_select",
        title: "Which of these would help you most?",
        required: true,
        allowOther: true,
        maxSelections: 3,
        options: [
          { label: "Longer or more accurate forecasts" },
          { label: "Faster payment" },
          { label: "A single named contact" },
          { label: "Simpler paperwork" },
          { label: "Regular performance reviews" },
          { label: "Earlier involvement in new projects" },
        ],
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend us as a customer to other suppliers?",
        required: true,
      },
      {
        ref: "call",
        type: "yes_no",
        title: "Would you like a call with our purchasing team about your answers?",
        required: true,
      },
      {
        ref: "call_contact",
        type: "contact_info",
        title: "Who should we call?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
    ],
    branches: [
      { when: "payment", is: "Sometimes", then: "payment_issue" },
      { when: "payment", is: "Rarely", then: "payment_issue" },
      { when: "payment", is: "Always", then: "one_contact" },
      { when: "payment", is: "Usually", then: "one_contact" },
      { when: "call", is: false, then: "end_thanks" },
      { when: "call_contact", always: true, then: "end_call" },
    ],
    endings: [
      {
        ref: "end_call",
        title: "Thank you, we'll call you soon 📞",
        body: "Someone from our purchasing team will be in touch within a week to talk it through.",
      },
    ],
    ending: {
      title: "Thank you for being honest with us",
      body: "We'll review every answer and share what we're changing with all our suppliers.",
    },
    guide: {
      questionsToConsider: [
        "Do you want named responses so you can follow up, or anonymous ones so suppliers speak freely?",
        "Which parts of the relationship does your team control, and are they all in the grid?",
        "What are your agreed payment terms, and do you already know where invoices get stuck?",
        "Who on the purchasing team will make the follow-up calls, and within what time?",
      ],
      howToUseResponses:
        "Start with the late-payment answers and trace each one back through your approval process, since that's usually the fastest fix and suppliers notice it immediately. Split the grid by how long each supplier has worked with you: new vendors struggling with paperwork points at onboarding, while long-standing ones struggling with forecasts points at planning. Make the calls people asked for, then tell all suppliers what you changed.",
      customizeSteps: [
        "Edit the grid rows to match how you work with suppliers, such as quality audits or delivery windows.",
        "Remove the company question if you want fully anonymous answers, and say so in the greeting.",
        "Send the link from your purchasing lead once a year, or after a contract renewal.",
      ],
      faqs: [
        {
          q: "What is a vendor satisfaction survey?",
          a: "A survey that asks suppliers how it feels to work with you as a customer. It shows where your orders, payments or processes make their job harder, which affects the price and service you get.",
        },
        {
          q: "What questions should a supplier satisfaction survey ask?",
          a: "How clear your orders are, how quickly you reply, how good your forecasts are, whether you pay on time, how fair negotiations feel and what would help them most.",
        },
        {
          q: "Should vendor surveys be anonymous?",
          a: "Suppliers can be wary of criticising a customer, so offer the option. This template makes the company name optional and only asks for contact details from people who want a call.",
        },
        {
          q: "How often should I survey suppliers?",
          a: "Once a year works for most organisations, plus after big changes such as a new ordering system or payment process.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "website-user-experience-survey",
    type: "survey",
    category: "marketing",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["marketing", "product-research"],
    searchName: "Website user experience survey",
    title: "Website UX survey",
    icon: "Globe",
    metaDescription:
      "Ask visitors what they came to do on your website and whether they managed it. People who got stuck say where and what happened; everyone rates speed and navigation.",
    description: "Find out where your website helps visitors finish a task and where it lets them down.",
    blurb:
      "Built around one real visit rather than general opinions. Visitors who got what they came for rate how easy it was; anyone who got stuck picks where it went wrong and describes what happened, which is the detail a designer can use. Everyone then says how they looked for things and rates navigation, speed and readability on the device they used.",
    tags: ["website user experience survey", "website feedback survey", "UX survey", "website usability", "visitor feedback"],
    greeting: "Quick question about your visit today: did our website help you do what you came for? It takes two minutes.",
    questions: [
      {
        ref: "visit_goal",
        type: "single_select",
        title: "What did you come to the site to do?",
        required: true,
        allowOther: true,
        options: [
          { label: "Learn about a product or service" },
          { label: "Buy something" },
          { label: "Get help with something I already have" },
          { label: "Get in touch with someone" },
          { label: "Just browsing" },
        ],
      },
      {
        ref: "success",
        type: "single_select",
        title: "Were you able to do it?",
        required: true,
        options: [{ label: "Yes" }, { label: "Partly" }, { label: "No" }, { label: "I'm still trying" }],
      },

      // Succeeded
      {
        ref: "ease",
        type: "opinion_scale",
        title: "How easy was it?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Very hard",
        labelHigh: "Very easy",
      },

      // Got stuck
      {
        ref: "stuck_where",
        type: "multi_select",
        title: "Where did things go wrong?",
        required: true,
        allowOther: true,
        options: [
          { label: "I couldn't find the right page" },
          { label: "Search didn't show anything useful" },
          { label: "A page was confusing" },
          { label: "Something didn't load or broke" },
          { label: "A form or checkout wouldn't work" },
          { label: "The information I needed wasn't there" },
        ],
      },
      {
        ref: "what_happened",
        type: "long_text",
        title: "Tell us what happened, step by step if you can.",
        required: true,
        maxLength: 1000,
        agentHints: {
          askStyle: "Ask which page they were on and what they clicked or expected to see.",
          examples: [],
        },
      },

      // Everyone
      {
        ref: "device",
        type: "single_select",
        title: "What were you using?",
        required: true,
        options: [{ label: "A phone" }, { label: "A tablet" }, { label: "A laptop or desktop" }],
      },
      {
        ref: "find_method",
        type: "single_select",
        title: "How did you mostly look for things?",
        required: true,
        options: [
          { label: "The main menu" },
          { label: "The search box" },
          { label: "Links and buttons on the page" },
          { label: "Scrolling until I spotted it" },
          { label: "I came straight to the right page" },
        ],
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate the site on each of these?",
        required: false,
        rows: [
          "Finding your way around",
          "How fast pages load",
          "How easy the text is to read",
          "How it works on your device",
          "How much you trust the information",
        ],
        columns: ["Poor", "Okay", "Good"],
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how would you rate your visit?",
        required: true,
        scale: 5,
      },
      {
        ref: "one_change",
        type: "long_text",
        title: "What one change would have made your visit better?",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "success", is: "Yes", then: "ease" },
      { when: "success", is: "Partly", then: "stuck_where" },
      { when: "success", is: "No", then: "stuck_where" },
      { when: "success", is: "I'm still trying", then: "stuck_where" },
      { when: "ease", always: true, then: "device" },
    ],
    ending: {
      title: "Thank you, that helps us fix things",
      body: "Our team reads every answer, and the problems you described go straight onto our list.",
    },
    guide: {
      questionsToConsider: [
        "Which tasks matter most on your site, and do the visit options name them?",
        "Should the survey appear on every page, or only after key moments like checkout or a search?",
        "Do you want to capture the page someone was on, for example with a hidden field?",
        "Who will review the step-by-step problems, and how quickly can fixes ship?",
      ],
      howToUseResponses:
        "Group the stuck answers by where things went wrong, by device and by how people looked for things, since a checkout that fails mostly on phones is a different fix from a search box nobody can get results from. Read the step-by-step descriptions for the exact page and action, then try to repeat the problem yourself. Watch the success rate for each visit goal over time: it tells you whether a redesign actually helped people finish what they came to do.",
      customizeSteps: [
        "Edit the visit options to match the main jobs people do on your site.",
        "Embed the survey on your site or link it from a small feedback button, and add the page address as a hidden field.",
        "Review the stuck answers weekly with whoever looks after the site, and change the options if a new problem keeps appearing.",
      ],
      faqs: [
        {
          q: "What questions should a website user experience survey ask?",
          a: "What the visitor came to do, whether they managed it, where they got stuck and what happened, which device they used, and how they'd rate navigation, speed and readability.",
        },
        {
          q: "Where should I put a website feedback survey?",
          a: "Embed it on the site or link to it from a feedback button, ideally after an important task like a search, a form or a checkout, so the visit is fresh.",
        },
        {
          q: "Why focus on one visit instead of the whole website?",
          a: "People remember a specific task much more accurately than a general impression, and a concrete description of what went wrong is something your team can reproduce and fix.",
        },
        {
          q: "Can I see answers by device or page?",
          a: "Yes. Responses show in your dashboard, and you can filter them or export to CSV to compare devices and pages.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "workshop-feedback-survey",
    type: "survey",
    category: "marketing",
    goals: ["run-events", "collect-feedback"],
    roles: ["education", "hr-people", "operations"],
    searchName: "Workshop feedback survey",
    title: "Workshop feedback",
    icon: "PenTool",
    metaDescription:
      "Ask participants which activities helped, whether the pace and balance of practice worked and how ready they feel to go it alone. Unsure ones pick the help needed.",
    description: "Learn what participants took from a hands-on session and what support they need afterwards.",
    blurb:
      "Made for practical sessions where people learn by doing. It rates each activity, checks the pace and the balance of explaining versus practising, then asks how ready people feel to try it alone. Confident participants name what they'll do first; hesitant ones pick the support that would help, so you know what to send afterwards.",
    tags: ["workshop feedback survey", "workshop evaluation", "session feedback", "participant feedback", "event feedback"],
    greeting: "Thanks for joining the workshop. A few quick questions while it's fresh, so we can make the next one better. About three minutes.",
    questions: [
      {
        ref: "workshop",
        type: "short_text",
        title: "Which workshop did you take part in?",
        required: true,
        maxLength: 150,
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how would you rate it?",
        required: true,
        scale: 5,
      },
      {
        ref: "activities",
        type: "matrix",
        title: "How useful was each part?",
        required: true,
        rows: ["The hands-on exercises", "The demonstrations", "Group discussion", "Handouts and materials"],
        columns: ["Not useful", "Somewhat useful", "Very useful", "Didn't happen"],
      },
      {
        ref: "pace",
        type: "single_select",
        title: "How was the pace?",
        required: true,
        options: [{ label: "Too slow" }, { label: "About right" }, { label: "Too fast" }],
      },
      {
        ref: "balance",
        type: "single_select",
        title: "Was the balance between explaining and practising right?",
        required: true,
        options: [
          { label: "Too much explaining" },
          { label: "About right" },
          { label: "Too much practice" },
        ],
      },
      {
        ref: "ready",
        type: "opinion_scale",
        title: "How ready do you feel to try this on your own?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not ready at all",
        labelHigh: "Completely ready",
      },

      // Ready
      {
        ref: "first_try",
        type: "long_text",
        title: "What's the first thing you'll try?",
        required: false,
        maxLength: 500,
      },

      // Not ready yet
      {
        ref: "support_needed",
        type: "multi_select",
        title: "What would help you get there?",
        required: true,
        allowOther: true,
        options: [
          { label: "A recording of the session" },
          { label: "A step-by-step guide to follow" },
          { label: "A follow-up practice session" },
          { label: "Time with the facilitator one-to-one" },
          { label: "A group where I can ask questions" },
        ],
      },

      // Everyone
      {
        ref: "highlight",
        type: "long_text",
        title: "Which moment was most useful to you?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "improve",
        type: "long_text",
        title: "What would you change for the next group?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "next_one",
        type: "yes_no",
        title: "Would you like to hear about the next workshop?",
        required: true,
      },
      {
        ref: "next_email",
        type: "email",
        title: "Which email should we use?",
        required: true,
      },
    ],
    branches: [
      { when: "ready", op: "gte", is: 3, then: "first_try" },
      { when: "ready", op: "lte", is: 2, then: "support_needed" },
      { when: "first_try", always: true, then: "highlight" },
      { when: "next_one", is: false, then: "end_thanks" },
      { when: "next_email", always: true, then: "end_next" },
    ],
    endings: [
      {
        ref: "end_next",
        title: "You're on the list 🎉",
        body: "We'll email you when the next workshop is announced. Thanks again for taking part.",
      },
    ],
    ending: {
      title: "Thank you for the feedback",
      body: "The facilitator will read every answer before planning the next session.",
    },
    guide: {
      questionsToConsider: [
        "Which activities did this workshop actually include, so the grid doesn't ask about ones that didn't happen?",
        "What follow-up support can you really offer, such as a recording, a guide or a practice session?",
        "Should people answer in the last few minutes of the session, or afterwards by email?",
        "Is the workshop name something you can fill in through the link instead of asking?",
      ],
      howToUseResponses:
        "Send the support people asked for within a few days, starting with the participants who felt least ready, because that's when the workshop either sticks or fades. Then compare the activity grid with the pace and balance answers: exercises rated low alongside too much explaining usually means people ran out of time to practise. Use the moments people found most useful to decide what to keep when you shorten or rework the session.",
      customizeSteps: [
        "Rename the grid rows to the activities your workshop runs, and remove any that don't apply.",
        "Edit the support options to what you can realistically offer afterwards.",
        "Share the link in the last five minutes of the session, and add the workshop name as a hidden field.",
      ],
      faqs: [
        {
          q: "What questions should a workshop feedback survey ask?",
          a: "An overall rating, how useful each activity was, whether the pace and balance of explaining and practising worked, how ready people feel to apply it, and what to change next time.",
        },
        {
          q: "When is the best time to ask for workshop feedback?",
          a: "In the last few minutes of the session, while people are still in the room or on the call. Response rates drop quickly once they leave.",
        },
        {
          q: "How is a workshop feedback survey different from a training evaluation?",
          a: "A workshop is hands-on, so this survey focuses on activities, practice time and whether people feel ready to try it alone, then offers support to those who don't.",
        },
        {
          q: "Can I use one survey for several workshops?",
          a: "Yes. Keep the workshop question, or pass the name in the link as a hidden field, then filter responses by workshop in the dashboard.",
        },
      ],
    },
  }),
];
