import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_CUSTOMER_SUCCESS: TemplateSeed[] = [
  defineTemplate({
    slug: "client-onboarding-form",
    type: "form",
    category: "customer-success",
    goals: ["onboard-clients"],
    roles: ["freelancers-agencies", "customer-success"],
    searchName: "Client onboarding form",
    title: "Client onboarding",
    icon: "Handshake",
    metaDescription:
      "Start a new client project with the goals, contacts, sign-off process, files and first priority in one place, so kickoff is spent on the work, not admin.",
    description: "Everything you need from a new client before kickoff, asked in the order a good project lead would.",
    blurb:
      "Collects the brief, the contacts, how the client likes to work and the materials you need before day one. Clients who sign off as a group are asked who else approves the work, and anyone with nothing ready yet skips the upload step instead of being asked for files they don't have.",
    tags: ["client onboarding", "client intake", "agency onboarding", "project kickoff", "new client questionnaire"],
    greeting: "Welcome aboard! A few questions now will save us a lot of back and forth later.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who will be our main point of contact?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { ref: "company", type: "short_text", title: "What's your company or brand called?", required: true, maxLength: 120 },
      { ref: "website", type: "url", title: "Your website, if you have one", required: false },
      {
        ref: "project_summary",
        type: "long_text",
        title: "In a few sentences, what are we working on together?",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "success",
        type: "long_text",
        title: "Three months from now, what would make this project a clear win for you?",
        description: "A number, a launch, a feeling. Whatever you'd point to.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Put these in order of what matters most on this project",
        required: true,
        items: ["Getting it live quickly", "Polish and quality", "Staying on budget", "Measurable results"],
      },
      {
        ref: "deadline",
        type: "date",
        title: "Is there a date this has to be ready by?",
        description: "Skip this if there's no fixed date.",
        required: false,
        disablePast: true,
      },
      {
        ref: "sign_off",
        type: "single_select",
        title: "Who signs off on the work?",
        required: true,
        options: [{ label: "Just me" }, { label: "Me and one other person" }, { label: "A group or committee" }],
      },
      {
        ref: "approvers",
        type: "long_text",
        title: "Who else needs to approve things, and how do they like to review?",
        description: "Names and roles are enough. Tell us if anyone only wants to see the final version.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "channel",
        type: "single_select",
        title: "How do you prefer to hear from us?",
        required: true,
        options: [{ label: "Email" }, { label: "Phone calls" }, { label: "Video calls" }, { label: "A shared chat channel" }],
      },
      {
        ref: "cadence",
        type: "single_select",
        title: "How often would you like a progress update?",
        required: true,
        options: [
          { label: "Twice a week" },
          { label: "Once a week" },
          { label: "Every two weeks" },
          { label: "Only at milestones" },
        ],
      },
      {
        ref: "materials",
        type: "multi_select",
        title: "Which of these can you share with us now?",
        required: true,
        options: [
          { label: "Logos and brand guidelines" },
          { label: "Logins or access to tools we'll need" },
          { label: "Copy or written content" },
          { label: "Examples of work you like" },
          { label: "Nothing is ready yet" },
        ],
      },
      {
        ref: "files",
        type: "file_upload",
        title: "Upload whatever is ready",
        description: "Please don't upload passwords. We'll arrange access to accounts separately.",
        required: false,
        accept: ["image/*", "application/pdf", "application/zip"],
        maxFiles: 10,
        maxSizeMB: 50,
      },
      {
        ref: "first_need",
        type: "long_text",
        title: "What's the first thing you need from us?",
        required: true,
        maxLength: 600,
      },
      {
        ref: "avoid",
        type: "long_text",
        title: "Has anything gone wrong with a past agency or supplier that we should make sure to avoid?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "sign_off", is: "Just me", then: "channel" },
      { when: "sign_off", is: "Me and one other person", then: "approvers" },
      { when: "sign_off", is: "A group or committee", then: "approvers" },
      { when: "materials", op: "includes", is: "Nothing is ready yet", then: "first_need" },
    ],
    ending: {
      title: "You're all set 🙌",
      body: "Thanks! We'll read this before our kickoff call and come with a plan for the first two weeks.",
    },
    guide: {
      questionsToConsider: [
        "What do you always end up chasing a new client for in the first week? Ask for it here.",
        "Do you need logins to the client's tools, and how will you collect them safely outside the form?",
        "Who on your side reads the answers before kickoff, and how soon after the form comes in?",
        "Should the priority ranking use your own trade-offs, such as scope, speed or budget?",
      ],
      howToUseResponses:
        "Read each response before the kickoff call and turn the success answer into the goal you write at the top of the project brief. Set your update rhythm and channel to match what the client chose, and put everyone named as an approver on the review list from day one. If the client said nothing is ready yet, send them a short checklist of what you need and by when.",
      customizeSteps: [
        "Swap the ranking items for the trade-offs that come up in your kind of project.",
        "Edit the materials list so it names the files and access you actually need to start.",
        "Send the link right after the contract is signed, so answers arrive before your kickoff call.",
      ],
      faqs: [
        {
          q: "What should a client onboarding form include?",
          a: "Contact details, a short project summary, what success looks like, deadlines, who signs off, how the client wants updates, and the files you need to start. Anything you would otherwise chase by email belongs here.",
        },
        {
          q: "When should I send a client onboarding form?",
          a: "Straight after the contract or proposal is signed and before the kickoff meeting. That way the meeting is spent on the plan rather than on collecting basics.",
        },
        {
          q: "Should I collect passwords in an onboarding form?",
          a: "No. Ask which tools you'll need access to, then have the client invite you or share access through a password manager.",
        },
        {
          q: "Can I change the questions for different kinds of clients?",
          a: "Yes. Use this template copies it into your account, where you can edit every question and branch, or make one copy per service you offer.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "bug-report",
    type: "form",
    category: "customer-success",
    goals: ["collect-feedback"],
    roles: ["product-research", "customer-success"],
    searchName: "Bug report form",
    title: "Bug report",
    icon: "Bug",
    metaDescription:
      "Get bug reports your engineers can reproduce: steps, expected and actual results, and the right details for browser, mobile app or API problems.",
    description: "Reproducible bug reports instead of \"it's broken\".",
    blurb:
      "Asks for the three things an engineer needs and a reporter often forgets: what they expected, what happened, and the exact steps between. Where the bug happened decides what comes next (a browser is asked about the console, a phone about its model and app version, an API call about the status code), and anyone who can't work at all lands on an urgent ending.",
    tags: ["bug report", "bug tracker", "issue reporting", "QA", "software support", "branching"],
    greeting: "Sorry something's broken. Let's get the details down so we can fix it.",
    questions: [
      { ref: "summary", type: "short_text", title: "In one line, what went wrong?", required: true, maxLength: 160 },
      {
        ref: "steps",
        type: "long_text",
        title: "What steps lead to it? Number them if you can.",
        description: "Start from a page or screen we can find, like \"1. Open Settings\".",
        required: true,
        maxLength: 2000,
      },
      { ref: "expected", type: "short_text", title: "What did you expect to happen?", required: true, maxLength: 300 },
      { ref: "actual", type: "short_text", title: "What happened instead?", required: true, maxLength: 300 },
      {
        ref: "frequency",
        type: "single_select",
        title: "How often does it happen?",
        required: true,
        options: [
          { label: "Every time" },
          { label: "Most times" },
          { label: "Now and then" },
          { label: "It happened once" },
        ],
      },
      {
        ref: "regression",
        type: "yes_no",
        title: "Did this use to work for you?",
        required: false,
        yesLabel: "Yes, it broke recently",
        noLabel: "No, or not sure",
      },
      {
        ref: "environment",
        type: "single_select",
        title: "Where did it happen?",
        required: true,
        options: [
          { label: "In a desktop browser" },
          { label: "In the mobile app" },
          { label: "Through the API" },
        ],
      },

      // Desktop browser
      {
        ref: "browser",
        type: "single_select",
        title: "Which browser?",
        required: true,
        options: [{ label: "Chrome" }, { label: "Safari" }, { label: "Firefox" }, { label: "Edge" }, { label: "Something else" }],
      },
      {
        ref: "console_errors",
        type: "long_text",
        title: "Anything red in the developer console?",
        description: "Right-click the page, choose Inspect, then open Console. Paste what's there, or say it's empty.",
        required: false,
        maxLength: 2000,
      },
      {
        ref: "private_window",
        type: "yes_no",
        title: "Does it still happen in a private window?",
        description: "This quickly tells a browser extension apart from a real bug.",
        required: false,
        yesLabel: "Yes, still broken",
        noLabel: "No, it works there",
      },

      // Mobile app
      { ref: "device_model", type: "short_text", title: "Which phone or tablet?", required: true, maxLength: 80 },
      { ref: "os_version", type: "short_text", title: "Which OS version?", required: false, maxLength: 40 },
      {
        ref: "app_version",
        type: "short_text",
        title: "Which app version? It's usually at the bottom of Settings.",
        required: false,
        maxLength: 40,
      },

      // API
      { ref: "endpoint", type: "short_text", title: "Which endpoint, and which method?", required: true, maxLength: 200 },
      {
        ref: "status_code",
        type: "number",
        title: "What status code came back?",
        required: false,
        integerOnly: true,
        min: 100,
        max: 599,
      },
      {
        ref: "request_id",
        type: "short_text",
        title: "The request ID from the response headers, if you have it",
        required: false,
        maxLength: 120,
      },

      // Everyone
      {
        ref: "screenshot",
        type: "file_upload",
        title: "A screenshot or screen recording, if you have one",
        required: false,
        accept: ["image/*", "video/*"],
        maxFiles: 3,
        maxSizeMB: 25,
      },
      { ref: "email", type: "email", title: "Where should we reply?", required: true },
      {
        ref: "severity",
        type: "single_select",
        title: "Last one: how badly is this affecting you?",
        required: true,
        options: [
          { label: "I can't work at all" },
          { label: "There's a workaround, but it's painful" },
          { label: "Minor annoyance" },
        ],
      },
    ],
    branches: [
      { when: "environment", is: "In a desktop browser", then: "browser" },
      { when: "environment", is: "In the mobile app", then: "device_model" },
      { when: "environment", is: "Through the API", then: "endpoint" },
      { when: "private_window", always: true, then: "screenshot" },
      { when: "app_version", always: true, then: "screenshot" },
      { when: "severity", is: "I can't work at all", then: "end_urgent" },
    ],
    endings: [
      {
        ref: "end_urgent",
        title: "Flagged as blocking 🚨",
        body: "Thanks. This has gone to the top of the queue and we'll reply to your email as soon as someone has looked.",
      },
    ],
    ending: { title: "Bug reported 🐛", body: "Thanks. A real person reads every report, and we'll email you if we need more." },
    guide: {
      questionsToConsider: [
        "Do your users reach you through a browser, a mobile app, an API, or all three? Remove the arms you don't need.",
        "Who reads reports flagged as blocking, and how quickly can they respond?",
        "Is there a version number or account ID your engineers always ask for first?",
        "Should reporters see a link to a status page before they file a report?",
      ],
      howToUseResponses:
        "Triage by the severity answer first, then by frequency: a bug that happens every time and blocks work is a different job from a one-off annoyance. Try the numbered steps yourself before assigning the report, and use the private window answer to rule out extensions early. Export to CSV once a month and group reports by summary to see which parts of the product break most.",
      customizeSteps: [
        "Change the environment options to match where your product runs, and delete the arms you don't use.",
        "Edit the severity options and the urgent ending so they promise only what your team can deliver.",
        "Link the form from your app's help menu or embed it on your support page.",
      ],
      faqs: [
        {
          q: "What should a bug report include?",
          a: "A one-line summary, numbered steps to reproduce, what was expected, what actually happened, how often it happens, and details of the device or browser. A screenshot saves a lot of guesswork.",
        },
        {
          q: "How do I get users to write reproducible bug reports?",
          a: "Ask one thing at a time and ask for steps in order. This form does both, and the AI follow-up asks for more detail when an answer like \"it doesn't work\" is too vague.",
        },
        {
          q: "Can the form ask different questions for web and mobile bugs?",
          a: "Yes. The environment question branches, so a browser user is asked about the console and a mobile user about the device and app version.",
        },
        {
          q: "Can I send bug reports to my team's tracker?",
          a: "Responses are collected in your dashboard, where you can read each report and export them all to CSV for your tracker.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-complaint-form",
    type: "form",
    category: "customer-success",
    goals: ["collect-feedback"],
    roles: ["customer-success", "operations"],
    searchName: "Customer complaint form",
    title: "Customer complaint",
    icon: "MessageCircle",
    metaDescription:
      "Hear a complaint about an order, delivery or visit in full: where they bought, the order number, what went wrong, the fix they want and whether they'd come back.",
    description: "For shops and service businesses: a complaint about a purchase, with the order and the fix the customer wants.",
    blurb:
      "Built around a purchase rather than a general grievance. It asks where the customer bought, so a store visit is asked which branch while an online order goes straight to the order number, then lets them tick every problem at once. It closes by asking whether they'd buy again if it were put right, and customers who want a phone call get a number question and an ending that says so.",
    tags: ["customer complaint form", "order complaint", "product complaint", "retail complaint", "service recovery"],
    greeting: "Sorry your order didn't go the way it should. Tell us what happened and we'll work out how to put it right.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, your name and the email you used when you bought",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "where_bought",
        type: "single_select",
        title: "Where did you buy from us?",
        required: true,
        options: [
          { label: "On our website or app" },
          { label: "In one of our stores" },
          { label: "Over the phone" },
          { label: "Through another shop or marketplace" },
        ],
      },
      {
        ref: "store",
        type: "short_text",
        title: "Which store was it, and roughly what time were you there?",
        required: true,
        maxLength: 160,
      },
      {
        ref: "order_number",
        type: "short_text",
        title: "Your order or receipt number, if you have it",
        description: "It's on your confirmation email or the bottom of your receipt.",
        required: false,
        maxLength: 60,
      },
      { ref: "item", type: "short_text", title: "What did you buy or book?", required: true, maxLength: 160 },
      { ref: "when", type: "date", title: "When did the problem happen?", required: true },
      {
        ref: "problems",
        type: "multi_select",
        title: "What went wrong? Pick everything that applies.",
        required: true,
        options: [
          { label: "It arrived late or not at all" },
          { label: "It was faulty or damaged" },
          { label: "It wasn't what I ordered" },
          { label: "I was charged the wrong amount" },
          { label: "Staff were unhelpful or rude" },
          { label: "I couldn't get hold of anyone" },
        ],
        allowOther: true,
      },
      {
        ref: "what_happened",
        type: "long_text",
        title: "Tell us what happened, in your own words.",
        required: true,
        maxLength: 3000,
      },
      {
        ref: "evidence",
        type: "file_upload",
        title: "Photos of the item, or a screenshot of the order or charge",
        description: "Optional, but it usually means fewer questions from us.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
        maxSizeMB: 20,
      },
      {
        ref: "resolution",
        type: "single_select",
        title: "What would put this right for you?",
        required: true,
        options: [
          { label: "A full refund" },
          { label: "A replacement or repair" },
          { label: "A partial refund or credit" },
          { label: "Doing the job or service again" },
          { label: "An apology and an explanation" },
        ],
        allowOther: true,
      },
      {
        ref: "come_back",
        type: "opinion_scale",
        title: "If we sort this out, how likely are you to buy from us again?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not likely at all",
        labelHigh: "Very likely",
      },
      {
        ref: "reply_by",
        type: "single_select",
        title: "How would you like us to get back to you?",
        required: true,
        options: [{ label: "By email" }, { label: "A phone call" }],
      },
      { ref: "phone", type: "phone", title: "What number should we call?", required: true },
    ],
    branches: [
      { when: "where_bought", is: "In one of our stores", then: "store" },
      { when: "where_bought", is: "On our website or app", then: "order_number" },
      { when: "where_bought", is: "Over the phone", then: "order_number" },
      { when: "where_bought", is: "Through another shop or marketplace", then: "order_number" },
      { when: "reply_by", is: "By email", then: "end_thanks" },
      { when: "phone", always: true, then: "end_call" },
    ],
    endings: [
      {
        ref: "end_call",
        title: "We'll call you",
        body: "Thank you for telling us. Someone who can sort this out will look at your order and call you on the number you gave.",
      },
    ],
    ending: {
      title: "Complaint received",
      body: "Thank you for telling us. We'll look into your order and email you with what we're going to do about it.",
    },
    guide: {
      questionsToConsider: [
        "Where do your customers buy: online, in store, by phone, through other sellers? Keep only the channels you have.",
        "What can your team really offer to put things right? Remove any resolution you wouldn't give.",
        "Who is allowed to approve a refund or replacement, and do they see these complaints directly?",
        "Should complaints about a store go to that store's manager as well as head office?",
      ],
      howToUseResponses:
        "Reply first to the customers who scored themselves likely to come back, because a good fix keeps them. Check the order number against your records before replying so your first message already knows what they bought. Export to CSV each month and count the ticked problems by store and by channel: late deliveries from one channel or rudeness at one branch are fixable at the source.",
      customizeSteps: [
        "Edit the channels and the problem list to match how you sell and what usually goes wrong.",
        "Change both endings to state your real reply time and who will be in touch.",
        "Link the form from order emails, receipts and your returns page so it's there when something goes wrong.",
      ],
      faqs: [
        {
          q: "What should a customer complaint form include?",
          a: "Contact details, where and what the customer bought, an order or receipt number, what went wrong, any photos, and the outcome they are hoping for.",
        },
        {
          q: "Why ask customers what resolution they want?",
          a: "It tells you whether they want their money back, a replacement or just an explanation, so your first reply can offer the right thing instead of guessing.",
        },
        {
          q: "How quickly should I respond to a customer complaint?",
          a: "Acknowledge it as soon as you can, ideally the same working day, and say when they'll hear the outcome. The ending of this form is the place to state that time.",
        },
        {
          q: "Can I put a complaint form on my website or receipts?",
          a: "Yes. Share it as a link, print the link on receipts, or embed it on your contact page. Every complaint arrives in your dashboard.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-inquiry-form",
    type: "form",
    category: "customer-success",
    goals: ["generate-leads"],
    roles: ["customer-success", "sales"],
    searchName: "Customer inquiry form",
    title: "Customer inquiry",
    icon: "Inbox",
    metaDescription:
      "Answer shoppers' questions about products, delivery, orders and returns, with the product link or order number attached and a note of who is ready to buy.",
    description: "Questions from shoppers and customers, each arriving with the product or order it's about.",
    blurb:
      "Made for businesses that sell something: each topic asks for the one detail your team would otherwise reply to ask for. A product question asks which product and how close the person is to buying, a delivery question asks where it's going, and an order, return or account question asks for the order number. Only people who want a call are asked for a phone number.",
    tags: ["customer inquiry form", "product inquiry", "order inquiry", "customer questions", "shop enquiry form"],
    greeting: "Hi! Ask us anything about our products or your order.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 80 },
      { ref: "email", type: "email", title: "And your email address?", required: true },
      {
        ref: "topic",
        type: "single_select",
        title: "What's your question about?",
        required: true,
        options: [
          { label: "A product: sizes, specs or stock" },
          { label: "Delivery times and costs" },
          { label: "An order I've placed" },
          { label: "A return or exchange" },
          { label: "My account" },
          { label: "Something else" },
        ],
      },

      // Product
      { ref: "product", type: "short_text", title: "Which product are you asking about?", required: true, maxLength: 160 },
      { ref: "product_link", type: "url", title: "A link to it, if you have one handy", required: false },

      // Delivery
      {
        ref: "delivery_to",
        type: "short_text",
        title: "Which town or country would it be delivered to?",
        required: true,
        maxLength: 120,
      },

      // Product and delivery
      {
        ref: "buying_soon",
        type: "single_select",
        title: "How close are you to ordering?",
        required: true,
        options: [
          { label: "Ready to order once I know" },
          { label: "In the next few weeks" },
          { label: "Just looking for now" },
        ],
      },

      // Order, return, account
      {
        ref: "reference",
        type: "short_text",
        title: "Your order or account number",
        description: "It's in your confirmation email. Skip this if you can't find it.",
        required: false,
        maxLength: 60,
      },

      // Everyone
      {
        ref: "message",
        type: "long_text",
        title: "What would you like to know?",
        description: "The more detail you give, the more useful our first reply will be.",
        required: true,
        maxLength: 2000,
      },
      {
        ref: "attachment",
        type: "file_upload",
        title: "A photo or screenshot that would help us answer?",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 3,
        maxSizeMB: 10,
      },
      {
        ref: "reply_by",
        type: "single_select",
        title: "How should we reply?",
        required: true,
        options: [{ label: "By email" }, { label: "Give me a call" }],
      },
      { ref: "phone", type: "phone", title: "What number should we call?", required: true },
    ],
    branches: [
      { when: "topic", is: "A product: sizes, specs or stock", then: "product" },
      { when: "topic", is: "Delivery times and costs", then: "delivery_to" },
      { when: "topic", is: "An order I've placed", then: "reference" },
      { when: "topic", is: "A return or exchange", then: "reference" },
      { when: "topic", is: "My account", then: "reference" },
      { when: "topic", is: "Something else", then: "message" },
      { when: "product_link", always: true, then: "buying_soon" },
      { when: "buying_soon", always: true, then: "message" },
      { when: "reply_by", is: "By email", then: "end_thanks" },
    ],
    ending: {
      title: "Question received 📬",
      body: "Thanks for getting in touch. The right person on our team will get back to you soon.",
    },
    guide: {
      questionsToConsider: [
        "Which topics go to different people, such as the shop floor, the warehouse or customer service?",
        "Where do customers find their order number, so the hint under that question points them to it?",
        "Do you actually offer phone replies? If not, remove the last two questions.",
        "Which product questions come up so often that the answer belongs on the product page?",
      ],
      howToUseResponses:
        "Answer anyone who is ready to order first: a quick, specific reply to a product question is often the difference between a sale and a lost one. Order and return questions arrive with the order number, so look it up before you reply. Every few weeks, read the product questions together and add the answers people keep asking for to the product pages.",
      customizeSteps: [
        "Rename the topics to match what you sell and how your team splits the work.",
        "Edit the ending to give a realistic reply time for your team.",
        "Embed the form on your product and contact pages, or link it from order confirmation emails.",
      ],
      faqs: [
        {
          q: "What is a customer inquiry form?",
          a: "A form shoppers and customers use to ask a question about a product, a delivery or an order. It collects the question together with the product or order it's about, so your team can answer in one reply.",
        },
        {
          q: "What's the difference between an inquiry and a complaint?",
          a: "An inquiry is a question, like whether something is in stock or when it will arrive. A complaint says something went wrong and asks for it to be put right, so it needs different questions.",
        },
        {
          q: "Should I ask for a phone number on an inquiry form?",
          a: "Only when someone wants a call. This form asks for a number only after the person chooses a phone reply.",
        },
        {
          q: "Where do inquiries go once they're submitted?",
          a: "Every inquiry lands in your dashboard, where you can read it, filter by topic and export everything to CSV.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-service-request-form",
    type: "form",
    category: "customer-success",
    goals: [],
    roles: ["customer-success", "operations"],
    searchName: "Customer service request form",
    title: "Service request",
    icon: "Wrench",
    metaDescription:
      "Take repair, return, installation, account change and cancellation requests in one form that asks each type of request only the details it needs.",
    description: "One form for every kind of service request, with the right follow-up questions for each.",
    blurb:
      "The request type decides what is asked next. A repair is asked which product and what's wrong, an installation visit is asked what it's for, the address, the earliest date and any access notes, and a cancellation is asked why, so every request arrives ready to act on.",
    tags: ["service request", "customer service form", "repair request", "installation request", "branching"],
    greeting: "Hi! Tell us what you need and we'll get the right person on it.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who is the request for?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "account_ref",
        type: "short_text",
        title: "Your customer, order or account number",
        description: "Skip this if you don't have it to hand.",
        required: false,
        maxLength: 60,
      },
      {
        ref: "request_type",
        type: "single_select",
        title: "What do you need help with?",
        required: true,
        options: [
          { label: "Repair or fix something" },
          { label: "An installation or setup visit" },
          { label: "Return or exchange an item" },
          { label: "A change to my account or plan" },
          { label: "Cancel a service" },
          { label: "Something else" },
        ],
      },

      // Repair
      { ref: "item", type: "short_text", title: "Which product needs attention?", required: true, maxLength: 120 },
      { ref: "fault", type: "long_text", title: "What's wrong with it, and when did it start?", required: true, maxLength: 1500 },
      {
        ref: "warranty",
        type: "yes_no",
        title: "Is it still under warranty?",
        required: false,
        yesLabel: "Yes",
        noLabel: "No or not sure",
      },

      // Installation visit
      {
        ref: "install_what",
        type: "short_text",
        title: "What are we installing or setting up?",
        required: true,
        maxLength: 160,
      },
      {
        ref: "visit_address",
        type: "address",
        title: "Where should we come?",
        required: true,
        fields: ["street", "city", "postal", "country"],
      },
      {
        ref: "visit_date",
        type: "date",
        title: "What's the earliest date that suits you?",
        required: true,
        disablePast: true,
      },
      {
        ref: "access_notes",
        type: "long_text",
        title: "Anything our technician should know about access or parking?",
        required: false,
        maxLength: 500,
      },

      // Cancellation
      {
        ref: "cancel_reason",
        type: "single_select",
        title: "What's the main reason you're cancelling?",
        required: true,
        options: [
          { label: "It costs too much" },
          { label: "I don't use it enough" },
          { label: "I'm switching to another provider" },
          { label: "I'm moving or closing" },
          { label: "I've had problems with the service" },
        ],
        allowOther: true,
      },

      // Returns, account changes, anything else
      {
        ref: "request_details",
        type: "long_text",
        title: "Tell us what you'd like us to do.",
        required: true,
        maxLength: 1500,
      },

      // Everyone
      {
        ref: "photos",
        type: "file_upload",
        title: "Any photos or documents that would help?",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
        maxSizeMB: 20,
      },
      {
        ref: "priority",
        type: "single_select",
        title: "How soon do you need this sorted?",
        required: true,
        options: [
          { label: "As soon as possible" },
          { label: "Within the week" },
          { label: "Whenever suits you" },
        ],
      },
      {
        ref: "contact_time",
        type: "single_select",
        title: "When is the best time to reach you?",
        required: false,
        options: [{ label: "Mornings" }, { label: "Afternoons" }, { label: "Evenings" }, { label: "Any time" }],
      },
    ],
    branches: [
      { when: "request_type", is: "Repair or fix something", then: "item" },
      { when: "request_type", is: "An installation or setup visit", then: "install_what" },
      { when: "request_type", is: "Cancel a service", then: "cancel_reason" },
      { when: "request_type", is: "Return or exchange an item", then: "request_details" },
      { when: "request_type", is: "A change to my account or plan", then: "request_details" },
      { when: "request_type", is: "Something else", then: "request_details" },
      { when: "warranty", always: true, then: "photos" },
      { when: "access_notes", always: true, then: "contact_time" },
      { when: "cancel_reason", always: true, then: "priority" },
    ],
    ending: {
      title: "Request received 🛠️",
      body: "Thanks. We'll confirm the next step by email, or ring you if it's quicker to talk it through.",
    },
    guide: {
      questionsToConsider: [
        "Which request types do you actually handle? Remove the arms for anything you don't offer.",
        "Do cancellations go to a different team, and should they get a call before anything is processed?",
        "What does a technician need to know before a visit, such as parking, pets or building access?",
        "Is there a warranty or order number you need before you can book a repair?",
      ],
      howToUseResponses:
        "Filter by request type in the dashboard so each team sees its own queue, and handle the ones marked as soon as possible first. Book installation visits from the preferred date and pass the access notes to the technician. Read the cancellation reasons every month: a pattern of the same reason is something to fix before it costs you more customers.",
      customizeSteps: [
        "Edit the request types and their follow-up questions to match the services you offer.",
        "Change the priority options to wording that fits your reply times.",
        "Put the link on your website, in order confirmation emails and on printed service paperwork.",
      ],
      faqs: [
        {
          q: "What is a customer service request form?",
          a: "A form customers use to ask for something to be done, such as a repair, a return, a visit or a change to their account. It collects the details your team needs to act without a back-and-forth.",
        },
        {
          q: "Can one form handle different kinds of requests?",
          a: "Yes. This form branches on the request type, so a repair, an installation and a cancellation each get their own follow-up questions and skip the rest.",
        },
        {
          q: "How is a service request different from a complaint?",
          a: "A service request asks for something to be done. A complaint reports that something went wrong and asks for it to be put right, which needs different questions.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "faq-form",
    type: "form",
    category: "customer-success",
    goals: ["collect-feedback"],
    roles: ["customer-success", "product-research", "marketing"],
    searchName: "FAQ form",
    title: "Missing FAQ question",
    icon: "Search",
    metaDescription:
      "Find the gaps in your help content: collect the questions people couldn't find answered, in their own words, with where they looked and how stuck they are.",
    description: "Collect the questions your FAQ doesn't answer yet, in your customers' own words.",
    blurb:
      "Put it at the bottom of your help pages to catch the questions they miss. It records where people looked first and how much the gap is holding them up, asks what was confusing when an answer existed but didn't help, and only asks for an email when someone wants a personal reply.",
    tags: ["FAQ form", "help center feedback", "knowledge base", "customer questions", "content gaps"],
    greeting: "Couldn't find what you were looking for? Ask here and we'll use it to improve our answers.",
    questions: [
      {
        ref: "question",
        type: "long_text",
        title: "What question couldn't you find an answer to?",
        description: "Write it the way you'd ask a friend. Your wording helps us name things better.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "area",
        type: "dropdown",
        title: "Which area is it about?",
        required: true,
        options: [
          { label: "Getting started" },
          { label: "Prices and billing" },
          { label: "Orders and delivery" },
          { label: "Account, privacy and security" },
          { label: "Using the product" },
          { label: "Something else" },
        ],
      },
      {
        ref: "looked",
        type: "multi_select",
        title: "Where did you look before asking?",
        required: true,
        options: [
          { label: "The FAQ or help pages" },
          { label: "The search on this site" },
          { label: "A search engine" },
          { label: "Someone on your team" },
          { label: "Nowhere yet" },
        ],
      },
      {
        ref: "found",
        type: "single_select",
        title: "Did you find anything close?",
        required: true,
        options: [
          { label: "Nothing at all" },
          { label: "Something related, but not my question" },
          { label: "An answer, but it was confusing or out of date" },
        ],
      },
      {
        ref: "confusing",
        type: "long_text",
        title: "Which page was it, and what didn't make sense?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "stuck",
        type: "opinion_scale",
        title: "How much is this holding you up?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Just curious",
        labelHigh: "I'm stuck until I know",
      },
      {
        ref: "wants_reply",
        type: "yes_no",
        title: "Would you like a personal reply as well?",
        required: true,
      },
      { ref: "email", type: "email", title: "Where should we send it?", required: true },
    ],
    branches: [
      { when: "looked", op: "includes", is: "Nowhere yet", then: "stuck" },
      { when: "found", is: "An answer, but it was confusing or out of date", then: "confusing" },
      { when: "found", is: "Nothing at all", then: "stuck" },
      { when: "found", is: "Something related, but not my question", then: "stuck" },
      { when: "wants_reply", is: false, then: "end_thanks" },
    ],
    ending: {
      title: "Thanks for asking 💡",
      body: "Every question here is read by the people who write our help pages. If you asked for a reply, it will come by email.",
    },
    guide: {
      questionsToConsider: [
        "Which help pages will link to this form, and should each link pass the page name as a hidden field?",
        "Do the areas in the dropdown match the sections of your help center?",
        "Who turns new questions into FAQ entries, and how often do they review them?",
        "Can your team promise a personal reply, or should this form only collect questions?",
      ],
      howToUseResponses:
        "Group the questions by area each week and look for the same question asked in different words. Anyone marked as stuck deserves a reply first. When people say they found an answer but it was confusing, fix that page before writing a new one, and borrow their wording for the page title so the next person finds it.",
      customizeSteps: [
        "Rename the areas in the dropdown to match the sections of your help center.",
        "Remove the reply questions if you only want to collect questions, not answer them one by one.",
        "Embed the form at the bottom of your FAQ and help pages, where people land when they're stuck.",
      ],
      faqs: [
        {
          q: "What is an FAQ form?",
          a: "A form that collects the questions people couldn't find answered in your FAQ or help pages. It shows you which answers are missing and how customers phrase their questions.",
        },
        {
          q: "Where should I put an FAQ form?",
          a: "At the bottom of your FAQ and help articles, where someone who didn't find an answer is already looking. You can embed it on the page or link to it.",
        },
        {
          q: "How do I turn submitted questions into FAQ entries?",
          a: "Group questions by area, pick the ones asked most or marked as blocking, and write the answer using the customer's own words in the heading.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "gdpr-data-removal-request-form",
    type: "form",
    category: "customer-success",
    goals: [],
    roles: ["operations", "customer-success"],
    searchName: "GDPR data removal request form",
    title: "Data deletion request",
    icon: "ShieldCheck",
    metaDescription:
      "Let people ask you to erase their personal data under GDPR, with the details you need to find their records and a declaration before you act.",
    description: "A clear route for right-to-erasure requests, with enough detail to find the records.",
    blurb:
      "Collects who is asking, how they know you and what they want erased, then asks for a signed-off declaration before anything is deleted. People who only want to stop marketing emails get their own ending, and anyone asking on someone else's behalf is asked for their own contact details and proof they can act.",
    tags: ["GDPR", "data deletion request", "right to erasure", "privacy request", "data removal", "branching"],
    greeting: "You can ask us to delete the personal data we hold about you. It only takes a few minutes.",
    questions: [
      {
        ref: "full_name",
        type: "short_text",
        title: "What's your full name?",
        description: "Asking for someone else? Give their name here, and yours at the end.",
        required: true,
        maxLength: 120,
      },
      {
        ref: "email",
        type: "email",
        title: "Which email address do we know you by?",
        description: "Theirs, if you're asking for someone else. We'll use it to find the records and confirm the request.",
        required: true,
      },
      {
        ref: "relationship",
        type: "single_select",
        title: "How have you dealt with us?",
        required: true,
        options: [
          { label: "I have or had an account" },
          { label: "I bought something without an account" },
          { label: "I'm on a mailing list" },
          { label: "I applied for a job" },
          { label: "I'm not sure" },
        ],
      },
      {
        ref: "account_id",
        type: "short_text",
        title: "Your username or account ID, if it's different from your email",
        required: false,
        maxLength: 120,
      },
      {
        ref: "other_details",
        type: "long_text",
        title: "Anything else that could help us find your records?",
        description: "Old email addresses, a phone number or an order number all help.",
        required: false,
        maxLength: 800,
      },
      {
        ref: "scope",
        type: "single_select",
        title: "What would you like us to do?",
        required: true,
        options: [
          { label: "Delete all the personal data you hold about me" },
          { label: "Delete only some of it" },
          { label: "Just stop sending me marketing" },
        ],
      },
      {
        ref: "which_data",
        type: "long_text",
        title: "Which data would you like deleted?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "reason",
        type: "single_select",
        title: "Would you like to tell us why?",
        description: "You don't have to give a reason.",
        required: false,
        options: [
          { label: "I no longer use your service" },
          { label: "I'm worried about how my data is used" },
          { label: "I never agreed to you having it" },
          { label: "I'd rather not say" },
        ],
      },
      {
        ref: "acting_for",
        type: "single_select",
        title: "Are you asking for yourself?",
        required: true,
        options: [{ label: "Yes, the data is about me" }, { label: "No, I'm asking for someone else" }],
      },
      {
        ref: "requester",
        type: "contact_info",
        title: "Your own name and email, so we can reply to you",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "authority",
        type: "file_upload",
        title: "Please upload proof that you can act for them",
        description: "For example a signed letter of authority or a power of attorney.",
        required: true,
        accept: ["image/*", "application/pdf"],
        maxFiles: 3,
        maxSizeMB: 10,
      },
      {
        ref: "declaration",
        type: "legal_consent",
        title: "Declaration",
        required: true,
        consentText:
          "I confirm the information I've given is accurate and that I am the person the data is about, or am authorised to act for them. I understand you may contact me to confirm my identity before acting on this request.",
      },
    ],
    branches: [
      { when: "relationship", is: "I bought something without an account", then: "other_details" },
      { when: "relationship", is: "I'm on a mailing list", then: "other_details" },
      { when: "relationship", is: "I applied for a job", then: "other_details" },
      { when: "relationship", is: "I'm not sure", then: "other_details" },
      { when: "scope", is: "Delete all the personal data you hold about me", then: "reason" },
      { when: "scope", is: "Delete only some of it", then: "which_data" },
      { when: "scope", is: "Just stop sending me marketing", then: "end_marketing" },
      { when: "acting_for", is: "Yes, the data is about me", then: "declaration" },
    ],
    endings: [
      {
        ref: "end_marketing",
        title: "We'll stop the marketing emails",
        body: "We'll remove this address from our marketing lists. If you later want your data deleted as well, you can fill in this form again.",
      },
    ],
    ending: {
      title: "Request received 🔒",
      body: "We'll email you to confirm, and may ask you to verify your identity first. We'll tell you once your data has been deleted, or explain anything we're required to keep.",
    },
    guide: {
      questionsToConsider: [
        "Who in your organisation handles privacy requests, and who reads this form?",
        "How will you confirm someone's identity before deleting anything?",
        "Which records are you legally required to keep, such as invoices, and how will you explain that?",
        "Which systems hold personal data, so nothing is missed when you delete?",
      ],
      howToUseResponses:
        "Log each request the day it arrives, because the one-month response window under GDPR starts then. Confirm the person's identity before acting, search every system using the email and extra details they gave, and check any authority document before acting for someone else. Reply to say what you deleted and what you kept, with the reason. Keep a record of the request itself, without the deleted data, to show you handled it.",
      customizeSteps: [
        "Edit the relationship options to list the ways people actually share data with you.",
        "Rewrite the declaration and default ending with your own verification process, and have them checked by whoever handles privacy.",
        "Link the form from your privacy policy, account settings and email footers.",
      ],
      faqs: [
        {
          q: "What is a GDPR data removal request?",
          a: "It is a request under the right to erasure, sometimes called the right to be forgotten, asking an organisation to delete personal data it holds about someone.",
        },
        {
          q: "How long do I have to respond to a data deletion request?",
          a: "Under GDPR you must respond without undue delay and within one month of receiving the request. That period can be extended in some cases, but you have to tell the person why.",
        },
        {
          q: "Do I have to delete everything someone asks for?",
          a: "Not always. Some data, such as financial records, may have to be kept by law. Tell the person what you kept and why.",
        },
        {
          q: "Should I verify identity before deleting data?",
          a: "Yes, when you have reasonable doubt about who is asking. Deleting data for the wrong person is a problem in its own right, so ask for only as much proof as you need.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "refund-request",
    type: "form",
    category: "customer-success",
    goals: [],
    roles: ["customer-success", "operations"],
    searchName: "Refund request form",
    title: "Refund request",
    icon: "ReceiptText",
    metaDescription:
      "Handle refund requests with the order reference, reason and evidence up front: photos for damage, tracking for missing parcels, statements for double charges.",
    description: "Refund requests with the evidence your team needs, collected once.",
    blurb:
      "Order reference, reason and preferred outcome, asked once so nobody has to email back for them. A damaged item is asked for photos, a missing parcel for its tracking status, and a double charge goes straight to finance with its own ending. The reason list also becomes a running count of why people ask for their money back.",
    tags: ["refund request", "return form", "ecommerce", "billing", "branching"],
    greeting: "Let's sort this out. First, a few details about the order.",
    questions: [
      { ref: "email", type: "email", title: "Which email did you use for the order?", required: true },
      { ref: "order_reference", type: "short_text", title: "Your order or invoice number", required: true, maxLength: 60 },
      { ref: "order_date", type: "date", title: "Roughly when did you order?", required: false },
      {
        ref: "amount",
        type: "number",
        title: "How much did you pay?",
        description: "An estimate is fine.",
        required: false,
        min: 0,
      },
      {
        ref: "reason",
        type: "single_select",
        title: "Why are you asking for a refund?",
        required: true,
        options: [
          { label: "It arrived damaged or faulty" },
          { label: "It never arrived" },
          { label: "I was charged twice" },
          { label: "It wasn't what I expected" },
          { label: "I changed my mind" },
        ],
      },

      // Damaged
      {
        ref: "damage_photos",
        type: "file_upload",
        title: "Photos of the damage",
        description: "One of the item and one of the packaging is usually enough.",
        required: true,
        accept: ["image/*"],
        maxFiles: 5,
        maxSizeMB: 20,
      },
      {
        ref: "damage_when",
        type: "single_select",
        title: "When did you notice?",
        required: false,
        options: [{ label: "As soon as I opened it" }, { label: "Within a few days" }, { label: "After using it for a while" }],
      },

      // Never arrived
      {
        ref: "tracking_status",
        type: "single_select",
        title: "What does the tracking say?",
        required: true,
        options: [
          { label: "Delivered, but it isn't here" },
          { label: "Still in transit" },
          { label: "No updates at all" },
          { label: "I don't have a tracking number" },
        ],
      },
      {
        ref: "delivery_address",
        type: "address",
        title: "Please confirm the delivery address",
        required: false,
        fields: ["street", "city", "postal", "country"],
      },

      // Charged twice
      {
        ref: "duplicate_charges",
        type: "short_text",
        title: "Which amounts and dates do you see on your statement?",
        required: true,
        maxLength: 200,
      },

      // Not what I expected, changed my mind
      {
        ref: "expectation_gap",
        type: "long_text",
        title: "What made it the wrong fit for you?",
        required: false,
        maxLength: 800,
      },

      // Items the customer still has
      {
        ref: "condition",
        type: "single_select",
        title: "What condition is it in now?",
        required: true,
        options: [
          { label: "Unopened" },
          { label: "Opened but unused" },
          { label: "Used" },
          { label: "Damaged" },
        ],
      },

      // Everyone except double charges
      {
        ref: "resolution",
        type: "single_select",
        title: "What would you like us to do?",
        required: true,
        options: [
          { label: "Refund to my original payment method" },
          { label: "Store credit" },
          { label: "Send a replacement" },
        ],
      },
      { ref: "detail", type: "long_text", title: "Anything else we should know?", required: false, maxLength: 1000 },
    ],
    branches: [
      { when: "reason", is: "It arrived damaged or faulty", then: "damage_photos" },
      { when: "reason", is: "It never arrived", then: "tracking_status" },
      { when: "reason", is: "I was charged twice", then: "duplicate_charges" },
      { when: "reason", is: "It wasn't what I expected", then: "expectation_gap" },
      { when: "reason", is: "I changed my mind", then: "expectation_gap" },
      { when: "damage_when", always: true, then: "condition" },
      { when: "delivery_address", always: true, then: "resolution" },
      { when: "duplicate_charges", always: true, then: "end_finance" },
    ],
    endings: [
      {
        ref: "end_finance",
        title: "Sent to our finance team 💳",
        body: "We'll check the duplicate charge against your order and reverse it if it's ours. You don't need to do anything else.",
      },
    ],
    ending: {
      title: "Refund request received",
      body: "Thanks. We'll review it and email you with the outcome, and with return instructions if we need the item back.",
    },
    guide: {
      questionsToConsider: [
        "What does your refund policy require, such as a time limit or unused condition, and does the form ask for it?",
        "Do you offer store credit or replacements, or only refunds?",
        "Who handles duplicate charges, and can they act without the customer returning anything?",
        "Do you need the item back before refunding, and how will you send return instructions?",
      ],
      howToUseResponses:
        "Check each request against your refund policy using the order date and condition answers, and approve the clear cases quickly. Damage photos are worth passing to your supplier or courier when the same fault keeps coming up. Export to CSV monthly and count requests by reason: a rise in items that weren't as expected usually points to a product page that needs better photos or wording.",
      customizeSteps: [
        "Edit the reasons and resolutions so they match your refund policy.",
        "Add your return window or conditions to the greeting so people know them before they start.",
        "Link the form from order confirmation emails and your returns page.",
      ],
      faqs: [
        {
          q: "What should a refund request form include?",
          a: "The customer's email, the order number, the date, the reason for the refund, any evidence such as photos, the condition of the item, and whether they want a refund, credit or replacement.",
        },
        {
          q: "Should customers upload photos for a refund?",
          a: "For damaged or faulty items, yes. This form only asks for photos when the customer says the item arrived damaged, so nobody else is asked for them.",
        },
        {
          q: "Can I offer store credit instead of a refund?",
          a: "Yes. The form asks what the customer would prefer, and you can edit the options to match what your policy allows.",
        },
        {
          q: "How do I track refund requests?",
          a: "Every request lands in your dashboard with its reason and order number, and you can export them to CSV to track them alongside your orders.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "support-ticket",
    type: "form",
    category: "customer-success",
    goals: [],
    roles: ["customer-success", "operations"],
    searchName: "Support ticket form",
    title: "Support ticket",
    icon: "LifeBuoy",
    metaDescription:
      "A support ticket form that sorts each request by category, asks the details that queue needs, and records what the customer has already tried.",
    description: "Route requests to the right queue, with the details that queue needs.",
    blurb:
      "Asking for the category up front sends each ticket to the right person without a triage pass, and each category asks its own questions: billing gets an invoice number, login gets the exact error, a how-to question gets asked about the goal instead of the button. Blocking tickets get their own ending so the customer knows they were flagged.",
    tags: ["support ticket", "help desk form", "customer support", "ticketing", "branching"],
    greeting: "How can we help? Tell us what's going on.",
    questions: [
      { ref: "email", type: "email", title: "What's the email on your account?", required: true },
      {
        ref: "category",
        type: "single_select",
        title: "What's this about?",
        required: true,
        options: [
          { label: "Billing or invoices" },
          { label: "Account and sign-in" },
          { label: "Something isn't working" },
          { label: "How do I do something?" },
          { label: "Something else" },
        ],
      },

      // Billing
      {
        ref: "invoice_number",
        type: "short_text",
        title: "Which invoice? The number is usually at the top.",
        required: false,
        maxLength: 60,
      },
      {
        ref: "billing_issue",
        type: "single_select",
        title: "What do you need?",
        required: true,
        options: [
          { label: "I was charged the wrong amount" },
          { label: "I was charged twice" },
          { label: "A tax number or address added to an invoice" },
          { label: "To change my plan" },
          { label: "Help with a declined card" },
        ],
      },

      // Account and sign-in
      {
        ref: "login_error",
        type: "short_text",
        title: "What does the error say, word for word?",
        required: false,
        maxLength: 300,
      },
      {
        ref: "login_method",
        type: "single_select",
        title: "How do you normally sign in?",
        required: true,
        options: [{ label: "Email and password" }, { label: "Google" }, { label: "A magic link" }, { label: "Single sign-on" }],
      },

      // Something isn't working
      {
        ref: "broken_where",
        type: "short_text",
        title: "Where in the product?",
        description: "The page name or the URL is perfect.",
        required: true,
        maxLength: 300,
      },
      {
        ref: "broken_since",
        type: "single_select",
        title: "Since when?",
        required: false,
        options: [{ label: "Just now" }, { label: "Today" }, { label: "This week" }, { label: "It's never worked" }],
      },

      {
        ref: "broken_what",
        type: "long_text",
        title: "What happens, and what did you expect to happen?",
        required: true,
        maxLength: 1500,
      },

      // How do I
      {
        ref: "trying_to_do",
        type: "long_text",
        title: "What are you trying to get done?",
        description: "Describe the result you want, not the button. There's often a shorter way.",
        required: true,
        maxLength: 1000,
      },

      // Something else
      {
        ref: "other_issue",
        type: "long_text",
        title: "Tell us what's going on.",
        required: true,
        maxLength: 2000,
      },

      // Everyone
      {
        ref: "tried",
        type: "long_text",
        title: "What have you already tried?",
        description: "Even \"nothing yet\" helps, so we don't suggest what you've done.",
        required: false,
        maxLength: 1000,
      },
      { ref: "details", type: "long_text", title: "Anything else we should know?", required: false, maxLength: 2000 },
      {
        ref: "attachment",
        type: "file_upload",
        title: "Anything to attach? A screenshot is often worth a paragraph.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 3,
      },
      {
        ref: "urgency",
        type: "single_select",
        title: "How urgent is it?",
        required: true,
        options: [
          { label: "Blocking: I can't work" },
          { label: "Important, but it can wait a day" },
          { label: "Whenever you get to it" },
        ],
      },
    ],
    branches: [
      { when: "category", is: "Billing or invoices", then: "invoice_number" },
      { when: "category", is: "Account and sign-in", then: "login_error" },
      { when: "category", is: "Something isn't working", then: "broken_where" },
      { when: "category", is: "How do I do something?", then: "trying_to_do" },
      { when: "category", is: "Something else", then: "other_issue" },
      { when: "billing_issue", always: true, then: "tried" },
      { when: "login_method", always: true, then: "tried" },
      { when: "broken_what", always: true, then: "tried" },
      { when: "trying_to_do", always: true, then: "tried" },
      { when: "urgency", is: "Blocking: I can't work", then: "end_urgent" },
    ],
    endings: [
      {
        ref: "end_urgent",
        title: "Flagged as urgent 🚨",
        body: "Your ticket is at the top of the queue. We'll reply to your account email as soon as someone picks it up.",
      },
    ],
    ending: { title: "Ticket created 🎫", body: "Thanks. We'll reply to your account email, usually within a working day." },
    guide: {
      questionsToConsider: [
        "Which categories map to separate people or queues on your team?",
        "What does each queue always ask for first? Put that question in its arm.",
        "What reply time can you really promise for urgent and normal tickets?",
        "Should the how-to arm point people to your help pages before they submit?",
      ],
      howToUseResponses:
        "Work the urgent tickets first, then filter by category so each person takes their own queue. Read the tried answer before replying so your first message moves things forward instead of repeating the basics. Every few weeks, look at the how-to tickets: the questions that keep coming back are the help articles you should write next.",
      customizeSteps: [
        "Rename the categories to match your support queues and edit each arm's questions.",
        "Update both endings with reply times your team can keep.",
        "Link the form from your app's help menu, your help pages and your email footer.",
      ],
      faqs: [
        {
          q: "What should a support ticket form include?",
          a: "The customer's account email, a category, the details that category needs, what they've already tried, any screenshots, and how urgent it is.",
        },
        {
          q: "Why ask for a category first?",
          a: "It sends each ticket to the right person without someone sorting them, and lets the form ask only the questions that matter for that kind of problem.",
        },
        {
          q: "Why ask what the customer has already tried?",
          a: "It saves a round of replies. Nobody wants to be told to restart the app when they did that an hour ago.",
        },
        {
          q: "Can I use this instead of a help desk tool?",
          a: "For a small team, often yes. Tickets arrive in your dashboard, you can filter them by category and export them to CSV.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "product-onboarding-form",
    type: "form",
    category: "customer-success",
    goals: ["onboard-clients"],
    roles: ["customer-success", "product-research"],
    searchName: "Product onboarding form",
    title: "Product onboarding",
    icon: "Rocket",
    metaDescription:
      "Learn what each new customer wants from your product, who will use it and what to set up first, then offer a walkthrough call to those who want one.",
    description: "Find out what a new customer needs to get started, before they get lost.",
    blurb:
      "Asks new customers for their goal, their team and what they want to set up first, so your welcome can be about their job instead of a generic tour. People switching from another tool are asked what they're leaving and whether data needs to come across, and anyone who wants a walkthrough is asked for a number and a date.",
    tags: ["product onboarding", "customer onboarding", "welcome survey", "SaaS onboarding", "branching"],
    greeting: "Welcome! Tell us a little about what you're here to do and we'll help you get started.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "What's your name and email?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "Which company or team are you with?", required: false, maxLength: 120 },
      {
        ref: "role",
        type: "dropdown",
        title: "What's your role?",
        required: true,
        options: [
          { label: "Founder or owner" },
          { label: "Manager or team lead" },
          { label: "Individual contributor" },
          { label: "IT or admin" },
          { label: "Something else" },
        ],
      },
      {
        ref: "team_size",
        type: "single_select",
        title: "How many people will use it?",
        required: true,
        options: [{ label: "Just me" }, { label: "2–10" }, { label: "11–50" }, { label: "More than 50" }],
      },
      {
        ref: "starting_point",
        type: "single_select",
        title: "Which of these sounds most like you?",
        required: true,
        options: [
          { label: "We're replacing a tool we use today" },
          { label: "We're setting up something new" },
          { label: "I'm trying it out before we decide" },
        ],
      },
      {
        ref: "current_tool",
        type: "short_text",
        title: "What are you using today?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "migrate",
        type: "yes_no",
        title: "Do you need to bring existing data across?",
        required: true,
      },
      {
        ref: "goal",
        type: "long_text",
        title: "What would make your first month with us a success?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "first_setup",
        type: "ranking",
        title: "Put these in the order you'd like to set them up",
        required: true,
        items: [
          "Inviting my team",
          "Getting our data in",
          "Connecting other tools we use",
          "Settings and branding",
          "Reports",
        ],
      },
      {
        ref: "comfort",
        type: "opinion_scale",
        title: "How comfortable are you with tools like this?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Brand new to it",
        labelHigh: "I've used plenty",
      },
      {
        ref: "go_live",
        type: "date",
        title: "Is there a date you need to be up and running by?",
        required: false,
        disablePast: true,
      },
      {
        ref: "setup_help",
        type: "single_select",
        title: "How would you like to get set up?",
        required: true,
        options: [
          { label: "I'll find my way around" },
          { label: "Send me a short setup guide" },
          { label: "I'd like a walkthrough call" },
        ],
      },
      { ref: "phone", type: "phone", title: "What number should we call?", required: true },
      {
        ref: "call_date",
        type: "date",
        title: "Which day suits you for the call?",
        required: true,
        disablePast: true,
      },
    ],
    branches: [
      { when: "starting_point", is: "We're setting up something new", then: "goal" },
      { when: "starting_point", is: "I'm trying it out before we decide", then: "goal" },
      { when: "setup_help", is: "I'll find my way around", then: "end_thanks" },
      { when: "setup_help", is: "Send me a short setup guide", then: "end_thanks" },
      { when: "call_date", always: true, then: "end_call" },
    ],
    endings: [
      {
        ref: "end_call",
        title: "Walkthrough requested 📞",
        body: "We'll confirm a time by email. Bring your questions, and we'll set up the first thing on your list together.",
      },
    ],
    ending: {
      title: "You're ready to go 🚀",
      body: "Thanks! We'll send tips that match what you told us, starting with the first thing on your list.",
    },
    guide: {
      questionsToConsider: [
        "What are the first three things a new customer must set up before your product is useful?",
        "Which tools do people usually switch from, and can you help them bring data across?",
        "Who on your team takes walkthrough calls, and how many can they fit in a week?",
        "Should the form be shown right after sign-up, or sent by email a day later?",
      ],
      howToUseResponses:
        "Use the ranking and goal answers to choose which welcome emails or guides each customer gets, rather than sending everyone the same tour. Customers switching tools who need data brought across are the most likely to stall, so reach out to them first. Look at the comfort scores over time: if most new customers say they're new to tools like yours, your first screens should explain more.",
      customizeSteps: [
        "Replace the ranking items with the real setup steps in your product.",
        "Edit the starting point options to name the situations your customers usually come from.",
        "Show the form straight after sign-up or link it from your welcome email.",
      ],
      faqs: [
        {
          q: "What should a product onboarding form ask?",
          a: "Who the customer is, their role and team size, what they want to achieve, what they're switching from, and what they'd like to set up first. That's enough to tailor the first week.",
        },
        {
          q: "When should new customers fill in an onboarding form?",
          a: "Right after they sign up, while they remember why they came. Keep it short so it doesn't stand between them and the product.",
        },
        {
          q: "How do I use onboarding answers to reduce churn?",
          a: "Follow up with the customers most at risk, such as those switching from another tool or new to your kind of product, and send each group help that matches their goal.",
        },
        {
          q: "Can the form offer a setup call only to people who want one?",
          a: "Yes. This form asks how each person wants to get set up and only asks for a phone number and a date when they choose a walkthrough call.",
        },
      ],
    },
  }),
];
