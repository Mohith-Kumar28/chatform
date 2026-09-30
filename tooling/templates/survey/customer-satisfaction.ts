import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_CUSTOMER_SATISFACTION: TemplateSeed[] = [
  defineTemplate({
    slug: "website-questionnaire",
    type: "survey",
    category: "customer-satisfaction",
    goals: ["collect-feedback", "onboard-clients", "conduct-research"],
    roles: ["marketing", "product-research"],
    searchName: "Website questionnaire",
    title: "Website questionnaire",
    icon: "Globe",
    metaDescription:
      "Ask visitors why they came to your website, whether they found it, and where they got stuck. People who came up empty are asked what they were looking for.",
    description: "Find out what visitors came for, and where the site let them down.",
    blurb:
      "Built around the visit someone just had, not their opinion of your brand. It asks what they came to do and whether they managed it: a visitor who found it easily moves straight on, one who had to dig is asked where, and one who gave up is asked what was missing and where they looked.",
    tags: ["website questionnaire", "website feedback", "user experience", "visitor survey", "navigation"],
    greeting: "Hi! Got a minute to tell us how your visit to our website went?",
    questions: [
      {
        ref: "visit_goal",
        type: "single_select",
        title: "What brought you to the site today?",
        required: true,
        allowOther: true,
        options: [
          { label: "Finding out what you offer" },
          { label: "Comparing prices or options" },
          { label: "Buying or booking something" },
          { label: "Getting help with something I already have" },
          { label: "Finding contact details" },
        ],
      },
      { ref: "first_visit", type: "yes_no", title: "Is this your first visit to the site?", required: true },
      {
        ref: "found_it",
        type: "single_select",
        title: "Did you find what you came for?",
        required: true,
        options: [{ label: "Yes, easily" }, { label: "Yes, but it took some digging" }, { label: "No" }],
      },

      // Found it, eventually
      {
        ref: "where_stuck",
        type: "long_text",
        title: "Where did you get stuck along the way?",
        description: "A page name or the link you expected to click is plenty.",
        required: true,
        maxLength: 800,
      },

      // Gave up
      {
        ref: "what_missing",
        type: "long_text",
        title: "What were you looking for that you couldn't find?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "where_looked",
        type: "multi_select",
        title: "Where did you look for it?",
        required: false,
        minSelections: 0,
        options: [
          { label: "The main menu" },
          { label: "The site search" },
          { label: "The home page" },
          { label: "The footer links" },
          { label: "Help or FAQ pages" },
          { label: "A search engine" },
        ],
      },

      // Everyone
      {
        ref: "site_ratings",
        type: "matrix",
        title: "How would you rate the site on each of these?",
        required: false,
        rows: [
          "Finding my way around",
          "Clarity of the wording",
          "How fast pages load",
          "How it works on my phone",
          "Look and feel",
        ],
        columns: ["Poor", "Okay", "Good", "Great"],
      },
      {
        ref: "expected_content",
        type: "long_text",
        title: "Is there anything you expected to see on the site that isn't there?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "return_likely",
        type: "opinion_scale",
        title: "How likely are you to come back to the site?",
        required: true,
        steps: 5,
        labelLow: "Very unlikely",
        labelHigh: "Very likely",
      },
      {
        ref: "follow_up_email",
        type: "email",
        title: "Happy for us to follow up with a question or two? Leave your email if so.",
        description: "Optional. We'll only use it to ask about this feedback.",
        required: false,
      },
    ],
    branches: [
      { when: "found_it", is: "Yes, easily", then: "site_ratings" },
      { when: "found_it", is: "Yes, but it took some digging", then: "where_stuck" },
      { when: "found_it", is: "No", then: "what_missing" },
      { when: "where_stuck", always: true, then: "site_ratings" },
    ],
    ending: {
      title: "Thanks, that's really useful",
      body: "We read every answer and use them to decide what to fix on the site first.",
    },
    guide: {
      questionsToConsider: [
        "Which visitor goals matter most to your business, and are they all in the first question?",
        "Do you want to run this on every page, or only on the pages where people drop off?",
        "Should returning visitors and first-timers see different follow-ups?",
        "Which parts of the site are you actually able to change in the next few months?",
      ],
      howToUseResponses:
        "Sort answers by visit goal first, then by whether people found what they came for. A cluster of \"No\" answers from people comparing prices points at a specific page, and the written answers about where they looked tell you where to put the missing link. Fix the most common gap, then compare the same question a month later to see if it moved.",
      customizeSteps: [
        "Rewrite the options in the first question to match the real reasons people visit your site.",
        "Swap the rows in the rating grid for the parts of the site you are thinking of changing.",
        "Share the link from a small prompt on the site or after a visit, or embed it on the page you want feedback about.",
      ],
      faqs: [
        {
          q: "What questions should a website questionnaire include?",
          a: "Ask why the person came, whether they managed to do it, and where they got stuck. Those three answers are more useful than a general rating of the design.",
        },
        {
          q: "When should I show a website questionnaire to visitors?",
          a: "After they have had time to try something, such as at the end of a visit or after a key page. Asking on arrival gets opinions about a site they have not used yet.",
        },
        {
          q: "Is a website questionnaire the same as a website design brief?",
          a: "No. A brief collects what a client wants built. This questionnaire asks real visitors how an existing site works for them.",
        },
        {
          q: "Can visitors answer without leaving an email?",
          a: "Yes. The email question at the end is optional, so people can give feedback anonymously if they prefer.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "ces-customer-effort-score-survey",
    type: "survey",
    category: "customer-satisfaction",
    goals: ["collect-feedback"],
    roles: ["customer-success", "product-research", "operations"],
    searchName: "Customer effort score survey",
    title: "Customer effort score (CES)",
    icon: "Gauge",
    metaDescription:
      "Measure how easy one task felt with a customer effort score question, then ask customers who struggled exactly which step made it harder than it should be.",
    description: "One effort question, and a closer look at the steps that made it hard.",
    blurb:
      "Asks the standard effort question about one named task, on a seven-point agree scale. Customers who found it hard are asked what got in the way, how many times they had to get in touch and which step they would remove; customers who found it easy just say what helped.",
    tags: ["customer effort score", "CES survey", "support feedback", "customer experience", "friction"],
    greeting: "Quick one about what you just did with us. It takes under a minute.",
    questions: [
      {
        ref: "task",
        type: "single_select",
        title: "What were you trying to do?",
        required: true,
        allowOther: true,
        options: [
          { label: "Get help from support" },
          { label: "Set up my account" },
          { label: "Place or change an order" },
          { label: "Return or cancel something" },
          { label: "Update billing or account details" },
        ],
      },
      {
        ref: "effort",
        type: "opinion_scale",
        title: "How much do you agree with this: it was easy to get that done with us.",
        required: true,
        steps: 7,
        labelLow: "Strongly disagree",
        labelHigh: "Strongly agree",
      },

      // Hard
      {
        ref: "friction_points",
        type: "multi_select",
        title: "What made it harder than it should have been?",
        required: true,
        allowOther: true,
        options: [
          { label: "Too many steps" },
          { label: "I had to repeat information" },
          { label: "I was passed between people or teams" },
          { label: "Waiting for a reply" },
          { label: "The instructions were unclear" },
          { label: "Something didn't work" },
        ],
      },
      {
        ref: "contacts",
        type: "single_select",
        title: "How many times did you have to get in touch with us about it?",
        required: true,
        options: [
          { label: "I didn't need to" },
          { label: "Once" },
          { label: "Twice" },
          { label: "Three times or more" },
        ],
      },
      {
        ref: "remove_step",
        type: "long_text",
        title: "If you could remove one step from what you just went through, which would it be?",
        required: true,
        maxLength: 800,
      },

      // Easy
      {
        ref: "what_helped",
        type: "long_text",
        title: "What made it easy?",
        required: false,
        maxLength: 600,
      },

      // Everyone
      {
        ref: "time_taken",
        type: "single_select",
        title: "Roughly how long did it take from start to finish?",
        required: true,
        options: [
          { label: "A few minutes" },
          { label: "Under an hour" },
          { label: "A few hours" },
          { label: "A day or more" },
        ],
      },
      {
        ref: "customer_since",
        type: "dropdown",
        title: "How long have you been a customer?",
        required: false,
        options: [
          { label: "Less than a month" },
          { label: "1 to 12 months" },
          { label: "1 to 3 years" },
          { label: "More than 3 years" },
        ],
      },
      {
        ref: "may_contact",
        type: "yes_no",
        title: "Can we contact you if we have a question about your answers?",
        required: true,
      },
      { ref: "contact_email", type: "email", title: "What's the best email for that?", required: true },
    ],
    branches: [
      { when: "effort", op: "lte", is: 4, then: "friction_points" },
      { when: "effort", op: "gte", is: 5, then: "what_helped" },
      { when: "remove_step", always: true, then: "time_taken" },
      { when: "may_contact", is: false, then: "end_thanks" },
    ],
    ending: {
      title: "Thanks for telling us",
      body: "Your answers go straight to the team that owns this part of the experience.",
    },
    guide: {
      questionsToConsider: [
        "Which single task is this survey about, and can you name it in the question instead of asking the customer?",
        "Where does a score of 4 belong for you: with the struggles, or with the neutral middle?",
        "Who owns each step a customer might name, so a complaint about billing reaches the billing team?",
        "How soon after the task can you send it, while the customer still remembers the steps?",
      ],
      howToUseResponses:
        "Track the average effort score per task, not across everything, because setup and refunds are never going to feel the same. For low scores, count which friction reasons come up most and read the answers about the step people would remove: that is your shortlist of fixes. Customers who had to get in touch three times or more are worth a personal reply.",
      customizeSteps: [
        "Replace the options in the first question with the tasks you actually measure, or remove it and send one survey per task.",
        "Adjust the friction reasons to the steps in your own process, such as identity checks or delivery booking.",
        "Send the link right after the task finishes, for example at the end of a support chat or setup flow.",
      ],
      faqs: [
        {
          q: "What is a customer effort score (CES) survey?",
          a: "It asks customers how easy it was to get something done with you, usually on an agree or disagree scale. It measures friction in one task rather than how the customer feels about you overall.",
        },
        {
          q: "How is customer effort score different from CSAT?",
          a: "CSAT asks how satisfied someone is, while CES asks how easy it was. A customer can be satisfied with a friendly agent and still have had to work far too hard to get an answer.",
        },
        {
          q: "What scale should a CES survey use?",
          a: "A seven-point agree scale is common, from strongly disagree to strongly agree. Whatever you pick, keep it the same every time so the scores can be compared.",
        },
        {
          q: "When should I send a customer effort score survey?",
          a: "Straight after the task, such as closing a support ticket or finishing setup. The longer you wait, the less detail people remember about which step was hard.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-service-satisfaction-survey",
    type: "survey",
    category: "customer-satisfaction",
    goals: ["collect-feedback"],
    roles: ["customer-success", "operations"],
    searchName: "Customer service satisfaction survey",
    title: "Customer service satisfaction",
    icon: "LifeBuoy",
    metaDescription:
      "Rate a support conversation on clarity, courtesy and speed, then check if the issue is truly fixed. Open cases get a reopen option instead of a thank-you.",
    description: "Rate the help, then check whether the problem is actually solved.",
    blurb:
      "Keeps the person who helped separate from the outcome, because a friendly agent can still leave a problem open. Customers whose issue is fully sorted are asked what the agent did well; anyone with a partly or fully open case can ask to have it reopened and leave an email, and lands on an ending that says so.",
    tags: ["customer service survey", "support satisfaction", "help desk feedback", "agent rating", "case resolution"],
    greeting: "Thanks for getting in touch with us recently. How did we do?",
    questions: [
      {
        ref: "channel",
        type: "single_select",
        title: "How did you get in touch?",
        required: true,
        options: [
          { label: "Live chat" },
          { label: "Email" },
          { label: "Phone" },
          { label: "In person" },
          { label: "Social media" },
        ],
      },
      {
        ref: "topic",
        type: "dropdown",
        title: "What was it about?",
        required: true,
        options: [
          { label: "An order or delivery" },
          { label: "Billing or a refund" },
          { label: "A technical problem" },
          { label: "Signing in or account access" },
          { label: "A question about a product" },
          { label: "Something else" },
        ],
      },
      {
        ref: "agent",
        type: "matrix",
        title: "How much do you agree with each of these about the person who helped you?",
        required: true,
        rows: [
          "They understood my problem",
          "They explained things clearly",
          "They were polite and patient",
          "They kept me updated",
          "They knew what they were talking about",
        ],
        columns: ["Disagree", "Neutral", "Agree"],
      },
      {
        ref: "speed",
        type: "rating",
        title: "How happy are you with how quickly we got back to you?",
        required: true,
        scale: 5,
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how satisfied are you with the help you got?",
        required: true,
        scale: 5,
      },
      {
        ref: "resolved",
        type: "single_select",
        title: "Is your issue sorted now?",
        required: true,
        options: [{ label: "Yes, fully" }, { label: "Partly" }, { label: "No, it's still open" }],
      },

      // Still open
      {
        ref: "still_open",
        type: "long_text",
        title: "What still needs sorting out?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "reopen",
        type: "yes_no",
        title: "Would you like us to reopen your case and pick it up again?",
        required: true,
        yesLabel: "Yes, please",
        noLabel: "No thanks",
      },
      { ref: "reopen_email", type: "email", title: "Which email should we reply to?", required: true },

      // Sorted
      {
        ref: "praise",
        type: "long_text",
        title: "Anything the person who helped you did especially well?",
        description: "We pass these on to the team.",
        required: false,
        maxLength: 600,
      },

      // Everyone else
      {
        ref: "improve",
        type: "long_text",
        title: "What's one thing that would make getting help from us easier?",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "resolved", is: "Yes, fully", then: "praise" },
      { when: "resolved", is: "Partly", then: "still_open" },
      { when: "resolved", is: "No, it's still open", then: "still_open" },
      { when: "reopen", is: false, then: "improve" },
      { when: "reopen_email", always: true, then: "end_reopen" },
    ],
    endings: [
      {
        ref: "end_reopen",
        title: "We're on it 🔁",
        body: "Your case has been flagged to reopen, and the team will reply to the email you gave us.",
      },
    ],
    ending: {
      title: "Thank you for the feedback",
      body: "It helps us train the team and fix the things that make people get in touch twice.",
    },
    guide: {
      questionsToConsider: [
        "Do you want to rate the person, the team, or the process, and is the grid asking about the right one?",
        "Who picks up a reopened case, and how will they see it?",
        "Should the channel and topic be filled in from your help desk instead of asked?",
        "Will you share the praise with agents by name, and have you told them that?",
      ],
      howToUseResponses:
        "Work through the reopen requests first, since each one is a customer still waiting. Then split the scores by channel and topic: a low speed score on email but not on chat is a staffing question, not a training one. Read the agent grid alongside the written praise when you give individual feedback, so coaching points come with a real example.",
      customizeSteps: [
        "Edit the channel and topic lists to match how customers actually reach you and what they ask about.",
        "Adjust the statements in the grid to the standards your support team is measured on.",
        "Send the link when a ticket is closed, or embed it at the end of your help pages.",
      ],
      faqs: [
        {
          q: "What should a customer service satisfaction survey ask?",
          a: "Ask how the person who helped did, how quick the reply was, and whether the problem is actually fixed. Resolution matters most, because a pleasant conversation that fixes nothing still leaves an unhappy customer.",
        },
        {
          q: "When is the best time to send a customer service survey?",
          a: "Shortly after the case is closed, while the conversation is fresh. Ask about that one interaction so the answer is not mixed up with the customer's view of your product.",
        },
        {
          q: "What happens when a customer says the issue isn't resolved?",
          a: "This form asks what is still open and offers to reopen the case. If they say yes, it collects an email and ends on a message confirming someone will follow up.",
        },
        {
          q: "Should customer service surveys be anonymous?",
          a: "They can be. This one only asks for an email when the customer wants their case reopened, so everyone else can answer without identifying themselves.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "restaurant-customer-satisfaction-survey",
    type: "survey",
    category: "customer-satisfaction",
    goals: ["collect-feedback"],
    roles: ["operations", "customer-success", "marketing"],
    searchName: "Restaurant customer satisfaction survey",
    title: "Restaurant satisfaction survey",
    icon: "Utensils",
    metaDescription:
      "Ask diners about the food, the service and the value of their visit. Dine-in and takeaway guests get different questions, and unhappy ones can ask for the manager.",
    description: "Diners rate food, service and value, and unhappy guests reach the manager.",
    blurb:
      "Asks guests who ate in about the room and the service, and takeaway or delivery customers whether their order arrived complete. Everyone rates the food and value; a low overall score asks what would have made it better and offers a call from the manager, while happy diners are asked what they enjoyed.",
    tags: ["restaurant survey", "diner feedback", "customer satisfaction", "food and service", "hospitality"],
    greeting: "Thanks for eating with us! Can we ask how it went?",
    questions: [
      { ref: "visit_date", type: "date", title: "When did you eat with us?", required: false },
      {
        ref: "visit_type",
        type: "single_select",
        title: "How did you have your meal?",
        required: true,
        options: [{ label: "Dined in" }, { label: "Takeaway" }, { label: "Delivery" }],
      },

      // Dined in
      {
        ref: "dine_in",
        type: "matrix",
        title: "How was your time in the restaurant?",
        required: true,
        rows: ["Welcome on arrival", "Friendliness of staff", "Speed of service", "Cleanliness", "Atmosphere"],
        columns: ["Poor", "Okay", "Good", "Excellent"],
      },

      // Takeaway or delivery
      {
        ref: "order_accurate",
        type: "single_select",
        title: "Was your order complete and correct?",
        required: true,
        options: [
          { label: "Yes, all there" },
          { label: "Something was missing" },
          { label: "Something was wrong" },
          { label: "It was cold or damaged" },
        ],
      },

      // Everyone
      { ref: "food", type: "rating", title: "How was the food?", required: true, scale: 5 },
      {
        ref: "dishes",
        type: "long_text",
        title: "What did you order, and did any dish stand out, good or bad?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "value",
        type: "opinion_scale",
        title: "How fair were the prices for what you got?",
        required: true,
        steps: 5,
        labelLow: "Poor value",
        labelHigh: "Great value",
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how would you rate your visit?",
        required: true,
        scale: 5,
      },

      // Unhappy
      {
        ref: "better",
        type: "long_text",
        title: "Sorry it wasn't better. What's the one thing that would have made the difference?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "manager",
        type: "yes_no",
        title: "Would you like the manager to get in touch with you?",
        required: true,
      },
      {
        ref: "manager_contact",
        type: "contact_info",
        title: "How can the manager reach you?",
        required: true,
        fields: ["first_name", "email", "phone"],
      },

      // Happy
      {
        ref: "enjoyed",
        type: "long_text",
        title: "What did you enjoy most?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "return_visit",
        type: "single_select",
        title: "Would you eat with us again?",
        required: true,
        options: [{ label: "Definitely" }, { label: "Probably" }, { label: "Not sure" }, { label: "Probably not" }],
      },
    ],
    branches: [
      { when: "visit_type", is: "Dined in", then: "dine_in" },
      { when: "visit_type", is: "Takeaway", then: "order_accurate" },
      { when: "visit_type", is: "Delivery", then: "order_accurate" },
      { when: "dine_in", always: true, then: "food" },
      { when: "overall", op: "lte", is: 3, then: "better" },
      { when: "overall", op: "gte", is: 4, then: "enjoyed" },
      { when: "manager", is: false, then: "return_visit" },
      { when: "manager_contact", always: true, then: "end_manager" },
    ],
    endings: [
      {
        ref: "end_manager",
        title: "The manager will be in touch",
        body: "Thank you for giving us the chance to put this right. We'll use the details you left.",
      },
    ],
    ending: {
      title: "Thanks, and hope to see you soon 🍽️",
      body: "The kitchen and floor team read every answer.",
    },
    guide: {
      questionsToConsider: [
        "Do you offer takeaway and delivery, or can you remove that route entirely?",
        "Which parts of the dining room experience do you want rated, such as booking, wait time or noise?",
        "Who calls back an unhappy guest, and how quickly can they do it?",
        "Where will you share the link: on the receipt, the table, or in the delivery bag?",
      ],
      howToUseResponses:
        "Call back every guest who asked for the manager before anything else, ideally the same day. Then look at scores by visit date and by dine-in versus takeaway, since a bad Friday night or a run of missing items points at a shift or a packing step rather than the menu. The dish comments are worth passing to the kitchen each week.",
      customizeSteps: [
        "Change the rows in the dining grid to the parts of service you train staff on.",
        "Remove the delivery option if you don't deliver, or add one for events and catering.",
        "Print the link as a QR code on receipts or table cards, and add it to takeaway bags.",
      ],
      faqs: [
        {
          q: "What questions should a restaurant customer satisfaction survey include?",
          a: "Ask about the food, the service, the value for money and an overall rating, then ask for the reason behind a low score. Keep it short enough to finish before the bill arrives.",
        },
        {
          q: "How do I get diners to fill in a restaurant survey?",
          a: "Put a QR code on the receipt or table card and ask while the meal is fresh. A chat that asks one question at a time feels quicker on a phone than a long page.",
        },
        {
          q: "Can I use the same survey for dine-in and delivery customers?",
          a: "Yes. This one asks how the order was received first, so delivery customers answer about accuracy and dine-in guests answer about the room and staff.",
        },
        {
          q: "What should I do with bad restaurant feedback?",
          a: "Reply quickly and personally. This survey lets unhappy guests ask for the manager and leave their details, so you can reach them before they write a public review.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "student-satisfaction-survey",
    type: "survey",
    category: "customer-satisfaction",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["education"],
    searchName: "Student satisfaction survey",
    title: "Student satisfaction survey",
    icon: "GraduationCap",
    metaDescription:
      "Ask students about teaching, feedback, workload and support services. Students who are struggling can ask to be contacted by support; everyone else stays anonymous.",
    description: "Teaching, resources, workload and support, from the students themselves.",
    blurb:
      "Covers the parts of a course students feel most: teaching, feedback on their work, resources, workload and belonging. A student who rates their course low is asked what's making it hard and can ask student support to get in touch, while everyone else can answer without giving a name.",
    tags: ["student satisfaction survey", "course evaluation", "student feedback", "higher education", "student experience"],
    greeting: "Hi! We'd like to hear how your course is going. It takes about three minutes.",
    questions: [
      {
        ref: "course",
        type: "short_text",
        title: "Which course or programme are you studying?",
        required: true,
        maxLength: 150,
      },
      {
        ref: "year",
        type: "single_select",
        title: "Which year are you in?",
        required: true,
        options: [
          { label: "First year" },
          { label: "Second year" },
          { label: "Third year" },
          { label: "Fourth year or later" },
          { label: "Postgraduate" },
        ],
      },
      {
        ref: "teaching",
        type: "matrix",
        title: "How much do you agree with each of these?",
        required: true,
        rows: [
          "Staff explain things clearly",
          "The course is well organised",
          "Feedback on my work helps me improve",
          "Feedback arrives in time to be useful",
          "I can get help from staff when I need it",
        ],
        columns: ["Disagree", "Somewhat disagree", "Somewhat agree", "Agree"],
      },
      {
        ref: "resources",
        type: "opinion_scale",
        title: "How well do the library, online learning tools and study spaces meet your needs?",
        required: true,
        steps: 5,
        labelLow: "Not at all",
        labelHigh: "Completely",
      },
      {
        ref: "workload",
        type: "single_select",
        title: "How manageable is your workload?",
        required: true,
        options: [
          { label: "Too light" },
          { label: "About right" },
          { label: "Heavy but manageable" },
          { label: "Too heavy" },
        ],
      },
      {
        ref: "support_used",
        type: "multi_select",
        title: "Which support services have you used this year?",
        required: false,
        minSelections: 0,
        options: [
          { label: "Academic advising or tutoring" },
          { label: "Wellbeing or counselling" },
          { label: "Careers service" },
          { label: "Disability or learning support" },
          { label: "Financial advice" },
          { label: "None of these" },
        ],
      },
      {
        ref: "belonging",
        type: "opinion_scale",
        title: "How much do you feel part of a community of students and staff?",
        required: true,
        steps: 5,
        labelLow: "Not at all",
        labelHigh: "Very much",
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how satisfied are you with your course?",
        required: true,
        scale: 5,
      },

      // Struggling
      {
        ref: "difficult",
        type: "long_text",
        title: "What's making your experience difficult right now?",
        required: true,
        maxLength: 1200,
      },
      {
        ref: "want_contact",
        type: "yes_no",
        title: "Would you like someone from student support to get in touch?",
        description: "Your answers stay anonymous unless you say yes.",
        required: true,
      },
      {
        ref: "contact_email",
        type: "email",
        title: "Which email should they use?",
        required: true,
      },

      // Satisfied
      {
        ref: "best_thing",
        type: "long_text",
        title: "What's the best thing about your course?",
        required: false,
        maxLength: 800,
      },

      // Everyone who stays anonymous
      {
        ref: "one_change",
        type: "long_text",
        title: "If you could change one thing about your course, what would it be?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "overall", op: "lte", is: 2, then: "difficult" },
      { when: "overall", op: "gte", is: 3, then: "best_thing" },
      { when: "want_contact", is: false, then: "one_change" },
      { when: "contact_email", always: true, then: "end_support" },
    ],
    endings: [
      {
        ref: "end_support",
        title: "Student support will be in touch",
        body: "Thanks for telling us. Someone from the support team will email you, and nothing you said here affects your marks.",
      },
    ],
    ending: {
      title: "Thank you for your feedback 🎓",
      body: "Course leaders review these answers and share what they're changing as a result.",
    },
    guide: {
      questionsToConsider: [
        "Is this survey about one course, a whole department, or the institution as a whole?",
        "Which support services do you offer, and does the list match their real names?",
        "Who receives the contact requests, and can they reply within a few days?",
        "How will you tell students what changed because of their answers?",
      ],
      howToUseResponses:
        "Pass contact requests to student support the day they arrive; those students have told you they are struggling. For the rest, compare the teaching grid by course and year, since feedback timing and workload problems usually sit with a specific module or cohort. Report back to students on two or three changes you made, because that is what gets them to answer next time.",
      customizeSteps: [
        "Replace the course question with a dropdown of your programmes if you want tidy reporting.",
        "Rename the support services to match what your school, college or university calls them.",
        "Share the link through your learning platform or embed it on a student portal page near the end of term.",
      ],
      faqs: [
        {
          q: "What questions are in a student satisfaction survey?",
          a: "Most cover teaching quality, feedback and assessment, learning resources, workload, support services and an overall rating. An open question about one change gives you the detail behind the scores.",
        },
        {
          q: "When should a student satisfaction survey be run?",
          a: "Near the end of a term or semester, once students have had assessments back but before exams take over. Running it at the same point each year makes the results comparable.",
        },
        {
          q: "Can student satisfaction surveys be anonymous?",
          a: "Yes. This template never asks for a name. It only asks for an email if a student chooses to be contacted by support.",
        },
        {
          q: "How do I get more students to respond?",
          a: "Keep it short, send it through channels students already check, and show them what changed after the last survey. A chat format that asks one question at a time also works well on phones.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "salon-evaluation-survey",
    type: "survey",
    category: "customer-satisfaction",
    goals: ["collect-feedback"],
    roles: ["customer-success", "operations", "marketing"],
    searchName: "Salon evaluation survey",
    title: "Salon evaluation survey",
    icon: "Scissors",
    metaDescription:
      "Ask salon clients about the consultation, comfort, timing and whether the result matched what they asked for. A result that missed offers a follow-up call.",
    description: "Hear how the appointment went, from consultation to the final look.",
    blurb:
      "Follows a visit in the order it happened: what they had done, the consultation, comfort and timing, then the result itself. A client who says the result wasn't what they wanted is asked what was different and whether they'd like a call about putting it right, before they tell anyone else.",
    tags: ["salon survey", "hair salon feedback", "beauty salon", "client feedback", "stylist review"],
    greeting: "Thanks for visiting us! How did your appointment go?",
    questions: [
      {
        ref: "service",
        type: "multi_select",
        title: "What did you have done?",
        required: true,
        allowOther: true,
        options: [
          { label: "Cut" },
          { label: "Colour or highlights" },
          { label: "Blow-dry or styling" },
          { label: "Hair treatment" },
          { label: "Nails" },
          { label: "Skin or beauty treatment" },
        ],
      },
      {
        ref: "stylist",
        type: "short_text",
        title: "Who looked after you?",
        description: "First name is fine. Leave it blank if you're not sure.",
        required: false,
        maxLength: 80,
      },
      { ref: "first_visit", type: "yes_no", title: "Was this your first visit?", required: true },
      {
        ref: "visit",
        type: "matrix",
        title: "How did we do on each of these?",
        required: true,
        rows: [
          "Consultation before we started",
          "Listening to what you wanted",
          "Comfort during the appointment",
          "Cleanliness",
          "Starting and finishing on time",
        ],
        columns: ["Poor", "Okay", "Good", "Excellent"],
      },
      {
        ref: "result",
        type: "single_select",
        title: "Did the result match what you asked for?",
        required: true,
        options: [
          { label: "Yes, exactly" },
          { label: "Close, with small differences" },
          { label: "No, not what I wanted" },
        ],
      },

      // Result missed
      {
        ref: "difference",
        type: "long_text",
        title: "Sorry to hear that. What's different from what you asked for?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "fix_call",
        type: "yes_no",
        title: "Would you like us to call you about putting it right?",
        required: true,
        yesLabel: "Yes, please",
        noLabel: "No thanks",
      },
      { ref: "fix_phone", type: "phone", title: "What number should we call?", required: true },

      // Everyone else
      {
        ref: "price_fair",
        type: "opinion_scale",
        title: "How fair was the price for the result?",
        required: true,
        steps: 5,
        labelLow: "Too expensive",
        labelHigh: "Great value",
      },
      {
        ref: "come_back",
        type: "single_select",
        title: "Are you planning to come back?",
        required: true,
        options: [
          { label: "Yes, I've already booked" },
          { label: "Yes, probably" },
          { label: "Not sure yet" },
          { label: "Probably not" },
        ],
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend us to a friend?",
        required: true,
      },
      {
        ref: "photo",
        type: "file_upload",
        title: "Want to share a photo of your finished look?",
        description: "Optional. We'll ask before posting it anywhere.",
        required: false,
        accept: ["image/*"],
        maxFiles: 3,
      },
    ],
    branches: [
      { when: "result", is: "Yes, exactly", then: "price_fair" },
      { when: "result", is: "Close, with small differences", then: "price_fair" },
      { when: "result", is: "No, not what I wanted", then: "difference" },
      { when: "fix_call", is: false, then: "price_fair" },
      { when: "fix_phone", always: true, then: "end_fix" },
    ],
    endings: [
      {
        ref: "end_fix",
        title: "We'll call you soon",
        body: "Thank you for telling us. We'd much rather fix it than have you leave unhappy.",
      },
    ],
    ending: {
      title: "Thank you, see you next time 💇",
      body: "Your stylist will see your feedback.",
    },
    guide: {
      questionsToConsider: [
        "Which services do you offer, and should the first question list them by name?",
        "Do you want feedback on individual stylists, and have they agreed to that?",
        "Who calls clients back when a result missed, and what can they offer?",
        "Will you use shared photos on social media, and how will you ask permission?",
      ],
      howToUseResponses:
        "Call back any client who asked, ideally within a day, while a fix is still easy. Then look at the grid by stylist and by service: a pattern of low consultation scores on colour appointments usually means expectations aren't being set before the dye goes on. Clients who have already rebooked and score high on recommending are the ones to ask for a public review.",
      customizeSteps: [
        "Edit the services list and the grid rows to match your treatment menu and how you run appointments.",
        "Replace the stylist question with a dropdown of your team if you want reliable reporting per person.",
        "Send the link by text or email a few hours after the appointment, or share it as a QR code at the front desk.",
      ],
      faqs: [
        {
          q: "What should I ask in a salon feedback survey?",
          a: "Ask what service they had, how the consultation went, whether the result matched what they wanted, and whether they'll come back. The match between request and result is the question that predicts complaints.",
        },
        {
          q: "When should a salon send a client survey?",
          a: "The same day or the next, once the client has seen the result at home in different light. Much later and they will have already decided whether to return.",
        },
        {
          q: "How do I handle a client who is unhappy with their hair?",
          a: "Contact them quickly and offer to put it right. This survey asks unhappy clients what was different and collects a phone number if they want a call.",
        },
        {
          q: "Can clients upload photos in a salon survey?",
          a: "Yes. The last question lets clients share up to three photos of the finished look, and it is optional.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "event-satisfaction-survey",
    type: "survey",
    category: "customer-satisfaction",
    goals: ["collect-feedback", "run-events"],
    roles: ["marketing", "operations"],
    searchName: "Event satisfaction survey",
    title: "Event satisfaction survey",
    icon: "Ticket",
    metaDescription:
      "Collect attendee feedback after your event: sessions, venue or stream quality, and what disappointed them. In-person and online guests get their own questions.",
    description: "What worked, what disappointed, and whether people will come back.",
    blurb:
      "Splits in-person and online attendees early, so one group rates the venue and check-in and the other rates the stream. Attendees who found it better than expected are asked for the highlight, while those who found it worse are asked what fell short, before everyone ranks what they value.",
    tags: ["event satisfaction survey", "post-event survey", "attendee feedback", "conference feedback", "event evaluation"],
    greeting: "Thanks for coming! A few quick questions while the event is fresh.",
    questions: [
      {
        ref: "attended",
        type: "single_select",
        title: "How did you attend?",
        required: true,
        options: [{ label: "In person" }, { label: "Online" }],
      },

      // In person
      {
        ref: "venue",
        type: "matrix",
        title: "How would you rate these on the day?",
        required: true,
        rows: [
          "Registration and check-in",
          "The venue and its location",
          "Signs and finding your way",
          "Food and drink",
          "Room comfort and sound",
        ],
        columns: ["Poor", "Okay", "Good", "Excellent"],
      },

      // Online
      {
        ref: "stream",
        type: "matrix",
        title: "How well did the online side work for you?",
        required: true,
        rows: ["Joining the event", "Video and sound quality", "Asking questions or chatting", "Access to recordings"],
        columns: ["Poor", "Okay", "Good", "Excellent"],
      },

      // Everyone
      { ref: "overall", type: "rating", title: "Overall, how would you rate the event?", required: true, scale: 5 },
      {
        ref: "expectations",
        type: "single_select",
        title: "How did it compare with what you expected?",
        required: true,
        options: [{ label: "Better than expected" }, { label: "About what I expected" }, { label: "Worse than expected" }],
      },

      // Met or beat expectations
      {
        ref: "highlight",
        type: "long_text",
        title: "What was the most worthwhile moment for you?",
        description: "A session, a conversation, anything that made it worth coming.",
        required: false,
        maxLength: 800,
      },

      // Fell short
      {
        ref: "fell_short",
        type: "long_text",
        title: "What disappointed you?",
        required: true,
        maxLength: 1000,
      },

      // Everyone
      {
        ref: "relevance",
        type: "opinion_scale",
        title: "How relevant were the sessions to your work or interests?",
        required: true,
        steps: 5,
        labelLow: "Not relevant",
        labelHigh: "Very relevant",
      },
      {
        ref: "value_most",
        type: "ranking",
        title: "Rank what you value most at events like this",
        required: false,
        items: ["Talks and keynotes", "Hands-on workshops", "Meeting other attendees", "Exhibitors and demos", "Social events"],
      },
      {
        ref: "next_topics",
        type: "long_text",
        title: "What topics or speakers would you like to see next time?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "come_again",
        type: "single_select",
        title: "Would you come to the next one?",
        required: true,
        options: [{ label: "Definitely" }, { label: "Probably" }, { label: "Not sure" }, { label: "Probably not" }],
      },
      { ref: "recommend", type: "nps", title: "How likely are you to recommend this event to a colleague?", required: true },
    ],
    branches: [
      { when: "attended", is: "In person", then: "venue" },
      { when: "attended", is: "Online", then: "stream" },
      { when: "venue", always: true, then: "overall" },
      { when: "expectations", is: "Better than expected", then: "highlight" },
      { when: "expectations", is: "About what I expected", then: "highlight" },
      { when: "expectations", is: "Worse than expected", then: "fell_short" },
      { when: "highlight", always: true, then: "relevance" },
    ],
    ending: {
      title: "Thanks for the feedback 🎟️",
      body: "We'll use it to plan the next one. Hope to see you there.",
    },
    guide: {
      questionsToConsider: [
        "Was the event in person, online or both, and do you need both routes?",
        "Which parts of the day are you able to change next time, and do the grid rows cover them?",
        "Do you want feedback on individual sessions or speakers as well as the whole event?",
        "What will you share with sponsors, and does the survey ask what they need to know?",
      ],
      howToUseResponses:
        "Read the disappointments first, because they are specific and usually fixable: a queue at check-in, a room that was too small, a stream that dropped. Compare in-person and online scores to see whether one audience is getting a worse event. The ranking and topic suggestions are your starting point for the next programme, and the recommend scores give you a figure to beat next year.",
      customizeSteps: [
        "Rewrite the venue and online rows to match what you ran, or remove the route you don't need.",
        "Add a dropdown of sessions if you want attendees to rate their favourite by name.",
        "Send the link the day after the event, and share it in the closing slide or event app while people are still there.",
      ],
      faqs: [
        {
          q: "What questions should I ask in an event satisfaction survey?",
          a: "Ask for an overall rating, how the event compared with expectations, what was most worthwhile, what disappointed, and whether they would come again. Add questions about the venue or stream depending on how people attended.",
        },
        {
          q: "When should I send a post-event survey?",
          a: "Within a day of the event ending. Attendees remember the details better, and you can still act on anything urgent such as missing recordings.",
        },
        {
          q: "Can one survey cover both in-person and online attendees?",
          a: "Yes. This template asks how someone attended first, then shows in-person guests questions about the venue and online guests questions about the stream.",
        },
        {
          q: "How long should an event feedback survey be?",
          a: "Long enough to cover the parts you can change and short enough to finish on a phone. Each attendee sees about ten questions here, because the venue and stream questions only go to the people they apply to.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "resident-satisfaction-survey",
    type: "survey",
    category: "customer-satisfaction",
    goals: ["collect-feedback"],
    roles: ["operations", "customer-success"],
    searchName: "Resident satisfaction survey",
    title: "Resident satisfaction survey",
    icon: "Building2",
    metaDescription:
      "Ask residents about repairs, shared spaces, safety and communication. Repairs that are still open get their own follow-up, and residents can ask to be contacted.",
    description: "Housing and community services, rated by the people who live there.",
    blurb:
      "Covers the services residents notice day to day, from repairs and cleaning to safety and how well they are kept informed. Anyone with a repair that was botched or is still waiting is asked exactly what and where, and residents who want a reply can leave details and land on an ending that says someone will be in touch.",
    tags: ["resident satisfaction survey", "tenant survey", "housing feedback", "property management", "community services"],
    greeting: "Hello! We'd like to know how living here is going for you. It takes about four minutes.",
    questions: [
      {
        ref: "building",
        type: "short_text",
        title: "Which building or street do you live in?",
        description: "No need for your flat or house number unless you'd like a reply.",
        required: true,
        maxLength: 150,
      },
      {
        ref: "years",
        type: "single_select",
        title: "How long have you lived here?",
        required: true,
        options: [
          { label: "Less than a year" },
          { label: "1 to 3 years" },
          { label: "3 to 10 years" },
          { label: "More than 10 years" },
        ],
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how satisfied are you with living here?",
        required: true,
        scale: 5,
      },
      {
        ref: "services",
        type: "matrix",
        title: "How would you rate each of these?",
        required: true,
        rows: [
          "Cleaning of shared areas",
          "Safety and security",
          "Gardens and outdoor spaces",
          "Rubbish and recycling",
          "Parking",
          "Lifts, lighting and entry systems",
        ],
        columns: ["Very poor", "Poor", "Good", "Very good", "Doesn't apply"],
      },
      {
        ref: "repair_reported",
        type: "yes_no",
        title: "Have you reported a repair in the last 12 months?",
        required: true,
      },
      {
        ref: "repair_outcome",
        type: "single_select",
        title: "How was your most recent repair handled?",
        required: true,
        options: [
          { label: "Fixed quickly and properly" },
          { label: "Fixed, but it took too long" },
          { label: "Fixed, but not properly" },
          { label: "Still not fixed" },
        ],
      },
      {
        ref: "repair_open",
        type: "long_text",
        title: "What still needs fixing, and where in your home or building is it?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "informed",
        type: "opinion_scale",
        title: "How well do we keep you informed about things that affect your home?",
        required: true,
        steps: 5,
        labelLow: "Very poorly",
        labelHigh: "Very well",
      },
      {
        ref: "listened",
        type: "single_select",
        title: "Do you feel your views are listened to and acted on?",
        required: true,
        options: [{ label: "Yes" }, { label: "Sometimes" }, { label: "No" }],
      },
      {
        ref: "daily_issues",
        type: "multi_select",
        title: "Are any of these affecting your daily life at the moment?",
        required: true,
        options: [
          { label: "Noise" },
          { label: "Damp or mould" },
          { label: "Heating or hot water" },
          { label: "Pests" },
          { label: "Anti-social behaviour" },
          { label: "Access or mobility problems" },
          { label: "None of these" },
        ],
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Is there anything else you'd like us to know?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "want_reply",
        type: "yes_no",
        title: "Would you like us to contact you about anything you've raised?",
        required: true,
      },
      {
        ref: "reply_details",
        type: "contact_info",
        title: "How can we reach you?",
        description: "Include your flat or house number with your name if you left it out earlier.",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
    ],
    branches: [
      { when: "repair_reported", is: false, then: "informed" },
      { when: "repair_outcome", is: "Fixed quickly and properly", then: "informed" },
      { when: "repair_outcome", is: "Fixed, but it took too long", then: "informed" },
      { when: "repair_outcome", is: "Fixed, but not properly", then: "repair_open" },
      { when: "repair_outcome", is: "Still not fixed", then: "repair_open" },
      { when: "want_reply", is: false, then: "end_thanks" },
      { when: "reply_details", always: true, then: "end_contact" },
    ],
    endings: [
      {
        ref: "end_contact",
        title: "We'll be in touch",
        body: "Thank you. Someone from the team will contact you about what you've raised.",
      },
    ],
    ending: {
      title: "Thank you for your time 🏠",
      body: "Every answer is read, and we'll share what we're changing as a result.",
    },
    guide: {
      questionsToConsider: [
        "Which services are you responsible for, and does the grid leave out anything residents rely on?",
        "Can you identify buildings from a dropdown instead of a typed answer?",
        "Who follows up on open repairs and contact requests, and by when?",
        "How will residents hear back about what you changed?",
      ],
      howToUseResponses:
        "Treat every open or badly done repair as a live job: log it and reply before you look at the averages. Then compare the service grid building by building, because a low cleaning score in one block is a contractor issue, not a policy one. Damp, mould and heating reports need a separate check, since they can affect health. Share a short summary with residents so they can see the survey led somewhere.",
      customizeSteps: [
        "Change the building question to a dropdown of your properties, and edit the grid rows to the services you provide.",
        "Adjust the daily issues list to what residents in your area actually report.",
        "Share the link by email, text or a QR code on noticeboards, and embed it on your resident portal.",
      ],
      faqs: [
        {
          q: "What should a resident satisfaction survey cover?",
          a: "Overall satisfaction, repairs, the condition of shared spaces, safety, communication and whether residents feel listened to. Leave room for issues affecting daily life, such as damp or noise.",
        },
        {
          q: "How often should landlords survey residents?",
          a: "Many run a full survey once a year and a short one after each repair. Asking at the same time each year lets you compare the results fairly.",
        },
        {
          q: "Is a resident satisfaction survey the same as a tenant survey?",
          a: "Mostly, yes. Resident surveys often cover leaseholders and people in supported housing too, so the wording avoids assuming everyone rents.",
        },
        {
          q: "Can residents answer anonymously?",
          a: "Yes. Only the building is required, and contact details are asked for only when a resident wants a reply.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "member-satisfaction-survey",
    type: "survey",
    category: "customer-satisfaction",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["customer-success", "marketing", "operations"],
    searchName: "Member satisfaction survey",
    title: "Member satisfaction survey",
    icon: "Users",
    metaDescription:
      "Learn which membership benefits people value, how they take part and whether they plan to renew. Members thinking of leaving are asked why and what would keep them.",
    description: "Find out what members value, and why some might not renew.",
    blurb:
      "Asks why people joined, ranks the benefits they care about and checks whether you contact them too much or too little. The renewal question decides the rest: loyal members say what they value most, undecided ones say what would help them choose, and members leaning towards leaving are asked why and what would change their mind.",
    tags: ["member satisfaction survey", "membership survey", "association feedback", "renewal", "member retention"],
    greeting: "Hi! As a member, your view shapes what we do next. This takes about three minutes.",
    questions: [
      {
        ref: "tenure",
        type: "single_select",
        title: "How long have you been a member?",
        required: true,
        options: [
          { label: "Less than a year" },
          { label: "1 to 2 years" },
          { label: "3 to 5 years" },
          { label: "More than 5 years" },
        ],
      },
      {
        ref: "why_joined",
        type: "multi_select",
        title: "Why did you join?",
        required: true,
        allowOther: true,
        options: [
          { label: "Meeting people in my field" },
          { label: "Events" },
          { label: "Learning and training" },
          { label: "Member discounts" },
          { label: "Resources and publications" },
          { label: "Supporting the cause" },
        ],
      },
      {
        ref: "benefit_rank",
        type: "ranking",
        title: "Rank these benefits by how much they matter to you",
        required: true,
        items: ["Events", "Learning and training", "Networking", "Discounts", "Resources and publications"],
      },
      {
        ref: "participation",
        type: "single_select",
        title: "How often do you take part in something we run?",
        required: true,
        options: [
          { label: "Most months" },
          { label: "A few times a year" },
          { label: "Once a year or less" },
          { label: "I haven't yet" },
        ],
      },
      {
        ref: "value",
        type: "opinion_scale",
        title: "How good is your membership for what you pay?",
        required: true,
        steps: 5,
        labelLow: "Poor value",
        labelHigh: "Excellent value",
      },
      {
        ref: "comms",
        type: "matrix",
        title: "How do you feel about how much you hear from us?",
        required: false,
        rows: ["Emails and newsletters", "Event invitations", "Updates from the board or committee", "Social media"],
        columns: ["Too little", "About right", "Too much"],
      },
      {
        ref: "renew",
        type: "single_select",
        title: "How likely are you to renew when your membership is up?",
        required: true,
        options: [
          { label: "Definitely renewing" },
          { label: "Probably" },
          { label: "Undecided" },
          { label: "Probably not" },
          { label: "Definitely not" },
        ],
      },

      // Renewing
      {
        ref: "valued_most",
        type: "long_text",
        title: "What do you value most about being a member?",
        required: false,
        maxLength: 800,
      },

      // Undecided
      {
        ref: "help_decide",
        type: "long_text",
        title: "What would help you decide?",
        required: true,
        maxLength: 800,
      },

      // Leaning towards leaving
      {
        ref: "leave_reasons",
        type: "multi_select",
        title: "What's making you think about not renewing?",
        required: true,
        allowOther: true,
        options: [
          { label: "I don't use it enough" },
          { label: "The cost" },
          { label: "The benefits don't fit my needs any more" },
          { label: "I'm changing jobs or moving" },
          { label: "I've found something that suits me better" },
          { label: "A poor experience with us" },
        ],
      },
      {
        ref: "would_stay",
        type: "long_text",
        title: "Is there anything that would make you stay?",
        required: false,
        maxLength: 800,
      },

      // Renewing and undecided
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend membership to a colleague or friend?",
        required: true,
      },
      {
        ref: "improve",
        type: "long_text",
        title: "What's one thing we should start, stop or change?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "renew", is: "Definitely renewing", then: "valued_most" },
      { when: "renew", is: "Probably", then: "valued_most" },
      { when: "renew", is: "Undecided", then: "help_decide" },
      { when: "renew", is: "Probably not", then: "leave_reasons" },
      { when: "renew", is: "Definitely not", then: "leave_reasons" },
      { when: "valued_most", always: true, then: "recommend" },
      { when: "help_decide", always: true, then: "recommend" },
      { when: "would_stay", always: true, then: "end_leaving" },
    ],
    endings: [
      {
        ref: "end_leaving",
        title: "Thank you for being honest",
        body: "Hearing why people leave is how we get better. Whatever you decide, thanks for being a member.",
      },
    ],
    ending: {
      title: "Thanks for being a member 🙌",
      body: "We'll share what we're changing once we've read everyone's answers.",
    },
    guide: {
      questionsToConsider: [
        "Which benefits do you actually offer, and do the ranking items use the names members know?",
        "Would you rather know the renewal intent or the reasons for it, if you could only ask one?",
        "Should members close to their renewal date get this survey first?",
        "Who will reach out to members who are undecided, and what can they offer?",
      ],
      howToUseResponses:
        "Group answers by renewal intent. The reasons from members leaning towards leaving tell you what to fix, and the undecided group is where a timely phone call or a better-suited benefit makes a difference. Compare the benefit ranking with how often people take part: a benefit ranked highly that nobody uses usually needs better promotion, not replacement.",
      customizeSteps: [
        "Rename the reasons for joining and the ranking items to match your real benefits.",
        "Adjust the communication rows to the channels you use, such as a magazine or a member forum.",
        "Send the link a couple of months before renewals, and add it to your members' area or newsletter.",
      ],
      faqs: [
        {
          q: "What questions should a member satisfaction survey ask?",
          a: "Why people joined, which benefits they value and use, whether membership feels worth the cost, and how likely they are to renew. Ask why when someone is unlikely to renew, since that answer is the most useful one you'll get.",
        },
        {
          q: "When should I send a membership survey?",
          a: "A couple of months before renewal gives you time to act on what undecided members say. A yearly survey at the same point makes results comparable.",
        },
        {
          q: "How can a survey help with member retention?",
          a: "It shows you who is at risk and why before they lapse. This template asks those members what would make them stay, which gives you something concrete to offer.",
        },
        {
          q: "Can I use this for a club, association or gym?",
          a: "Yes. Edit the benefits and reasons for joining to match what you offer. If your membership is free, swap the value-for-money question for one about the time members put in.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "csat-survey",
    type: "survey",
    category: "customer-satisfaction",
    goals: ["collect-feedback"],
    roles: ["customer-success", "product-research"],
    searchName: "CSAT survey",
    title: "Customer satisfaction (CSAT)",
    icon: "SmilePlus",
    metaDescription:
      "A short CSAT survey about one interaction. Customers with nothing left open finish in a few taps; the rest say what's outstanding and can ask for a follow-up.",
    description: "Rate a specific interaction, and dig only where it went badly.",
    blurb:
      "CSAT works when it is asked about one thing, straight after that thing happened. A customer with nothing outstanding gives one reason for their score and is done; anyone left with something unsorted is asked what is outstanding and what got in the way, and can ask a person to pick it up. Nobody is asked what went wrong when nothing did.",
    tags: ["CSAT survey", "customer satisfaction score", "support feedback", "post-interaction survey", "customer feedback"],
    greeting: "How did that go? A couple of questions while it's fresh.",
    questions: [
      {
        ref: "touchpoint",
        type: "single_select",
        title: "What are you rating today?",
        required: true,
        allowOther: true,
        options: [
          { label: "A conversation with support" },
          { label: "A purchase or delivery" },
          { label: "Getting set up" },
          { label: "Using the product" },
        ],
      },
      { ref: "satisfaction", type: "rating", title: "How satisfied were you overall?", required: true, scale: 5, shape: "star" },
      {
        ref: "effort",
        type: "opinion_scale",
        title: "How easy was it to get what you needed?",
        required: true,
        steps: 7,
        labelLow: "Very difficult",
        labelHigh: "Very easy",
      },
      { ref: "resolved", type: "yes_no", title: "Is everything sorted, with nothing left outstanding?", required: true },

      // Not resolved
      {
        ref: "still_wrong",
        type: "long_text",
        title: "What's still outstanding?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "friction",
        type: "single_select",
        title: "What got in the way?",
        required: false,
        options: [
          { label: "It took too long" },
          { label: "I had to repeat myself" },
          { label: "The answer didn't fit my situation" },
          { label: "I was sent to the wrong place" },
          { label: "Something else" },
        ],
      },
      {
        ref: "callback",
        type: "yes_no",
        title: "Would you like someone to pick this up with you?",
        required: true,
        yesLabel: "Yes please",
        noLabel: "No, I'll manage",
      },
      { ref: "callback_email", type: "email", title: "Where can they reach you?", required: true },

      // Resolved
      {
        ref: "score_reason",
        type: "short_text",
        title: "What's the main reason for the score you gave?",
        required: false,
        maxLength: 300,
      },
    ],
    branches: [
      { when: "resolved", is: false, then: "still_wrong" },
      { when: "resolved", is: true, then: "score_reason" },
      { when: "callback", is: false, then: "end_thanks" },
      { when: "callback_email", always: true, then: "end_followup" },
    ],
    endings: [
      {
        ref: "end_followup",
        title: "Someone will be in touch 📮",
        body: "We've flagged this as unresolved, and a person from the team will reply to the email you gave us.",
      },
    ],
    ending: { title: "Thanks for telling us ⭐", body: "Every answer is read by the team behind what you just used." },
    guide: {
      questionsToConsider: [
        "Which single interaction is this survey about, and can you name it instead of asking?",
        "Do you want the effort question as well, or is satisfaction alone enough for your reporting?",
        "Who picks up the unresolved cases, and how quickly can they reply?",
        "Will you count 4 and 5 stars as satisfied, and keep that rule every time you report?",
      ],
      howToUseResponses:
        "Work the follow-up requests first, since those customers are still stuck. For reporting, the usual CSAT figure is the share of 4 and 5 star answers, tracked per touchpoint so a bad week in delivery doesn't hide inside a good week in support. The friction reasons from unresolved answers are the list to take to the team that owns the process.",
      customizeSteps: [
        "Edit the touchpoint options to the interactions you measure, or remove the question and send one survey per interaction.",
        "Change the friction reasons to the ways things go wrong in your own process.",
        "Send the link straight after the interaction, for example when a chat closes or an order is delivered.",
      ],
      faqs: [
        {
          q: "What is a CSAT survey?",
          a: "A customer satisfaction (CSAT) survey asks customers to rate how satisfied they were with a specific interaction, usually on a 1 to 5 scale. It is short by design and sent right after the moment it asks about.",
        },
        {
          q: "How do you calculate a CSAT score?",
          a: "The common method is the number of satisfied responses, meaning 4 or 5 out of 5, divided by all responses, shown as a percentage. Export the answers to CSV to work it out per touchpoint.",
        },
        {
          q: "What's the difference between CSAT, CES and NPS?",
          a: "CSAT measures satisfaction with one interaction, CES measures how easy it was, and NPS measures how likely someone is to recommend you overall. This template includes an effort question alongside the CSAT rating.",
        },
        {
          q: "How many questions should a CSAT survey have?",
          a: "As few as possible, usually under six. This one asks five short questions when everything is sorted and only asks more when something is still open.",
        },
      ],
    },
  }),
];
