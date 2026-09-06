import { defineTemplate, type TemplateSeed } from "./define.js";

export const EVENTS: TemplateSeed[] = [
  defineTemplate({
    slug: "event-rsvp",
    title: "Event RSVP",
    category: "Events",
    icon: "PartyPopper",
    description: "Collect RSVPs with plus-ones, dietary notes and travel.",
    blurb:
      "Everything the caterer and the door need, in the order a guest thinks about it — and nothing else. Someone who can't come is asked one kind question and let go in twenty seconds; someone who is coming is walked through guests, food and arrival.",
    tags: ["rsvp", "party", "guests", "branching"],
    greeting: "You're invited! 🎉 Let us know if you can make it.",
    questions: [
      { ref: "name", type: "short_text", title: "Your full name?", required: true },
      { ref: "email", type: "email", title: "Email, for the details nearer the time?", required: true },
      {
        ref: "attending",
        type: "yes_no",
        title: "Will you be joining us?",
        required: true,
        yesLabel: "Count me in",
        noLabel: "Can't make it",
      },

      // ── coming ──
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
          { label: "Other — I'll explain below" },
        ],
      },
      {
        ref: "dietary_detail",
        type: "long_text",
        title: "Tell us about that, so the kitchen gets it right",
        required: false,
        maxLength: 500,
      },
      {
        ref: "arrival",
        type: "single_select",
        title: "How are you getting here?",
        required: false,
        options: [{ label: "Driving — I'll need parking" }, { label: "Public transport" }, { label: "Taxi or lift" }, { label: "Walking" }],
      },
      {
        ref: "song",
        type: "short_text",
        title: "One song that would get you on the dance floor?",
        required: false,
      },

      // ── not coming ──
      {
        ref: "cannot_reason",
        type: "single_select",
        title: "Ah — anything we should know?",
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
      { when: "dietary", op: "not_contains", is: "Other — I'll explain below", then: "arrival" },
      { when: "song", always: true, then: "end_thanks" },
      { when: "message", always: true, then: "end_sorry" },
    ],
    endings: [
      {
        ref: "end_sorry",
        title: "We'll miss you 💛",
        body: "Thanks for letting us know — it genuinely helps with the numbers.",
      },
    ],
    ending: { title: "See you there 🥂", body: "We'll send the final details a week before." },
  }),

  defineTemplate({
    slug: "event-feedback",
    title: "Post-event feedback",
    category: "Events",
    icon: "MessagesSquare",
    description: "Rate the parts of an event separately, and dig where the score was low.",
    blurb:
      "A single “how was it?” averages a great speaker and a cold room into a seven. A grid tells you which one to fix — and anyone who rated the day three or under is asked what happened, while the people who loved it are asked whether they'd speak next time.",
    tags: ["feedback", "events", "matrix", "branching"],
    greeting: "Thanks for coming! How did we do?",
    questions: [
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each part?",
        required: true,
        rows: ["Speakers", "Venue", "Food and drink", "Networking", "Organisation", "Value for money"],
        columns: ["Poor", "Okay", "Good", "Excellent"],
      },
      { ref: "overall", type: "rating", title: "And the day as a whole?", required: true, scale: 5, shape: "star" },

      // ── 1–3 stars ──
      {
        ref: "what_went_wrong",
        type: "long_text",
        title: "What let it down?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "would_refund",
        type: "yes_no",
        title: "Would you like someone to look into your ticket?",
        required: false,
        yesLabel: "Yes please",
        noLabel: "No need",
      },

      // ── 4–5 stars ──
      { ref: "highlight", type: "long_text", title: "What was the highlight?", required: false, maxLength: 600 },
      {
        ref: "would_speak",
        type: "yes_no",
        title: "Would you consider speaking at the next one?",
        required: false,
        yesLabel: "I'd be up for it",
        noLabel: "Not for me",
      },

      // ── everyone ──
      { ref: "improve", type: "long_text", title: "What should we do differently next time?", required: false, maxLength: 800 },
      {
        ref: "topics_next",
        type: "multi_select",
        title: "What would you want covered next time?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "More technical depth" },
          { label: "More case studies" },
          { label: "More hands-on workshops" },
          { label: "More time to talk to people" },
          { label: "Shorter sessions" },
        ],
      },
      { ref: "return", type: "yes_no", title: "Would you come to another one?", required: false },
      { ref: "email", type: "email", title: "Email, if you'd like us to follow up", required: false },
    ],
    branches: [
      { when: "overall", op: "lte", is: 3, then: "what_went_wrong" },
      { when: "overall", op: "gte", is: 4, then: "highlight" },
      { when: "would_refund", always: true, then: "improve" },
    ],
    ending: { title: "Thank you 🙌", body: "This genuinely shapes the next one." },
  }),

  defineTemplate({
    slug: "speaker-submission",
    title: "Call for speakers",
    category: "Events",
    icon: "Mic",
    description: "Take talk proposals in a shape a committee can review.",
    blurb:
      "Proposals arrive as essays when what a review committee needs is a title, an abstract, a length and a bio — comparable at a glance. First-time speakers are offered a mentor; workshop proposals are asked the things only a workshop needs, like room setup and what attendees must install.",
    tags: ["cfp", "conference", "speakers", "branching"],
    greeting: "Got a talk in you? Tell us about it.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Email?", required: true },
      { ref: "pronouns", type: "short_text", title: "Pronouns, for the programme?", required: false },
      { ref: "talk_title", type: "short_text", title: "Talk title", required: true, maxLength: 120 },
      { ref: "abstract", type: "long_text", title: "Abstract — what will people learn?", required: true, maxLength: 2000 },
      {
        ref: "takeaways",
        type: "long_text",
        title: "Three things someone will be able to do afterwards",
        description: "One per line. This is the part reviewers argue about, so make it concrete.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "format",
        type: "single_select",
        title: "Preferred format",
        required: true,
        options: [
          { label: "Lightning talk (10 min)" },
          { label: "Standard talk (30 min)" },
          { label: "Workshop (90 min)" },
        ],
      },

      // ── workshop only ──
      {
        ref: "workshop_prereqs",
        type: "long_text",
        title: "What must attendees install or know beforehand?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "workshop_capacity",
        type: "number",
        title: "How many people can you handle at once?",
        required: true,
        integerOnly: true,
        min: 5,
        max: 200,
      },
      {
        ref: "workshop_room",
        type: "single_select",
        title: "What room setup do you need?",
        required: false,
        options: [{ label: "Tables in groups" }, { label: "Theatre rows" }, { label: "Horseshoe" }, { label: "Doesn't matter" }],
      },

      // ── everyone ──
      {
        ref: "level",
        type: "single_select",
        title: "Who's it for?",
        required: true,
        options: [{ label: "Beginner" }, { label: "Intermediate" }, { label: "Advanced" }],
      },
      { ref: "bio", type: "long_text", title: "A short speaker bio", required: true, maxLength: 800 },
      {
        ref: "spoken_before",
        type: "yes_no",
        title: "Have you spoken at a conference before?",
        required: true,
        yesLabel: "Yes",
        noLabel: "This would be my first",
      },
      { ref: "previous_talk", type: "url", title: "Link to a previous talk", required: false },
      {
        ref: "wants_mentor",
        type: "yes_no",
        title: "Would you like a mentor to help you prepare?",
        description: "We pair first-time speakers with someone who has done it before. It's free and it helps.",
        required: false,
        yesLabel: "Yes please",
        noLabel: "No thanks",
      },
      {
        ref: "travel_support",
        type: "yes_no",
        title: "Would you need help with travel costs?",
        description: "Asked of everyone, and it never counts against a proposal.",
        required: false,
      },
    ],
    branches: [
      { when: "format", is: "Lightning talk (10 min)", then: "level" },
      { when: "format", is: "Standard talk (30 min)", then: "level" },
      { when: "format", is: "Workshop (90 min)", then: "workshop_prereqs" },
      { when: "spoken_before", is: true, then: "previous_talk" },
      { when: "spoken_before", is: false, then: "wants_mentor" },
    ],
    ending: { title: "Submitted 🎤", body: "We review proposals in batches and reply to everyone, either way." },
  }),

  defineTemplate({
    slug: "workshop-registration",
    title: "Workshop registration",
    category: "Events",
    icon: "CalendarCheck",
    description: "Sign people up, take payment, and check they're ready for the day.",
    blurb:
      "A hands-on workshop goes badly when half the room hasn't installed anything. This asks about experience and setup so the right prep email goes to the right people — and beginners get walked through the extras while the experienced are left alone.",
    tags: ["workshop", "training", "registration", "payment"],
    greeting: "Let's get you registered — a few details and you're set.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Email?", required: true },
      { ref: "organisation", type: "short_text", title: "Which organisation, if any?", required: false },
      {
        ref: "session",
        type: "dropdown",
        title: "Which session?",
        required: true,
        options: [
          { label: "Morning — 9:00 to 12:00" },
          { label: "Afternoon — 13:00 to 16:00" },
          { label: "Evening — 18:00 to 21:00" },
        ],
      },
      {
        ref: "experience",
        type: "opinion_scale",
        title: "How comfortable are you with the topic already?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Complete beginner",
        labelHigh: "Very comfortable",
      },

      // ── beginners ──
      {
        ref: "beginner_background",
        type: "long_text",
        title: "What have you tried so far?",
        description: "So we know where to start rather than guessing.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "wants_primer",
        type: "yes_no",
        title: "Would you like the pre-reading a week early?",
        required: false,
        yesLabel: "Yes, send it",
        noLabel: "I'll be fine",
      },

      // ── everyone else ──
      {
        ref: "advanced_interest",
        type: "short_text",
        title: "Anything specific you're hoping we go deep on?",
        required: false,
      },

      // ── everyone ──
      {
        ref: "setup",
        type: "multi_select",
        title: "What will you be working on?",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [{ label: "macOS" }, { label: "Windows" }, { label: "Linux" }, { label: "I'll use a loaner machine" }],
      },
      { ref: "goal", type: "long_text", title: "What do you want to walk out being able to do?", required: false, maxLength: 600 },
      {
        ref: "accessibility",
        type: "long_text",
        title: "Anything we can do to make the day work better for you?",
        description: "Access, seating, captions, breaks, food — anything.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "ticket",
        type: "payment",
        title: "Secure your seat",
        description: "Replace this with your own checkout link before publishing.",
        required: false,
        method: "link",
        amountMode: "fixed",
        amount: 149,
        currency: "USD",
        url: "https://example.com/checkout/workshop",
      },
    ],
    branches: [
      { when: "experience", op: "lte", is: 2, then: "beginner_background" },
      { when: "experience", op: "gte", is: 3, then: "advanced_interest" },
    ],
    ending: { title: "Registered ✅", body: "Prep instructions are on their way." },
  }),
];
