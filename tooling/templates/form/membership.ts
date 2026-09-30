import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_MEMBERSHIP: TemplateSeed[] = [
  defineTemplate({
    slug: "gym-membership-form",
    type: "form",
    category: "membership",
    goals: ["onboard-clients", "generate-leads"],
    roles: ["operations", "sales"],
    searchName: "Gym membership form",
    title: "Gym membership",
    icon: "Dumbbell",
    metaDescription:
      "Sign up new gym members with their plan, start date, goals, health notes, emergency contact and waiver. Members with an injury are asked the details before day one.",
    description: "Everything the front desk needs before a new member's first session.",
    blurb:
      "Covers the plan, start date and training goals, then the parts gyms usually chase on paper: health notes, an emergency contact and the waiver. Anyone who mentions an injury or condition is asked what it is and whether a doctor has cleared them, so a trainer knows before the induction rather than during it.",
    tags: ["gym membership form", "gym sign up", "fitness membership application", "health club registration", "branching"],
    greeting: "Great to have you! Let's get your membership set up. It takes about three minutes.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name, email and phone",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { ref: "date_of_birth", type: "date", title: "Your date of birth", required: true },
      {
        ref: "plan",
        type: "single_select",
        title: "Which membership would you like?",
        required: true,
        options: [
          { label: "Monthly, cancel any time" },
          { label: "Annual" },
          { label: "Off-peak" },
          { label: "Student" },
          { label: "Classes only" },
        ],
      },
      { ref: "start_date", type: "date", title: "When would you like to start?", required: true, disablePast: true },
      {
        ref: "goals",
        type: "multi_select",
        title: "What are you training for?",
        required: false,
        minSelections: 0,
        maxSelections: 4,
        options: [
          { label: "Getting stronger" },
          { label: "Losing weight" },
          { label: "Fitness and stamina" },
          { label: "Flexibility and mobility" },
          { label: "Training for an event" },
          { label: "Feeling better day to day" },
        ],
      },
      {
        ref: "experience",
        type: "single_select",
        title: "How much gym experience do you have?",
        required: true,
        options: [
          { label: "New to it" },
          { label: "Some, but it's been a while" },
          { label: "I train regularly" },
        ],
      },
      {
        ref: "times",
        type: "multi_select",
        title: "When are you most likely to come in?",
        required: false,
        minSelections: 0,
        maxSelections: 4,
        options: [{ label: "Early morning" }, { label: "Lunchtime" }, { label: "Evenings" }, { label: "Weekends" }],
      },
      {
        ref: "health_flag",
        type: "yes_no",
        title: "Do you have any injuries or health conditions we should know about?",
        required: true,
      },

      // Health follow-up
      {
        ref: "health_details",
        type: "long_text",
        title: "What should our trainers know?",
        description: "Only what affects how you exercise. This is kept private.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "doctor_ok",
        type: "single_select",
        title: "Has a doctor or physio cleared you to exercise?",
        required: true,
        options: [{ label: "Yes" }, { label: "I'm waiting to hear back" }, { label: "I haven't asked one" }],
      },

      // Everyone
      { ref: "pt_interest", type: "yes_no", title: "Would you like a free induction with a personal trainer?", required: true },
      { ref: "emergency_name", type: "short_text", title: "Emergency contact: name and relationship", required: true, maxLength: 150 },
      { ref: "emergency_phone", type: "phone", title: "Emergency contact's phone number", required: true },
      {
        ref: "waiver",
        type: "legal_consent",
        title: "Membership terms and waiver",
        required: true,
        consentText:
          "I confirm the information above is accurate, I accept the membership terms, and I understand that I exercise at my own risk and should stop and tell staff if I feel unwell.",
      },
    ],
    branches: [
      { when: "health_flag", is: true, then: "health_details" },
      { when: "health_flag", is: false, then: "pt_interest" },
    ],
    ending: {
      title: "Welcome to the gym 💪",
      body: "We'll email your membership details and what to bring on your first visit.",
    },
    guide: {
      questionsToConsider: [
        "Which membership options do you sell, and what are they called at your front desk?",
        "Is there a minimum age, and should under-18s need a parent's consent?",
        "Does your insurer need specific wording in the waiver?",
        "Do you offer a free induction, and who books it?",
      ],
      howToUseResponses:
        "Check health answers every morning and pass any flagged member to the trainer running their induction, with the doctor clearance answer next to it. Set up each membership from the plan and start date, and store the emergency contact where staff on the floor can reach it. The goals and experience answers make a good opening for the induction, so print or save them for the trainer.",
      customizeSteps: [
        "Rename the membership options to match your price list exactly, so nobody picks a plan that doesn't exist.",
        "Replace the waiver text with the wording your insurer or lawyer has approved.",
        "Embed the form on your join page and put a link on a QR code at reception.",
      ],
      faqs: [
        {
          q: "What should a gym membership form include?",
          a: "Contact details, date of birth, the chosen plan and start date, health information, an emergency contact and a signed waiver.",
        },
        {
          q: "Should a gym ask about health conditions?",
          a: "Yes. A short health question lets trainers adapt the induction. This form asks for details only from people who say they have something to mention.",
        },
        {
          q: "How should a gym handle members under 18?",
          a: "Decide your minimum age first, then add a question asking for a parent or guardian's name and consent, and edit the waiver so a parent can agree to it.",
        },
        {
          q: "Can I use this for a yoga studio or climbing wall?",
          a: "Yes. Rename the plans and goals, and edit the waiver for the activity.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "membership-cancellation-form",
    type: "form",
    category: "membership",
    goals: ["collect-feedback"],
    roles: ["customer-success", "operations"],
    searchName: "Membership cancellation form",
    title: "Membership cancellation",
    icon: "LogOut",
    metaDescription:
      "Take cancellation requests with the membership, the reason and the end date. Members can pause or switch plans instead, and each choice gets its own ending.",
    description: "Take cancellation requests cleanly, and offer a pause to those who want one.",
    blurb:
      "Makes leaving easy while still giving people a real alternative. After the reason, members are offered a pause or a cheaper plan once, with no pressure: a pause records the return date, a switch hands them to the team, and a cancellation collects the end date and optional feedback. Members who are moving away skip the offer entirely.",
    tags: ["membership cancellation form", "cancel membership request", "gym cancellation", "subscription cancellation", "branching"],
    greeting: "Sorry to see you go. This takes about a minute, and the feedback questions at the end are optional.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name and the email on your membership",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "member_number", type: "short_text", title: "Membership number, if you have it", required: false, maxLength: 40 },
      {
        ref: "membership",
        type: "single_select",
        title: "Which membership is this about?",
        required: true,
        allowOther: true,
        options: [{ label: "Monthly" }, { label: "Annual" }, { label: "Off-peak" }, { label: "Family or joint" }],
      },
      {
        ref: "reason",
        type: "single_select",
        title: "What's the main reason?",
        required: true,
        options: [
          { label: "I'm moving away" },
          { label: "It costs too much" },
          { label: "I'm not using it enough" },
          { label: "I'm unhappy with the service" },
          { label: "Health or personal reasons" },
          { label: "Something else" },
        ],
      },

      // Unhappy
      {
        ref: "what_went_wrong",
        type: "long_text",
        title: "We're sorry. What went wrong?",
        required: false,
        maxLength: 1000,
      },

      // Offer
      {
        ref: "alternative",
        type: "single_select",
        title: "Would either of these work better than cancelling?",
        required: true,
        options: [
          { label: "Pause my membership instead" },
          { label: "Switch to a cheaper option" },
          { label: "No thanks, please cancel" },
        ],
      },

      // Pause
      { ref: "pause_until", type: "date", title: "When would you like to come back?", required: true, disablePast: true },

      // Cancel
      { ref: "end_date", type: "date", title: "When should the cancellation take effect?", description: "If you're not sure, pick the earliest date. Your notice period still applies.", required: true, disablePast: true },
      { ref: "experience", type: "rating", title: "Overall, how was your time as a member?", required: false, scale: 5 },
      {
        ref: "feedback",
        type: "long_text",
        title: "Anything else you'd like us to know?",
        description: "Completely optional.",
        required: false,
        maxLength: 1000,
      },
      { ref: "come_back", type: "yes_no", title: "Can we let you know about offers if you'd like to return one day?", required: true },
    ],
    branches: [
      { when: "reason", is: "I'm moving away", then: "end_date" },
      { when: "reason", is: "It costs too much", then: "alternative" },
      { when: "reason", is: "I'm not using it enough", then: "alternative" },
      { when: "reason", is: "I'm unhappy with the service", then: "what_went_wrong" },
      { when: "reason", is: "Health or personal reasons", then: "alternative" },
      { when: "reason", is: "Something else", then: "alternative" },
      { when: "alternative", is: "Pause my membership instead", then: "pause_until" },
      { when: "alternative", is: "Switch to a cheaper option", then: "end_switch" },
      { when: "alternative", is: "No thanks, please cancel", then: "end_date" },
      { when: "pause_until", always: true, then: "end_paused" },
    ],
    ending: {
      title: "Cancellation request received",
      body: "We'll email you to confirm the date your membership ends. Thanks for being a member.",
    },
    endings: [
      {
        ref: "end_paused",
        title: "Your pause request is in ⏸️",
        body: "We'll confirm the pause by email and remind you before your return date.",
      },
      {
        ref: "end_switch",
        title: "Let's find a better fit",
        body: "Someone from the team will email you the cheaper options and switch you over once you've picked one.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Do you actually offer pauses and cheaper plans, and on what terms?",
        "What notice period applies, and should the form mention it?",
        "Who confirms a cancellation, and how quickly?",
        "Is the reason question useful enough to keep required?",
      ],
      howToUseResponses:
        "Confirm every cancellation by email with the exact end date, and act on pauses and switches within a working day, since those members chose to stay. Count the reasons each month: a rise in \"not using it enough\" points to onboarding, and repeated complaints about service belong with the manager, not in a spreadsheet. Only contact people about coming back if they said yes.",
      customizeSteps: [
        "Change the membership options and the pause and switch offers to what you really provide, or remove the offer question if you don't have one.",
        "Add your notice period to the end date question so members aren't surprised.",
        "Link the form from your account page and cancellation emails, so members never have to phone to leave.",
      ],
      faqs: [
        {
          q: "Does submitting this form cancel the membership straight away?",
          a: "No. It records the request. Your team confirms the cancellation and the end date, usually by email.",
        },
        {
          q: "What should a membership cancellation form ask?",
          a: "Who the member is, which membership, the reason, when it should end, and optional feedback. Keep the feedback optional so leaving stays easy.",
        },
        {
          q: "Is it okay to offer a pause before someone cancels?",
          a: "Yes, if you offer it once and make declining just as easy. This form asks one question and moves on whatever the answer.",
        },
        {
          q: "Can I use this for subscriptions as well as clubs and gyms?",
          a: "Yes. Rename the membership options to your plans and the rest of the form works the same way.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "membership-application",
    type: "form",
    category: "membership",
    goals: ["onboard-clients"],
    roles: ["operations"],
    searchName: "Membership application form",
    title: "Membership application",
    icon: "BadgeCheck",
    metaDescription:
      "Take club and society membership applications with the tier, evidence for concessions, household names and the code of conduct, all collected in one go.",
    description: "Take applications with the tier, the evidence and the terms in one pass.",
    blurb:
      "Everything a membership secretary would otherwise chase over three emails. A concession applicant is asked which one applies and for evidence, a household membership for the other names on it, and a life membership nomination for the nominating member and history, so the committee can reply with a decision rather than another question.",
    tags: ["membership application form", "club membership form", "society membership", "association application", "branching"],
    greeting: "Glad you want to join us. A few questions and we'll take it from there.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Your name, email and phone",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { ref: "date_of_birth", type: "date", title: "Your date of birth", required: false, dateFormat: "DD/MM/YYYY" },
      {
        ref: "address",
        type: "address",
        title: "Your address",
        required: false,
        fields: ["street", "city", "postal", "country"],
      },
      {
        ref: "tier",
        type: "single_select",
        title: "Which membership are you applying for?",
        required: true,
        options: [
          { label: "Standard", description: "Full access, renewed yearly" },
          { label: "Concession", description: "Students, over-65s and unwaged" },
          { label: "Household", description: "Up to four people at one address" },
          { label: "Life member", description: "By nomination from an existing member" },
        ],
      },

      // Concession
      {
        ref: "concession_basis",
        type: "single_select",
        title: "Which applies to you?",
        required: true,
        options: [{ label: "Student" }, { label: "Over 65" }, { label: "Unwaged" }, { label: "Receiving benefits" }],
      },
      {
        ref: "concession_evidence",
        type: "file_upload",
        title: "Please upload something that shows it",
        description: "A student card, a letter or a screenshot, dated in the last year.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 2,
        maxSizeMB: 10,
      },

      // Household
      {
        ref: "household_members",
        type: "long_text",
        title: "Who else is on it? One name per line.",
        required: true,
        maxLength: 500,
      },
      {
        ref: "household_count",
        type: "number",
        title: "How many people in total, including you?",
        required: true,
        integerOnly: true,
        min: 2,
        max: 4,
      },

      // Life member
      {
        ref: "life_nominator",
        type: "short_text",
        title: "Which existing member is nominating you?",
        required: true,
        maxLength: 150,
      },
      {
        ref: "life_contribution",
        type: "long_text",
        title: "What's your history with us?",
        required: true,
        maxLength: 1500,
      },

      // Everyone
      { ref: "motivation", type: "long_text", title: "Why would you like to join?", required: true, maxLength: 1000 },
      {
        ref: "interests",
        type: "multi_select",
        title: "What would you like to get involved in?",
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { label: "Regular meetups" },
          { label: "The annual gathering" },
          { label: "Volunteering" },
          { label: "The committee" },
          { label: "Just the newsletter, thanks" },
        ],
      },
      {
        ref: "how_heard",
        type: "single_select",
        title: "How did you hear about us?",
        required: false,
        options: [{ label: "A member" }, { label: "An event" }, { label: "Online" }, { label: "Somewhere else" }],
      },
      {
        ref: "code_of_conduct",
        type: "legal_consent",
        title: "Code of conduct",
        required: true,
        consentText: "I have read the code of conduct and agree to abide by it as a member.",
      },
    ],
    branches: [
      { when: "tier", is: "Standard", then: "motivation" },
      { when: "tier", is: "Concession", then: "concession_basis" },
      { when: "tier", is: "Household", then: "household_members" },
      { when: "tier", is: "Life member", then: "life_nominator" },
      { when: "concession_evidence", always: true, then: "motivation" },
      { when: "household_count", always: true, then: "motivation" },
    ],
    ending: {
      title: "Application in 🎟️",
      body: "The committee reviews new applications at its next meeting, and we'll email you the outcome.",
    },
    guide: {
      questionsToConsider: [
        "Which membership tiers do you offer, and who qualifies for a concession?",
        "What counts as evidence for a concession, and do you need it at all?",
        "Does a household membership have a size limit, and does the number question match it?",
        "Should applicants under 18 need a parent or guardian to agree?",
      ],
      howToUseResponses:
        "Sort applications by tier before the committee meets: standard applications can usually be approved in a batch, while concessions need the evidence checked and life nominations need the nominating member's confirmation. Use the interests answer to introduce new members to whoever runs meetups or volunteering, and export the approved list to CSV for your membership records.",
      customizeSteps: [
        "Rename the tiers and their descriptions to match your membership rules.",
        "Link your code of conduct in the consent question, and edit the interests list to your real activities.",
        "Put the form on your website's join page and share the link with anyone who asks at an event.",
      ],
      faqs: [
        {
          q: "What should a membership application form include?",
          a: "Contact details, the membership type, any evidence needed for a discounted rate, why they want to join and agreement to your rules or code of conduct.",
        },
        {
          q: "How do I handle concession memberships?",
          a: "Ask which concession applies and for simple evidence. This form only asks concession applicants, so everyone else skips it.",
        },
        {
          q: "Can one application cover a whole household?",
          a: "Yes. Choosing household asks for the other names and the total number of people, up to the limit you set.",
        },
        {
          q: "Does the applicant become a member when they submit?",
          a: "No. The form collects the application, and your committee or membership secretary approves it and confirms by email.",
        },
      ],
    },
  }),
];
