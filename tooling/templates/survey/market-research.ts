import { defineTemplate, type TemplateSeed } from "../define.js";

export const SURVEY_MARKET_RESEARCH: TemplateSeed[] = [
  defineTemplate({
    slug: "competitor-research-survey",
    type: "survey",
    category: "market-research",
    goals: ["conduct-research"],
    roles: ["marketing", "product-research", "sales"],
    searchName: "Competitor research survey",
    title: "Competitor research",
    icon: "Target",
    metaDescription:
      "Ask recent buyers which alternatives they compared, what mattered most and why they chose who they did. Won, lost and undecided buyers each get their own follow-up.",
    description: "Find out who you were compared with, on what, and why the buyer went the way they did.",
    blurb:
      "Built for buyers who have just made a decision, including the ones who went elsewhere. It maps the shortlist and the criteria first, then asks one question that splits the path: buyers who chose you say what tipped it, buyers who chose a rival say what made that option the better fit, and anyone still deciding says what is holding them up.",
    tags: ["competitor research", "win loss survey", "competitive analysis", "buyer research", "market research"],
    greeting: "You recently looked at a few options, us among them. Mind telling us how that comparison went? Honest answers help most.",
    questions: [
      {
        ref: "role_in_decision",
        type: "single_select",
        title: "What was your part in the decision?",
        required: true,
        options: [
          { label: "I made the final call" },
          { label: "I recommended an option" },
          { label: "I was asked for input" },
          { label: "I was one of several people deciding" },
        ],
      },
      {
        ref: "alternatives",
        type: "long_text",
        title: "Which other options did you look at? Include building it yourselves or sticking with what you had, if those were on the table.",
        required: true,
        maxLength: 800,
        agentHints: {
          askStyle: "Encourage them to name specific products or approaches, even ones they dropped early.",
          examples: [],
        },
      },
      {
        ref: "research_channels",
        type: "multi_select",
        title: "Where did you do your research?",
        required: true,
        allowOther: true,
        options: [
          { label: "Search engines" },
          { label: "Review and comparison sites" },
          { label: "Recommendations from colleagues or friends" },
          { label: "Social media or online communities" },
          { label: "Conversations with sales teams" },
          { label: "Free trials or demos" },
        ],
      },
      {
        ref: "criteria",
        type: "ranking",
        title: "Rank what mattered most when you compared the options.",
        required: true,
        items: [
          "Price",
          "Ease of use",
          "A specific feature we needed",
          "Fit with the tools we already use",
          "Quality of support",
          "Reputation and reviews",
        ],
      },
      {
        ref: "comparison",
        type: "matrix",
        title: "Compared with the other options, how did we come across on each of these?",
        required: false,
        rows: ["Price", "Ease of use", "Features", "Support", "Trust in the company"],
        columns: ["Weaker", "About the same", "Stronger", "Didn't compare this"],
      },
      {
        ref: "outcome",
        type: "single_select",
        title: "Where did you end up?",
        required: true,
        options: [
          { label: "We chose you" },
          { label: "We chose another option" },
          { label: "We're still deciding" },
          { label: "We decided not to buy anything for now" },
        ],
      },

      // Won
      {
        ref: "won_reason",
        type: "long_text",
        title: "What tipped the decision toward us?",
        required: true,
        maxLength: 800,
      },

      // Lost
      {
        ref: "chosen_option",
        type: "short_text",
        title: "Which option did you go with?",
        required: true,
        maxLength: 120,
      },
      {
        ref: "lost_reason",
        type: "long_text",
        title: "What made them the better fit for you?",
        required: true,
        maxLength: 800,
      },
      {
        ref: "win_back",
        type: "long_text",
        title: "Is there anything that would make you look at us again later?",
        required: false,
        maxLength: 500,
      },

      // Undecided or holding off
      {
        ref: "blockers",
        type: "multi_select",
        title: "What is holding the decision up, or made you hold off?",
        required: true,
        allowOther: true,
        options: [
          { label: "Budget isn't approved yet" },
          { label: "The options look too similar to call" },
          { label: "Switching feels like too much work" },
          { label: "Other priorities came first" },
          { label: "We still have unanswered questions" },
        ],
      },

      // Everyone
      {
        ref: "clarity",
        type: "opinion_scale",
        title: "How clearly did our website explain what makes us different?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "Not clear at all",
        labelHigh: "Very clear",
      },
      {
        ref: "follow_up",
        type: "yes_no",
        title: "Could we get in touch with one or two follow-up questions?",
        required: true,
      },
      {
        ref: "email",
        type: "email",
        title: "What's the best email to reach you on?",
        required: true,
      },
    ],
    branches: [
      { when: "outcome", is: "We chose you", then: "won_reason" },
      { when: "outcome", is: "We chose another option", then: "chosen_option" },
      { when: "outcome", is: "We're still deciding", then: "blockers" },
      { when: "outcome", is: "We decided not to buy anything for now", then: "blockers" },
      { when: "won_reason", always: true, then: "clarity" },
      { when: "win_back", always: true, then: "clarity" },
      { when: "follow_up", is: true, then: "email" },
      { when: "follow_up", is: false, then: "end_thanks" },
    ],
    ending: {
      title: "Thank you, that's exactly what we needed",
      body: "Your answers go straight to the people who decide how we build and explain our product.",
    },
    guide: {
      questionsToConsider: [
        "Which competitors do you expect to hear about, and do you want an open question so unexpected names still come up?",
        "Are you surveying buyers you won, buyers you lost, or both? The lost ones usually teach you more.",
        "Which criteria in the ranking match how your market actually buys?",
        "Who will follow up with the people who agree to a second conversation?",
      ],
      howToUseResponses:
        "Sort responses by outcome first, then read the ranking and the comparison grid for each group side by side. If lost buyers rank one criterion high and also rate you weaker on it, that is the gap to work on. Collect the competitor names from the open answers into one list, and treat any claim about a rival as a lead to check, not a fact to repeat. Export to CSV if you want to count patterns across a larger batch.",
      customizeSteps: [
        "Swap the ranking items and grid rows for the criteria your buyers really compare on, such as onboarding time or contract terms.",
        "Send the link within a few weeks of a decision, while the buyer still remembers the shortlist clearly.",
        "Add a hidden field for the deal or account so you can match each response to your own records.",
      ],
      faqs: [
        {
          q: "What should a competitor research survey ask?",
          a: "Which alternatives the buyer considered, how they researched, what mattered most, and why they chose what they did. Ask where they ended up before asking why, so each buyer explains the decision they actually made.",
        },
        {
          q: "Should I list competitor names in the survey?",
          a: "Start with an open question so you learn names you did not expect. You can add a list later once you know which rivals come up most.",
        },
        {
          q: "Who should I send a competitor survey to?",
          a: "People who recently made a buying decision in your category, including those who chose someone else. Buyers you lost are harder to reach but give the most useful answers.",
        },
        {
          q: "How do I keep the survey from feeling like a sales pitch?",
          a: "Keep the wording neutral, ask about one thing at a time, and only ask for contact details at the end, from people who agree to a follow-up.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "personality-questionnaire",
    type: "survey",
    category: "market-research",
    goals: ["conduct-research"],
    roles: ["hr-people", "operations"],
    searchName: "Personality questionnaire",
    title: "Working style questionnaire",
    icon: "Brain",
    metaDescription:
      "A low-stakes personality questionnaire about working style: energy, focus, feedback and how people handle pressure. Built for team conversations, not for labels.",
    description: "Help people describe how they like to work, in their own words, as a start to a team conversation.",
    blurb:
      "Everyday questions about energy, focus, decisions and feedback, and each person picks who can see their answers before they start. Anyone who says pressure tends to overwhelm them is asked what actually helps, so a manager has something to act on.",
    tags: ["personality questionnaire", "working style", "team building", "self reflection", "onboarding"],
    greeting: "A few questions about how you like to work. There are no right answers, and nothing here is a test.",
    questions: [
      {
        ref: "name",
        type: "short_text",
        title: "What should we call you?",
        required: true,
        maxLength: 80,
      },
      {
        ref: "visibility",
        type: "single_select",
        title: "Before we start: who would you like to see your answers?",
        required: true,
        options: [{ label: "Only my manager" }, { label: "My whole team" }, { label: "Only the person running this" }],
      },
      {
        ref: "energy",
        type: "single_select",
        title: "After a long day of meetings and conversations, how do you usually feel?",
        required: true,
        options: [
          { label: "Energised, I could keep going" },
          { label: "Fine, it depends on the people" },
          { label: "Drained, I need quiet time to recover" },
        ],
      },
      {
        ref: "new_task",
        type: "single_select",
        title: "When you get a new task, what do you do first?",
        required: true,
        options: [
          { label: "Make a plan before starting" },
          { label: "Jump in and figure it out as I go" },
          { label: "Talk it through with someone" },
          { label: "Look at how it was done before" },
        ],
      },
      {
        ref: "statements",
        type: "matrix",
        title: "How much does each of these sound like you?",
        required: true,
        rows: [
          "I like having a clear routine",
          "I enjoy meeting new people",
          "I prefer to finish one thing before starting another",
          "I'm comfortable speaking up in a group",
          "I notice small details others miss",
        ],
        columns: ["Not really", "Sometimes", "Mostly", "Very much"],
      },
      {
        ref: "decisions",
        type: "opinion_scale",
        title: "When you make a decision, do you lean more on gut feeling or on data?",
        required: true,
        steps: 7,
        startAt: 1,
        labelLow: "Gut feeling",
        labelHigh: "Data and evidence",
      },
      {
        ref: "motivators",
        type: "ranking",
        title: "Rank what keeps you most motivated at work.",
        required: true,
        items: [
          "Learning something new",
          "Seeing the result of my work",
          "Recognition from others",
          "Helping the people around me",
          "Having control over how I work",
        ],
      },
      {
        ref: "feedback",
        type: "single_select",
        title: "How do you prefer to get feedback?",
        required: true,
        options: [
          { label: "Straight away, as things happen" },
          { label: "In a regular one-to-one" },
          { label: "In writing, so I can think about it" },
          { label: "A mix, depending on the topic" },
        ],
      },
      {
        ref: "pressure",
        type: "single_select",
        title: "When deadlines pile up, which is closest to how you react?",
        required: true,
        options: [
          { label: "I get more focused" },
          { label: "I cope, though it takes effort" },
          { label: "I feel overwhelmed more often than I'd like" },
        ],
      },
      {
        ref: "what_helps",
        type: "long_text",
        title: "What helps most when that happens? Think of something a teammate or manager could actually do.",
        required: false,
        maxLength: 600,
      },
      {
        ref: "work_with_me",
        type: "long_text",
        title: "What's one thing people should know about working with you?",
        required: false,
        maxLength: 600,
        agentHints: {
          askStyle: "Keep it light. A habit, a preference or a pet peeve is a perfectly good answer.",
          examples: [],
        },
      },
    ],
    branches: [
      { when: "pressure", is: "I get more focused", then: "work_with_me" },
      { when: "pressure", is: "I cope, though it takes effort", then: "work_with_me" },
      { when: "pressure", is: "I feel overwhelmed more often than I'd like", then: "what_helps" },
    ],
    ending: {
      title: "Thanks for sharing how you work 🙌",
      body: "Your answers will only be shared with the people you chose. Bring anything you'd like to add to your next conversation.",
    },
    guide: {
      questionsToConsider: [
        "What is the questionnaire for: a new team getting to know each other, onboarding, or a workshop?",
        "Who will read the answers, and have you told people that before they start?",
        "Which situations in your own team, such as meetings, handovers or deadlines, deserve their own question?",
        "Do you want people to compare answers together, or keep them between the person and their manager?",
      ],
      howToUseResponses:
        "Use the answers as a starting point for conversation, never as a label or a reason to make a decision about someone. Read each person's open answers next to their choices, since that is where the useful detail sits. Where someone said pressure overwhelms them, follow up privately on what they said would help. For a team session, look across the grid to spot where people differ, such as routine versus variety, and talk about how to work with that.",
      customizeSteps: [
        "Edit the grid statements to reflect situations your team actually meets, like on-call weeks or client calls.",
        "Keep the visibility question and honour it: only share answers with the people each person picked.",
        "Share the link a few days before a team session so everyone has time to answer thoughtfully.",
      ],
      faqs: [
        {
          q: "Is this personality questionnaire a validated assessment?",
          a: "No. It is a set of reflection questions for conversation. Do not use it to hire, promote or rate people.",
        },
        {
          q: "What questions go in a personality questionnaire for work?",
          a: "Ask about everyday situations: how people start a task, how they recover energy, how they like feedback and how they react under pressure. Concrete situations are easier to answer honestly than abstract traits.",
        },
        {
          q: "Should answers be anonymous?",
          a: "For team building, people usually want their name attached so colleagues can learn about them. Let each person choose who sees their answers, as this template does.",
        },
        {
          q: "Can I turn it into a quiz with a result at the end?",
          a: "Yes. Clicking Use this template copies it into your account, where you can add scores to options and send people to different endings based on their total.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "diet-survey",
    type: "survey",
    category: "market-research",
    goals: ["conduct-research"],
    roles: ["product-research", "operations"],
    searchName: "Diet survey",
    title: "Eating habits survey",
    icon: "Utensils",
    metaDescription:
      "Learn how people really eat: the diet they follow and why, how often they cook, what they snack on and what gets in the way of eating the way they would like to.",
    description: "Understand eating patterns, food choices and the practical barriers behind them.",
    blurb:
      "Covers the diet someone follows, a week of typical eating in one grid, what drives their choices and what makes eating well harder. People who follow a particular diet are asked why, and everyone else skips straight past it.",
    tags: ["diet survey", "eating habits survey", "nutrition survey", "food preferences", "healthy eating"],
    greeting: "Hi! This is a short survey about everyday eating habits. Answers are for general research, and nothing here is judged.",
    questions: [
      {
        ref: "diet",
        type: "single_select",
        title: "Do you follow a particular way of eating?",
        required: true,
        allowOther: true,
        options: [
          { label: "No particular diet" },
          { label: "Vegetarian" },
          { label: "Vegan" },
          { label: "Pescatarian" },
          { label: "Low carb" },
          { label: "Gluten-free" },
        ],
      },
      {
        ref: "diet_reason",
        type: "multi_select",
        title: "What are your main reasons for eating this way?",
        required: true,
        allowOther: true,
        options: [
          { label: "General health" },
          { label: "A medical condition or allergy" },
          { label: "Animal welfare or the environment" },
          { label: "Religion or culture" },
          { label: "Managing my weight" },
          { label: "Cost" },
        ],
      },
      {
        ref: "meals_per_day",
        type: "single_select",
        title: "On a typical day, how many proper meals do you eat?",
        required: true,
        options: [{ label: "One" }, { label: "Two" }, { label: "Three" }, { label: "More than three" }],
      },
      {
        ref: "food_frequency",
        type: "matrix",
        title: "How often do you have each of these?",
        required: true,
        rows: ["Fruit", "Vegetables", "Whole grains", "Red or processed meat", "Sugary drinks", "Takeaway or fast food"],
        columns: ["Rarely", "Once or twice a week", "Most days", "Every day"],
      },
      {
        ref: "snacking",
        type: "single_select",
        title: "How often do you snack between meals?",
        required: true,
        options: [
          { label: "Hardly ever" },
          { label: "Once a day" },
          { label: "Several times a day" },
          { label: "I graze more than I eat meals" },
        ],
      },
      {
        ref: "home_cooking",
        type: "opinion_scale",
        title: "In a normal week, on how many days do you cook at home?",
        required: true,
        steps: 8,
        startAt: 0,
        labelLow: "Never",
        labelHigh: "Every day",
      },
      {
        ref: "influences",
        type: "ranking",
        title: "Rank what most influences what you eat.",
        required: true,
        items: ["Taste", "Price", "Health", "Convenience", "Time to prepare", "What others in my home eat"],
      },
      {
        ref: "satisfaction",
        type: "rating",
        title: "How happy are you with the way you eat right now?",
        required: true,
        scale: 5,
      },
      {
        ref: "barriers",
        type: "multi_select",
        title: "What makes it harder to eat the way you'd like?",
        required: false,
        allowOther: true,
        options: [
          { label: "Not enough time" },
          { label: "Healthy food costs more" },
          { label: "Not confident cooking" },
          { label: "Long or irregular work hours" },
          { label: "Cravings and habits" },
          { label: "Nothing really, I'm happy with it" },
        ],
      },
      {
        ref: "easier",
        type: "long_text",
        title: "What one change would make eating well easier for you?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "age_group",
        type: "dropdown",
        title: "Which age group are you in?",
        required: false,
        options: [
          { label: "Under 18" },
          { label: "18–24" },
          { label: "25–34" },
          { label: "35–44" },
          { label: "45–54" },
          { label: "55–64" },
          { label: "65 or older" },
          { label: "Prefer not to say" },
        ],
      },
    ],
    branches: [{ when: "diet", is: "No particular diet", then: "meals_per_day" }],
    ending: {
      title: "Thank you for taking part 🥗",
      body: "Your answers are grouped with everyone else's to understand eating habits in general. This survey is not personal nutrition advice.",
    },
    guide: {
      questionsToConsider: [
        "What decision will the results inform: a menu, a product, a workplace wellbeing plan or a class project?",
        "Which foods in the frequency grid matter for your purpose, and which can go?",
        "Do you need the age question, or any other personal detail, to answer your research question?",
        "How will you tell people what the survey is for and who sees the answers?",
      ],
      howToUseResponses:
        "Start with the frequency grid and the ranking to see what a typical week looks like and what drives it. Then group responses by diet or by age band to see whether barriers differ between groups. The open answers about what would make eating easier are often the most practical part: count the themes that repeat. Keep the findings general, and do not use individual answers to give anyone nutrition advice.",
      customizeSteps: [
        "Edit the diet options and the food grid rows to match the foods and eating styles common in your audience.",
        "Remove the age question if you don't need it, and add a short line to the greeting saying who will see the results.",
        "Share the link where your audience already is, such as a staff newsletter, a class group or a customer email.",
      ],
      faqs: [
        {
          q: "What questions should a diet survey include?",
          a: "Ask about the eating pattern people follow, how often they eat key food groups, how much they cook, what influences their choices and what gets in the way. Keep personal details to what you really need.",
        },
        {
          q: "Can a diet survey be used to give nutrition advice?",
          a: "No. A general survey tells you about patterns across a group. Advice for an individual should come from a qualified professional.",
        },
        {
          q: "Should a diet survey be anonymous?",
          a: "Usually, yes. Eating habits feel personal, and people answer more honestly when they don't have to give a name. This template collects no contact details.",
        },
        {
          q: "Can I edit the food list?",
          a: "Yes. Clicking Use this template copies it into your account, where you can change every question, option and grid row before sharing it.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "facebook-survey",
    type: "survey",
    category: "market-research",
    goals: ["conduct-research", "collect-feedback"],
    roles: ["marketing"],
    searchName: "Facebook survey",
    title: "Facebook audience survey",
    icon: "ThumbsUp",
    metaDescription:
      "Ask the members of your Facebook Page or Group why they follow, what they want more of and what stops them joining in. Quiet readers get their own follow-up.",
    description: "Learn why people follow your Page or Group and what would get them more involved.",
    blurb:
      "Short enough to finish from a link in a post. It asks how people found you, why they stay and which formats they want, then splits on how they take part: members who comment or post say what got them talking, and quiet readers say what holds them back.",
    tags: ["facebook survey", "facebook group survey", "social media survey", "community feedback", "audience research"],
    greeting: "Thanks for being part of our community on Facebook. We'd love to know what you want from it. It takes about two minutes.",
    questions: [
      {
        ref: "how_found",
        type: "single_select",
        title: "How did you first find us on Facebook?",
        required: true,
        allowOther: true,
        options: [
          { label: "A friend shared or invited me" },
          { label: "It showed up in my feed" },
          { label: "I searched for it" },
          { label: "From our website or emails" },
          { label: "From an ad" },
        ],
      },
      {
        ref: "visit_frequency",
        type: "single_select",
        title: "How often do you see or check our posts?",
        required: true,
        options: [
          { label: "Every day" },
          { label: "A few times a week" },
          { label: "About once a week" },
          { label: "Less often than that" },
        ],
      },
      {
        ref: "reasons",
        type: "multi_select",
        title: "Why do you follow us? Pick up to three.",
        required: true,
        maxSelections: 3,
        allowOther: true,
        options: [
          { label: "Useful tips and information" },
          { label: "News and announcements" },
          { label: "Offers and deals" },
          { label: "Talking with people who share my interest" },
          { label: "Asking questions and getting help" },
          { label: "It's just entertaining" },
        ],
      },
      {
        ref: "formats",
        type: "ranking",
        title: "Rank the kinds of posts you'd most like to see.",
        required: true,
        items: ["Short videos", "Live sessions", "Photos", "How-to posts", "Questions for the community", "Updates and announcements"],
      },
      {
        ref: "participation",
        type: "single_select",
        title: "Which best describes how you take part?",
        required: true,
        options: [
          { label: "I mostly read" },
          { label: "I react or share" },
          { label: "I comment" },
          { label: "I post my own things" },
        ],
      },

      // Active members
      {
        ref: "best_post",
        type: "long_text",
        title: "Think of a post or discussion that got you to join in. What made it worth responding to?",
        required: false,
        maxLength: 600,
      },

      // Quiet readers
      {
        ref: "reader_barriers",
        type: "multi_select",
        title: "What usually stops you from commenting or posting?",
        required: true,
        allowOther: true,
        options: [
          { label: "I'm happy just reading" },
          { label: "I'm not sure my question is welcome" },
          { label: "I don't have time" },
          { label: "I prefer to keep my activity private" },
          { label: "The discussions don't feel relevant to me" },
        ],
      },

      // Everyone
      {
        ref: "usefulness",
        type: "rating",
        title: "How useful are our posts to you overall?",
        required: true,
        scale: 5,
      },
      {
        ref: "more_less",
        type: "long_text",
        title: "What would you like to see more of, or less of?",
        required: false,
        maxLength: 600,
      },
      {
        ref: "recommend",
        type: "nps",
        title: "How likely are you to recommend our Page or Group to a friend?",
        required: true,
      },
    ],
    branches: [
      { when: "participation", is: "I mostly read", then: "reader_barriers" },
      { when: "participation", is: "I react or share", then: "best_post" },
      { when: "participation", is: "I comment", then: "best_post" },
      { when: "participation", is: "I post my own things", then: "best_post" },
      { when: "best_post", always: true, then: "usefulness" },
    ],
    ending: {
      title: "Thanks, we'll put this to good use 👍",
      body: "We'll share what we heard, and what we're changing, in a post soon.",
    },
    guide: {
      questionsToConsider: [
        "Is this for a Page, a Group, or both? Adjust the wording so members recognise which one you mean.",
        "Which post formats can you realistically make more of, so the ranking only offers real choices?",
        "Do you want to hear from quiet readers most, and how will you reach people who rarely comment?",
        "Will you share the results back with the community, and when?",
      ],
      howToUseResponses:
        "Compare what people say they follow you for with what you actually post most. The ranking tells you which formats to try next; test one change at a time so you can see what moved. Read the quiet readers' answers closely, because they are usually most of your audience and rarely speak up. If many of them feel their questions aren't welcome, a pinned post that invites beginner questions is a cheap first fix. Post a short summary of what you learned so members see their answers mattered.",
      customizeSteps: [
        "Replace the reasons and format options with the topics and post types your Page or Group really covers.",
        "Share the link in a pinned post or a Group announcement, and mention how long it takes.",
        "After a couple of weeks, read the results in the dashboard and post back one thing you're changing because of them.",
      ],
      faqs: [
        {
          q: "How do I run a survey in a Facebook Group?",
          a: "Share the survey link in a post or announcement and pin it so new visitors see it. A link to a proper survey lets you ask follow-up questions that a simple poll can't.",
        },
        {
          q: "What should I ask my Facebook audience?",
          a: "Ask how they found you, why they follow, which kinds of posts they want and what stops them joining in. Those four answers tell you what to post and how to get more replies.",
        },
        {
          q: "Is this survey hosted inside Facebook?",
          a: "No. It is a separate survey you share by link, so it works the same for people who arrive from Facebook, email or your website.",
        },
        {
          q: "How do I get more members to answer?",
          a: "Keep it short, say how long it takes, and pin the post. Following up with a summary of the results makes people more likely to answer next time.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "insurance-questionnaire",
    type: "survey",
    category: "market-research",
    goals: ["conduct-research", "generate-leads"],
    roles: ["sales", "customer-success"],
    searchName: "Insurance questionnaire",
    title: "Insurance needs questionnaire",
    icon: "ShieldCheck",
    metaDescription:
      "Gather what an adviser needs before an insurance conversation: personal or business cover, current policies, renewal dates and priorities. Urgent cases are flagged.",
    description: "Collect needs, current cover and priorities before an insurance review call.",
    blurb:
      "Asks personal and business clients different questions, so a family never sees a question about employees. Anyone already insured is asked for their current provider and renewal date, and people who need cover within a week land on their own ending so the team can call them first.",
    tags: ["insurance questionnaire", "insurance needs assessment", "insurance intake", "insurance agent", "lead qualification"],
    greeting: "Hi! A few questions so our adviser understands what you need before you talk. It takes about three minutes.",
    questions: [
      {
        ref: "cover_for",
        type: "single_select",
        title: "Who is the cover for?",
        required: true,
        options: [{ label: "Me or my family" }, { label: "My business" }],
      },

      // Personal
      {
        ref: "personal_types",
        type: "multi_select",
        title: "Which kinds of cover would you like to talk about?",
        required: true,
        allowOther: true,
        options: [
          { label: "Health" },
          { label: "Life" },
          { label: "Home or renters" },
          { label: "Car" },
          { label: "Travel" },
          { label: "Income protection" },
        ],
      },
      {
        ref: "household",
        type: "dropdown",
        title: "Who is in your household?",
        required: true,
        options: [
          { label: "Just me" },
          { label: "Me and a partner" },
          { label: "Me, a partner and children" },
          { label: "Me and children" },
          { label: "Other family members too" },
        ],
      },
      {
        ref: "life_event",
        type: "single_select",
        title: "Has anything changed recently that prompted this?",
        required: true,
        allowOther: true,
        options: [
          { label: "Bought or moved home" },
          { label: "New baby or child" },
          { label: "Married or moved in together" },
          { label: "New car" },
          { label: "Changed job or retired" },
          { label: "Nothing in particular" },
        ],
      },

      // Business
      {
        ref: "business_type",
        type: "short_text",
        title: "What does your business do?",
        required: true,
        maxLength: 200,
      },
      {
        ref: "employees",
        type: "number",
        title: "How many people work in the business, including you?",
        required: true,
        min: 1,
        integerOnly: true,
      },
      {
        ref: "business_types",
        type: "multi_select",
        title: "Which kinds of business cover would you like to talk about?",
        required: true,
        allowOther: true,
        options: [
          { label: "General liability" },
          { label: "Professional indemnity" },
          { label: "Property and equipment" },
          { label: "Commercial vehicles" },
          { label: "Employee health or benefits" },
          { label: "Cyber" },
        ],
      },

      // Everyone
      {
        ref: "currently_insured",
        type: "yes_no",
        title: "Do you have any of this cover already?",
        required: true,
      },
      {
        ref: "current_cover",
        type: "long_text",
        title: "Who is it with, and what does it cover? A rough description is fine.",
        required: true,
        maxLength: 800,
      },
      {
        ref: "renewal_date",
        type: "date",
        title: "When does your current policy renew or end?",
        required: false,
      },
      {
        ref: "priorities",
        type: "ranking",
        title: "Rank what matters most to you in a policy.",
        required: true,
        items: [
          "A lower premium",
          "Broader cover",
          "A lower excess or deductible",
          "Fast, simple claims",
          "Everything with one provider",
        ],
      },
      {
        ref: "anything_else",
        type: "long_text",
        title: "Is there anything else the adviser should know before you talk?",
        required: false,
        maxLength: 800,
      },
      {
        ref: "contact",
        type: "contact_info",
        title: "How can the adviser reach you?",
        required: true,
        fields: ["first_name", "last_name", "email", "phone"],
      },
      {
        ref: "consent",
        type: "legal_consent",
        title: "Before you send this",
        required: true,
        consentText:
          "I agree that you may use these answers to contact me about insurance cover. I understand this questionnaire is not a quote or an offer of cover.",
      },
      {
        ref: "timeline",
        type: "single_select",
        title: "Last one: how soon do you need cover in place?",
        required: true,
        options: [
          { label: "Within a week" },
          { label: "Within a month" },
          { label: "In the next few months" },
          { label: "I'm just reviewing my options" },
        ],
      },
    ],
    branches: [
      { when: "cover_for", is: "Me or my family", then: "personal_types" },
      { when: "cover_for", is: "My business", then: "business_type" },
      { when: "life_event", always: true, then: "currently_insured" },
      { when: "currently_insured", is: true, then: "current_cover" },
      { when: "currently_insured", is: false, then: "priorities" },
      { when: "timeline", is: "Within a week", then: "end_urgent" },
    ],
    ending: {
      title: "Thanks, we have everything we need",
      body: "An adviser will review your answers and get in touch to arrange a conversation.",
    },
    endings: [
      {
        ref: "end_urgent",
        title: "Got it, we'll call you first ⏱️",
        body: "You need cover soon, so an adviser will contact you as early as possible. Keep your current policy details to hand if you have them.",
      },
    ],
    guide: {
      questionsToConsider: [
        "Which lines of cover do you actually offer? Remove any option you can't help with.",
        "What does your adviser need to prepare before a first call, and is every question here earning its place?",
        "Does your regulator or company require specific wording in the consent statement?",
        "Who picks up the urgent responses, and how fast can they call back?",
      ],
      howToUseResponses:
        "Call the urgent responses first; they are the people whose cover is about to lapse or who need something in place this week. For everyone else, sort by renewal date so you contact people a few weeks before their policy ends, when they are most open to a review. Read the ranking before the call so you lead with what the client cares about, whether that is price or broader cover. Have your compliance team approve the questions and consent wording, and give any recommendation or quote through your usual process.",
      customizeSteps: [
        "Trim the cover options to the products you offer, and rename them to match your own policy names.",
        "Have compliance review the consent text, then add your company name to it.",
        "Put the link on your website's contact page, or send it ahead of a booked review so the call starts with the facts.",
      ],
      faqs: [
        {
          q: "What should an insurance questionnaire ask?",
          a: "Who the cover is for, which types they want, what they already have and when it renews, what matters most to them, and how to reach them. Personal and business clients need different questions, so branch between them.",
        },
        {
          q: "Is an insurance questionnaire the same as a quote request?",
          a: "No. A questionnaire gathers needs and background before a conversation. A quote needs detailed information about a specific policy and is handled through the insurer's own process.",
        },
        {
          q: "Do I need a consent question on an insurance form?",
          a: "It is good practice to get clear permission before contacting someone about financial products. Check the exact wording with your compliance team.",
        },
        {
          q: "Can I send urgent enquiries somewhere different?",
          a: "Yes. This template sends anyone who needs cover within a week to a separate ending, and you can filter for those responses in the dashboard.",
        },
      ],
    },
  }),
];
