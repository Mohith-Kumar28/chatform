import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_EVENT: TemplateSeed[] = [
  defineTemplate({
    slug: "event-signup-form",
    type: "form",
    category: "event",
    goals: ["run-events", "generate-leads"],
    roles: ["marketing", "operations"],
    searchName: "Event signup form",
    title: "Event signup",
    icon: "CalendarCheck",
    metaDescription:
      "Let guests sign up for your event in a minute: contact details, in person or online, group size, access needs and the parts of the programme they care about.",
    description: "A quick signup that tells you who is coming, how, and what they want from the day.",
    blurb:
      "Asks early whether someone is coming in person or joining online, then only asks what matters for that choice: group size and access needs for the venue, a timezone for the stream. Everyone finishes by picking the parts of the programme they are most interested in, which helps you plan rooms and reminders.",
    tags: ["event signup", "event sign up sheet", "meetup signup", "attendee list", "branching"],
    greeting: "Glad you're interested! Let's get you on the list. It takes about a minute.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should we put on the list?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "mode",
        type: "single_select",
        title: "How are you planning to join?",
        required: true,
        options: [{ label: "In person" }, { label: "Online" }, { label: "Not sure yet" }],
      },

      // In person
      {
        ref: "party_size",
        type: "number",
        title: "How many people are coming, including you?",
        required: true,
        integerOnly: true,
        min: 1,
        max: 10,
      },
      {
        ref: "access_needs",
        type: "long_text",
        title: "Anything we should arrange so the venue works for your group?",
        description: "Step-free access, seating, a quiet space, dietary needs. Leave blank if nothing.",
        required: false,
        maxLength: 600,
      },

      // Online
      {
        ref: "timezone",
        type: "short_text",
        title: "Which city or timezone will you join from?",
        description: "So reminders arrive at a sensible time for you.",
        required: false,
        maxLength: 80,
      },

      // Everyone
      {
        ref: "interests",
        type: "multi_select",
        title: "Which parts of the event are you most interested in?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Talks" },
          { label: "Hands-on workshops" },
          { label: "Meeting other attendees" },
          { label: "Demos and exhibitors" },
          { label: "The social afterwards" },
        ],
      },
      {
        ref: "heard_from",
        type: "single_select",
        title: "How did you hear about it?",
        required: false,
        allowOther: true,
        options: [
          { label: "A friend or colleague" },
          { label: "Social media" },
          { label: "Email newsletter" },
          { label: "I came last time" },
        ],
      },
      {
        ref: "question",
        type: "long_text",
        title: "Anything you'd like to ask the organisers or the speakers?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "future_events",
        type: "yes_no",
        title: "Can we email you about future events like this one?",
        required: true,
        yesLabel: "Yes, keep me posted",
        noLabel: "Just this one",
      },
    ],
    branches: [
      { when: "mode", is: "In person", then: "party_size" },
      { when: "mode", is: "Online", then: "timezone" },
      { when: "mode", is: "Not sure yet", then: "interests" },
      { when: "access_needs", always: true, then: "interests" },
    ],
    ending: {
      title: "You're on the list 🎉",
      body: "We'll email you the details and a reminder before the day.",
    },
    guide: {
      questionsToConsider: [
        "Is your event in person, online or both? Remove the options and questions you don't need.",
        "Is there a cap on numbers, and should you mention it in the greeting so people sign up early?",
        "What will you actually do with the access and dietary answers, and who needs to see them?",
        "Do you need permission to email people about future events where you are?",
      ],
      howToUseResponses:
        "Add up the group sizes, not just the number of responses, to get your real headcount for the venue and catering. Pass every access note to whoever runs the venue a week before. The interests question shows which sessions will be crowded, so you can move the popular one to the bigger room. Export the list to CSV for check-in on the day, and only add people who said yes to future events to your mailing list.",
      customizeSteps: [
        "Put the event name, date and place in the greeting so nobody signs up for the wrong thing.",
        "Rename the options in the interests question to the real parts of your programme.",
        "Share the link on your event page and social posts, or embed the form on your website.",
      ],
      faqs: [
        {
          q: "What information should an event signup form collect?",
          a: "A name and email at minimum, then how many people are coming and anything you need to arrange for them. Ask more only if you will use it.",
        },
        {
          q: "What's the difference between an event signup and an event registration form?",
          a: "A signup is usually quick and free, to register interest or save a place. A registration form tends to collect more detail, such as session choices, tickets or requirements for a formal event.",
        },
        {
          q: "Can I use this for an online event?",
          a: "Yes. People who choose online are asked for their timezone instead of venue details, and you can delete the in-person questions if the event is online only.",
        },
        {
          q: "How do I send the signup form to people?",
          a: "Copy it with Use this template, edit the questions, then share the link or embed it on your event page. Responses appear in your dashboard as people sign up.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "event-rsvp",
    type: "form",
    category: "event",
    goals: ["run-events"],
    roles: ["operations", "marketing"],
    searchName: "Event RSVP form",
    title: "Event RSVP",
    icon: "PartyPopper",
    metaDescription:
      "Collect RSVPs for a party, wedding or celebration: plus-ones, guest names, dietary needs and travel. Guests who can't come are thanked and let go in seconds.",
    description: "Collect RSVPs with plus-ones, dietary notes and travel.",
    blurb:
      "Everything the caterer and the door list need, in the order a guest thinks about it, and nothing else. Someone who can't come is asked one kind question and reaches their own ending in seconds; someone who is coming is walked through guests, food and arrival. Guest names are only asked for when someone brings guests, and the kitchen follow-up only appears if a dietary need needs explaining.",
    tags: ["rsvp form", "party rsvp", "wedding rsvp", "guest list", "dietary requirements", "branching"],
    greeting: "You're invited! 🎉 Let us know if you can make it.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your full name?", required: true, maxLength: 100 },
      { ref: "email", type: "email", title: "What email should we send the details to nearer the time?", required: true },
      {
        ref: "attending",
        type: "yes_no",
        title: "Will you be joining us?",
        required: true,
        yesLabel: "Count me in",
        noLabel: "Can't make it",
      },

      // Coming
      {
        ref: "guests",
        type: "number",
        title: "How many guests are you bringing?",
        description: "Not counting yourself. Put 0 if you're coming alone.",
        required: true,
        integerOnly: true,
        min: 0,
        max: 10,
      },
      {
        ref: "guest_names",
        type: "long_text",
        title: "Who are they? One name per line.",
        description: "For the door list and the place cards.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "dietary",
        type: "multi_select",
        title: "Any dietary requirements in your party?",
        required: true,
        minSelections: 1,
        maxSelections: 7,
        options: [
          { label: "None" },
          { label: "Vegetarian" },
          { label: "Vegan" },
          { label: "Gluten-free" },
          { label: "Dairy-free" },
          { label: "Nut allergy" },
          { label: "Other (I'll explain)" },
        ],
      },
      {
        ref: "dietary_detail",
        type: "long_text",
        title: "Tell us more, so the kitchen gets it right",
        description: "Include who it's for if you're bringing guests.",
        required: false,
        maxLength: 500,
      },
      {
        ref: "arrival",
        type: "single_select",
        title: "How are you getting here?",
        required: false,
        options: [
          { label: "Driving (I'll need parking)" },
          { label: "Public transport" },
          { label: "Taxi or lift" },
          { label: "Walking" },
        ],
      },
      {
        ref: "song",
        type: "short_text",
        title: "One song that would get you on the dance floor?",
        required: false,
        maxLength: 120,
      },

      // Not coming
      {
        ref: "cannot_reason",
        type: "single_select",
        title: "Sorry to hear that. Anything we should know?",
        required: false,
        options: [
          { label: "Away that week" },
          { label: "Work" },
          { label: "Too far to travel" },
          { label: "I'd rather not say" },
        ],
      },
      {
        ref: "message",
        type: "long_text",
        title: "Want to leave a message for the hosts?",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "attending", is: true, then: "guests" },
      { when: "attending", is: false, then: "cannot_reason" },
      { when: "guests", op: "eq", is: 0, then: "dietary" },
      { when: "dietary", op: "not_contains", is: "Other (I'll explain)", then: "arrival" },
      { when: "song", always: true, then: "end_thanks" },
      { when: "message", always: true, then: "end_sorry" },
    ],
    endings: [
      {
        ref: "end_sorry",
        title: "We'll miss you 💛",
        body: "Thanks for letting us know. It genuinely helps with the numbers.",
      },
    ],
    ending: { title: "See you there 🥂", body: "We'll send the final details a week before." },
    guide: {
      questionsToConsider: [
        "Are plus-ones welcome, and is there a limit? Change the maximum on the guests question to match.",
        "Does your caterer need a dietary headcount by a certain date? Put your RSVP deadline in the greeting.",
        "Is parking limited, so you need to know who is driving?",
        "Is the song question right for your event, or would something else suit it better?",
      ],
      howToUseResponses:
        "Your headcount is every yes plus the number of guests they are bringing, so add the guests column rather than counting rows. Send the dietary answers and the explanations to the caterer as one list, with names. Use the guest names for the door list and place cards, and export everything to CSV for the seating plan. Read the messages from people who can't come; the hosts will want to see them.",
      customizeSteps: [
        "Add the date, venue and RSVP deadline to the greeting.",
        "Adjust the dietary options and the guest limit to what your caterer and venue can handle.",
        "Share the link in your invitation, by message or email, or embed it on your event or wedding site.",
      ],
      faqs: [
        {
          q: "What should an RSVP form ask?",
          a: "Whether the guest is coming, how many people they are bringing and their names, and any dietary needs. Travel or parking questions help for larger events.",
        },
        {
          q: "How do I handle plus-ones on an RSVP form?",
          a: "Ask for a number with a sensible maximum, then ask for the names. Setting the maximum to 1 limits every invitation to a single plus-one.",
        },
        {
          q: "When should RSVPs be due?",
          a: "Early enough to give your caterer and venue final numbers when they need them, often a couple of weeks before the event. Put the deadline in the greeting so guests see it first.",
        },
        {
          q: "Can I use this RSVP form for a wedding?",
          a: "Yes. Edit the greeting and endings, keep the plus-one and dietary questions, and swap the song question for anything else you want to know.",
        },
      ],
    },
  }),
];
