import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_LEAD_GENERATION_2: TemplateSeed[] = [
  defineTemplate({
    slug: "data-capture-form",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads", "onboard-clients"],
    roles: ["operations", "marketing", "sales"],
    searchName: "Data capture form",
    title: "Contact data capture",
    icon: "ClipboardList",
    metaDescription:
      "Build a clean contact record for every person: name, organisation, sector, address, preferred channel and consent, plus a short path for people updating old details.",
    description: "One tidy contact record per person, whether they are new or updating details you hold.",
    blurb:
      "Made for keeping a contact list you can trust, not just catching a message. New contacts give a full record in fixed formats, while existing contacts say which email you had and what changed, so you can merge instead of duplicating. A phone number is asked only of people who prefer calls.",
    tags: ["data capture", "contact details form", "update your details", "customer record", "CRM data", "branching"],
    greeting: "Hi. This takes about two minutes and keeps the details we hold for you accurate.",
    questions: [
      {
        ref: "record_type",
        type: "single_select",
        title: "Are you new to us, or updating details we already have?",
        required: true,
        options: [{ label: "I'm new here" }, { label: "I'm updating my details" }],
      },

      // Updating an existing record
      {
        ref: "previous_email",
        type: "email",
        title: "Which email address did we have for you before?",
        description: "We use it to find your existing record, so nothing gets duplicated.",
        required: true,
      },
      {
        ref: "what_changed",
        type: "multi_select",
        title: "What has changed?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "My name" },
          { label: "My email" },
          { label: "My job or organisation" },
          { label: "My address" },
          { label: "How I'd like to be contacted" },
          { label: "Something else" },
        ],
      },

      // Everyone
      {
        ref: "contact",
        type: "contact_info",
        title: "What's your name and current email?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "organisation", type: "short_text", title: "Which organisation are you with, if any?", required: false, maxLength: 150 },
      { ref: "job_title", type: "short_text", title: "What's your job title?", required: false, maxLength: 120 },
      {
        ref: "sector",
        type: "dropdown",
        title: "Which sector do you work in?",
        required: false,
        options: [
          { label: "Retail and e-commerce" },
          { label: "Professional services" },
          { label: "Technology" },
          { label: "Health and care" },
          { label: "Education" },
          { label: "Manufacturing" },
          { label: "Charity or public sector" },
          { label: "Other" },
        ],
      },
      {
        ref: "org_size",
        type: "single_select",
        title: "How many people work there?",
        required: false,
        options: [{ label: "Just me" }, { label: "2–10" }, { label: "11–50" }, { label: "51–250" }, { label: "More than 250" }],
      },
      {
        ref: "address",
        type: "address",
        title: "What's your postal address?",
        description: "Needed if you'd like to hear from us by post. Otherwise you can leave it out.",
        required: false,
        fields: ["street", "city", "state", "postal", "country"],
      },
      {
        ref: "topics",
        type: "multi_select",
        title: "Which of these are relevant to you?",
        description: "Swap these for the lists or areas your team actually keeps.",
        required: false,
        minSelections: 0,
        maxSelections: 4,
        options: [{ label: "Product updates" }, { label: "Events" }, { label: "Guides and research" }, { label: "Offers" }],
      },
      {
        ref: "channel",
        type: "single_select",
        title: "How do you prefer to be contacted?",
        required: true,
        options: [{ label: "Email" }, { label: "Phone" }, { label: "Post" }],
      },
      { ref: "phone", type: "phone", title: "Which number should we use?", required: true },
      {
        ref: "consent",
        type: "legal_consent",
        title: "Keeping your details",
        required: true,
        consentText:
          "I agree that you can store these details to keep my contact record up to date. You will only use them for the purposes I picked, and I can ask you to correct or delete them at any time.",
      },
    ],
    branches: [
      { when: "record_type", is: "I'm new here", then: "contact" },
      { when: "record_type", is: "I'm updating my details", then: "previous_email" },
      { when: "channel", is: "Email", then: "consent" },
      { when: "channel", is: "Post", then: "consent" },
      { when: "channel", is: "Phone", then: "phone" },
    ],
    ending: {
      title: "Thanks, your details are saved",
      body: "We'll use them only in the ways you chose. If anything changes again, just fill this in once more.",
    },
    guide: {
      questionsToConsider: [
        "Which fields does your contact list or CRM already have, and does every question map to one of them?",
        "Which field will you match records on, and should it be required?",
        "Do you really need a postal address, or can it come out for contacts you only email?",
        "How long will you keep these records, and does the consent wording say so?",
      ],
      howToUseResponses:
        "Export the responses to CSV and filter by the first answer. New contacts can be imported as they are; updates should be matched on the previous email and merged into the existing record rather than added as a new row. Respect the channel each person chose: someone who picked post should not start getting calls. Before sharing the form widely, check a handful of responses in the dashboard for any field people filled in differently than you expected.",
      customizeSteps: [
        "Line up the questions with the columns in your contact list, and rename the sector and topic options to match the values you already use.",
        "Remove the address question if you never send post, and remove Post from the channel options with it.",
        "Share the link in a welcome email or embed it on your website, and rewrite the consent text to state how long you keep the data.",
      ],
      faqs: [
        {
          q: "What is a data capture form?",
          a: "A form that collects the same structured details from everyone who fills it in, so each submission becomes a usable record. It differs from a survey, which asks for opinions rather than facts.",
        },
        {
          q: "What should a data capture form include?",
          a: "The fields your record needs, a unique reference such as an email address, the person's contact preferences and a clear consent statement. Leave out anything that does not change what you do with the record.",
        },
        {
          q: "How do I avoid duplicate records?",
          a: "Pick one field to match on, usually the email address, and ask returning contacts for the one you already hold. This form does that on its update path, so you can merge instead of adding a second row.",
        },
        {
          q: "Do I need consent to store contact details?",
          a: "In many places, yes, especially if you plan to contact people later. Say what you store, why, and how to ask for changes or deletion, and check the rules that apply where you operate.",
        },
        {
          q: "How do I keep captured data consistent?",
          a: "Use choices and dropdowns wherever there is a fixed set of answers, and typed fields for emails, phone numbers and addresses. Free text makes records harder to sort and filter later.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "hotel-sales-lead-form",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads", "run-events"],
    roles: ["sales", "operations"],
    searchName: "Hotel sales lead form",
    title: "Hotel group and event enquiry",
    icon: "Hotel",
    metaDescription:
      "Collect group stay, meeting and wedding enquiries with dates, numbers, room needs and priorities, and spot the guests ready to book so sales can call them first.",
    description: "Group stays, meetings and weddings, each asked the details that decide availability.",
    blurb:
      "Built for a hotel sales team handling group business. A group stay goes straight to room counts, while meetings and weddings are asked about headcount, layout and event space first. Guests who say they are ready to book land on their own ending, so they can be called before the rest.",
    tags: ["hotel sales", "group booking enquiry", "event venue enquiry", "hospitality", "room block", "branching"],
    greeting: "Planning a group stay or an event with us? Tell us what you have in mind and we'll check availability.",
    questions: [
      { ref: "arrival", type: "date", title: "What is your arrival date, or the date the event starts?", required: true, disablePast: true },
      { ref: "nights", type: "number", title: "How many nights?", required: true, min: 0, max: 60, integerOnly: true },
      {
        ref: "flexible",
        type: "yes_no",
        title: "Could your dates move a little if it gets you a better rate or room?",
        required: true,
        yesLabel: "Yes, we're flexible",
        noLabel: "No, the dates are fixed",
      },
      {
        ref: "enquiry_type",
        type: "single_select",
        title: "What are you planning?",
        required: true,
        options: [{ label: "A group stay" }, { label: "A meeting or conference" }, { label: "A wedding or celebration" }],
      },

      // Meetings and weddings
      { ref: "guests", type: "number", title: "Roughly how many people will attend?", required: true, min: 1, max: 5000, integerOnly: true },
      {
        ref: "layout",
        type: "single_select",
        title: "How should the main room be set up?",
        required: true,
        options: [
          { label: "Theatre, rows of chairs" },
          { label: "Classroom, with tables" },
          { label: "Boardroom, one table" },
          { label: "Banquet, round tables" },
          { label: "Standing reception" },
          { label: "Not sure yet" },
        ],
      },
      {
        ref: "event_needs",
        type: "multi_select",
        title: "What else will the event need?",
        required: false,
        minSelections: 0,
        maxSelections: 7,
        options: [
          { label: "Breakout rooms" },
          { label: "Projector and screen" },
          { label: "Microphones and sound" },
          { label: "Coffee breaks" },
          { label: "Lunch or dinner" },
          { label: "A drinks reception" },
          { label: "Accessible access throughout" },
        ],
      },
      { ref: "needs_rooms", type: "yes_no", title: "Will any guests need bedrooms?", required: true },

      // Rooms
      { ref: "rooms", type: "number", title: "How many rooms per night, roughly?", required: true, min: 1, max: 1000, integerOnly: true },
      {
        ref: "room_mix",
        type: "multi_select",
        title: "Which room types do you need?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [{ label: "Single" }, { label: "Double" }, { label: "Twin" }, { label: "Suite" }, { label: "Accessible room" }],
      },

      // Everyone
      {
        ref: "priorities",
        type: "ranking",
        title: "Put these in order of what matters most to you.",
        required: true,
        items: ["Price", "Location", "Room quality", "Event space", "Food and drink", "Flexible cancellation"],
      },
      {
        ref: "budget",
        type: "short_text",
        title: "Do you have a budget in mind? A rough figure is fine.",
        required: false,
        maxLength: 120,
      },
      {
        ref: "requests",
        type: "long_text",
        title: "Anything else we should know, such as dietary needs, parking or dates you must avoid?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should our sales team contact?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { ref: "organisation", type: "short_text", title: "Is this for a company or organisation? If so, which one?", required: false, maxLength: 150 },
      {
        ref: "stage",
        type: "single_select",
        title: "Where are you in your planning?",
        required: true,
        options: [
          { label: "Ready to book if the proposal fits" },
          { label: "Comparing a few venues" },
          { label: "Early research" },
        ],
      },
    ],
    branches: [
      { when: "enquiry_type", is: "A group stay", then: "rooms" },
      { when: "enquiry_type", is: "A meeting or conference", then: "guests" },
      { when: "enquiry_type", is: "A wedding or celebration", then: "guests" },
      { when: "needs_rooms", is: true, then: "rooms" },
      { when: "needs_rooms", is: false, then: "priorities" },
      { when: "stage", is: "Ready to book if the proposal fits", then: "end_ready" },
    ],
    endings: [
      {
        ref: "end_ready",
        title: "We'll move quickly on this 🛎️",
        body: "A member of our sales team will call you within one working day with availability and a proposal.",
      },
    ],
    ending: {
      title: "Thanks, your enquiry is with our sales team",
      body: "We'll check availability for your dates and email you a proposal within two working days.",
    },
    guide: {
      questionsToConsider: [
        "What is the smallest group you take through sales rather than the public booking page?",
        "Which room layouts and event spaces can your property actually offer, and at what capacity?",
        "Do you want a budget figure up front, or would you rather propose first and talk price after?",
        "Who calls the guests who say they are ready to book, and how fast?",
      ],
      howToUseResponses:
        "Check the arrival date, nights and room count against your inventory before anything else, since those decide whether you can quote at all. Flexible guests are the ones to offer a shoulder date or a better rate. The ranking tells you what to lead the proposal with: a group that ranked price first wants a clear rate, while one that ranked event space first wants floor plans. Call the ready-to-book enquiries first.",
      customizeSteps: [
        "Edit the layout and event needs lists to match your function rooms, and remove anything your property cannot provide.",
        "Change the ready-to-book ending to name your real response time, and route it to whoever owns hot enquiries.",
        "Embed the form on your groups and events page, then export the responses to CSV each week to review conversion by enquiry type.",
      ],
      faqs: [
        {
          q: "What should a hotel group booking enquiry form ask?",
          a: "Dates, number of nights, room count and room types, plus headcount and layout for any event. Asking whether the dates are flexible helps you offer options when the first choice is full.",
        },
        {
          q: "Does submitting this form confirm a booking?",
          a: "No. It gathers what your sales team needs to check availability and send a proposal. Confirm the reservation through your usual booking process.",
        },
        {
          q: "Should a hotel lead form ask for a budget?",
          a: "It helps, but keep it optional. Many planners do not know the figure until they see a proposal, and a required budget field makes some of them leave.",
        },
        {
          q: "Can I use one form for groups, meetings and weddings?",
          a: "Yes. This form asks what they are planning, then shows only the follow-ups that apply, so a wedding planner never sees questions about classroom seating.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "prospective-client-form",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads", "onboard-clients"],
    roles: ["freelancers-agencies", "sales"],
    searchName: "Prospective client form",
    title: "Prospective client",
    icon: "Handshake",
    metaDescription:
      "Learn a prospective client's goal, what they have tried, their timing and budget before the first call, and let people who prefer email skip the phone questions.",
    description: "Understand a potential client's need, history and timing before you talk.",
    blurb:
      "Written for consultants, coaches and small agencies who want the first conversation to be useful. People who have tried to fix the problem before are asked what happened, and anyone who would rather not talk on the phone gets a reply by email instead of a call request.",
    tags: ["prospective client", "client inquiry", "discovery call", "consultant", "new client", "branching"],
    greeting: "Thanks for thinking of us. A few questions now means our first conversation can get straight to the useful part.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Let's start with your name and email.",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "Which company or project is this for?", required: false, maxLength: 150 },
      {
        ref: "help_with",
        type: "long_text",
        title: "What would you like help with?",
        description: "A few sentences in your own words is perfect.",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "tried_before",
        type: "single_select",
        title: "Have you tried to tackle this before?",
        required: true,
        options: [
          { label: "No, this is new" },
          { label: "Yes, we tried it ourselves" },
          { label: "Yes, with another provider" },
        ],
      },
      {
        ref: "what_happened",
        type: "long_text",
        title: "What happened, and what is still not working?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "success",
        type: "long_text",
        title: "If this goes well, what will be different for you?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "urgency",
        type: "opinion_scale",
        title: "How pressing is this right now?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Nice to have",
        labelHigh: "Urgent",
      },
      {
        ref: "start",
        type: "single_select",
        title: "When would you like to start?",
        required: true,
        options: [
          { label: "As soon as possible" },
          { label: "Within the next month" },
          { label: "In two to three months" },
          { label: "Just exploring for now" },
        ],
      },
      {
        ref: "budget",
        type: "single_select",
        title: "Where are you with budget?",
        required: true,
        options: [
          { label: "A budget is approved" },
          { label: "I have a rough figure in mind" },
          { label: "Not decided yet" },
        ],
      },
      {
        ref: "deciders",
        type: "single_select",
        title: "Who else will be involved in choosing someone?",
        required: false,
        options: [{ label: "Just me" }, { label: "Me and a partner or colleague" }, { label: "A team or board" }],
      },
      {
        ref: "source",
        type: "dropdown",
        title: "How did you find us?",
        required: false,
        options: [
          { label: "A referral" },
          { label: "Search engine" },
          { label: "Social media" },
          { label: "An article or podcast" },
          { label: "Other" },
        ],
      },
      {
        ref: "call",
        type: "yes_no",
        title: "Would you like a short call to talk it through?",
        required: true,
        yesLabel: "Yes, let's talk",
        noLabel: "Email is better for me",
      },
      { ref: "phone", type: "phone", title: "What's the best number to reach you on?", required: true },
      {
        ref: "best_time",
        type: "multi_select",
        title: "When are you usually free for a call?",
        required: false,
        minSelections: 0,
        maxSelections: 3,
        options: [{ label: "Mornings" }, { label: "Afternoons" }, { label: "Early evenings" }],
      },
    ],
    branches: [
      { when: "tried_before", is: "No, this is new", then: "success" },
      { when: "tried_before", is: "Yes, we tried it ourselves", then: "what_happened" },
      { when: "tried_before", is: "Yes, with another provider", then: "what_happened" },
      { when: "call", is: false, then: "end_email" },
      { when: "call", is: true, then: "phone" },
    ],
    endings: [
      {
        ref: "end_email",
        title: "Thanks, we'll reply by email ✉️",
        body: "We'll read your answers properly and write back within two working days, including whether we think we're the right fit.",
      },
    ],
    ending: {
      title: "Thanks, talk soon",
      body: "We'll call you within two working days, at one of the times you picked if you gave any. Your answers will be in front of us when we do.",
    },
    guide: {
      questionsToConsider: [
        "What do you need to know to decide whether a prospect is a fit before you spend time on a call?",
        "Is budget a question you want answered now, or one you would rather raise in conversation?",
        "What would make you refer someone elsewhere, and does the form surface it?",
        "Do you offer calls at set times, and should the time options reflect that?",
      ],
      howToUseResponses:
        "Read the answer about what they tried before first. It tells you what the prospect is wary of and what not to suggest again. Pair the urgency score with the start date: urgent and starting soon means reply today, exploring with no budget means a helpful email and a gentle check-in later. Be honest in your reply when the fit is poor, and suggest someone better placed if you can.",
      customizeSteps: [
        "Rewrite the greeting and the first open question around the service you actually offer.",
        "Adjust the start and budget options to match how you work, for example retainers versus one-off projects.",
        "Link the form from your website's contact or work-with-me page, and check new responses in the dashboard daily so fast movers hear back quickly.",
      ],
      faqs: [
        {
          q: "What questions should I ask a prospective client?",
          a: "What they want help with, what they have already tried, what success looks like, when they want to start and who else is involved in the decision. Those answers tell you whether to book a call and what to prepare.",
        },
        {
          q: "How is a prospective client form different from a client intake form?",
          a: "A prospective client form comes before you agree to work together and helps you judge fit. An intake form comes after, and collects the details you need to start the work.",
        },
        {
          q: "Should I ask about budget before the first call?",
          a: "A light question helps, as long as people can say they have not decided yet. It lets you prepare the right options without scaring off someone still exploring.",
        },
        {
          q: "Can prospects skip the phone call?",
          a: "Yes. In this form, anyone who prefers email skips the phone questions and sees an ending that promises an email reply instead.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "website-design-quote-form",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads", "onboard-clients"],
    roles: ["freelancers-agencies", "sales"],
    searchName: "Website design quote form",
    title: "Website design quote",
    icon: "Laptop",
    metaDescription:
      "Scope a website project before you price it: goal, pages, features, content, brand files and launch date, with extra questions for redesigns and online shops.",
    description: "Gather the pages, features and content a web design quote depends on.",
    blurb:
      "Asks the questions that actually move a website price. A redesign is asked for the current site and what is wrong with it, an online shop is asked how many products it will sell, and everyone is asked about pages, features and whether the content is ready, which is where most projects slip.",
    tags: ["website design quote", "web design inquiry", "website project brief", "web agency", "freelance web designer", "branching"],
    greeting: "Thinking about a new website? Tell us about the project and we'll come back with a proposal.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who are we putting the quote together for?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "business",
        type: "long_text",
        title: "Tell us about your business in a sentence or two.",
        required: true,
        maxLength: 600,
      },
      {
        ref: "project_type",
        type: "single_select",
        title: "What kind of project is it?",
        required: true,
        options: [{ label: "A brand new website" }, { label: "A redesign of our current site" }, { label: "An online shop" }],
      },

      // Redesigns
      { ref: "current_url", type: "url", title: "What's the address of your current site?", required: true },
      {
        ref: "whats_wrong",
        type: "multi_select",
        title: "What's not working about it?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "It looks dated" },
          { label: "It's hard for us to update" },
          { label: "It loads slowly" },
          { label: "It doesn't work well on phones" },
          { label: "It doesn't bring in enquiries or sales" },
          { label: "Something else" },
        ],
      },

      // Online shops
      {
        ref: "product_count",
        type: "single_select",
        title: "Roughly how many products will you sell?",
        required: true,
        options: [{ label: "Under 20" }, { label: "20–100" }, { label: "100–1,000" }, { label: "More than 1,000" }],
      },

      // Everyone
      {
        ref: "site_goal",
        type: "single_select",
        title: "What's the main thing a visitor should do on the site?",
        required: true,
        options: [
          { label: "Contact us or ask for a quote" },
          { label: "Book an appointment" },
          { label: "Buy something" },
          { label: "Read and learn about us" },
          { label: "Sign up or create an account" },
        ],
      },
      {
        ref: "pages",
        type: "multi_select",
        title: "Which pages do you expect to need?",
        required: true,
        minSelections: 1,
        maxSelections: 10,
        options: [
          { label: "Home" },
          { label: "About" },
          { label: "Services" },
          { label: "Portfolio or case studies" },
          { label: "Blog or news" },
          { label: "Shop and product pages" },
          { label: "Pricing" },
          { label: "FAQ" },
          { label: "Contact" },
          { label: "Careers" },
        ],
      },
      {
        ref: "features",
        type: "multi_select",
        title: "Any of these features?",
        required: false,
        minSelections: 0,
        maxSelections: 8,
        options: [
          { label: "Online booking" },
          { label: "Newsletter signup" },
          { label: "Member login area" },
          { label: "More than one language" },
          { label: "Site search" },
          { label: "Events calendar" },
          { label: "None of these" },
        ],
      },
      {
        ref: "content_ready",
        type: "single_select",
        title: "Who's providing the words and photos?",
        required: true,
        options: [
          { label: "We have them ready" },
          { label: "We have some, and need help with the rest" },
          { label: "We need you to create them" },
        ],
      },
      { ref: "has_brand", type: "yes_no", title: "Do you already have a logo and brand colours?", required: true },
      {
        ref: "brand_files",
        type: "file_upload",
        title: "Upload a logo, brand guide or brief if you have one.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
        maxSizeMB: 20,
      },
      {
        ref: "examples",
        type: "long_text",
        title: "Are there sites you like? Paste links and tell us what you like about them.",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "domain",
        type: "yes_no",
        title: "Do you already own a domain name for the site?",
        required: false,
        yesLabel: "Yes, we have one",
        noLabel: "Not yet",
      },
      { ref: "launch", type: "date", title: "When would you like the site to go live?", required: false, disablePast: true },
      {
        ref: "budget",
        type: "short_text",
        title: "Do you have a budget range in mind?",
        description: "It helps us suggest the right scope. Leave blank if you're unsure.",
        required: false,
        maxLength: 120,
      },
      {
        ref: "aftercare",
        type: "yes_no",
        title: "Will you want help looking after the site once it's live?",
        required: false,
      },
    ],
    branches: [
      { when: "project_type", is: "A brand new website", then: "site_goal" },
      { when: "project_type", is: "A redesign of our current site", then: "current_url" },
      { when: "project_type", is: "An online shop", then: "product_count" },
      { when: "whats_wrong", always: true, then: "site_goal" },
      { when: "has_brand", is: true, then: "brand_files" },
      { when: "has_brand", is: false, then: "examples" },
    ],
    ending: {
      title: "Thanks, we have what we need 🖥️",
      body: "We'll review your answers and send a proposal within three working days. If anything is unclear, we'll ask before we price it.",
    },
    guide: {
      questionsToConsider: [
        "Which answers change your price the most, such as page count, a shop or content writing?",
        "Do you sell aftercare or hosting, and should the form ask about it?",
        "Would you rather see a budget range up front, or propose tiers and let the client choose?",
        "What files do you need before you can start, and is it worth asking for them now?",
      ],
      howToUseResponses:
        "Start with the project type and the content answer, because a shop or a client who needs copywriting changes the scope more than the page count does. Use the list of what is wrong with a current site to open your proposal: it shows you listened. If the launch date is close and the content is not ready, say so in the quote and price the risk rather than finding out halfway through.",
      customizeSteps: [
        "Edit the pages and features lists to match what you build, and remove anything you do not offer.",
        "Add a line to the budget question about how you price, for example fixed packages or day rates.",
        "Embed the form on your pricing or contact page, and export responses to CSV if you track proposals in a spreadsheet.",
      ],
      faqs: [
        {
          q: "What should a website design quote form include?",
          a: "The site's main goal, the pages and features needed, who supplies the content, brand assets, examples the client likes and a target launch date. Redesigns also need the current address and what is wrong with it.",
        },
        {
          q: "Should I ask clients for a budget on a web design form?",
          a: "Yes, but keep it optional. A range helps you suggest the right scope, and clients who are unsure can still send the rest of the brief.",
        },
        {
          q: "Can clients upload their logo and brief through the form?",
          a: "Yes. Clients who say they already have a brand are asked to upload a logo, brand guide or brief, which saves an email back and forth.",
        },
        {
          q: "Is a quote request the same as agreeing to a project?",
          a: "No. It gives you enough to prepare a proposal. Scope, price and timings are agreed afterwards through your usual contract.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "demo-request",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads"],
    roles: ["sales", "marketing"],
    searchName: "Demo request form",
    title: "Demo request",
    icon: "MonitorPlay",
    metaDescription:
      "Qualify demo requests by company size, role and timeline, and learn what each prospect wants to see, whether integrations, security or a migration.",
    description: "Take a demo request and learn exactly what to show before the call.",
    blurb:
      "Half of a good demo is knowing what to skip. This asks what the prospect most wants to see, and each answer opens the one follow-up that makes the demo specific: which tools it must connect to, which compliance rules apply, or what they are moving off. Prospects who want to go live this month land on their own ending so sales can call them first.",
    tags: ["demo request", "book a demo", "sales demo", "lead qualification", "SaaS sales", "branching"],
    greeting: "Let's set up your demo. Two minutes of questions so we can show you what matters and skip what doesn't.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should we be speaking to?",
        required: true,
        fields: ["first_name", "last_name", "email"],
        fieldOptions: { email: { businessOnly: true } },
      },
      { ref: "company", type: "short_text", title: "Which company are you with?", required: true, maxLength: 150 },
      {
        ref: "company_size",
        type: "single_select",
        title: "How many people work there?",
        required: true,
        options: [{ label: "1–10" }, { label: "11–50" }, { label: "51–200" }, { label: "201–1,000" }, { label: "More than 1,000" }],
      },
      {
        ref: "decision_role",
        type: "single_select",
        title: "What's your part in the decision?",
        required: true,
        options: [{ label: "I make the call" }, { label: "I recommend to whoever does" }, { label: "I'm researching for someone else" }],
      },
      {
        ref: "demo_focus",
        type: "single_select",
        title: "What would you most like to see?",
        description: "Pick the one that matters most. We'll cover the rest if there's time.",
        required: true,
        options: [
          { label: "The basics, end to end" },
          { label: "How it connects to our tools" },
          { label: "Security and compliance" },
          { label: "Moving over from what we use now" },
        ],
      },

      // Integrations
      {
        ref: "stack",
        type: "multi_select",
        title: "What does it need to work with?",
        required: true,
        minSelections: 1,
        maxSelections: 7,
        options: [
          { label: "Our CRM" },
          { label: "Team chat" },
          { label: "Email and calendar" },
          { label: "Docs and wikis" },
          { label: "Automation tools" },
          { label: "Our own systems, through an API" },
          { label: "Something else" },
        ],
      },

      // Security
      {
        ref: "compliance",
        type: "multi_select",
        title: "Which of these will you be held to?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "SOC 2" },
          { label: "ISO 27001" },
          { label: "GDPR" },
          { label: "HIPAA" },
          { label: "An internal security review" },
          { label: "Not sure yet" },
        ],
      },
      { ref: "security_contact", type: "short_text", title: "Who runs the security review on your side?", required: false, maxLength: 150 },

      // Migration
      { ref: "migrating_from", type: "short_text", title: "What are you moving off?", required: true, maxLength: 150 },
      {
        ref: "migration_volume",
        type: "single_select",
        title: "Roughly how much data would come with you?",
        required: false,
        options: [{ label: "A handful of records" }, { label: "Hundreds" }, { label: "Thousands" }, { label: "Millions" }],
      },

      // Everyone
      {
        ref: "pain",
        type: "long_text",
        title: "What's prompting the search right now?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Anything the demo should definitely cover?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "timeline",
        type: "single_select",
        title: "When would you want this live?",
        required: true,
        options: [{ label: "This month" }, { label: "This quarter" }, { label: "Later this year" }, { label: "No date yet" }],
      },
    ],
    branches: [
      { when: "demo_focus", is: "The basics, end to end", then: "pain" },
      { when: "demo_focus", is: "How it connects to our tools", then: "stack" },
      { when: "demo_focus", is: "Security and compliance", then: "compliance" },
      { when: "demo_focus", is: "Moving over from what we use now", then: "migrating_from" },
      { when: "stack", always: true, then: "pain" },
      { when: "security_contact", always: true, then: "pain" },
      { when: "timeline", is: "This month", then: "end_priority" },
    ],
    endings: [
      {
        ref: "end_priority",
        title: "You're at the front of the queue 🚀",
        body: "Since you're aiming to go live this month, someone from our team will contact you within a few working hours to book the demo.",
      },
    ],
    ending: {
      title: "Thanks, we'll set up your demo",
      body: "We'll email you within one working day to find a time. Your answers will be open on the call.",
    },
    guide: {
      questionsToConsider: [
        "Which parts of your product do prospects most often ask to see, and do the demo focus options match them?",
        "Do you want to accept personal email addresses, or only work ones?",
        "Which company sizes or timelines should go to a senior rep rather than the general queue?",
        "Who calls the prospects who want to go live this month, and within how many hours?",
      ],
      howToUseResponses:
        "Before each demo, read the focus answer and its follow-up, then cut the script to fit: an integrations prospect wants to see their tools connected, not a tour of settings. Use company size and decision role to decide who takes the call and whether to invite a solutions engineer. Anyone who picked this month should hear from you the same day, while prospects with no date yet can get a shorter demo and a follow-up plan.",
      customizeSteps: [
        "Replace the integration and compliance options with the ones your product really supports, and delete any focus you would never demo.",
        "Rewrite the priority ending with your real response time, and share it only if your team can keep that promise.",
        "Embed the form on your book-a-demo page and check the dashboard each morning, sorting by timeline so urgent prospects come first.",
      ],
      faqs: [
        {
          q: "What should a demo request form ask?",
          a: "Name, work email, company, company size, the person's role in the decision, what they want to see and their timeline. Anything beyond that should earn its place by changing how you run the demo.",
        },
        {
          q: "How many fields should a demo request form have?",
          a: "As few as you can use. This one asks everyone eight questions, and only the prospects who pick a specific focus see the extra follow-up for it.",
        },
        {
          q: "Should a demo form require a work email?",
          a: "It filters out many students and competitors, but it also turns away some genuine buyers at small firms. This template requires one; switch it off in the contact question if your buyers often use personal addresses.",
        },
        {
          q: "How fast should sales follow up on a demo request?",
          a: "As fast as you reasonably can, ideally the same working day. Interest fades quickly, which is why this form sends the most urgent prospects to their own ending.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "content-download",
    type: "form",
    category: "lead-generation",
    goals: ["generate-leads"],
    roles: ["marketing", "sales"],
    searchName: "Gated content form",
    title: "Content download",
    icon: "Download",
    metaDescription:
      "Gate an ebook, guide or report with a short form. Everyone gets the download fast, and only readers researching a purchase are asked if they want a conversation.",
    description: "Gate a guide without making it feel like a toll booth.",
    blurb:
      "Every extra field costs downloads, so the essentials come first and the rest depends on why someone came. Readers researching a purchase are asked about timing and whether they want to talk, which sends them to their own ending, while people who are just learning get their guide and are left alone.",
    tags: ["gated content", "lead magnet", "ebook download", "content marketing", "whitepaper", "branching"],
    greeting: "Your guide is nearly ready. Tell us where to send it.",
    questions: [
      { ref: "email", type: "email", title: "What's your work email?", required: true, businessOnly: true },
      { ref: "name", type: "short_text", title: "And your first name?", required: true, maxLength: 80 },
      { ref: "company", type: "short_text", title: "Which company are you with?", required: false, maxLength: 150 },
      {
        ref: "role",
        type: "dropdown",
        title: "Which best describes your role?",
        required: false,
        options: [
          { label: "Founder or owner" },
          { label: "Manager or team lead" },
          { label: "Individual contributor" },
          { label: "Consultant or agency" },
          { label: "Student" },
          { label: "Other" },
        ],
      },
      {
        ref: "interest",
        type: "single_select",
        title: "What brought you to this guide?",
        required: true,
        options: [
          { label: "Researching a purchase" },
          { label: "Solving a specific problem" },
          { label: "General learning" },
        ],
      },

      // Researching a purchase
      {
        ref: "buying_timeline",
        type: "single_select",
        title: "How soon would you want something in place?",
        required: false,
        options: [{ label: "This month" }, { label: "This quarter" }, { label: "Later this year" }, { label: "No date yet" }],
      },
      {
        ref: "wants_call",
        type: "yes_no",
        title: "Would you like someone to walk you through it?",
        required: true,
        yesLabel: "Yes, get in touch",
        noLabel: "No thanks, just the guide",
      },

      // Solving a specific problem
      {
        ref: "the_problem",
        type: "long_text",
        title: "What are you trying to fix?",
        description: "If the guide doesn't answer it, we'll send something that does.",
        required: false,
        maxLength: 600,
      },

      // General learning
      {
        ref: "learning_focus",
        type: "single_select",
        title: "Which part are you most curious about?",
        required: false,
        options: [
          { label: "How it works" },
          { label: "What it costs to run" },
          { label: "How other teams use it" },
          { label: "All of it, really" },
        ],
      },

      // Everyone who didn't ask for a call
      {
        ref: "consent",
        type: "legal_consent",
        title: "Staying in touch",
        required: false,
        consentText: "Send me related guides and resources now and then. I can unsubscribe at any time.",
        allowDecline: true,
        agreeLabel: "Yes, send them",
        declineLabel: "No thanks",
      },
    ],
    branches: [
      { when: "interest", is: "Researching a purchase", then: "buying_timeline" },
      { when: "interest", is: "Solving a specific problem", then: "the_problem" },
      { when: "interest", is: "General learning", then: "learning_focus" },
      { when: "wants_call", is: true, then: "end_contact" },
      { when: "wants_call", is: false, then: "consent" },
      { when: "the_problem", always: true, then: "consent" },
    ],
    endings: [
      {
        ref: "end_contact",
        title: "Guide sent, and we'll be in touch 📄",
        body: "Check your inbox for the download. Someone who knows this subject well will email you within a working day.",
      },
    ],
    ending: { title: "On its way 📄", body: "Check your inbox. The guide should arrive within a minute." },
    guide: {
      questionsToConsider: [
        "Which fields do you truly need before handing over the file, and which could you learn later?",
        "Is a work email worth the downloads it will cost you, given who reads this guide?",
        "What happens to someone who asks for a call, and who owns that reply?",
        "Does the consent wording match what you will actually send?",
      ],
      howToUseResponses:
        "Sort responses by the reason people gave. Readers researching a purchase who asked for a call are sales conversations, so pass them on the same day with their timeline. The problems people describe are a list of topics for your next guide, and the learning focus answers show which part of the subject pulls readers in. Only email people who agreed to hear more.",
      customizeSteps: [
        "Change the greeting and endings to name the guide, and add its download link to both endings or send it from your own email as responses come in.",
        "Decide whether to keep the work email rule, and trim the role list to the people you write for.",
        "Embed the form on the landing page for the guide, and export the responses to CSV to see which reasons bring in the most readers.",
      ],
      faqs: [
        {
          q: "What is gated content?",
          a: "Content such as an ebook, report or checklist that visitors get in exchange for filling in a short form. It is a common way to turn readers into leads.",
        },
        {
          q: "How many fields should a gated content form have?",
          a: "As few as you can manage. An email and a name are often enough, and every extra required field loses some readers, so this form keeps the qualifying questions to the people who are researching a purchase.",
        },
        {
          q: "Should I ask for a work email to download content?",
          a: "It helps if you sell to businesses and want better leads, but it costs downloads from freelancers and students. Turn it off in the email question if reach matters more than qualification.",
        },
        {
          q: "Do people who download content consent to marketing emails?",
          a: "Not automatically. This form asks separately and lets people say no, so you only email readers who agreed.",
        },
      ],
    },
  }),
];
