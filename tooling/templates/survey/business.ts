import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_BUSINESS: TemplateSeed[] = [
  defineTemplate({
    slug: "gym-satisfaction-survey",
    type: "survey",
    category: "business",
    goals: ["collect-feedback"],
    roles: ["customer-success", "operations"],
    searchName: "Gym satisfaction survey",
    title: "Gym member satisfaction",
    icon: "Dumbbell",
    metaDescription:
      "Ask gym members about equipment, classes, staff and crowding, then find out who is thinking of cancelling and what would keep them training with you.",
    description: "Rate the equipment, classes and staff, and catch members who are close to cancelling.",
    blurb:
      "Covers what members actually use, a quick grid on the things that make or break a gym, and a ranked wishlist. Members who admit they have thought about cancelling get two extra questions about why and what would keep them, plus the option to have the manager get in touch.",
    tags: ["gym survey", "member satisfaction", "fitness club feedback", "member retention", "gym member questionnaire"],
    greeting: "Hi! We'd love to hear how training with us is going. It takes about three minutes.",
    questions: [
      {
        ref: "membership_length",
        type: "single_select",
        title: "How long have you been a member?",
        required: true,
        options: [
          { label: "Less than 3 months" },
          { label: "3 to 12 months" },
          { label: "1 to 3 years" },
          { label: "More than 3 years" },
        ],
      },
      {
        ref: "visit_frequency",
        type: "single_select",
        title: "In a normal week, how often do you come in?",
        required: true,
        options: [
          { label: "Less than once a week" },
          { label: "1 or 2 times" },
          { label: "3 or 4 times" },
          { label: "5 times or more" },
        ],
      },
      {
        ref: "main_goal",
        type: "single_select",
        title: "What's the main thing you train for?",
        required: true,
        allowOther: true,
        options: [
          { label: "Getting stronger" },
          { label: "Losing weight" },
          { label: "Fitness and stamina" },
          { label: "Staying healthy as I get older" },
          { label: "Recovering from an injury" },
          { label: "The classes and the people" },
        ],
      },
      {
        ref: "used",
        type: "multi_select",
        title: "Which parts of the gym do you use?",
        description: "Pick all that apply.",
        required: true,
        options: [
          { label: "Weights and machines" },
          { label: "Cardio equipment" },
          { label: "Group classes" },
          { label: "Personal training" },
          { label: "Pool, sauna or spa" },
          { label: "Changing rooms and showers" },
        ],
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each of these?",
        required: true,
        rows: [
          "Condition of the equipment",
          "Cleanliness",
          "Changing rooms",
          "Class times and variety",
          "Help from staff and trainers",
          "How busy it gets at peak times",
        ],
        columns: ["Poor", "Okay", "Good", "Great"],
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how happy are you with your membership?",
        required: true,
        scale: 5,
      },
      {
        ref: "value",
        type: "opinion_scale",
        title: "How fair does your membership fee feel for what you get?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Poor value",
        labelHigh: "Great value",
      },
      {
        ref: "thinking_leaving",
        type: "yes_no",
        title: "Have you thought about cancelling in the last three months?",
        description: "An honest answer helps us far more than a polite one.",
        required: true,
      },

      // Members at risk
      {
        ref: "leave_reasons",
        type: "multi_select",
        title: "What's making you think about it?",
        required: true,
        allowOther: true,
        options: [
          { label: "The cost" },
          { label: "Too crowded when I can come" },
          { label: "Equipment is broken or missing" },
          { label: "Classes don't fit my schedule" },
          { label: "I'm not seeing results" },
          { label: "Moving away or changing routine" },
        ],
      },
      {
        ref: "keep_you",
        type: "long_text",
        title: "What would make you stay?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "contact_ok",
        type: "yes_no",
        title: "Would you like the gym manager to get in touch about this?",
        required: true,
      },
      {
        ref: "contact_email",
        type: "email",
        title: "What's the best email to reach you on?",
        required: true,
      },

      // Everyone
      {
        ref: "wishlist",
        type: "ranking",
        title: "Put these in order: which would improve your visits most?",
        required: true,
        items: [
          "More or newer equipment",
          "Classes at times I can make",
          "Cleaner changing rooms",
          "Less crowding at peak times",
          "More guidance from staff",
          "Longer opening hours",
        ],
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend the gym to a friend?",
        required: true,
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Anything else you'd like the team to know?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "thinking_leaving", is: true, then: "leave_reasons" },
      { when: "thinking_leaving", is: false, then: "wishlist" },
      { when: "contact_ok", is: true, then: "contact_email" },
      { when: "contact_ok", is: false, then: "wishlist" },
    ],
    ending: {
      title: "Thanks for the feedback 💪",
      body: "The team reads every response, and we'll share what we change because of them.",
    },
    guide: {
      questionsToConsider: [
        "Which parts of your gym should the rating grid cover, such as the pool, the studio or the car park?",
        "Should the goal question match the member types you plan programming around?",
        "Who follows up with a member who asked the manager to get in touch, and within how many days?",
        "Do you want to run this for all members at once, or send it a few weeks after someone joins?",
      ],
      howToUseResponses:
        "Start with the members who said they have thought about cancelling and asked for contact; those are the conversations most likely to save a membership, so reach them within a few days. Then compare the grid by visit frequency: regulars who rate crowding as poor are telling you about peak hours, while occasional visitors rating classes poorly may simply need different times. Use the ranked wishlist to decide what to fix first, and tell members what changed.",
      customizeSteps: [
        "Edit the areas in the rating grid and the wishlist so they match the facilities you actually run.",
        "Change the cancellation reasons to the ones your front desk hears most often.",
        "Share the link by email or on a poster with a QR code at reception, and keep it open for a couple of weeks.",
      ],
      faqs: [
        {
          q: "What questions should a gym satisfaction survey ask?",
          a: "Ask how often members come, which facilities they use, how they rate equipment, cleanliness, classes and staff, and whether they have thought about leaving. The last one is the question most gym surveys skip and the one that matters most for retention.",
        },
        {
          q: "How often should a gym survey its members?",
          a: "Once or twice a year works for a full survey like this one. A shorter check a few weeks after joining catches new members before they drift away.",
        },
        {
          q: "Should a gym survey be anonymous?",
          a: "It can be, and members tend to be more candid about staff and cleanliness when it is. This template only asks for an email when a member wants the manager to reply.",
        },
        {
          q: "Can I use this template for my studio or leisure centre?",
          a: "Yes. Use this template copies it into your account, where you can rename every facility and class, then share it by link or embed it on your website.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "price-sensitivity-survey",
    type: "survey",
    category: "business",
    goals: ["conduct-research"],
    roles: ["product-research", "marketing"],
    searchName: "Price sensitivity survey",
    title: "Price sensitivity",
    icon: "Calculator",
    metaDescription:
      "Find the price range customers will accept with four price-point questions, plus what they value, how they'd react to a rise and how they prefer to pay.",
    description: "Four price-point questions in the Van Westendorp style, with value and context around them.",
    blurb:
      "Built around the four classic price-point questions, asked in a fixed order from most expensive to least, so everyone works down the same ladder. Current customers first say what justifies the cost, former customers say why they stopped, and prospects go straight to the price questions.",
    tags: ["price sensitivity", "Van Westendorp", "willingness to pay", "pricing research", "price point survey"],
    greeting: "Hi! We're working out our pricing and want your honest view. It takes about four minutes.",
    questions: [
      {
        ref: "relationship",
        type: "single_select",
        title: "Which of these describes you?",
        description: "Every question here is about the same product and plan.",
        required: true,
        options: [
          { label: "I pay for it now" },
          { label: "I used to pay for it" },
          { label: "I haven't bought it yet" },
        ],
      },

      // Current customers
      {
        ref: "value_now",
        type: "opinion_scale",
        title: "How would you rate the value you get for what you pay?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Poor value",
        labelHigh: "Excellent value",
      },
      {
        ref: "worth_it",
        type: "multi_select",
        title: "Which parts of it make the cost worth it for you?",
        required: true,
        allowOther: true,
        options: [
          { label: "The time it saves me" },
          { label: "Features I can't get elsewhere" },
          { label: "Quality and reliability" },
          { label: "Support when I need it" },
          { label: "It's cheaper than the alternatives" },
        ],
      },

      // Former customers
      {
        ref: "why_stopped",
        type: "long_text",
        title: "What made you stop paying for it?",
        required: true,
        maxLength: 800,
      },

      // Everyone: the four price points
      {
        ref: "too_expensive",
        type: "number",
        title: "At what price would it be so expensive that you wouldn't consider buying it?",
        description: "Enter an amount in your usual currency, per month.",
        required: true,
        min: 0,
      },
      {
        ref: "getting_expensive",
        type: "number",
        title: "At what price would it start to feel expensive, so you'd think hard before buying?",
        description: "Still something you might buy, just not without a second thought.",
        required: true,
        min: 0,
      },
      {
        ref: "bargain",
        type: "number",
        title: "At what price would it feel like a bargain?",
        description: "Great value for the money, and you'd buy it without hesitating.",
        required: true,
        min: 0,
      },
      {
        ref: "too_cheap",
        type: "number",
        title: "At what price would it be so cheap that you'd doubt the quality?",
        description: "Same currency and period as your other answers.",
        required: true,
        min: 0,
      },
      {
        ref: "price_rise",
        type: "single_select",
        title: "Imagine you were paying for it and the price went up by 10%. What would you most likely do?",
        required: true,
        options: [
          { label: "Keep paying without a second thought" },
          { label: "Keep paying, but start looking around" },
          { label: "Move to a cheaper option or plan" },
          { label: "Stop paying for it" },
        ],
      },
      {
        ref: "billing",
        type: "single_select",
        title: "How would you prefer to pay?",
        required: true,
        options: [
          { label: "Monthly" },
          { label: "Yearly, for a discount" },
          { label: "A one-off payment" },
          { label: "Pay only for what I use" },
        ],
      },
      {
        ref: "alternative",
        type: "short_text",
        title: "If it didn't exist, what would you use instead?",
        required: false,
        maxLength: 200,
      },
    ],
    branches: [
      { when: "relationship", is: "I pay for it now", then: "value_now" },
      { when: "relationship", is: "I used to pay for it", then: "why_stopped" },
      { when: "relationship", is: "I haven't bought it yet", then: "too_expensive" },
      { when: "worth_it", always: true, then: "too_expensive" },
    ],
    ending: {
      title: "Thank you, that's really useful",
      body: "Your answers go straight into our pricing decision. Nothing changes for you without notice.",
    },
    guide: {
      questionsToConsider: [
        "Is the price you are testing monthly, yearly or one-off, and does every question say so?",
        "Have you described the offer clearly enough that people know what the price would buy?",
        "Do you want to compare answers from current customers, former customers and prospects separately?",
        "Which pricing decision will these answers feed, and when do you need to make it?",
      ],
      howToUseResponses:
        "Export the four price answers to CSV and plot the share of people calling each price too cheap, a bargain, getting expensive and too expensive. Where the lines cross gives you an acceptable range rather than a single magic number. Split the results by customer type, because current customers anchor on what they pay today, then read the value and reason answers to understand why a price feels high. Treat stated prices as a guide and confirm them with a real test.",
      customizeSteps: [
        "Add a short description of your product and plan to the first question, so everyone prices the same thing.",
        "Set the unit in the price questions to match how you charge, such as per month, per seat or per order.",
        "Send it to a mix of customers and prospects, and keep the four price questions in the same order for everyone.",
      ],
      faqs: [
        {
          q: "What is a price sensitivity survey?",
          a: "It asks people at what prices a product feels too cheap, a bargain, expensive and too expensive. Together the answers show the range most of your market will accept.",
        },
        {
          q: "What is the Van Westendorp price sensitivity meter?",
          a: "It's a well-known pricing method built on exactly those four questions. You chart how many people give each answer at each price, and the crossing points mark the acceptable price range.",
        },
        {
          q: "Does what people say they'd pay match what they actually pay?",
          a: "Not exactly. People often answer differently when real money is involved, so use the survey to narrow the range and then test a price with real buyers.",
        },
        {
          q: "Who should take a price sensitivity survey?",
          a: "People who understand what they'd be paying for: current customers, recent former customers and prospects who have seen a demo or trial. Strangers with no context give noisy numbers.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "restaurant-feedback-survey",
    type: "survey",
    category: "business",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["operations", "marketing"],
    searchName: "Restaurant feedback survey",
    title: "Restaurant visit survey",
    icon: "ChefHat",
    metaDescription:
      "Survey diners on how often they come, how they found you, food, service and prices, what drives their choice of restaurant, and what to add to the menu.",
    description: "Learn who your diners are, how each visit rated and what they want from the menu.",
    blurb:
      "A survey for planning, not just complaint handling: it learns how often each diner comes, asks first-timers how they found you, and rates food, service and prices. A low overall rating opens questions on exactly which parts let the diner down, and everyone ranks what matters when they choose where to eat.",
    tags: ["restaurant survey", "diner survey", "menu feedback", "guest experience", "restaurant market research"],
    greeting: "Thanks for eating with us! We're planning the next few months and would love your view. It takes about three minutes.",
    questions: [
      {
        ref: "meal",
        type: "single_select",
        title: "What was your most recent visit for?",
        required: true,
        options: [
          { label: "Breakfast or brunch" },
          { label: "Lunch" },
          { label: "Dinner" },
          { label: "Drinks or a snack" },
        ],
      },
      {
        ref: "party",
        type: "single_select",
        title: "Who were you with?",
        required: false,
        options: [
          { label: "Just me" },
          { label: "Two of us" },
          { label: "A group of 3–6" },
          { label: "A bigger group or a celebration" },
        ],
      },
      {
        ref: "how_often",
        type: "single_select",
        title: "How often do you eat with us?",
        required: true,
        options: [
          { label: "This was my first time" },
          { label: "A few times a year" },
          { label: "About once a month" },
          { label: "Most weeks" },
        ],
      },

      // First-time diners
      {
        ref: "found_us",
        type: "single_select",
        title: "How did you hear about us?",
        required: false,
        allowOther: true,
        options: [
          { label: "I walked past" },
          { label: "A friend recommended us" },
          { label: "Online reviews or maps" },
          { label: "Social media" },
          { label: "An article or food guide" },
        ],
      },

      // Everyone
      {
        ref: "ordered",
        type: "short_text",
        title: "What did you order?",
        description: "Just the main dishes is fine.",
        required: false,
        maxLength: 300,
      },
      {
        ref: "ratings",
        type: "matrix",
        title: "How would you rate each of these?",
        required: true,
        rows: [
          "Taste of the food",
          "Portion size",
          "Food served at the right temperature",
          "Speed of service",
          "Friendliness of the staff",
          "Cleanliness",
          "Atmosphere and noise level",
        ],
        columns: ["Poor", "Okay", "Good", "Excellent"],
      },
      {
        ref: "prices",
        type: "opinion_scale",
        title: "How fair were the prices for what you got?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Too expensive",
        labelHigh: "Great value",
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how was your visit?",
        required: true,
        scale: 5,
      },

      // Happy diners
      {
        ref: "highlight",
        type: "long_text",
        title: "What was the best part of your meal?",
        required: false,
        maxLength: 600,
      },

      // Disappointed diners
      {
        ref: "letdowns",
        type: "multi_select",
        title: "Sorry it fell short. Which parts let you down?",
        description: "Pick all that apply.",
        required: true,
        allowOther: true,
        options: [
          { label: "The food itself" },
          { label: "Waiting too long" },
          { label: "How we treated you" },
          { label: "The price for what you got" },
          { label: "The room, noise or cleanliness" },
          { label: "A problem with the booking or the bill" },
        ],
      },
      {
        ref: "problem",
        type: "long_text",
        title: "What happened?",
        description: "The dish and roughly what time help us trace it to the right shift.",
        required: false,
        maxLength: 1000,
      },

      // Everyone
      {
        ref: "choice_factors",
        type: "ranking",
        title: "When you choose where to eat, what matters most to you?",
        required: true,
        items: [
          "Quality of the food",
          "Price",
          "Being close by",
          "Atmosphere",
          "Quick service",
          "Options for my diet",
        ],
      },
      {
        ref: "menu_wishes",
        type: "multi_select",
        title: "What would you like to see more of on the menu?",
        required: false,
        allowOther: true,
        options: [
          { label: "Vegetarian and vegan dishes" },
          { label: "Gluten-free options" },
          { label: "Seasonal specials" },
          { label: "Smaller or lighter plates" },
          { label: "A children's menu" },
          { label: "Non-alcoholic drinks" },
        ],
      },
      {
        ref: "next_visit",
        type: "long_text",
        title: "What one thing would make your next visit better?",
        description: "A dish, a change to the room, the booking, anything at all.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "return_likely",
        type: "opinion_scale",
        title: "How likely are you to come back in the next few months?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not likely",
        labelHigh: "Definitely",
      },
    ],
    branches: [
      { when: "how_often", is: "This was my first time", then: "found_us" },
      { when: "how_often", is: "A few times a year", then: "ordered" },
      { when: "how_often", is: "About once a month", then: "ordered" },
      { when: "how_often", is: "Most weeks", then: "ordered" },
      { when: "overall", op: "gte", is: 3, then: "highlight" },
      { when: "overall", op: "lte", is: 2, then: "letdowns" },
      { when: "highlight", always: true, then: "choice_factors" },
    ],
    ending: {
      title: "Thank you, see you soon 🍽️",
      body: "Every response is read by the team, and your ideas go into our next menu planning.",
    },
    guide: {
      questionsToConsider: [
        "Which decision is this survey feeding, such as a new menu, longer opening hours or a price change?",
        "Should the rating grid include parts of your venue that are missing, such as the bar, the terrace or online booking?",
        "Do you want to hear from regulars and first-timers equally, or send it mainly to one group?",
        "Will you share it on the receipt, at the table, or by email to guests who booked online?",
      ],
      howToUseResponses:
        "Split every answer by how often the diner comes: regulars tell you what to protect, and first-timers tell you whether you are winning new guests and where they heard about you. Read the grid and the price score by visit type, because a slow lunch and a slow dinner usually have different causes. The letdown answers show which part of the visit costs you the most goodwill, and the ranking tells you whether your guests pick on food, price or convenience, which should shape the menu wishes you act on first.",
      customizeSteps: [
        "Change the visit types and the grid rows to match your service, such as adding the bar or dropping breakfast.",
        "Edit the menu wishes to the ideas you are actually weighing up, so the answers settle a real decision.",
        "Put the link on receipts or table cards as a QR code, or email it after an online booking, and keep it open for a few weeks.",
      ],
      faqs: [
        {
          q: "What questions should a restaurant survey ask?",
          a: "How often the guest visits, what they ordered, how the food, service, atmosphere and prices rated, and what would bring them back. Asking what matters most when they choose a restaurant tells you what to invest in.",
        },
        {
          q: "What is the difference between a restaurant survey and a comment card?",
          a: "A comment card collects a line or two from whoever feels strongly. A survey asks every guest the same questions, so you can compare lunch with dinner, or regulars with first-timers.",
        },
        {
          q: "How do I get more diners to fill in a restaurant survey?",
          a: "Ask while the meal is fresh, keep it short and make it easy to open on a phone. A QR code on the receipt or the table works well.",
        },
        {
          q: "Should a restaurant survey be anonymous?",
          a: "It works well anonymously, and guests are often more candid about service when it is. This template asks for no contact details, so add a contact question if you want to reply to anyone.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "system-usability-survey",
    type: "survey",
    category: "business",
    goals: ["conduct-research", "collect-feedback"],
    roles: ["product-research", "operations"],
    searchName: "System usability survey",
    title: "System usability",
    icon: "Laptop",
    metaDescription:
      "Ask users about a task they just finished, rate ten standard usability statements, and find where they slowed down, with a follow-up for anyone who got stuck.",
    description: "A task check, ten standard usability statements and the moments people got stuck.",
    blurb:
      "Anchored to a real task: people say what they tried to do and whether they managed it, and anyone who didn't is asked where they got stuck. The ten standard usability statements sit in one grid, so you can score them the usual way, and willing users can sign up for a follow-up session.",
    tags: ["system usability scale", "SUS questionnaire", "usability testing", "UX research", "SUS score"],
    greeting: "Thanks for trying the system. A few questions about how that went, about four minutes.",
    questions: [
      {
        ref: "task",
        type: "short_text",
        title: "What were you trying to do just now?",
        description: "For example, submitting an expense or finding a customer record.",
        required: true,
        maxLength: 200,
      },
      {
        ref: "task_done",
        type: "single_select",
        title: "Did you manage to do it?",
        required: true,
        options: [{ label: "Yes, completely" }, { label: "Partly" }, { label: "No, I got stuck" }],
      },
      {
        ref: "stuck_where",
        type: "long_text",
        title: "Where did it go wrong?",
        description: "What you expected to happen, and what happened instead.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "ease",
        type: "opinion_scale",
        title: "Overall, how easy or hard was that task?",
        required: true,
        steps: 7,
        startAt: 1,
        labelLow: "Very hard",
        labelHigh: "Very easy",
      },
      {
        ref: "sus",
        type: "matrix",
        title: "How much do you agree with each statement about the system?",
        description: "Go with your first reaction.",
        required: true,
        rows: [
          "I think that I would like to use this system frequently",
          "I found the system unnecessarily complex",
          "I thought the system was easy to use",
          "I think that I would need the support of a technical person to be able to use this system",
          "I found the various functions in this system were well integrated",
          "I thought there was too much inconsistency in this system",
          "I would imagine that most people would learn to use this system very quickly",
          "I found the system very cumbersome to use",
          "I felt very confident using the system",
          "I needed to learn a lot of things before I could get going with this system",
        ],
        columns: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
      },
      {
        ref: "slowdowns",
        type: "multi_select",
        title: "Where did you slow down, if anywhere?",
        required: true,
        options: [
          { label: "Finding the right screen" },
          { label: "Understanding labels or wording" },
          { label: "Filling in fields" },
          { label: "Error messages" },
          { label: "Waiting for it to load" },
          { label: "Nowhere, it went smoothly" },
        ],
      },
      {
        ref: "experience",
        type: "single_select",
        title: "How often do you use this system?",
        required: true,
        options: [
          { label: "This was my first time" },
          { label: "A few times a month" },
          { label: "Weekly" },
          { label: "Every day" },
        ],
      },
      {
        ref: "one_fix",
        type: "long_text",
        title: "If you could change one thing about it, what would it be?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "followup",
        type: "yes_no",
        title: "Would you be open to a short follow-up session with our team?",
        required: true,
      },
      {
        ref: "followup_email",
        type: "email",
        title: "Where should we send the invitation?",
        required: true,
      },
    ],
    branches: [
      { when: "task_done", is: "Yes, completely", then: "ease" },
      { when: "task_done", is: "Partly", then: "stuck_where" },
      { when: "task_done", is: "No, I got stuck", then: "stuck_where" },
      { when: "followup", is: false, then: "end_thanks" },
      { when: "followup", is: true, then: "followup_email" },
      { when: "followup_email", always: true, then: "end_followup" },
    ],
    ending: {
      title: "Thanks for your help",
      body: "Your answers go straight to the people who design and build the system.",
    },
    endings: [
      {
        ref: "end_followup",
        title: "Thank you, we'll be in touch 🙌",
        body: "Someone from the team will email you to find a time for the follow-up session.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Which task should people complete before they see this survey, and is it the same for everyone?",
        "Do you want the standard ten statements exactly as written, so the score can be compared over time?",
        "Should the word \"system\" be replaced with the name of your product or tool?",
        "Who runs the follow-up sessions, and how many can you realistically hold?",
      ],
      howToUseResponses:
        "Export the responses to CSV to calculate the usability score: for the odd-numbered statements subtract 1 from the answer (1 to 5), for the even-numbered ones subtract the answer from 5, add them up and multiply by 2.5 to get a score out of 100. Read that score next to the task answers, because a good average can hide a task nobody finished. The stuck and slow-down answers tell you where to look first, and the follow-up volunteers are your next round of testing.",
      customizeSteps: [
        "Replace \"the system\" with the name of your product, and keep the wording of the ten statements otherwise unchanged so scores stay comparable.",
        "Edit the example in the first question to a task from your own product.",
        "Share the link right after a test session or task, or embed it in the tool itself, and run it again after each major change.",
      ],
      faqs: [
        {
          q: "What is the System Usability Scale?",
          a: "It's a widely used questionnaire of ten statements, alternating positive and negative, each answered from strongly disagree to strongly agree. The answers combine into one score out of 100.",
        },
        {
          q: "How do you calculate a System Usability Scale score?",
          a: "Convert each answer to 1 to 5. Odd statements score the answer minus 1, even statements score 5 minus the answer, then add them up and multiply by 2.5.",
        },
        {
          q: "When should I send a usability survey?",
          a: "Straight after someone completes a real task, while the experience is fresh. Asking people in general how easy a tool is gives you impressions rather than evidence.",
        },
        {
          q: "Can I change the usability statements?",
          a: "You can edit every question in this template, but if you change the ten statements the result is no longer a standard score. Add your own questions around the grid instead.",
        },
      ],
    },
  }),
];
