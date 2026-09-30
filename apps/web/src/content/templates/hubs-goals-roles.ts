import type { HubCopy } from "./hub-types";

export const HUBS_GOALS_ROLES: Record<string, HubCopy> = {
  "goal:collect-feedback": {
    title: "Feedback form and survey templates, free to copy",
    h1: "Feedback templates for customers, staff and events",
    metaDescription:
      "Feedback forms and surveys that ask one question at a time and follow up when an answer is vague. Try any template live, then copy it and edit every question.",
    intro:
      "Pick by the decision you need to make. A score like the NPS survey or the CSAT survey tells you how people feel overall, while an open form like the Bug report form or the Complaint form gets you the details to fix one thing. If you want both, keep the score and add a single open question after it; the AI follow-up will ask for a reason when someone answers with just \"fine\".",
    faqs: [
      {
        q: "What is the difference between a feedback form and a feedback survey?",
        a: "A feedback form usually captures one specific thing, like a complaint or a feature request, whenever someone has it. A survey asks a group the same questions at a set moment so you can compare answers. Both are here, and you can switch a template's questions around after you copy it.",
      },
      {
        q: "How many questions should a feedback survey have?",
        a: "Fewer than you think. One rating plus one or two open questions is often enough, because each answer in a chat gets a follow-up when it is too short to act on. Add more only if you will actually read them.",
      },
      {
        q: "Can people give feedback anonymously?",
        a: "Yes. Templates like the Online suggestion box work without asking for a name, and you can delete any name or email question from a template before you share it.",
      },
    ],
  },
  "goal:generate-leads": {
    title: "Lead generation form templates that qualify as they go",
    h1: "Lead generation forms that tell you who to call first",
    metaDescription:
      "Lead capture, quote and demo request templates that run as a short chat. Branch on budget or timeline, score each lead and export the list to CSV.",
    intro:
      "Match the template to how ready your visitor is. Someone reading your blog will trade an email for a download on the Gated content form, but a buyer comparing vendors wants the Demo request form or a quote form like the Website design quote form. Put the qualifying questions early and use branching so people who are not a fit reach a polite ending instead of your calendar.",
    faqs: [
      {
        q: "What should a lead generation form ask?",
        a: "Ask for contact details, then the two or three things that decide whether you follow up: what they need, when, and roughly how big the job is. Everything else can wait for the first call.",
      },
      {
        q: "How do I qualify leads with a form?",
        a: "Use scoring to add points for answers that signal a good fit, and branching to send low scores to a different ending. The Lead qualification form is set up this way, so you can copy it and change the rules.",
      },
      {
        q: "Does a chat form get more leads than a regular form?",
        a: "A chat shows one question at a time, so the form never looks long at first glance. Try the template live on its page and see how it feels before you decide.",
      },
    ],
  },
  "goal:run-events": {
    title: "Event registration, RSVP and feedback form templates",
    h1: "Templates for every stage of an event, from sign-up to follow-up",
    metaDescription:
      "Registration, RSVP, call for speakers, volunteer and post-event survey templates. Copy one, edit the questions, share the link and export attendees to CSV.",
    intro:
      "Most events need three forms, not one: something to open before the event, like the Call for speakers form or the Event volunteer form, a registration such as the Event RSVP form, and a survey afterwards like the Event feedback survey. Keep registration short, since people fill it out on their phones from a link. Save the detailed questions for the pre-event survey, when attendees have already said yes.",
    faqs: [
      {
        q: "What information should an event registration form collect?",
        a: "Name, email, which session or ticket they want, and anything you must plan for, like dietary needs or access requirements. Use branching so those follow-up questions only appear for people who say they apply.",
      },
      {
        q: "When should I send an event feedback survey?",
        a: "Within a day or two, while people still remember the details. Share the survey link in your thank-you message so it arrives when attendance is fresh.",
      },
      {
        q: "Can I use one template for an online event and an in-person one?",
        a: "Yes. Start from the Online event registration form or the Event signup form and edit the questions about location, links or travel to fit your format.",
      },
    ],
  },
  "goal:onboard-clients": {
    title: "Client onboarding and intake form templates, free",
    h1: "Client intake forms that gather the brief before the kickoff call",
    metaDescription:
      "Intake, onboarding and project brief templates that ask one question at a time. New clients answer at their own pace and you read every response in one place.",
    intro:
      "Choose based on how much you need before work starts. The Client intake form covers contact details and the basics, while a detailed template like the Branding questionnaire or the Marketing brief form gathers the creative direction you would otherwise chase over email. Because each vague answer gets a short follow-up, you tend to arrive at the first call with fewer open questions.",
    faqs: [
      {
        q: "What should a client intake form include?",
        a: "Contact details, what they want done, their deadline and budget range, and any files or examples they already have. Industry-specific details can go behind a branch so only the relevant clients see them.",
      },
      {
        q: "Should I send the intake form before or after the contract is signed?",
        a: "A short form before the call helps you judge fit and price the work. The longer questionnaire works best after they have signed, when the client is ready to put time in.",
      },
      {
        q: "Can I send the same onboarding form to every client?",
        a: "Yes. Share one link, and use branching so a client who picks a website project sees different questions from one who picks a logo.",
      },
    ],
  },
  "goal:conduct-research": {
    title: "Market research and user research survey templates",
    h1: "Research surveys that get past one-word answers",
    metaDescription:
      "Market research, customer development and product survey templates. The AI asks a follow-up when an answer is vague, so you get reasons you can quote.",
    intro:
      "Start with the question you want answered, then pick the narrowest template that fits it. The Price sensitivity survey tests what people would pay, the Competitor research survey shows what else they considered, and the Customer development survey is for early interviews when you are still learning the problem. Open questions are where a chat survey earns its keep, because the follow-up asks \"why\" the way an interviewer would.",
    faqs: [
      {
        q: "How do I write unbiased survey questions?",
        a: "Ask about what people did rather than what they would do, keep one idea per question, and avoid wording that hints at the answer you want. The templates follow these rules, which makes them a good starting point to edit.",
      },
      {
        q: "Can a survey replace customer interviews?",
        a: "Not fully, but a chat survey with follow-up questions gets closer than a static one. Many teams use it to screen people and then interview the most interesting respondents.",
      },
      {
        q: "How do I analyse the answers?",
        a: "Read the responses in chatform, then export them to CSV to sort, tag or chart them in a spreadsheet.",
      },
    ],
  },
  "goal:engage-with-quizzes": {
    title: "Quiz templates for trivia, personality and products",
    h1: "Quizzes people actually finish",
    metaDescription:
      "Trivia, personality and product recommendation quiz templates with scoring and several endings. Try one live, copy it and share it by link or embed.",
    intro:
      "Decide what the quiz is for before you pick one. A Trivia quiz or the Geography quiz is about fun and a score, a Personality quiz sorts people into a result, and a Product recommendation quiz points each person to something they can buy. Scoring and several endings do the sorting for you, so the work is mostly in writing results people want to share.",
    faqs: [
      {
        q: "How does quiz scoring work?",
        a: "Each answer can add points, and the total decides which ending the person sees. You can edit the points and the endings after copying any template.",
      },
      {
        q: "What makes a good personality quiz?",
        a: "Around eight to twelve questions with answers that feel different from each other, and results that describe the person kindly and specifically. Short, fun questions keep people going to the end.",
      },
      {
        q: "Can I collect emails with a quiz?",
        a: "Yes. Add an email question before the result, as the Lead generation quiz does, and read or export who took it afterwards.",
      },
    ],
  },
  "role:marketing": {
    title: "Marketing form and survey templates for your team",
    h1: "Marketing forms for sign-ups, campaigns and customer insight",
    metaDescription:
      "Newsletter, waitlist, giveaway, webinar and brand survey templates for marketers. Embed them on your site or share a link, then export responses to CSV.",
    intro:
      "Marketing forms fall into two jobs: growing your list and learning about your audience. For the first, the Newsletter signup form, Waitlist form and Giveaway entry form keep things short. For the second, the Brand awareness survey tells you whether people remember you, and it is where the AI follow-up is most useful, because it turns a vague answer into something you can use in copy.",
    faqs: [
      {
        q: "Which forms does a marketing team need most?",
        a: "Usually a sign-up form for your list, a registration form for webinars or events, and one survey to hear from customers in their own words. Start with those and add more as campaigns need them.",
      },
      {
        q: "Can I embed these forms on a landing page?",
        a: "Yes. Every template can be shared by link or embedded on your own site after you copy it.",
      },
      {
        q: "How do I get testimonials I can actually use?",
        a: "Use the Testimonial form, which asks about the problem before and the result after. When an answer is thin, the follow-up asks for a specific example, which is the part that makes a quote convincing.",
      },
    ],
  },
  "role:sales": {
    title: "Sales form templates for leads, quotes and demos",
    h1: "Sales forms that qualify before you pick up the phone",
    metaDescription:
      "Demo request, quote, callback and lead qualification templates for sales teams. Score answers, branch on fit and export the leads to CSV.",
    intro:
      "Use the form to do the discovery you would otherwise do on the first call. The Lead qualification form and the Sales inquiry form ask about need, timing and size, and scoring can rank each lead so you know who to call first. After a deal is lost, the Customer loss survey tells you why in the buyer's words, not the rep's.",
    faqs: [
      {
        q: "What questions qualify a sales lead?",
        a: "Most teams ask about the problem, the timeline, the budget range and who else is involved in the decision. Pick the two or three that matter most to you, since each extra question is one more reason to stop.",
      },
      {
        q: "Should a demo request form ask about budget?",
        a: "Ask for a range rather than a number, and make it one of the last questions. If budget decides whether you take the call, use branching to route small budgets to a self-serve ending.",
      },
      {
        q: "Can reps log calls with a form?",
        a: "Yes. The Sales call log records each call's outcome and next step, and exporting the responses to CSV gives you a simple record of the pipeline.",
      },
    ],
  },
  "role:customer-success": {
    title: "Customer support and success form templates",
    h1: "Support and customer success forms that get the full story",
    metaDescription:
      "Support ticket, refund, complaint, CSAT and NPS templates for customer success teams. The AI asks for missing details so tickets arrive ready to work.",
    intro:
      "Most back and forth in support comes from a missing detail, so start with the form that fits the request. The Support ticket form and Bug report form ask for the steps and the error, the Refund request form asks for the order and reason, and the NPS survey or Customer effort score survey measures how things are going once the issue is closed. When someone writes \"it doesn't work\", the follow-up asks what they tried.",
    faqs: [
      {
        q: "What is the difference between CSAT, NPS and CES?",
        a: "CSAT asks how satisfied someone was with one interaction, NPS asks how likely they are to recommend you overall, and CES asks how easy it was to get something done. There is a template for each, and many teams run CSAT after tickets and NPS a few times a year.",
      },
      {
        q: "How do I stop support forms from getting vague tickets?",
        a: "Ask one question at a time, starting with what the person was trying to do. The chat follows up on short answers, so you get the details before the ticket reaches your team.",
      },
      {
        q: "Can I handle cancellations with a form?",
        a: "Yes. The Membership cancellation form asks why someone is leaving, and branching can offer a different path depending on the reason they give.",
      },
    ],
  },
  "role:freelancers-agencies": {
    title: "Quote, brief and intake forms for freelancers",
    h1: "Client forms for freelancers and small agencies",
    metaDescription:
      "Quote, brief, intake and client feedback templates for freelancers and agencies. Share a link with new clients and read their answers before the first call.",
    intro:
      "Freelance work runs on three forms: one to price the job, one to gather the brief, and one to ask how it went. The Freelance quote form or the Graphic design quote form handles the first, the Logo design request form or Branding questionnaire covers the brief, and the Client satisfaction survey closes the project. Because the chat asks a follow-up on vague answers, \"something modern\" turns into examples you can design from.",
    faqs: [
      {
        q: "What should a freelance quote form ask?",
        a: "What the client needs, the deadline, the budget range and any examples they like. That is usually enough to send a price or decide the job is not a fit.",
      },
      {
        q: "Can I put my intake form on my portfolio site?",
        a: "Yes. Embed it on your site or share the link in your email signature and social profiles.",
      },
      {
        q: "How do I ask clients for a testimonial?",
        a: "Send the Testimonial form or the Client feedback form at the end of the project, while the result is fresh. Ask about the problem they had before working with you, since that is what future clients relate to.",
      },
    ],
  },
  "role:product-research": {
    title: "Product feedback and user research survey templates",
    h1: "Product research templates for feedback, testing and discovery",
    metaDescription:
      "Feature request, beta signup, usability, product feedback and pricing survey templates. Get reasons, not just ratings, and export every answer to CSV.",
    intro:
      "Pick the template by where the product is. Before launch, the Waitlist form and Beta tester signup form find people to learn from; in use, the System usability survey and Product feedback survey tell you what is hard; and the Feature request form collects ideas as they come. Ratings alone rarely tell you what to build, so keep at least one open question and let the follow-up ask what the person was trying to do.",
    faqs: [
      {
        q: "How do I collect feature requests without a messy backlog?",
        a: "Ask what problem the person was trying to solve, not just the feature they want. The Feature request form does this, which makes it easier to spot several requests that are really the same need.",
      },
      {
        q: "What is a system usability survey?",
        a: "The System Usability Scale is a standard set of ten statements people rate after using a product, which gives you a single usability score to track over time. The template includes the questions, ready to copy.",
      },
      {
        q: "When should I survey users who cancel?",
        a: "Right when they cancel, while the reason is clear to them. The Cancellation survey keeps it short and asks one follow-up so you learn what would have kept them.",
      },
    ],
  },
  "role:hr-people": {
    title: "HR and employee survey templates, free to copy",
    h1: "HR forms and employee surveys for every stage of the job",
    metaDescription:
      "Job application, onboarding, pulse, 360 feedback and exit interview templates for HR teams. Run them as a chat that asks one question at a time.",
    intro:
      "Match the template to the moment in the employee's time with you. The Job application form and Employee onboarding form handle the start, the Employee pulse survey and 360 degree feedback form check in along the way, and the Exit interview survey asks what you could have done differently. People answer more honestly when the questions feel like a conversation, and the follow-up gently asks for an example when an answer is only a rating.",
    faqs: [
      {
        q: "How often should I run an employee pulse survey?",
        a: "Often enough to spot changes, but only as often as you can act on the results. If people see nothing change after a survey, they stop answering the next one.",
      },
      {
        q: "Can employee surveys be anonymous?",
        a: "Yes. Remove any questions that ask for a name or email before sharing, and tell people up front what you will and will not collect.",
      },
      {
        q: "What should an exit interview ask?",
        a: "Why they are leaving, what would have made them stay, and how they felt about their manager, team and growth. Keep it short, since the open answers matter more than the ratings.",
      },
    ],
  },
  "role:education": {
    title: "Quiz and survey templates for teachers and trainers",
    h1: "Education templates for quizzes, course feedback and enrollment",
    metaDescription:
      "Quizzes, course feedback, enrollment and student survey templates for schools and trainers. Score answers automatically and export results to CSV.",
    intro:
      "Use quizzes to check learning and surveys to check the experience. The Math quiz, Spelling quiz and English placement test score answers for you, while the Course feedback survey and Student feedback survey ask what worked and what did not. Students often answer a chat with a word or two, so the follow-up is useful here: it asks what made a lesson confusing instead of leaving you with \"it was hard\".",
    faqs: [
      {
        q: "Can I grade a quiz automatically?",
        a: "Yes. Scoring adds points for correct answers, and you can send people to different endings based on their total, for example a pass or a placement level.",
      },
      {
        q: "How do I collect course feedback students will actually fill in?",
        a: "Keep it to a handful of questions and send it at the end of the last session. One question at a time on a phone feels quicker than a long page.",
      },
      {
        q: "Can I check on students' wellbeing with a survey?",
        a: "The Student mental health check-in survey is a gentle starting point. Edit the questions to match your school's support process before you share it.",
      },
    ],
  },
  "role:operations": {
    title: "Operations form templates for requests and records",
    h1: "Operations forms for bookings, requests and reports",
    metaDescription:
      "Booking, support, incident report, order and data request templates for operations teams. Collect complete details once and export everything to CSV.",
    intro:
      "Operations forms work best when they replace an email thread. The Appointment booking form and Booking request form gather everything needed to confirm a slot, the Software incident report form records what broke and when, and the GDPR data removal request form keeps privacy requests in one place. Use branching so each request type only sees its own questions, and the follow-up will ask for the detail people usually forget.",
    faqs: [
      {
        q: "How do I stop incomplete requests coming in?",
        a: "Ask one question at a time and make the important ones required. When an answer is too vague to act on, the chat asks a short follow-up before moving on.",
      },
      {
        q: "Can one form handle several types of request?",
        a: "Yes. Start with a question about the request type, then use branching so each type gets its own questions and ending.",
      },
      {
        q: "Where do the responses go?",
        a: "Every response is in chatform, where you can read it or export all of them to CSV for your own records or reports.",
      },
    ],
  },
};
