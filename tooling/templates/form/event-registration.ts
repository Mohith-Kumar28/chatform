import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_EVENT_REGISTRATION: TemplateSeed[] = [
  defineTemplate({
    slug: "online-event-registration-form",
    type: "form",
    category: "event-registration",
    goals: ["run-events", "generate-leads"],
    roles: ["marketing", "education", "operations"],
    searchName: "Online event registration form",
    title: "Online event registration",
    icon: "MonitorPlay",
    metaDescription:
      "Register attendees for a virtual conference, online workshop or summit: session choices, timezone, access needs and questions for the speakers in advance.",
    description: "Sign people up for the sessions they want and send the right access details to each.",
    blurb:
      "Built for an online event with several sessions: attendees pick the ones they want, so you know which rooms will fill. Anyone who chooses the hands-on workshop is asked what device they will use and how experienced they are, since that session needs more from them than watching.",
    tags: ["online event registration", "virtual event registration", "virtual conference", "online workshop", "branching"],
    greeting: "Welcome! Let's get you registered and tell you where to join.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who's registering?",
        description: "We'll send your joining links to this email.",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "organisation", type: "short_text", title: "Which organisation are you with, if any?", required: false, maxLength: 120 },
      {
        ref: "sessions",
        type: "multi_select",
        title: "Which sessions would you like to join?",
        description: "Pick as many as you like. You'll get a separate link for each.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Opening keynote" },
          { label: "Panel discussion" },
          { label: "Hands-on workshop (limited places)" },
          { label: "Breakout discussions" },
          { label: "Closing Q&A" },
        ],
      },

      // Workshop attendees
      {
        ref: "workshop_device",
        type: "single_select",
        title: "The workshop is hands-on. What will you join it from?",
        required: true,
        options: [
          { label: "A laptop or desktop" },
          { label: "A tablet" },
          { label: "A phone" },
          { label: "Not sure yet" },
        ],
      },
      {
        ref: "workshop_level",
        type: "opinion_scale",
        title: "How much do you already know about the workshop topic?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Starting from scratch",
        labelHigh: "I use it every day",
      },

      // Everyone
      {
        ref: "timezone",
        type: "short_text",
        title: "Which city or timezone will you join from?",
        description: "So your reminders arrive at a sensible hour.",
        required: true,
        maxLength: 80,
      },
      {
        ref: "access",
        type: "multi_select",
        title: "Would any of these help you take part?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "Live captions" },
          { label: "A transcript afterwards" },
          { label: "Sign language interpretation" },
          { label: "The recording, to watch later" },
        ],
      },
      {
        ref: "speaker_question",
        type: "long_text",
        title: "Is there anything you'd like the speakers to cover?",
        description: "Say which session it's for. We pass these to each speaker before the day.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "heard_from",
        type: "dropdown",
        title: "How did you hear about the event?",
        required: false,
        options: [
          { label: "Email" },
          { label: "Social media" },
          { label: "A colleague or friend" },
          { label: "Search engine" },
          { label: "A partner or community group" },
          { label: "Somewhere else" },
        ],
      },
      {
        ref: "future_events",
        type: "yes_no",
        title: "Can we let you know about future online events?",
        required: true,
      },
    ],
    branches: [
      { when: "sessions", op: "not_contains", is: "Hands-on workshop (limited places)", then: "timezone" },
    ],
    ending: {
      title: "You're registered 💻",
      body: "Your joining links are on their way. We'll send a reminder before each session you picked.",
    },
    guide: {
      questionsToConsider: [
        "What are the real sessions in your programme? Replace the session options with their names and times.",
        "Does any session have limited places, and what will you do if it fills up?",
        "Will you offer captions, transcripts or recordings, and can you promise them before asking?",
        "Do you need anything else from workshop attendees, such as software installed beforehand?",
      ],
      howToUseResponses:
        "Count registrations per session to size each room and to decide whether a limited session needs a second run. Send each workshop attendee joining details that match the device they said they would use, and pitch the opening minutes at the experience level most people chose. Group the speaker questions by session and send them to each speaker a few days ahead. Export the list to CSV to send joining links from your own email tool.",
      customizeSteps: [
        "Rename the session options to your programme, including the time and timezone in each label.",
        "Edit the workshop questions, or delete them if your event has no hands-on session.",
        "Share the registration link on your event page and in your invitations, or embed the form on your website.",
      ],
      faqs: [
        {
          q: "What should an online event registration form ask?",
          a: "Name and email, which sessions the person wants to join, their timezone and any access needs. Anything more should be something you will act on.",
        },
        {
          q: "How do I send joining links after people register?",
          a: "Export the responses to CSV and send each session's link to the people who picked it, or include one shared link in the confirmation email you send.",
        },
        {
          q: "Why ask for a timezone on an online event form?",
          a: "Attendees can be anywhere, and a reminder that arrives at 3am is worse than none. It also tells you whether a repeat session in another time slot would be worth running.",
        },
        {
          q: "Can I use this form for a single webinar?",
          a: "Yes. Remove the session question and the workshop questions, and you have a short webinar signup with timezone and access needs.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "event-volunteer-form",
    type: "form",
    category: "event-registration",
    goals: ["run-events"],
    roles: ["operations", "hr-people"],
    searchName: "Event volunteer form",
    title: "Event volunteer signup",
    icon: "HandHeart",
    metaDescription:
      "Recruit volunteers for your event: shifts they can cover, roles ranked by preference, useful skills, an emergency contact and agreement to the volunteer code.",
    description: "Find out who can help, when, and with what, before you draw up the rota.",
    blurb:
      "Collects exactly what you need to build a volunteer rota: available shifts, a ranking of preferred roles, and skills like first aid that change where someone is most useful. First aiders are asked when their certificate runs out, so you only roster ones who are current on the day. Volunteers under 18 give a parent or guardian contact, and everyone agrees to the volunteer code at the end.",
    tags: ["event volunteer form", "volunteer signup", "volunteer registration", "volunteer rota", "branching"],
    greeting: "Thanks for offering to help! This takes a few minutes and helps us put you in the right place.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "How can we reach you?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "adult",
        type: "yes_no",
        title: "Are you 18 or over?",
        required: true,
      },
      {
        ref: "guardian",
        type: "short_text",
        title: "What's the name and phone number of a parent or guardian who can approve this?",
        description: "We'll check with them before confirming your shifts.",
        required: true,
        maxLength: 160,
      },
      {
        ref: "shifts",
        type: "multi_select",
        title: "Which shifts can you cover?",
        description: "Pick every one you could do. We won't give you all of them.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Setup, the day before" },
          { label: "Event day, morning" },
          { label: "Event day, afternoon" },
          { label: "Event day, evening" },
          { label: "Pack-down after close" },
        ],
      },
      {
        ref: "roles",
        type: "ranking",
        title: "Rank these roles from the one you'd most like to the least",
        required: true,
        items: [
          "Welcome and registration desk",
          "Guiding and helping guests",
          "Setup and pack-down",
          "Food and drink",
          "Looking after speakers or performers",
          "Photos and social media",
        ],
      },
      {
        ref: "skills",
        type: "multi_select",
        title: "Do any of these apply to you?",
        required: false,
        minSelections: 0,
        maxSelections: 6,
        options: [
          { label: "First aid trained" },
          { label: "Speak another language" },
          { label: "Comfortable lifting and carrying" },
          { label: "Have a driving licence" },
          { label: "Experience with photography" },
          { label: "Have volunteered at events before" },
        ],
      },
      {
        ref: "first_aid_expiry",
        type: "date",
        title: "When does your first aid certificate run out?",
        description: "First aiders are placed before anyone else, so we need to know it's current on the day.",
        required: true,
      },
      {
        ref: "experience",
        type: "long_text",
        title: "Tell us about any experience that would help us place you.",
        required: false,
        maxLength: 800,
      },
      {
        ref: "tshirt",
        type: "dropdown",
        title: "What size volunteer T-shirt should we save for you?",
        required: true,
        options: [{ label: "XS" }, { label: "S" }, { label: "M" }, { label: "L" }, { label: "XL" }, { label: "XXL" }],
      },
      {
        ref: "needs",
        type: "long_text",
        title: "Any dietary, access or health needs we should know about on the day?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "emergency",
        type: "short_text",
        title: "Who should we call in an emergency? Name, relationship and phone number.",
        required: true,
        maxLength: 200,
      },
      {
        ref: "code",
        type: "legal_consent",
        title: "Please read and agree to the volunteer code",
        required: true,
        consentText:
          "I will arrive on time for the shifts I'm given, or let the volunteer coordinator know as early as possible if I can't. I will follow instructions from event staff, treat guests and other volunteers with respect, and report any safety concern straight away.",
        agreeLabel: "I agree",
      },
    ],
    branches: [
      { when: "adult", is: true, then: "shifts" },
      { when: "adult", is: false, then: "guardian" },
      { when: "skills", op: "not_contains", is: "First aid trained", then: "experience" },
    ],
    ending: {
      title: "Thank you for volunteering 🙌",
      body: "We'll email your shifts and a briefing before the event.",
    },
    guide: {
      questionsToConsider: [
        "What are your real shifts, with times? Replace the shift options so volunteers know what they're agreeing to.",
        "Which roles need a particular skill, such as first aid or a driving licence?",
        "Do you accept volunteers under 18, and what does your organisation need from a parent or guardian?",
        "Does your volunteer code need to cover anything specific to your venue, such as alcohol or safeguarding?",
      ],
      howToUseResponses:
        "Export the responses to CSV and build the rota from the shifts column first, then fill each role from the rankings, giving people their first or second choice where you can. Put first aiders and drivers where they are needed before anything else. Confirm under-18 volunteers with their parent or guardian before sending shifts. Keep the emergency contacts in a printed list with the coordinator on the day.",
      customizeSteps: [
        "Replace the shift and role options with your event's real schedule and jobs.",
        "Edit the volunteer code to your organisation's wording, or remove it if you use a separate agreement.",
        "Share the link with your community, or embed it on your event page, well before the rota is due.",
      ],
      faqs: [
        {
          q: "What should an event volunteer form include?",
          a: "Contact details, which shifts someone can cover, which roles they prefer, relevant skills, an emergency contact and agreement to your volunteer expectations.",
        },
        {
          q: "How far in advance should I recruit event volunteers?",
          a: "Early enough to build a rota, send a briefing and replace anyone who drops out. For a large event that often means several weeks ahead.",
        },
        {
          q: "Can volunteers under 18 use this form?",
          a: "Yes. They are asked for a parent or guardian contact before they continue, so you can check with that person before confirming shifts.",
        },
        {
          q: "How do I turn the answers into a volunteer rota?",
          a: "Export the responses to CSV, sort by shift, and assign roles using each person's ranking. The skills answers tell you who to place first.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "hackathon-registration-form",
    type: "form",
    category: "event-registration",
    goals: ["run-events"],
    roles: ["education", "operations"],
    searchName: "Hackathon registration form",
    title: "Hackathon registration",
    icon: "Code",
    metaDescription:
      "Register hackathon participants: background, skills, team status, track interest, T-shirt size and dietary needs. Solo hackers can ask to be matched with a team.",
    description: "Register hackers, sort out teams, and know who needs food, a T-shirt or a teammate.",
    blurb:
      "Covers what organisers actually need before the weekend: skills, experience, which track people want and whether they already have a team. Anyone looking for teammates says what they can bring and what they need, so matching is quick, and everyone agrees to the code of conduct before they finish.",
    tags: ["hackathon registration", "hackathon signup", "coding event", "team matching", "branching"],
    greeting: "Ready to build something? Let's get you registered for the hackathon.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who's hacking?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      {
        ref: "status",
        type: "single_select",
        title: "Which best describes you right now?",
        required: true,
        options: [
          { label: "Student" },
          { label: "Working professional" },
          { label: "Self-taught or between jobs" },
        ],
      },
      {
        ref: "school",
        type: "short_text",
        title: "Which school, college or university do you attend?",
        required: true,
        maxLength: 150,
      },
      {
        ref: "profile",
        type: "url",
        title: "Link to your GitHub, portfolio or a project you've built",
        description: "Optional, but it helps us and your future teammates.",
        required: false,
      },
      {
        ref: "hackathons",
        type: "single_select",
        title: "How many hackathons have you taken part in?",
        required: true,
        options: [{ label: "This is my first" }, { label: "1–3" }, { label: "4 or more" }],
      },
      {
        ref: "skills",
        type: "multi_select",
        title: "What can you bring to a team?",
        required: true,
        minSelections: 1,
        maxSelections: 8,
        options: [
          { label: "Frontend" },
          { label: "Backend" },
          { label: "Mobile" },
          { label: "Data or machine learning" },
          { label: "Design" },
          { label: "Hardware" },
          { label: "Product thinking and pitching" },
        ],
        allowOther: true,
      },
      {
        ref: "track",
        type: "single_select",
        title: "Which track are you most interested in?",
        required: true,
        options: [
          { label: "AI tools" },
          { label: "Climate and sustainability" },
          { label: "Health" },
          { label: "Education" },
          { label: "Open track" },
        ],
      },
      {
        ref: "team",
        type: "single_select",
        title: "Do you have a team?",
        required: true,
        options: [
          { label: "Yes, our team is full" },
          { label: "Yes, but we have space" },
          { label: "No, please match me with one" },
          { label: "I'd like to work solo" },
        ],
      },

      // Has a team
      {
        ref: "teammates",
        type: "long_text",
        title: "Who's on your team? Name and email for each person.",
        description: "They'll each need to register too.",
        required: true,
        maxLength: 800,
      },

      // Wants a match
      {
        ref: "match_prefs",
        type: "long_text",
        title: "What kind of teammates would suit you?",
        description: "Skills you're missing, the idea you want to work on, or how you like to work.",
        required: true,
        maxLength: 800,
      },

      // Everyone
      {
        ref: "idea",
        type: "long_text",
        title: "Got an idea already? Tell us in a sentence or two.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "tshirt",
        type: "dropdown",
        title: "T-shirt size?",
        required: true,
        options: [{ label: "XS" }, { label: "S" }, { label: "M" }, { label: "L" }, { label: "XL" }, { label: "XXL" }],
      },
      {
        ref: "dietary",
        type: "multi_select",
        title: "Any dietary requirements?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "None" },
          { label: "Vegetarian" },
          { label: "Vegan" },
          { label: "Halal" },
          { label: "Gluten-free" },
          { label: "Allergy (tell us below)" },
        ],
      },
      {
        ref: "needs",
        type: "long_text",
        title: "Any allergies, access needs or anything else we should plan for?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "conduct",
        type: "legal_consent",
        title: "Please agree to the code of conduct",
        required: true,
        consentText:
          "I will treat every participant, mentor, judge and organiser with respect. I will not harass anyone or share offensive material. I understand the organisers may remove anyone who breaks this code from the event.",
        agreeLabel: "I agree",
      },
    ],
    branches: [
      { when: "status", is: "Student", then: "school" },
      { when: "status", is: "Working professional", then: "profile" },
      { when: "status", is: "Self-taught or between jobs", then: "profile" },
      { when: "team", is: "Yes, our team is full", then: "teammates" },
      { when: "team", is: "Yes, but we have space", then: "teammates" },
      { when: "team", is: "No, please match me with one", then: "match_prefs" },
      { when: "team", is: "I'd like to work solo", then: "idea" },
      { when: "teammates", always: true, then: "idea" },
    ],
    ending: {
      title: "You're in 🚀",
      body: "Watch your inbox for the schedule, what to bring and, if you asked for one, your team match.",
    },
    guide: {
      questionsToConsider: [
        "What are your real tracks or challenge themes? Replace the track options with them.",
        "What's your maximum team size, and should the teammates question say so?",
        "Is the event open to everyone, or only students? If only students, remove the other status options.",
        "Will you provide food and T-shirts? Delete those questions if not.",
        "Does your code of conduct need to match an existing policy from your school or sponsor?",
      ],
      howToUseResponses:
        "Start with team matching: filter for people who asked to be matched, then group them so each team has a mix of the skills they listed and an interest in the same track. Check that everyone named as a teammate has registered too. Count the tracks to plan mentors and judges, and send the T-shirt and dietary totals to suppliers from a CSV export. First-timers are worth a welcome message or a beginner session.",
      customizeSteps: [
        "Replace the track options with your themes and edit the greeting with your dates and venue.",
        "Swap in your own code of conduct wording, keeping it short enough that people actually read it.",
        "Share the link on your event page and with student groups, or embed it on the hackathon website.",
      ],
      faqs: [
        {
          q: "What should a hackathon registration form ask?",
          a: "Contact details, background, skills and experience, team status, track interest, and practical details like dietary needs and T-shirt size. Agreement to a code of conduct is standard too.",
        },
        {
          q: "How do you form hackathon teams from registrations?",
          a: "Ask who needs a team and what they can bring, then group people so each team has a mix of skills, such as a developer, a designer and someone to pitch.",
        },
        {
          q: "Should a hackathon have a code of conduct?",
          a: "Yes. It sets expectations for behaviour and gives organisers a clear basis to act if someone causes harm. Asking people to agree during registration means nobody can say they didn't see it.",
        },
        {
          q: "Can beginners register for a hackathon?",
          a: "Usually, yes, and many events welcome them. This form asks how many hackathons someone has done, so you can offer first-timers extra help.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "webinar-registration",
    type: "form",
    category: "event-registration",
    goals: ["run-events", "generate-leads"],
    roles: ["marketing", "sales"],
    searchName: "Webinar registration form",
    title: "Webinar registration",
    icon: "Video",
    metaDescription:
      "Register webinar attendees and collect their questions in advance. People who can't join live get the recording and tell you what kept them away.",
    description: "Register attendees, and ask the ones who can't join live what would have helped.",
    blurb:
      "The best webinar Q&A is written before the webinar starts. This asks what attendees want covered, and splits the people joining live from the ones who only want the recording, because those two get different emails afterwards and each reaches its own ending that says so.",
    tags: ["webinar registration", "webinar signup", "online event", "lead generation", "branching"],
    greeting: "Save your seat. It takes about a minute.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 100 },
      { ref: "email", type: "email", title: "Where should we send the joining link?", required: true },
      { ref: "company", type: "short_text", title: "Which company are you with?", required: false, maxLength: 120 },
      { ref: "job_title", type: "short_text", title: "And your job title?", required: false, maxLength: 120 },
      {
        ref: "familiarity",
        type: "single_select",
        title: "How familiar are you with the topic?",
        description: "So the speaker knows how much ground to cover before the interesting part.",
        required: true,
        options: [{ label: "New to it" }, { label: "I know the basics" }, { label: "I work with it regularly" }],
      },
      {
        ref: "attendance",
        type: "single_select",
        title: "Will you join live?",
        required: true,
        options: [{ label: "Yes, live" }, { label: "No, send me the recording" }],
      },

      // Joining live
      {
        ref: "question",
        type: "long_text",
        title: "Anything you'd like the speaker to cover?",
        description: "Questions sent in advance are answered first.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "reminder",
        type: "single_select",
        title: "When should we remind you?",
        required: false,
        options: [{ label: "A day before" }, { label: "An hour before" }, { label: "Both" }, { label: "No reminder needed" }],
      },

      // Recording only
      {
        ref: "cannot_attend_reason",
        type: "single_select",
        title: "What's getting in the way?",
        description: "If it's the time, we may run it again at a better hour for you.",
        required: false,
        options: [
          { label: "Wrong time of day for me" },
          { label: "Wrong day" },
          { label: "I just prefer recordings" },
          { label: "Something else" },
        ],
      },
      {
        ref: "recording_question",
        type: "long_text",
        title: "Anything you'd like the speaker to cover? We'll make sure it's in the recording.",
        required: false,
        maxLength: 600,
      },
      { ref: "timezone", type: "short_text", title: "Which timezone are you in?", required: false, maxLength: 80 },
    ],
    branches: [
      { when: "attendance", is: "Yes, live", then: "question" },
      { when: "attendance", is: "No, send me the recording", then: "cannot_attend_reason" },
      { when: "reminder", always: true, then: "end_thanks" },
      { when: "timezone", always: true, then: "end_recording" },
    ],
    endings: [
      {
        ref: "end_recording",
        title: "We'll send the recording 📼",
        body: "It goes out soon after the session. No need to be anywhere.",
      },
    ],
    ending: { title: "See you there 🎥", body: "Your joining link and calendar invite are on their way." },
    guide: {
      questionsToConsider: [
        "Is the company and job title worth asking for, or does it put people off a free session?",
        "How will you use the familiarity answers: to adjust the talk, or to follow up differently?",
        "Will you really rerun the session in another timezone if enough people ask?",
        "Who answers the questions sent in advance, and will they see them before going live?",
      ],
      howToUseResponses:
        "Send the speaker the advance questions and the split of familiarity answers a day before, so they can pitch the introduction at the right level. Send live attendees reminders at the times they chose. Everyone who asked for the recording gets it, and if many of them said the time was wrong, look at their timezones before scheduling the next one. Export to CSV to follow up with company and job title in hand.",
      customizeSteps: [
        "Put the webinar title, date and time with its timezone in the greeting.",
        "Edit the reminder options to match what you will actually send.",
        "Share the link in your invitation emails and social posts, or embed the form on the webinar's landing page.",
      ],
      faqs: [
        {
          q: "What should a webinar registration form ask?",
          a: "Name and email at minimum. Company, job title and how familiar someone is with the topic help you tailor the session and the follow-up.",
        },
        {
          q: "How do I get more people to attend a webinar live?",
          a: "Ask what they want covered, so they have a reason to be there, and send reminders at the times they choose. This form does both.",
        },
        {
          q: "Should I send the recording to people who didn't attend?",
          a: "Yes. Many registrants only want the recording, and this form asks them up front so you can send it without guessing.",
        },
        {
          q: "When should I send webinar reminders?",
          a: "A day before and again shortly before the start covers most people. This form lets each registrant pick, so you only send the reminders they asked for.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "workshop-registration",
    type: "form",
    category: "event-registration",
    goals: ["run-events"],
    roles: ["education", "freelancers-agencies"],
    searchName: "Workshop registration form",
    title: "Workshop registration",
    icon: "Users",
    metaDescription:
      "Sign people up for a hands-on workshop and check they're ready: session choice, experience level, setup and goals. Beginners get extra prep, experts don't.",
    description: "Sign people up and check they're ready for the day.",
    blurb:
      "A hands-on workshop goes badly when half the room hasn't installed anything. This asks about experience and setup so the right prep email goes to the right people: beginners are asked what they have tried and offered pre-reading, while experienced attendees say what they want to go deep on.",
    tags: ["workshop registration", "training registration", "class signup", "hands-on workshop", "branching"],
    greeting: "Let's get you registered. A few details and you're set.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 100 },
      { ref: "email", type: "email", title: "What email should the prep instructions go to?", required: true },
      { ref: "organisation", type: "short_text", title: "Which organisation are you with, if any?", required: false, maxLength: 120 },
      {
        ref: "session",
        type: "dropdown",
        title: "Which session would you like?",
        required: true,
        options: [
          { label: "Morning (9:00–12:00)" },
          { label: "Afternoon (13:00–16:00)" },
          { label: "Evening (18:00–21:00)" },
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

      // Beginners
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

      // Everyone else
      {
        ref: "advanced_interest",
        type: "short_text",
        title: "Anything specific you're hoping we go deep on?",
        required: false,
        maxLength: 300,
      },

      // Everyone
      {
        ref: "setup",
        type: "single_select",
        title: "What kind of computer will you bring on the day?",
        required: true,
        options: [{ label: "macOS" }, { label: "Windows" }, { label: "Linux" }, { label: "I'll need to borrow a machine" }],
      },
      {
        ref: "goal",
        type: "long_text",
        title: "What do you want to walk out being able to do?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "accessibility",
        type: "long_text",
        title: "Anything we can do to make the day work better for you?",
        description: "Access, seating, captions, breaks, food: anything.",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "experience", op: "lte", is: 2, then: "beginner_background" },
      { when: "experience", op: "gte", is: 3, then: "advanced_interest" },
      { when: "wants_primer", always: true, then: "setup" },
    ],
    ending: { title: "Registered ✅", body: "Prep instructions are on their way to your inbox." },
    guide: {
      questionsToConsider: [
        "What will attendees need installed or brought on the day, and how early should they know?",
        "How many places does each session have, and what happens when one fills?",
        "Is there a level below which the workshop won't work for someone? Say so in the greeting.",
        "Do you have loaner machines, or should that option come out of the setup question?",
      ],
      howToUseResponses:
        "Split responses by experience level and send two different prep emails: beginners get the pre-reading and extra setup help, experienced attendees get a note on what you'll cover in depth. Count the operating systems so you can prepare instructions for each, and set aside loaner machines for everyone who asked. Read the goals before the day and open by naming the most common ones.",
      customizeSteps: [
        "Change the session options to your real dates and times, or delete the question if there's only one.",
        "Edit the setup options to the tools the workshop actually uses.",
        "Share the registration link in your announcement, or embed it on your course or event page.",
      ],
      faqs: [
        {
          q: "What should a workshop registration form include?",
          a: "Contact details, which session someone wants, how experienced they are and what setup they'll bring. Asking what they hope to learn helps you shape the day.",
        },
        {
          q: "How do I prepare attendees with different experience levels?",
          a: "Ask about experience when they register, then send beginners pre-reading and setup help while experienced people get a note on the advanced material. This form splits them for you.",
        },
        {
          q: "Can I take payment for a workshop with this form?",
          a: "This template does not take payment. Tell people in the greeting or the ending how and when to pay.",
        },
        {
          q: "Can I edit this workshop registration template?",
          a: "Yes. Use this template copies it into your account, where you can change every question and share the form by link or embed.",
        },
      ],
    },
  }),
];
