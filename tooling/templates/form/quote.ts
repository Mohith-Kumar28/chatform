import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_QUOTE: TemplateSeed[] = [
  defineTemplate({
    slug: "marketing-quote-form",
    type: "form",
    category: "quote",
    goals: ["generate-leads", "onboard-clients"],
    roles: ["freelancers-agencies", "marketing", "sales"],
    searchName: "Marketing quote form",
    title: "Marketing quote",
    icon: "Megaphone",
    metaDescription:
      "Price marketing work without a discovery call: services, goals, timing and budget in one chat. One-off campaigns and monthly retainers get different follow-ups.",
    description: "Scope a campaign or a retainer well enough to send a real estimate.",
    blurb:
      "Built for agencies and freelance marketers who are tired of quoting from a one-line enquiry. A one-off campaign is asked about launch date and length, a monthly retainer about who runs marketing today and how long they want to commit, so each estimate starts from the facts that actually move the price.",
    tags: ["marketing quote", "agency estimate", "campaign pricing", "retainer", "branching"],
    greeting: "Tell us what you're planning and we'll put together an estimate for you.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "First, who are we preparing this for?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "What's the business called?", required: true, maxLength: 120 },
      {
        ref: "website",
        type: "url",
        title: "Where can we see the brand today?",
        description: "Your website, or a social profile if there's no site yet.",
        required: false,
      },
      {
        ref: "services",
        type: "multi_select",
        title: "Which services should the estimate cover?",
        required: true,
        minSelections: 1,
        maxSelections: 8,
        options: [
          { label: "Paid ads" },
          { label: "SEO" },
          { label: "Social media management" },
          { label: "Content and copywriting" },
          { label: "Email marketing" },
          { label: "Branding and design" },
          { label: "Video and motion" },
          { label: "Strategy only" },
        ],
      },
      {
        ref: "engagement",
        type: "single_select",
        title: "Is this a one-off piece of work or ongoing support?",
        required: true,
        options: [
          { label: "A one-off campaign or project" },
          { label: "Ongoing monthly support" },
          { label: "Not sure yet" },
        ],
      },

      // One-off campaign
      {
        ref: "launch_date",
        type: "date",
        title: "When would you like the campaign to go live?",
        description: "A rough date is fine. It tells us how much time there is to build it.",
        required: true,
        disablePast: true,
      },
      {
        ref: "campaign_length",
        type: "single_select",
        title: "And how long should it run?",
        required: true,
        options: [{ label: "Under a month" }, { label: "One to three months" }, { label: "Three to six months" }, { label: "Longer" }],
      },

      // Ongoing support
      {
        ref: "current_team",
        type: "single_select",
        title: "Who looks after marketing at the moment?",
        required: true,
        options: [
          { label: "Nobody yet" },
          { label: "The founder or owner" },
          { label: "Someone in-house" },
          { label: "Another agency" },
        ],
      },
      {
        ref: "commitment",
        type: "single_select",
        title: "How long would you give it before reviewing results?",
        required: true,
        options: [{ label: "Three months" }, { label: "Six months" }, { label: "A year" }, { label: "Open-ended" }],
      },

      // Everyone
      {
        ref: "priorities",
        type: "ranking",
        title: "Put these in order of what matters most to you",
        required: true,
        items: ["More leads or sales", "Brand awareness", "Website traffic", "Engagement with existing customers"],
      },
      {
        ref: "brief",
        type: "long_text",
        title: "Tell us about the product, the audience and anything you've already tried",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "budget",
        type: "single_select",
        title: "What budget range are you working with for our fees?",
        description: "Ad spend is separate, so leave it out of this number.",
        required: true,
        options: [
          { label: "Under $2k" },
          { label: "$2k–$5k" },
          { label: "$5k–$15k" },
          { label: "Over $15k" },
          { label: "Not sure, suggest something" },
        ],
      },
      {
        ref: "references",
        type: "file_upload",
        title: "Anything we should look at? Past campaigns, brand guides, examples you like.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
      },
      { ref: "phone", type: "phone", title: "A phone number, in case a quick call is easier", required: false },
    ],
    branches: [
      { when: "engagement", is: "A one-off campaign or project", then: "launch_date" },
      { when: "engagement", is: "Ongoing monthly support", then: "current_team" },
      { when: "engagement", is: "Not sure yet", then: "priorities" },
      { when: "campaign_length", always: true, then: "priorities" },
    ],
    ending: {
      title: "Got it, your estimate is on its way",
      body: "We'll review everything and send a proposal, or a couple of questions if something needs clearing up first.",
    },
    guide: {
      questionsToConsider: [
        "Which services do you actually sell, and should the list match your price sheet?",
        "Do you price retainers and one-off campaigns differently enough to need separate follow-ups?",
        "Do you want the client's ad spend asked separately from your own fee?",
        "Is there a minimum project size you'd rather state up front?",
      ],
      howToUseResponses:
        "Sort requests by engagement type first, since a retainer and a campaign need different proposals. Read the ranking before the service list: a client who ticked five services but ranked leads first probably needs one channel done well. Reply to anyone who chose 'Not sure, suggest something' with two or three options at different sizes rather than a single price.",
      customizeSteps: [
        "Replace the services list with the ones you offer, in the names you use on your own proposals.",
        "Adjust the budget ranges to match the size of work you take on, and keep an option for clients who want a suggestion.",
        "Put the link on your pricing or contact page, or embed it on your website, and check the dashboard each morning for new requests.",
      ],
      faqs: [
        {
          q: "What should a marketing quote form ask?",
          a: "The services needed, whether the work is one-off or ongoing, the goal, the timing and a budget range. Those five answers decide most of the price.",
        },
        {
          q: "Should I ask for a budget on a marketing quote form?",
          a: "Yes, as a range with an option to ask for a suggestion. It stops you writing a proposal the client can never afford, without forcing them to name a number.",
        },
        {
          q: "How do I separate ad spend from agency fees?",
          a: "Say so in the budget question. This form asks for the fee budget only, and you can add a second question for ad spend if you manage it.",
        },
        {
          q: "Can I embed this quote form on my agency website?",
          a: "Yes. Use this template copies it into your account, where you can edit every question and then share it as a link or embed it on your site.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "electrical-quote-form",
    type: "form",
    category: "quote",
    goals: ["generate-leads"],
    roles: ["operations", "sales"],
    searchName: "Electrical quote form",
    title: "Electrical quote",
    icon: "Zap",
    metaDescription:
      "Collect electrical job requests with the work type, property, access and photos. Anyone reporting sparks, burning or a shock is told to get urgent help instead.",
    description: "Get enough detail on an electrical job to price it or plan a visit.",
    blurb:
      "Written for electricians and small contracting firms. The first question checks for danger, and anyone describing sparks, burning or a shock is sent straight to urgent advice instead of a quote queue. Faults get asked how far the problem spreads; new work gets asked what and how much, and everyone is asked for photos of the fuse board.",
    tags: ["electrical quote", "electrician estimate", "electrical job request", "contractor", "branching"],
    greeting: "Need an electrician? Tell us about the job and we'll come back with a price or a time to look.",
    questions: [
      {
        ref: "danger",
        type: "yes_no",
        title: "First, a safety check: is anything sparking, smelling of burning, or has anyone had a shock?",
        required: true,
        yesLabel: "Yes, it has",
        noLabel: "No, nothing like that",
      },
      {
        ref: "work_type",
        type: "single_select",
        title: "What kind of work is it?",
        required: true,
        options: [
          { label: "Something isn't working" },
          { label: "New sockets, lights or circuits" },
          { label: "Rewire or fuse board upgrade" },
          { label: "EV charger installation" },
          { label: "Inspection or safety certificate" },
          { label: "Something else" },
        ],
      },

      // Faults
      {
        ref: "fault_details",
        type: "long_text",
        title: "What's happening, and when did it start?",
        description: "For example: a breaker keeps tripping, lights flicker, one socket is dead.",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "fault_scope",
        type: "single_select",
        title: "How much of the property is affected?",
        required: true,
        options: [
          { label: "One socket or light" },
          { label: "One room" },
          { label: "Several rooms" },
          { label: "The whole property" },
        ],
      },

      // New work
      {
        ref: "work_details",
        type: "long_text",
        title: "Describe the work: what you'd like, where, and how many of each",
        description: "For example: six downlights in the kitchen and two double sockets in the garage.",
        required: true,
        maxLength: 1500,
      },

      // Everyone
      {
        ref: "property_type",
        type: "single_select",
        title: "What kind of property is it?",
        required: true,
        options: [
          { label: "House" },
          { label: "Flat or apartment" },
          { label: "Office" },
          { label: "Shop, restaurant or other commercial space" },
          { label: "Industrial unit" },
        ],
      },
      {
        ref: "wiring_age",
        type: "single_select",
        title: "Roughly how old is the wiring?",
        description: "It helps us know what we might find behind the walls.",
        required: false,
        options: [{ label: "Less than 10 years" }, { label: "10 to 30 years" }, { label: "Over 30 years" }, { label: "No idea" }],
      },
      {
        ref: "photos",
        type: "file_upload",
        title: "Can you add photos of the fuse board and the area you need work on?",
        required: false,
        accept: ["image/*", "video/*"],
        maxFiles: 5,
      },
      {
        ref: "address",
        type: "address",
        title: "Where's the property?",
        required: true,
        fields: ["street", "city", "postal"],
      },
      {
        ref: "access",
        type: "long_text",
        title: "Anything we should know about getting in? Parking, keys, pets, a tenant to call first.",
        required: false,
        maxLength: 500,
      },
      { ref: "preferred_date", type: "date", title: "When would suit you for the work?", required: false, disablePast: true },
      {
        ref: "contact",
        type: "contact_info",
        title: "How do we reach you with the quote?",
        required: true,
        fields: ["first_name", "last_name", "phone", "email"],
      },
    ],
    branches: [
      { when: "danger", is: true, then: "end_urgent" },
      { when: "danger", is: false, then: "work_type" },
      { when: "work_type", is: "Something isn't working", then: "fault_details" },
      { when: "work_type", is: "New sockets, lights or circuits", then: "work_details" },
      { when: "work_type", is: "Rewire or fuse board upgrade", then: "work_details" },
      { when: "work_type", is: "EV charger installation", then: "work_details" },
      { when: "work_type", is: "Inspection or safety certificate", then: "property_type" },
      { when: "work_type", is: "Something else", then: "work_details" },
      { when: "fault_scope", always: true, then: "property_type" },
    ],
    ending: {
      title: "Thanks, we've got your job details",
      body: "We'll look through everything and send a price, or suggest a visit if we need to see it first.",
    },
    endings: [
      {
        ref: "end_urgent",
        title: "Please don't wait for a quote ⚠️",
        body: "If it's safe to do so, switch off the power at the main switch and keep people away. Then call our urgent line or your local emergency number straight away.",
      },
    ],
    guide: {
      questionsToConsider: [
        "What number should the urgent ending give for people reporting a dangerous fault?",
        "Which job types do you quote from photos, and which always need a site visit?",
        "Do you cover commercial properties, or only homes?",
        "Is there an area you don't travel beyond, and should the form say so?",
      ],
      howToUseResponses:
        "Check the fault scope and wiring age before anything else: a whole-property fault in older wiring is rarely a quick fix and usually needs a visit. Photos of the fuse board tell you a lot about what you'll find, so quote small new work straight from them when you can. Group requests by postcode to plan visits on the same day.",
      customizeSteps: [
        "Put your own urgent phone number in the safety ending, and test that path before you publish.",
        "Edit the work types to match what you do, such as solar, alarms or commercial fit-outs, and route each to the right follow-up.",
        "Share the link from your website, van signage or quote replies, and export requests to CSV if you plan jobs in a spreadsheet.",
      ],
      faqs: [
        {
          q: "What should an electrical quote form include?",
          a: "The type of work, a description with quantities, the property type, the address, photos and the customer's contact details. Asking about the age of the wiring helps spot jobs that need a visit.",
        },
        {
          q: "Can an electrician quote without a site visit?",
          a: "For small, clear jobs with good photos, often yes. Faults, rewires and older properties usually need someone to look first.",
        },
        {
          q: "Why does this form start with a safety question?",
          a: "Someone with sparking or a burning smell shouldn't be filling in a quote form. The first answer sends them to urgent advice before anything else.",
        },
        {
          q: "Can customers send photos through the form?",
          a: "Yes. The form has an upload question for pictures or a short video of the fuse board and the work area.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "freelance-quote-form",
    type: "form",
    category: "quote",
    goals: ["generate-leads", "onboard-clients"],
    roles: ["freelancers-agencies"],
    searchName: "Freelance quote form",
    title: "Freelance quote",
    icon: "Briefcase",
    metaDescription:
      "A quote form for freelancers: deliverables, where the work will be used, who signs it off, deadline and budget. Committee sign-offs name who has the final say.",
    description: "Everything a freelancer needs to price a project before the first call.",
    blurb:
      "For designers, writers, developers and other freelancers who quote project by project. It asks the things that quietly change a price, such as where the work will be used, whether the deadline is fixed and how many people sign it off, and when a client wants changes to something that already exists, it asks to see it. Work signed off by a committee also asks who settles disagreements, which is where revision rounds multiply.",
    tags: ["freelance quote", "project estimate", "freelancer", "client intake", "branching"],
    greeting: "Hi! Tell me about your project and I'll send you a quote.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 120 },
      { ref: "email", type: "email", title: "And the best email for the quote?", required: true },
      {
        ref: "builds_on_existing",
        type: "yes_no",
        title: "Does this build on work that already exists, like a site, a draft or an earlier design?",
        required: true,
        yesLabel: "Yes, there's something already",
        noLabel: "No, it's new",
      },
      {
        ref: "existing_link",
        type: "url",
        title: "Where can I see what exists now?",
        description: "A link to the site, file or document is perfect.",
        required: true,
      },
      {
        ref: "deliverables",
        type: "long_text",
        title: "What do you need made? List the pieces as you see them.",
        description: "For example: a homepage and three inner pages, or ten product descriptions.",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "usage",
        type: "multi_select",
        title: "Where will the work be used?",
        required: true,
        minSelections: 1,
        maxSelections: 6,
        options: [
          { label: "Website or app" },
          { label: "Social media" },
          { label: "Paid advertising" },
          { label: "Print" },
          { label: "Internal use only" },
          { label: "Resold or given to clients" },
        ],
      },
      {
        ref: "references",
        type: "long_text",
        title: "Any examples you like, or links I should look at?",
        required: false,
        maxLength: 800,
      },
      { ref: "deadline", type: "date", title: "When do you need it finished?", required: true, disablePast: true },
      {
        ref: "deadline_fixed",
        type: "yes_no",
        title: "Is that date fixed?",
        required: true,
        yesLabel: "Yes, it can't move",
        noLabel: "No, there's some room",
      },
      {
        ref: "approvers",
        type: "single_select",
        title: "Who will sign off on the work?",
        required: true,
        options: [{ label: "Just me" }, { label: "Me and one other person" }, { label: "A team or a committee" }],
      },
      {
        ref: "final_say",
        type: "short_text",
        title: "When the feedback disagrees, who has the final say?",
        description: "A name and role is enough. It tells me who to check with before each round.",
        required: true,
        maxLength: 160,
      },
      {
        ref: "budget",
        type: "single_select",
        title: "Do you have a budget in mind?",
        required: true,
        options: [
          { label: "Under $1,000" },
          { label: "$1,000–$3,000" },
          { label: "$3,000–$8,000" },
          { label: "Over $8,000" },
          { label: "I'd like your suggestion" },
        ],
      },
      {
        ref: "found_me",
        type: "single_select",
        title: "Last one: how did you find me?",
        required: false,
        allowOther: true,
        options: [{ label: "A referral" }, { label: "Search" }, { label: "Social media" }, { label: "My portfolio" }],
      },
    ],
    branches: [
      { when: "builds_on_existing", is: true, then: "existing_link" },
      { when: "builds_on_existing", is: false, then: "deliverables" },
      { when: "approvers", is: "A team or a committee", then: "final_say" },
      { when: "approvers", is: "Just me", then: "budget" },
      { when: "approvers", is: "Me and one other person", then: "budget" },
    ],
    ending: {
      title: "Thanks, that's everything I need",
      body: "I'll read it properly and send you a quote, with any questions I have, within two working days.",
    },
    guide: {
      questionsToConsider: [
        "Does the usage change your price, for example print or advertising rights?",
        "How many rounds of revisions are included, and should the form say so?",
        "Whose name do you need on the brief before you start: the person filling it in, or the person who approves it?",
        "What's the smallest project you'll quote for?",
      ],
      howToUseResponses:
        "Read the approvers answer before you price: work that a committee signs off usually takes more rounds than work one person approves, so build that into the quote and address the proposal to whoever has the final say. A fixed deadline that's close means a rush rate or a smaller scope. For anyone who asked for your suggestion on budget, send two options at different sizes and let them choose.",
      customizeSteps: [
        "Change the deliverables examples to the kind of work you do, so clients describe it in terms you can price.",
        "Set the budget ranges to fit your rates, and keep the option for clients who want a suggestion.",
        "Add the link to your portfolio, email signature and social bios, and check new requests in the dashboard.",
      ],
      faqs: [
        {
          q: "What should a freelance quote form include?",
          a: "What needs making, where it will be used, the deadline, who approves it and a budget range. Those answers change a price more than anything else.",
        },
        {
          q: "Should freelancers ask for a budget?",
          a: "Yes, as a range with an option to ask for your suggestion. It saves you quoting for work the client can't pay for.",
        },
        {
          q: "Why ask who signs off the work?",
          a: "More people approving means more feedback rounds. Knowing up front lets you price the revisions honestly.",
        },
        {
          q: "Can I put this quote form on my portfolio site?",
          a: "Yes. Use this template copies it into your account, where you can edit every question and then share a link or embed it on your site.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "graphic-design-quote-form",
    type: "form",
    category: "quote",
    goals: ["generate-leads", "onboard-clients"],
    roles: ["freelancers-agencies", "marketing"],
    searchName: "Graphic design quote form",
    title: "Graphic design quote",
    icon: "Palette",
    metaDescription:
      "Quote design work with the pieces, sizes, brand files, copy and print details up front. Clients with no brand yet get asked about the look they want instead.",
    description: "Scope a design job, from one flyer to a full identity, before quoting.",
    blurb:
      "For graphic designers and small studios. Clients with a brand are asked to upload it; clients without one are asked what feel they're after, so you know whether you're designing a flyer or a whole identity. Anything going to print is asked for sizes and quantities, which is where design quotes most often go wrong.",
    tags: ["graphic design quote", "design estimate", "design brief", "freelance designer", "branching"],
    greeting: "Looking for a designer? Tell me what you need and I'll put a quote together.",
    questions: [
      {
        ref: "contact",
        type: "contact_info",
        title: "Who am I talking to?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
      { ref: "company", type: "short_text", title: "What's the business or project called?", required: true, maxLength: 120 },
      {
        ref: "pieces",
        type: "multi_select",
        title: "What do you need designed?",
        required: true,
        minSelections: 1,
        maxSelections: 9,
        allowOther: true,
        options: [
          { label: "Logo" },
          { label: "Full brand identity" },
          { label: "Social media graphics" },
          { label: "Flyer or poster" },
          { label: "Brochure or booklet" },
          { label: "Packaging or labels" },
          { label: "Presentation deck" },
          { label: "Business cards" },
        ],
      },
      {
        ref: "quantity",
        type: "number",
        title: "Roughly how many separate designs or sizes is that in total?",
        description: "Count each size or version, so one post in three formats is three.",
        required: true,
        integerOnly: true,
        min: 1,
        max: 500,
      },
      {
        ref: "brand_assets",
        type: "single_select",
        title: "What brand material do you already have?",
        required: true,
        options: [
          { label: "Full brand guidelines" },
          { label: "A logo and colours, nothing formal" },
          { label: "Nothing yet" },
        ],
      },

      // Existing brand
      {
        ref: "brand_files",
        type: "file_upload",
        title: "Upload your logo files and any guidelines",
        required: false,
        accept: ["image/*", "application/pdf", "application/zip"],
        maxFiles: 5,
      },

      // No brand yet
      {
        ref: "style",
        type: "opinion_scale",
        title: "Where should the look sit between classic and modern?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Classic",
        labelHigh: "Modern",
      },
      {
        ref: "feel",
        type: "short_text",
        title: "Three words for how you want people to feel when they see it",
        required: false,
        maxLength: 120,
      },

      // Everyone
      {
        ref: "copy_ready",
        type: "single_select",
        title: "Is the text for the designs ready?",
        required: true,
        options: [{ label: "Yes, final copy is ready" }, { label: "I have a rough draft" }, { label: "I'll need help writing it" }],
      },
      {
        ref: "medium",
        type: "single_select",
        title: "Where will the designs be used?",
        required: true,
        options: [{ label: "Print only" }, { label: "Digital only" }, { label: "Both print and digital" }],
      },
      {
        ref: "print_specs",
        type: "long_text",
        title: "What sizes and quantities are being printed, and do you have a printer already?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "references",
        type: "long_text",
        title: "Share links to designs you like, or competitors you want to stand apart from",
        required: false,
        maxLength: 800,
      },
      { ref: "deadline", type: "date", title: "When do you need the final files?", required: true, disablePast: true },
      {
        ref: "budget",
        type: "single_select",
        title: "What budget range fits this project?",
        required: true,
        options: [
          { label: "Under $500" },
          { label: "$500–$2,000" },
          { label: "$2,000–$5,000" },
          { label: "Over $5,000" },
          { label: "Not sure, advise me" },
        ],
      },
    ],
    branches: [
      { when: "brand_assets", is: "Full brand guidelines", then: "brand_files" },
      { when: "brand_assets", is: "A logo and colours, nothing formal", then: "brand_files" },
      { when: "brand_assets", is: "Nothing yet", then: "style" },
      { when: "brand_files", always: true, then: "copy_ready" },
      { when: "medium", is: "Print only", then: "print_specs" },
      { when: "medium", is: "Both print and digital", then: "print_specs" },
      { when: "medium", is: "Digital only", then: "references" },
    ],
    ending: {
      title: "Thanks, I've got your brief ✏️",
      body: "I'll go through it and send a quote with what's included and how many rounds of changes it covers.",
    },
    guide: {
      questionsToConsider: [
        "How many revision rounds are included in your standard price?",
        "Do you handle print production, or hand over files only?",
        "Do you write copy, or should clients bring their own?",
        "Which file formats do you deliver by default?",
      ],
      howToUseResponses:
        "Price from the quantity and the brand answer together. Ten social graphics for a client with guidelines is production work, while one logo for a client with nothing yet is the start of an identity project and deserves a different quote. If the copy isn't ready, either add writing to the quote or make the deadline depend on receiving final text.",
      customizeSteps: [
        "Edit the list of design pieces to match what you offer, and remove the ones you don't take on.",
        "Change the budget ranges to fit your rates, and say in the ending how many revision rounds a quote includes.",
        "Link to the form from your portfolio and social profiles, and read the briefs in the dashboard.",
      ],
      faqs: [
        {
          q: "What should a graphic design quote form ask?",
          a: "What pieces are needed and how many sizes, what brand material exists, whether the copy is ready, where it will be used and the deadline. Budget as a range helps too.",
        },
        {
          q: "Why ask whether the copy is ready?",
          a: "Designing around placeholder text often means redoing layouts later. Knowing up front lets you quote for writing or set the schedule around the final text.",
        },
        {
          q: "How do I price print design differently?",
          a: "Print work needs exact sizes, bleed and often a proof check with the printer. This form asks print clients for sizes and quantities so you can include that time.",
        },
        {
          q: "Can clients upload their logo and brand files?",
          a: "Yes. Clients who already have a brand are asked to upload their logo and guidelines in the form.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "plumbing-quote-form",
    type: "form",
    category: "quote",
    goals: ["generate-leads"],
    roles: ["operations", "sales"],
    searchName: "Plumbing quote form",
    title: "Plumbing quote",
    icon: "Wrench",
    metaDescription:
      "Take plumbing job requests with the problem, property, photos and access in one chat. Active leaks get told to shut off the water and call, not wait for a quote.",
    description: "Understand a plumbing job before you quote it or book a visit.",
    blurb:
      "For plumbers and small plumbing firms. It opens with how urgent the job is, and anyone with water leaking right now is told to turn off the stopcock and call instead of joining the queue. Installations are asked who supplies the fittings, which is the question that most often changes the price.",
    tags: ["plumbing quote", "plumber estimate", "plumbing job request", "contractor", "branching"],
    greeting: "Plumbing problem or a new job? Tell us about it and we'll come back with a price.",
    questions: [
      {
        ref: "urgency",
        type: "single_select",
        title: "How urgent is it?",
        required: true,
        options: [
          { label: "Water is leaking or flooding right now" },
          { label: "Urgent, within a day or two" },
          { label: "In the next couple of weeks" },
          { label: "Just planning ahead" },
        ],
      },
      {
        ref: "job_type",
        type: "single_select",
        title: "What do you need help with?",
        required: true,
        options: [
          { label: "A leak or drip" },
          { label: "A blocked drain, sink or toilet" },
          { label: "No hot water or heating" },
          { label: "Fitting a new tap, toilet or appliance" },
          { label: "A new bathroom or kitchen" },
          { label: "Something else" },
        ],
      },

      // Installations
      {
        ref: "fittings",
        type: "single_select",
        title: "Who's supplying the fittings and fixtures?",
        required: true,
        options: [
          { label: "I've bought them already" },
          { label: "I'll buy them, I just need fitting" },
          { label: "I'd like you to supply them" },
          { label: "Not decided yet" },
        ],
      },

      // Everyone
      {
        ref: "description",
        type: "long_text",
        title: "Describe the job, including when the problem started if it's a repair",
        required: true,
        maxLength: 1500,
      },
      {
        ref: "property_type",
        type: "single_select",
        title: "What kind of property is it?",
        required: true,
        options: [
          { label: "House" },
          { label: "Flat or apartment" },
          { label: "Office" },
          { label: "Shop or restaurant" },
          { label: "Other commercial building" },
        ],
      },
      {
        ref: "owner",
        type: "single_select",
        title: "Are you the owner?",
        required: true,
        options: [{ label: "Yes, I own it" }, { label: "I'm a tenant" }, { label: "I manage it for someone else" }],
      },
      {
        ref: "photos",
        type: "file_upload",
        title: "Photos or a short video of the problem or the space help us quote faster",
        required: false,
        accept: ["image/*", "video/*"],
        maxFiles: 5,
      },
      {
        ref: "address",
        type: "address",
        title: "Where's the property?",
        required: true,
        fields: ["street", "city", "postal"],
      },
      {
        ref: "access",
        type: "multi_select",
        title: "When could we get in?",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [{ label: "Weekday mornings" }, { label: "Weekday afternoons" }, { label: "Evenings" }, { label: "Weekends" }],
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "How should we get back to you?",
        required: true,
        fields: ["first_name", "last_name", "phone", "email"],
      },
    ],
    branches: [
      { when: "urgency", is: "Water is leaking or flooding right now", then: "end_emergency" },
      { when: "urgency", is: "Urgent, within a day or two", then: "job_type" },
      { when: "urgency", is: "In the next couple of weeks", then: "job_type" },
      { when: "urgency", is: "Just planning ahead", then: "job_type" },
      { when: "job_type", is: "Fitting a new tap, toilet or appliance", then: "fittings" },
      { when: "job_type", is: "A new bathroom or kitchen", then: "fittings" },
      { when: "job_type", is: "A leak or drip", then: "description" },
      { when: "job_type", is: "A blocked drain, sink or toilet", then: "description" },
      { when: "job_type", is: "No hot water or heating", then: "description" },
      { when: "job_type", is: "Something else", then: "description" },
    ],
    ending: {
      title: "Thanks, we'll be in touch soon",
      body: "We'll look over your details and photos, then call or email with a price or a time to come and look.",
    },
    endings: [
      {
        ref: "end_emergency",
        title: "Turn off the water, then call us 🚰",
        body: "Shut off the water at the stopcock, usually under the kitchen sink or where the pipe comes into the building. If water is near electrics, keep clear of them. Then phone our emergency line so we can get someone out.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Do you offer an emergency call-out, and what number should the urgent ending give?",
        "Which jobs can you price from photos, and which always need a visit?",
        "Do you supply fittings, and do you charge differently when customers supply their own?",
        "Do you need the owner's permission before working for a tenant?",
      ],
      howToUseResponses:
        "Sort new requests by urgency, and reply to 'urgent' ones the same day. Simple jobs with clear photos, like a tap swap, can often be priced straight away. When a tenant fills it in, check who's paying and whether the landlord has agreed before you book. Use the access times to group visits in the same area.",
      customizeSteps: [
        "Add your emergency phone number to the urgent ending, or send that answer to your normal thank-you if you don't do call-outs.",
        "Edit the job types to match your services, such as boilers, drainage or commercial work.",
        "Put the link on your website and business listings, and export the requests to CSV if you plan the week in a spreadsheet.",
      ],
      faqs: [
        {
          q: "What should a plumbing quote form ask?",
          a: "How urgent it is, what the job is, a description, the property type, photos, the address and when you can get in. Asking who supplies fittings avoids surprises on installation jobs.",
        },
        {
          q: "Can a plumber give a quote from photos?",
          a: "Often for simple, visible jobs like replacing a tap or toilet. Hidden leaks, drainage and heating faults usually need a visit.",
        },
        {
          q: "What happens if someone has a leak right now?",
          a: "The first question catches it and sends them to an ending that tells them to turn off the water and phone you, instead of waiting for a reply.",
        },
        {
          q: "Why ask whether the customer owns the property?",
          a: "Tenants often need the landlord's permission, and the landlord may be the one paying. Knowing early saves a wasted visit.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "translation-quote-form",
    type: "form",
    category: "quote",
    goals: ["generate-leads", "onboard-clients"],
    roles: ["freelancers-agencies", "operations"],
    searchName: "Translation quote form",
    title: "Translation quote",
    icon: "Languages",
    metaDescription:
      "Price translation work from the language pair, word count, subject, file format and deadline. Documents for an official body get asked about certification.",
    description: "Collect everything a translator needs to price a document.",
    blurb:
      "For freelance translators and small agencies. It asks the details that set the rate: the language pair, the subject, the word count and whether the files are editable or scanned. Anything going to a court, embassy or government office is asked what kind of certified translation it needs, so nobody finds out too late.",
    tags: ["translation quote", "translator estimate", "certified translation", "language services", "branching"],
    greeting: "Need something translated? Tell us about it and we'll send you a quote.",
    questions: [
      {
        ref: "source_lang",
        type: "short_text",
        title: "What language is the original in?",
        required: true,
        maxLength: 60,
      },
      {
        ref: "target_lang",
        type: "short_text",
        title: "Which language or languages should it be translated into?",
        description: "If it's more than one, list them all.",
        required: true,
        maxLength: 200,
      },
      {
        ref: "subject",
        type: "single_select",
        title: "What kind of material is it?",
        required: true,
        options: [
          { label: "Personal documents, like certificates or IDs" },
          { label: "Legal or contracts" },
          { label: "Business or marketing" },
          { label: "Website or app" },
          { label: "Technical or medical" },
          { label: "Academic" },
        ],
      },
      {
        ref: "purpose",
        type: "single_select",
        title: "What will the translation be used for?",
        required: true,
        options: [
          { label: "Just to understand it" },
          { label: "Publishing to customers or readers" },
          { label: "Submitting to a court, embassy or government office" },
        ],
      },

      // Official submissions
      {
        ref: "certification",
        type: "single_select",
        title: "What does the receiving office ask for?",
        required: true,
        options: [
          { label: "A certified translation" },
          { label: "A sworn or notarised translation" },
          { label: "I'm not sure yet" },
        ],
      },
      {
        ref: "authority_country",
        type: "short_text",
        title: "Which country is it being submitted in?",
        description: "Rules for official translations differ from country to country.",
        required: true,
        maxLength: 80,
      },

      // Everyone
      {
        ref: "word_count",
        type: "number",
        title: "Roughly how many words is it?",
        description: "A guess is fine. If you only know the page count, allow about 250 words a page.",
        required: true,
        integerOnly: true,
        min: 1,
      },
      {
        ref: "format",
        type: "single_select",
        title: "What format are the files in?",
        required: true,
        options: [
          { label: "Word or another editable file" },
          { label: "PDF with selectable text" },
          { label: "Scans or photos" },
          { label: "Website or app files" },
        ],
      },
      {
        ref: "files",
        type: "file_upload",
        title: "Upload the documents so we can check them before quoting",
        required: false,
        accept: ["application/pdf", "image/*", ".doc", ".docx", ".txt", ".xlsx", ".pptx"],
        maxFiles: 10,
        maxSizeMB: 25,
      },
      {
        ref: "glossary",
        type: "yes_no",
        title: "Do you have a glossary or earlier translations we should match?",
        required: false,
      },
      { ref: "deadline", type: "date", title: "When do you need it back?", required: true, disablePast: true },
      {
        ref: "contact",
        type: "contact_info",
        title: "Where should we send the quote?",
        required: true,
        fields: ["first_name", "last_name", "email"],
      },
    ],
    branches: [
      { when: "purpose", is: "Submitting to a court, embassy or government office", then: "certification" },
      { when: "purpose", is: "Just to understand it", then: "word_count" },
      { when: "purpose", is: "Publishing to customers or readers", then: "word_count" },
    ],
    ending: {
      title: "Thanks, we'll check the files and send a quote",
      body: "We'll confirm the price, the delivery date and anything we need to clarify about the text.",
    },
    guide: {
      questionsToConsider: [
        "Which language pairs do you cover, and should the question list them?",
        "Do you offer certified or sworn translations, or refer those elsewhere?",
        "Do you charge per word, per page or per document?",
        "Do you add a fee for rush jobs or scanned files?",
      ],
      howToUseResponses:
        "Open the uploaded files before quoting, since the word count people guess is often off. Scanned documents and specialist subjects take longer, so price them accordingly. For official submissions, confirm the exact certification the receiving office wants before you start, because redoing a translation to a different standard costs the client twice.",
      customizeSteps: [
        "Swap the language questions for a dropdown if you only work in a few language pairs.",
        "Rename the subject areas to your specialisms, and remove the certification questions if you don't offer them.",
        "Link to the form from your website and email signature, and track requests and deadlines in the dashboard.",
      ],
      faqs: [
        {
          q: "What information is needed for a translation quote?",
          a: "The source and target languages, the word count, the subject, the file format, the deadline and what the translation is for. Seeing the file itself makes the quote accurate.",
        },
        {
          q: "What is the difference between a certified and a sworn translation?",
          a: "A certified translation comes with a signed statement from the translator that it is accurate. A sworn translation is done by a translator registered with a court or official body, and which one you need depends on the country and the office receiving it.",
        },
        {
          q: "Why does the file format matter for a translation quote?",
          a: "Editable files can be worked on directly, while scans often need the text retyped and the layout rebuilt. That extra time changes the price.",
        },
        {
          q: "Can clients upload documents in the quote form?",
          a: "Yes. There's an upload question for PDFs, Word files, spreadsheets and photos of the documents.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "quote-request",
    type: "form",
    category: "quote",
    goals: ["generate-leads", "onboard-clients"],
    roles: ["sales", "freelancers-agencies"],
    searchName: "Quote request form",
    title: "Quote request",
    icon: "FileText",
    metaDescription:
      "A quote request form that asks what the price depends on: new builds, redesigns and ongoing support each get their own questions, then budget and deadline.",
    description: "Scope a job well enough to price it without a call.",
    blurb:
      "Most quote forms collect a name and a vague description, then cost you a discovery call anyway. This one asks the questions the price actually depends on, and those depend on the job: a new build is scoped differently from a redesign, and ongoing support differently again. The first reply can be a number.",
    tags: ["quote request", "request a quote", "pricing", "services", "branching"],
    greeting: "Tell us what you need and we'll come back with a price.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 120 },
      { ref: "email", type: "email", title: "Where should we send the quote?", required: true },
      { ref: "company", type: "short_text", title: "Company, if there is one?", required: false, maxLength: 120 },
      {
        ref: "job_type",
        type: "single_select",
        title: "What kind of work is it?",
        required: true,
        options: [
          { label: "New build" },
          { label: "Redesign of something existing" },
          { label: "Ongoing support" },
          { label: "Something else" },
        ],
      },

      // New build
      {
        ref: "build_scale",
        type: "single_select",
        title: "Roughly how big is it?",
        required: true,
        options: [
          { label: "A single page or screen" },
          { label: "A handful of pages" },
          { label: "A full site or product" },
          { label: "I genuinely don't know" },
        ],
      },
      {
        ref: "build_has_design",
        type: "yes_no",
        title: "Is there a design already?",
        required: true,
        yesLabel: "Yes, it's ready",
        noLabel: "No, we'd need that too",
      },

      // Redesign
      { ref: "existing_url", type: "url", title: "Link to what exists now", required: true },
      {
        ref: "redesign_reason",
        type: "multi_select",
        title: "What's driving the change?",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "It looks dated" },
          { label: "It doesn't convert" },
          { label: "It's hard to maintain" },
          { label: "The business has changed" },
        ],
      },
      {
        ref: "keep_content",
        type: "yes_no",
        title: "Are you keeping the existing content?",
        required: false,
        yesLabel: "Mostly, yes",
        noLabel: "No, it's all being rewritten",
      },

      // Ongoing support
      {
        ref: "support_hours",
        type: "single_select",
        title: "How much help do you expect to need?",
        required: true,
        options: [
          { label: "A few hours a month" },
          { label: "A day or two a month" },
          { label: "A day a week" },
          { label: "More than that" },
        ],
      },
      {
        ref: "support_response",
        type: "single_select",
        title: "How fast do you need us to respond?",
        required: false,
        options: [{ label: "Same day" }, { label: "Within two days" }, { label: "Within a week" }],
      },

      // Everyone
      { ref: "job_description", type: "long_text", title: "Describe the job in your own words", required: true, maxLength: 1500 },
      {
        ref: "budget",
        type: "single_select",
        title: "What's your budget range?",
        description: "A range is fine. It tells us what's realistic.",
        required: true,
        options: [
          { label: "Under $5k" },
          { label: "$5k–$15k" },
          { label: "$15k–$50k" },
          { label: "$50k+" },
          { label: "I'd rather you suggest" },
        ],
      },
      { ref: "deadline", type: "date", title: "When would you like it finished?", required: false, disablePast: true },
      {
        ref: "attachments",
        type: "file_upload",
        title: "Anything to share? Briefs, drawings, screenshots.",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 5,
      },
    ],
    branches: [
      { when: "job_type", is: "New build", then: "build_scale" },
      { when: "job_type", is: "Redesign of something existing", then: "existing_url" },
      { when: "job_type", is: "Ongoing support", then: "support_hours" },
      { when: "job_type", is: "Something else", then: "job_description" },
      { when: "build_has_design", always: true, then: "job_description" },
      { when: "keep_content", always: true, then: "job_description" },
    ],
    ending: {
      title: "On it 📝",
      body: "You'll have a quote within two working days.",
    },
    guide: {
      questionsToConsider: [
        "What are the three or four kinds of job you quote most often?",
        "For each kind, which one or two answers change the price the most?",
        "Is there a budget below which you'd rather decline politely?",
        "How quickly can you promise a reply, and does the ending say so?",
      ],
      howToUseResponses:
        "Group requests by job type and price each group from its own answers: scale and design for new builds, the current link and reasons for redesigns, hours and response time for support. When the budget and the scope don't match, reply with what the budget does buy rather than a flat no. Keep the ending's reply promise, or change it to one you can keep.",
      customizeSteps: [
        "Rename the job types to the services you sell, and rewrite each arm's questions around what drives your price for that service.",
        "Set the budget ranges to the size of work you take on, and adjust the reply time in the ending.",
        "Put the link behind every 'Get a quote' button on your site, or embed it on your pricing page.",
      ],
      faqs: [
        {
          q: "What should a quote request form include?",
          a: "Contact details, the type of job, the details that affect price for that job, a description, a budget range and a deadline. Anything that doesn't change your price can wait until the call.",
        },
        {
          q: "How is a quote request different from a contact form?",
          a: "A contact form starts a conversation. A quote request collects enough scope that your first reply can be a price instead of a list of questions.",
        },
        {
          q: "Can the form ask different questions for different jobs?",
          a: "Yes. This template uses branching, so a new build, a redesign and ongoing support each get their own follow-ups before everyone rejoins for budget and deadline.",
        },
        {
          q: "Can I export quote requests?",
          a: "Yes. Every request lands in your dashboard, and you can export them to CSV.",
        },
      ],
    },
  }),
];
