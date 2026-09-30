import type { HubCopy } from "./hub-types";

export const HUBS_SURVEYS_QUIZZES: Record<string, HubCopy> = {
  "type:survey": {
    title: "Free survey templates that run as a conversation",
    h1: "Survey templates people actually finish",
    metaDescription:
      "Free survey templates for customers, staff, students and events. Each one asks a question at a time in a chat, with an AI follow-up when an answer is vague.",
    intro:
      "Start from the decision you need to make, not the topic: an NPS survey tells you who would recommend you, while a churn survey tells you why someone already left. Pick the template closest to that decision, open it live to feel how it runs, then cut any question you won't act on. Shorter surveys get more honest answers, and the AI follow-up fills in the detail you trimmed.",
    faqs: [
      {
        q: "How many questions should a survey have?",
        a: "As few as it takes to answer the question you started with. Most of these templates sit between five and twelve questions, and because each one appears on its own in the chat, a short survey feels even shorter.",
      },
      {
        q: "Can I change the questions in a survey template?",
        a: "Yes. Click Use this template to copy it into your account, then edit, add, remove or reorder any question. You can also add branching so different people see different follow-ups.",
      },
      {
        q: "How do I see and export survey results?",
        a: "Every response is saved as it comes in, and you can read each conversation or the answers side by side. When you want the raw data, export it to CSV.",
      },
    ],
  },

  "type:quiz": {
    title: "Free quiz templates with scoring and several results",
    h1: "Quiz templates for trivia, personality and product finders",
    metaDescription:
      "Free quiz templates: scored trivia, personality quizzes and product finders with several results. Try each one live, copy it, and change every question.",
    intro:
      "Quizzes here come in three shapes. Scored quizzes like the Trivia quiz or Math quiz add up right answers, personality quizzes like the Quick personality quiz sort people into types, and finders like the Personalized product recommendation quiz end with one suggestion. Decide which result you want people to walk away with first, because that choice sets how the scoring and endings are built.",
    faqs: [
      {
        q: "How does quiz scoring work?",
        a: "Each answer can carry points, and the total decides which ending a person sees. You can edit the points and the ranges for every result after you copy the template.",
      },
      {
        q: "Can a quiz have different results for different people?",
        a: "Yes. A quiz can have several endings, chosen by score or by branching on specific answers, so a personality quiz can show four types and a product finder can show one recommendation each.",
      },
      {
        q: "How do I share a quiz?",
        a: "Share it with a link, or embed it on your own site. People take it as a chat, one question at a time, on any device.",
      },
    ],
  },

  "category:survey/customer-success": {
    title: "Customer success survey templates, free to copy",
    h1: "Customer success surveys for loyalty, needs and support",
    metaDescription:
      "Free customer success survey templates, including NPS, customer loyalty and help desk feedback. Each asks different follow-ups depending on the answer.",
    intro:
      "These surveys are for customers you already have, so match the template to where they are. The NPS survey is a quick loyalty read you can repeat every quarter, the Customer needs survey suits a planning cycle, and the Help desk feedback survey belongs right after a ticket closes. Send each one close to the moment it asks about, while people still remember the details.",
    faqs: [
      {
        q: "What is an NPS survey?",
        a: "It asks how likely someone is to recommend you on a 0 to 10 scale, then groups them as detractors, passives or promoters. This template asks each group a different follow-up, so you learn what to fix and what to keep.",
      },
      {
        q: "How often should I survey customers?",
        a: "Tie it to a moment rather than a calendar: after onboarding, after a support request, or before a renewal. A short survey at the right time beats a long one sent to everyone at once.",
      },
      {
        q: "Can I ask unhappy customers different questions?",
        a: "Yes. Branching logic lets a low score lead to questions about what went wrong, while a high score leads somewhere else, and the AI follow-up asks for detail when an answer is vague.",
      },
    ],
  },

  "category:survey/customer-satisfaction": {
    title: "Customer satisfaction survey templates (CSAT, CES)",
    h1: "Customer satisfaction surveys for every kind of service",
    metaDescription:
      "Free customer satisfaction survey templates: CSAT, customer effort score, restaurant, event and member surveys. Try one live, then make it your own.",
    intro:
      "Pick by what you are rating. The CSAT survey scores a single interaction, the Customer effort score survey asks how hard something was to get done, and the Customer service satisfaction survey checks whether the problem is actually solved. The industry templates, from restaurants to residents, already name the parts of the experience worth rating, so you spend less time wording questions.",
    faqs: [
      {
        q: "What is the difference between CSAT and CES?",
        a: "CSAT asks how satisfied someone was with an interaction. CES asks how much effort it took, which often points more directly to the step you need to fix.",
      },
      {
        q: "What questions go in a customer satisfaction survey?",
        a: "One overall rating, a rating for each part of the experience you can change, and an open question on what would have made it better. The templates here follow that shape and dig deeper only where a score is low.",
      },
      {
        q: "How do I follow up on low satisfaction scores?",
        a: "Use branching so a low score opens a question about what went wrong, and use a separate ending to tell that person what happens next. You can read each response on its own to decide who to contact.",
      },
    ],
  },

  "category:survey/marketing": {
    title: "Marketing survey templates for brand and audience",
    h1: "Marketing surveys to understand your audience and brand",
    metaDescription:
      "Free marketing survey templates for brand perception, market segmentation, path to purchase, pricing and churn. Copy one and edit every question.",
    intro:
      "This is the largest set, so start with what you need to learn. For how people see you, try the Brand perception survey; for who your audience really is, the Market segmentation survey; for how they decided to buy, the Path to purchase survey. Surveys about one recent purchase or one real experience give sharper answers than broad questions about opinions.",
    faqs: [
      {
        q: "What should a marketing survey ask?",
        a: "Ask about real behaviour first, such as the last time someone bought or where they heard of you, then ask for opinions. Behaviour is easier to answer honestly and easier to act on.",
      },
      {
        q: "How do I get people to finish a marketing survey?",
        a: "Keep it short and let it feel like a conversation. These templates ask one question at a time in a chat, and the AI asks a short follow-up only when an answer needs more detail.",
      },
      {
        q: "Can I embed a marketing survey on my website?",
        a: "Yes. You can embed any survey on your site or share it by link in an email, a post or a newsletter.",
      },
    ],
  },

  "category:survey/feedback": {
    title: "Feedback survey templates for products and people",
    h1: "Feedback surveys for products, courses, clients and teams",
    metaDescription:
      "Free feedback survey templates: product feedback, course feedback, exit interview, cancellation and client satisfaction. Try them live before you copy.",
    intro:
      "Feedback surveys work best when they ask about one thing at a specific moment. Send the Post-training survey the day after a session, the Cancellation survey the moment someone leaves, and the Product feedback survey once people have used the product long enough to have a view. If a template covers more than you need, delete the extra sections so every answer is one you will read.",
    faqs: [
      {
        q: "How do I write good feedback questions?",
        a: "Ask about something specific and recent, avoid questions that suggest an answer, and pair each rating with a chance to explain it. The AI follow-up helps here by asking for an example when a reply is too short to use.",
      },
      {
        q: "Should feedback surveys use open or rating questions?",
        a: "Both. Ratings show you where to look, and open questions tell you why. These templates use a rating to decide which open question comes next.",
      },
      {
        q: "Can I send different questions to different people?",
        a: "Yes. Branching logic sends people down different paths based on their answers, so a leaving employee and a happy client never see questions meant for someone else.",
      },
    ],
  },

  "category:survey/other": {
    title: "Survey templates for HR, research and everyday use",
    h1: "More survey templates, from job satisfaction to commuting",
    metaDescription:
      "Free survey templates for job satisfaction, performance reviews, training needs, user personas, demographics and more. Copy any one and edit it freely.",
    intro:
      "Many of these are people surveys: the Job satisfaction survey, the Performance appraisal survey and the Training needs assessment survey each fit a different step of the year. Others, like the User persona survey and the Market research survey, gather material for research. For anything personal, keep sensitive questions optional so people can skip them and still finish.",
    faqs: [
      {
        q: "How do I run a job satisfaction survey?",
        a: "Tell people why you are asking and what you will do with the results, keep it short, and send it at a quiet time of year. This template follows up differently on low and high scores so you hear the reasons behind both.",
      },
      {
        q: "What goes in a demographic survey?",
        a: "Only the background details you will actually use, such as age range or role, with a clear option to skip each one. This template asks for consent first.",
      },
      {
        q: "Can I use one of these as a starting point for something else?",
        a: "Yes. Copy the closest template with Use this template, then rename it and rewrite, add or remove questions until it fits.",
      },
    ],
  },

  "category:survey/market-research": {
    title: "Market research survey templates, free to use",
    h1: "Market research surveys about buyers and their choices",
    metaDescription:
      "Free market research survey templates: competitor research, diet habits, Facebook audience and insurance needs. Chat-style surveys with AI follow-ups.",
    intro:
      "Use the Competitor research survey with people who recently chose between you and someone else, since they remember what tipped the decision. The Diet survey and Facebook survey suit a broad audience you want to understand, while the Insurance questionnaire gathers needs before a sales conversation. Research answers are only as good as the people answering, so decide who you are sending it to before you edit a single question.",
    faqs: [
      {
        q: "What is a market research survey?",
        a: "It asks a group of people about their needs, habits and choices so you can make a business decision with evidence. Good ones ask about what people did, not only what they think they would do.",
      },
      {
        q: "How do I avoid biased research questions?",
        a: "Keep wording neutral, avoid naming the answer you hope for, and offer a way to say none of these. Every question in these templates can be edited, so reword anything that leans one way.",
      },
      {
        q: "Can I analyse the answers in a spreadsheet?",
        a: "Yes. Export all responses to CSV and open them in any spreadsheet tool. You can also read each full conversation, including the AI follow-ups.",
      },
    ],
  },

  "category:survey/event": {
    title: "Free event survey templates for before and after",
    h1: "Event surveys, from planning to post-event feedback",
    metaDescription:
      "Free event survey templates for planning, pre-event needs, evaluation and feedback. Ask attendees one question at a time, before and after the day.",
    intro:
      "Event surveys split by timing. Before the day, the Event planning survey asks who you want there what would bring them, and the Pre-event survey collects what registered attendees need. Afterwards, the Event feedback survey rates each part separately and digs in where a score was low. Send post-event surveys within a day or two, while the memory is fresh.",
    faqs: [
      {
        q: "What should I ask after an event?",
        a: "Ask for an overall rating, then separate ratings for the parts you control, like sessions, venue and organisation. Add one open question about what to change and one about whether they would come again.",
      },
      {
        q: "When should I send a pre-event survey?",
        a: "Soon after people register, early enough that you can still act on their answers about dietary needs, access or topics they want covered.",
      },
      {
        q: "Can I share an event survey on the day?",
        a: "Yes. Share the link in a message or on screen, and people can answer on their phones as a quick chat.",
      },
    ],
  },

  "category:survey/business": {
    title: "Business survey templates for pricing and service",
    h1: "Business surveys for pricing, usability and customer visits",
    metaDescription:
      "Free business survey templates: price sensitivity, system usability, gym satisfaction and restaurant feedback. Try each live, copy it and adjust it.",
    intro:
      "These four cover very different jobs. The Price sensitivity survey uses four price-point questions to find a range people accept, the System usability survey pairs a task check with ten standard usability statements, and the Gym satisfaction survey and Restaurant feedback survey cover a customer visit. For pricing and usability, keep the standard questions as written so your results stay comparable over time.",
    faqs: [
      {
        q: "What is a price sensitivity survey?",
        a: "It asks at what price a product would seem too cheap, a bargain, getting expensive and too expensive. The overlap in those answers shows a price range your audience finds acceptable.",
      },
      {
        q: "What is a system usability survey?",
        a: "It is a set of ten short statements about how easy a system is to use, rated on agreement. This template adds a task check first and asks where people got stuck.",
      },
      {
        q: "Can I add my own questions to these templates?",
        a: "Yes. After you copy a template you can add questions anywhere, change answer options and add branching. Just keep standard question sets intact if you want to compare scores.",
      },
    ],
  },

  "category:survey/product": {
    title: "Product survey templates for testing and market fit",
    h1: "Product surveys for concepts, testing and product-market fit",
    metaDescription:
      "Free product survey templates: concept testing, product testing, product-market fit and the Sean Ellis test. Hear from real users one question at a time.",
    intro:
      "Match the template to your product's stage. Before you build, the Concept testing survey checks whether an idea is understood and wanted; during a beta, the Product testing survey shows where testers struggled; once people use it regularly, the Product-market fit survey asks how disappointed they would be without it. Asking the fit question too early, before people have really used the product, gives you noise.",
    faqs: [
      {
        q: "What is the Sean Ellis test?",
        a: "It asks users how they would feel if they could no longer use your product: very disappointed, somewhat disappointed or not disappointed. This template asks only people who have actually used the product.",
      },
      {
        q: "How do I measure product-market fit with a survey?",
        a: "Ask the disappointment question to active users, then ask each group a different follow-up about what they value and who they think the product is for. The Product-market fit template is set up with that branching.",
      },
      {
        q: "Who should take a product testing survey?",
        a: "People who have just tried the product or feature, ideally right after a session. Share the survey by link so testers can answer straight away.",
      },
    ],
  },

  "category:survey/school": {
    title: "School survey templates for students and staff",
    h1: "School surveys for students, parents and staff",
    metaDescription:
      "Free school survey templates: school climate, student feedback, student demographics and a mental health check-in. Short, optional where it matters.",
    intro:
      "The School climate survey is built to go to students, parents and staff at once, so you can compare how each group sees safety and belonging. The Student feedback survey is for a single class and separates teaching from material. With younger students, keep questions short and make sensitive ones optional, which the Student mental health check-in survey already does.",
    faqs: [
      {
        q: "What is a school climate survey?",
        a: "It asks the school community how safe, respected and supported they feel. Running it once or twice a year shows whether changes are working.",
      },
      {
        q: "How do I get honest feedback from students?",
        a: "Explain what the feedback is for, keep it short, and ask about specific parts of the class. A chat format with one question at a time feels less like a test.",
      },
      {
        q: "Can students skip questions they don't want to answer?",
        a: "Yes. You choose which questions are required, and the templates for demographics and wellbeing already make the personal ones optional.",
      },
    ],
  },

  "category:survey/employee-satisfaction": {
    title: "Free employee satisfaction and pulse survey templates",
    h1: "Employee satisfaction surveys that hear from the whole team",
    metaDescription:
      "Free employee satisfaction survey templates: company satisfaction, pulse, onboarding and IT support surveys. Copy one, edit it, and share it by link.",
    intro:
      "Use the Company satisfaction survey once or twice a year for a full picture, and the Employee pulse survey between those for a short, repeatable check. The Employee onboarding survey goes to new starters after their first weeks, and the IT satisfaction survey looks at everyday tools and support. Whatever you send, share what you learned afterwards, or the next survey gets fewer answers.",
    faqs: [
      {
        q: "What is an employee pulse survey?",
        a: "A short survey you repeat often, such as monthly, to track how people are doing between bigger surveys. This template follows up with people who say they are struggling.",
      },
      {
        q: "How long should an employee satisfaction survey be?",
        a: "Long enough to cover the topics you will act on and no longer. The chat format helps, since people see one question at a time instead of a long page.",
      },
      {
        q: "What should I do with employee survey results?",
        a: "Read the open answers, not only the scores, pick a few changes, and tell the team what they are. You can export all responses to CSV to share with leaders.",
      },
    ],
  },

  "category:survey/evaluation": {
    title: "Evaluation survey templates for managers and teams",
    h1: "Evaluation surveys, starting with manager effectiveness",
    metaDescription:
      "A free manager effectiveness survey template: teams rate how their manager supports them one behaviour at a time, with a follow-up for every low score.",
    intro:
      "The Manager effectiveness survey asks about specific behaviours, like giving clear priorities or useful feedback, instead of a single overall grade. That makes the results easier to turn into a development plan. Send it to the whole team at once and share the summary with the manager, not individual answers.",
    faqs: [
      {
        q: "What questions measure manager effectiveness?",
        a: "Questions about specific, observable behaviours: setting clear goals, giving feedback, removing blockers and recognising good work. Each is easier to rate honestly than a general question about the manager.",
      },
      {
        q: "How often should teams evaluate their manager?",
        a: "Once or twice a year works for most teams, with enough time between rounds for the manager to act on what they heard.",
      },
      {
        q: "Can I adapt this for another kind of evaluation?",
        a: "Yes. Copy the template and rewrite the behaviours for the role you are evaluating, such as a team lead or a project sponsor.",
      },
    ],
  },

  "category:survey/healthcare": {
    title: "Healthcare staff satisfaction survey template",
    h1: "A satisfaction survey for healthcare staff",
    metaDescription:
      "A free healthcare employee satisfaction survey template on workload, support and safety at work, written so it never asks for any patient details.",
    intro:
      "The Healthcare employee satisfaction survey asks staff about workload, shifts, support and how safe they feel at work, and it avoids anything that would collect patient details. Clinical teams have little spare time, so keep it to the questions you will act on and send it at a calmer point in the rota.",
    faqs: [
      {
        q: "What should a healthcare staff survey ask?",
        a: "Ask about workload and staffing, support from managers, safety at work and whether people have what they need to do their job. Add one open question about what would help most.",
      },
      {
        q: "Does this survey collect patient information?",
        a: "No. It is written to ask only about the staff member's own experience at work. If you add questions, keep them about work, not patients.",
      },
      {
        q: "Can staff answer on their phones between shifts?",
        a: "Yes. The survey runs as a chat on any device, one question at a time, so it is easy to answer in a few spare minutes.",
      },
    ],
  },

  "category:quiz/popular": {
    title: "Popular quiz templates: trivia, personality, tests",
    h1: "Our most popular quizzes, ready to copy",
    metaDescription:
      "Popular free quiz templates: trivia, a quick personality quiz, a math quiz, an English placement test and product finders. Try each live, then copy it.",
    intro:
      "These are the quizzes people reach for most. The Trivia quiz and Geography quiz are scored fun, the English placement test and Math quiz check real skills with a suggested level, and the Quick personality quiz sorts people into three types. If you plan to use a quiz for learning, keep the explained answers and show-your-working questions, since they are what make a score useful.",
    faqs: [
      {
        q: "How do I make an online quiz?",
        a: "Pick a template here, click Use this template, and edit the questions, answers and points. Then share it by link or embed it on your site.",
      },
      {
        q: "Can a quiz get easier or harder as people go?",
        a: "Yes. With branching, an early answer can send people to an easier or harder set of questions, which is how the Knowledge quiz template works.",
      },
      {
        q: "Can I see everyone's quiz scores?",
        a: "Yes. Every attempt is saved with its answers and result, and you can export them all to CSV.",
      },
    ],
  },

  "category:quiz/marketing": {
    title: "Marketing quiz templates for trivia and brands",
    h1: "Marketing quizzes that people share and finish",
    metaDescription:
      "Free marketing quiz templates: trivia on flags, logos and TV, plus branding, advertising and leadership style quizzes. Scored, with several results.",
    intro:
      "Marketing quizzes fall into two groups. Fun trivia like the Logo quiz or the Stranger Things trivia quiz gets shared and brings people to you, while topic quizzes like the Branding quiz or Digital marketing quiz show what you know and suit a newsletter or course. Pick a subject your audience already cares about, and make the result something they would happily tell a friend.",
    faqs: [
      {
        q: "Why use a quiz for marketing?",
        a: "People enjoy finding out how they scored or which type they are, so they finish quizzes and pass them on. That gives you attention and, if you ask, a way to stay in touch.",
      },
      {
        q: "Can I ask for an email address in a quiz?",
        a: "Yes. Add an email question anywhere, often just before the result, and make it optional if you want more people to finish.",
      },
      {
        q: "Can I put a quiz on my website?",
        a: "Yes. Embed it on any page or share the link in posts, ads and emails. It runs as a chat on phones and desktops.",
      },
    ],
  },

  "category:quiz/lead-generation": {
    title: "Lead generation quiz templates that qualify leads",
    h1: "Lead generation quizzes that score fit as they go",
    metaDescription:
      "Free lead generation quiz templates, including a Facebook lead quiz that scores fit and flags who wants to start now, plus personality and money quizzes.",
    intro:
      "A lead quiz gives people a useful result and gives you a sense of who is ready to talk. The Facebook lead generation quiz is built for ad traffic: it scores fit and flags who wants to start now. The Personality quiz and Multiple choice quiz draw people in with a result first, which suits a softer offer. Ask for contact details after people have invested a few answers, not at the start.",
    faqs: [
      {
        q: "What is a lead generation quiz?",
        a: "A quiz that ends with a personal result and collects contact details along the way. Scoring the answers shows you how good a fit each person is.",
      },
      {
        q: "How do I qualify leads with a quiz?",
        a: "Give points to answers that signal fit or urgency, then use several endings so strong leads see a booking step and others see something lighter.",
      },
      {
        q: "Where do quiz leads go?",
        a: "Every response is saved in your account, where you can read each one and export them to CSV.",
      },
    ],
  },

  "category:quiz/product-recommendation": {
    title: "Product recommendation quiz templates for shops",
    h1: "Product recommendation quizzes that point to one choice",
    metaDescription:
      "Free product recommendation quiz templates for bedding, books, board games, bike wheels, bridal looks and more. Ask a few questions, then suggest one match.",
    intro:
      "A good finder asks what a shopper actually knows, like how warm they sleep or what mood they read in, and turns that into one clear suggestion. The Bedding quiz, Book recommendation quiz and Board game recommendation quiz show three ways to do it. Put any must-have checks first, the way the Bike wheel quiz checks compatibility before style, so nobody gets a recommendation that won't work for them.",
    faqs: [
      {
        q: "How does a product recommendation quiz work?",
        a: "It asks a few questions about needs and preferences, scores or branches on the answers, and ends on the product that fits best. Each product gets its own ending.",
      },
      {
        q: "How many questions should a product quiz have?",
        a: "Usually five to eight. Ask only what changes the recommendation, and the AI follow-up can clear up an unclear answer without adding more questions.",
      },
      {
        q: "Can I add my own products?",
        a: "Yes. Copy a template, rename the endings to your products, and adjust the questions and scoring so each answer leads to the right one.",
      },
    ],
  },
};
