import { defineTemplate, type TemplateSeed } from "../define.js";

export const FORM_FEEDBACK_2: TemplateSeed[] = [
  defineTemplate({
    slug: "website-design-feedback-form",
    type: "form",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["freelancers-agencies", "product-research", "marketing"],
    searchName: "Website design feedback form",
    title: "Website design feedback",
    icon: "Laptop",
    metaDescription:
      "Get usable feedback on a website design: first impression, readability, navigation and the changes that matter most, with a call offered to talk them over.",
    description: "Structured comments on a page design, ranked by what should change first.",
    blurb:
      "Built for design reviews that usually end in a messy email thread. Reviewers who can't tell what the page is for are asked what confused them, everyone ranks what should change first, and anyone who wants to talk it through leaves an email and lands on their own ending.",
    tags: ["website feedback", "design review", "web design", "client review", "usability feedback"],
    greeting: "Thanks for looking over the new design. A few quick questions and your comments will be in one tidy place.",
    questions: [
      {
        ref: "page_url",
        type: "url",
        title: "Which page are you reviewing?",
        description: "Paste the link to the page or the design preview.",
        required: true,
      },
      {
        ref: "reviewer_role",
        type: "single_select",
        title: "Which best describes you?",
        required: true,
        options: [
          { label: "The client or a stakeholder" },
          { label: "Someone on the project team" },
          { label: "A potential visitor or customer" },
        ],
        allowOther: true,
      },
      {
        ref: "first_impression",
        type: "opinion_scale",
        title: "What was your first impression of the page?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "Put me off",
        labelHigh: "Loved it",
      },
      {
        ref: "purpose_clear",
        type: "yes_no",
        title: "Within a few seconds, could you tell what this page is for?",
        required: true,
      },
      {
        ref: "purpose_confusion",
        type: "long_text",
        title: "What did you think it was for, and what threw you off?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How does the design do on each of these?",
        required: true,
        rows: ["Look and feel", "Readability of the text", "Navigation and menus", "Layout on a phone", "How fast it loads"],
        columns: ["Needs work", "Okay", "Good", "Great"],
      },
      {
        ref: "find_info",
        type: "single_select",
        title: "How easy was it to find what you were looking for?",
        required: true,
        options: [{ label: "Very easy" }, { label: "Took a moment" }, { label: "I couldn't find it" }],
      },
      {
        ref: "change_order",
        type: "ranking",
        title: "Put these in order of what should change first.",
        required: false,
        items: ["Headlines and copy", "Layout and spacing", "Colours and fonts", "Images", "Navigation"],
      },
      {
        ref: "specific_changes",
        type: "long_text",
        title: "Which specific changes would you like to see?",
        description: "Point to the section if you can, for example \"the pricing table\" or \"the footer\".",
        required: false,
        maxLength: 1500,
      },
      {
        ref: "screenshot",
        type: "file_upload",
        title: "Want to attach a marked-up screenshot?",
        required: false,
        accept: ["image/*", "application/pdf"],
        maxFiles: 3,
        maxSizeMB: 10,
      },
      {
        ref: "discuss",
        type: "yes_no",
        title: "Would you like a call to talk the changes through?",
        required: true,
        yesLabel: "Yes, let's talk",
        noLabel: "No, this covers it",
      },
      {
        ref: "call_email",
        type: "email",
        title: "What's the best email to arrange that?",
        required: true,
      },
    ],
    branches: [
      { when: "purpose_clear", is: true, then: "aspects" },
      { when: "purpose_clear", is: false, then: "purpose_confusion" },
      { when: "discuss", is: false, then: "end_thanks" },
      { when: "discuss", is: true, then: "call_email" },
      { when: "call_email", always: true, then: "end_call" },
    ],
    ending: {
      title: "Thanks for the review",
      body: "Your comments go straight to the designer, and you'll see the changes in the next round.",
    },
    endings: [
      {
        ref: "end_call",
        title: "Let's talk it through 📞",
        body: "We'll email you to find a time, and bring your notes to the call.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Are you reviewing one page or the whole site, and should reviewers name the page each time?",
        "Which parts of the design are still open to change, and which are already signed off?",
        "Do you want feedback from real visitors as well as stakeholders, and should their answers be read separately?",
        "Who decides between conflicting comments when two reviewers want opposite things?",
      ],
      howToUseResponses:
        "Group the answers by reviewer type before reading them, because a stakeholder and a first-time visitor are judging different things. Start with anyone who could not tell what the page is for: that is a message problem, and no amount of polish fixes it. Use the ranking to agree the order of work, and treat the specific change requests as a checklist for the next round.",
      customizeSteps: [
        "Rename the rows in the rating grid to the parts of your design that are genuinely up for review.",
        "Prefill the page link with a hidden field when you send one link per page, so reviewers skip the first question.",
        "Share the link along with the preview, and set a date by which you need the comments.",
      ],
      faqs: [
        {
          q: "What should a website design feedback form ask?",
          a: "Whether the page's purpose is clear, how readable and easy to navigate it is, and which specific changes the reviewer wants. Asking reviewers to rank changes stops every comment from looking equally urgent.",
        },
        {
          q: "How do I get useful feedback on a website design?",
          a: "Ask specific questions about purpose, readability and navigation instead of \"what do you think?\", and ask reviewers to point to the section they mean. A screenshot upload helps too.",
        },
        {
          q: "Can clients attach screenshots with their feedback?",
          a: "Yes. The form has an optional upload for images or a PDF, so a reviewer can mark up the design and send it along with their answers.",
        },
        {
          q: "Can I share this form with people outside my team?",
          a: "Yes. Share it as a link or embed it on a page, and every response lands in your dashboard, where you can also export it to CSV.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "call-center-employee-evaluation-form",
    type: "form",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["customer-success", "operations", "hr-people"],
    searchName: "Call center employee evaluation form",
    title: "Call review",
    icon: "Phone",
    metaDescription:
      "Score a customer call the same way every time: greeting, listening, accuracy, tone and resolution, with a coaching plan for weak calls and praise for strong ones.",
    description: "A consistent call review that turns each score into coaching or recognition.",
    blurb:
      "A call review for team leads and QA reviewers that sticks to what can be heard on the recording. A low overall score opens a short coaching plan with a follow-up date, a strong one asks what the agent did well and whether the call belongs in training, and unresolved calls are asked what got in the way.",
    tags: ["call center evaluation", "call quality monitoring", "QA scorecard", "agent review", "contact center"],
    greeting: "Let's review a call. Have the recording or transcript open while you go.",
    questions: [
      { ref: "agent_name", type: "short_text", title: "Which agent took the call?", required: true, maxLength: 120 },
      { ref: "call_date", type: "date", title: "When was the call?", required: true },
      { ref: "call_id", type: "short_text", title: "What's the call or ticket ID?", required: false, maxLength: 60 },
      {
        ref: "call_type",
        type: "dropdown",
        title: "What was the call about?",
        required: true,
        options: [
          { label: "Billing question" },
          { label: "Technical support" },
          { label: "Complaint" },
          { label: "New order or booking" },
          { label: "Cancellation request" },
          { label: "Something else" },
        ],
      },
      {
        ref: "behaviours",
        type: "matrix",
        title: "How did the agent do on each part of the call?",
        required: true,
        rows: [
          "Greeting and identifying the customer",
          "Listening without interrupting",
          "Giving accurate information",
          "Tone and courtesy",
          "Following the process and compliance steps",
          "Closing with clear next steps",
        ],
        columns: ["Below standard", "Meets standard", "Above standard"],
      },
      {
        ref: "resolution",
        type: "single_select",
        title: "How was the customer's issue handled?",
        required: true,
        options: [
          { label: "Resolved on the call" },
          { label: "Escalated to the right place" },
          { label: "Left unresolved" },
        ],
      },
      {
        ref: "what_blocked",
        type: "long_text",
        title: "What stopped it being resolved?",
        description: "Say whether it was the agent, a missing tool or a policy.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how well was this call handled?",
        required: true,
        scale: 5,
      },

      // Weak calls
      {
        ref: "coaching_focus",
        type: "multi_select",
        title: "What should coaching focus on?",
        required: true,
        minSelections: 1,
        maxSelections: 3,
        options: [
          { label: "Product knowledge" },
          { label: "Active listening" },
          { label: "Tone and empathy" },
          { label: "Following the process" },
          { label: "Handling an upset customer" },
          { label: "Call control and timing" },
        ],
      },
      {
        ref: "review_date",
        type: "date",
        title: "When will you review another of their calls?",
        required: true,
        disablePast: true,
      },

      // Strong calls
      {
        ref: "strengths",
        type: "long_text",
        title: "What did the agent do especially well?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "training_example",
        type: "yes_no",
        title: "Would this call make a good example for training?",
        required: false,
      },

      // Everyone
      {
        ref: "notes",
        type: "long_text",
        title: "Anything else the agent should hear about this call?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "discussed",
        type: "yes_no",
        title: "Have you gone through this review with the agent yet?",
        required: true,
        yesLabel: "Yes",
        noLabel: "Not yet",
      },
    ],
    branches: [
      { when: "resolution", is: "Resolved on the call", then: "overall" },
      { when: "resolution", is: "Escalated to the right place", then: "overall" },
      { when: "resolution", is: "Left unresolved", then: "what_blocked" },
      { when: "overall", op: "lte", is: 2, then: "coaching_focus" },
      { when: "overall", op: "gte", is: 3, then: "strengths" },
      { when: "review_date", always: true, then: "notes" },
    ],
    ending: {
      title: "Review saved",
      body: "Share it with the agent while the call is still fresh for both of you.",
    },
    guide: {
      questionsToConsider: [
        "Which steps on your calls are compulsory, such as identity checks or a recorded disclosure, and should they get their own row?",
        "What score counts as a weak call on your team, and should it trigger coaching at 2 or at 3?",
        "How many calls per agent will you review each month so the scores are fair?",
        "Should agents see the review before or during the one-to-one?",
      ],
      howToUseResponses:
        "Export the reviews to CSV and look at each agent across several calls, never one, since a single bad call is often a hard customer. Compare the grid rows across the whole team to spot gaps that need group training rather than individual coaching. Put the follow-up dates from weak calls in your calendar, and pass the calls marked as training examples to whoever runs onboarding.",
      customizeSteps: [
        "Rewrite the grid rows to match your own call standards, keeping each one something a reviewer can actually hear.",
        "Replace the call types in the dropdown with the queues or reasons your team uses.",
        "Bookmark the link for reviewers, or embed it on your internal QA page so it sits next to the recordings.",
      ],
      faqs: [
        {
          q: "What should a call center evaluation form include?",
          a: "The agent, the call details, scores for observable behaviour such as greeting, listening, accuracy and closing, and how the issue was resolved. A short coaching note makes the score something the agent can act on.",
        },
        {
          q: "How do you evaluate a call center agent fairly?",
          a: "Score what you can hear on the recording rather than impressions, use the same criteria every time, and review several calls before drawing conclusions.",
        },
        {
          q: "How often should call quality be reviewed?",
          a: "Often enough to see a pattern for each agent. Many teams review a handful of calls per agent each month, with more for new starters.",
        },
        {
          q: "Can several reviewers use the same form?",
          a: "Yes. Share one link with every reviewer and all the reviews land in the same dashboard, where you can filter them by agent.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "restaurant-feedback-form",
    type: "form",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["customer-success", "operations", "marketing"],
    searchName: "Restaurant feedback form",
    title: "Restaurant feedback",
    icon: "Utensils",
    metaDescription:
      "Ask diners about the food, service and value after a visit. Unhappy guests can ask the manager to get in touch, and happy ones tell you the dish they'd order again.",
    description: "Hear what diners thought of the meal, and reach the unhappy ones quickly.",
    blurb:
      "A short post-visit form that works for dine-in, takeaway and delivery. Guests who rate the visit three stars or less are asked what went wrong and can leave their details for the manager, while happy guests name the dish they'd come back for, which is exactly what you want to feature.",
    tags: ["restaurant feedback", "diner survey", "guest feedback", "customer comment card", "hospitality"],
    greeting: "Thanks for eating with us. How was it? This takes about a minute.",
    questions: [
      {
        ref: "visit_type",
        type: "single_select",
        title: "How did you eat with us?",
        required: true,
        options: [{ label: "Dined in" }, { label: "Takeaway" }, { label: "Delivery" }],
      },
      { ref: "visit_date", type: "date", title: "When was your visit?", required: false },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each of these?",
        required: true,
        rows: ["Taste of the food", "Portion size", "Friendliness of the staff", "Waiting time", "Cleanliness and presentation", "Value for money"],
        columns: ["Poor", "Okay", "Good", "Excellent"],
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how was your visit?",
        required: true,
        scale: 5,
      },

      // Unhappy diners
      {
        ref: "what_went_wrong",
        type: "long_text",
        title: "Sorry it wasn't better. What went wrong?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "manager_contact",
        type: "yes_no",
        title: "Would you like the manager to get in touch?",
        required: true,
        yesLabel: "Yes please",
        noLabel: "No need",
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "How can the manager reach you?",
        required: true,
        fields: ["first_name", "email", "phone"],
      },

      // Happy diners
      {
        ref: "favourite_dish",
        type: "short_text",
        title: "Which dish would you order again?",
        required: false,
        maxLength: 150,
      },

      // Everyone else
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend us to a friend?",
        required: true,
      },
      {
        ref: "suggestion",
        type: "long_text",
        title: "One thing we could do to make your next visit better?",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "overall", op: "lte", is: 3, then: "what_went_wrong" },
      { when: "overall", op: "gte", is: 4, then: "favourite_dish" },
      { when: "manager_contact", is: false, then: "recommend" },
      { when: "manager_contact", is: true, then: "contact" },
      { when: "contact", always: true, then: "end_callback" },
    ],
    ending: {
      title: "Thank you, see you soon 🍽️",
      body: "The kitchen and the floor team both read these.",
    },
    endings: [
      {
        ref: "end_callback",
        title: "We're sorry, and we'll be in touch",
        body: "The manager has your details and will contact you shortly to put this right.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Do you want separate questions for delivery orders, where the packaging and driver matter more than the room?",
        "Who calls back an unhappy guest, and how quickly can they do it?",
        "Will you print a QR code on the bill or receipt so guests answer before they leave?",
        "Would asking which dish they ordered help the kitchen more than a star rating?",
      ],
      howToUseResponses:
        "Treat every guest who asked for the manager as a same-day call: a fast apology often turns a bad night into a return visit. Read the grid each week and look for one row that keeps dipping, such as waiting time on weekends. Share the dishes people would order again with the kitchen, and use them on your menu and social posts.",
      customizeSteps: [
        "Add your own dishes or menu sections if you want feedback on specific plates.",
        "Put the link in a QR code on the bill, receipt or delivery bag.",
        "Change the unhappy ending so it names who will call and when.",
      ],
      faqs: [
        {
          q: "What questions should a restaurant feedback form ask?",
          a: "An overall rating, scores for food, service, waiting time, cleanliness and value, and an open question about what to improve. A way for unhappy guests to ask for a call back is worth adding.",
        },
        {
          q: "When is the best time to ask diners for feedback?",
          a: "At the end of the meal or within a day of the visit. A QR code on the bill catches guests while the meal is still easy to recall.",
        },
        {
          q: "How do I handle negative restaurant feedback?",
          a: "Reply quickly and personally. This form asks unhappy guests whether they want the manager to contact them, so you know who is expecting a call.",
        },
        {
          q: "Can I use this for takeaway and delivery too?",
          a: "Yes. The first question asks how they ate with you, so you can filter responses by dine-in, takeaway and delivery in the dashboard.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "retail-store-feedback-form",
    type: "form",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["customer-success", "operations"],
    searchName: "Retail store feedback form",
    title: "Store visit feedback",
    icon: "Store",
    metaDescription:
      "Find out how a shop visit went: finding products, help from staff and the wait at checkout. Shoppers who leave empty-handed say what they came for.",
    description: "What shoppers found, who helped and how checkout went, from the shop floor.",
    blurb:
      "A store feedback form that covers the three places a visit goes wrong: finding the product, getting help and paying. Shoppers who couldn't find what they came for are asked what it was, and anyone who scores the visit low can ask the store manager to follow up.",
    tags: ["retail feedback", "store survey", "in-store experience", "shopper feedback", "customer satisfaction"],
    greeting: "Thanks for shopping with us. Tell us how your visit went, it takes about a minute.",
    questions: [
      { ref: "store", type: "short_text", title: "Which store did you visit?", required: true, maxLength: 120 },
      {
        ref: "visit_reason",
        type: "single_select",
        title: "What brought you in today?",
        required: true,
        options: [
          { label: "To buy something specific" },
          { label: "Just browsing" },
          { label: "A return or exchange" },
          { label: "Collecting an online order" },
        ],
      },
      {
        ref: "found_it",
        type: "single_select",
        title: "Did you find what you were looking for?",
        required: true,
        options: [{ label: "Yes, easily" }, { label: "Yes, after some searching" }, { label: "No" }],
      },
      {
        ref: "missing_item",
        type: "short_text",
        title: "What were you hoping to find?",
        required: true,
        maxLength: 200,
      },
      {
        ref: "staff_help",
        type: "single_select",
        title: "How was help from our staff?",
        required: true,
        options: [
          { label: "Someone helped me and it was useful" },
          { label: "Someone helped, but it didn't solve much" },
          { label: "I wanted help but couldn't find anyone" },
          { label: "I didn't need any help" },
        ],
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate the store on these?",
        required: true,
        rows: ["Layout and signs", "Products in stock", "Staff knowledge", "Cleanliness and tidiness", "Prices"],
        columns: ["Poor", "Okay", "Good", "Great"],
      },
      {
        ref: "checkout_wait",
        type: "single_select",
        title: "How long did you wait at checkout?",
        required: false,
        options: [
          { label: "Under 2 minutes" },
          { label: "2–5 minutes" },
          { label: "5–10 minutes" },
          { label: "Over 10 minutes" },
          { label: "I didn't buy anything" },
        ],
      },
      {
        ref: "satisfaction",
        type: "rating",
        title: "Overall, how satisfied are you with your visit?",
        required: true,
        scale: 5,
      },

      // Low scores
      {
        ref: "manager_contact",
        type: "yes_no",
        title: "Would you like the store manager to follow up with you?",
        required: true,
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "How can they reach you?",
        required: true,
        fields: ["first_name", "email", "phone"],
      },

      // Everyone
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend this store to a friend?",
        required: true,
      },
      {
        ref: "one_change",
        type: "long_text",
        title: "If you could change one thing about this store, what would it be?",
        required: false,
        maxLength: 600,
      },
    ],
    branches: [
      { when: "visit_reason", is: "To buy something specific", then: "found_it" },
      { when: "visit_reason", is: "Just browsing", then: "staff_help" },
      { when: "visit_reason", is: "A return or exchange", then: "staff_help" },
      { when: "visit_reason", is: "Collecting an online order", then: "staff_help" },
      { when: "found_it", is: "No", then: "missing_item" },
      { when: "found_it", is: "Yes, easily", then: "staff_help" },
      { when: "found_it", is: "Yes, after some searching", then: "staff_help" },
      { when: "satisfaction", op: "lte", is: 2, then: "manager_contact" },
      { when: "satisfaction", op: "gte", is: 3, then: "recommend" },
      { when: "manager_contact", is: false, then: "recommend" },
    ],
    ending: {
      title: "Thanks for your feedback 🛍️",
      body: "The store team reads every answer, and we use them to decide what to fix first.",
    },
    guide: {
      questionsToConsider: [
        "Should the store be a dropdown of your locations rather than a typed answer?",
        "Which part of the visit are you trying to improve right now: stock, staffing or queues?",
        "Do you want to hear from browsers as well as buyers, or only from people who paid?",
        "Who follows up when a shopper asks the manager to get in touch?",
      ],
      howToUseResponses:
        "Collect the items shoppers couldn't find into one list each week and send it to whoever orders stock, because it is demand you are currently turning away. Compare staff help and checkout waits by store and by day to see where the rota is thin. Call back anyone who asked within a day, and look at the one change question for ideas that come up more than once.",
      customizeSteps: [
        "Swap the store question for a dropdown of your locations, or prefill it with a hidden field per store.",
        "Print the link as a QR code on receipts and at the till.",
        "Edit the grid rows to cover what your stores are judged on, such as fitting rooms or parking.",
      ],
      faqs: [
        {
          q: "What should a retail store feedback form ask?",
          a: "Whether shoppers found what they wanted, how helpful the staff were, how long checkout took and how satisfied they were overall. Asking what they couldn't find is one of the most useful questions a store can ask.",
        },
        {
          q: "How do I get shoppers to fill in a feedback form?",
          a: "Keep it short and put a QR code where people wait or pay, such as on the receipt or at the till. One question at a time on a phone feels quick.",
        },
        {
          q: "Can I use one form for several store locations?",
          a: "Yes. The first question asks which store they visited, and you can filter the responses by store in the dashboard or export them to CSV.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "coaching-feedback-form",
    type: "form",
    category: "feedback",
    goals: ["collect-feedback"],
    roles: ["freelancers-agencies", "education", "hr-people"],
    searchName: "Coaching feedback form",
    title: "Coaching feedback",
    icon: "Compass",
    metaDescription:
      "Ask coaching clients what's working: progress on their goal, which exercises help and what would make the next session more useful. Promoters are asked for a quote.",
    description: "Check in with coaching clients on progress, and shape the next session around it.",
    blurb:
      "A mid-programme check-in for coaches, not an end-of-course survey. Clients who say coaching isn't giving them what they hoped for are asked what's missing and whether to talk before the next session, and those who would strongly recommend you are asked for a testimonial.",
    tags: ["coaching feedback", "coaching evaluation", "client check-in", "life coaching", "executive coaching"],
    greeting: "Thanks for taking a few minutes. Your answers shape how we spend our next sessions.",
    questions: [
      { ref: "client_name", type: "short_text", title: "What's your first name?", required: true, maxLength: 80 },
      {
        ref: "goal",
        type: "short_text",
        title: "What's the main goal you're working on with me?",
        required: true,
        maxLength: 200,
      },
      {
        ref: "sessions_so_far",
        type: "single_select",
        title: "How many sessions have we had so far?",
        required: true,
        options: [{ label: "1" }, { label: "2–5" }, { label: "6–10" }, { label: "More than 10" }],
      },
      {
        ref: "progress",
        type: "opinion_scale",
        title: "How much progress have you made toward that goal?",
        required: true,
        steps: 10,
        startAt: 1,
        labelLow: "None yet",
        labelHigh: "A lot",
      },
      {
        ref: "useful_parts",
        type: "multi_select",
        title: "Which parts of our work have helped most?",
        required: true,
        minSelections: 1,
        maxSelections: 3,
        options: [
          { label: "Setting clear goals" },
          { label: "Accountability check-ins" },
          { label: "Exercises between sessions" },
          { label: "Being challenged honestly" },
          { label: "Reflection questions" },
          { label: "Practical tools and frameworks" },
        ],
        allowOther: true,
      },
      {
        ref: "session_quality",
        type: "matrix",
        title: "How much do you agree with each of these?",
        required: true,
        rows: [
          "I leave sessions with clear next steps",
          "We focus on what matters most to me",
          "I feel comfortable being honest",
          "The pace feels right",
        ],
        columns: ["Disagree", "Not sure", "Agree"],
      },
      {
        ref: "on_track",
        type: "yes_no",
        title: "Is coaching giving you what you hoped for?",
        required: true,
      },
      {
        ref: "whats_missing",
        type: "long_text",
        title: "What's missing, or what did you expect that hasn't happened?",
        required: true,
        maxLength: 1000,
      },
      {
        ref: "talk_first",
        type: "yes_no",
        title: "Would you like a short call about this before our next session?",
        required: true,
      },
      {
        ref: "next_session",
        type: "long_text",
        title: "What would make the next session more relevant for you?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "format_change",
        type: "single_select",
        title: "Would you change anything about the format?",
        required: false,
        options: [
          { label: "Keep it as it is" },
          { label: "More structure" },
          { label: "More open conversation" },
          { label: "More work between sessions" },
          { label: "Less work between sessions" },
        ],
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend my coaching to a friend or colleague?",
        required: true,
      },
      {
        ref: "testimonial",
        type: "long_text",
        title: "What would you tell someone thinking about working with me?",
        description: "A sentence or two is plenty.",
        required: true,
        maxLength: 600,
      },
      {
        ref: "quote_ok",
        type: "yes_no",
        title: "May I share that on my website, with your first name?",
        required: true,
      },
    ],
    branches: [
      { when: "on_track", is: true, then: "next_session" },
      { when: "on_track", is: false, then: "whats_missing" },
      { when: "recommend", op: "lte", is: 8, then: "end_thanks" },
      { when: "recommend", op: "gte", is: 9, then: "testimonial" },
    ],
    ending: {
      title: "Thank you 🙏",
      body: "I'll read this before our next session and bring what you said into it.",
    },
    guide: {
      questionsToConsider: [
        "At which point in the programme will you send it: after session three, halfway, or at the end?",
        "Do you want the client's goal in their own words, or will you prefill it from your intake notes?",
        "Which of your methods do you want rated, so the list of useful parts matches what you actually do?",
        "How will you use testimonials, and do clients in your field prefer to stay anonymous?",
      ],
      howToUseResponses:
        "Read each client's answers just before their next session and open by naming one thing they said. A low progress score with a high agreement grid usually means the goal needs resetting, not the coaching style. Book the call for anyone who asked for one before the next session, and across all clients look at which parts they find useful so you know where to spend session time.",
      customizeSteps: [
        "Edit the list of useful parts to match your own methods and exercises.",
        "Change the wording from \"me\" to \"us\" if you coach as a team or practice.",
        "Send the link after a set number of sessions, and again near the end to compare progress.",
      ],
      faqs: [
        {
          q: "What should I ask in a coaching feedback form?",
          a: "Ask about progress toward the client's goal, which parts of the coaching help, whether sessions feel focused and safe, and what would make the next one more useful.",
        },
        {
          q: "When should coaches ask clients for feedback?",
          a: "Part way through, not only at the end. A check-in after a few sessions gives you time to adjust while the client is still working with you.",
        },
        {
          q: "How do I get testimonials from coaching clients?",
          a: "Ask the clients who would strongly recommend you, and ask permission before publishing. This form only asks for a quote when the recommendation score is 9 or 10.",
        },
        {
          q: "Can clients answer anonymously?",
          a: "This version asks for a first name, so you know who wants a call before the next session and whose quote you are sharing. For group coaching you can delete the name question and the call offer to make it anonymous.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "presentation-feedback-form",
    type: "form",
    category: "feedback",
    goals: ["collect-feedback", "run-events"],
    roles: ["education", "marketing", "hr-people"],
    searchName: "Presentation feedback form",
    title: "Presentation feedback",
    icon: "MonitorPlay",
    metaDescription:
      "Get honest comments after a talk: was the message clear, the structure easy to follow and the pace right? Listeners also restate the main point in their own words.",
    description: "Find out whether your talk landed, in the audience's own words.",
    blurb:
      "Starts with the most honest test of a talk: asking the listener to sum up the main point in a sentence. It then rates structure, examples, slides and pace, and asks lower scorers what would have helped most and higher scorers what worked best.",
    tags: ["presentation feedback", "speaker feedback", "talk evaluation", "public speaking", "audience feedback"],
    greeting: "Thanks for listening. A couple of minutes of honest feedback helps the next talk a lot.",
    questions: [
      { ref: "talk", type: "short_text", title: "Which talk or session are you giving feedback on?", required: true, maxLength: 150 },
      {
        ref: "familiarity",
        type: "single_select",
        title: "How well did you know the topic beforehand?",
        required: true,
        options: [{ label: "It was new to me" }, { label: "I knew a bit" }, { label: "I know it well" }],
      },
      {
        ref: "main_point",
        type: "short_text",
        title: "In one sentence, what was the main point?",
        required: true,
        maxLength: 300,
      },
      {
        ref: "aspects",
        type: "matrix",
        title: "How would you rate each of these?",
        required: true,
        rows: [
          "Clarity of the main message",
          "Structure that was easy to follow",
          "Examples that supported the points",
          "Slides and visuals",
          "Delivery and confidence",
          "Time for questions",
        ],
        columns: ["Poor", "Okay", "Good", "Excellent"],
      },
      {
        ref: "pace",
        type: "single_select",
        title: "How was the pace?",
        required: true,
        options: [{ label: "Too slow" }, { label: "About right" }, { label: "Too fast" }],
      },
      {
        ref: "level",
        type: "opinion_scale",
        title: "How was the level of detail for you?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Too basic",
        labelHigh: "Too advanced",
      },
      {
        ref: "overall",
        type: "rating",
        title: "Overall, how useful was the talk?",
        required: true,
        scale: 5,
      },
      {
        ref: "would_help",
        type: "long_text",
        title: "What would have made it more useful for you?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "worked_best",
        type: "long_text",
        title: "What worked best? A moment, an example or a slide.",
        required: false,
        maxLength: 800,
      },
      {
        ref: "takeaway",
        type: "long_text",
        title: "Is there anything you'll do differently after this talk?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "slides_email",
        type: "email",
        title: "Leave your email if you'd like the slides.",
        required: false,
      },
    ],
    branches: [
      { when: "overall", op: "lte", is: 3, then: "would_help" },
      { when: "overall", op: "gte", is: 4, then: "worked_best" },
      { when: "would_help", always: true, then: "takeaway" },
    ],
    ending: {
      title: "Thank you for the feedback 🎤",
      body: "Every answer is read before the next version of this talk.",
    },
    guide: {
      questionsToConsider: [
        "Is this for one talk or a whole event, and should the talk be a dropdown of sessions?",
        "What did you want people to take away, so you can compare it with the one-sentence answers?",
        "Do you want feedback on your delivery as a speaker, or only on the content?",
        "Will you share the slides afterwards, and is the email question worth keeping if not?",
      ],
      howToUseResponses:
        "Start with the one-sentence summaries and compare them with the message you meant to send; if they scatter, the structure needs work before the slides do. Read the pace and level answers against how well listeners knew the topic, since beginners and experts rarely agree. Send the slides to everyone who left an email, and keep the answers about what worked best for the next version.",
      customizeSteps: [
        "Replace the talk question with a dropdown of sessions if you're collecting feedback for a whole event.",
        "Put the link or a QR code on your last slide so people answer before they leave the room.",
        "Remove the email question if you won't be sharing slides.",
      ],
      faqs: [
        {
          q: "What questions should I ask for presentation feedback?",
          a: "Ask whether the main message was clear, whether the structure was easy to follow, whether the examples helped, and how the pace and level felt. Asking listeners to restate the main point shows you what actually landed.",
        },
        {
          q: "How do I collect feedback right after a talk?",
          a: "Show a QR code or short link on your final slide and give the room a minute. A form that asks one question at a time is quick to finish on a phone.",
        },
        {
          q: "Can students use this for peer presentation feedback?",
          a: "Yes. Change the talk question to the presenter's name, and each student can give feedback on classmates with the same criteria.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "software-update-feedback-form",
    type: "form",
    category: "feedback",
    goals: ["collect-feedback", "conduct-research"],
    roles: ["product-research", "customer-success"],
    searchName: "Software update feedback form",
    title: "Release feedback",
    icon: "Rocket",
    metaDescription:
      "Learn how a release landed with users: whether they noticed the changes, what got easier or harder, what's broken and what needs explaining better.",
    description: "Hear how a new release changed people's work, and catch what broke.",
    blurb:
      "A post-release form that treats three kinds of user differently. People who used the new features rate the change, people who noticed but didn't try them say why, and people who missed it entirely say where they'd expect to hear. Anyone who hit a bug describes it, rates how badly it hurts and can attach a screenshot.",
    tags: ["release feedback", "product update survey", "software feedback", "feature feedback", "bug report"],
    greeting: "We've just shipped an update. Tell us how it's going for you, it takes about two minutes.",
    questions: [
      {
        ref: "version",
        type: "short_text",
        title: "Which version are you using, if you know?",
        required: false,
        maxLength: 40,
        prefillParam: "version",
      },
      {
        ref: "usage",
        type: "dropdown",
        title: "How often do you use the product?",
        required: true,
        options: [{ label: "Every day" }, { label: "A few times a week" }, { label: "About once a week" }, { label: "Less often" }],
      },
      {
        ref: "noticed",
        type: "single_select",
        title: "Have you noticed what's changed in this update?",
        required: true,
        options: [
          { label: "Yes, and I've used the new parts" },
          { label: "I noticed, but haven't tried them" },
          { label: "I haven't noticed anything new" },
        ],
      },

      // Used it
      {
        ref: "impact",
        type: "opinion_scale",
        title: "Has the update made your work easier or harder?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Much harder",
        labelHigh: "Much easier",
      },
      {
        ref: "needs_explaining",
        type: "long_text",
        title: "Was anything confusing, or in need of a better explanation?",
        required: false,
        maxLength: 1000,
      },

      // Noticed, not tried
      {
        ref: "why_not_tried",
        type: "single_select",
        title: "What's kept you from trying them?",
        required: true,
        options: [
          { label: "I don't need them" },
          { label: "I'm not sure how they work" },
          { label: "Haven't had time yet" },
          { label: "They don't look useful to me" },
        ],
        allowOther: true,
      },

      // Didn't notice
      {
        ref: "where_hear",
        type: "multi_select",
        title: "Where would you expect to hear about new features?",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "A message inside the app" },
          { label: "Email" },
          { label: "Release notes or a changelog" },
          { label: "Social media" },
        ],
      },

      // Everyone
      {
        ref: "problems",
        type: "yes_no",
        title: "Have you run into any bugs or problems since the update?",
        required: true,
      },
      {
        ref: "problem_detail",
        type: "long_text",
        title: "What happened, and what were you trying to do at the time?",
        required: true,
        maxLength: 2000,
      },
      {
        ref: "severity",
        type: "single_select",
        title: "How much is it getting in your way?",
        required: true,
        options: [
          { label: "It blocks my work" },
          { label: "Annoying, but I can work around it" },
          { label: "Minor" },
        ],
      },
      {
        ref: "problem_screenshot",
        type: "file_upload",
        title: "A screenshot or screen recording helps a lot, if you have one.",
        required: false,
        accept: ["image/*", "video/*"],
        maxFiles: 3,
        maxSizeMB: 50,
      },
      {
        ref: "missing",
        type: "long_text",
        title: "Did anything you relied on change or disappear?",
        required: false,
        maxLength: 1000,
      },
      {
        ref: "satisfaction",
        type: "rating",
        title: "Overall, how do you feel about this update?",
        required: true,
        scale: 5,
      },
      {
        ref: "follow_up_email",
        type: "email",
        title: "Leave your email if we can follow up with you.",
        required: false,
      },
    ],
    branches: [
      { when: "noticed", is: "Yes, and I've used the new parts", then: "impact" },
      { when: "noticed", is: "I noticed, but haven't tried them", then: "why_not_tried" },
      { when: "noticed", is: "I haven't noticed anything new", then: "where_hear" },
      { when: "needs_explaining", always: true, then: "problems" },
      { when: "why_not_tried", always: true, then: "problems" },
      { when: "problems", is: false, then: "missing" },
      { when: "problems", is: true, then: "problem_detail" },
    ],
    ending: {
      title: "Thanks, this goes straight to the team 🛠️",
      body: "Bug reports are read first, and we'll be in touch if you left your email.",
    },
    guide: {
      questionsToConsider: [
        "Which changes in this release do you most want feedback on, and should you name them in the question?",
        "How soon after release will you send it: a few days, or after people have had a week with it?",
        "Should bug reports from this form go to the same place as your usual support queue?",
        "Can you prefill the version from the app so users don't have to look it up?",
      ],
      howToUseResponses:
        "Sort the bug reports by severity first and reply to anyone blocked by the update the same day. Split the rest by the answer to whether they noticed the changes: the easier or harder scores tell you if the change was right, and the reasons for not trying tell you whether it was explained well. If many people missed the update entirely, change where you announce the next one.",
      customizeSteps: [
        "Name the headline change in the noticed question, for example \"Have you tried the new dashboard?\".",
        "Pass the version as a URL parameter from inside the app so the first question fills itself.",
        "Send the link a few days after release, in the app or by email, while the change is still new.",
      ],
      faqs: [
        {
          q: "What should I ask users after a software update?",
          a: "Whether they noticed the change, whether it made their work easier or harder, whether anything broke, and what needs a clearer explanation. Asking what disappeared catches regressions that nobody reports on their own.",
        },
        {
          q: "When should I send a release feedback form?",
          a: "A few days to a week after release, so people have used the change but still remember what it replaced.",
        },
        {
          q: "Can users attach screenshots of bugs?",
          a: "Yes. Anyone who reports a problem can upload screenshots or a short screen recording along with their description.",
        },
        {
          q: "Can I embed this form inside my app?",
          a: "Yes. You can embed it on a web page or open it from a link in the app, and pass the version number through the link.",
        },
      ],
    },
  }),
];
