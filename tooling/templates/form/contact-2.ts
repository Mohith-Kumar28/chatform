import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_CONTACT_2: TemplateSeed[] = [
  defineTemplate({
    slug: "inquiry-form",
    type: "form",
    category: "contact",
    goals: ["generate-leads"],
    roles: ["operations", "customer-success", "sales"],
    searchName: "Inquiry form",
    title: "General inquiry",
    icon: "Inbox",
    metaDescription:
      "An inquiry form that takes a subject line and a question, asks for a date when it's about availability or a reference when it's about a booking, then how to reply.",
    description: "Take any question from your website and know who should answer it before you open it.",
    blurb:
      "Reads like an email with the useful parts filled in: a topic, a one-line subject, the question, how soon it needs an answer and how to reply. A question about prices or availability asks for the date in mind, one about an existing booking asks for its reference, and only people who want a call are asked for a number.",
    tags: ["inquiry form", "enquiry form", "website inquiry", "general questions", "branching"],
    greeting: "Hi there. Ask us anything and we'll get it to the right person.",
    questions: [
      { ref: "name", type: "short_text", title: "First, what's your name?", required: true, maxLength: 100 },
      {
        ref: "topic",
        type: "single_select",
        title: "What's your inquiry about?",
        required: true,
        options: [
          { label: "Our products or services" },
          { label: "Prices and availability" },
          { label: "A booking or order I've already made" },
          { label: "Jobs or volunteering" },
          { label: "Something else" },
        ],
      },

      // Existing bookings and orders
      {
        ref: "reference",
        type: "short_text",
        title: "What's the order, booking or account number?",
        description: "It's on your confirmation email or invoice. Skip this if you can't find it.",
        required: false,
        maxLength: 60,
      },

      // Prices and availability
      {
        ref: "wanted_date",
        type: "date",
        title: "Is there a date you're asking about?",
        description: "Skip this if your question isn't tied to a date.",
        required: false,
        disablePast: true,
      },

      // Everyone
      {
        ref: "subject",
        type: "short_text",
        title: "In a few words, what's the subject?",
        description: "Like the subject line of an email.",
        required: true,
        maxLength: 120,
      },
      {
        ref: "message",
        type: "long_text",
        title: "Go ahead, what would you like to know?",
        description: "The more detail you give, the fewer emails it takes to answer.",
        required: true,
        maxLength: 2000,
      },
      {
        ref: "urgency",
        type: "single_select",
        title: "How soon do you need an answer?",
        required: true,
        options: [{ label: "Today if possible" }, { label: "This week" }, { label: "No rush" }],
      },
      {
        ref: "reply_by",
        type: "single_select",
        title: "How should we reply?",
        required: true,
        options: [{ label: "Email" }, { label: "Phone call" }],
      },

      // Phone call
      { ref: "phone", type: "phone", title: "What number should we call?", required: true },
      {
        ref: "best_time",
        type: "single_select",
        title: "When's the best time to reach you?",
        required: false,
        options: [{ label: "Morning" }, { label: "Afternoon" }, { label: "Evening" }, { label: "Any time" }],
      },

      // Everyone
      {
        ref: "email",
        type: "email",
        title: "What email address should we use?",
        description: "Even if we call, we'll send anything written here.",
        required: true,
      },
    ],
    branches: [
      { when: "topic", is: "Our products or services", then: "subject" },
      { when: "topic", is: "Prices and availability", then: "wanted_date" },
      { when: "topic", is: "A booking or order I've already made", then: "reference" },
      { when: "topic", is: "Jobs or volunteering", then: "subject" },
      { when: "topic", is: "Something else", then: "subject" },
      { when: "reference", always: true, then: "subject" },
      { when: "reply_by", is: "Email", then: "email" },
      { when: "reply_by", is: "Phone call", then: "phone" },
    ],
    ending: {
      title: "Got it, thank you",
      body: "Your inquiry is with the right person now, and they'll reply the way you asked.",
    },
    guide: {
      questionsToConsider: [
        "Which topics go to different people on your team, and do the options match those people?",
        "Do you actually call people back, or should the phone option come out?",
        "What reference number would help you find an existing booking or order fast?",
        "Are your prices and availability tied to dates, or should the date question come out?",
      ],
      howToUseResponses:
        "Sort new inquiries by topic in the dashboard and hand each group to its owner, so nothing sits in a shared inbox waiting for someone to claim it. Answer the ones marked today first. Every month, look at which topic comes up most and at the questions people keep asking: those are the answers your website should already give.",
      customizeSteps: [
        "Rewrite the topic options to match how your business is really split, keeping the list to five or fewer.",
        "Change the reference question to whatever number your customers have, such as an invoice, booking or account number.",
        "Embed the form on your contact page or link it from your footer, and send yourself a test inquiry on your phone.",
      ],
      faqs: [
        {
          q: "What should an inquiry form include?",
          a: "A name, the topic, a short subject, the question itself and a way to reply. Anything more should only be asked when it helps, like a booking reference or the date someone wants.",
        },
        {
          q: "What's the difference between an inquiry form and a contact form?",
          a: "They are close to the same thing. An inquiry form usually expects a question that needs a proper answer, so it asks a little more about the topic and how soon the reply is needed.",
        },
        {
          q: "Should an inquiry form ask for a phone number?",
          a: "Only from people who want a call. This form asks for a number and a good time only when someone picks a phone reply.",
        },
        {
          q: "Can I put this inquiry form on my website?",
          a: "Yes. Choosing Use this template copies it into your account, where you can edit every question, then share it as a link or embed it on any page.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "catering-contact-form",
    type: "form",
    category: "contact",
    goals: ["generate-leads"],
    roles: ["sales", "operations"],
    searchName: "Catering contact form",
    title: "Catering contact",
    icon: "ChefHat",
    metaDescription:
      "A catering contact form that gets the date, venue, guest count, service style and dietary needs up front, so your first reply can include a real quote.",
    description: "Hear about the event, the guests and the food before you pick up the phone.",
    blurb:
      "Asks what a caterer needs to judge fit and price a job: the occasion, date, venue, headcount, service style and dietary needs. Wedding enquiries are also asked whether they want a tasting, and a budget question stops you proposing a plated dinner to someone who wanted sandwiches.",
    tags: ["catering contact form", "catering enquiry", "event catering", "caterer", "branching"],
    greeting: "Planning an event? Tell us a bit about it and we'll come back with ideas and a quote.",
    questions: [
      {
        ref: "occasion",
        type: "single_select",
        title: "What's the occasion?",
        required: true,
        options: [
          { label: "Wedding" },
          { label: "Work event or meeting" },
          { label: "Birthday or private party" },
          { label: "Memorial or wake" },
          { label: "Something else" },
        ],
      },

      // Weddings
      {
        ref: "tasting",
        type: "yes_no",
        title: "Would you like to come in for a tasting before you decide?",
        required: false,
        yesLabel: "Yes, please",
        noLabel: "Not needed",
      },

      // Everyone
      { ref: "event_date", type: "date", title: "When is the event?", required: true, disablePast: true },
      {
        ref: "venue",
        type: "address",
        title: "Where will it be held?",
        description: "A town or postcode is enough if the venue isn't booked yet.",
        required: false,
        fields: ["street", "city", "postal"],
      },
      {
        ref: "guests",
        type: "number",
        title: "Roughly how many guests are you expecting?",
        required: true,
        min: 1,
        integerOnly: true,
      },
      {
        ref: "service_style",
        type: "single_select",
        title: "What kind of service do you have in mind?",
        required: true,
        options: [
          { label: "Drop-off, we'll serve ourselves" },
          { label: "Buffet with staff" },
          { label: "Plated, served at the table" },
          { label: "Canapés and bowl food" },
          { label: "Not sure yet" },
        ],
      },
      {
        ref: "meals",
        type: "multi_select",
        title: "Which meals or courses should we cover?",
        required: true,
        options: [
          { label: "Breakfast or brunch" },
          { label: "Lunch" },
          { label: "Dinner" },
          { label: "Snacks and nibbles" },
          { label: "Desserts or cake" },
          { label: "Drinks" },
        ],
      },
      {
        ref: "dietary",
        type: "multi_select",
        title: "Any dietary needs among the guests?",
        required: false,
        options: [
          { label: "Vegetarian" },
          { label: "Vegan" },
          { label: "Gluten-free" },
          { label: "Halal" },
          { label: "Kosher" },
          { label: "Nut or other allergies" },
          { label: "None that we know of" },
        ],
      },
      {
        ref: "food_ideas",
        type: "long_text",
        title: "Any cuisines, dishes or themes you'd love to see?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "budget",
        type: "single_select",
        title: "Which budget fits best?",
        required: false,
        options: [
          { label: "Keep it simple and affordable" },
          { label: "Somewhere in the middle" },
          { label: "Happy to spend for something special" },
          { label: "I'd like to see options first" },
        ],
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should we send ideas and a quote to?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
    ],
    branches: [
      { when: "occasion", is: "Wedding", then: "tasting" },
      { when: "occasion", is: "Work event or meeting", then: "event_date" },
      { when: "occasion", is: "Birthday or private party", then: "event_date" },
      { when: "occasion", is: "Memorial or wake", then: "event_date" },
      { when: "occasion", is: "Something else", then: "event_date" },
    ],
    ending: {
      title: "Thanks, we have everything we need 🍽️",
      body: "We'll check the date and come back with menu ideas and a quote.",
    },
    guide: {
      questionsToConsider: [
        "How far do you travel, and should the venue question say so before people fill it in?",
        "What is your smallest and largest job, so the guest count question can flag what you can't take on?",
        "Which service styles do you actually offer, and which should come off the list?",
        "Do you run tastings for anything other than weddings?",
        "Do you need to know about kitchen access at the venue before quoting?",
      ],
      howToUseResponses:
        "Check the date and headcount first: they tell you whether you can take the job at all. For the ones you can, the service style, meals and budget are enough to send a first quote or two menu options without a phone call. Keep an eye on the dietary answers when you build the menu, and book wedding tastings early because those dates fill up.",
      customizeSteps: [
        "Edit the service styles and meals to match your menus, and remove anything you don't do.",
        "Add a note to the venue question about your travel area, or a question about kitchen access if you cook on site.",
        "Put the form on your website's catering or events page, and reply to each enquiry from the dashboard the same day if you can.",
      ],
      faqs: [
        {
          q: "What should a catering contact form ask?",
          a: "The date, the venue, the number of guests, the kind of service and any dietary needs. With those five you can say whether you are free and give a rough price.",
        },
        {
          q: "How is a catering contact form different from a catering order form?",
          a: "A contact form starts the conversation before anything is agreed. An order form comes later and records the final menu, quantities and delivery details.",
        },
        {
          q: "Should I ask for a budget on a catering enquiry?",
          a: "Yes, but gently. Asking in plain words instead of numbers gets more honest answers and still tells you whether to propose a buffet or a plated dinner.",
        },
        {
          q: "Can I change the questions to fit my catering business?",
          a: "Yes. Choosing Use this template copies it into your account, where you can edit every question and option, then share it by link or embed it on your site.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "client-consultation-form",
    type: "form",
    category: "contact",
    goals: ["onboard-clients", "generate-leads"],
    roles: ["freelancers-agencies", "sales"],
    searchName: "Client consultation form",
    title: "Client consultation",
    icon: "Handshake",
    metaDescription:
      "A client consultation form that collects the problem, what they've tried, the outcome they want, timing and budget, so the first call starts at the real issue.",
    description: "Learn the problem and the goal before the first call, not during it.",
    blurb:
      "Built to prepare a first consultation: what the client needs help with, what they have already tried, what success looks like and what matters most to them. Clients who are only exploring get a friendly close with no call pushed on them, and everyone else picks a day for the conversation.",
    tags: ["client consultation form", "consultation request", "client intake", "discovery call", "branching"],
    greeting: "Thanks for getting in touch. A few questions now means we can skip the basics on our call.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Let's start with who you are.",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "What's your business or organisation called, if you have one?", required: false, maxLength: 120 },
      {
        ref: "who_for",
        type: "single_select",
        title: "Who is this for?",
        required: true,
        options: [{ label: "Just me" }, { label: "My team or company" }, { label: "A client of mine" }],
      },
      {
        ref: "problem",
        type: "long_text",
        title: "What do you need help with?",
        description: "Describe the problem the way you'd explain it to a colleague.",
        required: true,
        maxLength: 2000,
      },
      {
        ref: "tried_before",
        type: "yes_no",
        title: "Have you already tried to solve this some other way?",
        required: true,
      },
      {
        ref: "what_tried",
        type: "long_text",
        title: "What did you try, and why didn't it work out?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "outcome",
        type: "long_text",
        title: "Picture this going well. What's different in three months?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Put these in order of what matters most to you.",
        required: false,
        items: ["Getting it done fast", "Keeping the cost down", "The quality of the result", "Support after we finish"],
      },
      {
        ref: "budget",
        type: "single_select",
        title: "Have you set a budget for this?",
        required: false,
        options: [
          { label: "Yes, and it's fixed" },
          { label: "Yes, with some room" },
          { label: "Not yet" },
        ],
      },
      {
        ref: "files",
        type: "file_upload",
        title: "Anything useful to look at before we talk? A brief, a report or screenshots.",
        required: false,
        accept: ["application/pdf", "image/*", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"],
        maxFiles: 5,
        maxSizeMB: 20,
      },
      {
        ref: "timeline",
        type: "single_select",
        title: "When are you hoping to get started?",
        required: true,
        options: [
          { label: "As soon as possible" },
          { label: "Within a month" },
          { label: "In the next few months" },
          { label: "Just exploring for now" },
        ],
      },
      {
        ref: "call_date",
        type: "date",
        title: "Which day would suit you for a consultation call?",
        required: true,
        disablePast: true,
      },
      { ref: "phone", type: "phone", title: "And the best number to reach you on that day?", required: false },
    ],
    branches: [
      { when: "tried_before", is: true, then: "what_tried" },
      { when: "tried_before", is: false, then: "outcome" },
      { when: "timeline", is: "Just exploring for now", then: "end_exploring" },
    ],
    ending: {
      title: "Thanks, we'll be in touch",
      body: "We'll read your answers before we confirm a time, so the call can start with the real work.",
    },
    endings: [
      {
        ref: "end_exploring",
        title: "Thanks for telling us all this",
        body: "No call needed yet. We'll email you a few thoughts on what you've described, and you can book a consultation whenever you're ready.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What do you need to know to decide whether you're the right fit, before you spend an hour on a call?",
        "Is the budget question useful to you, or would it put your kind of client off?",
        "What files would genuinely help you prepare, and what would you never read?",
        "How do you want to treat people who are only exploring: an email, a guide, or a later follow-up?",
      ],
      howToUseResponses:
        "Read each response the day before the call and write down two or three questions the answers raise, especially where the outcome and the budget don't match. Use the ranking to shape your proposal: someone who puts cost first wants a different offer from someone who puts quality first. Reply to the people who are only exploring within a few days, while they still remember filling it in.",
      customizeSteps: [
        "Rewrite the problem and outcome questions in the language of your service, such as a website, a tax return or a hiring plan.",
        "Change the ranking items to the trade-offs your clients actually weigh up.",
        "Send the link from your booking or contact page, and add a line to your calendar invite asking people to fill it in first.",
      ],
      faqs: [
        {
          q: "What should a client consultation form include?",
          a: "Who the client is, the problem they want solved, what they've tried, the result they want, and their timing and budget. That is enough to prepare without turning it into a full onboarding.",
        },
        {
          q: "How long should a client consultation form be?",
          a: "Short enough to finish in a few minutes. Save detailed delivery questions for onboarding, after you've agreed to work together.",
        },
        {
          q: "Is a consultation form the same as a client intake form?",
          a: "Not quite. A consultation form prepares one conversation about fit, while an intake form collects everything you need once the work has started.",
        },
        {
          q: "Can clients upload documents with this form?",
          a: "Yes. There is an optional upload question for briefs, reports or screenshots, and you can change the file types it accepts.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "designer-contact-form",
    type: "form",
    category: "contact",
    goals: ["generate-leads"],
    roles: ["freelancers-agencies"],
    searchName: "Designer contact form",
    title: "Design project enquiry",
    icon: "Palette",
    metaDescription:
      "A contact form for designers: what the client wants made, where it will be used, the look they're after, deadline and budget, plus their brand files or references.",
    description: "Get a usable design brief out of every enquiry, not a two-line email.",
    blurb:
      "Asks what a designer needs before quoting: the deliverables, where the work will live, the look the client is after, the deadline and the budget. Clients with an existing brand are asked to upload their files, and those starting fresh are asked for designs they admire instead.",
    tags: ["designer contact form", "graphic design enquiry", "freelance designer", "design brief", "branching"],
    greeting: "Hi! Tell me about the project and I'll get back to you with next steps.",
    questions: [
      {
        ref: "deliverables",
        type: "multi_select",
        title: "What would you like designed?",
        required: true,
        allowOther: true,
        options: [
          { label: "Logo or brand identity" },
          { label: "Website or app screens" },
          { label: "Packaging" },
          { label: "Print, like flyers or brochures" },
          { label: "Social media graphics" },
          { label: "Illustration" },
        ],
      },
      {
        ref: "where_used",
        type: "multi_select",
        title: "Where will people see it?",
        required: true,
        options: [
          { label: "Online" },
          { label: "In print" },
          { label: "On products or packaging" },
          { label: "Signs or at events" },
        ],
      },
      {
        ref: "about",
        type: "long_text",
        title: "Tell me about the business or project behind it.",
        description: "Who it's for and what you want them to feel or do.",
        required: true,
        maxLength: 2000,
      },
      {
        ref: "look",
        type: "opinion_scale",
        title: "What kind of look are you after?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Quiet and minimal",
        labelHigh: "Bold and loud",
      },
      {
        ref: "has_brand",
        type: "yes_no",
        title: "Do you already have brand guidelines, a logo or colours to work with?",
        required: true,
      },

      // Existing brand
      {
        ref: "brand_files",
        type: "file_upload",
        title: "Upload what you have: logo files, guidelines or past work.",
        required: false,
        accept: ["image/*", "application/pdf", ".ai", ".eps", ".svg", ".zip"],
        maxFiles: 5,
        maxSizeMB: 50,
      },

      // Everyone
      {
        ref: "references",
        type: "long_text",
        title: "Any designs you love, or hate? Links or names are perfect.",
        required: false,
        maxLength: 1000,
      },
      { ref: "deadline", type: "date", title: "When do you need it by?", required: false, disablePast: true },
      {
        ref: "budget",
        type: "single_select",
        title: "Which best describes your budget?",
        required: false,
        options: [
          { label: "Small, one piece done well" },
          { label: "Medium, a few connected pieces" },
          { label: "Larger, a full identity or site" },
          { label: "Not sure yet, I'd like a quote" },
        ],
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "How can I reach you?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
    ],
    branches: [
      { when: "has_brand", is: true, then: "brand_files" },
      { when: "has_brand", is: false, then: "references" },
    ],
    ending: {
      title: "Thanks, this is a great start ✏️",
      body: "I'll look through everything and reply with questions or a proposal.",
    },
    guide: {
      questionsToConsider: [
        "Which deliverables do you actually take on, and which should come off the list?",
        "Do you want to see a budget before replying, or would you rather quote first?",
        "What file types do your clients usually have, and do you need source files?",
        "Is there a minimum lead time you should mention near the deadline question?",
      ],
      howToUseResponses:
        "Read the project description and the look scale together: they tell you quickly whether the style is one you want in your portfolio. Put the deadline next to your calendar before replying, and if it's tight, say so in the first message. Reuse the answers as the opening of your proposal so the client can see you listened.",
      customizeSteps: [
        "Edit the deliverables list to the services you offer, and change the greeting to your own voice.",
        "Adjust the budget options to the size of project you usually take on.",
        "Link the form from your portfolio and social profiles, or embed it on your contact page.",
      ],
      faqs: [
        {
          q: "What should a designer's contact form ask?",
          a: "What needs designing, where it will be used, the style, the deadline and the budget. Asking for existing brand files or reference designs saves a round of emails.",
        },
        {
          q: "Should a freelance designer ask about budget on a contact form?",
          a: "It helps you avoid quoting blind. Plain options like small, medium and larger get more answers than a box asking for a figure.",
        },
        {
          q: "Can clients send files through a designer contact form?",
          a: "Yes. This one asks clients with an existing brand to upload logos or guidelines, and you can change which file types it accepts.",
        },
        {
          q: "Can I add this form to my portfolio site?",
          a: "Yes. Choosing Use this template copies it into your account, where you can edit every question, then share it as a link or embed it on your website.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "photography-contact-form",
    type: "form",
    category: "contact",
    goals: ["generate-leads"],
    roles: ["freelancers-agencies"],
    searchName: "Photography contact form",
    title: "Photography enquiry",
    icon: "Camera",
    metaDescription:
      "A photography contact form that asks the type of shoot, date, location and how the photos will be used, with extra questions for weddings and commercial work.",
    description: "Check your calendar and send a quote from the first message.",
    blurb:
      "Starts with the type of shoot, because a wedding and a product shoot need different answers. Couples are asked how much of the day to cover, commercial clients are asked where the images will be used and how many they need, and everyone gives the date, place and style.",
    tags: ["photography contact form", "photographer enquiry", "photo shoot booking", "wedding photography", "branching"],
    greeting: "Hi! Tell me about the shoot you have in mind and I'll check my availability.",
    questions: [
      {
        ref: "shoot_type",
        type: "single_select",
        title: "What kind of shoot is it?",
        required: true,
        options: [
          { label: "Wedding or elopement" },
          { label: "Portrait, couple or family" },
          { label: "Event" },
          { label: "Product or commercial" },
          { label: "Headshots" },
          { label: "Something else" },
        ],
      },

      // Weddings
      {
        ref: "coverage",
        type: "single_select",
        title: "How much of the day would you like covered?",
        required: true,
        options: [
          { label: "Ceremony only" },
          { label: "Ceremony and portraits" },
          { label: "Getting ready through to first dance" },
          { label: "The whole day" },
        ],
      },

      // Commercial
      {
        ref: "usage",
        type: "multi_select",
        title: "Where will the photos be used?",
        required: true,
        options: [
          { label: "Website or online shop" },
          { label: "Social media" },
          { label: "Print ads or brochures" },
          { label: "Packaging" },
          { label: "Press" },
        ],
      },
      {
        ref: "image_count",
        type: "number",
        title: "Roughly how many final images do you need?",
        required: false,
        min: 1,
        integerOnly: true,
      },

      // Everyone
      { ref: "shoot_date", type: "date", title: "What date are you thinking of?", required: true, disablePast: true },
      {
        ref: "date_flexible",
        type: "yes_no",
        title: "Is the date flexible?",
        required: false,
        yesLabel: "Yes, a little",
        noLabel: "No, it's fixed",
      },
      {
        ref: "location",
        type: "address",
        title: "Where will the shoot be?",
        description: "A town is fine if you haven't picked the spot yet.",
        required: false,
        fields: ["city", "state", "country"],
      },
      {
        ref: "people",
        type: "number",
        title: "How many people will be in the photos?",
        required: false,
        min: 0,
        integerOnly: true,
      },
      {
        ref: "style",
        type: "long_text",
        title: "Describe the feel you want, or share a link to photos you love.",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "budget",
        type: "single_select",
        title: "Do you have a budget in mind?",
        required: false,
        options: [
          { label: "Yes, I have a set amount" },
          { label: "Roughly, but I'm flexible" },
          { label: "Not yet, I'd like your packages" },
        ],
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should I send availability and prices to?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "heard_from",
        type: "dropdown",
        title: "How did you find me?",
        required: false,
        options: [
          { label: "Search engine" },
          { label: "Social media" },
          { label: "A friend or past client" },
          { label: "A venue or planner" },
          { label: "Somewhere else" },
        ],
      },
    ],
    branches: [
      { when: "shoot_type", is: "Wedding or elopement", then: "coverage" },
      { when: "shoot_type", is: "Portrait, couple or family", then: "shoot_date" },
      { when: "shoot_type", is: "Event", then: "shoot_date" },
      { when: "shoot_type", is: "Product or commercial", then: "usage" },
      { when: "shoot_type", is: "Headshots", then: "shoot_date" },
      { when: "shoot_type", is: "Something else", then: "shoot_date" },
      { when: "coverage", always: true, then: "shoot_date" },
    ],
    ending: {
      title: "Thanks, I'll check the date 📸",
      body: "You'll hear back soon with availability and the packages that fit your shoot.",
    },
    guide: {
      questionsToConsider: [
        "Which kinds of shoot do you take on, and which would you rather not be asked about?",
        "How far will you travel, and should the location question mention it?",
        "Do commercial clients need to tell you about usage rights up front, or will you cover that in the quote?",
        "Would you rather share packages first or ask about budget first?",
      ],
      howToUseResponses:
        "Check the date and whether it's flexible before anything else, since that decides whether you reply with a quote or a polite no. Use the coverage and usage answers to pick which package or licence to send. The how did you find me question shows you over time which venues, planners and past clients send the most work, so you know who to thank.",
      customizeSteps: [
        "Edit the shoot types to your specialities and the coverage options to the packages you sell.",
        "Change the budget options or remove the question if you publish your prices.",
        "Put the form on your website's contact page and link it from your social profiles.",
      ],
      faqs: [
        {
          q: "What should a photography contact form ask?",
          a: "The type of shoot, the date, the location, how many people and how the photos will be used. For weddings, add how much of the day to cover.",
        },
        {
          q: "Why ask how the photos will be used?",
          a: "Commercial use affects the licence and the price. Knowing whether images are for a website, print or packaging lets you quote correctly the first time.",
        },
        {
          q: "Should I ask for a budget on a photography enquiry?",
          a: "A soft question works best. Clients who haven't set a budget can simply ask for your packages instead.",
        },
        {
          q: "Can I use this form for weddings and portraits at the same time?",
          a: "Yes. The first question sends couples to wedding coverage and commercial clients to usage questions, while portraits and events go straight to the date.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "responsive-contact-form",
    type: "form",
    category: "contact",
    goals: [],
    roles: ["operations", "marketing"],
    searchName: "Responsive contact form",
    title: "Mobile-friendly contact",
    icon: "Smartphone",
    metaDescription:
      "A short contact form that works on a phone as well as a laptop: tap to pick a reason, type the message, pick how to hear back. Problem reports can add a screenshot.",
    description: "A contact form built for thumbs: few questions, big choices, no tiny fields.",
    blurb:
      "Kept short for small screens: one question at a time, tap answers wherever possible, and the message is the only long answer. Someone reporting a problem is asked which device they are on and can attach a screenshot, and only people who want a call are asked for a number.",
    tags: ["responsive contact form", "mobile contact form", "website contact", "contact us", "branching"],
    greeting: "Hello! This will only take a minute.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 100 },
      {
        ref: "reason",
        type: "single_select",
        title: "What can we help with?",
        required: true,
        options: [
          { label: "A question" },
          { label: "Something isn't working" },
          { label: "Feedback or an idea" },
          { label: "Something else" },
        ],
      },

      // Problems
      {
        ref: "device",
        type: "single_select",
        title: "What are you using?",
        required: false,
        options: [{ label: "Phone" }, { label: "Tablet" }, { label: "Computer" }],
      },
      {
        ref: "screenshot",
        type: "file_upload",
        title: "Got a screenshot? Add it here.",
        required: false,
        accept: ["image/*"],
        maxFiles: 3,
        maxSizeMB: 10,
      },

      // Everyone
      { ref: "message", type: "long_text", title: "Tell us more.", required: true, maxLength: 1500 },
      {
        ref: "reply_by",
        type: "single_select",
        title: "How would you like to hear back?",
        required: true,
        options: [{ label: "Email" }, { label: "Phone call" }, { label: "No reply needed" }],
      },
      { ref: "phone", type: "phone", title: "What's the best number?", required: true },
      { ref: "email", type: "email", title: "What's your email?", required: true },
    ],
    branches: [
      { when: "reason", is: "A question", then: "message" },
      { when: "reason", is: "Something isn't working", then: "device" },
      { when: "reason", is: "Feedback or an idea", then: "message" },
      { when: "reason", is: "Something else", then: "message" },
      { when: "reply_by", is: "Email", then: "email" },
      { when: "reply_by", is: "Phone call", then: "phone" },
      { when: "reply_by", is: "No reply needed", then: "end_no_reply" },
    ],
    ending: {
      title: "Thanks, message received",
      body: "We'll get back to you the way you asked.",
    },
    endings: [
      {
        ref: "end_no_reply",
        title: "Thanks for letting us know",
        body: "Your message has reached the team, and we read every one.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Which reasons for getting in touch come up most, and are they the first options on the list?",
        "Is there any question you could turn into a tap instead of typing?",
        "Do you really need a screenshot for problem reports, or is a description enough?",
        "Do you offer phone replies, or should that option come out?",
      ],
      howToUseResponses:
        "Deal with the problem reports first, and look at the device answers to spot a fault that only happens on phones or tablets. Questions get a reply by the channel the person picked. Feedback marked as no reply needed still deserves a read: group it by theme in the dashboard or export it to CSV once a month.",
      customizeSteps: [
        "Edit the reasons to match what people usually contact you about, keeping four or fewer so they fit on a phone screen.",
        "Remove the phone option if you only reply by email, and the form gets one question shorter.",
        "Embed the form on your contact page, then open that page on your own phone and send a test message.",
      ],
      faqs: [
        {
          q: "What makes a contact form responsive?",
          a: "It fits any screen without zooming or sideways scrolling, and its fields are easy to tap. Asking one question at a time, as this form does, suits a small screen well.",
        },
        {
          q: "How do I make a contact form easier to fill in on a phone?",
          a: "Ask fewer questions, use choices people can tap instead of boxes they have to type in, and only ask for a phone number from people who want a call.",
        },
        {
          q: "Can I embed this contact form on my website?",
          a: "Yes. Choosing Use this template copies it into your account, where you can edit every question, then embed it on your page or share it as a link.",
        },
        {
          q: "Can people attach a screenshot to a contact form?",
          a: "Yes. This form offers an optional screenshot upload to anyone reporting a problem, and you can change the file types it accepts.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "contact-us",
    type: "form",
    category: "contact",
    goals: ["generate-leads", "collect-feedback"],
    roles: ["operations", "marketing", "customer-success"],
    searchName: "Contact us form",
    title: "Contact us",
    icon: "MessageCircle",
    metaDescription:
      "A contact us form for any website. Buyers pick the next step, support asks for the account, feedback gets a star rating and job seekers can share a profile link.",
    description: "A general contact form that sorts the inbox as it fills it.",
    blurb:
      "The one form every site needs. The topic decides which follow-ups are worth asking: a buyer says whether they want a price, a demo or just an answer, support asks for the account email, feedback starts with a star rating, and job seekers share the role and a profile link. A call back is offered to everyone, with a time slot.",
    tags: ["contact us form", "website contact form", "general enquiry", "contact page", "branching"],
    greeting: "Hi! What can we help you with?",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Let's start with your name and email.",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "topic",
        type: "single_select",
        title: "What's it about?",
        required: true,
        options: [
          { label: "Buying from us" },
          { label: "Help with something" },
          { label: "Feedback" },
          { label: "Working here" },
          { label: "Something else" },
        ],
      },

      // Buying
      {
        ref: "next_step",
        type: "single_select",
        title: "What would help you most right now?",
        required: true,
        options: [
          { label: "A price or a quote" },
          { label: "A demo or a walkthrough" },
          { label: "An answer to a question first" },
        ],
      },
      { ref: "company", type: "short_text", title: "Which company are you with, if any?", required: false, maxLength: 120 },

      // Help
      { ref: "account_email", type: "email", title: "The email on your account, if it's different?", required: false },

      // Feedback
      {
        ref: "experience",
        type: "rating",
        title: "Overall, how has your experience with us been?",
        required: true,
        scale: 5,
        shape: "star",
      },

      // Careers
      {
        ref: "career_interest",
        type: "dropdown",
        title: "What kind of role are you interested in?",
        required: false,
        options: [
          { label: "Engineering" },
          { label: "Design" },
          { label: "Product" },
          { label: "Sales" },
          { label: "Operations" },
          { label: "Open application" },
        ],
      },
      {
        ref: "profile_link",
        type: "url",
        title: "A link to your CV, portfolio or online profile?",
        required: false,
      },

      // Everyone
      { ref: "message", type: "long_text", title: "What would you like to tell us?", required: true, maxLength: 2000 },
      {
        ref: "callback",
        type: "yes_no",
        title: "Would you prefer a call back?",
        required: true,
        yesLabel: "Yes, please call",
        noLabel: "Email is fine",
      },
      { ref: "phone", type: "phone", title: "What's the best number?", required: true },
      {
        ref: "call_time",
        type: "single_select",
        title: "When should we try you?",
        required: false,
        options: [{ label: "Morning" }, { label: "Afternoon" }, { label: "Evening" }, { label: "Any time" }],
      },
    ],
    branches: [
      { when: "topic", is: "Buying from us", then: "next_step" },
      { when: "topic", is: "Help with something", then: "account_email" },
      { when: "topic", is: "Feedback", then: "experience" },
      { when: "topic", is: "Working here", then: "career_interest" },
      { when: "topic", is: "Something else", then: "message" },
      { when: "company", always: true, then: "message" },
      { when: "account_email", always: true, then: "message" },
      { when: "experience", always: true, then: "message" },
      { when: "callback", is: false, then: "end_thanks" },
    ],
    ending: { title: "Message sent 📨", body: "Thanks for getting in touch. The right person will reply soon." },
    guide: {
      questionsToConsider: [
        "Who reads each topic, and do the five options match how your team splits the work?",
        "Do you actually run demos, or should the buying options be price and question only?",
        "Do you have a careers page to point applicants to instead of taking applications here?",
        "Do you offer call backs, and in which of the time slots can someone really pick up the phone?",
      ],
      howToUseResponses:
        "Filter responses by topic in the dashboard and give each one an owner. Buyers who asked for a price or a demo are the warmest leads, so reply to them first. Read low star ratings the same day and reply personally, and ring call back requests in the slot people chose. Export to CSV at the end of each month to see which topic grows, since a rise in help requests often points at something on your site that needs fixing.",
      customizeSteps: [
        "Rename the topics to your own teams and delete any arm you don't need, such as careers.",
        "Edit the buying options to the next steps you really offer, such as a visit, a sample or a trial.",
        "Embed the form on your contact page or link your footer's contact button to it.",
      ],
      faqs: [
        {
          q: "What should a contact us form include?",
          a: "A name, an email, what the message is about and the message itself. Follow-up questions should depend on the topic, so someone leaving feedback isn't asked about their company.",
        },
        {
          q: "How many fields should a contact us form have?",
          a: "As few as you can manage. This one asks every visitor about four things and adds one or two more only when their topic needs them.",
        },
        {
          q: "Can a contact us form send messages to different teams?",
          a: "The topic question sorts every message as it arrives, so each team can filter the dashboard for its own topic and work through its list.",
        },
        {
          q: "Can I use this contact us form on my website?",
          a: "Yes. Choosing Use this template copies it into your account, where you can edit every question, then embed it on your site or share it as a link.",
        },
      ],
    },
  }),
];
