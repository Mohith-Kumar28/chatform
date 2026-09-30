import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_ORDER: TemplateSeed[] = [
  defineTemplate({
    slug: "service-order-form",
    type: "form",
    category: "order",
    goals: ["onboard-clients"],
    roles: ["operations", "freelancers-agencies", "sales"],
    searchName: "Service order form",
    title: "Service order",
    icon: "HardHat",
    metaDescription:
      "Take service orders with the job, the site address, timing and access notes in one place. Business customers add a PO number, and emergencies get their own path.",
    description: "Collect the job, the site and the timing so your team can plan the visit.",
    blurb:
      "Built for trades and field services that need more than a name and a phone number before they can quote or book a visit. Business customers are asked for a company name and purchase order, and anyone who picks the emergency option gets a safety check and a call-back ending instead of a date picker. Access notes and photos come before the timing question, so an emergency order still reaches the on-call team with everything they need.",
    tags: ["service order", "work order", "job request", "field service", "branching"],
    greeting: "Hi there. Tell us about the job and we'll get it planned.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, who should we contact about this order?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "customer_type",
        type: "single_select",
        title: "Is this for your home or for a business?",
        required: true,
        options: [{ label: "My home" }, { label: "A business" }],
      },

      // Business customers
      { ref: "company", type: "short_text", title: "What's the company name?", required: true, maxLength: 120 },
      {
        ref: "po_number",
        type: "short_text",
        title: "Do you have a purchase order number or quote reference?",
        description: "Leave it blank if you don't have one yet.",
        required: false,
        maxLength: 60,
      },

      // Everyone
      {
        ref: "service",
        type: "single_select",
        title: "What kind of work do you need?",
        required: true,
        allowOther: true,
        options: [
          { label: "Repair" },
          { label: "Installation" },
          { label: "Regular maintenance" },
          { label: "Inspection or assessment" },
          { label: "Cleaning" },
        ],
      },
      {
        ref: "details",
        type: "long_text",
        title: "Describe the job in a few sentences.",
        description: "What's wrong or what you want done, the make or model if there is one, and roughly how big the area is.",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "site_address",
        type: "address",
        title: "Where will the work take place?",
        required: true,
        fields: ["street", "city", "state", "postal"],
      },
      {
        ref: "access",
        type: "long_text",
        title: "Anything we should know about getting in and working on site?",
        description: "Parking, gate codes, key collection, pets, or rooms we shouldn't enter.",
        required: false,
        maxLength: 800,
      },
      {
        ref: "photos",
        type: "file_upload",
        title: "Got photos of the problem or the space? Add up to five.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
        maxSizeMB: 10,
      },
      {
        ref: "urgency",
        type: "single_select",
        title: "How soon do you need us?",
        required: true,
        options: [
          { label: "It's an emergency" },
          { label: "Within the next week" },
          { label: "Sometime this month" },
          { label: "I'm planning ahead" },
        ],
      },

      // Emergencies
      {
        ref: "hazard",
        type: "yes_no",
        title: "Is anything unsafe right now, such as a gas smell, flooding or exposed wiring?",
        description: "If so, keep everyone clear and call your local emergency number before anything else.",
        required: true,
      },

      // Planned work
      {
        ref: "preferred_date",
        type: "date",
        title: "Which date would suit you best?",
        description: "We'll confirm the actual date once we've checked the schedule.",
        required: false,
        disablePast: true,
      },
      {
        ref: "time_window",
        type: "multi_select",
        title: "Which times work for a visit?",
        required: false,
        minSelections: 0,
        maxSelections: 4,
        options: [{ label: "Mornings" }, { label: "Afternoons" }, { label: "Evenings" }, { label: "Weekends" }],
      },
    ],
    branches: [
      { when: "customer_type", is: "A business", then: "company" },
      { when: "customer_type", is: "My home", then: "service" },
      { when: "urgency", is: "It's an emergency", then: "hazard" },
      { when: "urgency", is: "Within the next week", then: "preferred_date" },
      { when: "urgency", is: "Sometime this month", then: "preferred_date" },
      { when: "urgency", is: "I'm planning ahead", then: "preferred_date" },
      { when: "hazard", always: true, then: "end_urgent" },
    ],
    ending: {
      title: "Order received ✅",
      body: "We'll check the details and send you a confirmed date and price. Nothing is booked until you hear back from us.",
    },
    endings: [
      {
        ref: "end_urgent",
        title: "We're on it",
        body: "Emergency orders go straight to the on-call team, and someone will phone you shortly on the number you gave us.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Which services do you actually offer, and should any of them lead to their own follow-up questions?",
        "Do you take emergency work, and who is on call to phone those customers back?",
        "Which details change your price, such as area size, number of units or access at height?",
        "Do business customers need a purchase order before you can invoice them?",
        "Should customers upload photos, and will someone look at them before the visit?",
      ],
      howToUseResponses:
        "Sort new orders by urgency first: emergencies need a phone call, not an email. For planned work, check the description and photos to decide who to send and what to bring, then reply with a confirmed date and price so the customer knows the order is accepted. Keep the purchase order number with the job so the invoice matches what the business expects.",
      customizeSteps: [
        "Replace the list of services with the work you do, and add a short description where two options could be confused.",
        "Rewrite the emergency ending with the real response you can promise, or remove the emergency option if you don't offer one.",
        "Share the link from your website's booking page or embed the form there, then test both the home and business paths.",
      ],
      faqs: [
        {
          q: "What should a service order form include?",
          a: "Who the customer is, what work they need, where it will happen, when they want it done and anything that affects access. Photos and a purchase order number help when you need to quote or invoice a business.",
        },
        {
          q: "What's the difference between a service order and a service request?",
          a: "A request asks whether you can help. An order describes specific work the customer wants done, which you then confirm with a date and price.",
        },
        {
          q: "Does a submitted order mean the job is booked?",
          a: "Not in this template. The ending tells customers you'll confirm the date and price, so nobody assumes a slot is held before you've checked.",
        },
        {
          q: "Can I take orders for more than one type of service?",
          a: "Yes. The service question lists each kind of work, and you can add a branch so one of them, such as installations, gets its own follow-up questions.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "catering-order-form",
    type: "form",
    category: "order",
    goals: ["run-events"],
    roles: ["operations", "sales"],
    searchName: "Catering order form",
    title: "Catering order",
    icon: "ChefHat",
    metaDescription:
      "Take catering orders with the menu, guest count, dietary needs and delivery or collection details. Severe allergies get their own follow-up before you confirm.",
    description: "Menu, headcount, dietary needs and delivery details for one event, in one order.",
    blurb:
      "Asks for everything the kitchen and the driver need: the menu, the headcount, the serving time and the dietary counts. Anyone who mentions a severe allergy is asked for the details, and customers collecting from you skip the venue and on-site contact questions entirely.",
    tags: ["catering order", "food order", "event catering", "dietary requirements", "branching"],
    greeting: "Hello! Let's get your catering order down. Have your guest numbers and menu choice to hand.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who's placing the order?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "organisation",
        type: "short_text",
        title: "Are you ordering for a company or organisation? If so, which one?",
        required: false,
        maxLength: 120,
      },
      {
        ref: "event_type",
        type: "dropdown",
        title: "What's the occasion?",
        required: true,
        options: [
          { label: "Business meeting" },
          { label: "Conference or training day" },
          { label: "Wedding" },
          { label: "Birthday or family party" },
          { label: "Funeral or memorial" },
          { label: "Fundraiser" },
          { label: "Something else" },
        ],
      },
      {
        ref: "serve_time",
        type: "date",
        title: "When should the food be ready to eat?",
        required: true,
        disablePast: true,
        includeTime: true,
        timeMin: "06:00",
        timeMax: "23:00",
      },
      {
        ref: "guests",
        type: "number",
        title: "How many people are you feeding?",
        required: true,
        integerOnly: true,
        min: 1,
        max: 5000,
      },
      {
        ref: "menu",
        type: "single_select",
        title: "Which menu would you like?",
        required: true,
        options: [
          { label: "Breakfast and pastries" },
          { label: "Sandwich and salad lunch" },
          { label: "Hot buffet" },
          { label: "Canapés and finger food" },
          { label: "Plated sit-down meal" },
        ],
      },
      {
        ref: "extras",
        type: "multi_select",
        title: "Anything to add?",
        required: false,
        minSelections: 0,
        maxSelections: 7,
        options: [
          { label: "Desserts" },
          { label: "Fruit platter" },
          { label: "Tea and coffee" },
          { label: "Soft drinks and juice" },
          { label: "Plates, cutlery and napkins" },
          { label: "Serving staff" },
          { label: "Clearing up afterwards" },
        ],
      },
      {
        ref: "dietary",
        type: "long_text",
        title: "Any dietary needs? Give a count for each.",
        description: "For example: 6 vegetarian, 2 vegan, 3 gluten free, 1 halal.",
        required: false,
        maxLength: 800,
      },
      {
        ref: "severe_allergy",
        type: "yes_no",
        title: "Does anyone have a severe allergy we need to plan the kitchen around?",
        required: true,
      },

      // Severe allergies
      {
        ref: "allergy_details",
        type: "long_text",
        title: "Tell us the allergy, how many guests have it, and how serious it is.",
        description: "We'll confirm what we can safely prepare before the order is final.",
        required: true,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "service_style",
        type: "single_select",
        title: "How should the food reach you?",
        required: true,
        options: [
          { label: "I'll collect it" },
          { label: "Deliver and drop off" },
          { label: "Deliver, set up and serve" },
        ],
      },

      // Delivery
      {
        ref: "venue",
        type: "address",
        title: "Where are we delivering to?",
        required: true,
        fields: ["street", "city", "state", "postal"],
      },
      {
        ref: "onsite_contact",
        type: "contact_info",
        title: "Who will meet the driver on the day?",
        required: true,
        fields: ["first_name", "phone"],
      },
      {
        ref: "access",
        type: "long_text",
        title: "Anything about the venue we should know?",
        description: "Loading bay, stairs or lifts, the room we're serving in, and when we can get in to set up.",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "budget",
        type: "number",
        title: "Roughly what's your budget per guest?",
        description: "In your own currency. It helps us suggest swaps if the menu comes in over.",
        required: false,
        min: 0,
      },
      {
        ref: "notes",
        type: "long_text",
        title: "Anything else we should know?",
        required: false,
        maxLength: 1000,
      },
    ],
    branches: [
      { when: "severe_allergy", is: true, then: "allergy_details" },
      { when: "severe_allergy", is: false, then: "service_style" },
      { when: "service_style", is: "I'll collect it", then: "budget" },
      { when: "service_style", is: "Deliver and drop off", then: "venue" },
      { when: "service_style", is: "Deliver, set up and serve", then: "venue" },
    ],
    ending: {
      title: "Order request received 🍽️",
      body: "We'll check the date, quantities and any dietary needs, then send you a confirmed menu and price. The order is final once you've approved that.",
    },
    guide: {
      questionsToConsider: [
        "Which menus or packages do you want customers to pick from, and do they change by season?",
        "How far ahead do you need orders, and should the date question block anything shorter?",
        "Do you offer staffed service, and what do you need to know about the venue before you agree to it?",
        "Who checks allergy details with the kitchen before an order is confirmed?",
      ],
      howToUseResponses:
        "Start with the serving time and headcount, because those decide whether you can take the order at all. Pass the dietary counts and any severe allergy details to the kitchen before you quote, and confirm in writing what you can and can't prepare safely. For deliveries, give the driver the address, the on-site contact and the access notes together so nobody is calling round on the day.",
      customizeSteps: [
        "Replace the menu options with your own packages, and add a short description to each so customers know what's included.",
        "Edit the extras to match what you really supply, such as linen, staff or equipment hire.",
        "Put the link on your catering page or in your quote emails, and test both the collection and delivery paths before you share it.",
      ],
      faqs: [
        {
          q: "What should a catering order form include?",
          a: "The customer's details, the event date and serving time, the number of guests, the menu and extras, dietary needs, and how the food gets there. For deliveries you also need the venue address and a contact on the day.",
        },
        {
          q: "How do I collect dietary requirements for catering?",
          a: "Ask for a count for each need rather than a yes or no, and ask separately about severe allergies. This template does both, and only asks for allergy details when someone has one.",
        },
        {
          q: "Is a catering order confirmed when the form is submitted?",
          a: "Not with this template. The ending tells customers you will confirm the menu and price first, which gives the kitchen time to check quantities and allergies.",
        },
        {
          q: "What's the difference between a catering order form and a catering inquiry form?",
          a: "An inquiry form explores options for someone still deciding. An order form collects the choices someone has already made so you can prepare and deliver them.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "photography-order-form",
    type: "form",
    category: "order",
    goals: ["onboard-clients"],
    roles: ["freelancers-agencies"],
    searchName: "Photography order form",
    title: "Photography order",
    icon: "Camera",
    metaDescription:
      "Take photography orders for new sessions or for prints from a past shoot. Collect the package, date, image numbers, print sizes, delivery and photo usage.",
    description: "Book a new photo session or order prints and files from a past shoot.",
    blurb:
      "One form for the two orders a photographer actually gets. New clients choose a session type, package and date; past clients name their gallery and the images they want printed. Everyone is asked how the photos will be used, which settles licensing before it becomes an awkward conversation.",
    tags: ["photography order", "photo session booking", "print order", "photographer", "branching"],
    greeting: "Hi! Let's get your photography order sorted.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your details first.",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "order_kind",
        type: "single_select",
        title: "What are you ordering?",
        required: true,
        options: [{ label: "A new photo session" }, { label: "Prints or files from a past session" }],
      },

      // New session
      {
        ref: "session_type",
        type: "single_select",
        title: "What kind of session?",
        required: true,
        allowOther: true,
        options: [
          { label: "Portraits or headshots" },
          { label: "Family" },
          { label: "Couple or engagement" },
          { label: "Newborn" },
          { label: "Event" },
          { label: "Product or brand" },
        ],
      },
      {
        ref: "package",
        type: "single_select",
        title: "Which package would you like?",
        required: true,
        options: [
          { label: "Mini", description: "A short session and a small set of edited images" },
          { label: "Standard", description: "A full session with a larger edited set" },
          { label: "Full coverage", description: "Extended time, every usable image edited" },
          { label: "Not sure yet", description: "We'll suggest one from your answers" },
        ],
      },
      {
        ref: "session_date",
        type: "date",
        title: "When would you like the session?",
        description: "We'll confirm once we've checked availability and light.",
        required: true,
        disablePast: true,
      },
      {
        ref: "location",
        type: "single_select",
        title: "Where should we shoot?",
        required: true,
        options: [
          { label: "In the studio" },
          { label: "At my home or business" },
          { label: "Outdoors, at a place I'll suggest" },
          { label: "I'd like a recommendation" },
        ],
      },
      {
        ref: "subjects",
        type: "number",
        title: "How many people, pets or products will be in front of the camera?",
        required: true,
        integerOnly: true,
        min: 1,
        max: 500,
      },
      {
        ref: "brief",
        type: "long_text",
        title: "Tell us what you have in mind.",
        description: "The look you like, shots you must have, and anything you'd rather avoid.",
        required: false,
        maxLength: 1500,
      },

      // Past session
      {
        ref: "gallery_ref",
        type: "short_text",
        title: "What's the gallery name or order reference from your session?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "image_numbers",
        type: "long_text",
        title: "Which images would you like? List the file numbers.",
        description: "Add the size next to each one if they differ, for example: 0142 large, 0157 small.",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "print_formats",
        type: "multi_select",
        title: "Which formats do you want?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Full-resolution digital files" },
          { label: "Small prints" },
          { label: "Medium prints" },
          { label: "Large wall prints" },
          { label: "Canvas or framed" },
          { label: "Printed album" },
        ],
      },

      // Everyone
      {
        ref: "delivery",
        type: "single_select",
        title: "How would you like to receive your finished photos?",
        required: true,
        options: [{ label: "Online download" }, { label: "Collect from the studio" }, { label: "Post them to me" }],
      },
      {
        ref: "ship_address",
        type: "address",
        title: "Where should we send them?",
        required: true,
        fields: ["street", "city", "state", "postal", "country"],
      },
      {
        ref: "usage",
        type: "multi_select",
        title: "How will you use the photos?",
        description: "This decides the usage rights included with your order.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Personal, at home or as gifts" },
          { label: "Personal social media" },
          { label: "Business website or social media" },
          { label: "Printed advertising" },
          { label: "Press or editorial" },
        ],
      },
      {
        ref: "needed_by",
        type: "date",
        title: "Do you need everything by a particular date?",
        required: false,
        disablePast: true,
      },
      {
        ref: "portfolio_ok",
        type: "yes_no",
        title: "Are you happy for us to share a few favourites in our portfolio?",
        required: true,
      },
    ],
    branches: [
      { when: "order_kind", is: "A new photo session", then: "session_type" },
      { when: "order_kind", is: "Prints or files from a past session", then: "gallery_ref" },
      { when: "brief", always: true, then: "delivery" },
      { when: "delivery", is: "Post them to me", then: "ship_address" },
      { when: "delivery", is: "Online download", then: "usage" },
      { when: "delivery", is: "Collect from the studio", then: "usage" },
    ],
    ending: {
      title: "Thanks, your order is in 📸",
      body: "We'll reply with a confirmed date or print list and the total. Nothing is charged until you've approved it.",
    },
    guide: {
      questionsToConsider: [
        "Which session types do you want to take, and should any be removed from the list?",
        "How do your packages differ, and can a client tell them apart from a one-line description?",
        "Which print sizes and products do you really offer through your lab?",
        "How do usage rights change your price, especially for business or advertising use?",
      ],
      howToUseResponses:
        "Session orders go into your calendar check first: date, location and number of subjects tell you whether the booking works. Print orders go to editing and your lab, so copy the image numbers and formats straight across. Read the usage answer before you send the total, because a business or advertising use usually needs a different licence from personal use, and agreeing that now avoids a dispute later.",
      customizeSteps: [
        "Rename the packages and rewrite their descriptions to match your price list.",
        "Swap the print formats for the sizes and products you actually sell.",
        "Add the link to your gallery delivery email and your booking page, then run through both the new session and the print paths.",
      ],
      faqs: [
        {
          q: "What should a photography order form include?",
          a: "Client details, what is being ordered, the date and location for a session or the image numbers for prints, the delivery method and how the photos will be used.",
        },
        {
          q: "Why ask how the photos will be used?",
          a: "Usage decides what licence the client needs. A family portrait for the living room and a product shot for an advert are priced differently, and it is easier to settle that at the order stage.",
        },
        {
          q: "Does this replace a photography contract?",
          a: "No. It records what the client wants to order. Send your contract or terms separately once you have confirmed the date and price.",
        },
        {
          q: "Can past clients use the same form to order prints?",
          a: "Yes. They choose prints from a past session and are asked for their gallery name, image numbers and formats instead of session details.",
        },
      ],
    },
  }),
];
