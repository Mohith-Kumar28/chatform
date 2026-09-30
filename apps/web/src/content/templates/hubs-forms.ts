import type { HubCopy } from "./hub-types";

export const HUBS_FORMS: Record<string, HubCopy> = {
  gallery: {
    title: "Free form, survey and quiz templates to try and copy",
    h1: "Form, survey and quiz templates that run as a chat",
    metaDescription:
      "Browse free form, survey and quiz templates, from a lead capture form to an NPS survey and a personality quiz. Try any one live, then copy it and make it yours.",
    intro:
      "Start from what you need back, not what the page should look like: a form collects details you will act on, a survey measures opinions across many people, and a quiz gives each person a result. Open a template like the Lead capture form, the NPS survey or the Personality quiz and answer it yourself first, since every one runs live on its page. If the questions feel right as a respondent, they will feel right to the people you send it to.",
    faqs: [
      {
        q: "Are these form templates free to use?",
        a: "Yes. Open any template, try it live, and press Use this template to copy it into your account, where you can edit every question.",
      },
      {
        q: "What is the difference between a form, a survey and a quiz?",
        a: "A form gathers information you will act on, like a booking or a support request. A survey asks many people for their opinions so you can compare answers. A quiz scores answers or leads each person to a result at the end.",
      },
      {
        q: "How is a conversational form different from a normal online form?",
        a: "It asks one question at a time, like a chat, instead of showing a long page of fields. When an answer is vague, an AI asks a short follow-up so you get the detail you actually needed.",
      },
    ],
  },

  "type:form": {
    title: "Free online form templates for every kind of job",
    h1: "Online form templates for requests, bookings and signups",
    metaDescription:
      "Free online form templates for quotes, contact, registration, orders and support. Each runs as a chat, branches on answers and is fully editable.",
    intro:
      "Pick the form by what happens after someone submits it. If a person on your team has to reply, a Quote request form or Support ticket form that gathers the details up front saves a round of emails; if nobody replies, a short Newsletter signup form is enough. Look for templates that already branch, so each person only answers the questions that apply to them.",
    faqs: [
      {
        q: "How do I make an online form from a template?",
        a: "Open the template, try it live to see how it flows, then press Use this template. You get your own copy where you can change, add or remove any question before you share it.",
      },
      {
        q: "Can I embed a form on my website?",
        a: "Yes. Every form can be shared as a link or embedded on your site, and it runs the same one-question-at-a-time chat in both places.",
      },
      {
        q: "Where do form responses go?",
        a: "Responses land in your chatform account, where you can read each one in full and export them all to CSV.",
      },
    ],
  },

  "category:form/marketing": {
    title: "Marketing form templates for briefs and intake",
    h1: "Marketing forms for briefs, client intake and testimonials",
    metaDescription:
      "Marketing form templates for campaign briefs, client intake, design consultations and testimonials. Gather the whole brief in a chat before the first meeting.",
    intro:
      "Most marketing forms fail because the brief arrives half written. The Marketing brief form walks through goal, audience, message, channels and deadline so nothing is left for the kickoff call. If you collect quotes from customers, use the Testimonial form, which asks for permission to publish instead of leaving you to chase it later.",
    faqs: [
      {
        q: "What should a marketing brief form include?",
        a: "At minimum the goal, the audience, the key message, the channels and the deadline. A budget question and a note on what has been tried before make the brief much easier to act on.",
      },
      {
        q: "How do I collect testimonials I can actually use?",
        a: "Ask for the quote in the customer's own words, the name and role they want shown, and a clear yes to publishing it. The Testimonial form asks for all three.",
      },
      {
        q: "Can I use a client intake form for different kinds of clients?",
        a: "Yes. Add branching so each type of client only sees the questions that apply to them, and edit any question to match your service.",
      },
    ],
  },

  "category:form/registration": {
    title: "Registration form templates for classes and more",
    h1: "Registration forms for courses, classes and contests",
    metaDescription:
      "Registration form templates for courses, yoga classes, contests, volunteers and products. Place people in the right class and collect only what you need.",
    intro:
      "A good registration form does more than take a name: it puts the person in the right place. The Course enrollment form places students at the right level and sorts out who pays, while the Volunteer sign up form matches people to shifts they can really make. Choose the template whose sorting question matches yours, then trim the rest.",
    faqs: [
      {
        q: "What information should a registration form collect?",
        a: "Collect what you need to confirm the place and contact the person: name, email, the option they are signing up for and anything that changes how you prepare, like level or access needs. Leave out anything you will not use.",
      },
      {
        q: "Can one registration form handle several classes or sessions?",
        a: "Yes. Ask which option they want first, then use branching to show the questions for that option only.",
      },
      {
        q: "How do I share a registration form?",
        a: "Share it as a link in emails and social posts, or embed it on your website. Every signup appears in your responses and can be exported to CSV.",
      },
    ],
  },

  "category:form/lead-generation": {
    title: "Lead generation form templates that qualify leads",
    h1: "Lead generation forms that qualify as they collect",
    metaDescription:
      "Lead generation form templates for demo requests, lead qualification, gated content and quotes. Learn fit, budget and timing in a chat before the first call.",
    intro:
      "Decide how much you want to know before you reply. The Demo request form learns what to show on the call, the Lead qualification form covers goal, budget, timing and buying process, and the Gated content form asks just enough to hand over a guide. Asking fewer questions gets more leads, asking more gets better ones, so match the template to what your sales team does next.",
    faqs: [
      {
        q: "What questions should a lead generation form ask?",
        a: "Start with who they are and what they need, then ask the questions that decide your next step, such as company size, budget or timing. Anything that does not change how you follow up can wait for the call.",
      },
      {
        q: "How can a form qualify leads automatically?",
        a: "Use branching and scoring so answers route people to different endings. A large, ready buyer can be sent to book a call while a smaller one is pointed to a trial.",
      },
      {
        q: "Will a chat-style form get more complete answers?",
        a: "It asks one question at a time, and when an answer is vague an AI asks a short follow-up. That means you get the context behind a request, not just a one-line reply.",
      },
    ],
  },

  "category:form/event": {
    title: "Free event signup and RSVP form templates for guests",
    h1: "Event signup and RSVP forms",
    metaDescription:
      "Free event signup and RSVP form templates. Know who is coming, how many guests they bring, and their dietary and travel needs before the day.",
    intro:
      "For a party, a dinner or a wedding, the Event RSVP form covers plus-ones, dietary notes and travel. For a public event where you want to know what people hope to get out of the day, start with the Event signup form. Both are short on purpose, so keep only the questions that change how you plan.",
    faqs: [
      {
        q: "What should an RSVP form ask?",
        a: "Whether they are coming, how many people are in their party, and anything you need to cater for, like dietary needs. Travel or accommodation questions only matter if you are helping arrange them.",
      },
      {
        q: "Can guests who decline skip the rest of the questions?",
        a: "Yes. With branching, someone who says they cannot come goes straight to a short ending instead of answering questions about meals.",
      },
      {
        q: "How do I get a guest list out of the responses?",
        a: "Read the responses in your account or export them to CSV and sort by attendance and party size.",
      },
    ],
  },

  "category:form/event-registration": {
    title: "Event registration form templates for workshops",
    h1: "Event registration forms for webinars, workshops and hackathons",
    metaDescription:
      "Event registration form templates for webinars, workshops, hackathons and volunteers. Sign people up for the right sessions and learn who needs what.",
    intro:
      "Match the template to the format of your event. The Webinar registration form also asks people who cannot join live what would help, the Hackathon registration form sorts out teams, food and T-shirts, and the Workshop registration form checks people are ready for the day. If you need helpers too, pair any of them with the Event volunteer form.",
    faqs: [
      {
        q: "What fields does an event registration form need?",
        a: "Name, email and the session or ticket they want, plus anything that changes your preparation such as dietary needs, access needs or experience level.",
      },
      {
        q: "Can people register for more than one session?",
        a: "Yes. Ask which sessions they want and use branching to follow up only on the ones they picked.",
      },
      {
        q: "Can I put the registration form on my event page?",
        a: "Yes. Embed it on the page or share it as a link, and every registration shows up in your responses, ready to export to CSV.",
      },
    ],
  },

  "category:form/business": {
    title: "Business form templates for bookings and quotes",
    h1: "Business forms for bookings, customer records and estimates",
    metaDescription:
      "Business form templates for booking requests, appointments, customer records, estimates and incident reports. Each one asks the right follow-ups in a chat.",
    intro:
      "Business forms cover everyday admin, so choose by the task you do most often. A service business usually starts with the Appointment request form or Booking request form, a trade business with the Estimate form, and a software team with the Software incident report form. Each gathers what you need to act without calling the person back.",
    faqs: [
      {
        q: "Which business forms should a small business have?",
        a: "Most need a way to take bookings or requests, a record of customer details and a way to collect feedback. Start with the one that replaces the most back-and-forth email.",
      },
      {
        q: "Can I change a business form to fit my services?",
        a: "Yes. After you press Use this template you can edit every question, add your own services as options and add branching for different requests.",
      },
      {
        q: "Can customers fill these forms in on their phone?",
        a: "Yes. The form runs as a chat, one question at a time, which suits a phone screen, whether you share it as a link or embed it on your site.",
      },
    ],
  },

  "category:form/quote": {
    title: "Quote request form templates for trades and freelancers",
    h1: "Quote request forms that scope the job first",
    metaDescription:
      "Quote request form templates for plumbing, electrical, design, translation and freelance work. Get the job details you need to price it without a call.",
    intro:
      "The best quote form asks the questions that change your price. The Plumbing quote form and Electrical quote form focus on the job and the site, while the Freelance quote form and Graphic design quote form scope deliverables and timing. If none fits your trade, the general Quote request form is a sound base to edit.",
    faqs: [
      {
        q: "What should a quote request form include?",
        a: "The type of job, its size or scope, the location if you travel, the timing and a way to reach the person. Ask for budget only if it changes what you would propose.",
      },
      {
        q: "Can the form ask different questions for different jobs?",
        a: "Yes. Ask what kind of work they need first, then branch to the questions that matter for that job.",
      },
      {
        q: "What happens when someone gives a vague job description?",
        a: "An AI asks a short follow-up, so an answer like 'a small fix' turns into enough detail to price the work.",
      },
    ],
  },

  "category:form/request": {
    title: "Request form templates for teams and customers",
    h1: "Request forms that arrive with everything you need",
    metaDescription:
      "Request form templates for work, marketing, media, feature and transport requests. Give every request one intake that asks enough to prioritise it.",
    intro:
      "A request form earns its place when it replaces the messages you send asking for missing details. Internal teams often start with the Work request form or Marketing request form, product teams with the Feature request form, which asks for the problem rather than the proposed fix. Pick one intake per team so every request arrives in the same shape.",
    faqs: [
      {
        q: "What makes a good work request form?",
        a: "It asks what is needed, why, by when and who is asking, so the request can be prioritised without a follow-up conversation.",
      },
      {
        q: "How should I collect feature requests?",
        a: "Ask what the person was trying to do and what got in the way before asking what they want built. The Feature request form is set up that way.",
      },
      {
        q: "Can one request form cover several kinds of requests?",
        a: "Yes. Ask the request type first and use branching so each type gets only its own questions.",
      },
    ],
  },

  "category:form/application": {
    title: "Application form templates for partners and talks",
    h1: "Application forms for resellers and speakers",
    metaDescription:
      "Application form templates for reseller programmes and calls for speakers. Screen applicants in a chat and get answers a reviewer can compare side by side.",
    intro:
      "Use the Reseller application form when you want to screen partners on how and where they sell before anyone books a call. Use the Call for speakers form when a committee needs to compare talk proposals quickly. In both cases, ask the question that most often rules someone out early, so applicants who do not fit find out straight away.",
    faqs: [
      {
        q: "What should a call for speakers form ask?",
        a: "The talk title, a short abstract, who it is for, the format and length, and a speaker bio. A link to a past talk helps reviewers a great deal.",
      },
      {
        q: "Can an application form screen out people who are not a fit?",
        a: "Yes. Use branching to send applicants who do not meet a requirement to a polite ending before they fill in the rest.",
      },
      {
        q: "How do I review applications?",
        a: "Read each application in your responses or export them all to CSV to compare and score them side by side.",
      },
    ],
  },

  "category:form/feedback": {
    title: "Feedback form templates for clients and customers",
    h1: "Feedback forms for clients, diners and presentations",
    metaDescription:
      "Feedback form templates for clients, restaurants, retail stores, coaching and presentations. Hear what people thought in their own words, with follow-ups.",
    intro:
      "Feedback forms work best when they are tied to one moment: a meal, a talk, a finished project. The Restaurant feedback form and Client feedback form both send happy and unhappy people down different paths, so you can reach the unhappy ones quickly. For a talk or a design review, the Presentation feedback form and Website design feedback form keep comments specific.",
    faqs: [
      {
        q: "How long should a feedback form be?",
        a: "Short enough to finish while the experience is fresh. A rating, one question about what worked and one about what to change is often enough.",
      },
      {
        q: "How do I get more useful written feedback?",
        a: "Ask one open question at a time. When someone writes something vague like 'it was fine', an AI asks a short follow-up to find out what they mean.",
      },
      {
        q: "What is the difference between a feedback form and a feedback survey?",
        a: "A feedback form usually collects comments about one specific experience so you can act on each one. A survey asks many people the same questions so you can compare the results.",
      },
    ],
  },

  "category:form/customer-success": {
    title: "Customer service form templates for support teams",
    h1: "Customer success forms for onboarding, support and refunds",
    metaDescription:
      "Customer service form templates for support tickets, bug reports, refunds and client onboarding. Route every request with the details your team needs.",
    intro:
      "Support forms save time when they collect the details your team would otherwise ask for in the first reply. The Support ticket form routes requests to the right queue, the Bug report form asks for steps to reproduce, and the Refund request form gathers the evidence once. For new clients, the Client onboarding form collects everything before kickoff.",
    faqs: [
      {
        q: "What should a support ticket form ask?",
        a: "Who is asking, what the problem is, what they were trying to do and how urgent it is. Asking for an order number or account email saves a reply.",
      },
      {
        q: "How do I get bug reports that developers can reproduce?",
        a: "Ask what happened, what they expected, the steps that led to it and the device or browser. If an answer is vague, an AI asks a short follow-up.",
      },
      {
        q: "Can one form route requests to different teams?",
        a: "Yes. Ask the type of request first, then branch to the questions each team needs and use a separate ending for each path.",
      },
    ],
  },

  "category:form/signup": {
    title: "Signup form templates for waitlists and newsletters",
    h1: "Signup forms for waitlists, betas and newsletters",
    metaDescription:
      "Free signup form templates for waitlists, beta testers, newsletters and online accounts. Keep it short and learn why each person joined.",
    intro:
      "Signup forms should be quick, so the choice is about the one extra thing worth asking. The Waitlist form sorts people by platform, the Beta tester signup form asks how much time they have to test, and the Newsletter signup form lets people choose topics and frequency. Add a question only if you will use the answer.",
    faqs: [
      {
        q: "How many questions should a signup form have?",
        a: "As few as possible: usually an email plus one or two questions that shape what you send them. Each extra question should earn its place.",
      },
      {
        q: "How do I find good beta testers from a waitlist?",
        a: "Ask about their platform, how they would use the product and how much time they can give. The Beta tester signup form covers all three.",
      },
      {
        q: "Can I embed a signup form on a landing page?",
        a: "Yes. Embed it on the page or share it as a link, and export your signups to CSV whenever you need them.",
      },
    ],
  },

  "category:form/evaluation": {
    title: "Evaluation form templates for products and people",
    h1: "Evaluation forms for products, software and self review",
    metaDescription:
      "Evaluation form templates for products, software trials and self reviews. Score what matters and get reasons behind every rating, in a simple chat.",
    intro:
      "An evaluation is only useful if every reviewer judges the same things. The Product evaluation form and Software evaluation form score against the job the tool has to do, so ratings from different people can be compared. The Self evaluation form asks for real examples, which gives a review meeting something concrete to discuss.",
    faqs: [
      {
        q: "What should a software evaluation form include?",
        a: "The tasks you tested, a rating for each criterion that matters to you, the problems found and a clear recommendation. Asking reviewers to explain their rating makes the result easier to trust.",
      },
      {
        q: "Can an evaluation form calculate a score?",
        a: "Yes. Turn on scoring so answers add up to a total, and use several endings to show different results.",
      },
      {
        q: "How do I write a useful self evaluation?",
        a: "Pick a few concrete examples of work you are proud of and one or two you would do differently, and say what support would help next.",
      },
    ],
  },

  "category:form/contact": {
    title: "Contact form templates for websites and businesses",
    h1: "Contact forms that sort your inbox as they fill it",
    metaDescription:
      "Contact form templates for websites, photographers, designers, sales teams and complaints. Know what each message is about before you open it.",
    intro:
      "A plain contact form gives you a name and a vague message. The Contact us form and Business contact form ask what the enquiry is about first, so buyers, customers and press each answer only their own questions. If most of your enquiries are the same kind, a focused one like the Photography contact form or Callback request form gets you to a reply faster.",
    faqs: [
      {
        q: "What fields should a website contact form have?",
        a: "Name, email, what the enquiry is about and the message itself. A question about the reason for getting in touch lets you route it to the right person.",
      },
      {
        q: "How do I add a contact form to my website?",
        a: "Copy a template with Use this template, edit the questions, then embed it on your site or link to it from your contact page.",
      },
      {
        q: "Can a contact form ask different questions for different enquiries?",
        a: "Yes. Use branching so a sales enquiry, a support question and a press request each get their own follow-up questions.",
      },
    ],
  },

  "category:form/membership": {
    title: "Membership form templates for gyms, clubs and groups",
    h1: "Membership forms for joining and cancelling",
    metaDescription:
      "Membership form templates for gyms, clubs and associations, from the application to the cancellation. Collect the tier, the terms and the details in one pass.",
    intro:
      "Membership forms sit at both ends of the relationship. The Membership application form and Gym membership form take the tier, the details and the agreement to terms when someone joins. The Membership cancellation form handles leaving cleanly and offers a pause to people who only need a break.",
    faqs: [
      {
        q: "What should a gym membership form include?",
        a: "Contact details, the membership type, an emergency contact, any health information the front desk needs and agreement to your terms.",
      },
      {
        q: "Should a cancellation form try to keep members?",
        a: "Asking why someone is leaving and offering a pause is fair and often welcome. Make cancelling itself clear and easy, since a hard exit leaves a bad last impression.",
      },
      {
        q: "Can I offer different membership tiers?",
        a: "Yes. List your tiers as options and use branching to ask each tier its own questions.",
      },
    ],
  },

  "category:form/report": {
    title: "Free activity log and work report form templates",
    h1: "Report forms for logging work as it happens",
    metaDescription:
      "Report and activity log form templates. Record one piece of work at a time with how long it took and where it stands, then export the log to CSV.",
    intro:
      "The Online activity log records one piece of work per entry, with the time it took and its status, which makes it easy to fill in right after the task. Keep each entry short so people log as they go instead of reconstructing the week on Friday. Export the entries to CSV when you need to total hours or share a summary.",
    faqs: [
      {
        q: "What should an activity log record?",
        a: "What was done, when, how long it took and whether it is finished. A short note on blockers helps whoever reads the log next.",
      },
      {
        q: "Can I turn log entries into a report?",
        a: "Yes. Export the responses to CSV and sort or total them in the spreadsheet tool you already use.",
      },
      {
        q: "Can I change the fields in the log?",
        a: "Yes. Press Use this template and edit every question, for example to add a project or client field.",
      },
    ],
  },

  "category:form/other": {
    title: "HR form templates for onboarding, referrals and reviews",
    h1: "HR forms for onboarding, referrals and 360 feedback",
    metaDescription:
      "HR form templates for employee onboarding, staff induction, referrals and 360 degree feedback, plus a few creative request forms. All run as a chat.",
    intro:
      "Most of these templates serve people teams. The Employee onboarding form collects what a new starter needs before day one, the Staff induction form checks what is done in their first week, and the 360 degree feedback form asks colleagues for examples rather than bare scores. There is also the odd creative one, like the Ghibli style form for illustration requests.",
    faqs: [
      {
        q: "What should an employee onboarding form collect?",
        a: "Personal and contact details, an emergency contact, payment and tax details your process needs, equipment needs and the start date. Ask only what the first week actually depends on.",
      },
      {
        q: "How do I run 360 degree feedback?",
        a: "Send the same form to the people who work closely with one person and ask for specific examples alongside each rating. Read the answers together to spot patterns.",
      },
      {
        q: "What makes a good employee referral form?",
        a: "The candidate's name and contact, the role, and one honest reason they would fit. Keeping it short makes people more likely to refer.",
      },
    ],
  },

  "category:form/order": {
    title: "Order form templates for services and catering",
    h1: "Order forms for services, catering and photography",
    metaDescription:
      "Order form templates for service jobs, catering and photography. Collect the menu, headcount, site and timing so your team can plan without a call.",
    intro:
      "An order form should leave nothing to confirm by phone. The Catering order form covers menu, headcount, dietary needs and delivery, the Service order form gathers the job, the site and the timing, and the Photography order form handles both new sessions and prints from a past shoot. Pick the closest one and add your own menu or service options.",
    faqs: [
      {
        q: "What should a catering order form include?",
        a: "The date and time, delivery address, headcount, menu choices and dietary needs, plus a contact for the day.",
      },
      {
        q: "Can I list my own products or services as options?",
        a: "Yes. After Use this template, edit the choices to match what you offer and add branching for items that need extra details.",
      },
      {
        q: "Where do I see the orders?",
        a: "Every order lands in your responses, where you can read it in full and export the whole list to CSV for planning.",
      },
    ],
  },

  "category:form/job-application": {
    title: "Free job application form templates for hiring",
    h1: "Job application forms that screen as they go",
    metaDescription:
      "Job application form templates for general hiring and model casting. Screen candidates in a chat and ask each discipline its own questions.",
    intro:
      "The Job application form asks each discipline its own questions, so a designer and an engineer are not answering the same list. For casting, the Model application form collects photos, experience and availability. Put your deal-breaker questions early, like location or right to work, so candidates who do not fit find out quickly.",
    faqs: [
      {
        q: "What questions should a job application form ask?",
        a: "Contact details, the role, relevant experience, availability and a link to a CV or portfolio. Add a question or two that shows how the person thinks about the work.",
      },
      {
        q: "Can I ask different questions for different roles?",
        a: "Yes. Ask which role they are applying for first, then use branching to show questions for that role only.",
      },
      {
        q: "How do I compare applicants?",
        a: "Read each application in your responses, or export them to CSV to compare side by side. Scoring can also rank answers for you.",
      },
    ],
  },

  "category:form/file-upload": {
    title: "File upload form templates for entries and submissions",
    h1: "Submission forms for music, art, photos and projects",
    metaDescription:
      "File upload form templates for music, art, photo contests and project submissions. Get every entry in the same format, with the context reviewers need.",
    intro:
      "Submission forms make judging fair when every entry arrives in the same format. The Music submission form and Art submission form pair the work with the context a curator needs, and the Photo contest entry form screens out ineligible entries before judging. Be clear about the file type and size you accept in the question itself.",
    faqs: [
      {
        q: "What should a submission form ask for besides the file?",
        a: "The creator's name and contact, a title, a short description of the work and agreement to your submission rules.",
      },
      {
        q: "How do I stop ineligible entries?",
        a: "Ask the eligibility questions first and use branching to send anyone who does not qualify to a polite ending before they upload.",
      },
      {
        q: "How do I review submissions?",
        a: "Open each response to see the details and files together, or export the list to CSV to track your review.",
      },
    ],
  },
};
