import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_MARKETING: TemplateSeed[] = [
  defineTemplate({
    slug: "client-intake",
    type: "form",
    category: "marketing",
    goals: ["onboard-clients", "generate-leads"],
    roles: ["freelancers-agencies", "operations"],
    searchName: "Client intake form",
    title: "New client intake",
    icon: "ClipboardList",
    metaDescription:
      "Collect a new client's details, background and goals before the first session. Projects, retainers and second opinions each get their own follow-up questions.",
    description: "Everything you need before the first client session, asked in the right order.",
    blurb:
      "Replaces the intake PDF nobody fills in. What someone is here for decides what they are asked next: a one-off project gets scope, deadline and budget, an ongoing engagement gets cadence and decision-makers, and a second opinion gets asked what was said the first time. Everyone ends on the same background, goals and terms.",
    tags: ["client intake", "new client questionnaire", "agency onboarding", "consultant intake", "branching"],
    greeting: "Welcome! A few questions now means we can spend our first session on the real work.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, your details",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { ref: "organisation", type: "short_text", title: "Which organisation are you with, if any?", required: false, maxLength: 150 },
      {
        ref: "service",
        type: "single_select",
        title: "What are you here for?",
        required: true,
        options: [
          { label: "An initial consultation", description: "You want to talk it through before committing" },
          { label: "A one-off project", description: "A defined piece of work with an end date" },
          { label: "An ongoing engagement", description: "Regular support over months" },
          { label: "A second opinion", description: "You already have advice and want it checked" },
        ],
      },

      // Initial consultation
      {
        ref: "consult_topic",
        type: "short_text",
        title: "What's the one thing you most want to walk away with?",
        required: true,
        maxLength: 300,
      },

      // One-off project
      {
        ref: "project_scope",
        type: "long_text",
        title: "What needs to be delivered?",
        description: "A rough list is fine. We'll shape it together.",
        required: true,
        maxLength: 1500,
      },
      { ref: "project_deadline", type: "date", title: "Is there a date it has to be done by?", required: false, disablePast: true },
      {
        ref: "project_budget",
        type: "single_select",
        title: "What budget are you working with?",
        description: "A range is fine. It tells us what's realistic before we spend your time.",
        required: true,
        options: [
          { label: "Under $5k" },
          { label: "$5k–$15k" },
          { label: "$15k–$50k" },
          { label: "$50k+" },
          { label: "I'd rather you suggest" },
        ],
      },

      // Ongoing engagement
      {
        ref: "ongoing_cadence",
        type: "single_select",
        title: "How often would we work together?",
        required: true,
        options: [{ label: "Weekly" }, { label: "Fortnightly" }, { label: "Monthly" }, { label: "As needed" }],
      },
      {
        ref: "ongoing_stakeholders",
        type: "short_text",
        title: "Who else would be involved, and who signs things off?",
        required: false,
        maxLength: 300,
      },

      // Second opinion
      {
        ref: "prior_advice",
        type: "long_text",
        title: "What were you told, and by whom?",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "prior_doubt",
        type: "short_text",
        title: "What about it didn't sit right?",
        required: false,
        maxLength: 300,
      },

      // Everyone
      {
        ref: "background",
        type: "long_text",
        title: "Tell us the background in your own words",
        required: true,
        maxLength: 2000,
      },
      { ref: "goals", type: "long_text", title: "What would a good outcome look like six months from now?", required: true, maxLength: 1200 },
      {
        ref: "urgency",
        type: "single_select",
        title: "How soon do you need to start?",
        required: true,
        options: [{ label: "This week" }, { label: "This month" }, { label: "This quarter" }, { label: "No rush" }],
      },
      {
        ref: "referral",
        type: "dropdown",
        title: "How did you find us?",
        required: false,
        options: [{ label: "A referral" }, { label: "Search" }, { label: "Social media" }, { label: "I'm an existing client" }, { label: "Somewhere else" }],
      },
      {
        ref: "documents",
        type: "file_upload",
        title: "Anything we should read before we meet?",
        description: "Briefs, previous reports, contracts. Skip this if there's nothing yet.",
        required: false,
        accept: ["application/pdf", "image/*"],
        maxFiles: 5,
        maxSizeMB: 20,
      },
      {
        ref: "terms",
        type: "legal_consent",
        title: "Terms of engagement",
        required: true,
        consentText: "I have read and accept the terms of engagement and the privacy policy.",
      },
    ],
    branches: [
      { when: "service", is: "An initial consultation", then: "consult_topic" },
      { when: "service", is: "A one-off project", then: "project_scope" },
      { when: "service", is: "An ongoing engagement", then: "ongoing_cadence" },
      { when: "service", is: "A second opinion", then: "prior_advice" },
      { when: "consult_topic", always: true, then: "background" },
      { when: "project_budget", always: true, then: "background" },
      { when: "ongoing_stakeholders", always: true, then: "background" },
    ],
    ending: {
      title: "Thanks, we're ready 🤝",
      body: "We'll read everything before we meet and be in touch to arrange the first session.",
    },
    guide: {
      questionsToConsider: [
        "Which kinds of work do you actually take on, and do the four options match them?",
        "Do you need a budget range up front, or does it put off the clients you want?",
        "Which documents do you always end up asking for in the first week?",
        "Do your terms of engagement need to be linked from the consent question?",
      ],
      howToUseResponses:
        "Read the background and goals answers before the first call and open the meeting by playing them back, so the client hears that you listened. Sort new intakes by urgency and budget to decide who gets a slot this week. For second opinions, read the prior advice closely: the doubt they describe is usually the real brief.",
      customizeSteps: [
        "Rename the four service options to the ways you really sell your work, and keep each follow-up arm to two or three questions.",
        "Change the budget bands to your own currency and price points, or remove the question if you quote only after a call.",
        "Link your terms in the consent question, then send the form as soon as a client books, not on the morning of the meeting.",
      ],
      faqs: [
        {
          q: "What should a client intake form include?",
          a: "Contact details, what the client wants help with, the background, what a good outcome looks like, timing and budget. Anything you need signed, such as your terms, belongs at the end.",
        },
        {
          q: "How long should a client intake form be?",
          a: "Short enough to finish in five minutes. This one branches on the service chosen, so each client answers only the questions that fit their situation.",
        },
        {
          q: "When should I send an intake form to a new client?",
          a: "Right after they book or agree to a first meeting. You want the answers a day or two ahead so you can prepare.",
        },
        {
          q: "Can clients upload documents with their intake?",
          a: "Yes. The file question accepts PDFs and images, and you can change the file types and limits when you edit it.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "client-profile-form",
    type: "form",
    category: "marketing",
    goals: ["onboard-clients"],
    roles: ["freelancers-agencies", "customer-success", "marketing"],
    searchName: "Client profile form",
    title: "Client profile",
    icon: "Building2",
    metaDescription:
      "Build a lasting record of each client: what they sell, their best customers, competitors, priorities and who signs off. The approver is asked for only when needed.",
    description: "A reference record of a client's business, customers, market and priorities.",
    blurb:
      "A profile you keep coming back to across projects, not a one-off intake. It records what the business sells, who its best customers are, who it competes with and how it ranks its priorities this year. If the person filling it in isn't the one who signs off, the form asks who is.",
    tags: ["client profile", "client information", "agency client record", "customer onboarding", "account profile"],
    greeting: "Hi! We'd like to get to know your business properly. This takes about four minutes.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who are we talking to?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { ref: "role", type: "short_text", title: "What's your role there?", required: false, maxLength: 120 },
      { ref: "company", type: "short_text", title: "What's the business called?", required: true, maxLength: 150 },
      { ref: "website", type: "url", title: "Website, if you have one", required: false },
      {
        ref: "industry",
        type: "dropdown",
        title: "Which industry are you in?",
        required: true,
        options: [
          { label: "Retail and ecommerce" },
          { label: "Professional services" },
          { label: "Software and technology" },
          { label: "Health and wellness" },
          { label: "Hospitality and food" },
          { label: "Education" },
          { label: "Real estate" },
          { label: "Nonprofit" },
          { label: "Manufacturing" },
          { label: "Something else" },
        ],
      },
      {
        ref: "size",
        type: "single_select",
        title: "How many people work there?",
        required: true,
        options: [{ label: "Just me" }, { label: "2–10" }, { label: "11–50" }, { label: "51–200" }, { label: "More than 200" }],
      },
      {
        ref: "business",
        type: "long_text",
        title: "In a few sentences, what do you sell and who buys it?",
        required: true,
        maxLength: 1200,
      },
      {
        ref: "best_customer",
        type: "long_text",
        title: "Describe your best customer: who they are, and why they choose you",
        required: true,
        maxLength: 800,
      },
      {
        ref: "competitors",
        type: "long_text",
        title: "Who do you compete with, and how are you different?",
        description: "Names and links are ideal.",
        required: false,
        maxLength: 800,
      },
      {
        ref: "priorities",
        type: "matrix",
        title: "How much does each of these matter to you this year?",
        required: true,
        rows: ["Winning new customers", "Keeping the customers you have", "Being better known", "Raising prices or margins", "Cutting costs"],
        columns: ["Not a focus", "Somewhat", "A top priority"],
      },
      {
        ref: "services",
        type: "multi_select",
        title: "Which of our services are you interested in?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Website design" },
          { label: "Search engine optimisation" },
          { label: "Paid advertising" },
          { label: "Content and social media" },
          { label: "Email marketing" },
          { label: "Brand and design" },
        ],
      },
      {
        ref: "goals",
        type: "long_text",
        title: "What would make working with us a success for you this year?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "decision_maker",
        type: "yes_no",
        title: "Are you the person who approves work and budgets?",
        required: true,
      },

      // Someone else signs off
      { ref: "approver_name", type: "short_text", title: "Who does, and what's their role?", required: true, maxLength: 150 },
      { ref: "approver_email", type: "email", title: "Their email address", required: false },

      // Everyone
      {
        ref: "updates",
        type: "single_select",
        title: "What's the best way to reach you day to day?",
        required: true,
        options: [{ label: "Email" }, { label: "Phone calls" }, { label: "A shared chat channel" }, { label: "Scheduled video calls" }],
      },
      {
        ref: "avoid",
        type: "long_text",
        title: "Anything we should avoid? Words, competitors, past approaches that didn't work.",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "decision_maker", is: true, then: "updates" },
      { when: "decision_maker", is: false, then: "approver_name" },
    ],
    ending: {
      title: "Profile saved 📁",
      body: "Your account lead will use this as the starting point for everything we do together.",
    },
    guide: {
      questionsToConsider: [
        "Which services should appear in the list, and does each one match a real offer?",
        "Do you need the approver's contact details, or just their name?",
        "Which priorities in the grid actually change how you would plan the work?",
        "Should the profile ask about brand assets such as logos and colour codes?",
      ],
      howToUseResponses:
        "Save each response as the client's reference page and link it from wherever your team keeps project notes. Read the best-customer and competitor answers before any strategy work, and let the priority grid decide what you pitch first: a client focused on keeping customers wants different ideas from one chasing new ones. Check the approver answer before sending the first proposal, and send the form again once a year or when a contact leaves.",
      customizeSteps: [
        "Replace the services list with what you offer, and drop any options you would not take on.",
        "Trim the industry list to the sectors you serve so the answers are useful for reporting.",
        "Send it once a client signs, then export responses to CSV if you keep client records elsewhere.",
      ],
      faqs: [
        {
          q: "What is a client profile form?",
          a: "It collects the background you need across every project with a client: the business, its customers, goals, contacts and how they like to work.",
        },
        {
          q: "How is a client profile different from a client intake form?",
          a: "An intake form is about one new request. A profile describes the client as a whole and stays useful long after the first project ends.",
        },
        {
          q: "What should a client profile include?",
          a: "Company name, website, industry, size, what they sell, their best customers, competitors, priorities, goals, the main contact and who approves work.",
        },
        {
          q: "Can I update a client profile later?",
          a: "Send the same link again when something changes. Each submission is saved in your dashboard with its date, so you can see the most recent one.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "demo-feedback-form",
    type: "form",
    category: "marketing",
    goals: ["collect-feedback", "generate-leads"],
    roles: ["sales", "product-research", "marketing"],
    searchName: "Demo feedback form",
    title: "Demo feedback",
    icon: "MonitorPlay",
    metaDescription:
      "Find out if your product demo answered the buyer's questions, what was missing and what they want next. Poor fits explain why; keen buyers share their timeline.",
    description: "Hear what landed in the demo, what didn't, and what the buyer wants next.",
    blurb:
      "Sent right after a sales demo, it rates the session, pins down what went unanswered and asks what should happen next. Buyers who want a technical deep dive are asked what to cover, keen buyers share their timeline and who else decides, and anyone who isn't a fit is asked why and gets a polite ending of their own.",
    tags: ["demo feedback", "sales demo survey", "product demo follow-up", "post-demo form", "branching"],
    greeting: "Thanks for joining the demo today. Could you spare two minutes to tell us how it went?",
    questions: [
      {
        ref: "attendee",
        type: "contact_info",
        title: "Your name and work email",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "Which company are you with?", required: true, maxLength: 150 },
      {
        ref: "usefulness",
        type: "opinion_scale",
        title: "How useful was the demo for you?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Not useful",
        labelHigh: "Very useful",
      },
      {
        ref: "needs_covered",
        type: "single_select",
        title: "Did we show what you came to see?",
        required: true,
        options: [{ label: "Yes, all of it" }, { label: "Some of it" }, { label: "Not really" }],
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How was each part of the session?",
        required: false,
        rows: ["How clearly things were explained", "Relevance to your use case", "Pace", "Answers to your questions"],
        columns: ["Poor", "Okay", "Good", "Great"],
      },
      {
        ref: "unanswered",
        type: "long_text",
        title: "What questions do you still have, or what didn't we show?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "next_step",
        type: "single_select",
        title: "What would you like to happen next?",
        required: true,
        options: [
          { label: "Start a trial" },
          { label: "A proposal with pricing" },
          { label: "A technical deep dive" },
          { label: "Share it with my team first" },
          { label: "Not a fit right now" },
        ],
      },

      // Technical deep dive
      {
        ref: "tech_topics",
        type: "long_text",
        title: "What should the technical session cover?",
        description: "Security, data, integrations with your stack, anything your engineers will ask.",
        required: true,
        maxLength: 1000,
      },

      // Buyers moving forward
      {
        ref: "timeline",
        type: "single_select",
        title: "When are you hoping to decide?",
        required: true,
        options: [{ label: "Within a month" }, { label: "In the next quarter" }, { label: "Later this year" }, { label: "No set date" }],
      },
      {
        ref: "decision_makers",
        type: "multi_select",
        title: "Who else has a say in the decision?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "My manager" },
          { label: "Finance" },
          { label: "IT or security" },
          { label: "Procurement" },
          { label: "The people who will use it" },
        ],
      },

      // Not a fit
      {
        ref: "not_fit_reason",
        type: "single_select",
        title: "What's the main reason it isn't a fit?",
        required: true,
        allowOther: true,
        options: [
          { label: "It's missing something we need" },
          { label: "It costs more than we can spend" },
          { label: "The timing is wrong" },
          { label: "We're going with another option" },
        ],
      },
    ],
    branches: [
      { when: "next_step", is: "Start a trial", then: "timeline" },
      { when: "next_step", is: "A proposal with pricing", then: "timeline" },
      { when: "next_step", is: "A technical deep dive", then: "tech_topics" },
      { when: "next_step", is: "Share it with my team first", then: "timeline" },
      { when: "next_step", is: "Not a fit right now", then: "not_fit_reason" },
      { when: "decision_makers", always: true, then: "end_thanks" },
      { when: "not_fit_reason", always: true, then: "end_not_fit" },
    ],
    ending: {
      title: "Thanks, we'll be in touch 🚀",
      body: "Your account contact will follow up with the next step you picked, usually within one working day.",
    },
    endings: [
      {
        ref: "end_not_fit",
        title: "Thanks for being straight with us",
        body: "That helps us more than you'd think. If things change, just reply to our last email.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What does your sales team need to know before the follow-up call?",
        "Which next steps can you actually offer, such as a trial, a pilot or a proposal?",
        "Should the technical deep dive route to a different person on your team?",
        "Do you want to hear why a buyer isn't a fit, even if they would rather not say much?",
      ],
      howToUseResponses:
        "Read each response before the follow-up so the next call starts with the unanswered questions, not a repeat of the demo. Pass technical topics to your solutions engineer. Tally the reasons buyers give for not being a fit every month: one repeated missing feature is a product conversation, and repeated pricing objections are a positioning one.",
      customizeSteps: [
        "Change the next-step options to the offers your sales process really has.",
        "Edit the rows in the rating grid to match how your demos are structured.",
        "Send the link in the thank-you email straight after the call, while the demo is fresh.",
      ],
      faqs: [
        {
          q: "When should I send a demo feedback form?",
          a: "The same day, ideally in your thank-you email. The details of what confused a buyer fade quickly once they are back in their own work.",
        },
        {
          q: "What questions should I ask after a product demo?",
          a: "Whether it showed what they came for, what is still unclear, what they want next, their timeline and who else decides. A rating on its own tells you very little.",
        },
        {
          q: "How do I get honest demo feedback?",
          a: "Keep it short and make it easy to say no. This form gives a buyer who isn't a fit a clear option and a polite ending instead of a sales push.",
        },
        {
          q: "Can I follow up differently based on the answers?",
          a: "Yes. The form branches on the next step chosen, and you can filter responses in the dashboard by that answer to hand each group to the right person.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "design-consultation-form",
    type: "form",
    category: "marketing",
    goals: ["onboard-clients", "generate-leads"],
    roles: ["freelancers-agencies", "marketing"],
    searchName: "Design consultation form",
    title: "Design consultation",
    icon: "Palette",
    metaDescription:
      "Prepare for a design consultation with the client's goal, audience, what prompted the project and what they want from the meeting. Existing brands say what stays.",
    description: "Everything a designer needs to walk into the first meeting with ideas.",
    blurb:
      "Built for the meeting before any quote: it asks what prompted the project, what the design has to achieve, who it is for and what the client most wants to leave the consultation with. Clients with an existing brand explain what isn't working and what has to stay, and can upload their files; new brands skip straight to references.",
    tags: ["design consultation", "design questionnaire", "designer client questionnaire", "brand consultation", "branching"],
    greeting: "Hi! Tell us about your project and we'll come to the consultation with some ideas already.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name and email",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "brand", type: "short_text", title: "What's the business or brand called?", required: true, maxLength: 150 },
      {
        ref: "project_type",
        type: "multi_select",
        title: "What do you need designed?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Logo and brand identity" },
          { label: "Website or app" },
          { label: "Packaging" },
          { label: "Print, like brochures or signage" },
          { label: "Social media graphics" },
          { label: "Presentation or pitch deck" },
        ],
      },
      {
        ref: "trigger",
        type: "single_select",
        title: "What's prompting this now?",
        required: true,
        allowOther: true,
        options: [
          { label: "We're launching something new" },
          { label: "We've outgrown how we look" },
          { label: "A competitor looks better than us" },
          { label: "A campaign or event is coming up" },
        ],
      },
      {
        ref: "goal",
        type: "long_text",
        title: "What should this design do for you?",
        description: "Win bigger clients, look more established, make the product easier to understand...",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "audience",
        type: "long_text",
        title: "Who does it need to appeal to?",
        required: true,
        maxLength: 600,
      },
      {
        ref: "has_brand",
        type: "yes_no",
        title: "Do you already have a logo or brand guidelines?",
        required: true,
      },

      // Existing brand
      {
        ref: "not_working",
        type: "long_text",
        title: "What isn't working about how things look today?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "must_keep",
        type: "long_text",
        title: "And what has to stay, whatever we change?",
        description: "A colour, the name's lettering, a symbol people recognise...",
        required: false,
        maxLength: 600,
      },
      {
        ref: "brand_files",
        type: "file_upload",
        title: "Upload your logo or guidelines if they're handy",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
        maxSizeMB: 25,
      },

      // Everyone
      {
        ref: "references",
        type: "long_text",
        title: "Which brands or designs do you admire, and which leave you cold? Links are perfect.",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "meeting_focus",
        type: "ranking",
        title: "Rank what you'd most like to leave the consultation with",
        required: true,
        items: ["A clear creative direction", "A price and timeline", "Honest feedback on what we have", "Ideas we hadn't thought of"],
      },
      { ref: "deadline", type: "date", title: "When do you need it finished?", required: false, disablePast: true },
      {
        ref: "budget",
        type: "single_select",
        title: "What budget do you have in mind?",
        required: true,
        options: [
          { label: "Under $1,000" },
          { label: "$1,000–$5,000" },
          { label: "$5,000–$15,000" },
          { label: "More than $15,000" },
          { label: "Not sure yet" },
        ],
      },
      {
        ref: "meeting_format",
        type: "single_select",
        title: "How would you like to meet?",
        required: true,
        options: [{ label: "Video call" }, { label: "Phone call" }, { label: "In person" }],
      },
      {
        ref: "approver",
        type: "short_text",
        title: "Who else will be in the meeting or give final approval?",
        required: false,
        maxLength: 150,
      },
    ],
    branches: [
      { when: "has_brand", is: true, then: "not_working" },
      { when: "has_brand", is: false, then: "references" },
    ],
    ending: {
      title: "Thanks, this is a great start 🎨",
      body: "We'll look through everything and send a few times for the consultation.",
    },
    guide: {
      questionsToConsider: [
        "Which kinds of design work do you take on, and which should you leave off the list?",
        "What do your consultations usually get stuck on, and could a question here settle it beforehand?",
        "Should reference links be required, since they save the most time in the meeting?",
        "What budget bands make sense for your prices?",
      ],
      howToUseResponses:
        "Plan the meeting around the ranking: a client who puts a price and timeline first wants a clear scope by the end of the call, while one who ranks ideas first wants you to bring sketches or examples. Read the trigger and the goal together, since they tell you what the design has to prove. For existing brands, gather the uploaded files and the not-working answer into one page so you can show the problem back to them before suggesting anything.",
      customizeSteps: [
        "Edit the list of design work so it matches your services exactly.",
        "Change the budget bands to your currency and your own price range, and the meeting options to how you really meet clients.",
        "Link the form from your booking page or website, and send it to anyone who asks for a first chat.",
      ],
      faqs: [
        {
          q: "What should I ask in a design consultation?",
          a: "Why the project is happening now, what the design has to achieve, who it is for, what is and isn't working today, examples they like, deadline and budget.",
        },
        {
          q: "What is the difference between a design consultation form and a design brief?",
          a: "A consultation form prepares the first conversation, so it focuses on the problem and the client's expectations. A brief comes later and pins down the exact deliverables.",
        },
        {
          q: "Should a design questionnaire ask about budget?",
          a: "Yes, as a range. It tells you whether the scope is realistic before you spend time on concepts.",
        },
        {
          q: "Can clients upload their existing logo?",
          a: "Yes. Clients who say they already have a brand are asked for their files, and new brands skip that question.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "ecommerce-registration-form",
    type: "form",
    category: "marketing",
    goals: ["generate-leads", "onboard-clients"],
    roles: ["marketing", "sales", "operations"],
    searchName: "Ecommerce registration form",
    title: "Store registration",
    icon: "ShoppingBag",
    metaDescription:
      "Register shoppers, wholesale buyers and brands who want to sell through your store with one form. Each type gets its own questions and its own next steps.",
    description: "One sign-up for customers, trade buyers and sellers, each asked what fits.",
    blurb:
      "Stores usually run three sign-ups for three kinds of people. This one asks up front who is registering and branches: shoppers pick their interests, wholesale buyers give business and volume details for approval, and brands describe what they would like to list. Each group finishes on an ending that says what happens next for them.",
    tags: ["ecommerce registration", "wholesale account application", "vendor registration", "store sign-up", "branching"],
    greeting: "Welcome! Let's get you registered. First, a couple of quick details.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name, email and phone",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "reg_type",
        type: "single_select",
        title: "How would you like to register?",
        required: true,
        options: [
          { label: "As a shopper", description: "Order for yourself" },
          { label: "As a wholesale buyer", description: "Buy at trade prices for your business" },
          { label: "As a brand that wants to sell here", description: "List your products in our store" },
        ],
      },

      // Shopper
      {
        ref: "interests",
        type: "multi_select",
        title: "What are you most interested in?",
        required: false,
        minSelections: 0,
        maxSelections: 6,
        options: [{ label: "New arrivals" }, { label: "Sales and offers" }, { label: "Gift ideas" }, { label: "Restocks of favourites" }],
      },
      {
        ref: "marketing_ok",
        type: "yes_no",
        title: "Can we email you about new products and offers?",
        required: true,
      },

      // Wholesale buyer
      { ref: "business_name", type: "short_text", title: "What's your business called?", required: true, maxLength: 150 },
      {
        ref: "business_type",
        type: "single_select",
        title: "What kind of business is it?",
        required: true,
        allowOther: true,
        options: [{ label: "Shop with a physical location" }, { label: "Online shop" }, { label: "Salon, spa or studio" }, { label: "Hotel or restaurant" }],
      },
      { ref: "tax_number", type: "short_text", title: "Business registration or tax number", required: true, maxLength: 60 },
      {
        ref: "order_volume",
        type: "single_select",
        title: "Roughly how much would you order each month?",
        required: true,
        options: [{ label: "A few items to test" }, { label: "A small regular order" }, { label: "Large regular orders" }, { label: "Not sure yet" }],
      },
      {
        ref: "shipping_address",
        type: "address",
        title: "Where should wholesale orders be delivered?",
        required: true,
        fields: ["street", "city", "state", "postal", "country"],
      },

      // Brand that wants to sell
      { ref: "brand_name", type: "short_text", title: "What's the brand called?", required: true, maxLength: 150 },
      { ref: "brand_site", type: "url", title: "Where can we see your products now?", required: false },
      {
        ref: "product_count",
        type: "number",
        title: "How many products would you like to list?",
        required: true,
        integerOnly: true,
        min: 1,
        max: 10000,
      },
      {
        ref: "products",
        type: "long_text",
        title: "Tell us about the products: what they are, price range, and what makes them sell",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "catalogue",
        type: "file_upload",
        title: "Upload a catalogue or product photos",
        required: false,
        accept: ["application/pdf", "image/*"],
        maxFiles: 5,
        maxSizeMB: 25,
      },
    ],
    branches: [
      { when: "reg_type", is: "As a shopper", then: "interests" },
      { when: "reg_type", is: "As a wholesale buyer", then: "business_name" },
      { when: "reg_type", is: "As a brand that wants to sell here", then: "brand_name" },
      { when: "marketing_ok", always: true, then: "end_shopper" },
      { when: "shipping_address", always: true, then: "end_wholesale" },
    ],
    ending: {
      title: "Thanks, we'll take a look 📦",
      body: "Our buying team reviews every brand that applies and will reply by email about next steps.",
    },
    endings: [
      {
        ref: "end_shopper",
        title: "You're registered 🛍️",
        body: "Welcome aboard. Watch your inbox for a confirmation email.",
      },
      {
        ref: "end_wholesale",
        title: "Application received",
        body: "We check every trade account by hand and will email you once it's approved, with your wholesale price list.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Do you really offer all three kinds of registration, or should you remove one?",
        "What do you need to approve a wholesale buyer, and is a tax number enough?",
        "Should brands be asked about minimum order quantities or delivery times?",
        "Do shoppers need a discount code or welcome offer mentioned on their ending?",
      ],
      howToUseResponses:
        "Filter responses in the dashboard by registration type and hand each group to its owner. Approve wholesale buyers against the business details before sharing trade prices, and reply to every brand application even when the answer is no. Export shoppers who said yes to marketing emails to CSV so their permission travels with their address.",
      customizeSteps: [
        "Delete the registration type you don't offer, along with its questions and ending.",
        "Change the wholesale questions to match your approval rules, such as a minimum order.",
        "Put the link on your website footer or embed it on your trade and sell-with-us pages.",
      ],
      faqs: [
        {
          q: "Does this form create an account in my online store?",
          a: "No. It collects the registration so you can review it and set up the account in your store yourself.",
        },
        {
          q: "What should a wholesale registration form ask?",
          a: "The business name, type of business, a registration or tax number, expected order volume and a delivery address.",
        },
        {
          q: "Can I use one form for customers and vendors?",
          a: "Yes. The first question asks who is registering, and each type only sees the questions meant for them.",
        },
        {
          q: "Should I ask for payment details at registration?",
          a: "No. Keep card details and passwords out of a registration form and handle them in your store's own checkout.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "event-planner-consultation-form",
    type: "form",
    category: "marketing",
    goals: ["onboard-clients", "run-events", "generate-leads"],
    roles: ["freelancers-agencies", "operations"],
    searchName: "Event planner consultation form",
    title: "Event planning consultation",
    icon: "PartyPopper",
    metaDescription:
      "Collect the occasion, date, guest count, venue, budget and priorities before an event planning consultation. Clients without a venue describe what they want.",
    description: "The occasion, numbers, venue and priorities, gathered before the first meeting.",
    blurb:
      "Built for planners who want the first meeting to be about ideas, not logistics. It covers the occasion, date, guest count, budget and services, then asks the client to rank what matters most. Clients who already have a venue name it; clients who don't describe the area and the kind of place they have in mind.",
    tags: ["event planner questionnaire", "event planning consultation", "event inquiry form", "party planning form", "branching"],
    greeting: "Planning something? Tell us about the event and we'll come to the consultation with ideas ready.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name, email and phone",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "occasion",
        type: "single_select",
        title: "What's the occasion?",
        required: true,
        allowOther: true,
        options: [
          { label: "Wedding" },
          { label: "Birthday or anniversary" },
          { label: "Company party" },
          { label: "Conference or offsite" },
          { label: "Product launch" },
        ],
      },
      { ref: "event_date", type: "date", title: "When is it?", description: "Your best guess is fine.", required: true, disablePast: true },
      { ref: "date_flexible", type: "yes_no", title: "Is the date flexible?", required: true },
      {
        ref: "guests",
        type: "number",
        title: "About how many guests?",
        required: true,
        integerOnly: true,
        min: 1,
        max: 5000,
      },
      { ref: "has_venue", type: "yes_no", title: "Have you already booked a venue?", required: true },

      // Venue booked
      { ref: "venue_name", type: "short_text", title: "Which venue, and where?", required: true, maxLength: 200 },

      // No venue yet
      { ref: "area", type: "short_text", title: "Which town or area should we look in?", required: true, maxLength: 150 },
      {
        ref: "venue_style",
        type: "multi_select",
        title: "What kind of place do you picture?",
        required: false,
        minSelections: 0,
        maxSelections: 4,
        options: [
          { label: "Hotel or ballroom" },
          { label: "Restaurant" },
          { label: "Outdoors or garden" },
          { label: "Barn or countryside" },
          { label: "City rooftop or loft" },
          { label: "At home" },
        ],
      },

      // Everyone
      {
        ref: "services",
        type: "multi_select",
        title: "What would you like help with?",
        required: true,
        minSelections: 1,
        maxSelections: 8,
        options: [
          { label: "Full planning from start to finish" },
          { label: "On-the-day coordination" },
          { label: "Finding suppliers" },
          { label: "Catering" },
          { label: "Decor and styling" },
          { label: "Entertainment" },
          { label: "Guest travel and hotels" },
        ],
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Rank what matters most to you",
        required: true,
        items: ["Food and drink", "The venue and setting", "Entertainment", "Decor", "Staying on budget", "A relaxed day for you"],
      },
      {
        ref: "budget",
        type: "single_select",
        title: "What's your overall budget?",
        required: true,
        options: [
          { label: "Under $5,000" },
          { label: "$5,000–$20,000" },
          { label: "$20,000–$50,000" },
          { label: "More than $50,000" },
          { label: "Not decided yet" },
        ],
      },
      {
        ref: "vision",
        type: "long_text",
        title: "Describe the event you're picturing",
        description: "The feeling, a theme, anything you've seen and loved.",
        required: false,
        maxLength: 1500,
      },
      {
        ref: "heard",
        type: "dropdown",
        title: "How did you hear about us?",
        required: false,
        options: [{ label: "A friend or past client" }, { label: "A venue or supplier" }, { label: "Search" }, { label: "Social media" }, { label: "Somewhere else" }],
      },
    ],
    branches: [
      { when: "has_venue", is: true, then: "venue_name" },
      { when: "has_venue", is: false, then: "area" },
      { when: "venue_name", always: true, then: "services" },
    ],
    ending: {
      title: "Thanks, we have what we need 🎉",
      body: "We'll check our availability for your date and get back to you to set up the consultation.",
    },
    guide: {
      questionsToConsider: [
        "Which occasions do you plan, and which should you remove from the list?",
        "Do you need a minimum guest count or budget before you take a booking?",
        "Should couples or companies be asked about a second contact person?",
        "Do you offer venue finding, or only work with booked venues?",
      ],
      howToUseResponses:
        "Check the date and guest count first, since they decide whether you can take the booking at all. Read the priority ranking before you build a proposal: a client who ranks budget first wants options at different price points, while one who ranks the setting first will pay for the right venue. For clients without a venue, bring two or three places in the style they picked to the consultation.",
      customizeSteps: [
        "Edit the services list to the packages you sell, and change the budget bands to your currency and price range.",
        "Adjust the ranking items to what your clients usually trade off.",
        "Embed the form on your contact page or send the link to anyone who enquires by message.",
      ],
      faqs: [
        {
          q: "What questions should an event planner ask a client?",
          a: "The occasion, date and whether it can move, guest count, venue, budget, which services they need and what matters most to them.",
        },
        {
          q: "When should a client fill in an event planning questionnaire?",
          a: "Before the first consultation. You arrive with availability checked and ideas ready instead of spending the meeting on basics.",
        },
        {
          q: "Can I use this form for weddings and corporate events?",
          a: "Yes. The occasion list covers both, and you can rename or add options for the events you plan.",
        },
        {
          q: "What if the client hasn't found a venue yet?",
          a: "The form asks whether a venue is booked. If not, it asks for the area and the kind of place they want instead.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "marketing-brief-form",
    type: "form",
    category: "marketing",
    goals: ["onboard-clients"],
    roles: ["marketing", "freelancers-agencies"],
    searchName: "Marketing brief form",
    title: "Marketing brief",
    icon: "Megaphone",
    metaDescription:
      "Collect the goal, audience, key message, channels, deliverables, budget and deadline for a campaign in one brief. Brands without guidelines describe their tone.",
    description: "A campaign brief that covers the goal, audience, message, channels and deadline.",
    blurb:
      "Written for agencies and in-house teams who are tired of briefs that arrive as a one-line email. It asks for the goal and how success will be measured, the audience and message, channels and deliverables, then budget and dates. Teams with brand guidelines upload them; teams without describe the tone they want.",
    tags: ["marketing brief", "campaign brief", "creative brief", "agency brief", "branching"],
    greeting: "Let's get the campaign brief down. It takes about five minutes and saves a lot of back and forth.",
    questions: [
      {
        ref: "requester",
        type: "contact_info",
        title: "Who's sending the brief?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "brand", type: "short_text", title: "Which brand or product is this for?", required: true, maxLength: 150 },
      { ref: "campaign", type: "short_text", title: "Give the campaign a working name", required: true, maxLength: 120 },
      {
        ref: "objective",
        type: "single_select",
        title: "What's the main goal?",
        required: true,
        options: [
          { label: "Build awareness" },
          { label: "Generate leads" },
          { label: "Drive sales" },
          { label: "Launch something new" },
          { label: "Win back or keep customers" },
          { label: "Fill an event" },
        ],
      },
      {
        ref: "success",
        type: "short_text",
        title: "How will you know it worked?",
        description: "The number or result you'll judge it by.",
        required: true,
        maxLength: 300,
      },
      {
        ref: "audience",
        type: "long_text",
        title: "Who are we trying to reach, and what do they care about?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "message",
        type: "long_text",
        title: "If people remember one thing, what should it be?",
        required: true,
        maxLength: 500,
      },
      {
        ref: "channels",
        type: "multi_select",
        title: "Which channels should it run on?",
        required: true,
        minSelections: 1,
        maxSelections: 8,
        options: [
          { label: "Social media" },
          { label: "Paid search" },
          { label: "Email" },
          { label: "Website" },
          { label: "Print" },
          { label: "Events" },
          { label: "PR" },
          { label: "Open to suggestions" },
        ],
      },
      {
        ref: "deliverables",
        type: "long_text",
        title: "What exactly needs to be made?",
        description: "For example: 6 social posts, a landing page, 2 emails.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "has_guidelines",
        type: "yes_no",
        title: "Do you have brand guidelines we should follow?",
        required: true,
      },

      // Guidelines exist
      {
        ref: "guidelines_file",
        type: "file_upload",
        title: "Upload them here",
        required: false,
        accept: ["application/pdf", "image/*"],
        maxFiles: 3,
        maxSizeMB: 25,
      },

      // No guidelines
      {
        ref: "tone",
        type: "multi_select",
        title: "Then how should it sound? Pick up to three.",
        required: true,
        minSelections: 1,
        maxSelections: 3,
        options: [
          { label: "Friendly" },
          { label: "Expert" },
          { label: "Playful" },
          { label: "Bold" },
          { label: "Reassuring" },
          { label: "Luxurious" },
        ],
      },

      // Everyone
      {
        ref: "mandatories",
        type: "long_text",
        title: "Anything that must or must not be included?",
        description: "Legal lines, logos, words to avoid, offers that have to appear.",
        required: false,
        maxLength: 800,
      },
      {
        ref: "budget",
        type: "number",
        title: "What's the budget, in your currency?",
        required: false,
        min: 0,
      },
      { ref: "launch_date", type: "date", title: "When does it need to go live?", required: true, disablePast: true },
      { ref: "approver", type: "short_text", title: "Who signs off the final work?", required: true, maxLength: 150 },
    ],
    branches: [
      { when: "has_guidelines", is: true, then: "guidelines_file" },
      { when: "has_guidelines", is: false, then: "tone" },
      { when: "guidelines_file", always: true, then: "mandatories" },
    ],
    ending: {
      title: "Brief received 📣",
      body: "We'll read it through and come back with any questions, then a plan and timeline.",
    },
    guide: {
      questionsToConsider: [
        "Which goals does your team actually run campaigns for?",
        "Do you need a fixed budget, or is a range good enough to start?",
        "Should the brief ask for competitors or past campaigns to learn from?",
        "Who on your side needs to read the brief before work starts?",
      ],
      howToUseResponses:
        "Read the goal, the success measure and the one-thing message together. If they don't line up, fix that in a short call before any work starts, because a brief with three goals becomes a campaign with none. Turn the deliverables answer into your task list and check the launch date against it. Keep each brief in the dashboard so you can compare results against the success measure when the campaign ends.",
      customizeSteps: [
        "Edit the channel and goal lists to the ones your team works with.",
        "Add a question for anything you always chase, such as a product link or a promo code.",
        "Share the link as the only way to request a campaign, so every request arrives complete.",
      ],
      faqs: [
        {
          q: "What should a marketing brief include?",
          a: "The goal and how success is measured, the audience, the key message, channels, deliverables, must-haves, budget, deadline and who approves the work.",
        },
        {
          q: "How long should a marketing brief be?",
          a: "Long enough to answer those questions and no longer. Most good briefs fit on one page.",
        },
        {
          q: "What's the difference between a marketing brief and a creative brief?",
          a: "A marketing brief sets the goal, audience and channels for a whole campaign. A creative brief focuses on the message and look of the work itself. This form covers the essentials of both.",
        },
        {
          q: "Can clients attach their brand guidelines?",
          a: "Yes. Anyone who says they have guidelines is asked to upload them, and anyone without is asked to describe their tone instead.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "testimonial-request",
    type: "form",
    category: "marketing",
    goals: ["collect-feedback"],
    roles: ["marketing", "customer-success", "freelancers-agencies"],
    searchName: "Testimonial form",
    title: "Testimonial request",
    icon: "Quote",
    metaDescription:
      "Collect testimonials with the story, the result and written permission to publish. Low ratings are asked what went wrong privately instead of for a quote.",
    description: "Collect quotes you're actually allowed to publish.",
    blurb:
      "Most testimonials never get used because nobody asked permission in writing. This one collects the story, the result, the credit and the consent together. A customer who rates the experience three stars or lower is asked privately what fell short instead of being pushed for a quote, and an anonymous quote is never chased for a headshot.",
    tags: ["testimonial form", "customer testimonial request", "review collection", "social proof", "branching"],
    greeting: "Would you say a few words about working with us? It really helps.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name and email",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "rating", type: "rating", title: "How would you rate your experience with us?", required: true, scale: 5, shape: "star" },
      {
        ref: "worked_on",
        type: "short_text",
        title: "What did we work on together?",
        required: false,
        maxLength: 200,
      },
      {
        ref: "before",
        type: "long_text",
        title: "What was going on before you came to us?",
        description: "The most useful testimonials have a before in them.",
        required: false,
        maxLength: 800,
      },
      { ref: "quote", type: "long_text", title: "In your own words, what was it like working with us?", required: true, maxLength: 1200 },
      { ref: "result", type: "short_text", title: "Is there a specific result you'd be happy to mention?", required: false, maxLength: 200 },
      {
        ref: "attribution",
        type: "single_select",
        title: "How would you like to be credited?",
        required: true,
        options: [
          { label: "Full name, role and company" },
          { label: "First name and company only" },
          { label: "Anonymously" },
        ],
      },

      // Credited by name
      { ref: "role_company", type: "short_text", title: "Role and company, exactly as you'd like it shown", required: true, maxLength: 150 },
      {
        ref: "photo",
        type: "file_upload",
        title: "A photo we can show alongside it?",
        required: false,
        accept: ["image/*"],
        maxFiles: 1,
        maxSizeMB: 8,
      },
      { ref: "linkedin", type: "url", title: "Your LinkedIn profile, if you'd like it linked", required: false },

      // First name only
      { ref: "company_only", type: "short_text", title: "Which company should we name?", required: false, maxLength: 150 },

      // Everyone giving a quote
      {
        ref: "where_ok",
        type: "multi_select",
        title: "Where are you happy for it to appear?",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Our website" },
          { label: "Social media" },
          { label: "Sales decks and proposals" },
          { label: "Paid advertising" },
        ],
      },
      {
        ref: "publish_consent",
        type: "legal_consent",
        title: "Permission to publish",
        required: true,
        consentText:
          "I'm happy for this quote, the credit I chose, and any photo I've provided to be used in the places I selected. I understand I can withdraw this by asking.",
      },

      // Low ratings
      {
        ref: "improve",
        type: "long_text",
        title: "Sorry it wasn't better. What should we have done differently?",
        description: "This stays with us and won't be published.",
        required: true,
        maxLength: 1200,
      },
    ],
    branches: [
      { when: "rating", op: "lte", is: 3, then: "improve" },
      { when: "attribution", is: "Full name, role and company", then: "role_company" },
      { when: "attribution", is: "First name and company only", then: "company_only" },
      { when: "attribution", is: "Anonymously", then: "where_ok" },
      { when: "linkedin", always: true, then: "where_ok" },
      { when: "publish_consent", always: true, then: "end_thanks" },
      { when: "improve", always: true, then: "end_private" },
    ],
    ending: { title: "Thank you ⭐", body: "That means a lot. We'll let you know where it ends up." },
    endings: [
      {
        ref: "end_private",
        title: "Thank you for telling us",
        body: "We'd rather hear this than not. Someone from the team will read it and may be in touch.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Where will testimonials be published, and does the list of places match?",
        "Do you want photos and LinkedIn links, or only written quotes?",
        "What rating should count as low enough to ask for private feedback instead?",
        "Who follows up with a customer who shares a bad experience?",
      ],
      howToUseResponses:
        "Pick quotes that mention a before and an after; they persuade far more than general praise. Only publish in the places each person ticked, and keep the consent with the quote in case anyone asks. Treat every low-rating response as a support case: reply personally within a few days, and look for patterns across them before the next round of requests.",
      customizeSteps: [
        "Change the list of places a quote can appear to where you actually use testimonials.",
        "Adjust the rating that routes to private feedback if you want to be stricter or looser.",
        "Send the link at a high point, such as right after a result lands, rather than months later.",
      ],
      faqs: [
        {
          q: "How do I ask a customer for a testimonial?",
          a: "Ask soon after a good result, keep it short, and give them questions to answer instead of a blank page. Asking about the before and after gets you a story rather than a compliment.",
        },
        {
          q: "Do I need permission to publish a testimonial?",
          a: "It is safest to have it in writing before you publish. This form asks where the quote may appear and how the person wants to be credited before they agree.",
        },
        {
          q: "What questions should a testimonial form ask?",
          a: "What things were like before, what working together was like, any result they can share, how they want to be credited and where the quote can be used.",
        },
        {
          q: "What happens if a customer gives a low rating?",
          a: "They are asked privately what went wrong and skip the testimonial questions, so you can follow up instead of collecting a quote you wouldn't use.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "user-registration-form",
    type: "form",
    category: "marketing",
    goals: ["onboard-clients"],
    roles: ["operations", "product-research", "marketing"],
    searchName: "User registration form",
    title: "User registration",
    icon: "UserPlus",
    metaDescription:
      "Register new users with their details, account type and how they plan to use your service. Teams add organisation details, and under-16s get a polite stop.",
    description: "Collect what you need to register and approve a new user.",
    blurb:
      "A registration form for anything that reviews sign-ups before giving access, such as a portal, a community or a beta. Individuals get a short path; people registering for a team add the organisation, their role and the team size. An age check at the start stops anyone under 16 with a friendly ending instead of an error.",
    tags: ["user registration form", "account registration", "sign up form", "access request", "branching"],
    greeting: "Welcome! Register here and we'll review your details before your access is switched on. It takes a minute or two.",
    questions: [
      {
        ref: "age_ok",
        type: "yes_no",
        title: "Are you 16 or older?",
        required: true,
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name and email",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "country",
        type: "address",
        title: "Which country are you in?",
        required: true,
        fields: ["country"],
      },
      {
        ref: "account_type",
        type: "single_select",
        title: "Who are you registering for?",
        required: true,
        options: [{ label: "Just me" }, { label: "My team or organisation" }],
      },

      // Team
      { ref: "org_name", type: "short_text", title: "What's the organisation called?", required: true, maxLength: 150 },
      { ref: "job_role", type: "short_text", title: "What's your role there?", required: true, maxLength: 120 },
      {
        ref: "team_size",
        type: "single_select",
        title: "How many people would use it?",
        required: true,
        options: [{ label: "2–5" }, { label: "6–20" }, { label: "21–100" }, { label: "More than 100" }],
      },

      // Everyone
      {
        ref: "use_case",
        type: "long_text",
        title: "What are you hoping to use it for?",
        description: "A sentence or two helps us approve you faster.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "found_us",
        type: "dropdown",
        title: "How did you hear about us?",
        required: false,
        options: [{ label: "A friend or colleague" }, { label: "Search" }, { label: "Social media" }, { label: "An article or podcast" }, { label: "Somewhere else" }],
      },
      { ref: "invite_code", type: "short_text", title: "Do you have an invite or referral code?", required: false, maxLength: 40 },
      {
        ref: "updates",
        type: "multi_select",
        title: "Apart from account notices, what would you like us to email you about?",
        required: false,
        minSelections: 0,
        maxSelections: 3,
        options: [{ label: "Product updates" }, { label: "Tips and guides" }, { label: "Events and webinars" }],
      },
      {
        ref: "terms",
        type: "legal_consent",
        title: "Terms and privacy",
        required: true,
        consentText: "I agree to the terms of use and have read the privacy policy.",
      },
    ],
    branches: [
      { when: "age_ok", is: false, then: "end_underage" },
      { when: "account_type", is: "Just me", then: "use_case" },
      { when: "account_type", is: "My team or organisation", then: "org_name" },
    ],
    ending: {
      title: "You're on the list ✅",
      body: "We review new registrations by hand and will email you as soon as your access is ready.",
    },
    endings: [
      {
        ref: "end_underage",
        title: "Thanks for your interest",
        body: "You need to be 16 or older to register. We'd love to see you back when you are.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What is the minimum age for your service, if there is one?",
        "Do you review each registration, or should access be automatic?",
        "Is the use-case question worth the extra step for your audience?",
        "Do teams need anything else from you, such as a billing contact?",
      ],
      howToUseResponses:
        "Review new registrations in the dashboard in the order they arrive and approve against the use-case answer. Team sign-ups with a larger team size are worth a personal reply, since they are often the start of a bigger account. Only email people about the topics they ticked, and export the list to CSV when you set up their accounts.",
      customizeSteps: [
        "Change the age question to your own minimum age, or remove it if it doesn't apply.",
        "Link your terms of use and privacy policy in the consent question.",
        "Put the form on your sign-up page and write an ending that says how long approval takes.",
      ],
      faqs: [
        {
          q: "What information should a user registration form collect?",
          a: "Only what you need to create and approve the account: name, email, country and what they want to use it for. Add organisation details only for team sign-ups.",
        },
        {
          q: "Does this form create user accounts automatically?",
          a: "No. It collects registrations so you can review them and set up access in your own system.",
        },
        {
          q: "Should a registration form ask for a password?",
          a: "No. Never collect passwords in a form. Send a secure invite or sign-in link once the account is approved.",
        },
        {
          q: "How do I handle age limits on registration?",
          a: "Ask first. In this form, anyone who says they are under the age limit is shown a friendly ending before any personal details are asked for.",
        },
      ],
    },
  }),
];
