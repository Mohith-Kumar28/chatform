import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_CONTACT: TemplateSeed[] = [
  defineTemplate({
    slug: "business-contact-form",
    type: "form",
    category: "contact",
    goals: ["generate-leads"],
    roles: ["operations", "sales", "customer-success"],
    searchName: "Business contact form",
    title: "Business contact",
    icon: "Building2",
    metaDescription:
      "A contact form for your business website that asks why someone is getting in touch, then asks only what that kind of enquiry needs so it reaches the right person.",
    description: "One contact form for buyers, customers, partners and press, each asked only what their enquiry needs.",
    blurb:
      "Built for company websites where buyers, customers, would-be partners and journalists all use the same contact page. It asks which of those the person is first, then branches: a buyer is asked what they need, for how big a team and when, an existing customer for a reference and how urgent it is, a partner what they're proposing, and a journalist for their deadline.",
    tags: ["business contact form", "company contact form", "contact us page", "b2b contact form", "branching"],
    greeting: "Hello, and thanks for getting in touch. Pick what your message is about and we'll pass it to the team that handles it.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, who are we talking to?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "Which company or organisation are you with?", required: false, maxLength: 120 },
      {
        ref: "topic",
        type: "single_select",
        title: "What's your message about?",
        required: true,
        options: [
          { label: "Buying from us" },
          { label: "Help with something you already have" },
          { label: "A partnership or supplier offer" },
          { label: "Press or media" },
          { label: "Something else" },
        ],
      },

      // Buyers
      {
        ref: "interest",
        type: "short_text",
        title: "Which product or service are you interested in?",
        required: true,
        maxLength: 200,
      },
      {
        ref: "team_size",
        type: "dropdown",
        title: "How many people would be using it?",
        required: false,
        options: [{ label: "Just me" }, { label: "2–10" }, { label: "11–50" }, { label: "51–250" }, { label: "More than 250" }],
      },
      {
        ref: "timeline",
        type: "single_select",
        title: "When are you hoping to get started?",
        required: false,
        options: [{ label: "As soon as possible" }, { label: "In the next few months" }, { label: "Just exploring for now" }],
      },

      // Existing customers
      {
        ref: "reference",
        type: "short_text",
        title: "Do you have an order, account or ticket number?",
        description: "Leave it blank if you don't have one to hand.",
        required: false,
        maxLength: 80,
      },
      {
        ref: "urgency",
        type: "single_select",
        title: "How urgent is it?",
        required: true,
        options: [
          { label: "It's stopping us working" },
          { label: "It's getting in the way" },
          { label: "It can wait a few days" },
        ],
      },

      // Partners and suppliers
      {
        ref: "partner_type",
        type: "single_select",
        title: "What kind of partnership are you proposing?",
        required: true,
        options: [
          { label: "Reselling or referring our products" },
          { label: "Supplying us" },
          { label: "Working together on something" },
          { label: "Sponsorship or an event" },
        ],
      },
      {
        ref: "partner_site",
        type: "url",
        title: "What's your website, so we can read up before replying?",
        required: false,
      },

      // Press
      { ref: "outlet", type: "short_text", title: "Which publication or outlet are you writing for?", required: true, maxLength: 120 },
      {
        ref: "press_deadline",
        type: "date",
        title: "When is your deadline?",
        required: false,
        disablePast: true,
      },

      // Everyone
      {
        ref: "message",
        type: "long_text",
        title: "Tell us a bit more. What would you like to happen next?",
        required: true,
        maxLength: 2000,
      },
      {
        ref: "reply_by",
        type: "single_select",
        title: "How would you like us to reply?",
        required: true,
        options: [{ label: "Email is fine" }, { label: "Please give me a call" }],
      },
      { ref: "phone", type: "phone", title: "What number should we call?", required: true },
    ],
    branches: [
      { when: "topic", is: "Buying from us", then: "interest" },
      { when: "topic", is: "Help with something you already have", then: "reference" },
      { when: "topic", is: "A partnership or supplier offer", then: "partner_type" },
      { when: "topic", is: "Press or media", then: "outlet" },
      { when: "topic", is: "Something else", then: "message" },
      { when: "timeline", always: true, then: "message" },
      { when: "urgency", always: true, then: "message" },
      { when: "partner_site", always: true, then: "message" },
      { when: "reply_by", is: "Email is fine", then: "end_thanks" },
      { when: "reply_by", is: "Please give me a call", then: "phone" },
    ],
    ending: {
      title: "Thanks, your message is with us",
      body: "It's gone to the person who handles this kind of enquiry, and they'll reply the way you asked.",
    },
    guide: {
      questionsToConsider: [
        "Which kinds of message does your contact page really get, and do the topic options match them?",
        "Who on your team answers each topic, and who picks up press requests that come with a deadline?",
        "Should existing customers be sent to a support channel instead, or is this form their way in?",
        "Do you ever phone people back, or should the reply question offer email only?",
      ],
      howToUseResponses:
        "Sort new responses by topic and give each topic one owner, so a sales enquiry never sits in the support queue. Answer anything marked as stopping someone working first, then press requests in deadline order. Look at the topics every month: if one option keeps getting picked for messages that don't fit it, rename it or split it in two.",
      customizeSteps: [
        "Rewrite the topic options in your customers' words, and keep the list to five or fewer so the choice is quick.",
        "Change the follow-up under each topic to the one detail your team always has to ask for, such as a postcode, account number or product name.",
        "Embed the form on your contact page, send yourself a test message for each topic, and check it reads well on a phone.",
      ],
      faqs: [
        {
          q: "What should a business contact form include?",
          a: "A name, a company, a reply address, what the message is about and room to explain. Anything more should depend on the topic, which is why this form asks its follow-ups, such as team size or a press deadline, only of the people they apply to.",
        },
        {
          q: "Should press enquiries go through the main contact form?",
          a: "They can, as long as they are easy to spot. This form asks journalists for their outlet and deadline, so you can pick their messages out and answer them before the deadline passes.",
        },
        {
          q: "How do I send each enquiry to the right team?",
          a: "Use the topic question as your routing field. In the dashboard you can filter responses by topic, and export them to CSV if each team keeps its own list.",
        },
        {
          q: "Can I put this contact form on my website?",
          a: "Yes. Use this template to copy it into your account, edit the questions, then embed it on your contact page or link to it from a button.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "callback-form",
    type: "form",
    category: "contact",
    goals: ["generate-leads"],
    roles: ["sales", "customer-success"],
    searchName: "Callback request form",
    title: "Callback request",
    icon: "Phone",
    metaDescription:
      "Let people ask for a phone call instead of waiting on hold. Collects the number, the reason, an order reference if there is one and the day and time that suit them.",
    description: "Take callback requests with the number, the reason and a time that suits the caller.",
    blurb:
      "Everything your team needs before dialling: who to ask for, the number, what the call is about and when to ring. People calling about an existing order or a bill are asked for its reference, so the agent can pull it up first. Anyone who needs a call today skips the day picker, says when today suits them and lands on an ending that says they are first in line.",
    tags: ["callback form", "request a call back", "call me back form", "phone callback", "customer service"],
    greeting: "Rather talk it through? Leave your number and we'll call you back.",
    questions: [
      { ref: "name", type: "short_text", title: "Who should we ask for when we call?", required: true, maxLength: 80 },
      { ref: "phone", type: "phone", title: "What's the best number to reach you on?", required: true },
      {
        ref: "topic",
        type: "single_select",
        title: "What would you like to talk about?",
        required: true,
        options: [
          { label: "A new order or a quote" },
          { label: "An order I've already placed" },
          { label: "A problem or complaint" },
          { label: "Billing or payments" },
          { label: "Something else" },
        ],
      },
      {
        ref: "order_ref",
        type: "short_text",
        title: "What's the order or invoice number?",
        description: "It lets us pull up your details before we ring.",
        required: false,
        maxLength: 60,
      },
      {
        ref: "details",
        type: "long_text",
        title: "Give us a quick summary so we can prepare.",
        required: false,
        maxLength: 800,
      },
      {
        ref: "urgent",
        type: "yes_no",
        title: "Is it urgent enough that you need a call today?",
        required: true,
      },

      // Scheduled calls
      {
        ref: "call_day",
        type: "date",
        title: "Which day suits you best?",
        required: true,
        disablePast: true,
      },
      {
        ref: "call_time",
        type: "multi_select",
        title: "And which times of day work? Pick all that do.",
        required: true,
        options: [{ label: "Morning" }, { label: "Around lunchtime" }, { label: "Afternoon" }, { label: "Early evening" }],
      },
      {
        ref: "voicemail_ok",
        type: "yes_no",
        title: "If we miss you, is it okay to leave a voicemail?",
        required: true,
      },
      {
        ref: "backup_email",
        type: "email",
        title: "An email address, in case we can't get through?",
        required: false,
      },

      // Urgent calls
      {
        ref: "today_time",
        type: "single_select",
        title: "When today can we reach you?",
        required: true,
        options: [{ label: "Any time" }, { label: "This morning" }, { label: "This afternoon" }, { label: "Early evening" }],
      },
    ],
    branches: [
      { when: "topic", is: "A new order or a quote", then: "details" },
      { when: "topic", is: "An order I've already placed", then: "order_ref" },
      { when: "topic", is: "A problem or complaint", then: "details" },
      { when: "topic", is: "Billing or payments", then: "order_ref" },
      { when: "topic", is: "Something else", then: "details" },
      { when: "urgent", is: true, then: "today_time" },
      { when: "urgent", is: false, then: "call_day" },
      { when: "backup_email", always: true, then: "end_thanks" },
      { when: "today_time", always: true, then: "end_urgent" },
    ],
    ending: {
      title: "Thanks, we'll call you",
      body: "We'll ring on the day and at the time you picked, and if we can't get through, we'll email you if you left an address.",
    },
    endings: [
      {
        ref: "end_urgent",
        title: "Got it, we'll call as soon as we can",
        body: "Same-day requests are called back first, at the time you picked. Keep your phone nearby.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What hours do you actually make calls, and do the time options match them?",
        "Do your customers span time zones, so you need to ask which one they are in?",
        "Which topics need a reference number before the call is useful?",
        "Can your team really promise a same-day call, or should the urgent question offer the next working day instead?",
      ],
      howToUseResponses:
        "Work through the dashboard each morning, urgent requests first, then by the day each person picked. Note on each response whether you reached them, and if not, when you tried. Anyone you cannot reach after a couple of attempts should get an email at the backup address, so the request doesn't just go quiet.",
      customizeSteps: [
        "Rename the time windows to the hours your team is on the phones, and remove any you can't staff.",
        "Change the topic list to the reasons people really call you, and keep the reference question for the ones tied to an order or account.",
        "Put the link next to your phone number and on your help pages, so people who would otherwise wait on hold can use it instead.",
      ],
      faqs: [
        {
          q: "What is a callback request form?",
          a: "It lets someone ask you to phone them rather than calling and waiting in a queue. They leave their number, the reason and a good time, and your team calls when it suits both sides.",
        },
        {
          q: "Does a callback request book a confirmed appointment?",
          a: "No. It records a preferred day and time. If you need a fixed slot, confirm it by phone or email once you have checked your team's availability.",
        },
        {
          q: "What should a callback form ask?",
          a: "The name to ask for, the number, what the call is about and when to ring. This one also asks for an order reference when it will help, whether a voicemail is okay, and lets urgent callers ask for a call the same day.",
        },
        {
          q: "Can I use this callback form on my website?",
          a: "Yes. Use this template to copy it, change the times and topics, then embed it on your contact page or share it as a link.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "client-contact-form",
    type: "form",
    category: "contact",
    goals: [],
    roles: ["freelancers-agencies", "customer-success"],
    searchName: "Client contact form",
    title: "Client contact",
    icon: "Briefcase",
    metaDescription:
      "A contact form for existing clients that asks which project a message is about, what kind of request it is and how blocking any problem is, so nothing gets lost.",
    description: "Give clients one place to send requests, with the project and context already attached.",
    blurb:
      "Built for agencies, freelancers and service teams whose clients message them across email, chat and calls. Every message arrives tied to a project. A problem report asks how badly it is blocking the client and takes screenshots, a billing question asks for the invoice number, and clients who want a call are asked when suits them, with a number only for phone calls.",
    tags: ["client contact form", "client request form", "agency client portal", "project support", "branching"],
    greeting: "Hi. Send us anything about your project here and it'll reach the right person on the team.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name and email",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "Which company are you with?", required: true, maxLength: 120 },
      {
        ref: "project",
        type: "short_text",
        title: "Which project is this about?",
        description: "The project name or reference we use with you.",
        required: true,
        maxLength: 120,
      },
      {
        ref: "request_type",
        type: "single_select",
        title: "What kind of message is it?",
        required: true,
        options: [
          { label: "Something needs fixing" },
          { label: "A change to the work" },
          { label: "A question about progress" },
          { label: "Feedback on something we sent" },
          { label: "An invoice or billing question" },
          { label: "Something new we could help with" },
        ],
      },

      // Problems
      {
        ref: "blocking",
        type: "single_select",
        title: "How much is it holding you up?",
        required: true,
        options: [
          { label: "Work has stopped until it's fixed" },
          { label: "It's slowing us down" },
          { label: "It's minor, fix it when you can" },
        ],
      },
      {
        ref: "screenshots",
        type: "file_upload",
        title: "Screenshots or files that show the problem",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
        maxSizeMB: 10,
      },

      // Billing
      {
        ref: "invoice_number",
        type: "short_text",
        title: "Which invoice number is it about?",
        required: false,
        maxLength: 60,
      },

      // Everyone
      {
        ref: "message",
        type: "long_text",
        title: "Tell us the details. The more specific, the faster we can act on it.",
        required: true,
        maxLength: 3000,
      },
      {
        ref: "needed_by",
        type: "date",
        title: "Is there a date you need this by?",
        required: false,
        disablePast: true,
      },
      {
        ref: "reply_by",
        type: "single_select",
        title: "How should we get back to you?",
        required: true,
        options: [{ label: "Email" }, { label: "A phone call" }, { label: "A video call" }],
      },
      { ref: "phone", type: "phone", title: "What number should we call?", required: true },
      {
        ref: "call_slots",
        type: "multi_select",
        title: "Which times usually suit you for a call?",
        required: false,
        options: [{ label: "Mornings" }, { label: "Afternoons" }, { label: "Late in the day" }],
      },
    ],
    branches: [
      { when: "request_type", is: "Something needs fixing", then: "blocking" },
      { when: "request_type", is: "A change to the work", then: "message" },
      { when: "request_type", is: "A question about progress", then: "message" },
      { when: "request_type", is: "Feedback on something we sent", then: "message" },
      { when: "request_type", is: "An invoice or billing question", then: "invoice_number" },
      { when: "request_type", is: "Something new we could help with", then: "message" },
      { when: "screenshots", always: true, then: "message" },
      { when: "reply_by", is: "Email", then: "end_thanks" },
      { when: "reply_by", is: "A phone call", then: "phone" },
      { when: "reply_by", is: "A video call", then: "call_slots" },
    ],
    ending: {
      title: "Thanks, we've got it",
      body: "Your message is filed under your project, and the person looking after it will pick it up.",
    },
    guide: {
      questionsToConsider: [
        "Will you send each client a link with the project already filled in, or let them type it?",
        "Which request types go to which person on your team?",
        "Do changes to the work need a separate approval step before anyone starts on them?",
        "How quickly do you reply when work has stopped, and does the ending tell clients that?",
      ],
      howToUseResponses:
        "Read anything marked as stopping work first and reply the same day. File every message under its project, so the history of a client's requests lives in one place instead of across inboxes. Changes to the work are worth tracking on their own: when one project collects a lot of them, it is time to talk about scope before the next invoice.",
      customizeSteps: [
        "Swap the request types for the ones your clients actually send, such as content updates, bug reports or new work.",
        "Replace the project question with a dropdown of live projects if you have only a few, or prefill it from the link you send each client.",
        "Share the link in your onboarding email and your email signature, so clients know where to send requests from day one.",
      ],
      faqs: [
        {
          q: "How is a client contact form different from a general contact form?",
          a: "It is for people you already work with, so it asks which project a message is about. That lets whoever picks it up find the context without searching old threads.",
        },
        {
          q: "Should clients use a form instead of emailing me?",
          a: "For requests, yes. A form makes sure each one arrives with the project, the type of request and a deadline, which a quick email usually leaves out. Keep email for conversation.",
        },
        {
          q: "Can clients attach files?",
          a: "Yes. Clients reporting a problem are asked for screenshots or files, and you can add an upload question to any other branch.",
        },
        {
          q: "Can I change the questions?",
          a: "Yes. Using this template copies it into your account, where you can edit every question and branch before sharing the link with clients.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "sales-inquiry-form",
    type: "form",
    category: "contact",
    goals: ["generate-leads"],
    roles: ["sales", "marketing"],
    searchName: "Sales inquiry form",
    title: "Sales inquiry",
    icon: "Handshake",
    metaDescription:
      "Find out what a buyer wants, how much, by when and who decides. Buyers ready this month are asked for a number to call; everyone else gets a reply by email.",
    description: "Learn what a buyer needs and how soon, and fast-track the ones ready to buy now.",
    blurb:
      "Asks the things a salesperson needs before replying: what the buyer is after, rough quantity, budget position and timing. Anyone who wants to start this month is asked for a phone number and a good time, and lands on an ending that promises a call. Everyone else is asked who makes the decision.",
    tags: ["sales inquiry form", "sales enquiry form", "product inquiry", "request for information", "lead qualification"],
    greeting: "Thanks for your interest. A few questions and we'll come back with something useful, not a brochure.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should we reply to?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "Which company are you buying for?", required: false, maxLength: 120 },
      {
        ref: "interest",
        type: "single_select",
        title: "What are you looking for?",
        required: true,
        options: [
          { label: "One of our standard products" },
          { label: "A bulk or wholesale order" },
          { label: "An ongoing supply arrangement" },
          { label: "Something custom-made" },
          { label: "Not sure yet, I'd like advice" },
        ],
      },
      {
        ref: "needs",
        type: "long_text",
        title: "Describe what you need. Sizes, specs or the problem you're solving all help.",
        required: true,
        maxLength: 2000,
      },
      {
        ref: "quantity",
        type: "number",
        title: "Roughly what quantity are you thinking of?",
        description: "Units, seats or hours. A ballpark is fine.",
        required: false,
        min: 0,
      },
      {
        ref: "budget",
        type: "single_select",
        title: "Where are you with budget?",
        required: false,
        options: [
          { label: "We have a set budget" },
          { label: "We have a rough figure in mind" },
          { label: "We need a price before we can decide" },
        ],
      },
      {
        ref: "timeline",
        type: "single_select",
        title: "When do you want to get started?",
        required: true,
        options: [
          { label: "This month" },
          { label: "In 1–3 months" },
          { label: "Later this year" },
          { label: "Just researching for now" },
        ],
      },

      // Ready now
      { ref: "phone", type: "phone", title: "What's the best number for a quick call?", required: true },
      {
        ref: "call_time",
        type: "single_select",
        title: "When's a good time to ring?",
        required: false,
        options: [{ label: "Morning" }, { label: "Afternoon" }, { label: "Any time" }],
      },

      // Everyone else
      {
        ref: "decision",
        type: "single_select",
        title: "Who makes the final decision?",
        required: false,
        options: [{ label: "I do" }, { label: "Me and others together" }, { label: "Someone else, I'm gathering options" }],
      },
      {
        ref: "heard_from",
        type: "dropdown",
        title: "How did you hear about us?",
        required: false,
        options: [
          { label: "Search engine" },
          { label: "Recommendation" },
          { label: "Social media" },
          { label: "Event or trade show" },
          { label: "An existing customer" },
          { label: "Other" },
        ],
      },
    ],
    branches: [
      { when: "timeline", is: "This month", then: "phone" },
      { when: "timeline", is: "In 1–3 months", then: "decision" },
      { when: "timeline", is: "Later this year", then: "decision" },
      { when: "timeline", is: "Just researching for now", then: "decision" },
      { when: "call_time", always: true, then: "end_call" },
    ],
    ending: {
      title: "Thanks, we'll be in touch by email",
      body: "Someone who knows the product will reply with answers to what you asked, not a generic pitch.",
    },
    endings: [
      {
        ref: "end_call",
        title: "Great, we'll call you 📞",
        body: "Since you want to start soon, a member of the sales team will ring you at the time you picked.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What do you sell by: units, seats, hours or projects? Reword the quantity question to match.",
        "Which timeline counts as ready to buy for your sales cycle?",
        "Do you need budget figures, or is knowing whether a budget exists enough?",
        "Who calls the fast-track leads, and how quickly can they do it?",
      ],
      howToUseResponses:
        "Call everyone who reached the call ending first, while the need is fresh. For the rest, answer the specific question in their description before adding anything else, and use the decision question to judge whether to offer material they can pass on. Check the source dropdown every month to see which channels bring enquiries that turn into sales.",
      customizeSteps: [
        "Replace the options in the first choice question with your real product lines or services.",
        "Adjust the timeline options to your sales cycle, and move the fast-track branch to whichever option means ready to buy.",
        "Embed the form on your pricing and product pages, where buyers already have a question in mind.",
      ],
      faqs: [
        {
          q: "What should a sales inquiry form ask?",
          a: "What the buyer wants, roughly how much, their budget position, when they need it and how to reach them. Asking who makes the decision helps you pitch the reply at the right level.",
        },
        {
          q: "How is a sales inquiry form different from a lead capture form?",
          a: "A lead form starts a relationship with basic contact details. A sales inquiry has a specific buying question behind it, so it collects enough detail for a real answer.",
        },
        {
          q: "Should I ask for budget on a sales inquiry form?",
          a: "Asking for an exact figure puts some buyers off. Asking where they are with budget, as this form does, tells you whether to send a price or start a conversation.",
        },
        {
          q: "Can I send hot leads somewhere different?",
          a: "Yes. This form already sends buyers who want to start this month to their own ending and asks for a phone number. You can change which answer triggers it in the builder.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "complaint-form",
    type: "form",
    category: "contact",
    goals: ["collect-feedback"],
    roles: ["customer-success", "operations"],
    searchName: "Complaint form",
    title: "Complaint form",
    icon: "Flag",
    metaDescription:
      "Let people report what went wrong, when, how it affected them and what would put it right. Safety concerns get their own follow-up, and past contact is recorded.",
    description: "Record what happened, its impact and the outcome the person wants, in their own words.",
    blurb:
      "A complaint form that takes the person seriously. It records what happened and when, how serious it was and what they want done. A safety concern gets its own follow-up, anyone who has complained before is asked who they spoke to, and someone who only wants it on record gets an ending that says it has been.",
    tags: ["complaint form", "formal complaint", "report a problem", "grievance form", "complaints procedure"],
    greeting: "We're sorry something went wrong. Tell us what happened and we'll look into it properly.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name and email, so we can reply",
        description: "We use these only to respond to your complaint.",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "about",
        type: "single_select",
        title: "What is your complaint about?",
        required: true,
        options: [
          { label: "A product" },
          { label: "A service or appointment" },
          { label: "How a member of staff treated me" },
          { label: "A delivery" },
          { label: "A charge or bill" },
          { label: "Something else" },
        ],
      },
      {
        ref: "happened_on",
        type: "date",
        title: "When did it happen?",
        description: "If you're not sure of the exact day, your best guess is fine.",
        required: true,
      },
      {
        ref: "reference",
        type: "short_text",
        title: "Any order, booking or account number we should look up?",
        required: false,
        maxLength: 80,
      },
      {
        ref: "what_happened",
        type: "long_text",
        title: "What happened? Include names, places and times if you have them.",
        required: true,
        maxLength: 4000,
      },
      {
        ref: "seriousness",
        type: "single_select",
        title: "How serious was it?",
        required: true,
        options: [
          { label: "Someone's health or safety was put at risk" },
          { label: "It cost me money or a lot of time" },
          { label: "It was upsetting or unfair" },
          { label: "It was frustrating but minor" },
        ],
      },

      // Safety concerns
      {
        ref: "safety_detail",
        type: "long_text",
        title: "Is anyone still at risk? Tell us what we need to know to act on it now.",
        required: true,
        maxLength: 2000,
      },

      // Everyone
      {
        ref: "evidence",
        type: "file_upload",
        title: "Photos, receipts or emails that support your complaint",
        description: "Optional. If you don't have any, your account of it is enough.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
        maxSizeMB: 10,
      },
      {
        ref: "raised_before",
        type: "yes_no",
        title: "Have you already raised this with us?",
        required: true,
      },
      {
        ref: "previous_contact",
        type: "long_text",
        title: "Who did you speak to, and what were you told?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "resolution",
        type: "single_select",
        title: "What would you like us to do?",
        required: true,
        options: [
          { label: "Refund me" },
          { label: "Repair or replace it" },
          { label: "Apologise" },
          { label: "Change things so it doesn't happen again" },
          { label: "Nothing, I want it on record" },
        ],
      },
      {
        ref: "resolution_detail",
        type: "long_text",
        title: "Anything else we should know about what would put this right?",
        required: false,
        maxLength: 1000,
      },
    ],
    branches: [
      { when: "seriousness", is: "Someone's health or safety was put at risk", then: "safety_detail" },
      { when: "seriousness", is: "It cost me money or a lot of time", then: "evidence" },
      { when: "seriousness", is: "It was upsetting or unfair", then: "evidence" },
      { when: "seriousness", is: "It was frustrating but minor", then: "evidence" },
      { when: "raised_before", is: true, then: "previous_contact" },
      { when: "raised_before", is: false, then: "resolution" },
      { when: "resolution", is: "Refund me", then: "resolution_detail" },
      { when: "resolution", is: "Repair or replace it", then: "resolution_detail" },
      { when: "resolution", is: "Apologise", then: "resolution_detail" },
      { when: "resolution", is: "Change things so it doesn't happen again", then: "resolution_detail" },
      { when: "resolution", is: "Nothing, I want it on record", then: "end_record" },
    ],
    ending: {
      title: "Thank you for telling us",
      body: "Your complaint has been logged. Someone responsible for this area will look into it and reply by email.",
    },
    endings: [
      {
        ref: "end_record",
        title: "It's on record",
        body: "Thank you. Your complaint has been logged and will be reviewed, even though you haven't asked for anything back.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What does your complaints process promise, and does the ending describe the next step accurately?",
        "Which complaint topics go to which team or manager?",
        "Who is told straight away when someone reports a safety risk?",
        "Do you need to keep complaints for a set period, and who can see them?",
      ],
      howToUseResponses:
        "Read safety reports as they arrive and act on them first. For everything else, acknowledge each complaint, give it one owner and keep the person's account separate from your findings. Look at the requested outcomes next to the topics every quarter: a run of refund requests about deliveries points to a different fix than a run of apologies about staff.",
      customizeSteps: [
        "Edit the topic options so each one maps to a team that can investigate it.",
        "Rewrite both endings to state your real next step, such as when to expect a first reply, without promising a timeline you can't keep.",
        "Link the form from your contact page, receipts and help pages, and say plainly that complaints are welcome.",
      ],
      faqs: [
        {
          q: "What should a complaint form include?",
          a: "Contact details, what happened and when, any reference number, how it affected the person and what they want done. A place for evidence helps, but it should be optional.",
        },
        {
          q: "Should a complaint form require evidence?",
          a: "No. Ask for it, but let people complain without it. Many people have no receipt or photo, and their account is still worth investigating.",
        },
        {
          q: "How should I respond to a complaint?",
          a: "Acknowledge it quickly, tell the person who is looking into it and give them a realistic time for a full answer. Then reply to the outcome they asked for, even if the answer is no.",
        },
        {
          q: "Can people complain anonymously with this form?",
          a: "As written it asks for a name and email so you can reply. You can make those questions optional if you want to accept anonymous reports, but you won't be able to follow up.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-contact-form",
    type: "form",
    category: "contact",
    goals: [],
    roles: ["customer-success"],
    searchName: "Customer contact form",
    title: "Customer contact",
    icon: "MessageCircle",
    metaDescription:
      "A contact form for shop and service customers. Order questions ask for the order number and photos, product questions ask which one, and a phone number is optional.",
    description: "Let customers ask a question and include the order or product it's about.",
    blurb:
      "Customers rarely know what your team needs from them, so this form asks for them. A question about an order asks for the order number and lets them add photos. A question before buying asks which product it is. A phone number is only requested from customers who want a call.",
    tags: ["customer contact form", "contact us form", "customer enquiry form", "order question", "customer support"],
    greeting: "Hi! What can we help you with today?",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name and email",
        required: true,
        fields: ["first_name", "email"],
      },
      {
        ref: "topic",
        type: "single_select",
        title: "What's your question about?",
        required: true,
        options: [
          { label: "An order I've placed" },
          { label: "A return or refund" },
          { label: "A product, before I buy" },
          { label: "My account" },
          { label: "Feedback or an idea" },
          { label: "Something else" },
        ],
      },

      // Orders and returns
      {
        ref: "order_number",
        type: "short_text",
        title: "What's your order number?",
        description: "You'll find it in your confirmation email.",
        required: false,
        maxLength: 60,
      },
      {
        ref: "photos",
        type: "file_upload",
        title: "If something's wrong with an item, a photo helps",
        required: false,
        accept: ["image/*"],
        maxFiles: 4,
        maxSizeMB: 10,
      },

      // Before buying
      {
        ref: "product",
        type: "short_text",
        title: "Which product are you asking about?",
        required: true,
        maxLength: 150,
      },

      // Everyone
      {
        ref: "message",
        type: "long_text",
        title: "Tell us what's going on, with as much detail as helps.",
        required: true,
        maxLength: 2000,
      },
      {
        ref: "reply_by",
        type: "single_select",
        title: "How should we reply?",
        required: true,
        options: [{ label: "By email" }, { label: "Call me" }],
      },
      { ref: "phone", type: "phone", title: "What number should we call?", required: true },
    ],
    branches: [
      { when: "topic", is: "An order I've placed", then: "order_number" },
      { when: "topic", is: "A return or refund", then: "order_number" },
      { when: "topic", is: "A product, before I buy", then: "product" },
      { when: "topic", is: "My account", then: "message" },
      { when: "topic", is: "Feedback or an idea", then: "message" },
      { when: "topic", is: "Something else", then: "message" },
      { when: "photos", always: true, then: "message" },
      { when: "reply_by", is: "By email", then: "end_thanks" },
      { when: "reply_by", is: "Call me", then: "phone" },
    ],
    ending: {
      title: "Thanks, we've got your message",
      body: "We'll reply as soon as we can. There's no need to send it twice.",
    },
    guide: {
      questionsToConsider: [
        "Do most messages you get concern orders? If so, would a separate returns form serve customers better?",
        "Where does a customer find their order number, and does the hint under that question say so?",
        "Do you have answers to common questions you could link to in the greeting?",
        "Can your team take calls, or should replies be by email only?",
      ],
      howToUseResponses:
        "Filter the dashboard by topic each day so order and return questions go to whoever can look up orders. Reply to the question in the message first, then add anything else. When the same question keeps coming in, answer it on your website and link to that page from the greeting.",
      customizeSteps: [
        "Change the topic list to match the questions your inbox really gets, keeping the order and return options if you sell online.",
        "Edit the order number hint to say exactly where your customers can find it.",
        "Embed the form on your contact page and link it from order confirmation emails.",
      ],
      faqs: [
        {
          q: "What should a customer contact form include?",
          a: "A name, a reply address, what the message is about and space for the question. For an online shop, add an order number field so your team doesn't have to ask for it.",
        },
        {
          q: "How do I cut down on back-and-forth emails with customers?",
          a: "Ask for the details you always end up chasing in the form itself. Here, order and return questions ask for the order number and photos up front, so the first reply can be an answer rather than a request for more information.",
        },
        {
          q: "Can customers send photos of a damaged item?",
          a: "Yes. Customers asking about an order or return can upload photos, which saves a round of emails before you can help.",
        },
        {
          q: "Can I embed this contact form on my website?",
          a: "Yes. Use this template to copy it into your account, edit the questions, then embed it on any page or share it as a link.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "customer-profile-form",
    type: "form",
    category: "contact",
    goals: ["onboard-clients", "conduct-research"],
    roles: ["customer-success", "sales", "marketing"],
    searchName: "Customer profile form",
    title: "Customer profile",
    icon: "UserCheck",
    metaDescription:
      "Build a useful record of each customer: what they want from you, what matters most, how they like to be contacted and whether they're happy to hear about offers.",
    description: "Learn who a customer is, what they want from you and how they like to be contacted.",
    blurb:
      "A profile that goes further than name and address. Customers rank what matters most to them, say what they want help with and choose how you may contact them, with marketing consent asked separately and clearly. Business customers get a few extra questions about their company.",
    tags: ["customer profile form", "customer information form", "customer onboarding", "customer preferences", "marketing consent"],
    greeting: "Welcome! A few questions so we can look after you properly.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your contact details",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "customer_type",
        type: "single_select",
        title: "Are you buying for yourself or for a business?",
        required: true,
        options: [{ label: "For myself" }, { label: "For a business" }],
      },

      // Business customers
      { ref: "company", type: "short_text", title: "What's the business called?", required: true, maxLength: 120 },
      { ref: "job_title", type: "short_text", title: "And what's your role there?", required: false, maxLength: 80 },
      {
        ref: "company_size",
        type: "dropdown",
        title: "How many people work there?",
        required: false,
        options: [{ label: "Just me" }, { label: "2–10" }, { label: "11–50" }, { label: "51–250" }, { label: "More than 250" }],
      },

      // Everyone
      {
        ref: "goals",
        type: "multi_select",
        title: "What are you hoping we can help with?",
        required: true,
        allowOther: true,
        options: [
          { label: "Finding the right product" },
          { label: "Regular orders I don't have to think about" },
          { label: "Advice from someone who knows the area" },
          { label: "Help setting things up" },
          { label: "Getting a better price" },
        ],
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Rank what matters most to you when you choose who to buy from.",
        required: false,
        items: ["Price", "Quality", "Speed of delivery", "Friendly service", "Sustainability"],
      },
      {
        ref: "frequency",
        type: "single_select",
        title: "How often do you expect to buy from us?",
        required: false,
        options: [
          { label: "Weekly" },
          { label: "Monthly" },
          { label: "A few times a year" },
          { label: "Just this once for now" },
        ],
      },
      {
        ref: "channels",
        type: "multi_select",
        title: "How do you prefer we contact you?",
        required: true,
        options: [{ label: "Email" }, { label: "Phone call" }, { label: "Text message" }],
      },
      {
        ref: "birthday",
        type: "date",
        title: "When's your birthday? Only if you'd like us to mark it.",
        required: false,
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Anything else we should know, such as access needs or preferences?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "marketing_consent",
        type: "legal_consent",
        title: "Would you like to hear about offers and news?",
        required: true,
        consentText:
          "I agree to receive occasional offers and news by the contact methods I chose above. I can unsubscribe at any time.",
        allowDecline: true,
        agreeLabel: "Yes, keep me posted",
        declineLabel: "No thanks",
      },
    ],
    branches: [
      { when: "customer_type", is: "For myself", then: "goals" },
      { when: "customer_type", is: "For a business", then: "company" },
    ],
    ending: {
      title: "Thanks, your profile is set up",
      body: "We'll use this to make sure what you hear from us is actually relevant to you.",
    },
    guide: {
      questionsToConsider: [
        "Which answers will actually change how you serve a customer? Drop any you won't use.",
        "Do you sell to both individuals and businesses, or can you remove the business branch?",
        "Which contact channels can your team really use?",
        "Does your marketing consent wording match your privacy policy and local rules?",
      ],
      howToUseResponses:
        "Add each profile to your customer records and read the ranking before your first proper conversation: a customer who ranks price first needs a different pitch from one who ranks service first. Only send marketing to people who agreed, by the channels they picked. Export the answers to CSV now and then to see which goals and priorities are most common across your customers.",
      customizeSteps: [
        "Rewrite the goal options around what your business offers, and trim the ranking to the factors you compete on.",
        "Check the consent wording with whoever looks after privacy, and make sure it names how you will contact people.",
        "Send the link in your welcome email after a first purchase or signup, while customers are still interested in telling you about themselves.",
      ],
      faqs: [
        {
          q: "What is a customer profile form?",
          a: "A form that records who a customer is, what they need and how they like to be contacted. It gives your team context for service and sales conversations.",
        },
        {
          q: "What should a customer profile include?",
          a: "Contact details, whether they buy personally or for a business, what they want from you, what matters most when they choose, and their contact preferences. Ask only what you will use.",
        },
        {
          q: "Do I need consent to send customers marketing?",
          a: "In many places, yes. This form asks for it as a separate question that people can decline, so the rest of their profile is still saved if they say no.",
        },
        {
          q: "Can I edit this customer profile form?",
          a: "Yes. Use this template to copy it, change any question, and share it by link or embed it on your site.",
        },
      ],
    },
  }),
];
