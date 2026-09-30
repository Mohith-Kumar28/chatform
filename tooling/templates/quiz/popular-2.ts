import { defineTemplate, type TemplateSeed } from "../define.js";

export const QUIZ_POPULAR_2: TemplateSeed[] = [
  defineTemplate({
    slug: "trivia-quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes"],
    roles: ["marketing", "education", "hr-people"],
    searchName: "Trivia quiz",
    title: "General knowledge trivia",
    icon: "Lightbulb",
    metaDescription:
      "A general knowledge trivia quiz with eight scored questions, a pick-all-that-apply round and a closest-guess tiebreaker, plus a result that matches each score.",
    description: "Eight scored general knowledge questions, a tiebreaker and three results.",
    blurb:
      "Science, art, history and language in one short round, so no single specialist runs away with it. Every right answer is worth a point, the botanical fruit question takes one away for a wrong pick, and a closest-guess tiebreaker settles a draw without a replay.",
    tags: ["trivia quiz", "general knowledge quiz", "quiz night", "team building quiz", "scored quiz"],
    greeting: "Trivia time. Eight questions from all over the map, one tiebreaker, and your result at the end.",
    questions: [
      { ref: "player", type: "short_text", title: "What name or team name should go on the scoreboard?", required: true, maxLength: 40 },
      {
        ref: "octopus",
        type: "single_select",
        title: "How many hearts does an octopus have?",
        required: true,
        options: [{ label: "One" }, { label: "Two" }, { label: "Three", score: 1 }, { label: "Eight" }],
      },
      {
        ref: "hardest",
        type: "single_select",
        title: "What is the hardest natural substance on Earth?",
        required: true,
        options: [{ label: "Quartz" }, { label: "Diamond", score: 1 }, { label: "Granite" }, { label: "Titanium" }],
      },
      {
        ref: "fruits",
        type: "multi_select",
        title: "Botanically speaking, which of these are fruits? Pick all that apply.",
        description: "A wrong pick costs a point, so only choose the ones you're sure of.",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Tomato", score: 1 },
          { label: "Carrot", score: -1 },
          { label: "Cucumber", score: 1 },
          { label: "Potato", score: -1 },
        ],
      },
      {
        ref: "sistine",
        type: "single_select",
        title: "Who painted the ceiling of the Sistine Chapel?",
        required: true,
        options: [
          { label: "Leonardo da Vinci" },
          { label: "Raphael" },
          { label: "Michelangelo", score: 1 },
          { label: "Botticelli" },
        ],
      },
      {
        ref: "sodium",
        type: "single_select",
        title: "What is the chemical symbol for sodium?",
        required: true,
        options: [{ label: "So" }, { label: "Sd" }, { label: "Na", score: 1 }, { label: "S" }],
      },
      {
        ref: "lightning",
        type: "single_select",
        title: "True or false: lightning never strikes the same place twice.",
        required: true,
        options: [{ label: "True" }, { label: "False", score: 1 }],
      },
      {
        ref: "berlin_wall",
        type: "dropdown",
        title: "In which year did the Berlin Wall fall?",
        required: true,
        options: [{ label: "1985" }, { label: "1987" }, { label: "1989", score: 1 }, { label: "1991" }],
      },
      {
        ref: "native_speakers",
        type: "single_select",
        title: "Which language has the most native speakers in the world?",
        required: true,
        options: [
          { label: "English" },
          { label: "Spanish" },
          { label: "Mandarin Chinese", score: 1 },
          { label: "Hindi" },
        ],
      },
      {
        ref: "tiebreaker",
        type: "number",
        title: "Tiebreaker: how many keys are there on a standard piano?",
        description: "Not scored. If two players draw, the closest guess wins.",
        required: true,
        min: 0,
        max: 500,
        integerOnly: true,
      },
    ],
    scoreEndings: [
      { atLeast: 8, then: "end_champion" },
      { atLeast: 5, then: "end_contender" },
    ],
    endings: [
      {
        ref: "end_champion",
        title: "Quiz night champion 🏆",
        body: "Almost a clean sweep. The botanical fruits and the lightning myth are where most players slip, and you got through.",
      },
      {
        ref: "end_contender",
        title: "Strong contender 💡",
        body: "A good score with a couple of traps along the way. The octopus and the lightning question catch plenty of people out.",
      },
    ],
    ending: {
      title: "Warm-up round 🎲",
      body: "Trivia rewards odd facts, and now you have eight new ones. Octopuses have three hearts, by the way. Have another go.",
    },
    guide: {
      questionsToConsider: [
        "Is this for a pub night, a team social or a classroom? A mixed crowd needs questions from several subjects so nobody dominates.",
        "Should a wrong pick in the fruit question cost a point, or would that feel harsh for your players?",
        "Will teams play together on one phone, or will everyone answer on their own device?",
        "Do you need the tiebreaker at all, or is a shared win fine for your group?",
      ],
      howToUseResponses:
        "Sort the responses by score to find the winner, then use the tiebreaker to settle any draw: the guess closest to 88 takes it. Look at which question most people got wrong before your next quiz. If nearly everyone missed it, keep it as a showstopper; if the wording confused people, rewrite it.",
      customizeSteps: [
        "Swap in questions on your own theme, keeping one point on each correct option and a minus point on wrong picks in any pick-all question.",
        "Move the score bands if you change the number of questions, so the champion result still needs nearly every answer right.",
        "Share the link on screen or in your group chat, and read the scoreboard in the dashboard when the round closes.",
      ],
      faqs: [
        {
          q: "How many questions should a trivia quiz have?",
          a: "For a single round played on phones, eight to twelve questions keeps it quick. A full quiz night usually runs several rounds of that size with a break between them.",
        },
        {
          q: "How do I handle a tie in a trivia quiz?",
          a: "Use a closest-guess number question that is not scored. This template asks how many keys a piano has, and the nearest guess to 88 wins.",
        },
        {
          q: "What makes a good trivia question?",
          a: "One clear right answer, wrong options that sound plausible, and a fact people enjoy learning even when they miss it.",
        },
        {
          q: "Can teams play this trivia quiz together?",
          a: "Yes. Ask for a team name on the first question and have one person answer for the table.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "quick-start-personality-quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes"],
    roles: ["marketing", "hr-people"],
    searchName: "Quick personality quiz",
    title: "Introvert or extrovert quiz",
    icon: "Sparkles",
    metaDescription:
      "A short personality quiz with six everyday scenarios that sorts people into introvert, ambivert or extrovert, with a friendly explanation for each result.",
    description: "Six everyday scenarios and three results: introvert, ambivert or extrovert.",
    blurb:
      "A small, focused personality quiz built on one idea: where you get your energy. Each scenario offers a social, a middle and a quiet answer worth two, one or nothing, and the total lands on one of three results, so mixed answers get their own outcome instead of being forced to a side.",
    tags: ["personality quiz", "introvert or extrovert quiz", "ambivert quiz", "fun quiz", "short quiz"],
    greeting: "Six quick scenarios, no right or wrong answers. Pick what you'd honestly do, and we'll tell you where you get your energy.",
    questions: [
      { ref: "name", type: "short_text", title: "First, what should we call you?", required: true, maxLength: 40 },
      {
        ref: "rainy_saturday",
        type: "single_select",
        title: "It's Saturday night and it's pouring with rain. Your friends still want to go out. You...",
        required: true,
        options: [
          { label: "Grab an umbrella. A night in would be a waste", score: 2 },
          { label: "Go, but suggest somewhere close by", score: 1 },
          { label: "Take the rain as a sign to stay in with tea and a film", score: 0 },
        ],
      },
      {
        ref: "cafe_table",
        type: "single_select",
        title: "The only free seat in the café is across from a stranger. What happens next?",
        required: true,
        options: [
          { label: "You sit down and ask what they're reading", score: 2 },
          { label: "You smile, sit, and see if they start chatting", score: 1 },
          { label: "You take your coffee to go", score: 0 },
        ],
      },
      {
        ref: "new_job",
        type: "single_select",
        title: "It's your first week somewhere new. How do you get to know people?",
        required: true,
        options: [
          { label: "Introduce myself to everyone on day one", score: 2 },
          { label: "Get to know the people I work closest with first", score: 1 },
          { label: "Let people come to me over time", score: 0 },
        ],
      },
      {
        ref: "party",
        type: "single_select",
        title: "At a party, where are you usually found?",
        required: true,
        options: [
          { label: "In the middle of the loudest group", score: 2 },
          { label: "Moving between a few small conversations", score: 1 },
          { label: "In the kitchen with one good friend", score: 0 },
        ],
      },
      {
        ref: "long_week",
        type: "single_select",
        title: "After a long, busy week, what actually recharges you?",
        required: true,
        options: [
          { label: "Seeing as many people as possible", score: 2 },
          { label: "Dinner with one or two close friends", score: 1 },
          { label: "A whole day with nobody to talk to", score: 0 },
        ],
      },
      {
        ref: "phone_call",
        type: "single_select",
        title: "Your phone rings with a number you don't know. You...",
        required: true,
        options: [
          { label: "Answer straight away. Could be interesting", score: 2 },
          { label: "Answer if you're not busy", score: 1 },
          { label: "Let it ring and wait for a message", score: 0 },
        ],
      },
    ],
    scoreEndings: [
      { atLeast: 9, then: "end_extrovert" },
      { atLeast: 5, then: "end_ambivert" },
    ],
    endings: [
      {
        ref: "end_extrovert",
        title: "You're an extrovert 🎉",
        body: "You get your energy from other people. Busy rooms, new faces and last-minute plans leave you buzzing rather than drained.",
      },
      {
        ref: "end_ambivert",
        title: "You're an ambivert ⚖️",
        body: "You sit in the middle. You enjoy company and can hold a room, but you also know when you need a quiet night to recover.",
      },
    ],
    ending: {
      title: "You're an introvert 📚",
      body: "You recharge on your own or with a trusted few. That usually comes with a talent for listening and for deep, one-to-one friendships.",
    },
    guide: {
      questionsToConsider: [
        "Is one axis, like introvert to extrovert, enough for your audience, or do they expect more than three results?",
        "Does every question have a clear social, middle and quiet answer, so the scoring stays honest?",
        "Where will people see this: a newsletter, a team social, or a landing page that needs a name or email?",
      ],
      howToUseResponses:
        "Look at how results spread across the three outcomes. If nearly everyone lands on ambivert, the middle answers are too tempting and the bands need widening. For a team activity, share the split as a conversation starter about how people like to work, never as a label that decides anything.",
      customizeSteps: [
        "Rewrite the scenarios for your own theme, giving the most outgoing answer two points, the middle one point and the quiet answer none.",
        "If you add or remove questions, move the bands so each result covers about a third of the possible scores.",
        "Share the link, then test all three results yourself before sending it out.",
      ],
      faqs: [
        {
          q: "How does a personality quiz decide the result?",
          a: "Each answer carries points toward one end of a scale. The total is compared with fixed bands, and each band shows its own result screen.",
        },
        {
          q: "Is this a scientific personality test?",
          a: "No. It is a light, informal quiz for fun or conversation, and it should not be used to make decisions about anyone.",
        },
        {
          q: "How many questions does a quick personality quiz need?",
          a: "Five to eight is enough when every question clearly separates the outcomes. More than that and people start to drop off before the result.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "social-media-quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes"],
    roles: ["marketing", "education"],
    searchName: "Social media quiz",
    title: "Social media know-how quiz",
    icon: "MessagesSquare",
    metaDescription:
      "A social media quiz on engagement, reach, disclosure and handling complaints, scored with three results. Useful for training new marketers or testing a class.",
    description: "Eight scored questions on social media basics that don't go out of date.",
    blurb:
      "Built around ideas that stay true when platforms change features: engagement, organic reach, calls to action and handling a public complaint. The pick-all engagement question takes a point off for impressions, which is the mistake people most often make, and the score lands on one of three results.",
    tags: ["social media quiz", "social media marketing quiz", "marketing training quiz", "digital marketing test", "team quiz"],
    greeting: "How well do you know social media? Eight questions on the ideas behind the posts, then your result.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 60 },
      {
        ref: "experience",
        type: "single_select",
        title: "Which describes you best?",
        required: true,
        options: [
          { label: "I just scroll" },
          { label: "I post for my own business" },
          { label: "I manage social media at work" },
          { label: "I'm studying marketing" },
        ],
      },
      {
        ref: "engagement_rate",
        type: "single_select",
        title: "What does an engagement rate usually measure?",
        required: true,
        options: [
          { label: "How many followers an account gained this month" },
          { label: "Interactions with a post compared with how many people saw it or follow the account", score: 1 },
          { label: "How many posts an account publishes a week" },
          { label: "How long people spend on the platform" },
        ],
      },
      {
        ref: "engagement_types",
        type: "multi_select",
        title: "Which of these count as engagement on a post? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Comments", score: 1 },
          { label: "Shares", score: 1 },
          { label: "Saves", score: 1 },
          { label: "Impressions", score: -1 },
        ],
      },
      {
        ref: "organic_reach",
        type: "single_select",
        title: "What is organic reach?",
        required: true,
        options: [
          { label: "People who saw a post without it being paid to promote", score: 1 },
          { label: "Everyone who follows the account" },
          { label: "Followers who have never unfollowed" },
          { label: "Reach from an influencer partnership" },
        ],
      },
      {
        ref: "cta",
        type: "single_select",
        title: "In a social media post, what does CTA stand for?",
        required: true,
        options: [
          { label: "Content tracking analysis" },
          { label: "Call to action", score: 1 },
          { label: "Click-through average" },
          { label: "Community tone agreement" },
        ],
      },
      {
        ref: "angry_comment",
        type: "single_select",
        title: "A customer leaves an angry public comment about a late order. What's the best first move?",
        required: true,
        options: [
          { label: "Delete it before others see it" },
          { label: "Reply publicly, acknowledge the problem, and move the details to a private message", score: 1 },
          { label: "Ignore it; replying draws attention" },
          { label: "Reply explaining it was the courier's fault" },
        ],
      },
      {
        ref: "ugc",
        type: "single_select",
        title: "What is user-generated content?",
        required: true,
        options: [
          { label: "Posts the brand writes with a scheduling tool" },
          { label: "Content created by customers or fans rather than the brand", score: 1 },
          { label: "Automated replies to comments" },
          { label: "Ads targeted at existing users" },
        ],
      },
      {
        ref: "disclosure",
        type: "single_select",
        title: "A creator is paid to feature your product. What should their post do?",
        required: true,
        options: [
          { label: "Clearly say it's a paid partnership or ad", score: 1 },
          { label: "Look as natural as possible, with no mention of payment" },
          { label: "Only mention it if someone asks in the comments" },
          { label: "Tag the brand, which counts as disclosure" },
        ],
      },
      {
        ref: "ab_test",
        type: "single_select",
        title: "You post two versions of the same ad with different images to see which does better. What is this called?",
        required: true,
        options: [
          { label: "Retargeting" },
          { label: "A/B testing", score: 1 },
          { label: "Boosting" },
          { label: "Cross-posting" },
        ],
      },
    ],
    scoreEndings: [
      { atLeast: 9, then: "end_pro" },
      { atLeast: 6, then: "end_solid" },
    ],
    endings: [
      {
        ref: "end_pro",
        title: "Social media pro 📣",
        body: "You know the numbers and the etiquette. Knowing that impressions are not engagement is the detail that separates people who post from people who plan.",
      },
      {
        ref: "end_solid",
        title: "Solid foundations 👍",
        body: "You have the basics down. Brush up on how engagement is measured and you'll read your own results with a lot more confidence.",
      },
    ],
    ending: {
      title: "Room to grow 🌱",
      body: "Social media has its own language, and now you've met the key terms. Try again after a look at engagement, organic reach and disclosure rules.",
    },
    guide: {
      questionsToConsider: [
        "Are you testing general knowledge, or your own team's playbook for replies, tone and approvals?",
        "Should the angry-comment question reflect your company's actual escalation process?",
        "Do you want to compare scores by experience level, using the first question?",
        "Would a written question, like drafting a reply to a complaint, show more than multiple choice?",
      ],
      howToUseResponses:
        "Group results by the experience question to see where each group struggles. If people who manage social media at work still miss the engagement question, that is a gap worth a short training session. Share the most-missed question and its answer with the whole group afterwards so the quiz teaches as well as tests.",
      customizeSteps: [
        "Replace or add questions about your own brand guidelines, keeping one point on each correct option.",
        "Adjust the score bands if you change the number of questions, so the top result stays hard to reach.",
        "Send the link to your team or class, then review the scores and the most-missed questions in the dashboard.",
      ],
      faqs: [
        {
          q: "What should a social media quiz cover?",
          a: "The ideas that last: how engagement and reach are measured, what makes a clear call to action, disclosure rules for paid posts and how to handle public complaints.",
        },
        {
          q: "Can I use this quiz to train new marketing hires?",
          a: "Yes. Add a few questions about your own brand voice and approval steps, and use the results to plan what to cover in their first weeks.",
        },
        {
          q: "Why avoid questions about specific platform features?",
          a: "Features and user numbers change often, so a question that is right today can be wrong in a few months. Principles stay accurate much longer.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "personalized-product-recommendation-quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes", "generate-leads"],
    roles: ["marketing", "sales"],
    searchName: "Personalized product recommendation quiz",
    title: "Find your coffee quiz",
    icon: "Coffee",
    metaDescription:
      "A personalized product recommendation quiz for a coffee shop or roaster. It asks how people brew and what they enjoy, then recommends one of four coffees.",
    description: "Brewing method, taste and priorities in, one clear coffee recommendation out.",
    blurb:
      "Written for a coffee roaster, but the pattern fits any shop with a handful of products: ask how people will use it, what they like and what matters to them, then recommend one thing with a reason. The final taste question routes to four distinct results, and the answers before it tell you how to grind and what to say in a follow-up.",
    tags: ["product recommendation quiz", "product finder quiz", "coffee quiz", "shopping quiz", "ecommerce quiz"],
    greeting: "Not sure which coffee to try? Answer a few quick questions and we'll point you to the one that suits how you drink it.",
    questions: [
      {
        ref: "brew_method",
        type: "single_select",
        title: "How do you usually make coffee at home?",
        required: true,
        options: [
          { label: "Espresso machine" },
          { label: "Filter or pour-over" },
          { label: "French press" },
          { label: "Moka pot" },
          { label: "I'm buying for someone else" },
        ],
      },
      {
        ref: "milk",
        type: "single_select",
        title: "How do you take it?",
        required: true,
        options: [{ label: "Black" }, { label: "With a splash of milk" }, { label: "Milky, like a latte or flat white" }, { label: "Iced" }],
      },
      {
        ref: "cups_per_day",
        type: "number",
        title: "How many cups do you drink on a normal day?",
        required: true,
        min: 0,
        max: 15,
        integerOnly: true,
      },
      {
        ref: "flavour_notes",
        type: "multi_select",
        title: "Which of these flavours do you enjoy? Pick any that apply.",
        required: false,
        minSelections: 0,
        maxSelections: 6,
        options: [
          { label: "Chocolate" },
          { label: "Caramel" },
          { label: "Nuts" },
          { label: "Berries" },
          { label: "Citrus" },
          { label: "Smoky or roasted" },
        ],
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Put these in order of what matters most when you buy coffee.",
        required: true,
        items: ["Flavour", "Freshness", "Ethical sourcing", "Value for money"],
      },
      {
        ref: "grind",
        type: "single_select",
        title: "Do you want whole beans or ground coffee?",
        required: true,
        options: [{ label: "Whole beans, I grind my own" }, { label: "Ground to suit my brewer" }, { label: "Not sure yet" }],
      },
      {
        ref: "email",
        type: "email",
        title: "Want brewing tips for your match? Leave your email and we'll send them over.",
        required: false,
      },
      {
        ref: "slow_morning",
        type: "single_select",
        title: "Last one. Which cup would you reach for on a slow Sunday morning?",
        required: true,
        options: [
          { label: "Bright and fruity, almost like tea" },
          { label: "Smooth, balanced and a little chocolatey" },
          { label: "Dark, rich and bold" },
          { label: "Something gentle with little or no caffeine" },
        ],
      },
    ],
    branches: [
      { when: "slow_morning", is: "Bright and fruity, almost like tea", then: "end_light" },
      { when: "slow_morning", is: "Dark, rich and bold", then: "end_dark" },
      { when: "slow_morning", is: "Something gentle with little or no caffeine", then: "end_decaf" },
    ],
    endings: [
      {
        ref: "end_light",
        title: "Your match: a light roast single origin ☕",
        body: "You like brightness and fruit, and a light roast keeps both. It shines as filter or pour-over, and it's best black so you taste every note. On an espresso machine it makes a bright, lively shot.",
      },
      {
        ref: "end_dark",
        title: "Your match: our dark roast",
        body: "You want body and a roasted edge that stands up to milk. Our dark roast is made for espresso and moka pots, and holds its flavour black or in a big milky cup.",
      },
      {
        ref: "end_decaf",
        title: "Your match: our Swiss water decaf",
        body: "You want the ritual without the buzz. Our decaf keeps a smooth, chocolatey flavour, so an afternoon or evening cup still tastes like proper coffee.",
      },
    ],
    ending: {
      title: "Your match: our house blend",
      body: "You like balance: chocolate, caramel and no sharp edges. The house blend works in almost any brewer and is just as good black as with milk.",
    },
    guide: {
      questionsToConsider: [
        "Which products can the quiz honestly recommend, and what one difference between them should the deciding question capture?",
        "Should anyone who is buying a gift get a different result, such as a sampler or gift card?",
        "Do the earlier answers, like brewing method and grind, change what you pack or only what you say in a follow-up?",
        "Is the email question clear about what people will receive if they leave their address?",
      ],
      howToUseResponses:
        "Use the grind and brewing answers when you pack an order, and the ranking to decide what to lead with in follow-up emails: freshness, sourcing or value. Watch how results split across the four coffees. If one product almost never comes up, either the question wording steers people away from it or it is a product few of your customers want.",
      customizeSteps: [
        "Replace the four results with your own products, and rewrite the last question so each option describes one of them in plain words.",
        "Keep the questions that change your advice, like how people will use the product, and cut any you would never act on.",
        "Embed the quiz on your shop's homepage or product pages, then test every answer to the last question to check each result appears.",
      ],
      faqs: [
        {
          q: "How does a product recommendation quiz pick a product?",
          a: "This one uses a final deciding question, and each answer routes to its own result screen. You can also score answers and use score bands when several questions should count.",
        },
        {
          q: "How many products should a recommendation quiz suggest?",
          a: "Three to five results is usually right. Enough to feel personal, few enough that each one gets a clear explanation.",
        },
        {
          q: "Should a product quiz ask for an email address?",
          a: "Make it optional and say exactly what people will get, like brewing tips for their match. The recommendation should still appear either way.",
        },
        {
          q: "Where should I put a product recommendation quiz?",
          a: "On the pages where shoppers hesitate: the homepage, a category page or a link in a welcome email. It can be shared by link or embedded on your site.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "social-quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes"],
    roles: ["marketing"],
    searchName: "What kind of friend are you quiz",
    title: "What kind of friend are you?",
    icon: "Users",
    metaDescription:
      "A shareable social quiz that tells people what kind of friend they are: the listener, the planner, the hype person or the adventurer. Five scenarios, four results.",
    description: "Five group-chat scenarios that sort people into one of four friend types.",
    blurb:
      "A light quiz people want to send to their friends. Each scenario has four answers, one per friend type, and the scores sit on a scale from calm to spontaneous, so the total lands on the listener, the planner, the hype person or the adventurer. Every result is flattering and easy to screenshot.",
    tags: ["social quiz", "friendship quiz", "what kind of friend are you", "shareable quiz", "fun quiz"],
    greeting: "Every friend group has a listener, a planner, a hype person and an adventurer. Five scenarios and we'll tell you which one you are.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your first name?", required: true, maxLength: 40 },
      {
        ref: "group_chat",
        type: "single_select",
        title: "What's your role in the group chat?",
        required: true,
        options: [
          { label: "I reply properly when someone needs to talk", score: 0 },
          { label: "I'm the one setting a date and a place", score: 1 },
          { label: "I send voice notes and far too many reactions", score: 2 },
          { label: "I'm offline, but I show up with a story later", score: 3 },
        ],
      },
      {
        ref: "birthday",
        type: "single_select",
        title: "A friend's birthday is coming up. You...",
        required: true,
        options: [
          { label: "Write a card that makes them cry a little", score: 0 },
          { label: "Book the table and remind everyone twice", score: 1 },
          { label: "Plan a surprise and make sure it's loud", score: 2 },
          { label: "Take them somewhere they've never been", score: 3 },
        ],
      },
      {
        ref: "cancelled",
        type: "single_select",
        title: "Friday plans fall through at the last minute. What happens?",
        required: true,
        options: [
          { label: "I check the person who cancelled is OK", score: 0 },
          { label: "I have a backup plan ready in five minutes", score: 1 },
          { label: "I rally everyone else to come to mine", score: 2 },
          { label: "Perfect excuse for something spontaneous", score: 3 },
        ],
      },
      {
        ref: "holiday",
        type: "single_select",
        title: "Your friends are planning a trip together. Your job is...",
        required: true,
        options: [
          { label: "Making sure the quieter ones get a say", score: 0 },
          { label: "The spreadsheet, the budget and the bookings", score: 1 },
          { label: "The playlist and the group photos", score: 2 },
          { label: "Finding the thing nobody else would try", score: 3 },
        ],
      },
      {
        ref: "bad_news",
        type: "single_select",
        title: "A friend texts you some bad news. Your first move is to...",
        required: true,
        options: [
          { label: "Call them and mostly listen", score: 0 },
          { label: "Work out what practical help they need", score: 1 },
          { label: "Tell them how brilliant they are until they believe it", score: 2 },
          { label: "Get them out of the house for a change of scene", score: 3 },
        ],
      },
      {
        ref: "tag_friend",
        type: "short_text",
        title: "Who's the first friend you'd send this quiz to?",
        description: "Just for fun. We won't contact them.",
        required: false,
        maxLength: 60,
      },
    ],
    scoreEndings: [
      { atLeast: 12, then: "end_adventurer" },
      { atLeast: 8, then: "end_hype" },
      { atLeast: 4, then: "end_planner" },
    ],
    endings: [
      {
        ref: "end_adventurer",
        title: "You're the adventurer 🧭",
        body: "You're the reason your friends have stories to tell. When things get routine, you're the one who says yes to something new.",
      },
      {
        ref: "end_hype",
        title: "You're the hype person 🎉",
        body: "You bring the energy. Your friends feel celebrated around you, and every good moment gets louder when you're there.",
      },
      {
        ref: "end_planner",
        title: "You're the planner 🗓️",
        body: "Without you, the group chat would still be saying \"we should do something\". You turn ideas into dates, and your friends quietly rely on it.",
      },
    ],
    ending: {
      title: "You're the listener 💛",
      body: "You're the friend people call first when something goes wrong. You notice who's gone quiet and you make room for them.",
    },
    guide: {
      questionsToConsider: [
        "Are all four results equally nice to get? A shareable quiz works when nobody feels embarrassed by their outcome.",
        "Does each scenario have one answer for every friend type, so the scoring stays fair?",
        "Will you post this on social media, send it in a newsletter or run it at an event?",
      ],
      howToUseResponses:
        "Check the split across the four results after the first day. If one friend type rarely comes up, one of its answers in each question is probably less appealing than the others, so reword it. If you run the quiz for a brand, the most common result is a friendly hook for your next post.",
      customizeSteps: [
        "Pick your own four types, then rewrite each scenario so every option matches one type, scored from zero to three in the same order.",
        "Keep the bands spaced evenly if you add questions, and test each result by answering with one type all the way through.",
        "Share the link where your audience already talks, and invite people to send it on to the friend they named.",
      ],
      faqs: [
        {
          q: "What makes a quiz shareable?",
          a: "A clear theme, quick questions and a result people are happy to show off. Every outcome should feel like a compliment.",
        },
        {
          q: "How does this quiz choose a friend type?",
          a: "Each answer is worth zero to three points on a scale from calm to spontaneous. The total falls into one of four bands, and each band has its own result.",
        },
        {
          q: "Can I change the friend types?",
          a: "Yes. Rename the four results and rewrite the answers so each one still points to a single type, then test each result.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "e-commerce-lead-generation-quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes", "generate-leads"],
    roles: ["marketing", "sales"],
    searchName: "Ecommerce lead generation quiz",
    title: "Running shoe finder quiz",
    icon: "Store",
    metaDescription:
      "An ecommerce lead generation quiz for an online running shop. It matches shoppers to a running shoe, offers an optional email opt-in and always shows the result.",
    description: "A running shoe finder for online shops that earns the email instead of demanding it.",
    blurb:
      "Shoppers get something useful first: the kind of running shoe that suits where, how far and how they run. The email and a plain marketing opt-in are both optional, and the opt-in is skipped for anyone who leaves no address. Trail runners go straight to a trail pick, and everyone else is matched on the feel they want underfoot.",
    tags: ["ecommerce quiz", "lead generation quiz", "online store quiz", "email capture quiz", "running shoe finder"],
    greeting: "Shopping for running shoes? Tell us a little about how you run and we'll point you to the pair that suits you.",
    questions: [
      { ref: "first_name", type: "short_text", title: "What's your first name?", required: true, maxLength: 40 },
      {
        ref: "running_level",
        type: "single_select",
        title: "Where are you with running right now?",
        required: true,
        options: [
          { label: "Just starting, or coming back after a break" },
          { label: "Running a few times a week" },
          { label: "Training for a race" },
        ],
      },
      {
        ref: "weekly_distance",
        type: "dropdown",
        title: "Roughly how far do you run in a typical week?",
        required: true,
        options: [{ label: "Under 10 km" }, { label: "10–30 km" }, { label: "More than 30 km" }, { label: "I don't track it" }],
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Put these in order of what matters most in a running shoe.",
        required: true,
        items: ["Comfort and cushioning", "Light weight", "Grip", "Lasting a long time"],
      },
      {
        ref: "niggles",
        type: "multi_select",
        title: "Have any of these bothered you on runs? Pick any that apply.",
        description: "It helps us steer you away from shoes that make them worse.",
        required: false,
        minSelections: 0,
        maxSelections: 4,
        options: [{ label: "Sore knees" }, { label: "Shin pain" }, { label: "Blisters or rubbing" }, { label: "Tired feet on longer runs" }],
      },
      {
        ref: "email",
        type: "email",
        title: "Where should we send your match, with a sizing guide and a welcome discount?",
        description: "Optional. You'll see your result either way.",
        required: false,
      },
      {
        ref: "marketing_consent",
        type: "legal_consent",
        title: "Would you also like to hear about new shoes and offers?",
        consentText:
          "I'd like to receive emails about new arrivals and offers. I can unsubscribe at any time using the link in every email.",
        allowDecline: true,
        agreeLabel: "Yes, keep me posted",
        declineLabel: "No thanks",
        required: false,
      },
      {
        ref: "surface",
        type: "single_select",
        title: "Where do you do most of your running?",
        required: true,
        options: [
          { label: "Roads and pavements" },
          { label: "Trails, grass or mud" },
          { label: "On a treadmill" },
          { label: "A mix of everything" },
        ],
      },
      {
        ref: "feel",
        type: "single_select",
        title: "Last question: what do you want your shoes to feel like?",
        required: true,
        options: [
          { label: "Soft and cushioned, easy on my legs" },
          { label: "Steady and supportive, my feet tend to roll inward" },
          { label: "Light and fast, for quicker runs" },
        ],
      },
    ],
    branches: [
      { when: "email", op: "is_empty", then: "surface" },
      { when: "surface", is: "Trails, grass or mud", then: "end_trail" },
      { when: "feel", is: "Steady and supportive, my feet tend to roll inward", then: "end_stability" },
      { when: "feel", is: "Light and fast, for quicker runs", then: "end_light" },
    ],
    endings: [
      {
        ref: "end_trail",
        title: "Your match: a trail running shoe 🌲",
        body: "Off-road ground needs grip and protection. Trail shoes have deeper lugs for mud and loose paths and a tougher upper that stands up to roots and stones.",
      },
      {
        ref: "end_stability",
        title: "Your match: a stability shoe",
        body: "Stability shoes have a firmer section under the arch that helps keep feet rolling in from tipping too far. They suit steady everyday miles when you want a little more support.",
      },
      {
        ref: "end_light",
        title: "Your match: a lightweight tempo shoe",
        body: "A lighter, more responsive shoe makes faster runs and race days feel quicker. If you run most days, keep a cushioned pair for the easy ones too.",
      },
    ],
    ending: {
      title: "Your match: a cushioned daily trainer",
      body: "A well-cushioned everyday shoe takes the sting out of road miles and suits new runners and high mileage alike. It's the pair most runners wear for most of their runs.",
    },
    guide: {
      questionsToConsider: [
        "Which shoes can the quiz honestly recommend, and does every result link to a range you have in stock?",
        "Is your sizing guide or welcome discount something people will want enough to leave an email?",
        "Does your consent wording match how you really use email addresses?",
        "Should anyone who mentions knee or shin pain also get a note suggesting they speak to a professional?",
      ],
      howToUseResponses:
        "Only send marketing to people who agreed to it, and use their answers to make the first email relevant: a new runner doing under 10 km a week needs a simple sizing guide, not your race shoes. Export the responses to CSV to see which results come up most so you can stock up, and read the ranking answers to decide whether your product pages should lead with comfort, weight or durability.",
      customizeSteps: [
        "Swap the four results for your own ranges, and rewrite the last two questions so each answer points clearly to one of them.",
        "Edit the consent wording so it describes exactly what you will send, and keep both the email and the opt-in optional.",
        "Embed the quiz on your homepage or a category page, then test every result, plus one run with no email, before launch.",
      ],
      faqs: [
        {
          q: "What is an ecommerce lead generation quiz?",
          a: "A short quiz on a store's site that helps shoppers choose a product and, if they want, collects their email for a follow-up. It swaps a generic signup box for something useful.",
        },
        {
          q: "Should the email be required before showing the result?",
          a: "Usually not. People who get a useful result first are more likely to trust you with their email, and forcing it can bring in fake addresses.",
        },
        {
          q: "Do I need a consent question for marketing emails?",
          a: "In many places, yes. A separate opt-in with plain wording, as in this template, lets people get their result without agreeing to marketing.",
        },
        {
          q: "Where should the email question go in a lead generation quiz?",
          a: "Near the end, once people have given a few answers and want their result. Here it comes just before the last two questions, and the result shows whether or not they fill it in.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "english-placement-test",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes", "onboard-clients"],
    roles: ["education"],
    searchName: "English placement test",
    title: "English placement test",
    icon: "Languages",
    metaDescription:
      "An online English placement test with twelve grammar and vocabulary questions from beginner to advanced, a short writing task and five level results.",
    description: "Twelve graded questions, a short writing task and a suggested starting level.",
    blurb:
      "The grammar questions climb from beginner to advanced in five steps, each worth a point, and the total suggests a starting level from A1 to C1. A short writing task gives your teachers something real to check before confirming the placement, and the result screens say so.",
    tags: ["english placement test", "english level test", "esl placement test", "grammar test", "language school"],
    greeting: "Welcome! This short test helps us find the right class for you. It starts easy and gets harder, so don't worry if the last questions feel difficult.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your full name?", required: true, maxLength: 80 },
      { ref: "email", type: "email", title: "What email address should we send your result to?", required: true },
      { ref: "first_language", type: "short_text", title: "What is your first language?", required: true, maxLength: 60 },
      {
        ref: "goal",
        type: "single_select",
        title: "Why are you learning English?",
        required: true,
        options: [{ label: "For work" }, { label: "For study" }, { label: "For travel" }, { label: "To pass an exam" }, { label: "For everyday life" }],
      },
      {
        ref: "grammar_intro",
        type: "statement",
        title: "Now twelve grammar and vocabulary questions. Choose the best answer to complete each sentence. If you don't know, make your best guess.",
      },
      {
        ref: "q_be",
        type: "single_select",
        title: "She ___ a teacher.",
        required: true,
        options: [{ label: "am" }, { label: "is", score: 1 }, { label: "are" }, { label: "be" }],
      },
      {
        ref: "q_present",
        type: "single_select",
        title: "I ___ to work by bus every day.",
        required: true,
        options: [{ label: "go", score: 1 }, { label: "goes" }, { label: "going" }, { label: "gone" }],
      },
      {
        ref: "q_past",
        type: "single_select",
        title: "Yesterday we ___ to the cinema.",
        required: true,
        options: [{ label: "go" }, { label: "gone" }, { label: "went", score: 1 }, { label: "going" }],
      },
      {
        ref: "q_comparative",
        type: "single_select",
        title: "This book is ___ than the film.",
        required: true,
        options: [
          { label: "most interesting" },
          { label: "more interesting", score: 1 },
          { label: "interestinger" },
          { label: "as interesting" },
        ],
      },
      {
        ref: "q_present_perfect",
        type: "single_select",
        title: "How long ___ you lived in this city?",
        required: true,
        options: [{ label: "do" }, { label: "are" }, { label: "did" }, { label: "have", score: 1 }],
      },
      {
        ref: "q_first_conditional",
        type: "single_select",
        title: "If it rains tomorrow, we ___ at home.",
        required: true,
        options: [{ label: "will stay", score: 1 }, { label: "would stay" }, { label: "stayed" }, { label: "had stayed" }],
      },
      {
        ref: "q_passive",
        type: "single_select",
        title: "The bridge ___ in 1932.",
        required: true,
        options: [{ label: "built" }, { label: "has built" }, { label: "was built", score: 1 }, { label: "is building" }],
      },
      {
        ref: "q_second_conditional",
        type: "single_select",
        title: "If I ___ you, I would accept the offer.",
        required: true,
        options: [{ label: "am" }, { label: "were", score: 1 }, { label: "will be" }, { label: "would be" }],
      },
      {
        ref: "q_suggest",
        type: "single_select",
        title: "She suggested ___ a taxi to the airport.",
        required: true,
        options: [{ label: "to take" }, { label: "take" }, { label: "taking", score: 1 }, { label: "to taking" }],
      },
      {
        ref: "q_deduction",
        type: "single_select",
        title: "His car is still outside, so he ___ have taken the train.",
        required: true,
        options: [{ label: "must", score: 1 }, { label: "should" }, { label: "would" }, { label: "ought" }],
      },
      {
        ref: "q_inversion",
        type: "single_select",
        title: "Not only ___ late, but he also forgot the tickets.",
        required: true,
        options: [{ label: "he was" }, { label: "was he", score: 1 }, { label: "he did" }, { label: "did he be" }],
      },
      {
        ref: "q_vocab",
        type: "single_select",
        title: "Which word means \"to make something bad less serious\"?",
        required: true,
        options: [{ label: "exacerbate" }, { label: "instigate" }, { label: "mitigate", score: 1 }, { label: "relegate" }],
      },
      {
        ref: "writing_sample",
        type: "long_text",
        title: "Finally, in three to five sentences, tell us about your job, your studies or a place you love.",
        description: "This part isn't scored automatically. A teacher reads it to confirm your level.",
        required: true,
        minLength: 40,
        maxLength: 1500,
      },
    ],
    scoreEndings: [
      { atLeast: 11, then: "end_c1" },
      { atLeast: 9, then: "end_b2" },
      { atLeast: 6, then: "end_b1" },
      { atLeast: 3, then: "end_a2" },
    ],
    endings: [
      {
        ref: "end_c1",
        title: "Suggested level: C1, advanced 🏆",
        body: "You handled the hardest structures with ease. A teacher will read your writing and confirm your class by email.",
      },
      {
        ref: "end_b2",
        title: "Suggested level: B2, upper intermediate",
        body: "You're comfortable with most everyday grammar and some complex structures. A teacher will check your writing and confirm your class.",
      },
      {
        ref: "end_b1",
        title: "Suggested level: B1, intermediate",
        body: "You have a solid base and are ready to work on conditionals, the passive and more natural phrasing. We'll confirm your class after reading your writing.",
      },
      {
        ref: "end_a2",
        title: "Suggested level: A2, elementary",
        body: "You know the basics of present and past. An elementary class will build your confidence quickly. We'll confirm by email.",
      },
    ],
    ending: {
      title: "Suggested level: A1, beginner",
      body: "A beginner class is the best place to start, and you'll move up fast. A teacher will read your answers and contact you about next steps.",
    },
    guide: {
      questionsToConsider: [
        "Do the five levels match the classes you actually run, or should some bands be merged?",
        "Should the writing task be required, or offered only to people who score above beginner?",
        "Do you also need a speaking check before confirming a placement?",
        "Is the test meant for adults, teenagers or a specific exam group, and does the vocabulary suit them?",
      ],
      howToUseResponses:
        "Treat the score as a starting suggestion, then have a teacher read the writing sample before confirming the class. A student who scores B1 but writes at A2 level usually belongs in the lower class. Export the responses to CSV to group new students by suggested level and learning goal when you plan intakes.",
      customizeSteps: [
        "Swap in questions from your own course materials, keeping them in order from easiest to hardest with one point on each correct option.",
        "Adjust the score bands and result names to match your class levels, and update the endings with what happens next at your school.",
        "Share the link with new students before their first lesson, then review scores and writing samples in the dashboard.",
      ],
      faqs: [
        {
          q: "What does an English placement test measure?",
          a: "It gives a quick estimate of grammar and vocabulary level so a school can suggest a starting class. It is not an official certificate.",
        },
        {
          q: "How long should an English placement test be?",
          a: "Around ten to twenty graded questions plus a short writing task is enough for a first placement. Longer tests tire lower-level learners before they finish.",
        },
        {
          q: "What do A1, B1 and C1 mean?",
          a: "They are levels from the Common European Framework of Reference: A for beginner, B for intermediate and C for advanced. This template suggests a level; your teachers confirm it.",
        },
        {
          q: "Can students take the placement test on a phone?",
          a: "Yes. The test runs as a chat, one question at a time, so it works on a phone as well as a laptop.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "math-quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes"],
    roles: ["education"],
    searchName: "Math quiz",
    title: "Math practice quiz",
    icon: "Calculator",
    metaDescription:
      "A scored math quiz on order of operations, percentages, equations, area, fractions, primes and probability, plus a question where students explain their method.",
    description: "Ten scored problems across the core topics, plus a show-your-working question.",
    blurb:
      "Ten problems that each check one skill, with distractors built from the usual mistakes, like 36 for 7 + 5 × 3. The prime numbers question takes a point off for each wrong pick so guessing doesn't pay, and a written question asks students to explain one method so you can see how they think, not only what they got.",
    tags: ["math quiz", "maths quiz", "math practice test", "classroom quiz", "homework quiz"],
    greeting: "Ready for some math? Ten questions, no calculator needed, and your score at the end.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 60 },
      { ref: "class_group", type: "short_text", title: "Which class or group are you in?", required: false, maxLength: 40 },
      {
        ref: "order_ops",
        type: "single_select",
        title: "What is 7 + 5 × 3?",
        required: true,
        options: [{ label: "36" }, { label: "22", score: 1 }, { label: "26" }, { label: "15" }],
      },
      {
        ref: "percent",
        type: "single_select",
        title: "What is 15% of 80?",
        required: true,
        options: [{ label: "8" }, { label: "12", score: 1 }, { label: "15" }, { label: "18" }],
      },
      {
        ref: "equation",
        type: "single_select",
        title: "Solve for x: 3x − 7 = 11",
        required: true,
        options: [{ label: "x = 3" }, { label: "x = 4" }, { label: "x = 6", score: 1 }, { label: "x = 12" }],
      },
      {
        ref: "area",
        type: "single_select",
        title: "A rectangle is 8 cm long and 5 cm wide. What is its area?",
        required: true,
        options: [{ label: "13 cm²" }, { label: "26 cm²" }, { label: "40 cm²", score: 1 }, { label: "45 cm²" }],
      },
      {
        ref: "fraction",
        type: "single_select",
        title: "Write 18/24 in its simplest form.",
        required: true,
        options: [{ label: "2/3" }, { label: "3/4", score: 1 }, { label: "4/5" }, { label: "5/6" }],
      },
      {
        ref: "discount",
        type: "single_select",
        title: "A jacket costs 40 and is reduced by 25%. What is the sale price?",
        required: true,
        options: [{ label: "10" }, { label: "15" }, { label: "30", score: 1 }, { label: "35" }],
      },
      {
        ref: "primes",
        type: "multi_select",
        title: "Which of these are prime numbers? Pick all that apply.",
        description: "A wrong pick takes a point away.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "2", score: 1 },
          { label: "9", score: -1 },
          { label: "17", score: 1 },
          { label: "21", score: -1 },
          { label: "23", score: 1 },
        ],
      },
      {
        ref: "mean",
        type: "single_select",
        title: "What is the mean of 4, 8, 6, 10 and 7?",
        required: true,
        options: [{ label: "6" }, { label: "7", score: 1 }, { label: "8" }, { label: "35" }],
      },
      {
        ref: "triangle",
        type: "single_select",
        title: "Two angles of a triangle are 50° and 60°. What is the third angle?",
        required: true,
        options: [{ label: "70°", score: 1 }, { label: "80°" }, { label: "90°" }, { label: "110°" }],
      },
      {
        ref: "probability",
        type: "single_select",
        title: "You roll a fair six-sided die. What is the probability of rolling an even number?",
        required: true,
        options: [{ label: "1/6" }, { label: "1/3" }, { label: "1/2", score: 1 }, { label: "2/3" }],
      },
      {
        ref: "explain_method",
        type: "long_text",
        title: "Pick one question and explain, step by step, how you worked it out.",
        description: "Not scored. Your teacher reads this to see your method.",
        required: false,
        maxLength: 1500,
      },
      {
        ref: "difficulty",
        type: "opinion_scale",
        title: "How hard did that feel?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Easy",
        labelHigh: "Really hard",
      },
    ],
    scoreEndings: [
      { atLeast: 11, then: "end_top" },
      { atLeast: 7, then: "end_good" },
    ],
    endings: [
      {
        ref: "end_top",
        title: "Math star ⭐",
        body: "Nearly everything right, primes included. Your teacher will look at your method, so make sure it's as tidy as your answers.",
      },
      {
        ref: "end_good",
        title: "Good work",
        body: "You got most of them. Check order of operations and percentages again, since those are where small slips happen.",
      },
    ],
    ending: {
      title: "Keep practising 📐",
      body: "Some of these topics need another look, and that's what practice is for. Your teacher will go over the tricky ones with you.",
    },
    guide: {
      questionsToConsider: [
        "Which topic or unit is this quiz checking, and should every question come from it?",
        "Do you want students to explain one method in writing, or would that slow a quick starter activity down?",
        "Should a wrong pick in the prime numbers question lose a point, or is that too harsh for your group?",
        "Is the class using metric units and a particular currency, so the word problems read naturally?",
      ],
      howToUseResponses:
        "Look question by question, not only at the totals. A wrong answer usually shows which mistake a student made: 36 on the first question means they worked left to right, and 26 on the rectangle question means they worked out the perimeter. Group students by their most common mistake, and read the written methods from anyone whose score and difficulty rating don't match.",
      customizeSteps: [
        "Replace the problems with your own unit, keeping one point on each correct option and wrong answers that match common mistakes.",
        "Move the score bands if you change the number of questions, and adjust the results to say what happens next in your class.",
        "Share the link with your class or set it as homework, then review scores and methods in the dashboard.",
      ],
      faqs: [
        {
          q: "How do I make a good multiple choice math question?",
          a: "Build the wrong answers from real mistakes, like adding before multiplying. Then a wrong pick tells you exactly what went wrong.",
        },
        {
          q: "Can students show their working in an online math quiz?",
          a: "Yes. This template has a written question where students explain one method step by step, which you read alongside their score.",
        },
        {
          q: "Can I use this math quiz as homework?",
          a: "Yes. Share the link, ask for a name and class, and sort the results by score or class in the dashboard.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "online-science-quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes"],
    roles: ["education"],
    searchName: "Online science quiz",
    title: "Science understanding quiz",
    icon: "FlaskConical",
    metaDescription:
      "An online science quiz that checks understanding, not just recall: heat, density, forces, seasons, photosynthesis and chemical change, scored with three results.",
    description: "Ten scored questions that ask why things happen, plus a topic to revisit.",
    blurb:
      "Most questions describe something students have seen, like lightning before thunder or a spoon heating up in soup, and ask why it happens. The chemical change question takes a point off for each wrong pick, and a final question asks which topic they'd like to go over again, which gives you a lesson plan as well as a score.",
    tags: ["science quiz", "online science quiz", "science test", "classroom quiz", "physics and biology quiz"],
    greeting: "Time for some science. These questions ask why things happen, so think it through before you pick.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 60 },
      {
        ref: "lightning",
        type: "single_select",
        title: "During a storm, why do you see lightning before you hear thunder?",
        required: true,
        options: [
          { label: "Lightning happens first and thunder follows later" },
          { label: "Light travels much faster than sound", score: 1 },
          { label: "Sound is blocked by the clouds" },
          { label: "Our eyes react faster than our ears" },
        ],
      },
      {
        ref: "conduction",
        type: "single_select",
        title: "A metal spoon left in hot soup gets hot all the way up the handle. How does the heat travel?",
        required: true,
        options: [{ label: "Radiation" }, { label: "Convection" }, { label: "Conduction", score: 1 }, { label: "Evaporation" }],
      },
      {
        ref: "ice_floats",
        type: "single_select",
        title: "Why does ice float on water?",
        required: true,
        options: [
          { label: "Ice is less dense than liquid water", score: 1 },
          { label: "Ice has air trapped inside it" },
          { label: "Cold things always rise" },
          { label: "Ice is lighter than water in every amount" },
        ],
      },
      {
        ref: "dark_plant",
        type: "single_select",
        title: "A plant kept in a dark cupboard for a week turns pale and weak. What couldn't it do?",
        required: true,
        options: [{ label: "Respiration" }, { label: "Photosynthesis", score: 1 }, { label: "Transpiration" }, { label: "Pollination" }],
      },
      {
        ref: "seasons",
        type: "single_select",
        title: "What causes the seasons on Earth?",
        required: true,
        options: [
          { label: "Earth moving closer to and further from the Sun" },
          { label: "The tilt of Earth's axis", score: 1 },
          { label: "Changes in the Sun's temperature" },
          { label: "The Moon's orbit" },
        ],
      },
      {
        ref: "chemical_change",
        type: "multi_select",
        title: "Which of these are chemical changes? Pick all that apply.",
        description: "A wrong pick takes a point away.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Burning wood", score: 1 },
          { label: "Melting ice", score: -1 },
          { label: "Iron rusting", score: 1 },
          { label: "Dissolving sugar in water", score: -1 },
          { label: "Baking a cake", score: 1 },
        ],
      },
      {
        ref: "falling",
        type: "single_select",
        title: "Ignoring air resistance, you drop a heavy ball and a light ball of the same size from the same height. Which lands first?",
        required: true,
        options: [
          { label: "The heavy ball" },
          { label: "The light ball" },
          { label: "They land at the same time", score: 1 },
          { label: "It depends on the colour" },
        ],
      },
      {
        ref: "red_blood",
        type: "single_select",
        title: "What is the main job of red blood cells?",
        required: true,
        options: [
          { label: "Fighting infections" },
          { label: "Carrying oxygen around the body", score: 1 },
          { label: "Helping blood clot" },
          { label: "Digesting food" },
        ],
      },
      {
        ref: "breathe_out",
        type: "single_select",
        title: "Which gas do you breathe out more of than you breathe in?",
        required: true,
        options: [{ label: "Oxygen" }, { label: "Nitrogen" }, { label: "Carbon dioxide", score: 1 }, { label: "Hydrogen" }],
      },
      {
        ref: "light_year",
        type: "single_select",
        title: "What does a light-year measure?",
        required: true,
        options: [{ label: "Time" }, { label: "Distance", score: 1 }, { label: "Brightness" }, { label: "Speed" }],
      },
      {
        ref: "revisit",
        type: "multi_select",
        title: "Which topics would you like to go over again?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [{ label: "Heat and energy" }, { label: "Forces and motion" }, { label: "Living things" }, { label: "Earth and space" }, { label: "Materials and chemical change" }],
      },
    ],
    scoreEndings: [
      { atLeast: 11, then: "end_scientist" },
      { atLeast: 7, then: "end_curious" },
    ],
    endings: [
      {
        ref: "end_scientist",
        title: "Budding scientist 🔬",
        body: "You didn't just remember facts, you explained them. Even the chemical change question didn't catch you out.",
      },
      {
        ref: "end_curious",
        title: "Curious mind",
        body: "A good score. Have another look at the questions about seasons and falling objects, since the obvious answer is often the wrong one.",
      },
    ],
    ending: {
      title: "Keep exploring 🌍",
      body: "Science is full of answers that surprise people. Your teacher will go over the topics you picked, and you can try again after.",
    },
    guide: {
      questionsToConsider: [
        "Which topic or year group is this for, and does every question fit what they've been taught?",
        "Do the wrong answers include the misconceptions students really hold, like distance from the Sun causing the seasons?",
        "Should a wrong pick in the chemical change question lose a point for younger students?",
        "Will you use the topics students want to revisit to plan the next lesson?",
      ],
      howToUseResponses:
        "Check which wrong answers were most popular, since each one maps to a known misconception. Many students picking \"the heavy ball\" means forces and motion needs a demonstration. Combine that with the topics students asked to revisit to plan a review lesson, and export to CSV if you track progress across terms.",
      customizeSteps: [
        "Replace the questions with your own unit, keeping one point on each correct option and wrong answers based on common misconceptions.",
        "Edit the list of topics to revisit so it matches your scheme of work, and move the score bands if you change the question count.",
        "Share the link with your class, then read the scores, popular wrong answers and topic requests in the dashboard.",
      ],
      faqs: [
        {
          q: "How do I write science quiz questions that test understanding?",
          a: "Describe something students have seen and ask why it happens. Use common misconceptions as the wrong answers so a wrong pick tells you what to reteach.",
        },
        {
          q: "What age is this science quiz for?",
          a: "The questions suit students around eleven to fourteen. Swap in simpler or harder questions for other groups and keep the same structure.",
        },
        {
          q: "Can I use this as a revision quiz?",
          a: "Yes. The final question asks which topics students want to go over again, so the results double as a plan for your revision lesson.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "spelling-quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes"],
    roles: ["education"],
    searchName: "Spelling quiz",
    title: "Commonly misspelled words quiz",
    icon: "PenTool",
    metaDescription:
      "A spelling quiz built on commonly misspelled words, with each word in a sentence, two homophone questions and a spot-the-mistake round. Scored with three results.",
    description: "Commonly misspelled words in sentences, plus homophones and a spot-the-mistake round.",
    blurb:
      "Every word comes in a sentence, so learners know which word is meant, and the wrong options are the misspellings people really write, like \"definately\" and \"recieve\". Homophones and a pick-all round where a wrong pick costs a point keep it from being a guessing game.",
    tags: ["spelling quiz", "spelling test", "commonly misspelled words", "homophones quiz", "classroom quiz"],
    greeting: "Spelling test time. Each word comes in a sentence, so read it through before you pick.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 60 },
      { ref: "class_group", type: "short_text", title: "Which class or group are you in?", required: false, maxLength: 40 },
      {
        ref: "separate",
        type: "single_select",
        title: "Sort the darks and lights into ___ piles before washing.",
        required: true,
        options: [{ label: "seperate" }, { label: "separate", score: 1 }, { label: "separete" }, { label: "seperat" }],
      },
      {
        ref: "necessary",
        type: "single_select",
        title: "It is ___ to wear a helmet on a bike.",
        required: true,
        options: [{ label: "neccessary" }, { label: "necesary" }, { label: "necessary", score: 1 }, { label: "nessesary" }],
      },
      {
        ref: "definitely",
        type: "single_select",
        title: "I will ___ be there on time.",
        required: true,
        options: [{ label: "definately" }, { label: "definitely", score: 1 }, { label: "definitly" }, { label: "defenitely" }],
      },
      {
        ref: "receive",
        type: "single_select",
        title: "Did you ___ my letter?",
        required: true,
        options: [{ label: "recieve" }, { label: "receeve" }, { label: "receve" }, { label: "receive", score: 1 }],
      },
      {
        ref: "accommodate",
        type: "single_select",
        title: "The hotel can ___ forty guests.",
        required: true,
        options: [{ label: "acommodate" }, { label: "accomodate" }, { label: "accommodate", score: 1 }, { label: "acomodate" }],
      },
      {
        ref: "rhythm",
        type: "single_select",
        title: "Clap along to the ___ of the song.",
        required: true,
        options: [{ label: "rythm" }, { label: "rhythm", score: 1 }, { label: "rhythem" }, { label: "rhythmn" }],
      },
      {
        ref: "theyre",
        type: "single_select",
        title: "Call your cousins and ask if ___ coming to dinner.",
        required: true,
        options: [{ label: "their" }, { label: "there" }, { label: "they're", score: 1 }],
      },
      {
        ref: "its",
        type: "single_select",
        title: "The dog wagged ___ tail.",
        required: true,
        options: [{ label: "it's" }, { label: "its", score: 1 }, { label: "its'" }],
      },
      {
        ref: "wednesday",
        type: "single_select",
        title: "Is this word spelled correctly? Wednesday",
        required: true,
        options: [{ label: "Spelled correctly", score: 1 }, { label: "Misspelled" }],
      },
      {
        ref: "february",
        type: "single_select",
        title: "Is this word spelled correctly? Febuary",
        required: true,
        options: [{ label: "Spelled correctly" }, { label: "Misspelled", score: 1 }],
      },
      {
        ref: "spot_correct",
        type: "multi_select",
        title: "Which of these words are spelled correctly? Pick all that apply.",
        description: "A wrong pick takes a point away.",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "calendar", score: 1 },
          { label: "tommorow", score: -1 },
          { label: "believe", score: 1 },
          { label: "wierd", score: -1 },
        ],
      },
    ],
    scoreEndings: [
      { atLeast: 11, then: "end_champion" },
      { atLeast: 7, then: "end_nearly" },
    ],
    endings: [
      {
        ref: "end_champion",
        title: "Spelling champion 🏅",
        body: "Almost perfect. Words like \"accommodate\" and \"rhythm\" trip up plenty of adults, so a score like this is worth being proud of.",
      },
      {
        ref: "end_nearly",
        title: "Nearly there ✏️",
        body: "A good score. Look again at the words with double letters, like \"accommodate\" and \"necessary\", and try once more.",
      },
    ],
    ending: {
      title: "Practice makes perfect 📖",
      body: "These are some of the most misspelled words in English, so you're in good company. Write out the ones you missed three times and try again.",
    },
    guide: {
      questionsToConsider: [
        "Which word list is this for: this week's class list, common errors, or exam vocabulary?",
        "Do you teach British or American spelling? These words are spelled the same in both, but your own list may not be.",
        "Should the homophone questions stay, or does your class need a separate homophone quiz?",
        "Would you rather have learners type the word, and mark it by hand, than choose from options?",
      ],
      howToUseResponses:
        "Look at which misspelling each learner chose, not only whether they got it wrong. Picking \"recieve\" shows they need the \"except after c\" rule, while \"accomodate\" shows they're missing double letters. Build next week's list from the words most of the class missed, and give individual learners their own few words to practise.",
      customizeSteps: [
        "Replace the words with your own list, writing each in a short sentence and using real misspellings as the wrong options.",
        "Keep one point on each correct spelling and move the score bands if you add or remove words.",
        "Share the link with your class or set it as homework, then check scores and the most common misspellings in the dashboard.",
      ],
      faqs: [
        {
          q: "Why put spelling words in a sentence?",
          a: "A sentence shows which word is meant, which matters for words that sound alike, like \"their\" and \"they're\". Keep the sentence simple so it doesn't become a reading test.",
        },
        {
          q: "What are the most commonly misspelled words?",
          a: "Words with double letters or silent letters, like accommodate, necessary, rhythm and February, plus \"definitely\", \"separate\" and \"receive\".",
        },
        {
          q: "How many words should a spelling quiz have?",
          a: "Ten to fifteen words is typical for a weekly class test. Fewer works for a quick warm-up.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes"],
    roles: ["education", "hr-people"],
    searchName: "Knowledge quiz",
    title: "Adaptive knowledge quiz",
    icon: "ListChecks",
    metaDescription:
      "A scored knowledge quiz that adapts to the taker: a warm-up question sends beginners to an easier set and confident players to a harder one, with three results.",
    description: "A scored quiz whose warm-up question picks an easier or a harder set.",
    blurb:
      "The scoring is already wired, so you only replace the wording. A warm-up question sends beginners to an easier set and confident takers to a harder one, both worth the same points, which keeps the quiz interesting for both ends of a class or team. The total picks one of three results.",
    tags: ["knowledge quiz", "adaptive quiz", "scored quiz", "online quiz", "branching quiz"],
    greeting: "A short quiz. No pressure: tell us how much you know and we'll pick the right questions for you.",
    questions: [
      { ref: "name", type: "short_text", title: "What should we call you?", required: true, maxLength: 60 },
      {
        ref: "self_level",
        type: "single_select",
        title: "How would you rate your general knowledge?",
        required: true,
        options: [{ label: "Just starting out" }, { label: "I know a bit" }, { label: "I know this well" }],
      },

      // The easier set
      {
        ref: "easy_1",
        type: "single_select",
        title: "Which of these is a primary colour of paint?",
        required: true,
        options: [{ label: "Green" }, { label: "Blue", score: 1 }, { label: "Orange" }, { label: "Purple" }],
      },
      {
        ref: "easy_2",
        type: "single_select",
        title: "True or false: the Pacific is the largest ocean on Earth.",
        required: true,
        options: [{ label: "True", score: 1 }, { label: "False" }],
      },
      {
        ref: "easy_3",
        type: "multi_select",
        title: "Which of these are mammals? Pick all that apply.",
        description: "A wrong pick takes a point away.",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Dolphin", score: 1 },
          { label: "Shark", score: -1 },
          { label: "Bat", score: 1 },
          { label: "Penguin", score: -1 },
        ],
      },

      // The harder set
      {
        ref: "hard_1",
        type: "single_select",
        title: "Which gas makes up most of Earth's atmosphere?",
        required: true,
        options: [{ label: "Oxygen" }, { label: "Nitrogen", score: 1 }, { label: "Carbon dioxide" }, { label: "Argon" }],
      },
      {
        ref: "hard_2",
        type: "single_select",
        title: "What is the chemical symbol for gold?",
        required: true,
        options: [{ label: "Go" }, { label: "Gd" }, { label: "Au", score: 1 }, { label: "Ag" }],
      },
      {
        ref: "hard_3",
        type: "multi_select",
        title: "Which of these planets are gas giants? Pick all that apply.",
        description: "A wrong pick takes a point away.",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Jupiter", score: 1 },
          { label: "Mars", score: -1 },
          { label: "Saturn", score: 1 },
          { label: "Venus", score: -1 },
        ],
      },

      // Everyone
      {
        ref: "confidence",
        type: "opinion_scale",
        title: "How confident are you in your answers?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Guessing",
        labelHigh: "Certain",
      },
      {
        ref: "email",
        type: "email",
        title: "Where should we send your score? This is optional.",
        required: false,
      },
    ],
    branches: [
      { when: "self_level", is: "Just starting out", then: "easy_1" },
      { when: "self_level", is: "I know a bit", then: "easy_1" },
      { when: "self_level", is: "I know this well", then: "hard_1" },
      { when: "easy_3", always: true, then: "confidence" },
    ],
    scoreEndings: [
      { atLeast: 4, then: "end_top" },
      { atLeast: 2, then: "end_mid" },
    ],
    endings: [
      {
        ref: "end_top",
        title: "Full marks ✅",
        body: "You got every question in your set right. If you took the easier set, try again and pick the harder one next time.",
      },
      {
        ref: "end_mid",
        title: "Good effort",
        body: "You got at least half. The pick-all-that-apply question is usually where the points go, so read every option carefully next time.",
      },
    ],
    ending: {
      title: "A place to start 📘",
      body: "Every quiz teaches you something. Have a look at the answers you weren't sure about and give it another go.",
    },
    guide: {
      questionsToConsider: [
        "What topic is the quiz on, and what separates a beginner question from a harder one in it?",
        "Should the easier and harder sets be worth the same points, or should the harder set be able to earn more?",
        "Is this for a class, a training session or a bit of fun, and do you need names or emails at all?",
      ],
      howToUseResponses:
        "Compare the warm-up answer with the score. People who said they know the topic well but scored low are overconfident, and people who chose the easy set and got full marks are ready for more. For a class or team, use that split to decide who needs support and who needs a stretch.",
      customizeSteps: [
        "Replace the six questions with your own topic, three easier and three harder, keeping one point on each correct option.",
        "If you change how many points each set can earn, move the score bands so the top result still needs a clean sweep.",
        "Share the link, then test both routes by answering the warm-up question each way before you send it out.",
      ],
      faqs: [
        {
          q: "What is an adaptive quiz?",
          a: "A quiz that changes which questions it asks based on earlier answers. Here, a warm-up question sends each person to an easier or a harder set.",
        },
        {
          q: "How is this quiz scored?",
          a: "Each correct option is worth a point, and a wrong pick in a pick-all question takes one away. Both sets can earn the same total, and the total picks one of three results.",
        },
        {
          q: "Can I add more questions to each set?",
          a: "Yes. Add them inside the easier or harder set, then move the score bands so they still fit the new maximum.",
        },
      ],
    },
  }),
];
