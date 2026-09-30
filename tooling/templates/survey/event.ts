import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_EVENT: TemplateSeed[] = [
  defineTemplate({
    slug: "pre-event-survey",
    type: "survey",
    category: "event",
    goals: ["run-events", "conduct-research"],
    roles: ["operations", "marketing"],
    searchName: "Pre-event survey",
    title: "Pre-event survey",
    icon: "CalendarCheck",
    metaDescription:
      "Ask registered attendees what they hope to get out of the event, which sessions they want, and what they need to take part, from dietary to access needs.",
    description: "Find out what registered attendees want and need before the doors open.",
    blurb:
      "Sent after registration, it asks what people want to learn, which sessions they care about and how much they already know, so speakers can pitch their talks at the right level. Only people who say they have access needs are asked for the details, and first-timers get one extra question about what would help them settle in.",
    tags: ["pre-event survey", "attendee survey", "conference planning", "session interest", "accessibility needs"],
    greeting:
      "You're registered, thank you! A few quick questions now help us shape the day around the people actually coming.",
    questions: [
      {
        ref: "name",
        type: "short_text",
        title: "What's your name?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "attending_parts",
        type: "multi_select",
        title: "Which parts of the event are you planning to attend?",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Welcome evening" },
          { label: "Day 1 talks" },
          { label: "Day 2 workshops" },
          { label: "Closing social" },
        ],
      },
      {
        ref: "hoping_for",
        type: "multi_select",
        title: "What are you hoping to get out of it?",
        required: true,
        minSelections: 1,
        maxSelections: 3,
        allowOther: true,
        options: [
          { label: "Learn new skills" },
          { label: "Meet people in my field" },
          { label: "Find partners or suppliers" },
          { label: "Hear where the industry is heading" },
          { label: "Get answers to a specific problem" },
        ],
      },
      {
        ref: "experience_level",
        type: "single_select",
        title: "How familiar are you with the event's main topic?",
        required: true,
        options: [
          { label: "New to it" },
          { label: "Some hands-on experience" },
          { label: "I work with it every day" },
          { label: "I could teach it" },
        ],
      },
      {
        ref: "session_interest",
        type: "ranking",
        title: "Rank these session tracks by how much you want to attend them",
        required: false,
        items: ["Keynotes", "Case studies", "Hands-on workshops", "Panel discussions", "Small-group roundtables"],
      },
      {
        ref: "question_for_speakers",
        type: "long_text",
        title: "Is there a question you'd love a speaker to answer?",
        description: "We pass these on so talks can cover what people are actually wondering about.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "first_time",
        type: "yes_no",
        title: "Is this your first time at one of our events?",
        required: true,
      },

      // First-timers
      {
        ref: "settle_in",
        type: "multi_select",
        title: "What would help you feel at home on the day?",
        required: false,
        minSelections: 0,
        maxSelections: 4,
        options: [
          { label: "A short orientation before it starts" },
          { label: "An introduction to a few other attendees" },
          { label: "A clear schedule in advance" },
          { label: "Nothing special, I'll find my way" },
        ],
      },

      // Everyone
      {
        ref: "dietary",
        type: "multi_select",
        title: "Any dietary requirements we should plan for?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        allowOther: true,
        options: [
          { label: "None" },
          { label: "Vegetarian" },
          { label: "Vegan" },
          { label: "Gluten-free" },
          { label: "Halal" },
          { label: "Nut allergy" },
        ],
      },
      {
        ref: "access_needs",
        type: "yes_no",
        title: "Do you have any access needs we should arrange with the venue?",
        required: true,
      },
      {
        ref: "access_details",
        type: "long_text",
        title: "Tell us what you need and we'll set it up before you arrive",
        description: "For example step-free access, a hearing loop, reserved seating or a quiet room.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "email",
        type: "email",
        title: "Which email should we send joining details to?",
        required: true,
      },
    ],
    branches: [
      { when: "first_time", is: true, then: "settle_in" },
      { when: "first_time", is: false, then: "dietary" },
      { when: "access_needs", is: false, then: "email" },
    ],
    ending: {
      title: "See you there 🎟️",
      body: "Joining details and the full schedule will reach your inbox before the event.",
    },
    guide: {
      questionsToConsider: [
        "Which decisions can you still change based on the answers, such as session rooms, catering numbers or workshop levels?",
        "Do speakers want to see the attendee questions ahead of time, and who will pass them on?",
        "Which sessions or add-ons need a headcount, and should that question be required?",
        "Who on your team owns access requests, and how quickly can they confirm each one?",
      ],
      howToUseResponses:
        "Share the experience levels and speaker questions with each speaker a week or two out, so they can pitch talks at the right depth. Send the dietary and attendance counts to the caterer and venue, and assign every access request to one person who confirms it directly with the attendee. Use the session ranking to decide which tracks get the bigger rooms.",
      customizeSteps: [
        "Replace the event parts and session tracks with your real schedule.",
        "Edit the dietary options to match what your caterer can actually provide.",
        "Send the link in the registration confirmation email or a week before the event, early enough to act on the answers.",
      ],
      faqs: [
        {
          q: "What should a pre-event survey ask?",
          a: "Ask which parts of the event people will attend, what they hope to get out of it, how experienced they are, and any dietary or access needs. Keep it short, because they have already filled in a registration form.",
        },
        {
          q: "When should I send a pre-event survey?",
          a: "Send it soon after registration or two to three weeks before the event. That leaves time to brief speakers, confirm catering numbers and arrange access needs.",
        },
        {
          q: "Should access needs be collected in a survey?",
          a: "A survey is a good way to hear about them, but always confirm each request directly with the person. This template only asks for details from people who say they have a need.",
        },
        {
          q: "Can I combine a pre-event survey with registration?",
          a: "You can, but a separate short survey after registration keeps sign-up quick. Use this template to copy it, edit the questions, and share it by link or embed it on your event page.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "event-evaluation-survey",
    type: "survey",
    category: "event",
    goals: ["run-events", "collect-feedback"],
    roles: ["operations", "marketing"],
    searchName: "Event evaluation survey",
    title: "Event evaluation",
    icon: "ClipboardCheck",
    metaDescription:
      "Evaluate an event against why people came: goals met, program, organisation and value. Sponsors and exhibitors get their own questions about leads and traffic.",
    description: "Judge an event by whether it did its job for each group who came.",
    blurb:
      "Starts by asking why each person came and whether the event delivered it, so the scores you read later have a reason attached. Sponsors and exhibitors are routed to questions about booth traffic and lead quality, and anyone whose goal wasn't met is asked what got in the way before rating the program and organisation.",
    tags: ["event evaluation survey", "post-event survey", "conference evaluation", "sponsor feedback", "event ROI"],
    greeting: "Thanks for being part of the event. We'd like an honest look back to plan the next one well.",
    questions: [
      {
        ref: "role",
        type: "single_select",
        title: "How were you involved?",
        required: true,
        options: [
          { label: "Attendee" },
          { label: "Speaker" },
          { label: "Sponsor or exhibitor" },
          { label: "Volunteer" },
        ],
      },

      // Sponsors and exhibitors
      {
        ref: "booth_traffic",
        type: "rating",
        title: "How was the flow of visitors to your stand or sessions?",
        required: true,
        scale: 5,
        shape: "number",
      },
      {
        ref: "lead_quality",
        type: "single_select",
        title: "How many of the people you met were the kind you came to meet?",
        required: true,
        options: [{ label: "Most of them" }, { label: "About half" }, { label: "A few" }, { label: "Hardly any" }],
      },
      {
        ref: "sponsor_again",
        type: "yes_no",
        title: "Would you sponsor or exhibit again?",
        required: true,
        yesLabel: "Likely",
        noLabel: "Unlikely",
      },

      // Everyone
      {
        ref: "main_goal",
        type: "single_select",
        title: "What was the main reason you took part?",
        required: true,
        allowOther: true,
        options: [
          { label: "To learn something specific" },
          { label: "To meet people" },
          { label: "To find customers or partners" },
          { label: "To represent my organisation" },
          { label: "It was part of my job" },
        ],
      },
      {
        ref: "goal_met",
        type: "single_select",
        title: "Did the event deliver on that?",
        required: true,
        options: [{ label: "Yes, fully" }, { label: "Partly" }, { label: "Not really" }],
      },

      // Goal not met
      {
        ref: "what_got_in_the_way",
        type: "long_text",
        title: "What got in the way?",
        description: "The more specific you are, the easier it is to fix for next time.",
        required: true,
        maxLength: 1000,
      },

      // Everyone
      {
        ref: "event_parts",
        type: "matrix",
        title: "How would you rate each part of the event?",
        required: true,
        rows: [
          "Quality of the sessions",
          "Relevance of the topics",
          "Schedule and pacing",
          "Venue or platform",
          "Information before the event",
          "Staff and volunteers on the day",
        ],
        columns: ["Poor", "Fair", "Good", "Excellent"],
      },
      {
        ref: "best_session",
        type: "short_text",
        title: "Which session or moment was the most useful to you?",
        required: false,
        maxLength: 200,
      },
      {
        ref: "worth_it",
        type: "opinion_scale",
        title: "Was it worth the time and cost of attending?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not worth it",
        labelHigh: "Well worth it",
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend this event to a colleague?",
        required: true,
      },
      {
        ref: "one_change",
        type: "long_text",
        title: "If you ran the next one, what would you change first?",
        required: false,
        maxLength: 800,
      },
    ],
    branches: [
      { when: "role", is: "Sponsor or exhibitor", then: "booth_traffic" },
      { when: "role", is: "Attendee", then: "main_goal" },
      { when: "role", is: "Speaker", then: "main_goal" },
      { when: "role", is: "Volunteer", then: "main_goal" },
      { when: "goal_met", is: "Not really", then: "what_got_in_the_way" },
      { when: "goal_met", is: "Partly", then: "what_got_in_the_way" },
      { when: "goal_met", is: "Yes, fully", then: "event_parts" },
    ],
    ending: {
      title: "Thank you, this goes straight into planning",
      body: "We'll share what we're changing when we announce the next event.",
    },
    guide: {
      questionsToConsider: [
        "What were the event's own goals, and which question in the survey tells you whether each one was met?",
        "Which groups took part, and do sponsors, speakers or volunteers need their own questions?",
        "Which parts of the event can you realistically change next time, and are those the rows in the rating grid?",
        "Who owns each area, such as program, venue and sponsorship, and will they each get their share of the results?",
      ],
      howToUseResponses:
        "Split the results by role first, because a speaker and a sponsor judge the same day by different things. For each goal, compare how many people said it was fully met against the reasons they gave when it wasn't, then pass the grid scores to the person who owns each area. Share the sponsor answers with your partnerships team while the next renewal conversation is still ahead of you.",
      customizeSteps: [
        "Edit the reasons for taking part to match the goals you set for the event.",
        "Rename the rows in the rating grid to the parts of your event, such as the keynote, the expo hall or the app.",
        "Send the link within a day or two of the event closing, while people still remember the details.",
      ],
      faqs: [
        {
          q: "What is the difference between an event evaluation and event feedback?",
          a: "Feedback asks how people felt. An evaluation checks the event against its goals: why people came, whether they got it, and which parts of the program and organisation explain the result.",
        },
        {
          q: "What questions should an event evaluation survey include?",
          a: "Why the person attended, whether that was met, ratings for the program and logistics, whether it was worth the time and cost, and what to change. Add separate questions for sponsors or exhibitors if you had them.",
        },
        {
          q: "When should I send an event evaluation survey?",
          a: "Within one or two days of the event. After that, people remember the overall feeling but not which session or detail caused it.",
        },
        {
          q: "Can sponsors and attendees use the same survey?",
          a: "Yes. This template asks how each person was involved and routes sponsors and exhibitors to their own questions, so one link works for everyone.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "event-questionnaire",
    type: "survey",
    category: "event",
    goals: ["run-events", "onboard-clients"],
    roles: ["operations", "freelancers-agencies", "marketing"],
    searchName: "Event questionnaire",
    title: "Event questionnaire",
    icon: "ClipboardList",
    metaDescription:
      "Gather everything needed to shape an event: purpose, audience, format, dates, guest numbers and support needed. Online events skip the venue questions.",
    description: "Collect the purpose, audience and practical needs of an event before anything is booked.",
    blurb:
      "Written for the person commissioning an event, whether that's a client, a manager or a committee, so planning starts from their goals rather than a venue. It asks what success looks like before it asks about logistics. Online events skip straight past the location and venue questions, and hybrid events are asked what remote guests should be able to do before the venue questions.",
    tags: ["event questionnaire", "event planning questionnaire", "event brief", "client intake", "event requirements"],
    greeting: "Let's pin down what this event needs to be. Answer what you know; rough guesses are fine.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who should we talk to about this event?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "organisation",
        type: "short_text",
        title: "Which organisation or team is the event for?",
        required: false,
        maxLength: 150,
      },
      {
        ref: "event_type",
        type: "dropdown",
        title: "What kind of event is it?",
        required: true,
        options: [
          { label: "Conference" },
          { label: "Workshop or training" },
          { label: "Product launch" },
          { label: "Networking event" },
          { label: "Team offsite" },
          { label: "Awards or gala" },
          { label: "Fundraiser" },
          { label: "Something else" },
        ],
      },
      {
        ref: "purpose",
        type: "long_text",
        title: "Why are you holding it, and what should be different afterwards?",
        description: "For example: 50 qualified leads, a team that knows the new strategy, or funds raised for a project.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "audience",
        type: "long_text",
        title: "Who is it for?",
        description: "Their roles, how well they know each other, and what would make them show up.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "guest_count",
        type: "number",
        title: "Roughly how many people do you expect?",
        required: true,
        min: 1,
        integerOnly: true,
      },
      {
        ref: "format",
        type: "single_select",
        title: "Will it be in person, online or both?",
        required: true,
        options: [{ label: "In person" }, { label: "Online" }, { label: "Hybrid" }, { label: "Not decided yet" }],
      },

      // Hybrid only, then on to the venue questions
      {
        ref: "remote_audience",
        type: "multi_select",
        title: "What should people joining remotely be able to do?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "Watch the main talks live" },
          { label: "Ask questions and vote in polls" },
          { label: "Join breakout sessions" },
          { label: "Watch recordings afterwards" },
          { label: "Meet the people in the room" },
        ],
      },

      // In person, hybrid and undecided
      {
        ref: "location",
        type: "short_text",
        title: "Which city or area should it be in?",
        required: false,
        maxLength: 150,
      },
      {
        ref: "venue_needs",
        type: "multi_select",
        title: "What does the venue need to have?",
        required: false,
        minSelections: 0,
        maxSelections: 8,
        allowOther: true,
        options: [
          { label: "Main room for everyone" },
          { label: "Breakout rooms" },
          { label: "Stage and AV" },
          { label: "Streaming and recording setup" },
          { label: "Space for exhibitors" },
          { label: "Step-free access" },
          { label: "Overnight accommodation nearby" },
        ],
      },

      // Online
      {
        ref: "online_setup",
        type: "multi_select",
        title: "What should the online experience include?",
        required: false,
        minSelections: 0,
        maxSelections: 6,
        options: [
          { label: "Live talks" },
          { label: "Breakout rooms" },
          { label: "Live Q&A and polls" },
          { label: "Recordings afterwards" },
          { label: "A way for attendees to meet each other" },
        ],
      },

      // Everyone
      {
        ref: "preferred_date",
        type: "date",
        title: "When would you ideally hold it?",
        required: false,
        disablePast: true,
      },
      {
        ref: "date_flexibility",
        type: "single_select",
        title: "How fixed is that date?",
        required: true,
        options: [
          { label: "Fixed, it can't move" },
          { label: "Flexible by a week or two" },
          { label: "Open, we're still deciding" },
        ],
      },
      {
        ref: "services",
        type: "multi_select",
        title: "Which parts do you need help with?",
        required: true,
        minSelections: 1,
        maxSelections: 9,
        options: [
          { label: "Finding a venue" },
          { label: "Catering" },
          { label: "Speakers or hosts" },
          { label: "Registration and ticketing" },
          { label: "Promotion" },
          { label: "Decor and signage" },
          { label: "Photography or video" },
          { label: "Travel and accommodation" },
          { label: "Running the day" },
        ],
      },
      {
        ref: "budget",
        type: "single_select",
        title: "Is there a budget set for it yet?",
        required: true,
        options: [
          { label: "Yes, it's approved" },
          { label: "Roughly, still being confirmed" },
          { label: "No, we need help working it out" },
        ],
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Anything else we should know, such as past events, must-haves or things to avoid?",
        required: false,
        maxLength: 1000,
      },
    ],
    branches: [
      { when: "format", is: "In person", then: "location" },
      { when: "format", is: "Hybrid", then: "remote_audience" },
      { when: "format", is: "Not decided yet", then: "location" },
      { when: "format", is: "Online", then: "online_setup" },
      { when: "venue_needs", always: true, then: "preferred_date" },
    ],
    ending: {
      title: "Thanks, that gives us a solid start",
      body: "We'll read this through and come back with questions and a first outline.",
    },
    guide: {
      questionsToConsider: [
        "Is this going to a client, an internal team or a committee, and does the wording fit them?",
        "Which answers do you need before you can quote or start booking, and are those questions required?",
        "Do you want to ask about budget as a range, a yes or no, or leave it for the first call?",
        "Which services do you actually offer, so the list doesn't promise something you'd have to outsource?",
      ],
      howToUseResponses:
        "Read the purpose and audience answers before anything else, and write the event's one-line goal from them; every later choice should serve it. Use the guest count, format and date flexibility to shortlist venues or platforms, and the services list to scope the work. Bring the gaps and anything vague to the first conversation rather than guessing, and keep the export as the brief everyone refers back to.",
      customizeSteps: [
        "Trim the event types and services to what you plan or deliver.",
        "Change the budget question to ask for a range if you need numbers before a first call.",
        "Share the link after an enquiry or embed it on your events page, so every request arrives in the same shape.",
      ],
      faqs: [
        {
          q: "What should an event questionnaire include?",
          a: "The event's purpose, who it is for, the expected number of guests, the format, dates and how fixed they are, the services needed and the budget status. Purpose comes first, because it decides the rest.",
        },
        {
          q: "Is an event questionnaire the same as event feedback?",
          a: "No. A questionnaire like this gathers information before the event is planned. Feedback asks people about an event they have already been to.",
        },
        {
          q: "Who should fill in an event questionnaire?",
          a: "The person who owns the event's goals, such as the client, the team lead or the committee chair. Planners use the answers as the brief.",
        },
        {
          q: "Can I use this for online events?",
          a: "Yes. Choosing online skips the location and venue questions and asks what the online experience should include instead. Hybrid events get both: what remote guests need, then the venue.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "event-planning-survey",
    type: "survey",
    category: "event",
    goals: ["run-events", "conduct-research"],
    roles: ["marketing", "operations"],
    searchName: "Event planning survey",
    title: "Event planning survey",
    icon: "CalendarDays",
    metaDescription:
      "Ask potential attendees which topics, format, timing and cost would get them to come before you book anything. Unlikely attendees are asked what stops them.",
    description: "Ask the people you want in the room what would get them there, before you book anything.",
    blurb:
      "Goes to the audience you hope to attract, not the people already signed up, and asks about topics, format, day, length and what they weigh up when deciding. Anyone who says they're unlikely to come is asked what's stopping them, and people who want first word on dates can leave an email.",
    tags: ["event planning survey", "event interest survey", "audience research", "event format", "attendee preferences"],
    greeting: "We're planning an event and want to build it around what you'd actually come to. This takes about two minutes.",
    questions: [
      {
        ref: "describes_you",
        type: "single_select",
        title: "Which best describes you?",
        required: true,
        allowOther: true,
        options: [
          { label: "Individual contributor" },
          { label: "Team lead or manager" },
          { label: "Director or executive" },
          { label: "Founder or self-employed" },
          { label: "Student" },
        ],
      },
      {
        ref: "topics",
        type: "multi_select",
        title: "Which topics would you most want covered?",
        description: "Pick up to three.",
        required: true,
        minSelections: 1,
        maxSelections: 3,
        allowOther: true,
        options: [
          { label: "Practical how-to skills" },
          { label: "Industry trends" },
          { label: "Real case studies" },
          { label: "Tools and technology" },
          { label: "Career growth" },
          { label: "Leadership" },
        ],
      },
      {
        ref: "format",
        type: "single_select",
        title: "Which format would you be most likely to attend?",
        required: true,
        options: [
          { label: "In person" },
          { label: "Online" },
          { label: "Hybrid, with the choice of either" },
          { label: "No preference" },
        ],
      },
      {
        ref: "length",
        type: "single_select",
        title: "How long should it be?",
        required: true,
        options: [
          { label: "A couple of hours" },
          { label: "Half a day" },
          { label: "A full day" },
          { label: "Two days or more" },
        ],
      },
      {
        ref: "timing",
        type: "multi_select",
        title: "When could you realistically make it?",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Weekday daytime" },
          { label: "Weekday evening" },
          { label: "Weekend" },
          { label: "Depends on the date" },
        ],
      },
      {
        ref: "decision_factors",
        type: "ranking",
        title: "Rank what matters most when you decide whether to go",
        required: true,
        items: ["The topics", "The speakers", "Date and time", "Location or travel", "Cost", "Who else is going"],
      },
      {
        ref: "likelihood",
        type: "opinion_scale",
        title: "If we ran an event along these lines, how likely would you be to come?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Very unlikely",
        labelHigh: "Very likely",
      },

      // Unlikely to come
      {
        ref: "what_stops_you",
        type: "long_text",
        title: "What would stop you from coming?",
        description: "Cost, travel, timing, the topic itself: whatever it is, it helps to know.",
        required: false,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "must_have",
        type: "long_text",
        title: "What would make this event a must-attend for you?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "keep_posted",
        type: "yes_no",
        title: "Want to hear first when the date is set?",
        required: true,
        yesLabel: "Yes, tell me",
        noLabel: "No, thanks",
      },
      {
        ref: "email",
        type: "email",
        title: "Where should we send the news?",
        required: true,
      },
    ],
    branches: [
      { when: "likelihood", op: "lte", is: 2, then: "what_stops_you" },
      { when: "likelihood", op: "gte", is: 3, then: "must_have" },
      { when: "keep_posted", is: false, then: "end_thanks" },
    ],
    ending: {
      title: "Thanks for helping us plan it",
      body: "Your answers will shape the topics, format and timing we choose.",
    },
    guide: {
      questionsToConsider: [
        "Which decision are you trying to make with this survey: topic, format, timing, or whether to run the event at all?",
        "Who do you want in the room, and are you sending the survey to them rather than to your existing regulars?",
        "Do you already know the rough cost of a ticket, and should you test it with a question?",
        "Which options would you genuinely consider, so the survey doesn't ask about formats you'd never run?",
      ],
      howToUseResponses:
        "Count the top-ranked decision factor first: if cost or travel leads, format and location matter more than the speaker list. Compare the preferred format and timing among people who said they were likely to come, since those are the answers that fill seats. Read every reason for not coming, group them, and fix the ones you can, then email everyone who asked to hear first as soon as the date is set.",
      customizeSteps: [
        "Swap the topic options for the subjects you could realistically cover.",
        "Adjust the format, length and timing choices to the ones you are actually weighing up.",
        "Share the link with your mailing list, community or social channels a few months before you plan to book a venue.",
      ],
      faqs: [
        {
          q: "What questions should an event planning survey ask?",
          a: "Ask about preferred topics, format, length, timing and what people weigh up when deciding to attend. Add a likelihood question so you can tell real interest from polite interest.",
        },
        {
          q: "When should I send an event planning survey?",
          a: "Before you book a venue or speakers, while the format and date can still change. For most events that means a few months ahead.",
        },
        {
          q: "How is an event planning survey different from a pre-event survey?",
          a: "A planning survey goes to potential attendees before the event is designed. A pre-event survey goes to people who have already registered, to prepare for them.",
        },
        {
          q: "How can I tell if people will really come?",
          a: "Ask how likely they are to attend and what would stop them. Weight the preferences of people who said they were likely to come more heavily than the rest.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "event-feedback",
    type: "survey",
    category: "event",
    goals: ["collect-feedback", "run-events"],
    roles: ["operations", "marketing"],
    searchName: "Event feedback survey",
    title: "Post-event feedback",
    icon: "MessagesSquare",
    metaDescription:
      "Rate speakers, venue, food and organisation separately. Low scores ask what let the day down; high scores ask for a highlight and whether they'd speak next time.",
    description: "Rate the parts of an event separately, and dig in where the score was low.",
    blurb:
      "A single \"how was it?\" averages a great speaker and a cold room into a middling score. The grid shows which one to fix, and anyone who rates the day three stars or fewer is asked what went wrong and whether they want someone to follow up, while people who loved it are asked for a highlight and whether they'd speak at the next one.",
    tags: ["event feedback survey", "post-event survey", "attendee feedback", "event rating", "conference feedback"],
    greeting: "Thanks for coming! A few quick questions on how it went.",
    questions: [
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each part?",
        required: true,
        rows: ["Speakers", "Venue", "Food and drink", "Networking", "Organisation", "Value for money"],
        columns: ["Poor", "Okay", "Good", "Excellent"],
      },
      { ref: "overall", type: "rating", title: "And the event as a whole?", required: true, scale: 5, shape: "star" },

      // 1 to 3 stars
      {
        ref: "what_went_wrong",
        type: "long_text",
        title: "What let it down?",
        description: "Specifics help most: a session, a moment, a practical problem.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "follow_up",
        type: "yes_no",
        title: "Would you like someone from the team to get in touch about it?",
        required: true,
        yesLabel: "Yes, please",
        noLabel: "No need",
      },
      {
        ref: "follow_up_email",
        type: "email",
        title: "Which email should we use to reach you?",
        required: true,
      },

      // 4 to 5 stars
      { ref: "highlight", type: "long_text", title: "What was the highlight for you?", required: false, maxLength: 600 },
      {
        ref: "would_speak",
        type: "yes_no",
        title: "Would you consider speaking at the next one?",
        required: false,
        yesLabel: "I'd be up for it",
        noLabel: "Not for me",
      },

      // Everyone
      {
        ref: "improve",
        type: "long_text",
        title: "What should we do differently next time?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "topics_next",
        type: "multi_select",
        title: "What would you want more of next time?",
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
      { ref: "come_again", type: "yes_no", title: "Would you come to another one?", required: true },
      {
        ref: "email",
        type: "email",
        title: "Leave your email if you'd like to hear when the next one is announced",
        required: false,
      },
    ],
    branches: [
      { when: "overall", op: "lte", is: 3, then: "what_went_wrong" },
      { when: "overall", op: "gte", is: 4, then: "highlight" },
      { when: "follow_up", is: false, then: "improve" },
      { when: "follow_up_email", always: true, then: "improve" },
      { when: "come_again", is: false, then: "end_thanks" },
    ],
    ending: { title: "Thank you 🙌", body: "Every answer is read, and it shapes what we do at the next one." },
    guide: {
      questionsToConsider: [
        "Which parts of your event deserve their own row in the grid, such as the keynote, the workshops or the app?",
        "Who follows up with an attendee who asked to be contacted, and how quickly?",
        "Are you actively looking for speakers, and who will reach out to the people who said yes?",
        "Should the final email stay optional, so people can give feedback without being identified?",
      ],
      howToUseResponses:
        "Look at the grid before the star rating: the row with the most Poor and Okay answers is the one to fix first, even if the overall score looks fine. Reply to everyone who asked for a follow-up within a couple of days, and pass the people who'd consider speaking to whoever builds the next program. Use the what-you'd-want-more-of answers alongside the written suggestions when you draft the next agenda.",
      customizeSteps: [
        "Rename the grid rows to match your event, and remove any that didn't apply, such as food at an online event.",
        "Edit the more-of options to the formats you could realistically add next time.",
        "Send the link the same day or the morning after, while the event is still fresh.",
      ],
      faqs: [
        {
          q: "What questions should an event feedback survey ask?",
          a: "Ask people to rate the main parts separately, such as speakers, venue, food, networking and organisation, then give an overall score and an open question on what to change. Separate ratings show you what to fix.",
        },
        {
          q: "When should I send an event feedback survey?",
          a: "The same day or the next morning. Response rates and detail both drop quickly once attendees are back at work.",
        },
        {
          q: "How do I handle negative event feedback?",
          a: "Thank the person, and follow up if they asked you to. This template asks unhappy attendees what went wrong and whether they want to be contacted, so you know who is waiting for a reply.",
        },
        {
          q: "Can I use this for online events?",
          a: "Yes. Use this template to copy it, then rename the grid rows to things like the platform, audio quality and chat, and share it by link or embed it on your event page.",
        },
      ],
    },
  }),
];
