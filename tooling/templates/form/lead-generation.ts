import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_LEAD_GENERATION: TemplateSeed[] = [
  defineTemplate({
    slug: "lead-capture",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads"],
    roles: ["sales", "marketing"],
    searchName: "Lead capture form",
    title: "Lead capture",
    icon: "UserPlus",
    metaDescription:
      "Capture leads with the context sales needs: who they are, what they want solved and how soon. Larger teams ready to buy go to sales, the rest to a trial.",
    description: "Qualify visitors, and send the big ones to sales and the rest to a trial.",
    blurb:
      "Ask who they are and what they are trying to solve before you ask for a meeting. Team size decides the middle of the conversation: larger teams are asked about the decision and their requirements, smaller ones where they are up to. Timeline is the last question and decides the ending, so a team buying this quarter is handed to sales and everyone else is pointed at a trial they can start today.",
    tags: ["lead capture form", "b2b lead generation", "website lead form", "sales qualification", "branching"],
    greeting: "Hi! Interested in what we do? A few quick questions and we'll point you to the right next step.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 80 },
      {
        ref: "email",
        type: "email",
        title: "What's your work email?",
        description: "We'll only use it to follow up on this.",
        required: true,
        businessOnly: true,
      },
      { ref: "company", type: "short_text", title: "Where do you work?", required: false, maxLength: 120 },
      {
        ref: "team_size",
        type: "single_select",
        title: "How big is your team?",
        required: true,
        options: [{ label: "Just me" }, { label: "2–10" }, { label: "11–50" }, { label: "51–200" }, { label: "Over 200" }],
      },

      // Larger teams: the questions a rep would ask on the call
      {
        ref: "decision_role",
        type: "single_select",
        title: "What's your part in the decision?",
        required: true,
        options: [
          { label: "I decide" },
          { label: "I recommend, someone else signs" },
          { label: "I'm researching for someone else" },
        ],
      },
      {
        ref: "requirements",
        type: "multi_select",
        title: "Is there anything you'd need us to meet before you could buy?",
        required: false,
        minSelections: 0,
        maxSelections: 6,
        options: [
          { label: "Single sign-on" },
          { label: "A signed data processing agreement" },
          { label: "A security certification" },
          { label: "Data stored in a specific region" },
          { label: "A security review" },
          { label: "None of these" },
        ],
      },

      // Smaller teams
      {
        ref: "stage",
        type: "single_select",
        title: "Where are you up to?",
        required: false,
        options: [{ label: "Just looking around" }, { label: "Comparing a few options" }, { label: "Ready to start" }],
      },

      // Everyone
      {
        ref: "problem",
        type: "long_text",
        title: "What problem are you hoping we can solve?",
        required: true,
        maxLength: 800,
      },
      { ref: "current_tools", type: "short_text", title: "What are you using for it today?", required: false, maxLength: 200 },
      {
        ref: "referral",
        type: "dropdown",
        title: "How did you hear about us?",
        required: false,
        options: [
          { label: "A friend or colleague" },
          { label: "Search" },
          { label: "Social media" },
          { label: "An event" },
          { label: "A newsletter or podcast" },
          { label: "Somewhere else" },
        ],
      },
      {
        ref: "timeline",
        type: "single_select",
        title: "How soon are you looking to decide?",
        required: true,
        options: [
          { label: "This month" },
          { label: "This quarter" },
          { label: "Sometime this year" },
          { label: "Just researching" },
        ],
      },
    ],
    branches: [
      { when: "team_size", is: "Just me", then: "stage" },
      { when: "team_size", is: "2–10", then: "stage" },
      { when: "team_size", is: "11–50", then: "decision_role" },
      { when: "team_size", is: "51–200", then: "decision_role" },
      { when: "team_size", is: "Over 200", then: "decision_role" },
      { when: "requirements", always: true, then: "problem" },
      { when: "timeline", is: "This month", then: "end_sales" },
      { when: "timeline", is: "This quarter", then: "end_sales" },
    ],
    endings: [
      {
        ref: "end_sales",
        title: "We'll be in touch 🤝",
        body: "Someone from the team will reach out within one business day, with your answers already in front of them.",
      },
    ],
    ending: {
      title: "Thanks, talk soon",
      body: "The quickest way to see if we fit is to try it. We'll email you a link to get started, and you can reply to that email with any questions.",
    },
    guide: {
      questionsToConsider: [
        "What team size marks the point where a conversation with sales is worth more than a self-serve trial?",
        "Which buying requirements come up on nearly every larger deal? List those, and drop the rest.",
        "Should a personal email address be allowed, or do you only want work addresses?",
        "Which timeline answers should count as ready to talk, and who picks those leads up?",
      ],
      howToUseResponses:
        "Work the sales ending first: those leads told you they are deciding this month or this quarter, and a reply within a day matters more than a polished one. Read the problem in their own words before you call, and open with it. For everyone else, check the requirements and current tools answers every month; if the same gap keeps coming up, that is a product conversation, not a sales one.",
      customizeSteps: [
        "Edit the team size bands and the requirements list to match how your customers buy.",
        "Rewrite both endings with your real next step, such as the trial link or the name of whoever follows up.",
        "Embed the form on your pricing or contact page, then export leads to CSV or read them in the dashboard each morning.",
      ],
      faqs: [
        {
          q: "What should a lead capture form ask?",
          a: "Name, work email, company, team size, the problem they want solved and their timeline. Those six answers let you decide the next step without a discovery call.",
        },
        {
          q: "How many fields should a lead capture form have?",
          a: "As few as it takes to decide what happens next. This one asks each visitor nine or ten questions, and the extra ones only go to larger teams who expect a sales conversation.",
        },
        {
          q: "How does this form decide who goes to sales?",
          a: "The timeline answer does. Visitors deciding this month or this quarter reach an ending that promises a reply from sales, and everyone else is sent to a trial.",
        },
        {
          q: "Can I block personal email addresses?",
          a: "Yes. The email question accepts work addresses only, which you can switch off if individuals and freelancers are good customers for you.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "lead-qualification-form",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads"],
    roles: ["sales"],
    searchName: "Lead qualification form",
    title: "Lead qualification",
    icon: "Target",
    metaDescription:
      "Qualify leads before the first call: their goal, fit, budget, timing and who signs off. Buyers with a date get a call and early researchers a softer ending.",
    description: "Find out goal, fit, budget, timing and buying process before the first call.",
    blurb:
      "The questions a good sales rep asks in the first ten minutes, answered before the call is booked. Someone researching on behalf of another person is asked who actually decides. Anyone with a date in mind is promised a call within a business day, while people who are only exploring get a friendly nurture ending instead of a pushy follow-up.",
    tags: ["lead qualification form", "sales qualification", "BANT", "discovery questions", "branching"],
    greeting: "Thanks for reaching out. A few questions now means our first conversation can be about you, not a questionnaire.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should we speak to?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { ref: "company", type: "short_text", title: "Which company are you with?", required: true, maxLength: 120 },
      {
        ref: "company_size",
        type: "dropdown",
        title: "How many people work there?",
        required: true,
        options: [{ label: "1–10" }, { label: "11–50" }, { label: "51–250" }, { label: "251–1,000" }, { label: "More than 1,000" }],
      },
      {
        ref: "goal",
        type: "long_text",
        title: "What are you trying to achieve, and what happens if nothing changes?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Rank what matters most in the solution you choose",
        required: false,
        items: ["Price", "Speed of setup", "Ease of use for the team", "Support", "Room to grow"],
      },
      {
        ref: "current_solution",
        type: "single_select",
        title: "How do you handle this today?",
        required: true,
        allowOther: true,
        options: [
          { label: "Spreadsheets or by hand" },
          { label: "A tool we want to replace" },
          { label: "An in-house system" },
          { label: "We don't do it yet" },
        ],
      },
      {
        ref: "decision_role",
        type: "single_select",
        title: "What's your role in choosing a solution?",
        required: true,
        options: [
          { label: "I make the final call" },
          { label: "I'm part of a group that decides" },
          { label: "I'm gathering options for someone else" },
        ],
      },
      {
        ref: "decision_maker",
        type: "short_text",
        title: "Who will make the final decision? A name or job title is fine.",
        required: false,
        maxLength: 120,
      },
      {
        ref: "process",
        type: "multi_select",
        title: "What usually has to happen before you can buy?",
        required: false,
        minSelections: 0,
        maxSelections: 6,
        options: [
          { label: "A trial or pilot" },
          { label: "Sign-off from finance" },
          { label: "A security or IT review" },
          { label: "A legal review of the contract" },
          { label: "A formal proposal or tender" },
          { label: "Nothing formal" },
        ],
      },
      {
        ref: "budget",
        type: "single_select",
        title: "Is there budget set aside for this?",
        required: true,
        options: [
          { label: "Yes, it's approved" },
          { label: "We're working it out" },
          { label: "Not yet" },
        ],
      },
      {
        ref: "timeline",
        type: "single_select",
        title: "When would you want this in place?",
        required: true,
        options: [
          { label: "Within a month" },
          { label: "In one to three months" },
          { label: "Later this year" },
          { label: "No fixed date, just exploring" },
        ],
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Anything else we should know before we talk?",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "decision_role", is: "I make the final call", then: "process" },
      { when: "decision_role", is: "I'm part of a group that decides", then: "decision_maker" },
      { when: "decision_role", is: "I'm gathering options for someone else", then: "decision_maker" },
      { when: "timeline", is: "No fixed date, just exploring", then: "end_nurture" },
    ],
    endings: [
      {
        ref: "end_nurture",
        title: "Thanks, no pressure",
        body: "It sounds like you're still exploring, which is a good time to learn. We'll send a couple of useful resources, and when you're ready to talk, just reply.",
      },
    ],
    ending: {
      title: "Thanks, we'll be in touch 📞",
      body: "Someone who has read your answers will contact you within one business day to set up a conversation.",
    },
    guide: {
      questionsToConsider: [
        "Which answers make a lead worth a same-day call for your team? Write that rule down before the responses arrive.",
        "Do you need a budget question at all, or does company size tell you enough?",
        "Which buying steps, such as a security review, add weeks to your deals and should be spotted early?",
        "Who follows up with the explorers, and how often, so they are not forgotten?",
      ],
      howToUseResponses:
        "Sort by timeline and budget together: approved budget with a date inside three months is your call list for today. Before each call, read the goal answer and the ranking so you can open with what they care about most. When the person filling in the form does not make the final decision, ask on the call how to bring the decision maker in. Put the explorers on a slower email track and check back each quarter.",
      customizeSteps: [
        "Edit the company size bands, current solution options and buying steps to match your market.",
        "Change the timeline branch if you want later-this-year leads handled as explorers too.",
        "Link the form from your contact sales button or embed it on the page, and export qualified leads to CSV for your pipeline.",
      ],
      faqs: [
        {
          q: "What questions should a lead qualification form ask?",
          a: "Goal, company size, current solution, who decides, what the buying process involves, budget and timing. Together they tell you whether and how fast to follow up.",
        },
        {
          q: "Is this based on BANT?",
          a: "It covers budget, authority, need and timeline, and adds two things BANT leaves out: how they solve the problem today and what has to happen before they can buy.",
        },
        {
          q: "Won't asking about budget put people off?",
          a: "Asking whether budget exists, rather than how much, is easier to answer. The three choices let people say it's not set yet without feeling judged.",
        },
        {
          q: "What happens to leads who are just exploring?",
          a: "They reach a separate ending that offers resources rather than a sales call, so your team can focus on buyers with a date in mind.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-lead-form",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads"],
    roles: ["sales", "marketing"],
    searchName: "Customer lead form",
    title: "Customer lead",
    icon: "Inbox",
    metaDescription:
      "A short customer lead form for small businesses: what the person needs, their rough budget and timing, and how they'd like you to get back to them.",
    description: "Turn an interested visitor into a conversation, with the context to reply well.",
    blurb:
      "For the enquiry button on a small business website. It asks what someone needs in their own words, then the practical details that shape a good first reply: budget range, timing and the way they want to be contacted. People who would rather have a call are asked for a number and a good time, and nobody else is.",
    tags: ["customer lead form", "enquiry form", "small business leads", "sales enquiry", "branching"],
    greeting: "Hi there! Tell us a little about what you're after and we'll come back to you with something useful.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 80 },
      { ref: "email", type: "email", title: "What email should we reply to?", required: true },
      {
        ref: "interest",
        type: "single_select",
        title: "What are you interested in?",
        required: true,
        allowOther: true,
        options: [
          { label: "A product we sell" },
          { label: "A service we offer" },
          { label: "A custom project" },
          { label: "Just a question for now" },
        ],
      },
      {
        ref: "needs",
        type: "long_text",
        title: "In a few sentences, what do you need?",
        description: "Include anything that matters to you: sizes, quantities, deadlines, the problem you're trying to fix.",
        required: true,
        maxLength: 1200,
      },
      {
        ref: "budget",
        type: "dropdown",
        title: "Do you have a rough budget in mind?",
        required: false,
        options: [
          { label: "Under $500" },
          { label: "$500–$2,000" },
          { label: "$2,000–$10,000" },
          { label: "Over $10,000" },
          { label: "Not sure yet" },
        ],
      },
      {
        ref: "timing",
        type: "single_select",
        title: "When are you hoping to get started?",
        required: true,
        options: [
          { label: "As soon as possible" },
          { label: "In the next month" },
          { label: "In a few months" },
          { label: "No rush, just finding out" },
        ],
      },
      {
        ref: "contact_pref",
        type: "single_select",
        title: "How would you like us to get back to you?",
        required: true,
        options: [{ label: "Email is great" }, { label: "A phone call" }],
      },
      { ref: "phone", type: "phone", title: "What number should we call?", required: true },
      {
        ref: "call_time",
        type: "single_select",
        title: "When is a good time to call?",
        required: false,
        options: [{ label: "Morning" }, { label: "Afternoon" }, { label: "Evening" }, { label: "Any time" }],
      },
      {
        ref: "source",
        type: "dropdown",
        title: "How did you find us?",
        required: false,
        options: [
          { label: "Search" },
          { label: "Social media" },
          { label: "A friend or family member" },
          { label: "We've worked together before" },
          { label: "Somewhere else" },
        ],
      },
    ],
    branches: [{ when: "contact_pref", is: "Email is great", then: "source" }],
    ending: {
      title: "Thanks, we've got it 👋",
      body: "We'll get back to you within one business day, by email or phone as you asked, with an answer to what you described rather than a brochure.",
    },
    guide: {
      questionsToConsider: [
        "What do people usually enquire about? Replace the interest options with your real products or services.",
        "Do budget ranges help you reply, or would they scare off the customers you want?",
        "Who answers new enquiries, and how quickly can you honestly promise a reply?",
      ],
      howToUseResponses:
        "Reply in the order people said they want to start, and answer the needs question directly in your first message rather than sending a generic brochure. Call the people who asked for a call at the time they picked. Once a month, look at the source answers to see which channels bring enquiries that turn into work.",
      customizeSteps: [
        "Rewrite the interest options and the budget ranges for what you sell and who buys it.",
        "Change the ending to promise a reply time your team can keep.",
        "Put the link behind your contact or get a quote button, or embed the form on the page, and check new leads in the dashboard.",
      ],
      faqs: [
        {
          q: "What is a customer lead form?",
          a: "A short form on your website that collects someone's contact details and what they need, so you can follow up with a relevant reply instead of a cold one.",
        },
        {
          q: "What should a customer lead form include?",
          a: "A name, a reply address, what they are interested in, a description of their need and when they want to start. A budget range and contact preference help you reply well.",
        },
        {
          q: "Why ask how they want to be contacted?",
          a: "Some people never answer unknown numbers and some would rather talk than type. Asking means your first reply reaches them, and only people who want a call are asked for a phone number.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "free-giveaway-form",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads"],
    roles: ["marketing", "operations"],
    searchName: "Free giveaway form",
    title: "Free giveaway claim",
    icon: "Gift",
    metaDescription:
      "Hand out free samples, books or merch while stock lasts: one claim per person, then posted, collected or sent digitally, with newsletter consent kept separate.",
    description: "Let people claim a free item and choose how they receive it, one per person.",
    blurb:
      "For giveaways where everyone who asks gets something, not a prize draw: free samples, a book, a starter kit or event merch. Repeat claimers are stopped politely before they give an address, and the delivery choice decides the rest, so only people who want it posted are asked where they live. It closes by asking what they want to hear about, which turns a freebie into a lead you can follow up.",
    tags: ["free giveaway form", "freebie request form", "free sample form", "claim form", "lead magnet", "branching"],
    greeting:
      "Thanks for claiming your free gift! Tell us who you are and how you'd like to receive it, and we'll take care of the rest.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who's claiming?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "claimed_before",
        type: "yes_no",
        title: "Have you claimed this giveaway from us before?",
        description: "It's one per person, so there's enough to go round while stock lasts.",
        required: true,
      },
      {
        ref: "delivery",
        type: "single_select",
        title: "How would you like to get it?",
        required: true,
        options: [
          { label: "Post it to me" },
          { label: "I'll collect it in person" },
          { label: "Send me the digital version" },
        ],
      },

      // Posted
      {
        ref: "address",
        type: "address",
        title: "Where should we send it?",
        description: "We only use this to post your gift.",
        required: true,
        fields: ["street", "city", "state", "postal", "country"],
      },

      // Collected
      {
        ref: "pickup_day",
        type: "date",
        title: "Which day are you planning to come by?",
        description: "We'll have yours set aside with your name on it.",
        required: true,
        disablePast: true,
      },

      // Everyone
      {
        ref: "interests",
        type: "multi_select",
        title: "What would you like to hear from us about?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        allowOther: true,
        options: [
          { label: "New products" },
          { label: "Tips and how-tos" },
          { label: "Offers and discounts" },
          { label: "Events near me" },
          { label: "Nothing for now" },
        ],
      },
      {
        ref: "heard_from",
        type: "dropdown",
        title: "Where did you find out about the giveaway?",
        required: false,
        options: [
          { label: "Social media" },
          { label: "Our newsletter" },
          { label: "Our website" },
          { label: "In store or at an event" },
          { label: "A friend" },
          { label: "Somewhere else" },
        ],
      },
      {
        ref: "follow_up",
        type: "yes_no",
        title: "Could we ask what you thought of it in a couple of weeks?",
        required: true,
        yesLabel: "Sure",
        noLabel: "Rather not",
      },
      {
        ref: "newsletter",
        type: "legal_consent",
        title: "Newsletter",
        required: false,
        consentText:
          "Yes, add me to your newsletter. I can unsubscribe at any time, and leaving this unticked doesn't affect my free gift.",
      },
    ],
    branches: [
      { when: "claimed_before", is: true, then: "end_already" },
      { when: "delivery", is: "Post it to me", then: "address" },
      { when: "delivery", is: "I'll collect it in person", then: "pickup_day" },
      { when: "delivery", is: "Send me the digital version", then: "interests" },
      { when: "address", always: true, then: "interests" },
    ],
    endings: [
      {
        ref: "end_already",
        title: "You've already got one",
        body: "This giveaway is one per person, so we can't send another. Thanks for coming back, and keep an eye on our newsletter and socials for the next one.",
      },
    ],
    ending: {
      title: "It's yours 🎁",
      body: "We'll email you to confirm. Posted gifts usually go out within a few days, digital versions arrive by email, and collections are held under your name.",
    },
    guide: {
      questionsToConsider: [
        "Which delivery options can you really offer? Delete posting if you can't cover the cost, or collection if you have no shop or event.",
        "How many can you give away, and what will the form say when stock runs out?",
        "Do you need an eligibility rule, such as a minimum age or a list of countries you post to?",
        "What follow-up are you planning, and does the interests question offer exactly those topics?",
      ],
      howToUseResponses:
        "Export the claims to CSV each day and sort by delivery method: one list for the post, one for the collection desk sorted by day, one for the digital send. Remove duplicate email addresses before posting anything, since the one-per-person question relies on honesty. Only add people to your mailing list if they ticked the newsletter box, and use the interests answers to decide what your first email to them is about.",
      customizeSteps: [
        "Name the gift in the greeting and the ending, and remove any delivery option you don't offer.",
        "Limit the address question to the countries you post to, and edit the interests list to match what you send.",
        "Share the link in your post or embed the form on a landing page, then read new claims in the dashboard as they arrive.",
      ],
      faqs: [
        {
          q: "What is a free giveaway form?",
          a: "A form people fill in to claim something you are giving away, such as a free sample, a book or merchandise. Unlike a prize draw, everyone who is eligible receives one.",
        },
        {
          q: "What should a free giveaway form ask?",
          a: "A name and email, how the person wants to receive the item and an address only if you are posting it. A question about what they want to hear from you makes the giveaway useful for your marketing.",
        },
        {
          q: "How do I stop people claiming more than once?",
          a: "Ask whether they have claimed before, as this form does, and remove duplicate emails and addresses before you send anything.",
        },
        {
          q: "Can I make newsletter sign-up a condition of the giveaway?",
          a: "It is fairer and safer not to. This form keeps the newsletter as a separate, optional tick box, so your list is made of people who actually want to hear from you.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "kyc-form",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads", "onboard-clients"],
    roles: ["operations", "customer-success"],
    searchName: "KYC form",
    title: "KYC form",
    icon: "ShieldCheck",
    metaDescription:
      "Collect details for an initial know your customer review from individuals or businesses: identity, address, documents and source of funds, each with a reason.",
    description: "Gather identity, address and ownership details for an initial customer review.",
    blurb:
      "Individuals and businesses answer different questions, so a sole customer is never asked for a registration number and a company is asked who owns it. Each request says why it is needed, which makes people more willing to share. Anyone who says they hold a public position gets one extra question, and nobody else sees it.",
    tags: ["KYC form", "know your customer", "customer due diligence", "client onboarding", "identity verification"],
    greeting:
      "Before we can open your account we need to confirm a few details about you. It takes about five minutes, and it helps to have an ID and a recent bill or bank statement nearby.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Let's start with your contact details",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "customer_type",
        type: "single_select",
        title: "Are you applying as an individual or on behalf of a business?",
        required: true,
        options: [{ label: "As an individual" }, { label: "On behalf of a business" }],
      },

      // Individuals
      {
        ref: "dob",
        type: "date",
        title: "What is your date of birth?",
        description: "We use it together with your ID to confirm who you are.",
        required: true,
      },
      { ref: "nationality", type: "short_text", title: "What is your nationality?", required: true, maxLength: 80 },
      {
        ref: "id_type",
        type: "single_select",
        title: "Which photo ID will you upload?",
        required: true,
        options: [{ label: "Passport" }, { label: "National ID card" }, { label: "Driving licence" }],
      },
      {
        ref: "id_upload",
        type: "file_upload",
        title: "Upload a clear photo or scan of that ID",
        description: "All four corners visible, no glare, and not expired.",
        required: true,
        accept: ["image/jpeg", "image/png", "application/pdf"],
        maxFiles: 2,
        maxSizeMB: 10,
      },

      // Businesses
      { ref: "company_name", type: "short_text", title: "What is the business's registered name?", required: true, maxLength: 200 },
      {
        ref: "registration_number",
        type: "short_text",
        title: "What is its company registration number?",
        description: "This lets us look the business up in the official company register.",
        required: true,
        maxLength: 60,
      },
      {
        ref: "business_activity",
        type: "short_text",
        title: "What does the business do, in a few words?",
        required: true,
        maxLength: 200,
      },
      {
        ref: "applicant_role",
        type: "single_select",
        title: "What is your role in the business?",
        required: true,
        allowOther: true,
        options: [{ label: "Director" }, { label: "Owner or shareholder" }, { label: "Authorised employee" }],
      },
      {
        ref: "owners",
        type: "long_text",
        title: "Who owns or controls the business?",
        description: "List each person with a significant share or control, with their full name and roughly what they hold.",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "company_docs",
        type: "file_upload",
        title: "Upload the certificate of incorporation or a recent register extract",
        required: true,
        accept: ["application/pdf", "image/jpeg", "image/png"],
        maxFiles: 3,
        maxSizeMB: 10,
      },
      {
        ref: "business_ids",
        type: "file_upload",
        title: "Upload photo ID for yourself and for each owner you listed",
        description: "A passport, national ID card or driving licence for each person, with all four corners visible.",
        required: true,
        accept: ["image/jpeg", "image/png", "application/pdf"],
        maxFiles: 10,
        maxSizeMB: 10,
      },

      // Everyone
      {
        ref: "address",
        type: "address",
        title: "What is your residential or registered business address?",
        required: true,
        fields: ["street", "city", "state", "postal", "country"],
      },
      {
        ref: "address_proof",
        type: "file_upload",
        title: "Upload proof of that address",
        description: "A utility bill, bank statement or official letter from the last three months.",
        required: true,
        accept: ["application/pdf", "image/jpeg", "image/png"],
        maxFiles: 1,
        maxSizeMB: 10,
      },
      {
        ref: "source_of_funds",
        type: "multi_select",
        title: "Where will the money you use with us mainly come from?",
        description: "We ask everyone this, as part of checks against fraud and money laundering.",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        allowOther: true,
        options: [
          { label: "Salary or wages" },
          { label: "Business revenue" },
          { label: "Savings" },
          { label: "Investments" },
          { label: "Sale of property or assets" },
          { label: "Inheritance or gift" },
        ],
      },
      {
        ref: "expected_activity",
        type: "single_select",
        title: "Roughly how much do you expect to move through the account each month?",
        required: true,
        options: [
          { label: "Under $1,000" },
          { label: "$1,000–$10,000" },
          { label: "$10,000–$100,000" },
          { label: "Over $100,000" },
        ],
      },
      {
        ref: "pep",
        type: "yes_no",
        title: "Do you, or anyone connected to this application, hold, or have recently held, a prominent public position?",
        description: "For example a senior government, judicial or military role, or a close family member of someone who does.",
        required: true,
      },
      {
        ref: "pep_details",
        type: "long_text",
        title: "Please tell us who holds the position, what it is and when they held it",
        required: true,
        maxLength: 800,
      },
      {
        ref: "declaration",
        type: "legal_consent",
        title: "Declaration",
        required: true,
        consentText:
          "I confirm that the information and documents I have provided are true and complete. I understand they will be used to verify my identity and assess this application, and that I must tell you if any of it changes.",
      },
    ],
    branches: [
      { when: "customer_type", is: "As an individual", then: "dob" },
      { when: "customer_type", is: "On behalf of a business", then: "company_name" },
      { when: "id_upload", always: true, then: "address" },
      { when: "pep", is: false, then: "declaration" },
    ],
    ending: {
      title: "Thank you, we've received your details",
      body: "We'll review everything and contact you if we need anything else. You'll hear from us by email once the review is complete.",
    },
    guide: {
      questionsToConsider: [
        "Which checks does your organisation actually carry out, and which documents does each one need? Remove anything you won't review.",
        "Do you serve businesses, individuals or both? Delete the branch you don't need.",
        "At what ownership share does your process need someone named as an owner?",
        "Who reviews the answers, and how long can you keep the documents under your own policy?",
        "Does anything here need to be verified by a specialist provider rather than reviewed by a person?",
      ],
      howToUseResponses:
        "Review each submission against your own checklist: does the name on the ID match the contact details, is the proof of address recent, and does the stated activity fit the source of funds? Flag every application that answered yes to the public position question for a closer look. Record your decision and the reason outside the form, and delete documents you no longer need when your retention period ends.",
      customizeSteps: [
        "Edit the ID types, the list of documents and the activity bands to match your own checks and currency.",
        "Rewrite the declaration and the ending with your organisation's name and how long a review usually takes.",
        "Share the link with new customers after they sign up, and limit dashboard access to the people who carry out reviews.",
      ],
      faqs: [
        {
          q: "What information does a KYC form collect?",
          a: "Usually full name, date of birth, nationality, address, a photo ID, proof of address and where the customer's money comes from. Businesses also give registration details, who owns or controls them and ID for those people.",
        },
        {
          q: "Does this form verify identity automatically?",
          a: "No. It collects the information and documents so your team can review them. Automated identity checks, if your rules require them, are a separate step.",
        },
        {
          q: "What is a politically exposed person?",
          a: "Someone who holds or recently held a prominent public role, or a close family member or associate of such a person. Many checks treat them as higher risk, so the form asks everyone.",
        },
        {
          q: "Can I use the same KYC form for individuals and companies?",
          a: "Yes. The first choice routes individuals to identity questions and businesses to registration and ownership questions, then everyone answers the address, funds and declaration questions.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "product-recommendation-form",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads"],
    roles: ["sales", "customer-success"],
    searchName: "Product recommendation form",
    title: "Product recommendation",
    icon: "ShoppingBag",
    metaDescription:
      "Let shoppers tell you what they need: how they'll use it, what matters most, their budget and deadline, so your team can reply with a recommendation that fits.",
    description: "Learn what a shopper needs so your team can suggest the right product.",
    blurb:
      "The questions a good shop assistant asks, in the order they ask them. Intended use comes first, then a ranking of what matters most, so a tie between two products is easy to break. Gift buyers are asked who the gift is for and by when, and people who want a call rather than an email give a number, while everyone else skips it.",
    tags: ["product recommendation form", "personal shopper", "product finder", "gift recommendation", "branching"],
    greeting: "Not sure what to choose? Answer a few questions and one of our team will send you a personal recommendation.",
    questions: [
      {
        ref: "looking_for",
        type: "long_text",
        title: "What are you looking for?",
        description: "Rough is fine: a type of product, a problem you want solved or something you've seen.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "for_whom",
        type: "single_select",
        title: "Who is it for?",
        required: true,
        options: [{ label: "Me" }, { label: "Someone else, as a gift" }, { label: "My team or business" }],
      },

      // Gifts
      {
        ref: "recipient",
        type: "short_text",
        title: "Tell us a little about them: age, interests, anything they already have",
        required: true,
        maxLength: 300,
      },
      {
        ref: "needed_by",
        type: "date",
        title: "When do you need it by?",
        required: false,
        disablePast: true,
      },

      // Everyone
      {
        ref: "use",
        type: "multi_select",
        title: "How will it mostly be used?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        allowOther: true,
        options: [
          { label: "Every day" },
          { label: "Now and then" },
          { label: "Outdoors or on the move" },
          { label: "At home" },
          { label: "At work" },
        ],
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Put these in order of what matters most to you",
        required: true,
        items: ["Price", "Quality and durability", "Looks and design", "Ease of use", "Sustainability"],
      },
      {
        ref: "experience",
        type: "opinion_scale",
        title: "How familiar are you with this kind of product?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Complete beginner",
        labelHigh: "I know exactly what I want",
      },
      {
        ref: "budget",
        type: "number",
        title: "What's the most you'd like to spend?",
        required: false,
        min: 0,
        currency: "USD",
      },
      {
        ref: "avoid",
        type: "short_text",
        title: "Anything you definitely don't want? A brand, material, colour or size.",
        required: false,
        maxLength: 200,
      },
      { ref: "email", type: "email", title: "Where should we send your recommendation?", required: true },
      {
        ref: "call",
        type: "yes_no",
        title: "Would you like a quick call to talk it through as well?",
        required: true,
      },
      { ref: "phone", type: "phone", title: "What number should we call?", required: true },
    ],
    branches: [
      { when: "for_whom", is: "Me", then: "use" },
      { when: "for_whom", is: "My team or business", then: "use" },
      { when: "for_whom", is: "Someone else, as a gift", then: "recipient" },
      { when: "call", is: false, then: "end_thanks" },
    ],
    ending: {
      title: "Thanks, we're on it 🛍️",
      body: "Someone from our team will look at your answers and email you a recommendation, usually within one business day.",
    },
    guide: {
      questionsToConsider: [
        "Which products could you recommend? Make sure the use and priority options separate them from each other.",
        "Is budget a number people will happily give, or would ranges feel less exposing for your customers?",
        "Do you sell many gifts? If not, remove the gift branch.",
        "Who writes the recommendations, and how quickly can they reply?",
      ],
      howToUseResponses:
        "Start from the top-ranked priority, then use the budget to narrow the list, and name one clear pick with a short reason tied to their answers. Add a second option only when two products are genuinely close. Reply first to gift buyers with a near date. Every few weeks, look at which requests you could not fill well; they point at gaps in your range.",
      customizeSteps: [
        "Rewrite the use options, the ranking items and the currency to match what you sell.",
        "Edit the ending with the reply time your team can keep.",
        "Embed the form on product pages or share the link from your chat and social profiles, then answer requests from the dashboard.",
      ],
      faqs: [
        {
          q: "What should a product recommendation form ask?",
          a: "What the person is looking for, who it is for, how it will be used, what matters most, their budget and anything they want to avoid. Those answers are enough to suggest one good product.",
        },
        {
          q: "Is this a quiz that picks a product automatically?",
          a: "No. It collects needs so a person on your team can reply with a considered recommendation. If you want automatic results, a product recommendation quiz is the better fit.",
        },
        {
          q: "Why use a ranking question for priorities?",
          a: "Ask people to rate everything and they rate everything as important. Ranking forces a choice, which is exactly what you need to decide between two similar products.",
        },
      ],
    },
  }),
];
