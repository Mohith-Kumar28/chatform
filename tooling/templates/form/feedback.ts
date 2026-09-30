import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_FEEDBACK: TemplateSeed[] = [
  defineTemplate({
    slug: "client-feedback-form",
    type: "form",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["freelancers-agencies", "customer-success"],
    searchName: "Client feedback form",
    title: "Client feedback",
    icon: "MessagesSquare",
    metaDescription:
      "Ask clients how a project went: the result, the communication and what to change next time. Happy clients get a testimonial ask, unhappy ones a follow-up.",
    description: "Hear how the project really went, and route happy and unhappy clients differently.",
    blurb:
      "A short debrief to send when a project wraps. The overall score decides the next question: a client who loved the work is asked for a quote you can publish, and one who didn't is asked what went wrong and whether they want a call about it.",
    tags: ["client feedback", "project review", "agency", "testimonial", "branching"],
    greeting: "Thanks for working with us. Got two minutes to tell us how it went?",
    questions: [
      { ref: "project", type: "short_text", title: "Which project are you reviewing?", required: true, maxLength: 120 },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how happy are you with the result?",
        required: true,
        scale: 5,
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How did we do on each of these?",
        required: false,
        rows: ["Quality of the work", "Communication", "Hitting deadlines", "Value for money"],
        columns: ["Poor", "Okay", "Good", "Great"],
      },
      {
        ref: "met_goals",
        type: "single_select",
        title: "Did the project do what you hired us for?",
        required: true,
        options: [{ label: "Yes, fully" }, { label: "Mostly" }, { label: "Not really" }],
      },

      // Happy clients
      {
        ref: "best_part",
        type: "long_text",
        title: "What did we do especially well?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "quote_ok",
        type: "yes_no",
        title: "Could we quote what you just wrote on our website?",
        required: true,
      },

      // Unhappy clients
      {
        ref: "what_went_wrong",
        type: "long_text",
        title: "What fell short? The specifics help us most.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "call_back",
        type: "yes_no",
        title: "Would you like the project lead to call you about it?",
        required: true,
      },

      // Everyone
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend us to a friend or colleague?",
        required: true,
      },
      {
        ref: "next_time",
        type: "long_text",
        title: "Anything we should do differently on the next project?",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "met_goals", is: "Yes, fully", then: "best_part" },
      { when: "met_goals", is: "Mostly", then: "best_part" },
      { when: "met_goals", is: "Not really", then: "what_went_wrong" },
      { when: "quote_ok", always: true, then: "recommend" },
    ],
    ending: {
      title: "Thank you, this really helps",
      body: "We read every answer, and the project lead will see yours this week.",
    },
    guide: {
      questionsToConsider: [
        "Which parts of the project do you want rated separately, such as design, delivery or support?",
        "Do you want a testimonial from happy clients, and where will it be published?",
        "Who follows up with an unhappy client, and how fast?",
        "Should the form name the project, or will you send one link per client?",
      ],
      howToUseResponses:
        "Read the written answers next to the scores, because a 4 out of 5 with a complaint about deadlines tells you more than the number. Call back every client who asked for it within two working days. Keep the quotes you were allowed to publish in one place, and look at the grid every quarter to see which part of the work is slipping.",
      customizeSteps: [
        "Rename the rows in the rating grid to the parts of the work you actually deliver.",
        "Change the testimonial question to say where the quote will appear, so clients know what they are agreeing to.",
        "Send the link at handover, while the project is fresh, and add the project name as a hidden field if you send many.",
      ],
      faqs: [
        {
          q: "When should I send a client feedback form?",
          a: "Right after handover or a major milestone. Waiting a month means the client remembers the invoice more clearly than the work.",
        },
        {
          q: "How many questions should a client feedback form have?",
          a: "Around eight to ten. This one asks each client only the follow-ups that fit their answer, so a happy client never sees the complaint questions.",
        },
        {
          q: "Can I turn the answers into testimonials?",
          a: "Yes. The form asks permission before you quote anyone, and only clients who said the project met their goals are asked.",
        },
        {
          q: "Can I use this template for free?",
          a: "Yes. Use this template copies it into your account, where you can edit every question, then share it as a link or embed it on your site.",
        },
      ],
    },
  }),
];
