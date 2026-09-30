import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_REGISTRATION: TemplateSeed[] = [
  defineTemplate({
    slug: "contest-registration-form",
    type: "form",
    category: "registration",
    goals: ["run-events", "generate-leads"],
    roles: ["marketing", "education", "operations"],
    searchName: "Contest registration form",
    title: "Contest registration",
    icon: "Trophy",
    metaDescription:
      "Take contest entries with the entrant's details, the entry itself and agreement to the rules. Under-18s add a guardian, and entries that aren't original are stopped.",
    description: "Register entrants and collect their entry in one conversation.",
    blurb:
      "For competitions judged on submitted work, from writing and design contests to school and community challenges. Entrants under 18 are asked for a parent or guardian before they go on, team entries give a team name and size, and anyone who says the work isn't their own is stopped politely before they upload it, so it never reaches your judges.",
    tags: ["contest registration", "competition entry", "contest entry form", "submissions", "branching"],
    greeting: "Ready to enter? This takes a few minutes, and you'll upload your entry at the end.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, your details so we can reach you about your entry",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "adult",
        type: "yes_no",
        title: "Are you 18 or older?",
        required: true,
      },

      // Under 18
      {
        ref: "guardian",
        type: "contact_info",
        title: "Please add a parent or guardian we can contact",
        description: "We'll ask them to confirm your entry before judging.",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },

      // Everyone
      {
        ref: "entry_type",
        type: "single_select",
        title: "Are you entering on your own or as a team?",
        required: true,
        options: [{ label: "On my own" }, { label: "As a team" }],
      },
      { ref: "team_name", type: "short_text", title: "What's your team called?", required: true, maxLength: 80 },
      {
        ref: "team_size",
        type: "number",
        title: "How many people are in the team, including you?",
        required: true,
        integerOnly: true,
        min: 2,
        max: 20,
      },
      {
        ref: "category",
        type: "dropdown",
        title: "Which category are you entering?",
        required: true,
        options: [{ label: "Open category" }, { label: "Students" }, { label: "Beginners" }],
      },
      {
        ref: "original",
        type: "yes_no",
        title: "Is the entry entirely your own original work?",
        description: "For a team entry, work made together by the team counts.",
        required: true,
        yesLabel: "Yes, it's original",
        noLabel: "No, not entirely",
      },
      { ref: "entry_title", type: "short_text", title: "What's your entry called?", required: true, maxLength: 120 },
      {
        ref: "entry_description",
        type: "long_text",
        title: "Tell the judges about it: what it is and what you were going for",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "entry_file",
        type: "file_upload",
        title: "Upload your entry",
        required: true,
        accept: ["image/*", "application/pdf", "video/*", "audio/*"],
        maxFiles: 3,
        maxSizeMB: 50,
      },
      {
        ref: "entry_link",
        type: "url",
        title: "If your entry lives online too, add the link",
        required: false,
      },
      {
        ref: "rules",
        type: "legal_consent",
        title: "Contest rules",
        required: true,
        consentText:
          "I have read the contest rules and agree to them. I understand my entry may be shown publicly with my name if it is shortlisted or wins.",
      },
      {
        ref: "heard_from",
        type: "single_select",
        title: "Last one: how did you hear about the contest?",
        required: false,
        allowOther: true,
        options: [{ label: "Social media" }, { label: "A friend" }, { label: "School, club or work" }, { label: "Our website or newsletter" }],
      },
    ],
    branches: [
      { when: "adult", is: false, then: "guardian" },
      { when: "adult", is: true, then: "entry_type" },
      { when: "entry_type", is: "As a team", then: "team_name" },
      { when: "entry_type", is: "On my own", then: "category" },
      { when: "original", is: false, then: "end_not_entered" },
      { when: "original", is: true, then: "entry_title" },
    ],
    ending: {
      title: "You're in, good luck! 🏆",
      body: "We've received your entry. We'll email you when judging closes and let every entrant know the results.",
    },
    endings: [
      {
        ref: "end_not_entered",
        title: "We can't accept this entry yet",
        body: "Entries need to be your own original work. If you have a different piece that is, you're welcome to start again and enter that instead.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What are your categories, and can one person enter more than one?",
        "Do you accept team entries, and is there a size limit?",
        "Which file types and sizes can your judges actually open?",
        "Is there a minimum age, and do you need a guardian's consent below it?",
      ],
      howToUseResponses:
        "Filter entries by category and hand each judge only theirs, with the description next to the file. Check the guardian details on under-18 entries before shortlisting. Export the list to CSV to build a scoring sheet, and email every entrant when results are out, not just the winners.",
      customizeSteps: [
        "Rename the categories and write your own rules text, including how entries may be used and shown.",
        "Adjust the upload question to the file types your contest takes, such as photos only or video only.",
        "Share the link on your contest page or embed it there, and set a closing date you announce clearly.",
      ],
      faqs: [
        {
          q: "What should a contest registration form include?",
          a: "Contact details, the category, the entry itself, a short description for judges and agreement to the rules. Ask for a guardian's details if under-18s can enter.",
        },
        {
          q: "How do I handle entrants under 18?",
          a: "This form asks every entrant's age and collects a parent or guardian's contact for anyone under 18, so you can confirm consent before judging.",
        },
        {
          q: "Can entrants upload files through the form?",
          a: "Yes. The entry question accepts images, PDFs, video and audio, and you can change the types and size limit.",
        },
        {
          q: "Can I accept team entries?",
          a: "Yes. Entrants choose solo or team, and teams are asked for a name and how many people are in it.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "yoga-registration-form",
    type: "form",
    category: "registration",
    goals: ["run-events", "onboard-clients"],
    roles: ["operations"],
    searchName: "Yoga registration form",
    title: "Yoga class registration",
    icon: "Leaf",
    metaDescription:
      "Register students for yoga classes with their level, preferred times, injuries and a participation agreement. Prenatal students get their own safety questions.",
    description: "Sign students up for the right class, with what the teacher needs to know.",
    blurb:
      "For studios and independent teachers. It places each student by class and experience, asks when they can come, and only asks about injuries in detail when there's something to tell. Anyone booking prenatal yoga is asked how far along they are and whether their midwife or doctor is happy for them to exercise.",
    tags: ["yoga registration", "yoga class signup", "studio registration", "yoga intake", "branching"],
    greeting: "Welcome! Let's find the right class for you.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Let's start with your details",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "class",
        type: "single_select",
        title: "Which class would you like to join?",
        required: true,
        options: [
          { label: "Beginners" },
          { label: "Vinyasa flow" },
          { label: "Yin and restorative" },
          { label: "Prenatal" },
          { label: "Private one-to-one" },
        ],
      },

      // Prenatal
      {
        ref: "weeks_pregnant",
        type: "number",
        title: "How many weeks pregnant are you?",
        required: true,
        integerOnly: true,
        min: 1,
        max: 42,
      },
      {
        ref: "cleared",
        type: "yes_no",
        title: "Has your midwife or doctor said it's fine for you to exercise?",
        required: true,
        yesLabel: "Yes",
        noLabel: "Not yet",
      },

      // Everyone
      {
        ref: "experience",
        type: "single_select",
        title: "How much yoga have you done before?",
        required: true,
        options: [
          { label: "None, this is my first time" },
          { label: "A few classes" },
          { label: "I practise regularly" },
          { label: "I teach or have trained" },
        ],
      },
      {
        ref: "times",
        type: "multi_select",
        title: "When could you come?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Early mornings" },
          { label: "Lunchtime" },
          { label: "Weekday evenings" },
          { label: "Saturdays" },
          { label: "Sundays" },
        ],
      },
      {
        ref: "format",
        type: "single_select",
        title: "Would you rather come to the studio or join online?",
        required: true,
        options: [{ label: "In the studio" }, { label: "Live online" }, { label: "Either is fine" }],
      },
      {
        ref: "hopes",
        type: "multi_select",
        title: "What are you hoping yoga will help with?",
        required: false,
        minSelections: 0,
        maxSelections: 6,
        options: [
          { label: "Flexibility" },
          { label: "Strength" },
          { label: "Stress and sleep" },
          { label: "Recovering from an injury" },
          { label: "Back or joint pain" },
          { label: "Meeting people" },
        ],
      },
      {
        ref: "has_health_notes",
        type: "yes_no",
        title: "Any injuries, conditions or recent surgery your teacher should know about?",
        description: "Only share what you're comfortable with. It stays with your teacher.",
        required: true,
      },
      {
        ref: "health_notes",
        type: "long_text",
        title: "Tell us a little about it, and anything that makes it better or worse",
        required: true,
        maxLength: 800,
      },
      {
        ref: "emergency_contact",
        type: "short_text",
        title: "An emergency contact: name and phone number",
        required: true,
        maxLength: 160,
      },
      {
        ref: "agreement",
        type: "legal_consent",
        title: "Participation agreement",
        required: true,
        consentText:
          "I understand yoga is physical activity. I'll work within my own limits, tell my teacher about any change in my health, and stop if something hurts.",
      },
    ],
    branches: [
      { when: "class", is: "Prenatal", then: "weeks_pregnant" },
      { when: "class", is: "Beginners", then: "experience" },
      { when: "class", is: "Vinyasa flow", then: "experience" },
      { when: "class", is: "Yin and restorative", then: "experience" },
      { when: "class", is: "Private one-to-one", then: "experience" },
      { when: "has_health_notes", is: true, then: "health_notes" },
      { when: "has_health_notes", is: false, then: "emergency_contact" },
    ],
    ending: {
      title: "Namaste, you're registered 🧘",
      body: "We'll email your class time, what to bring and how to find us, or the link if you're joining online.",
    },
    guide: {
      questionsToConsider: [
        "Which classes do you run, and should any of them ask their own follow-up questions like prenatal does?",
        "Do you offer online classes, or only in the studio?",
        "What should your participation agreement say, and has anyone checked the wording for your area?",
        "Who reads the health notes, and how will you keep them private?",
      ],
      howToUseResponses:
        "Before each class, check the list for health notes and prenatal students so the teacher can plan modifications, and contact any prenatal student who answered 'Not yet' about clearance before their first session. Point complete beginners who picked a flow class toward a beginners' session first. Use the preferred times across all sign-ups to decide when a new class would fill, and export the list to CSV for your register.",
      customizeSteps: [
        "Replace the class list with your timetable, and route any class that needs extra questions to its own follow-up.",
        "Rewrite the participation agreement in your own words, keeping it short and clear.",
        "Share the link from your website, social profiles and the studio front desk, or embed it on your class page.",
      ],
      faqs: [
        {
          q: "What should a yoga registration form ask?",
          a: "Contact details, the class, experience level, preferred times, any injuries or conditions, an emergency contact and a participation agreement.",
        },
        {
          q: "Should a yoga studio ask about injuries?",
          a: "Yes, so the teacher can offer modifications. This form asks one yes or no question first and only asks for details when there's something to share.",
        },
        {
          q: "Is it safe to take a yoga class while pregnant?",
          a: "Many people practise through pregnancy, but it depends on the person. That's why the prenatal path asks whether a midwife or doctor has said it's fine to exercise.",
        },
        {
          q: "Can I use this form for online yoga classes?",
          a: "Yes. Students choose studio or online, and you can send the joining link in your follow-up.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "product-registration-form",
    type: "form",
    category: "registration",
    goals: ["onboard-clients", "collect-feedback"],
    roles: ["customer-success", "operations"],
    searchName: "Product registration form",
    title: "Product registration",
    icon: "BadgeCheck",
    metaDescription:
      "Let buyers register a product with the model, serial number, purchase details and receipt. Anyone whose product arrived faulty goes straight to a support ending.",
    description: "Record who owns what, and catch a faulty product on day one.",
    blurb:
      "For brands selling physical products. It records the model, serial number, where and when it was bought and a copy of the receipt, which is what warranty and recall checks need. One question asks whether everything arrived working, and a buyer who says no is asked what's wrong and sent to a support ending instead of a thank-you.",
    tags: ["product registration", "warranty registration", "serial number", "customer onboarding", "branching"],
    greeting: "Thanks for your purchase! Registering takes a couple of minutes and helps us support you.",
    questions: [
      {
        ref: "product",
        type: "short_text",
        title: "Which product and model are you registering?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "serial",
        type: "short_text",
        title: "What's the serial number?",
        description: "It's on a label on the product or its box, often under a barcode.",
        required: true,
        maxLength: 60,
      },
      {
        ref: "purchase_date",
        type: "date",
        title: "When did you buy it?",
        description: "If it was a gift, the date you received it is fine.",
        required: true,
      },
      {
        ref: "bought_from",
        type: "single_select",
        title: "Where did you buy it?",
        required: true,
        options: [
          { label: "Directly from our website" },
          { label: "A shop" },
          { label: "An online retailer or marketplace" },
          { label: "It was a gift" },
        ],
      },
      {
        ref: "retailer",
        type: "short_text",
        title: "Which shop or retailer was it?",
        required: false,
        maxLength: 120,
      },
      {
        ref: "receipt",
        type: "file_upload",
        title: "Upload a photo of the receipt or order confirmation, if you have it",
        description: "Keeping it on file makes any warranty claim quicker.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 2,
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should we register it to?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "address",
        type: "address",
        title: "Your address, so we can reach you about safety notices or recalls",
        required: false,
        fields: ["street", "city", "postal", "country"],
      },
      {
        ref: "working",
        type: "yes_no",
        title: "Did everything arrive complete and working?",
        required: true,
        yesLabel: "Yes, all good",
        noLabel: "No, there's a problem",
      },

      // All good
      {
        ref: "setup_ease",
        type: "rating",
        title: "How easy was it to set up?",
        required: false,
        scale: 5,
      },
      {
        ref: "updates",
        type: "legal_consent",
        title: "Product news",
        required: false,
        allowDecline: true,
        agreeLabel: "Yes, keep me posted",
        declineLabel: "No thanks",
        consentText:
          "Send me occasional emails about updates, tips and offers for my product. I can unsubscribe at any time. Safety and warranty messages are sent either way.",
      },

      // Problem
      {
        ref: "problem",
        type: "long_text",
        title: "What's wrong? Describe what you see and when it happens.",
        required: true,
        maxLength: 1200,
      },
      {
        ref: "problem_photos",
        type: "file_upload",
        title: "Photos or a short video of the problem help our team a lot",
        required: false,
        accept: ["image/*", "video/*"],
        maxFiles: 4,
      },
    ],
    branches: [
      { when: "bought_from", is: "A shop", then: "retailer" },
      { when: "bought_from", is: "An online retailer or marketplace", then: "retailer" },
      { when: "bought_from", is: "Directly from our website", then: "receipt" },
      { when: "bought_from", is: "It was a gift", then: "receipt" },
      { when: "working", is: true, then: "setup_ease" },
      { when: "working", is: false, then: "problem" },
      { when: "updates", always: true, then: "end_thanks" },
      { when: "problem_photos", always: true, then: "end_support" },
    ],
    ending: {
      title: "You're registered ✅",
      body: "Your product is on file. Keep your serial number handy if you ever need to contact support.",
    },
    endings: [
      {
        ref: "end_support",
        title: "Registered, and we're on the problem",
        body: "Your product is on file, and our support team has your description. They'll email you about a fix or a replacement.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Where exactly is the serial number on your product, and can the hint say so?",
        "Do you need proof of purchase for warranty claims, or is registration enough?",
        "Should you list your products in a dropdown instead of a text answer?",
        "Who on your team picks up a registration that reports a fault?",
      ],
      howToUseResponses:
        "Treat any registration that reports a problem as a support ticket and reply within a day, since this is the customer's first contact with you after buying. Keep the serial numbers and addresses ready for recall notices. Only email product news to people who agreed to it, and use the setup rating to spot models whose instructions need work.",
      customizeSteps: [
        "Change the serial number hint to say where it is on your product, and swap the product question for a dropdown if you have a short range.",
        "Rewrite the updates consent in your own words, and keep it separate from the registration itself.",
        "Print the link or a QR code on the packaging or manual, and read new registrations in the dashboard.",
      ],
      faqs: [
        {
          q: "What should a product registration form include?",
          a: "The product and model, serial number, purchase date, where it was bought, proof of purchase and the owner's contact details. An address helps if you ever need to send a safety notice.",
        },
        {
          q: "Does registering a product activate the warranty?",
          a: "That depends on your warranty terms. Many warranties apply from the purchase date anyway, and registration simply keeps the proof on file.",
        },
        {
          q: "Should marketing opt-in be part of product registration?",
          a: "Keep it separate and optional. This form asks for consent to product news on its own and still sends safety and warranty messages either way.",
        },
        {
          q: "How do customers find the registration form?",
          a: "Share the link in your order emails, or print it as a QR code in the box or manual so buyers register right after unpacking.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "course-enrollment",
    type: "form",
    category: "registration",
    goals: ["onboard-clients", "run-events"],
    roles: ["education", "operations"],
    searchName: "Course enrollment form",
    title: "Course enrollment",
    icon: "GraduationCap",
    metaDescription:
      "Enroll students and place them at the right level. Unsure students get placement questions, and employer-funded and bursary students each get their own ending.",
    description: "Enroll students, place them at the right level, and sort out who's paying.",
    blurb:
      "Enrollment and placement in one pass. Students who know which course they want go straight through; students who don't are asked the questions that place them. At the end, the form splits by who's paying: employers are asked for invoice details and bursary applicants tell the panel their circumstances, each with an ending that says what happens next.",
    tags: ["course enrollment", "student registration", "class enrollment", "placement", "branching"],
    greeting: "Welcome! Let's get you enrolled.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, your details",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "course",
        type: "dropdown",
        title: "Which course would you like to join?",
        required: true,
        options: [
          { label: "Foundations" },
          { label: "Intermediate" },
          { label: "Advanced" },
          { label: "Not sure, help me choose" },
        ],
      },

      // They know what they want
      {
        ref: "why_this_level",
        type: "short_text",
        title: "What makes that the right level for you?",
        required: false,
        maxLength: 300,
      },

      // Placement
      {
        ref: "experience",
        type: "opinion_scale",
        title: "How much experience do you already have?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "None at all",
        labelHigh: "A lot",
      },
      {
        ref: "prior_study",
        type: "multi_select",
        title: "Have you done any of these before?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "A short course or bootcamp" },
          { label: "Taught myself from books or videos" },
          { label: "Used it at work" },
          { label: "Studied it formally" },
          { label: "None of these" },
        ],
      },
      {
        ref: "self_assessment",
        type: "long_text",
        title: "Describe something you've made or solved with it",
        description: "A sentence is plenty. It's the fastest way for a tutor to place you.",
        required: false,
        maxLength: 600,
      },

      // Everyone
      { ref: "goal", type: "long_text", title: "What do you want to be able to do by the end?", required: true, maxLength: 800 },
      {
        ref: "schedule",
        type: "multi_select",
        title: "When can you study?",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [{ label: "Weekday mornings" }, { label: "Weekday evenings" }, { label: "Weekends" }, { label: "Any time" }],
      },
      {
        ref: "format",
        type: "single_select",
        title: "How would you rather learn?",
        required: true,
        options: [{ label: "In person" }, { label: "Live online" }, { label: "At my own pace" }],
      },
      {
        ref: "accessibility",
        type: "long_text",
        title: "Anything we should know to support you?",
        description: "Access needs, dyslexia, caring responsibilities, anything at all.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "funding",
        type: "single_select",
        title: "How are you paying for the course?",
        required: true,
        options: [{ label: "Myself" }, { label: "My employer" }, { label: "I'm applying for a bursary" }],
      },

      // Employer paying
      { ref: "employer_name", type: "short_text", title: "Which employer?", required: true, maxLength: 120 },
      { ref: "invoice_email", type: "email", title: "Where should the invoice go?", required: true },
      { ref: "purchase_order", type: "short_text", title: "Purchase order number, if you need one on it", required: false, maxLength: 60 },

      // Bursary
      {
        ref: "bursary_reason",
        type: "long_text",
        title: "Tell us about your circumstances",
        description: "Read only by the bursary panel, and never shared with tutors.",
        required: true,
        maxLength: 1200,
      },
    ],
    branches: [
      { when: "course", is: "Not sure, help me choose", then: "experience" },
      { when: "course", is: "Foundations", then: "why_this_level" },
      { when: "course", is: "Intermediate", then: "why_this_level" },
      { when: "course", is: "Advanced", then: "why_this_level" },
      { when: "why_this_level", always: true, then: "goal" },
      { when: "funding", is: "Myself", then: "end_thanks" },
      { when: "funding", is: "My employer", then: "employer_name" },
      { when: "funding", is: "I'm applying for a bursary", then: "bursary_reason" },
      { when: "purchase_order", always: true, then: "end_invoice" },
      { when: "bursary_reason", always: true, then: "end_bursary" },
    ],
    ending: {
      title: "Thanks, your enrollment is in 🎉",
      body: "We'll email to confirm your course and your place, with the timetable and how to pay, within two working days.",
    },
    endings: [
      {
        ref: "end_invoice",
        title: "We'll invoice your employer 🧾",
        body: "Your place is held while the invoice is settled. We'll copy you in when it's sent.",
      },
      {
        ref: "end_bursary",
        title: "Bursary application received 🎓",
        body: "The panel reviews applications regularly. We'll hold a place for you until they've decided.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What are your course levels, and what does a student need to know before each one?",
        "Which answers would you use to place a student who isn't sure?",
        "Do you accept employer funding, and what do employers need on an invoice?",
        "Do you offer bursaries or reduced fees, and who decides?",
      ],
      howToUseResponses:
        "Have a tutor read the placement answers for everyone who picked 'Not sure' and reply with a recommended course within a few days, before they lose interest. Check the goal answers against the course they chose, since someone who wants to ship a project may be in the wrong level. Send employer invoices from the details given, and pass bursary answers only to the panel.",
      customizeSteps: [
        "Replace the course list with your own, and rewrite the placement questions around what separates your levels.",
        "Edit the funding options and endings to match how students actually pay you, including your payment instructions.",
        "Share the link on your course pages or embed it there, and export enrollments to CSV for your class lists.",
      ],
      faqs: [
        {
          q: "What should a course enrollment form include?",
          a: "Student contact details, the course, their experience, goals, when they can study, any support needs and how they're paying. A placement path helps students who aren't sure which level fits.",
        },
        {
          q: "How do I place students at the right level?",
          a: "Ask about their experience and what they've done before, then have a tutor read the answers. This form only asks those questions of students who say they're not sure.",
        },
        {
          q: "Can the form handle employer-funded students?",
          a: "Yes. Choosing employer funding asks for the company, the invoice email and a purchase order number, and ends on a message about invoicing.",
        },
        {
          q: "Is a student enrolled as soon as they submit?",
          a: "That's up to you. Most schools confirm the place by email once they've checked the course has room and payment is arranged.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "volunteer-signup",
    type: "form",
    category: "registration",
    goals: ["run-events", "onboard-clients"],
    roles: ["operations", "hr-people"],
    searchName: "Volunteer sign up form",
    title: "Volunteer signup",
    icon: "HandHeart",
    metaDescription:
      "Sign up volunteers with availability, roles and the checks each role needs. Drivers are asked about licence and insurance, people-facing roles about checks.",
    description: "Match volunteers to shifts they can actually make.",
    blurb:
      "Availability and skills as structured choices, so a coordinator fills a rota by filtering rather than by reading. Under-18s add a parent or guardian, anyone offering to drive is asked about their licence and insurance, and anyone working with people directly is asked about a background check. Those are the questions that otherwise hold up a whole rota.",
    tags: ["volunteer sign up", "volunteer registration", "nonprofit", "volunteer rota", "branching"],
    greeting: "Thanks for offering to help! Tell us when you're free and what you'd like to do.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, your details",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { ref: "over_18", type: "yes_no", title: "Are you 18 or over?", required: true },
      {
        ref: "guardian_contact",
        type: "short_text",
        title: "A parent or guardian's name and phone number",
        description: "We need this before you can be put on a shift.",
        required: true,
        maxLength: 160,
      },
      {
        ref: "availability",
        type: "multi_select",
        title: "When are you usually free?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Weekday mornings" },
          { label: "Weekday afternoons" },
          { label: "Weekday evenings" },
          { label: "Saturdays" },
          { label: "Sundays" },
        ],
      },
      {
        ref: "commitment",
        type: "single_select",
        title: "How often could you help?",
        required: true,
        options: [{ label: "Every week" }, { label: "A couple of times a month" }, { label: "Now and then" }, { label: "One-off events only" }],
      },
      {
        ref: "primary_role",
        type: "single_select",
        title: "What would you most like to help with?",
        required: true,
        options: [
          { label: "Driving and deliveries" },
          { label: "Working with people directly" },
          { label: "Events and stewarding" },
          { label: "Fundraising" },
          { label: "Admin and data" },
          { label: "Whatever's needed" },
        ],
      },

      // Driving
      { ref: "licence_years", type: "number", title: "How many years have you held a full driving licence?", required: true, integerOnly: true, min: 0, max: 80 },
      {
        ref: "own_vehicle",
        type: "yes_no",
        title: "Would you use your own vehicle?",
        required: true,
        yesLabel: "Yes, my own",
        noLabel: "I'd need one of yours",
      },
      {
        ref: "insurance",
        type: "yes_no",
        title: "Does your vehicle insurance cover volunteer driving?",
        description: "If you're not sure, say no and we'll help you check with your insurer.",
        required: false,
      },

      // Working with people
      {
        ref: "background_check",
        type: "single_select",
        title: "Do you have a current background check for working with children or vulnerable adults?",
        required: true,
        options: [
          { label: "Yes, and it's up to date" },
          { label: "Yes, but it may have expired" },
          { label: "No, I'd need one" },
          { label: "I'm not sure" },
        ],
      },
      {
        ref: "people_experience",
        type: "long_text",
        title: "Have you done anything like this before?",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "skills",
        type: "long_text",
        title: "Any skills or experience we should know about?",
        description: "Languages, first aid, cooking, a trade, anything you think might help.",
        required: false,
        maxLength: 800,
      },
      {
        ref: "access_needs",
        type: "long_text",
        title: "Anything we should know to make volunteering work for you?",
        required: false,
        maxLength: 600,
      },
      { ref: "emergency_contact", type: "short_text", title: "An emergency contact: name and phone number", required: true, maxLength: 160 },
      {
        ref: "policies",
        type: "legal_consent",
        title: "Volunteer agreement",
        required: true,
        consentText: "I have read the volunteer agreement and safeguarding policy, and agree to follow them.",
      },
    ],
    branches: [
      { when: "over_18", is: false, then: "guardian_contact" },
      { when: "over_18", is: true, then: "availability" },
      { when: "primary_role", is: "Driving and deliveries", then: "licence_years" },
      { when: "primary_role", is: "Working with people directly", then: "background_check" },
      { when: "primary_role", is: "Events and stewarding", then: "skills" },
      { when: "primary_role", is: "Fundraising", then: "skills" },
      { when: "primary_role", is: "Admin and data", then: "skills" },
      { when: "primary_role", is: "Whatever's needed", then: "skills" },
      { when: "own_vehicle", is: true, then: "insurance" },
      { when: "own_vehicle", is: false, then: "skills" },
      { when: "insurance", always: true, then: "skills" },
    ],
    ending: { title: "Welcome to the team 💚", body: "A coordinator will be in touch with the rota and your first shift." },
    guide: {
      questionsToConsider: [
        "Which volunteer roles do you have, and which ones need a check before someone starts?",
        "What background check is required where you are, and who pays for it?",
        "Do you accept volunteers under 18, and for which roles?",
        "Where do volunteers read your agreement and safeguarding policy before agreeing?",
      ],
      howToUseResponses:
        "Filter by availability and role to build the rota, then check the gaps: drivers without insurance cover and people-facing volunteers without a current check can't start until that's sorted, so contact them first. Keep under-18s on roles that suit them and have a guardian's number on file. Export the list to CSV for your rota or contact sheet.",
      customizeSteps: [
        "Rename the roles to the ones your organisation has, and route any role with its own requirement to a follow-up like driving.",
        "Change the background check question to name the check used where you are, and link your agreement in the consent text.",
        "Share the link in your newsletter and social posts, or embed it on your volunteer page.",
      ],
      faqs: [
        {
          q: "What should a volunteer sign up form include?",
          a: "Contact details, availability, how often they can help, the roles they're interested in, any checks those roles need, an emergency contact and agreement to your policies.",
        },
        {
          q: "Can volunteers under 18 sign up?",
          a: "Yes. Anyone who says they're under 18 is asked for a parent or guardian's contact before continuing.",
        },
        {
          q: "How do I collect background check information from volunteers?",
          a: "Ask only the volunteers whose role needs it. This form asks about checks when someone chooses to work with people directly.",
        },
        {
          q: "How do I turn sign-ups into a rota?",
          a: "Availability and roles are fixed choices, so you can filter responses in the dashboard or export them to CSV and sort them into shifts.",
        },
      ],
    },
  }),
];
