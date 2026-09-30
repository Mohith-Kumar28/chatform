import { defineTemplate, type TemplateSeed } from "../define.js";

export const QUIZ_POPULAR: TemplateSeed[] = [
  defineTemplate({
    slug: "geography-quiz",
    type: "quiz",
    category: "popular",
    goals: ["engage-with-quizzes"],
    roles: ["education", "marketing"],
    searchName: "Geography quiz",
    title: "Geography quiz",
    icon: "Globe",
    metaDescription:
      "A ready-made geography quiz with scored answers: capitals, rivers, borders and a landlocked round. Players get a result that matches their score.",
    description: "Seven scored questions, from easy capitals to a tricky borders round.",
    blurb:
      "A mix of question styles so it never feels like a worksheet: multiple choice, a pick-all-that-apply round and a confidence check before the reveal. Each right answer carries a point, and the total picks one of three results.",
    tags: ["geography quiz", "trivia", "scored quiz", "classroom", "team quiz"],
    greeting: "Ready to test your geography? Seven questions, and you'll get a result at the end.",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on the scoreboard?", required: true, maxLength: 40 },
      {
        ref: "capital_au",
        type: "single_select",
        title: "What is the capital of Australia?",
        required: true,
        options: [{ label: "Sydney" }, { label: "Canberra", score: 1 }, { label: "Melbourne" }, { label: "Perth" }],
      },
      {
        ref: "longest_river",
        type: "single_select",
        title: "Which river is usually named the longest in the world?",
        required: true,
        options: [{ label: "Amazon" }, { label: "Yangtze" }, { label: "Nile", score: 1 }, { label: "Mississippi" }],
      },
      {
        ref: "landlocked",
        type: "multi_select",
        title: "Which of these countries have no coastline? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Bolivia", score: 1 },
          { label: "Portugal", score: -1 },
          { label: "Nepal", score: 1 },
          { label: "Chile", score: -1 },
          { label: "Switzerland", score: 1 },
        ],
      },
      {
        ref: "largest_desert",
        type: "single_select",
        title: "Not counting the polar ones, which is the largest desert?",
        required: true,
        options: [{ label: "Gobi" }, { label: "Kalahari" }, { label: "Sahara", score: 1 }, { label: "Atacama" }],
      },
      {
        ref: "most_countries",
        type: "single_select",
        title: "Which continent has the most countries?",
        required: true,
        options: [{ label: "Asia" }, { label: "Africa", score: 1 }, { label: "Europe" }, { label: "South America" }],
      },
      {
        ref: "everest",
        type: "single_select",
        title: "Mount Everest sits on the border of Nepal and which other country?",
        required: true,
        options: [{ label: "India" }, { label: "Bhutan" }, { label: "China", score: 1 }, { label: "Pakistan" }],
      },
      {
        ref: "smallest",
        type: "single_select",
        title: "What is the smallest country in the world by area?",
        required: true,
        options: [{ label: "Monaco" }, { label: "Vatican City", score: 1 }, { label: "San Marino" }, { label: "Malta" }],
      },
      {
        ref: "confidence",
        type: "opinion_scale",
        title: "Before you see your result: how well do you think you did?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Guessed it all",
        labelHigh: "Nailed it",
      },
    ],
    scoreEndings: [
      { atLeast: 8, then: "end_expert" },
      { atLeast: 5, then: "end_traveller" },
    ],
    endings: [
      {
        ref: "end_expert",
        title: "Atlas-level knowledge 🌍",
        body: "You got nearly everything right, landlocked countries included. That round catches most people out.",
      },
      {
        ref: "end_traveller",
        title: "Seasoned traveller ✈️",
        body: "A solid score. A couple of capitals and borders tripped you up, but you clearly know your way around a map.",
      },
    ],
    ending: {
      title: "Tourist in training 🧭",
      body: "Geography is full of traps like Canberra and the Vatican. Have another go and see how much you improve.",
    },
    guide: {
      questionsToConsider: [
        "Is this for a classroom, a pub quiz night or a brand campaign? That decides how hard the questions should be.",
        "Should a wrong pick in a pick-all-that-apply question cost a point, or just earn nothing?",
        "Do you want players' names and emails for a leaderboard or prize draw?",
      ],
      howToUseResponses:
        "Sort responses by score to find winners or to see who needs more practice. Look at which question most people got wrong: if nearly everyone missed it, it is either a great trap or badly worded. For a class, go over the most-missed answers in the next lesson.",
      customizeSteps: [
        "Replace the questions with your own topic, keeping one point on each correct option.",
        "Adjust the score bands so the top result stays hard to reach once you change the number of questions.",
        "Share the link or embed it, and add an email question if you want to send results or run a prize draw.",
      ],
      faqs: [
        {
          q: "How is the quiz scored?",
          a: "Each correct option is worth a point, and in the landlocked round a wrong pick takes one away. The total picks one of three result screens.",
        },
        {
          q: "Can I use this geography quiz in a classroom?",
          a: "Yes. Share one link with the class, ask for a first name instead of an email, and read the results by score afterwards.",
        },
        {
          q: "Can I change the number of questions?",
          a: "Yes. Add or remove questions, then move the score bands so the top result still needs nearly every answer right.",
        },
      ],
    },
  }),
];
