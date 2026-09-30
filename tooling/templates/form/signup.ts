import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_SIGNUP: TemplateSeed[] = [
  defineTemplate({
    slug: "online-signup-form",
    type: "form",
    category: "signup",
    goals: ["onboard-clients", "generate-leads"],
    roles: ["marketing", "operations", "customer-success"],
    searchName: "Online signup form",
    title: "Online signup",
    icon: "UserPlus",
    metaDescription:
      "Sign people up to your program, club or community in about two minutes. Group signups get two questions of their own, and everyone hears what comes next.",
    description: "A short signup that tells you who joined, why, and whether they came alone or with a team.",
    blurb:
      "Most signup forms stop at a name and an email, and you learn nothing you can act on. This one also asks what people want from joining and how they like to hear from you. Anyone signing up for a team or organisation gets two extra questions about it, so group signups are easy to spot in your list.",
    tags: ["online signup form", "community signup", "program registration", "member signup", "join form"],
    greeting: "Glad you're joining us. This takes about two minutes, then you're in.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, who are you?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "joining_as",
        type: "single_select",
        title: "Are you signing up just for yourself, or for a group?",
        required: true,
        options: [{ label: "Just for me" }, { label: "For a team or organisation" }],
      },

      // Group signups
      {
        ref: "org_name",
        type: "short_text",
        title: "What is the team or organisation called?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "group_size",
        type: "number",
        title: "Roughly how many people will be joining with you?",
        required: false,
        min: 1,
        max: 10000,
        integerOnly: true,
      },

      // Everyone
      {
        ref: "location",
        type: "address",
        title: "Where are you based?",
        description: "City and country are enough. It helps us plan meetups and time zones.",
        required: false,
        fields: ["city", "country"],
      },
      {
        ref: "interests",
        type: "multi_select",
        title: "What are you hoping to get out of joining?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Learning new skills" },
          { label: "Meeting people like me" },
          { label: "Getting help with a problem" },
          { label: "Sharing what I know" },
          { label: "Staying up to date" },
        ],
      },
      {
        ref: "experience",
        type: "opinion_scale",
        title: "How new are you to what we do?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Brand new to it",
        labelHigh: "I could teach it",
      },
      {
        ref: "heard_from",
        type: "dropdown",
        title: "How did you hear about us?",
        required: false,
        options: [
          { label: "A friend or colleague" },
          { label: "Social media" },
          { label: "Search engine" },
          { label: "An event" },
          { label: "A newsletter or blog" },
          { label: "Somewhere else" },
        ],
      },
      {
        ref: "updates",
        type: "single_select",
        title: "How often would you like to hear from us?",
        required: true,
        options: [{ label: "Every update" }, { label: "A weekly roundup" }, { label: "Only the important stuff" }],
      },
      {
        ref: "terms",
        type: "legal_consent",
        title: "The fine print",
        required: true,
        consentText:
          "I agree to the community guidelines and to receive emails about my membership. I can unsubscribe at any time.",
      },
    ],
    branches: [
      { when: "joining_as", is: "Just for me", then: "location" },
      { when: "joining_as", is: "For a team or organisation", then: "org_name" },
    ],
    ending: {
      title: "You're signed up 🎉",
      body: "A welcome email with your next steps is on its way. If you can't find it, have a look in your spam folder.",
    },
    guide: {
      questionsToConsider: [
        "What exactly are people joining: a mailing list, a paid program, a free community? The greeting and ending should say so plainly.",
        "Do you need a full address, or is a city and country enough for what you plan to do with it?",
        "What will a new member receive right after signing up, and how soon?",
        "Do group signups need different handling, such as a group rate or a single contact person?",
      ],
      howToUseResponses:
        "Filter by the team question first: group signups usually deserve a personal reply from a real person, not just the welcome email. Use the interests answers to decide what your first few messages talk about, and the familiarity score to split beginners from experienced members so nobody gets content that is too basic or too advanced. Export to CSV when you want to import the list somewhere else.",
      customizeSteps: [
        "Rewrite the greeting and ending so they name your program or community and say exactly what arrives after signup.",
        "Swap the interest options for the real reasons people join you, and delete the location question if you never meet in person.",
        "Replace the consent text with your own guidelines and privacy wording, then share the link or embed the form on your signup page.",
      ],
      faqs: [
        {
          q: "What should an online signup form include?",
          a: "A name, an email address, and a clear yes to your terms at the very least. A question about why they are joining costs a few seconds and tells you what to send them first.",
        },
        {
          q: "How long should a signup form be?",
          a: "Short enough to finish in a couple of minutes. This one asks group signups two extra questions and skips them for everyone else, so individuals see only what applies to them.",
        },
        {
          q: "Do I need a consent checkbox on a signup form?",
          a: "If you plan to email people, you should record that they agreed to it. The consent question here stores who accepted and what wording they saw.",
        },
        {
          q: "Can I embed this signup form on my website?",
          a: "Yes. After you use this template you can share it as a link or embed it on any page, and every signup appears in your dashboard.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "beta-signup",
    type: "form",
    category: "signup",
    goals: ["conduct-research", "generate-leads"],
    roles: ["product-research", "marketing"],
    searchName: "Beta tester signup form",
    title: "Beta signup",
    icon: "FlaskConical",
    metaDescription:
      "Recruit beta testers who will actually test. Ask about their setup, their time and their tolerance for bugs, and sort your first invite wave from the answers.",
    description: "Recruit testers who will actually test, sorted by platform and available time.",
    blurb:
      "A beta list full of people who never log in is worse than a short one. This asks about setup, the time someone can give and what they would try first. Anyone who can give real time is then asked how they like to give feedback and how many rough edges they can live with, which is exactly what you need to pick the first invite wave.",
    tags: ["beta tester signup", "beta program", "early access", "user research", "product testing"],
    greeting: "Want early access? Tell us a little about how you'd use it.",
    questions: [
      { ref: "email", type: "email", title: "What email should the invite go to?", required: true },
      { ref: "name", type: "short_text", title: "And your name?", required: false, maxLength: 80 },
      {
        ref: "role",
        type: "dropdown",
        title: "Which best describes your work?",
        required: false,
        options: [
          { label: "Founder or manager" },
          { label: "Engineer or developer" },
          { label: "Designer" },
          { label: "Marketing or sales" },
          { label: "Operations or support" },
          { label: "Student" },
          { label: "Something else" },
        ],
      },
      {
        ref: "platform",
        type: "multi_select",
        title: "Which platforms would you test on?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [{ label: "Web" }, { label: "iOS" }, { label: "Android" }, { label: "Desktop" }, { label: "API only" }],
      },
      {
        ref: "current_tool",
        type: "short_text",
        title: "What do you use today for the job this would do?",
        description: "A product name, a spreadsheet, or nothing at all are all useful answers.",
        required: false,
        maxLength: 150,
      },
      { ref: "use_case", type: "long_text", title: "What would you try first?", required: true, maxLength: 800 },
      {
        ref: "time_commitment",
        type: "single_select",
        title: "How much time could you give in the first month?",
        required: true,
        options: [{ label: "As much as it takes" }, { label: "A few hours" }, { label: "An hour or two" }],
      },

      // Testers who can give real time
      {
        ref: "feedback_style",
        type: "multi_select",
        title: "How would you rather give feedback?",
        required: false,
        minSelections: 0,
        maxSelections: 4,
        options: [
          { label: "Written notes as I go" },
          { label: "A call every couple of weeks" },
          { label: "Bug reports only" },
          { label: "Screen recordings" },
        ],
      },
      {
        ref: "rough_edges",
        type: "opinion_scale",
        title: "How much roughness can you live with?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Must basically work",
        labelHigh: "Break it, I'll tell you how",
      },
      {
        ref: "call_slot",
        type: "single_select",
        title: "Best time for an occasional call?",
        required: false,
        options: [{ label: "Mornings" }, { label: "Afternoons" }, { label: "Evenings" }, { label: "I'd rather not" }],
      },

      // Everyone
      {
        ref: "nda_consent",
        type: "legal_consent",
        title: "Keeping it quiet",
        required: true,
        consentText:
          "I understand the beta is confidential and agree not to share screenshots or details publicly until launch.",
      },
    ],
    branches: [
      { when: "time_commitment", is: "As much as it takes", then: "feedback_style" },
      { when: "time_commitment", is: "A few hours", then: "feedback_style" },
      { when: "time_commitment", is: "An hour or two", then: "nda_consent" },
    ],
    ending: {
      title: "You're on the list 🧪",
      body: "We invite testers in small waves. We'll email you when your invite is ready, along with how to send us feedback.",
    },
    guide: {
      questionsToConsider: [
        "How many testers can you actually support in the first wave, and what makes someone a priority?",
        "Which platforms are ready to test, and should the platform question only list those?",
        "Does your beta need a confidentiality agreement, or would it put people off for no reason?",
        "How will testers send feedback: a call, a shared channel, a form, or all of these?",
      ],
      howToUseResponses:
        "Start your first wave with people who chose \"As much as it takes\" and scored high on roughness: they will forgive the bugs and tell you about them. Group the rest by platform so each build goes to the people who can run it. Read the \"what would you try first\" answers before launch, because they show which workflow has to work on day one. Export to CSV to send invites in batches.",
      customizeSteps: [
        "Edit the platform list to the builds you really have, and remove the call question if you won't run calls.",
        "Rewrite the confidentiality wording to match your own terms, or delete it for an open beta.",
        "Share the link from your site, your app or your launch post, and mark who you invited so you can track who actually tested.",
      ],
      faqs: [
        {
          q: "What questions should a beta tester signup form ask?",
          a: "Contact details, the platform they will test on, what they would try first and how much time they can give. Those four answers decide who gets invited and when.",
        },
        {
          q: "How do I pick the best beta testers?",
          a: "Favour people with a real problem to solve and time to spend on it. This form asks both, and only people with time to give are asked about feedback style and call times.",
        },
        {
          q: "Should beta testers sign an NDA?",
          a: "Only if the beta is private and leaks would hurt you. The form includes a short confidentiality agreement you can edit or remove.",
        },
        {
          q: "Can I use this form for an app beta?",
          a: "Yes. Keep the iOS and Android options, remove the ones you don't ship, and add a question about device model if it matters for testing.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "waitlist",
    type: "form",
    category: "signup",
    goals: ["generate-leads", "conduct-research"],
    roles: ["marketing", "product-research"],
    searchName: "Waitlist form",
    title: "Launch waitlist",
    icon: "ListOrdered",
    metaDescription:
      "Collect launch waitlist signups sorted by platform. Each platform gets its own follow-up, and people keen on early access say how soon they would use it.",
    description: "Collect signups, sort them by platform, and find your first testers.",
    blurb:
      "An email address alone gives you a number to announce and nothing to act on. This asks what someone is waiting for and which platform they are on, then follows that answer down its own path. Anyone who wants early access is asked how soon they would actually use an invite, so your first testers are the ones ready to start, and launch day begins with a list already sorted by build.",
    tags: ["waitlist form", "launch waitlist", "pre-launch signup", "early access", "product launch"],
    greeting: "Thanks for your interest. Get on the list and we'll tell you the moment we're live.",
    questions: [
      { ref: "email", type: "email", title: "What's your email?", required: true },
      { ref: "name", type: "short_text", title: "And your name?", required: false, maxLength: 80 },
      {
        ref: "role",
        type: "single_select",
        title: "What best describes you?",
        required: false,
        options: [
          { label: "Founder or exec" },
          { label: "Engineer" },
          { label: "Designer" },
          { label: "Marketer" },
          { label: "Operations" },
          { label: "Student or hobbyist" },
          { label: "Something else" },
        ],
      },
      {
        ref: "platform",
        type: "single_select",
        title: "Where would you use it first?",
        description: "We ship one platform at a time, so this decides who gets invited when.",
        required: true,
        options: [
          { label: "iPhone or iPad" },
          { label: "Android" },
          { label: "The web app" },
          { label: "A browser extension" },
        ],
      },

      // iPhone
      {
        ref: "ios_device",
        type: "short_text",
        title: "Which iPhone or iPad do you use?",
        description: "The model is enough, for example iPhone 15 or iPad Air.",
        required: false,
        maxLength: 80,
      },
      {
        ref: "ios_testflight",
        type: "yes_no",
        title: "Happy to install a test build through TestFlight?",
        required: false,
        yesLabel: "Yes, send it",
        noLabel: "I'll wait for the App Store",
      },

      // Android
      {
        ref: "android_device",
        type: "short_text",
        title: "Which Android phone do you use?",
        description: "Anything specific helps us test on the right hardware.",
        required: false,
        maxLength: 80,
      },
      {
        ref: "android_channel",
        type: "single_select",
        title: "How would you rather install it?",
        required: false,
        options: [
          { label: "Play Store beta channel" },
          { label: "A direct download" },
          { label: "Wait for the public release" },
        ],
      },

      // Web
      {
        ref: "web_browser",
        type: "single_select",
        title: "Which browser do you use most?",
        required: false,
        options: [{ label: "Chrome" }, { label: "Safari" }, { label: "Firefox" }, { label: "Edge" }, { label: "Another one" }],
      },

      // Extension
      {
        ref: "extension_browser",
        type: "single_select",
        title: "Which browser should we build the extension for first?",
        required: false,
        options: [{ label: "Chrome" }, { label: "Firefox" }, { label: "Safari" }, { label: "Edge" }],
      },

      // Everyone
      {
        ref: "hoping_for",
        type: "long_text",
        title: "What are you hoping this will solve for you?",
        required: false,
        maxLength: 600,
      },
      { ref: "current_tool", type: "short_text", title: "What do you use for that today?", required: false, maxLength: 150 },
      {
        ref: "pain",
        type: "opinion_scale",
        title: "How much of a problem is that today?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Mild annoyance",
        labelHigh: "Costs me real time",
      },
      {
        ref: "early_access",
        type: "yes_no",
        title: "Would you like early access before we launch?",
        description: "Rougher edges, and your feedback actually changes what ships.",
        required: true,
        yesLabel: "Yes, put me in",
        noLabel: "I'll wait for launch",
      },
      {
        ref: "early_access_ready",
        type: "single_select",
        title: "If an invite arrived next week, how soon would you use it?",
        description: "Early spots are limited, so we invite people who can start right away first.",
        required: false,
        options: [{ label: "The same day" }, { label: "Within a week" }, { label: "When I find the time" }],
      },
      {
        ref: "referral",
        type: "single_select",
        title: "How did you hear about us?",
        required: false,
        options: [
          { label: "A friend or colleague" },
          { label: "Social media" },
          { label: "Search" },
          { label: "A newsletter or blog" },
          { label: "Somewhere else" },
        ],
      },
      {
        ref: "consent",
        type: "legal_consent",
        title: "Keeping you posted",
        required: true,
        consentText: "Email me about the launch and early access. I can unsubscribe at any time.",
      },
    ],
    branches: [
      { when: "platform", is: "iPhone or iPad", then: "ios_device" },
      { when: "platform", is: "Android", then: "android_device" },
      { when: "platform", is: "The web app", then: "web_browser" },
      { when: "platform", is: "A browser extension", then: "extension_browser" },
      { when: "early_access", is: true, then: "early_access_ready" },
      { when: "early_access", is: false, then: "referral" },
    ],
    ending: {
      title: "You're in 🎉",
      body: "We'll email you the moment there's something to try. If you asked for early access, watch for an invite before launch day.",
    },
    guide: {
      questionsToConsider: [
        "Which platform are you shipping first? Reorder the platform options so it sits at the top.",
        "What do you want to announce on launch day: a signup count, a list of use cases, or both?",
        "How many early testers can you handle before launch, and who picks them?",
        "Do you plan to reward referrals, and if so, should the form ask who sent them?",
      ],
      howToUseResponses:
        "Count signups by platform before you plan the build order, because that answer is the demand for each one. Invite early access signups who said \"The same day\" first, and read their answer to what they hope it will solve before you send the invite. The pain score and the current tool together show who is switching from something and who has nothing today, which usually changes what your launch message should say.",
      customizeSteps: [
        "Rename the platform options to the builds you actually plan, and delete the follow-up questions for any you won't ship.",
        "Update the greeting and ending with your product name and a rough launch window if you have one.",
        "Put the link on your landing page or embed the form there, and export the list to CSV when you send invites.",
      ],
      faqs: [
        {
          q: "What should a waitlist form ask?",
          a: "An email and permission to contact them are the minimum. Asking which platform they need and what they hope it solves turns a list of addresses into a launch plan.",
        },
        {
          q: "How do I choose who gets early access from a waitlist?",
          a: "Start with people who want early access and say they would use an invite the same day. This form asks that only of people who said yes.",
        },
        {
          q: "Why ask different questions for each platform?",
          a: "An iPhone user and a Chrome user need different builds and different install steps. Each person only sees the follow-up for the platform they chose.",
        },
        {
          q: "Can I put this waitlist on my landing page?",
          a: "Yes. Share it as a link or embed it on the page, and every signup lands in your dashboard with its platform and answers.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "newsletter-signup",
    type: "form",
    category: "signup",
    goals: ["generate-leads"],
    roles: ["marketing"],
    searchName: "Newsletter signup form",
    title: "Newsletter signup",
    icon: "Mail",
    metaDescription:
      "Let subscribers choose topics and how often they hear from you. Customers, people comparing options and readers each get one follow-up of their own.",
    description: "Subscribe people to the topics they actually want, at the pace they want.",
    blurb:
      "A single list means every send is wrong for someone. Asking which topics and how often, at the moment of signing up, is the cheapest way to prevent unsubscribes. The form also asks why someone came: customers, people still deciding and readers who are here for the writing each get one follow-up of their own.",
    tags: ["newsletter signup form", "email subscription", "mailing list", "email preferences", "subscriber segmentation"],
    greeting: "Want the newsletter? Tell us what to send and how often.",
    questions: [
      { ref: "email", type: "email", title: "What's your email?", required: true },
      { ref: "first_name", type: "short_text", title: "First name, so we're not writing to a stranger?", required: false, maxLength: 60 },
      {
        ref: "reader_type",
        type: "single_select",
        title: "What brings you here?",
        required: true,
        options: [
          { label: "I use the product" },
          { label: "I'm deciding whether to use it" },
          { label: "I'm here for the writing" },
        ],
      },

      // Customers
      {
        ref: "customer_since",
        type: "single_select",
        title: "How long have you been using it?",
        required: false,
        options: [{ label: "Less than a month" }, { label: "A few months" }, { label: "Over a year" }],
      },

      // Still deciding
      {
        ref: "evaluating_against",
        type: "short_text",
        title: "What else are you looking at?",
        description: "No wrong answer. It tells us which comparisons are worth writing.",
        required: false,
        maxLength: 150,
      },

      // Readers
      {
        ref: "writing_found_via",
        type: "short_text",
        title: "What did you read that brought you here?",
        required: false,
        maxLength: 200,
      },

      // Everyone
      {
        ref: "topics",
        type: "multi_select",
        title: "What should we send you?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Product updates" },
          { label: "How-to guides" },
          { label: "Customer stories" },
          { label: "Industry news" },
          { label: "Events and webinars" },
          { label: "Behind the scenes" },
        ],
      },
      {
        ref: "frequency",
        type: "single_select",
        title: "How often?",
        required: true,
        options: [{ label: "Weekly" }, { label: "Every two weeks" }, { label: "Monthly" }],
      },
      {
        ref: "wish_list",
        type: "long_text",
        title: "Anything you'd love us to write about?",
        required: false,
        maxLength: 400,
      },
      {
        ref: "consent",
        type: "legal_consent",
        title: "Permission to email you",
        required: true,
        consentText:
          "I agree to receive marketing emails and understand I can unsubscribe from any of them at any time.",
      },
    ],
    branches: [
      { when: "reader_type", is: "I use the product", then: "customer_since" },
      { when: "reader_type", is: "I'm deciding whether to use it", then: "evaluating_against" },
      { when: "reader_type", is: "I'm here for the writing", then: "writing_found_via" },
    ],
    ending: {
      title: "Subscribed ✉️",
      body: "Check your inbox to confirm your subscription. Your first issue will match the topics you picked.",
    },
    guide: {
      questionsToConsider: [
        "Which topics can you really keep up, issue after issue? Only offer those.",
        "Can you send different content by topic and frequency, or do you need one list for now?",
        "Do you need a double opt-in step after the form, and does the ending tell people to confirm?",
        "What would you do differently for a customer than for someone still comparing options?",
      ],
      howToUseResponses:
        "Tag each subscriber with their topics and frequency before your first send, even if you start with a single list. The \"what else are you looking at\" answers are a ready list of comparison articles to write, and the \"what brought you here\" answers show which posts actually earn subscribers. Read the wish list answers once a month when you plan the next few issues.",
      customizeSteps: [
        "Replace the topic options with the sections your newsletter really has, and set the frequencies you can honour.",
        "Adjust the consent wording to match your privacy policy and the country rules you follow.",
        "Embed the form at the end of your articles or share the link, and export subscribers to CSV to load them into your sending tool.",
      ],
      faqs: [
        {
          q: "What should a newsletter signup form include?",
          a: "An email address and clear consent to receive emails. Letting people choose topics and frequency up front is the simplest way to keep them subscribed.",
        },
        {
          q: "Should I ask for a first name on a newsletter signup?",
          a: "Make it optional. It lets you write a friendlier greeting, and people who would rather not share it can still subscribe.",
        },
        {
          q: "How do I reduce newsletter unsubscribes?",
          a: "Send people what they asked for, at the pace they asked for. This form records both, so you can respect them from the first issue.",
        },
        {
          q: "Can I add this newsletter signup to my blog?",
          a: "Yes. Embed it at the end of a post or in a page, or share it as a link, and new subscribers appear in your dashboard.",
        },
      ],
    },
  }),
];
