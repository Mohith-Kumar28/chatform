import { defineTemplate, type TemplateSeed } from "./define.js";

export const EVENTS: TemplateSeed[] = [
  defineTemplate({
    slug: "event-rsvp",
    title: "Event RSVP",
    category: "Events",
    icon: "PartyPopper",
    description: "Collect RSVPs with plus-ones and dietary notes.",
    blurb:
      "Everything the caterer and the door need, in the order a guest thinks about it: are they coming, who with, and is there anything you need to know before they arrive.",
    tags: ["rsvp", "party", "guests"],
    greeting: "You're invited! 🎉 Let us know if you can make it.",
    questions: [
      { ref: "name", type: "short_text", title: "Your full name?", required: true },
      { ref: "attending", type: "yes_no", title: "Will you be joining us?", required: true, yesLabel: "Count me in", noLabel: "Can't make it" },
      { ref: "guests", type: "number", title: "How many guests are you bringing?", required: false, integerOnly: true, min: 0, max: 10 },
      {
        ref: "dietary",
        type: "multi_select",
        title: "Any dietary requirements?",
        required: false,
        minSelections: 0,
        maxSelections: 6,
        options: [
          { label: "None" },
          { label: "Vegetarian" },
          { label: "Vegan" },
          { label: "Gluten-free" },
          { label: "Nut allergy" },
          { label: "Other — I'll explain below" },
        ],
      },
      { ref: "notes", type: "long_text", title: "Anything else we should know?", required: false, maxLength: 600 },
    ],
    ending: { title: "See you there 🥂", body: "" },
  }),

  defineTemplate({
    slug: "event-feedback",
    title: "Post-event feedback",
    category: "Events",
    icon: "MessagesSquare",
    description: "Rate the parts of an event separately, not as one blur.",
    blurb:
      "A single “how was it?” averages a great speaker and a cold room into a seven. Rating the pieces separately in a grid tells you which one to fix, and takes a respondent no longer.",
    tags: ["feedback", "events", "matrix"],
    greeting: "Thanks for coming! How did we do?",
    questions: [
      { ref: "overall", type: "rating", title: "Overall, how was the event?", required: true, scale: 5, shape: "star" },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each part?",
        required: true,
        rows: ["Speakers", "Venue", "Food and drink", "Networking", "Organisation"],
        columns: ["Poor", "Okay", "Good", "Excellent"],
      },
      { ref: "highlight", type: "long_text", title: "What was the highlight?", required: false, maxLength: 600 },
      { ref: "improve", type: "long_text", title: "What should we do differently next time?", required: false, maxLength: 800 },
      { ref: "return", type: "yes_no", title: "Would you come to another one?", required: false },
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
      "Proposals arrive as essays when what a review committee needs is a title, an abstract, a length and a bio. Asking for them separately makes every submission comparable at a glance.",
    tags: ["cfp", "conference", "speakers"],
    greeting: "Got a talk in you? Tell us about it.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Email?", required: true },
      { ref: "talk_title", type: "short_text", title: "Talk title", required: true, maxLength: 120 },
      { ref: "abstract", type: "long_text", title: "Abstract — what will people learn?", required: true, maxLength: 2000 },
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
      {
        ref: "level",
        type: "single_select",
        title: "Who's it for?",
        required: true,
        options: [{ label: "Beginner" }, { label: "Intermediate" }, { label: "Advanced" }],
      },
      { ref: "bio", type: "long_text", title: "A short speaker bio", required: true, maxLength: 800 },
      { ref: "previous_talk", type: "url", title: "Link to a previous talk, if you have one", required: false },
    ],
    ending: { title: "Submitted 🎤", body: "We review proposals in batches and reply to everyone." },
  }),

  defineTemplate({
    slug: "workshop-registration",
    title: "Workshop registration",
    category: "Events",
    icon: "CalendarCheck",
    description: "Sign people up for a session and check they're ready for it.",
    blurb:
      "A hands-on workshop goes badly when half the room hasn't installed anything. Asking about experience level and setup beforehand lets you send the right prep email to the right people.",
    tags: ["workshop", "training", "registration"],
    greeting: "Let's get you registered — a few details and you're set.",
    questions: [
      { ref: "name", type: "short_text", title: "Your name?", required: true },
      { ref: "email", type: "email", title: "Email?", required: true },
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
        labelLow: "Complete beginner",
        labelHigh: "Very comfortable",
      },
      { ref: "goal", type: "long_text", title: "What do you want to walk out being able to do?", required: false, maxLength: 600 },
      { ref: "accessibility", type: "long_text", title: "Anything we can do to make the day work better for you?", required: false, maxLength: 600 },
    ],
    ending: { title: "Registered ✅", body: "Prep instructions are on their way." },
  }),
];
