import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_JOB_APPLICATION: TemplateSeed[] = [
  defineTemplate({
    slug: "model-application-form",
    type: "form",
    category: "job-application",
    goals: [],
    roles: ["hr-people", "freelancers-agencies"],
    searchName: "Model application form",
    title: "Model application",
    icon: "Camera",
    metaDescription:
      "Take modelling applications in one consistent format: the work someone does, recent photos, a portfolio link and availability. Under-18s get a guardian step.",
    description: "Collect photos, experience and availability from aspiring and working models.",
    blurb:
      "Built for agencies and casting teams who are tired of applications arriving as DMs with one blurry photo. It asks for the kind of work first, then recent unretouched shots and a portfolio. Applicants under 18 are routed to a parent or guardian contact before they continue, and people with no experience are asked what draws them in rather than for credits they do not have.",
    tags: ["model application", "casting call", "modelling agency", "talent application", "branching"],
    greeting:
      "Thanks for your interest in working with us. This takes about four minutes, and it helps to have two or three recent photos on your phone.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, who are we talking to?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "age_group",
        type: "single_select",
        title: "How old are you?",
        description: "We ask because anyone under 18 needs a parent or guardian involved.",
        required: true,
        options: [{ label: "Under 16" }, { label: "16 or 17" }, { label: "18 to 24" }, { label: "25 or older" }],
      },

      // Under 18
      {
        ref: "guardian",
        type: "contact_info",
        title: "Please add a parent or guardian we can contact",
        description: "We only discuss work with minors when a parent or guardian is part of the conversation.",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },

      // Everyone
      {
        ref: "city",
        type: "short_text",
        title: "Which city are you based in?",
        required: true,
        maxLength: 80,
      },
      {
        ref: "work_types",
        type: "multi_select",
        title: "What kind of modelling are you interested in?",
        required: true,
        minSelections: 1,
        maxSelections: 7,
        options: [
          { label: "Editorial and fashion" },
          { label: "Runway" },
          { label: "Commercial and advertising" },
          { label: "Fitness and sportswear" },
          { label: "Parts (hands, feet, hair)" },
          { label: "Promotional and events" },
          { label: "Content creation for brands" },
        ],
      },
      {
        ref: "experience",
        type: "single_select",
        title: "How much modelling have you done so far?",
        required: true,
        options: [
          { label: "None yet" },
          { label: "Test shoots or a few small jobs" },
          { label: "Regular paid work" },
          { label: "Signed with an agency now or before" },
        ],
      },

      // New faces
      {
        ref: "why_model",
        type: "long_text",
        title: "What draws you to modelling, and what would you like to be doing a year from now?",
        required: true,
        maxLength: 800,
      },

      // Experienced
      {
        ref: "credits",
        type: "long_text",
        title: "Tell us about two or three jobs you are proudest of",
        description: "The client, the kind of shoot or show, and roughly when.",
        required: true,
        maxLength: 1200,
      },
      {
        ref: "portfolio",
        type: "url",
        title: "Link to your portfolio, comp card or modelling Instagram",
        required: false,
      },

      // Everyone
      {
        ref: "photos",
        type: "file_upload",
        title: "Upload two to four recent photos",
        description: "Natural light, little or no makeup, no filters. One headshot, one full length and one profile work best.",
        required: true,
        accept: ["image/jpeg", "image/png", "image/heic"],
        maxFiles: 4,
        maxSizeMB: 10,
      },
      {
        ref: "height",
        type: "number",
        title: "How tall are you, in centimetres?",
        description: "Some briefs have height requirements, so this helps us match you to the right ones.",
        required: false,
        integerOnly: true,
        min: 100,
        max: 230,
      },
      {
        ref: "availability",
        type: "matrix",
        title: "When are you usually free to work?",
        required: true,
        rows: ["Weekdays", "Weekends", "Evenings"],
        columns: ["Usually free", "Sometimes", "Rarely"],
      },
      {
        ref: "travel",
        type: "yes_no",
        title: "Could you travel for a job outside your city?",
        required: true,
      },
      {
        ref: "consent",
        type: "legal_consent",
        title: "Your photos and details",
        required: true,
        consentText:
          "I confirm the photos are of me and that I can share them. I understand they will only be used to review this application and will not be published without my permission.",
      },
    ],
    branches: [
      { when: "age_group", is: "Under 16", then: "guardian" },
      { when: "age_group", is: "16 or 17", then: "guardian" },
      { when: "age_group", is: "18 to 24", then: "city" },
      { when: "age_group", is: "25 or older", then: "city" },
      { when: "experience", is: "None yet", then: "why_model" },
      { when: "experience", is: "Test shoots or a few small jobs", then: "credits" },
      { when: "experience", is: "Regular paid work", then: "credits" },
      { when: "experience", is: "Signed with an agency now or before", then: "credits" },
      { when: "why_model", always: true, then: "photos" },
    ],
    ending: {
      title: "Application received 📸",
      body: "Our team looks at every application. If your look fits a current brief, we will get in touch to arrange a meeting or test shoot. Sending an application does not mean you are booked or represented.",
    },
    guide: {
      questionsToConsider: [
        "Are you recruiting for one casting brief or building a general talent board? A brief can ask for specific looks and dates.",
        "Which measurements does your work genuinely need? Ask only for those, and say why.",
        "How young can applicants be, and who on your team speaks to parents or guardians?",
        "Which photos do your bookers actually use to decide: digitals, a comp card or a portfolio link?",
        "Do applicants need to know about fees or contracts before they apply, so nobody feels misled later?",
      ],
      howToUseResponses:
        "Filter by the type of work first, so an editorial booker is not scrolling past promotional staff. Look at the unretouched photos before the portfolio, since they show how someone looks on the day. For applicants under 18, reply to the guardian as well as the applicant, every time. Tell people who are not a fit for now whether you will keep their details on file.",
      customizeSteps: [
        "Edit the greeting to name the brief or agency and say what applicants should have ready.",
        "Change the work types and the photo guidance to match what your bookers review, and remove the height question if it plays no part.",
        "Share the link in your casting call or embed it on your website, and read new applications in the dashboard.",
      ],
      faqs: [
        {
          q: "What should a model application form include?",
          a: "Contact details, age, location, the kind of work the person wants, recent unedited photos, a portfolio link if they have one and their availability. Ask for measurements only when a brief needs them.",
        },
        {
          q: "What photos should a model applicant send?",
          a: "Simple, recent digitals in natural light: a headshot, a full-length shot and a profile. Heavily edited or filtered photos make it hard to judge how someone will look on set.",
        },
        {
          q: "Can minors apply through this form?",
          a: "Yes. Anyone who says they are under 18 is asked for a parent or guardian's contact details before continuing, so you can involve them from the first reply.",
        },
        {
          q: "Can applicants with no experience apply?",
          a: "Yes. New faces skip the question about past jobs and are asked what draws them to modelling instead, so the form never asks for credits they cannot have.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "job-application",
    type: "form",
    category: "job-application",
    goals: [],
    roles: ["hr-people", "operations"],
    searchName: "Job application form",
    title: "Job application",
    icon: "Briefcase",
    metaDescription:
      "Screen candidates with one application form for every team: engineers share code, designers a portfolio, sales their numbers. Everyone gets the same core questions.",
    description: "Screen candidates, and ask each discipline its own questions.",
    blurb:
      "Everything a first-pass review needs and nothing it doesn't. The role someone picks decides what they are asked next: engineers get a code sample question, designers a portfolio walkthrough, sales their deal sizes. One form serves five hiring managers, and anyone without the right to work where the role is based is told straight away rather than after an interview.",
    tags: ["job application", "hiring", "recruiting", "candidate screening", "branching"],
    greeting: "Glad you're interested in joining us. This takes a few minutes, and you can attach your CV near the end.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Let's start with your details",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      { ref: "location", type: "short_text", title: "Where are you based?", required: true, maxLength: 100 },
      {
        ref: "right_to_work",
        type: "yes_no",
        title: "Do you have the right to work where this role is based?",
        description: "We can't sponsor visas for this role, so this saves us both time.",
        required: true,
      },
      {
        ref: "role",
        type: "single_select",
        title: "Which team are you applying to?",
        required: true,
        options: [
          { label: "Engineering" },
          { label: "Design" },
          { label: "Product" },
          { label: "Sales" },
          { label: "Operations" },
        ],
      },

      // Engineering
      {
        ref: "eng_stack",
        type: "multi_select",
        title: "What do you work in most?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        allowOther: true,
        options: [
          { label: "TypeScript / JavaScript" },
          { label: "Python" },
          { label: "Go" },
          { label: "Rust" },
          { label: "Java or Kotlin" },
          { label: "Swift" },
        ],
      },
      { ref: "eng_code_sample", type: "url", title: "A link to something you've built or shipped", required: true },
      {
        ref: "eng_debugged",
        type: "long_text",
        title: "What's the hardest bug you've tracked down, and how did you find it?",
        required: true,
        maxLength: 1500,
      },

      // Design
      { ref: "design_portfolio", type: "url", title: "Link to your portfolio", required: true },
      {
        ref: "design_focus",
        type: "multi_select",
        title: "Where are you strongest?",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Product and interaction" },
          { label: "Visual and brand" },
          { label: "Design systems" },
          { label: "Research" },
          { label: "Motion" },
        ],
      },
      {
        ref: "design_case",
        type: "long_text",
        title: "Pick one project and tell us what you changed and why",
        required: true,
        maxLength: 1500,
      },

      // Product
      {
        ref: "product_shipped",
        type: "long_text",
        title: "Describe something you shipped and how you decided what to cut",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "product_metric",
        type: "short_text",
        title: "Which number did you own, and where did it end up?",
        required: false,
        maxLength: 200,
      },

      // Sales
      {
        ref: "sales_deal_size",
        type: "single_select",
        title: "What size deals do you usually close?",
        required: true,
        options: [{ label: "Under $5k" }, { label: "$5k–$25k" }, { label: "$25k–$100k" }, { label: "Over $100k" }],
      },
      {
        ref: "sales_attainment",
        type: "number",
        title: "Roughly what percentage of quota did you hit last year?",
        required: false,
        integerOnly: true,
        min: 0,
        max: 500,
      },
      {
        ref: "sales_market",
        type: "single_select",
        title: "Which market do you know best?",
        required: false,
        options: [{ label: "Small businesses" }, { label: "Mid-market" }, { label: "Enterprise" }, { label: "Developer tools" }],
      },

      // Operations
      {
        ref: "ops_area",
        type: "multi_select",
        title: "Which of these have you owned?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Finance" },
          { label: "People and hiring" },
          { label: "Legal and compliance" },
          { label: "Customer operations" },
          { label: "Tooling and systems" },
          { label: "Vendor management" },
        ],
      },
      {
        ref: "ops_process",
        type: "long_text",
        title: "Describe a process you fixed and what it was costing before",
        required: true,
        maxLength: 1500,
      },

      // Everyone
      {
        ref: "experience_years",
        type: "number",
        title: "How many years of relevant experience do you have?",
        required: true,
        integerOnly: true,
        min: 0,
        max: 60,
      },
      {
        ref: "work_setup",
        type: "single_select",
        title: "How would you want to work?",
        required: true,
        options: [{ label: "Fully remote" }, { label: "Hybrid" }, { label: "In the office" }, { label: "Any of these" }],
      },
      {
        ref: "salary",
        type: "short_text",
        title: "What salary range are you looking for?",
        description: "A rough range is fine. It helps us check we are in the same place before anyone spends time on interviews.",
        required: false,
        maxLength: 100,
      },
      {
        ref: "cv",
        type: "file_upload",
        title: "Attach your CV",
        description: "PDF or Word, up to 10 MB.",
        required: false,
        accept: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        maxFiles: 1,
        maxSizeMB: 10,
      },
      { ref: "motivation", type: "long_text", title: "Why do you want to work with us?", required: true, maxLength: 1500 },
      {
        ref: "start",
        type: "single_select",
        title: "When could you start?",
        required: true,
        options: [
          { label: "Immediately" },
          { label: "Within a month" },
          { label: "One to three months" },
          { label: "Longer than three months" },
        ],
      },
      {
        ref: "accommodations",
        type: "long_text",
        title: "Anything we should do to make the process work for you?",
        description: "Interview format, timing, access. It never counts against an application.",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "right_to_work", is: false, then: "end_no_permit" },
      { when: "role", is: "Engineering", then: "eng_stack" },
      { when: "role", is: "Design", then: "design_portfolio" },
      { when: "role", is: "Product", then: "product_shipped" },
      { when: "role", is: "Sales", then: "sales_deal_size" },
      { when: "role", is: "Operations", then: "ops_area" },
      { when: "eng_debugged", always: true, then: "experience_years" },
      { when: "design_case", always: true, then: "experience_years" },
      { when: "product_metric", always: true, then: "experience_years" },
      { when: "sales_market", always: true, then: "experience_years" },
    ],
    endings: [
      {
        ref: "end_no_permit",
        title: "Thanks for your interest",
        body: "This role needs the right to work where it is based, and we are not able to sponsor a visa for it. Keep an eye on our careers page, as other roles may be open to you.",
      },
    ],
    ending: { title: "Application received 🚀", body: "We review every application within a week and reply either way." },
    guide: {
      questionsToConsider: [
        "Which disciplines are you hiring for right now? Remove the branches for teams that are not.",
        "Is the right-to-work question a hard requirement, or can you sponsor for some roles?",
        "What single piece of evidence tells each hiring manager the most: a code link, a portfolio, deal sizes?",
        "Do you want a CV at all, or do the role-specific answers already tell you enough?",
        "Will you publish the salary range in the job ad? If you do, the salary question can go.",
      ],
      howToUseResponses:
        "Filter by role and send each group to its hiring manager, who only needs to read their own branch plus the shared questions. Read the long answers before the CV: how someone describes a bug or a design decision says more than a job title. Reply to every applicant within the week you promise in the ending, including the ones you turn down.",
      customizeSteps: [
        "Replace the five roles with the ones you are hiring for, and adjust each branch's questions to what that manager screens for.",
        "Edit the right-to-work wording, or delete it if you can sponsor visas.",
        "Share the link on job boards and your careers page, or embed it, then read and export applications from the dashboard.",
      ],
      faqs: [
        {
          q: "What should a job application form ask?",
          a: "Contact details, location, right to work, the role, evidence of relevant work, years of experience, salary expectations, a CV and when the person could start. Add a question about interview adjustments so candidates can ask without awkwardness.",
        },
        {
          q: "Can one application form work for several roles?",
          a: "Yes. The role question routes each candidate to questions for that discipline, then everyone rejoins for the shared ones. Nobody sees questions meant for another team.",
        },
        {
          q: "What happens if a candidate can't work in the country?",
          a: "They reach a polite ending straight after that question, instead of filling in the whole form for a role they cannot take.",
        },
        {
          q: "Can candidates upload a CV?",
          a: "Yes. The CV question accepts a PDF or Word file, and it is optional so candidates with a strong portfolio link are not held up.",
        },
      ],
    },
  }),
];
