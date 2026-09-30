import { defineTemplate, type TemplateSeed } from "../define.js";

export const QUIZ_MARKETING: TemplateSeed[] = [
  defineTemplate({
    slug: "lead-generation-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["generate-leads", "engage-with-quizzes"],
    roles: ["marketing", "sales", "freelancers-agencies"],
    searchName: "Lead generation quiz",
    title: "Growth check quiz",
    icon: "Target",
    metaDescription:
      "A lead generation quiz that diagnoses a business's biggest growth gap, collects contact details and gives each visitor a specific next step to act on.",
    description: "Nine quick questions that end in a tailored growth recommendation.",
    blurb:
      "Visitors answer questions about their business, marketing channels and lead flow, then pick the one problem they would fix first. That answer routes them to one of four specific results, so the lead gets real advice and you get a qualified contact with context attached.",
    tags: ["lead generation quiz", "lead magnet quiz", "marketing assessment", "growth quiz", "agency quiz"],
    greeting:
      "Where is your growth getting stuck? Answer nine quick questions and you'll get a recommendation for what to fix first.",
    questions: [
      {
        ref: "business_type",
        type: "single_select",
        title: "What kind of business do you run?",
        required: true,
        allowOther: true,
        options: [
          { label: "Service business or consultancy" },
          { label: "Online store" },
          { label: "Software or app" },
          { label: "Local shop, studio or clinic" },
          { label: "Nonprofit" },
        ],
      },
      {
        ref: "team_size",
        type: "dropdown",
        title: "How many people work on the business, including you?",
        required: true,
        options: [{ label: "Just me" }, { label: "2–5" }, { label: "6–20" }, { label: "21–100" }, { label: "More than 100" }],
      },
      {
        ref: "channels",
        type: "multi_select",
        title: "Which channels bring you customers today? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 8,
        options: [
          { label: "Word of mouth and referrals" },
          { label: "Search engines" },
          { label: "Social media" },
          { label: "Paid ads" },
          { label: "Email newsletter" },
          { label: "Events or networking" },
          { label: "Partners or marketplaces" },
          { label: "Honestly, I'm not sure" },
        ],
      },
      {
        ref: "lead_flow",
        type: "opinion_scale",
        title: "How steady is the flow of new enquiries from month to month?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Feast or famine",
        labelHigh: "Like clockwork",
      },
      {
        ref: "tracking",
        type: "yes_no",
        title: "Could you say which channel brought in each of your last ten customers?",
        required: true,
      },
      {
        ref: "timeline",
        type: "single_select",
        title: "When do you want to see a change?",
        required: true,
        options: [
          { label: "This month" },
          { label: "In the next three months" },
          { label: "This year" },
          { label: "Just exploring for now" },
        ],
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "Where should we send a copy of your result?",
        required: true,
        fields: ["first_name", "email"],
      },
      {
        ref: "wants_call",
        type: "yes_no",
        title: "Would a short call to talk through your result be useful?",
        required: false,
      },
      {
        ref: "priority",
        type: "single_select",
        title: "Last one, and it decides your result. Which of these would you fix first?",
        required: true,
        options: [
          { label: "Not enough people find us", description: "Visibility" },
          { label: "People visit but don't get in touch", description: "Conversion" },
          { label: "Enquiries come in but don't turn into customers", description: "Follow-up" },
          { label: "Customers buy once and don't come back", description: "Retention" },
        ],
      },
    ],
    branches: [
      { when: "priority", is: "Not enough people find us", then: "end_visibility" },
      { when: "priority", is: "People visit but don't get in touch", then: "end_conversion" },
      { when: "priority", is: "Enquiries come in but don't turn into customers", then: "end_followup" },
    ],
    endings: [
      {
        ref: "end_visibility",
        title: "Your next step: get found 🔎",
        body: "Pick the one channel where your best customers already spend time and show up there every week for a quarter. Steady effort on one channel beats a thin presence on five.",
      },
      {
        ref: "end_conversion",
        title: "Your next step: make it easy to say yes",
        body: "People are already arriving, so the gap is on the page. Put one clear offer and one way to get in touch near the top, and add proof from real customers right beside it.",
      },
      {
        ref: "end_followup",
        title: "Your next step: tighten the follow-up",
        body: "Interest is there, but it cools off. Reply to every enquiry within a working day, and write a simple three-message follow-up so nobody falls through the cracks.",
      },
    ],
    ending: {
      title: "Your next step: bring customers back 🔁",
      body: "A repeat sale is usually easier to win than a new customer. Start with a check-in message a few weeks after purchase and a reason to return, like early access or a reorder reminder.",
    },
    guide: {
      questionsToConsider: [
        "What are the three or four problems you actually solve for clients? Each one should become a result.",
        "Which answers mark someone as a strong lead for you: team size, timeline, or asking for a call?",
        "Is a first name and email enough, or does your sales process need a phone number too?",
        "Would you rather collect contact details before the result, or make them optional?",
      ],
      howToUseResponses:
        "Start with anyone who said yes to a call and picked a timeline of this month or the next three months: they are your warmest leads, and their result tells you what to open the conversation with. Group the rest by result and send each group content that matches their problem. Over time, the spread of results shows which service to market hardest.",
      customizeSteps: [
        "Rewrite the four results so each one points to a service or resource you really offer, then match the options on the last question.",
        "Swap the business type and team size options for the segments you sell to, and add a budget question if it helps you qualify.",
        "Share the link from your site, newsletter or social profiles, or embed it on a landing page as your main call to action.",
      ],
      faqs: [
        {
          q: "What is a lead generation quiz?",
          a: "It is a short quiz that gives visitors a useful, personalised result in exchange for their contact details. Because the answers describe their situation, every lead arrives with context your sales team can use.",
        },
        {
          q: "Should I ask for an email before showing the result?",
          a: "Asking just before the result works well because people have already invested in the answers. If you want more completions, make the email optional and show the result either way.",
        },
        {
          q: "How many questions should a lead generation quiz have?",
          a: "Enough to make the result feel earned, and few enough to finish in a couple of minutes. Seven to ten short questions is a common range.",
        },
        {
          q: "How does each person get a different result?",
          a: "The final question routes each answer to its own ending with branching logic, so you can edit the results or add new ones in the builder.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "digital-marketing-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["marketing", "education"],
    searchName: "Digital marketing quiz",
    title: "Digital marketing quiz",
    icon: "Laptop",
    metaDescription:
      "A scored digital marketing quiz covering SEO, click-through rate, owned media, UTM links, funnels and email opt-in, with a result that matches each score.",
    description: "Eight scored questions on the basics every online marketer should know.",
    blurb:
      "Covers the terms people use every day but often mix up, from click-through rate to first-party data, plus one small calculation. Each right answer earns a point, a wrong pick in the data round costs one, and the total lands on one of three results.",
    tags: ["digital marketing quiz", "marketing trivia", "SEO quiz", "marketing training", "scored quiz"],
    greeting: "Think you know your CTR from your UTM? Eight questions, and a result at the end.",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on your result?", required: true, maxLength: 40 },
      {
        ref: "seo",
        type: "single_select",
        title: "What does SEO stand for?",
        required: true,
        options: [
          { label: "Search engine optimisation", score: 1 },
          { label: "Social engagement output" },
          { label: "Sales efficiency overview" },
          { label: "Site entry order" },
        ],
      },
      {
        ref: "ctr",
        type: "single_select",
        title: "Click-through rate is clicks divided by what?",
        required: true,
        options: [
          { label: "Conversions" },
          { label: "Impressions", score: 1 },
          { label: "Followers" },
          { label: "Total ad spend" },
        ],
      },
      {
        ref: "owned_media",
        type: "single_select",
        title: "Which of these is owned media?",
        required: true,
        options: [
          { label: "A sponsored post" },
          { label: "A news article about your company" },
          { label: "Your company blog", score: 1 },
          { label: "A customer sharing your product" },
        ],
      },
      {
        ref: "conversion_rate",
        type: "single_select",
        title: "A landing page gets 1,000 visitors and 30 of them sign up. What is its conversion rate?",
        required: true,
        options: [{ label: "0.3%" }, { label: "3%", score: 1 }, { label: "30%" }, { label: "33%" }],
      },
      {
        ref: "first_party",
        type: "multi_select",
        title: "Which of these count as first-party data? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Newsletter sign-ups on your own site", score: 1 },
          { label: "Purchase history from your own shop", score: 1 },
          { label: "A contact list bought from a data broker", score: -1 },
          { label: "Interest segments from a third-party data provider", score: -1 },
        ],
      },
      {
        ref: "utm",
        type: "single_select",
        title: "What are UTM parameters added to a link for?",
        required: true,
        options: [
          { label: "To make the link shorter" },
          { label: "To tell your analytics where a visit came from", score: 1 },
          { label: "To stop the link being shared" },
          { label: "To improve search rankings" },
        ],
      },
      {
        ref: "funnel",
        type: "single_select",
        title: "In a classic marketing funnel, which stage comes first?",
        required: true,
        options: [
          { label: "Consideration" },
          { label: "Loyalty" },
          { label: "Awareness", score: 1 },
          { label: "Purchase" },
        ],
      },
      {
        ref: "opt_in",
        type: "single_select",
        title: "Someone has opted in to your email list. What does that mean?",
        required: true,
        options: [
          { label: "They opened your last email" },
          { label: "They agreed to receive emails from you", score: 1 },
          { label: "They bought something from you" },
          { label: "They follow you on social media" },
        ],
      },
      {
        ref: "confidence",
        type: "rating",
        title: "Before your result: how confident are you feeling?",
        required: false,
        scale: 5,
        shape: "star",
      },
    ],
    scoreEndings: [
      { atLeast: 8, then: "end_expert" },
      { atLeast: 5, then: "end_practitioner" },
    ],
    endings: [
      {
        ref: "end_expert",
        title: "Marketing pro 🏆",
        body: "You know the metrics, the media types and the tracking that ties them together. You could be the one explaining this to the rest of the team.",
      },
      {
        ref: "end_practitioner",
        title: "Solid practitioner",
        body: "You have the core ideas down. A couple of terms tripped you up, most often first-party data or the funnel, so they are worth a second look.",
      },
    ],
    ending: {
      title: "Getting started",
      body: "Everyone starts somewhere. Click-through rate, conversion rate and UTM links are the three worth learning first, because nearly every report uses them.",
    },
    guide: {
      questionsToConsider: [
        "Is this for new hires, students or clients? Beginners need definitions, experienced teams need scenarios.",
        "Which topics matter most in your work: search, paid social, email or analytics?",
        "Should a wrong pick in the first-party data question cost a point, or just earn nothing?",
        "Do you want to show the correct answers afterwards, perhaps in a follow-up session?",
      ],
      howToUseResponses:
        "Sort by result to see who is ready for more advanced training and who needs the basics. Then look question by question: if most people missed the conversion rate or first-party data question, that is the topic for your next workshop. Rerun the quiz after training to see whether the scores move.",
      customizeSteps: [
        "Swap in questions about the channels and tools your team actually uses, keeping one point on each correct option.",
        "Move the score bands if you add or remove questions, so the top result still needs nearly everything right.",
        "Share the link in your onboarding pack or course page, and read the scores in the dashboard or export them to CSV.",
      ],
      faqs: [
        {
          q: "What topics should a digital marketing quiz cover?",
          a: "The basics most roles share: search, paid and owned media, key metrics like click-through and conversion rate, tracking links and email permission. Add channel-specific questions for specialist teams.",
        },
        {
          q: "Can I use this quiz to assess new marketing hires?",
          a: "It works well as a friendly check during onboarding to spot gaps. It is too short to judge someone's overall ability, so treat it as a conversation starter.",
        },
        {
          q: "How is the quiz scored?",
          a: "Each correct option is worth one point, and in the first-party data question a wrong pick takes a point away. The total chooses one of three results.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "advertising-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["marketing", "education"],
    searchName: "Advertising quiz",
    title: "Advertising quiz",
    icon: "Megaphone",
    metaDescription:
      "An advertising quiz with scored questions on CPM, reach and frequency, retargeting, ROAS, out-of-home media and clear campaign goals. Results match the score.",
    description: "Eight scored questions on how ads are bought, aimed and measured.",
    blurb:
      "Tests the ideas behind every campaign: who sees the ad, how often, what it costs and whether it paid off. Includes a quick return-on-ad-spend sum and a pick-all-that-apply media round where a wrong pick costs a point, and the total picks one of three results.",
    tags: ["advertising quiz", "marketing quiz", "media buying quiz", "ad metrics", "scored quiz"],
    greeting: "Ready to test your ad sense? Eight questions on audiences, media and measurement.",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on your result?", required: true, maxLength: 40 },
      {
        ref: "cpm",
        type: "single_select",
        title: "In advertising, what does CPM measure?",
        required: true,
        options: [
          { label: "Cost per thousand impressions", score: 1 },
          { label: "Clicks per minute" },
          { label: "Cost per purchase made" },
          { label: "Customers per month" },
        ],
      },
      {
        ref: "frequency",
        type: "single_select",
        title: "If reach is how many people saw your ad, what is frequency?",
        required: true,
        options: [
          { label: "How many people clicked it" },
          { label: "The average number of times each person saw it", score: 1 },
          { label: "How often you changed the design" },
          { label: "How many days the campaign ran" },
        ],
      },
      {
        ref: "retargeting",
        type: "single_select",
        title: "What is retargeting?",
        required: true,
        options: [
          { label: "Moving a campaign to a new country" },
          { label: "Showing ads to people who already visited your site or app", score: 1 },
          { label: "Rewriting an ad after it is rejected" },
          { label: "Aiming at your competitor's customers by name" },
        ],
      },
      {
        ref: "roas",
        type: "single_select",
        title: "A campaign costs 500 and brings in 2,000 in sales. What is its return on ad spend?",
        required: true,
        options: [{ label: "0.25" }, { label: "1.5" }, { label: "4", score: 1 }, { label: "2,500" }],
      },
      {
        ref: "out_of_home",
        type: "multi_select",
        title: "Which of these are out-of-home advertising? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "A billboard by the motorway", score: 1 },
          { label: "A poster in a bus shelter", score: 1 },
          { label: "A screen in an airport", score: 1 },
          { label: "A search ad", score: -1 },
          { label: "A sponsored podcast segment", score: -1 },
        ],
      },
      {
        ref: "impression",
        type: "single_select",
        title: "When is an impression counted?",
        required: true,
        options: [
          { label: "When someone clicks the ad" },
          { label: "When someone buys" },
          { label: "When the ad is displayed", score: 1 },
          { label: "When someone shares the ad" },
        ],
      },
      {
        ref: "cta",
        type: "single_select",
        title: "Which line from a restaurant ad is the call to action?",
        required: true,
        options: [
          { label: "Family recipes, three generations old" },
          { label: "Book your table for tonight", score: 1 },
          { label: "Fresh pasta, made every morning" },
          { label: "Loved by locals" },
        ],
      },
      {
        ref: "objective",
        type: "single_select",
        title: "Which is the clearest campaign objective?",
        required: true,
        options: [
          { label: "Raise our profile" },
          { label: "Get the brand out there" },
          { label: "Get 200 trial sign-ups from the spring campaign by 30 April", score: 1 },
          { label: "Go viral" },
        ],
      },
      {
        ref: "favourite_format",
        type: "dropdown",
        title: "Just for fun: which ad format do you remember best?",
        required: false,
        options: [
          { label: "TV and video" },
          { label: "Radio and podcasts" },
          { label: "Billboards and posters" },
          { label: "Social media" },
          { label: "Print" },
        ],
      },
    ],
    scoreEndings: [
      { atLeast: 9, then: "end_expert" },
      { atLeast: 6, then: "end_planner" },
    ],
    endings: [
      {
        ref: "end_expert",
        title: "Media buyer material 📣",
        body: "You know how ads are priced, aimed and measured, and you can spot a vague objective a mile off. That is most of the job.",
      },
      {
        ref: "end_planner",
        title: "Campaign planner",
        body: "A good grasp of the fundamentals. Revisit reach versus frequency and return on ad spend, the two that most often trip people up.",
      },
    ],
    ending: {
      title: "Ad-curious",
      body: "Advertising has a lot of jargon. Start with impressions, CPM and return on ad spend, and the rest of a campaign report will start to make sense.",
    },
    guide: {
      questionsToConsider: [
        "Is your audience new to advertising, or already running campaigns? Swap definitions for real scenarios if they are experienced.",
        "Which channels matter to you: search, social, TV, radio or out-of-home?",
        "Do you want to use a currency in the return on ad spend question, or keep it neutral?",
        "Would a question built from one of your own past campaigns make it more memorable?",
      ],
      howToUseResponses:
        "Look at which questions most people missed. If reach and frequency or return on ad spend come up again and again, build your next session around those. For a class or a new team, sort by result to pair the strongest people with those who are just starting, then run the quiz again after training.",
      customizeSteps: [
        "Replace the example ads and objectives with ones from your own brand or industry, keeping one point on each right answer.",
        "Adjust the score bands if you change the number of questions, so the top result stays hard to reach.",
        "Share the link with your class or team, or embed it in a training page, and review the scores in the dashboard.",
      ],
      faqs: [
        {
          q: "What should an advertising quiz test?",
          a: "The core ideas: who you reach, how often, what it costs, and whether it worked. Metrics like CPM and return on ad spend, media types, and writing clear objectives cover most of it.",
        },
        {
          q: "What is the difference between reach and frequency?",
          a: "Reach is how many different people saw an ad. Frequency is how many times, on average, each of those people saw it.",
        },
        {
          q: "Can I use this quiz in a marketing course?",
          a: "Yes. Share the link with students, ask for a first name only, and use the most-missed questions to plan the next lesson.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "billionaire-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["marketing", "education"],
    searchName: "Billionaire quiz",
    title: "Billionaire founders quiz",
    icon: "Gem",
    metaDescription:
      "A fun billionaire quiz about the founders behind Amazon, IKEA, Spanx, Google and more. Each correct answer scores a point and the total picks the result.",
    description: "Eight scored trivia questions about famous founders and their companies.",
    blurb:
      "A light trivia game about who built which company, from Walmart to Spanx, with a pick-all-that-apply round on co-founders where a wrong pick costs a point. The total lands on one of three results, and a just-for-fun last question gives people something to talk about.",
    tags: ["billionaire quiz", "business trivia", "founders quiz", "team building quiz", "fun quiz"],
    greeting: "How well do you know the founders behind some famous fortunes? Eight questions, then your result.",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on the scoreboard?", required: true, maxLength: 40 },
      {
        ref: "amazon",
        type: "single_select",
        title: "Who founded Amazon?",
        required: true,
        options: [{ label: "Jeff Bezos", score: 1 }, { label: "Elon Musk" }, { label: "Larry Ellison" }, { label: "Michael Dell" }],
      },
      {
        ref: "berkshire",
        type: "single_select",
        title: "Which investor is famous for running Berkshire Hathaway?",
        required: true,
        options: [{ label: "George Soros" }, { label: "Warren Buffett", score: 1 }, { label: "Carl Icahn" }, { label: "Ray Dalio" }],
      },
      {
        ref: "spanx",
        type: "single_select",
        title: "Sara Blakely founded which company?",
        required: true,
        options: [{ label: "Glossier" }, { label: "Spanx", score: 1 }, { label: "Bumble" }, { label: "Skims" }],
      },
      {
        ref: "ikea",
        type: "single_select",
        title: "Ingvar Kamprad founded IKEA in which country?",
        required: true,
        options: [{ label: "Denmark" }, { label: "Norway" }, { label: "Sweden", score: 1 }, { label: "Finland" }],
      },
      {
        ref: "ortega",
        type: "single_select",
        title: "Amancio Ortega built his fortune by co-founding which fashion group, the owner of Zara?",
        required: true,
        options: [{ label: "H&M" }, { label: "LVMH" }, { label: "Inditex", score: 1 }, { label: "Fast Retailing" }],
      },
      {
        ref: "google",
        type: "single_select",
        title: "Who co-founded Google?",
        required: true,
        options: [
          { label: "Bill Gates and Paul Allen" },
          { label: "Larry Page and Sergey Brin", score: 1 },
          { label: "Steve Jobs and Steve Wozniak" },
          { label: "Mark Zuckerberg and Eduardo Saverin" },
        ],
      },
      {
        ref: "cofounded",
        type: "multi_select",
        title: "Which of these companies were started by more than one founder? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Airbnb", score: 1 },
          { label: "Dell", score: -1 },
          { label: "Nike", score: 1 },
          { label: "Ben & Jerry's", score: 1 },
          { label: "Spanx", score: -1 },
        ],
      },
      {
        ref: "walmart",
        type: "single_select",
        title: "Who founded Walmart?",
        required: true,
        options: [{ label: "Sam Walton", score: 1 }, { label: "Ray Kroc" }, { label: "Henry Ford" }, { label: "Howard Schultz" }],
      },
      {
        ref: "give_away",
        type: "single_select",
        title: "Just for fun: if you had a billion to give away, where would it go first?",
        required: false,
        allowOther: true,
        options: [
          { label: "Health and medical research" },
          { label: "Education" },
          { label: "Climate and nature" },
          { label: "My local community" },
          { label: "Friends and family" },
        ],
      },
    ],
    scoreEndings: [
      { atLeast: 9, then: "end_tycoon" },
      { atLeast: 6, then: "end_investor" },
    ],
    endings: [
      {
        ref: "end_tycoon",
        title: "Business tycoon 💎",
        body: "You know your founders, down to who started which company alone. The co-founders round catches most people out, and it didn't catch you.",
      },
      {
        ref: "end_investor",
        title: "Savvy investor",
        body: "A strong score. A founder or two slipped past you, but you clearly follow the business pages.",
      },
    ],
    ending: {
      title: "Startup intern",
      body: "Plenty of these fortunes started with one person and one idea. Have another go and see how many founders you remember now.",
    },
    guide: {
      questionsToConsider: [
        "Is this an icebreaker for a team event, a classroom activity or a social post? That decides how hard to make it.",
        "Would founders from your own country or industry make it more fun for your audience?",
        "Should the give-away question stay just for fun, or feed a discussion afterwards?",
      ],
      howToUseResponses:
        "Sort by score to find a winner for a team event or prize draw. The unscored give-away question is a good discussion starter: share the most popular answers with the group afterwards. If one trivia question was missed by nearly everyone, it made a good trap; if it confused people, reword it.",
      customizeSteps: [
        "Swap in founders your audience will recognise, and check every fact before you publish, keeping one point on each correct option.",
        "Move the score bands if you add or remove questions, so the top result still takes nearly every answer.",
        "Share the link in a team chat, newsletter or event slide, and read the leaderboard in the dashboard.",
      ],
      faqs: [
        {
          q: "Is this billionaire quiz a trivia game or a personality quiz?",
          a: "This version is trivia about real founders and their companies. You could turn it into a playful personality quiz by replacing the questions with choices and routing each type to its own ending.",
        },
        {
          q: "Why not ask who the richest person is?",
          a: "Rankings of the richest people change often, so an answer that is right today can be wrong next month. Questions about who founded what stay true.",
        },
        {
          q: "Can I use it for a team-building event?",
          a: "Yes. Share one link with everyone, ask for a name for the scoreboard, and announce the top scores at the end.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "branding-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["marketing", "freelancers-agencies", "education"],
    searchName: "Branding quiz",
    title: "Branding quiz",
    icon: "Palette",
    metaDescription:
      "A branding quiz with scored questions on brand promise, voice, visual identity, positioning and guidelines. Great for workshops, classes and new marketing hires.",
    description: "Eight scored questions on what a brand is and how it stays consistent.",
    blurb:
      "Moves past logos to the ideas that hold a brand together: its promise, voice, positioning and the guidelines that keep it consistent. A pick-all-that-apply visual identity round takes a point for each wrong pick, and the total chooses one of three results.",
    tags: ["branding quiz", "brand identity quiz", "marketing workshop", "brand training", "scored quiz"],
    greeting: "A brand is more than a logo. Eight questions to see how well you know the rest.",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on your result?", required: true, maxLength: 40 },
      {
        ref: "promise",
        type: "single_select",
        title: "What is a brand promise?",
        required: true,
        options: [
          { label: "The legal terms on the website" },
          { label: "The experience customers can count on every time they deal with you", score: 1 },
          { label: "The discount offered to new customers" },
          { label: "The company's sales target" },
        ],
      },
      {
        ref: "voice",
        type: "single_select",
        title: "What does brand voice describe?",
        required: true,
        options: [
          { label: "The music in your ads" },
          { label: "The consistent personality in how the brand writes and speaks", score: 1 },
          { label: "Who presents your videos" },
          { label: "How many channels you post on" },
        ],
      },
      {
        ref: "visual_identity",
        type: "multi_select",
        title: "Which of these are part of a visual identity? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Logo", score: 1 },
          { label: "Colour palette", score: 1 },
          { label: "Typefaces", score: 1 },
          { label: "Refund policy", score: -1 },
          { label: "Office address", score: -1 },
        ],
      },
      {
        ref: "nike",
        type: "single_select",
        title: "Which brand uses the tagline \"Just Do It\"?",
        required: true,
        options: [{ label: "Adidas" }, { label: "Puma" }, { label: "Nike", score: 1 }, { label: "Reebok" }],
      },
      {
        ref: "positioning",
        type: "single_select",
        title: "What does a positioning statement set out?",
        required: true,
        options: [
          { label: "Where your products sit on a shop shelf" },
          { label: "Who the brand is for and why it is the better choice for them than the alternatives", score: 1 },
          { label: "The order of pages on your website" },
          { label: "Your team's job titles" },
        ],
      },
      {
        ref: "guidelines",
        type: "single_select",
        title: "What are brand guidelines mainly for?",
        required: true,
        options: [
          { label: "Proving the logo is trademarked" },
          { label: "Helping anyone who creates for the brand keep it consistent", score: 1 },
          { label: "Listing the company's competitors" },
          { label: "Setting prices" },
        ],
      },
      {
        ref: "consistency",
        type: "single_select",
        title: "Why do brands keep their look and tone the same across every channel?",
        required: true,
        options: [
          { label: "It is cheaper to print" },
          { label: "Repetition helps people recognise and remember them", score: 1 },
          { label: "Search engines require it" },
          { label: "It stops competitors copying them" },
        ],
      },
      {
        ref: "refresh",
        type: "single_select",
        title: "What usually separates a brand refresh from a full rebrand?",
        required: true,
        options: [
          { label: "A refresh updates the look but keeps the core identity", score: 1 },
          { label: "A refresh always changes the company name" },
          { label: "There is no difference" },
          { label: "A rebrand only changes the colours" },
        ],
      },
      {
        ref: "brand_admire",
        type: "long_text",
        title: "Which brand do you think gets it right, and why?",
        required: false,
        maxLength: 500,
      },
    ],
    scoreEndings: [
      { atLeast: 9, then: "end_strategist" },
      { atLeast: 6, then: "end_builder" },
    ],
    endings: [
      {
        ref: "end_strategist",
        title: "Brand strategist 🎨",
        body: "You see a brand as a promise and a voice, not just a logo. You could run the next brand workshop.",
      },
      {
        ref: "end_builder",
        title: "Brand builder",
        body: "You have the essentials. Positioning and the difference between a refresh and a rebrand are worth another look.",
      },
    ],
    ending: {
      title: "Brand explorer",
      body: "Start with three ideas: the promise you make, the voice you use and the look you keep consistent. The rest of branding builds on them.",
    },
    guide: {
      questionsToConsider: [
        "Is this for a class, a client workshop or your own team? Swap the textbook questions for your brand's real examples if it is internal.",
        "Would a question about your own brand's promise or voice show who has read the guidelines?",
        "Do you want the open question about a favourite brand, or would a rating of your own brand be more useful?",
      ],
      howToUseResponses:
        "Read the scores to see how well the group understands branding before a workshop, then build the session around the most-missed questions. The open question about a brand people admire is a ready-made discussion starter, and it often reveals what your audience values in a brand.",
      customizeSteps: [
        "Replace a few questions with examples from your own brand guidelines, keeping one point on each correct option.",
        "Adjust the score bands if you add or remove questions so the top result stays a real achievement.",
        "Share the link before a workshop or embed it on a course page, then export the answers to CSV to review together.",
      ],
      faqs: [
        {
          q: "What should a branding quiz cover?",
          a: "The parts of a brand people often overlook: the promise, the voice, positioning and consistency, as well as visual identity. Mixing definitions with real examples keeps it interesting.",
        },
        {
          q: "Can I use this quiz to check my team knows our brand?",
          a: "Yes. Replace some questions with ones about your own brand promise, tone of voice and logo rules, and run it after sharing your guidelines.",
        },
        {
          q: "How is the branding quiz scored?",
          a: "Each correct option earns a point, and a wrong pick in the visual identity round takes one away. The total picks one of three results.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "consumer-behavior-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["marketing", "product-research", "education"],
    searchName: "Consumer behavior quiz",
    title: "Consumer behaviour quiz",
    icon: "ShoppingCart",
    metaDescription:
      "A consumer behavior quiz on social proof, anchoring, loss aversion, the decoy effect and why people say one thing and buy another. Scored, with three results.",
    description: "Eight scored questions on why people buy what they buy.",
    blurb:
      "Built around everyday buying situations rather than textbook definitions: a cinema popcorn menu, a sale countdown, a survey that sales never matched. A scarcity round takes a point for each wrong pick, and the total chooses one of three results.",
    tags: ["consumer behavior quiz", "buyer psychology", "marketing psychology quiz", "behavioral economics", "scored quiz"],
    greeting: "Why do people buy what they buy? Eight questions on the psychology behind every basket.",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on your result?", required: true, maxLength: 40 },
      {
        ref: "say_do",
        type: "single_select",
        title: "Most people in a survey say they would pay more for eco-friendly packaging, but sales barely change. What is this called?",
        required: true,
        options: [
          { label: "Brand loyalty" },
          { label: "The say-do gap, or intention-behaviour gap", score: 1 },
          { label: "Price elasticity" },
          { label: "Market saturation" },
        ],
      },
      {
        ref: "social_proof",
        type: "single_select",
        title: "A product page shows hundreds of five-star reviews. Which influence is it using?",
        required: true,
        options: [{ label: "Scarcity" }, { label: "Anchoring" }, { label: "Social proof", score: 1 }, { label: "Reciprocity" }],
      },
      {
        ref: "anchoring",
        type: "single_select",
        title: "A shop shows the original price crossed out beside the sale price. Which effect makes the sale price feel like a bargain?",
        required: true,
        options: [
          { label: "Anchoring", score: 1 },
          { label: "The halo effect" },
          { label: "The bandwagon effect" },
          { label: "Habit" },
        ],
      },
      {
        ref: "loss_aversion",
        type: "single_select",
        title: "What does loss aversion describe?",
        required: true,
        options: [
          { label: "People avoid shops that lose money" },
          { label: "A loss feels bigger than a gain of the same size", score: 1 },
          { label: "People forget purchases they regret" },
          { label: "Customers leave after one bad experience" },
        ],
      },
      {
        ref: "decoy",
        type: "single_select",
        title: "A cinema sells small popcorn for 3, medium for 6.50 and large for 7. Which one is there mainly to make another look like a better deal?",
        required: true,
        options: [{ label: "Small" }, { label: "Medium", score: 1 }, { label: "Large" }, { label: "None of them" }],
      },
      {
        ref: "first_stage",
        type: "single_select",
        title: "In the classic buying decision process, what comes first?",
        required: true,
        options: [
          { label: "Comparing brands" },
          { label: "Searching for information" },
          { label: "Recognising a need or problem", score: 1 },
          { label: "Making the purchase" },
        ],
      },
      {
        ref: "dissonance",
        type: "single_select",
        title: "Someone buys an expensive laptop and starts doubting the choice a day later. What is this called?",
        required: true,
        options: [
          { label: "Post-purchase dissonance", score: 1 },
          { label: "Impulse buying" },
          { label: "Brand switching" },
          { label: "Choice overload" },
        ],
      },
      {
        ref: "scarcity",
        type: "multi_select",
        title: "Which of these messages use scarcity or urgency? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Only 3 left in stock", score: 1 },
          { label: "Sale ends at midnight", score: 1 },
          { label: "Rated 4.8 by our customers", score: -1 },
          { label: "Free returns within 30 days", score: -1 },
        ],
      },
      {
        ref: "own_habit",
        type: "opinion_scale",
        title: "Be honest: how often does a countdown timer or \"almost gone\" message make you buy sooner?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Never",
        labelHigh: "Every time",
      },
    ],
    scoreEndings: [
      { atLeast: 8, then: "end_expert" },
      { atLeast: 5, then: "end_observer" },
    ],
    endings: [
      {
        ref: "end_expert",
        title: "Mind reader 🧠",
        body: "You can spot the psychology behind a price tag and a product page. The decoy question catches most people, and it didn't catch you.",
      },
      {
        ref: "end_observer",
        title: "Sharp observer",
        body: "You know the main influences on buyers. Anchoring and the decoy effect look alike at first glance and are worth a closer look.",
      },
    ],
    ending: {
      title: "Curious shopper",
      body: "Next time you shop, look for the crossed-out price, the review count and the countdown. Once you notice them, you'll see them everywhere.",
    },
    guide: {
      questionsToConsider: [
        "Is this for students, a marketing team or product people? Use examples from their world.",
        "Would a question built from your own product pages or pricing make it more useful?",
        "Should the final self-rating stay anonymous, or would you like to compare it with scores?",
        "Do you want to explain each answer in a follow-up session or leave people to look them up?",
      ],
      howToUseResponses:
        "Use the most-missed questions to plan your next lesson or workshop; anchoring and the decoy effect are the usual ones. The unscored self-rating about countdown timers is useful in a discussion about ethics and the say-do gap: compare how people say they react with how they answered the scarcity question.",
      customizeSteps: [
        "Replace the examples with situations from your own shop, app or industry, keeping one point on each correct option.",
        "Move the score bands if you change the number of questions, so the top result stays hard to earn.",
        "Share the link with a class or team, or embed it on a course page, and review scores in the dashboard.",
      ],
      faqs: [
        {
          q: "What topics should a consumer behavior quiz include?",
          a: "The buying decision process, social influences like reviews, pricing effects such as anchoring and decoys, loss aversion, and the gap between what people say and what they do.",
        },
        {
          q: "What is the say-do gap?",
          a: "It is the difference between what people say they will do, often in surveys, and what they actually do when buying. It is why sales data matters as much as stated preferences.",
        },
        {
          q: "Can I use this quiz in a marketing or psychology class?",
          a: "Yes. It works as a warm-up or a review. Ask for a first name only, and use the most-missed questions to shape the next session.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "cultural-fit-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["hr-people"],
    searchName: "Cultural fit quiz",
    title: "Team culture fit quiz",
    icon: "Users",
    metaDescription:
      "A cultural fit quiz built on real team situations. It suggests the kind of team culture someone does their best work in, as a start to an honest conversation.",
    description: "Six team situations that point to the culture someone works best in, plus room to explain.",
    blurb:
      "Instead of asking people to rate themselves, it asks what they would do when a new tool is on the table, a deadline moves or a mistake ships, and how they like decisions and updates to happen. Each answer adds to a score from process-led to fast-moving, which picks one of three team cultures, and a ranking and an open question capture what a score can't.",
    tags: ["cultural fit quiz", "culture fit assessment", "team culture quiz", "work preferences", "team onboarding"],
    greeting:
      "What kind of team do you do your best work in? Six everyday situations, no right or wrong answers, and a team culture match at the end.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your first name?", required: true, maxLength: 40 },
      {
        ref: "new_tool",
        type: "single_select",
        title: "Your team is thinking about switching to a new tool. How should that happen?",
        required: true,
        options: [
          { label: "A quick demo, then the team decides together", score: 1 },
          { label: "Agree what it needs to do, then compare the options" },
          { label: "Try it on one live project and see", score: 2 },
        ],
      },
      {
        ref: "decisions",
        type: "single_select",
        title: "How do you like team decisions to be made?",
        required: true,
        options: [
          { label: "Try one option and change course if it doesn't work", score: 2 },
          { label: "After the options are written up and compared" },
          { label: "In a quick discussion, then someone decides", score: 1 },
        ],
      },
      {
        ref: "updates",
        type: "single_select",
        title: "How would you rather keep the team up to date?",
        required: true,
        options: [
          { label: "A written update everyone can read in their own time" },
          { label: "As things happen, in the team chat", score: 2 },
          { label: "A short regular check-in", score: 1 },
        ],
      },
      {
        ref: "deadline",
        type: "single_select",
        title: "A deadline moves forward by a week. What's your instinct?",
        required: true,
        options: [
          { label: "Talk it through with the team and find a middle ground", score: 1 },
          { label: "Pick up the pace and figure out the rest on the way", score: 2 },
          { label: "Re-plan properly and agree what to cut" },
        ],
      },
      {
        ref: "mistake",
        type: "single_select",
        title: "Something the team shipped has a mistake in it. What should happen next?",
        required: true,
        options: [
          { label: "Fix it fast and move on", score: 2 },
          { label: "Fix it, then write down what went wrong so it doesn't happen again" },
          { label: "Fix it and talk it over at the next team meeting", score: 1 },
        ],
      },
      {
        ref: "feedback",
        type: "single_select",
        title: "How do you prefer to get feedback on your work?",
        required: true,
        options: [
          { label: "A short chat the same day", score: 1 },
          { label: "Written notes I can think over" },
          { label: "Right there in the moment, while I'm working on it", score: 2 },
        ],
      },
      {
        ref: "work_setting",
        type: "dropdown",
        title: "Where do you work best?",
        required: true,
        options: [
          { label: "In the office with the team" },
          { label: "A mix of office and home" },
          { label: "Fully remote" },
          { label: "No strong preference" },
        ],
      },
      {
        ref: "team_values",
        type: "ranking",
        title: "Put these in order of how much they matter to you in a team.",
        required: true,
        items: ["Clear goals", "Freedom to decide how I work", "Honest feedback", "Time for focused work", "Friendly people"],
      },
      {
        ref: "context",
        type: "long_text",
        title: "Is there anything about the teams you've enjoyed most that these questions missed?",
        required: false,
        maxLength: 1000,
      },
    ],
    scoreEndings: [
      { atLeast: 9, then: "end_fast" },
      { atLeast: 4, then: "end_collaborative" },
    ],
    endings: [
      {
        ref: "end_fast",
        title: "Your match: a fast-moving team 🚀",
        body: "You do well where decisions are quick, plans change often and people learn by shipping. You'll add most in a team that also has someone capturing what gets learned along the way.",
      },
      {
        ref: "end_collaborative",
        title: "Your match: a collaborative, flexible team",
        body: "You like a plan but hold it loosely, and you prefer to talk things through. Teams with regular check-ins and shared decisions suit you, and you often bridge the planners and the experimenters.",
      },
    ],
    ending: {
      title: "Your match: a process-led team",
      body: "You do your best work with clear goals, written briefs and time to think. Look for teams that document decisions and plan ahead, where your eye for gaps stops problems early.",
    },
    guide: {
      questionsToConsider: [
        "Are you using this for team building, onboarding, or to start a conversation with candidates? Each calls for a different tone.",
        "How would you describe your own team on the same scale? Knowing that first makes the results far easier to discuss.",
        "Do the situations match real moments in your team's work, or should you swap in your own?",
        "How will you make sure no answer reads as the one the company wants?",
      ],
      howToUseResponses:
        "Treat the result as a conversation starter, not a verdict. In a team session, share how the matches are spread and talk about where the mix helps and where it causes friction, such as process-led and fast-moving people working to the same deadline. The ranking of team values and the open answers are often the most useful part, so read them first. Don't use the result on its own to make a hiring decision.",
      customizeSteps: [
        "Rewrite the situations using real moments from your team's work, keeping the three answers spread from process-led to fast-moving.",
        "Rename the three team cultures so they match how your company talks about itself, then check the score bands still feel fair.",
        "Share the link with your team or new starters, and export the results to CSV before a team discussion.",
      ],
      faqs: [
        {
          q: "Should a cultural fit quiz be used to decide who gets hired?",
          a: "No. A short quiz is not a validated hiring assessment. Use it to start a conversation about working preferences, and base hiring decisions on job-related criteria and a fair process.",
        },
        {
          q: "What is the difference between culture fit and culture add?",
          a: "Culture fit asks whether someone matches how a team already works. Culture add asks what new perspective they bring. A quiz like this is most useful for talking about both, not for screening people out.",
        },
        {
          q: "What makes a good cultural fit question?",
          a: "A concrete situation with realistic options that are all reasonable. Avoid questions where one answer is obviously the one the company wants.",
        },
        {
          q: "How does the quiz pick a team culture?",
          a: "Each answer adds points on a scale from process-led to fast-moving, and the total picks one of three results. You can change the points, bands and result text in the builder.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "entrepreneur-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["education", "marketing"],
    searchName: "Entrepreneur quiz",
    title: "Founder readiness quiz",
    icon: "Rocket",
    metaDescription:
      "An entrepreneur quiz about customer conversations, cheap tests, time, money and support. It suggests a practical next step for your idea instead of a label.",
    description: "Questions about where an idea really stands, and a next step to match.",
    blurb:
      "Asks about what people have actually done, like how many potential customers they've spoken to and how they would test demand, rather than whether they feel like a born founder. Each answer adds points, and the total picks one of three practical next steps.",
    tags: ["entrepreneur quiz", "startup quiz", "business idea quiz", "founder quiz", "small business"],
    greeting: "Got a business idea? A few questions about where it stands, and a practical next step at the end.",
    questions: [
      {
        ref: "idea",
        type: "long_text",
        title: "Describe your idea in a sentence or two.",
        required: true,
        maxLength: 500,
      },
      {
        ref: "stage",
        type: "dropdown",
        title: "Where is the idea right now?",
        required: true,
        options: [
          { label: "Just a thought" },
          { label: "Some notes and research" },
          { label: "A prototype or first version" },
          { label: "Already selling a little" },
        ],
      },
      {
        ref: "conversations",
        type: "single_select",
        title: "How many people who have the problem you solve have you talked to?",
        required: true,
        options: [
          { label: "None yet" },
          { label: "Mostly friends and family", score: 1 },
          { label: "A handful who actually have the problem", score: 1 },
          { label: "Ten or more who actually have the problem", score: 2 },
        ],
      },
      {
        ref: "problem",
        type: "single_select",
        title: "Could you explain the problem you solve in one sentence, and have people nod?",
        required: true,
        options: [
          { label: "Not yet" },
          { label: "Roughly, but it changes each time", score: 1 },
          { label: "Yes, and people recognise it straight away", score: 2 },
        ],
      },
      {
        ref: "test",
        type: "single_select",
        title: "What's the first thing you'd do to see if people want it?",
        required: true,
        options: [
          { label: "Offer a simple version or pre-order and see who commits", score: 2 },
          { label: "Build the full product, then launch" },
          { label: "Ask around and see what people think", score: 1 },
        ],
      },
      {
        ref: "time",
        type: "single_select",
        title: "How much time can you give it each week?",
        required: true,
        options: [
          { label: "An hour or two" },
          { label: "A few evenings", score: 1 },
          { label: "A full day or more", score: 2 },
        ],
      },
      {
        ref: "runway",
        type: "single_select",
        title: "If it earned nothing for six months, could you keep going?",
        required: true,
        options: [
          { label: "No, I'd need income from it quickly" },
          { label: "Just about", score: 1 },
          { label: "Yes, comfortably", score: 2 },
        ],
      },
      {
        ref: "setback",
        type: "single_select",
        title: "Your first attempt gets a lukewarm response. What do you do?",
        required: true,
        options: [
          { label: "Ask the people who said no why, and change one thing", score: 2 },
          { label: "Push on with the plan as it is" },
          { label: "Take a break and rethink the whole thing", score: 1 },
        ],
      },
      {
        ref: "support",
        type: "multi_select",
        title: "Who could you ask for help along the way? Pick all that apply.",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "Someone who has started a business" },
          { label: "A co-founder or partner" },
          { label: "Friends and family" },
          { label: "A local business group or course" },
          { label: "No one yet" },
        ],
      },
      { ref: "email", type: "email", title: "Want a copy of your next step? Leave your email.", required: false },
    ],
    scoreEndings: [
      { atLeast: 9, then: "end_ready" },
      { atLeast: 5, then: "end_talk" },
    ],
    endings: [
      {
        ref: "end_ready",
        title: "Ready to run a small test 🚀",
        body: "You've done the groundwork. Your next step is a small, real test: a simple offer or pre-order in front of the people you've spoken to, so their actions tell you what their words can't.",
      },
      {
        ref: "end_talk",
        title: "Talk to customers first",
        body: "The idea has promise, but it needs more evidence. Before you build anything, have ten honest conversations with people who have the problem, and ask about the last time it happened.",
      },
    ],
    ending: {
      title: "Still exploring",
      body: "That's a fine place to be. Write down who has this problem and what they do about it today, then find three of them to talk to. You'll learn more in a week than from months of planning.",
    },
    guide: {
      questionsToConsider: [
        "Is this for a course, an incubator intake or a newsletter audience? Adjust the time and money questions to fit.",
        "Which behaviours matter most in your programme, such as customer conversations, testing or commitment?",
        "Do you want to follow up with people, and if so, should the email question be required?",
        "What resource could each result point to, like a workshop, a guide or a mentor session?",
      ],
      howToUseResponses:
        "Group people by result and give each group a different next step: the ones ready to test might get a session on shaping a first offer, while those still exploring get a guide to customer interviews. Read the idea descriptions too, since they show what your audience is working on. Avoid presenting the result as a prediction of success.",
      customizeSteps: [
        "Edit the three results so each points to a resource you offer, such as a workshop, mentor or guide.",
        "Adjust the questions and points to reflect the habits your programme values, then check the score bands still split people sensibly.",
        "Share the link with applicants or learners, or embed it on your programme page, and export responses to plan sessions.",
      ],
      faqs: [
        {
          q: "Can an entrepreneur quiz tell me if my business will succeed?",
          a: "No. It can show which practical steps you have covered and which to do next, but many things decide whether a business works that a short quiz cannot measure.",
        },
        {
          q: "What questions should an entrepreneur quiz ask?",
          a: "Questions about what someone has done, not how they feel: customer conversations, how they would test demand, the time and money they can commit, and how they handle setbacks.",
        },
        {
          q: "How are the results worked out?",
          a: "Each answer carries points, and the total picks one of three next steps. You can change the points, bands and result text in the builder.",
        },
        {
          q: "Can I use this quiz for an incubator or course intake?",
          a: "Yes. The idea description and stage questions give you useful context, and the result helps you place people in the right session.",
        },
      ],
    },
  }),
];
