import { defineTemplate, type TemplateSeed } from "../define.js";

export const QUIZ_MARKETING_2: TemplateSeed[] = [
  defineTemplate({
    slug: "flags-of-the-world-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["education", "marketing"],
    searchName: "Flags of the world quiz",
    title: "Flags of the world quiz",
    icon: "Flag",
    metaDescription:
      "A scored flags of the world quiz where each flag is described in words: maple leaves, cedar trees, dragons and a flag that is not a rectangle.",
    description: "Nine scored flag questions, each flag described in words, from maple leaves to dragons.",
    blurb:
      "Every flag is described in words, so players have to picture it rather than spot it, which makes a familiar topic feel fresh. Correct answers carry a point, the Southern Cross round takes one away for a wrong pick, and the total lands on one of three results.",
    tags: ["flags of the world quiz", "flag quiz", "vexillology trivia", "geography trivia", "classroom quiz", "pub quiz"],
    greeting: "Think you know your flags? I'll describe each one, you name the country. Nine rounds, and a result at the end.",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on the scoreboard?", required: true, maxLength: 40 },
      {
        ref: "maple_leaf",
        type: "single_select",
        title: "A red maple leaf on a white square, with a red band on each side. Whose flag is it?",
        required: true,
        options: [{ label: "Canada", score: 1 }, { label: "Peru" }, { label: "Austria" }, { label: "Lebanon" }],
      },
      {
        ref: "not_rectangle",
        type: "single_select",
        title: "Only one national flag is not a rectangle. It is two stacked red triangles with a blue border. Which country?",
        required: true,
        options: [{ label: "Bhutan" }, { label: "Nepal", score: 1 }, { label: "Sri Lanka" }, { label: "Maldives" }],
      },
      {
        ref: "cedar",
        type: "single_select",
        title: "Which country's flag has a green cedar tree between two red stripes?",
        required: true,
        options: [{ label: "Cyprus" }, { label: "Jordan" }, { label: "Lebanon", score: 1 }, { label: "Israel" }],
      },
      {
        ref: "nordic_cross",
        type: "single_select",
        title: "A white cross on a red background, with the upright pushed toward the pole. Which country?",
        required: true,
        options: [{ label: "Switzerland" }, { label: "Norway" }, { label: "Denmark", score: 1 }, { label: "Finland" }],
      },
      {
        ref: "red_disc",
        type: "single_select",
        title: "Japan's flag is a red disc on white. Which country flies a red disc on dark green?",
        required: true,
        options: [{ label: "Bangladesh", score: 1 }, { label: "Pakistan" }, { label: "Palau" }, { label: "Laos" }],
      },
      {
        ref: "southern_cross",
        type: "multi_select",
        title: "Which of these flags show the Southern Cross constellation? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Australia", score: 1 },
          { label: "Chile", score: -1 },
          { label: "New Zealand", score: 1 },
          { label: "Argentina", score: -1 },
          { label: "Papua New Guinea", score: 1 },
        ],
      },
      {
        ref: "dragon",
        type: "single_select",
        title: "Which country's flag shows a white dragon across a yellow and orange field?",
        required: true,
        options: [{ label: "China" }, { label: "Bhutan", score: 1 }, { label: "Mongolia" }, { label: "Vietnam" }],
      },
      {
        ref: "map",
        type: "single_select",
        title: "Which flag carries a copper-coloured map of the country itself, above two olive branches?",
        required: true,
        options: [{ label: "Malta" }, { label: "Iceland" }, { label: "Cyprus", score: 1 }, { label: "Jamaica" }],
      },
      {
        ref: "rifle",
        type: "single_select",
        title: "One national flag includes a rifle with a bayonet, crossed with a hoe. Which country?",
        required: true,
        options: [{ label: "Angola" }, { label: "Mozambique", score: 1 }, { label: "Zimbabwe" }, { label: "Kenya" }],
      },
      {
        ref: "confidence",
        type: "opinion_scale",
        title: "Before the reveal: how confident are you in your answers?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "Pure guesswork",
        labelHigh: "Flag expert",
      },
    ],
    scoreEndings: [
      { atLeast: 9, then: "end_expert" },
      { atLeast: 6, then: "end_spotter" },
    ],
    endings: [
      {
        ref: "end_expert",
        title: "Master of flags 🏁",
        body: "Nearly a perfect run, Southern Cross round included. You could referee a flag quiz rather than play in one.",
      },
      {
        ref: "end_spotter",
        title: "Sharp-eyed spotter",
        body: "A strong score. A couple of lookalikes caught you out, but you clearly notice more than the colours.",
      },
    ],
    ending: {
      title: "Flag fan in the making 🌍",
      body: "Flags are full of near twins, like Japan and Bangladesh. Have another go and see how many you pick up this time.",
    },
    guide: {
      questionsToConsider: [
        "Should the quiz cover the whole world, or one region your players know, such as Europe or Africa?",
        "Are your players new to flags or keen fans? Swap the maple leaf for a harder lookalike if they are experts.",
        "Should a wrong pick in the Southern Cross round cost a point, or simply earn nothing?",
        "Do you need an email for a prize draw, or is a first name on the scoreboard enough?",
      ],
      howToUseResponses:
        "Sort responses by score to find a winner or to see who needs more practice. Check which question most people missed: if it is a lookalike pair such as Denmark and Norway, it is a good teaching moment for the next lesson. The confidence rating next to each score shows who guessed well and who knew it.",
      customizeSteps: [
        "Swap in flags from the region you are teaching or celebrating, keeping one point on each correct option.",
        "Move the score bands so the top result still needs nearly every answer right once you change the question count.",
        "Share the link or embed it on your site, and read the scores in the dashboard or export them to CSV.",
      ],
      faqs: [
        {
          q: "Why are the flags described in words instead of shown?",
          a: "Describing a flag makes players picture it, which is harder and more memorable than spotting it. It also works well in a chat, one flag at a time.",
        },
        {
          q: "Which national flag is not a rectangle?",
          a: "Nepal. Its flag is two stacked triangles, and it is the only national flag that is not rectangular.",
        },
        {
          q: "How is the flags quiz scored?",
          a: "Each correct answer is worth a point. In the Southern Cross round each right country adds a point and each wrong one takes a point away, and the total picks one of three results.",
        },
        {
          q: "Can I use this flag quiz in a classroom?",
          a: "Yes. Share one link with the class, ask for first names only, and go over the most-missed flags afterwards.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "harry-potter-trivia-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["marketing", "education"],
    searchName: "Harry Potter trivia quiz",
    title: "Harry Potter trivia quiz",
    icon: "Sparkles",
    metaDescription:
      "A scored Harry Potter trivia quiz based on the seven books, from Platform 9¾ to the Horcruxes. Fans get a result that matches how much they know.",
    description: "Nine scored questions on the seven books, spoilers included.",
    blurb:
      "Written from the books, not the films, and it says so up front so nobody argues about a scene that was cut. The questions start gentle and end deep in Deathly Hallows, a Horcrux round takes a point for each wrong pick, and the total picks one of three results.",
    tags: ["harry potter trivia", "harry potter quiz", "book club quiz", "fan quiz", "trivia night"],
    greeting:
      "Welcome to the Harry Potter trivia quiz. Every question comes from the seven books, and there are spoilers for all of them. Ready?",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on the scoreboard?", required: true, maxLength: 40 },
      {
        ref: "house",
        type: "single_select",
        title: "Just for fun, no points: which house would the Sorting Hat put you in?",
        required: true,
        options: [{ label: "Gryffindor" }, { label: "Hufflepuff" }, { label: "Ravenclaw" }, { label: "Slytherin" }],
      },
      {
        ref: "platform",
        type: "single_select",
        title: "Which platform at King's Cross does the Hogwarts Express leave from?",
        required: true,
        options: [
          { label: "Platform 7½" },
          { label: "Platform 9¾", score: 1 },
          { label: "Platform 10¼" },
          { label: "Platform 12" },
        ],
      },
      {
        ref: "fluffy",
        type: "single_select",
        title: "What is the name of Hagrid's three-headed dog?",
        required: true,
        options: [{ label: "Fang" }, { label: "Norbert" }, { label: "Fluffy", score: 1 }, { label: "Buckbeak" }],
      },
      {
        ref: "luna",
        type: "single_select",
        title: "Which house is Luna Lovegood in?",
        required: true,
        options: [{ label: "Gryffindor" }, { label: "Ravenclaw", score: 1 }, { label: "Hufflepuff" }, { label: "Slytherin" }],
      },
      {
        ref: "scabbers",
        type: "single_select",
        title: "Ron's pet rat Scabbers turns out to be which wizard?",
        required: true,
        options: [
          { label: "Sirius Black" },
          { label: "Peter Pettigrew", score: 1 },
          { label: "Remus Lupin" },
          { label: "Barty Crouch Jr" },
        ],
      },
      {
        ref: "dobby",
        type: "single_select",
        title: "What does Harry trick Lucius Malfoy into handing Dobby, setting him free?",
        required: true,
        options: [{ label: "A glove" }, { label: "A sock", score: 1 }, { label: "A scarf" }, { label: "A hat" }],
      },
      {
        ref: "prince",
        type: "single_select",
        title: "Who is the Half-Blood Prince?",
        required: true,
        options: [
          { label: "Tom Riddle" },
          { label: "Harry Potter" },
          { label: "Severus Snape", score: 1 },
          { label: "Horace Slughorn" },
        ],
      },
      {
        ref: "horcruxes",
        type: "multi_select",
        title: "Which of these were Horcruxes? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Tom Riddle's diary", score: 1 },
          { label: "Godric Gryffindor's sword", score: -1 },
          { label: "Helga Hufflepuff's cup", score: 1 },
          { label: "The Elder Wand", score: -1 },
          { label: "Rowena Ravenclaw's diadem", score: 1 },
        ],
      },
      {
        ref: "patronus",
        type: "single_select",
        title: "What form does Hermione's Patronus take?",
        required: true,
        options: [{ label: "A cat" }, { label: "A hare" }, { label: "An otter", score: 1 }, { label: "A swan" }],
      },
      {
        ref: "bellatrix",
        type: "single_select",
        title: "In the Battle of Hogwarts, who defeats Bellatrix Lestrange?",
        required: true,
        options: [
          { label: "Neville Longbottom" },
          { label: "Molly Weasley", score: 1 },
          { label: "Minerva McGonagall" },
          { label: "Ginny Weasley" },
        ],
      },
    ],
    scoreEndings: [
      { atLeast: 10, then: "end_wizard" },
      { atLeast: 6, then: "end_student" },
    ],
    endings: [
      {
        ref: "end_wizard",
        title: "Order of Merlin, First Class ⚡",
        body: "You barely dropped a point, Horcruxes and all. Hermione would be quietly impressed.",
      },
      {
        ref: "end_student",
        title: "Top of the class",
        body: "A strong score. A few details from the later books slipped past you, but you know Hogwarts well.",
      },
    ],
    ending: {
      title: "Time for a reread 📚",
      body: "The later books hide a lot of detail. Pick one up again and come back for another try.",
    },
    guide: {
      questionsToConsider: [
        "Books, films or both? Mixing them causes arguments, so pick one and say so in the greeting.",
        "How far into the series should the questions go, and are your players fine with spoilers?",
        "Is this for a book club, a trivia night or a school library event? That sets how hard the questions should be.",
        "Do you want the no-points house question, or would you rather use that slot for another scored question?",
      ],
      howToUseResponses:
        "Sort responses by score to crown a winner or split players into teams of similar strength. The house question lets you run a house cup: export to CSV and total the scores by house. If most players miss the same question, it is either a great trap or it relies on a detail only film fans know, so check the wording.",
      customizeSteps: [
        "Decide on books, films or one single story, then edit the questions to match and keep one point on each correct option.",
        "Adjust the score bands so the top result still needs nearly every answer right after you add or remove questions.",
        "Share the link with your group or embed it on your library or club page, and read the scores in the dashboard.",
      ],
      faqs: [
        {
          q: "Is this Harry Potter quiz based on the books or the films?",
          a: "The books. A few answers differ in the films, so the greeting says which one it follows. You can edit any question to match the films instead.",
        },
        {
          q: "Does the Harry Potter trivia quiz have spoilers?",
          a: "Yes, for all seven books, including who the Half-Blood Prince is. The greeting warns players before the first question.",
        },
        {
          q: "How is the quiz scored?",
          a: "Each correct answer is worth a point. In the Horcrux round each right pick adds a point and each wrong one takes a point away. The total picks one of three results.",
        },
        {
          q: "Can I run a house cup with this quiz?",
          a: "Yes. An early question asks for a house without scoring it, so you can export the responses to CSV and add up scores per house.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "irish-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["education", "marketing"],
    searchName: "Irish quiz",
    title: "Irish quiz",
    icon: "Leaf",
    metaDescription:
      "A scored Irish quiz on geography, history, language and culture: the Shannon, the four provinces, Joyce and the Book of Kells. Great for St Patrick's Day.",
    description: "Ten scored questions on Ireland's places, words, books and history.",
    blurb:
      "Mixes four kinds of knowledge so no single expert runs away with it: geography, history, the Irish language and literature. A provinces round takes a point for each county picked by mistake, and the total lands on one of three results.",
    tags: ["irish quiz", "ireland trivia", "st patrick's day quiz", "irish culture quiz", "pub quiz"],
    greeting: "Fáilte! Ten questions about Ireland, from rivers to writers. Let's see how you get on.",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on the scoreboard?", required: true, maxLength: 40 },
      {
        ref: "st_patricks",
        type: "single_select",
        title: "An easy one to start. On what date is St Patrick's Day?",
        required: true,
        options: [{ label: "1 March" }, { label: "17 March", score: 1 }, { label: "23 April" }, { label: "30 November" }],
      },
      {
        ref: "easter_rising",
        type: "single_select",
        title: "In which year did the Easter Rising take place in Dublin?",
        required: true,
        options: [{ label: "1798" }, { label: "1845" }, { label: "1916", score: 1 }, { label: "1922" }],
      },
      {
        ref: "shannon",
        type: "single_select",
        title: "What is the longest river in Ireland?",
        required: true,
        options: [{ label: "The Shannon", score: 1 }, { label: "The Barrow" }, { label: "The Liffey" }, { label: "The Suir" }],
      },
      {
        ref: "mountain",
        type: "single_select",
        title: "Ireland's highest mountain stands in County Kerry. What is it called?",
        required: true,
        options: [
          { label: "Croagh Patrick" },
          { label: "Slieve Donard" },
          { label: "Carrauntoohil", score: 1 },
          { label: "Errigal" },
        ],
      },
      {
        ref: "provinces",
        type: "multi_select",
        title: "Which of these are provinces of Ireland? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Munster", score: 1 },
          { label: "Wicklow", score: -1 },
          { label: "Connacht", score: 1 },
          { label: "Kerry", score: -1 },
          { label: "Ulster", score: 1 },
        ],
      },
      {
        ref: "counties",
        type: "single_select",
        title: "How many traditional counties are there on the island of Ireland?",
        required: true,
        options: [{ label: "26" }, { label: "28" }, { label: "32", score: 1 }, { label: "36" }],
      },
      {
        ref: "slainte",
        type: "single_select",
        title: "When someone raises a glass and says 'Sláinte', what are they wishing you?",
        required: true,
        options: [{ label: "Good luck" }, { label: "Good health", score: 1 }, { label: "Safe travels" }, { label: "Welcome home" }],
      },
      {
        ref: "symbol",
        type: "single_select",
        title: "Which symbol appears on Irish euro coins and on the state seal?",
        required: true,
        options: [{ label: "The shamrock" }, { label: "The harp", score: 1 }, { label: "The Celtic cross" }, { label: "The claddagh" }],
      },
      {
        ref: "ulysses",
        type: "single_select",
        title: "Which Irish writer wrote Ulysses, set in Dublin on a single day in June 1904?",
        required: true,
        options: [
          { label: "Samuel Beckett" },
          { label: "Oscar Wilde" },
          { label: "James Joyce", score: 1 },
          { label: "W. B. Yeats" },
        ],
      },
      {
        ref: "kells",
        type: "single_select",
        title: "The Book of Kells is on display at which Dublin institution?",
        required: true,
        options: [
          { label: "Trinity College", score: 1 },
          { label: "Dublin Castle" },
          { label: "The National Gallery" },
          { label: "Christ Church Cathedral" },
        ],
      },
      {
        ref: "favourite_topic",
        type: "dropdown",
        title: "No points for this one: which topic would you like more of next time?",
        required: false,
        options: [{ label: "Geography" }, { label: "History" }, { label: "The Irish language" }, { label: "Books and music" }, { label: "Sport" }],
      },
    ],
    scoreEndings: [
      { atLeast: 11, then: "end_expert" },
      { atLeast: 7, then: "end_regular" },
    ],
    endings: [
      {
        ref: "end_expert",
        title: "Fair play to you ☘️",
        body: "The Rising, the provinces, Joyce and all. You know Ireland like someone who has walked a good bit of it.",
      },
      {
        ref: "end_regular",
        title: "Grand job",
        body: "A solid score. A few details slipped away, but you clearly know the country well. History and the provinces are a good place to brush up.",
      },
    ],
    ending: {
      title: "Plenty more to discover",
      body: "Ireland packs a lot into a small island. Have another go, or come back after a trip to Kerry.",
    },
    guide: {
      questionsToConsider: [
        "Which topics matter most to your group: geography, history, the Irish language, music or sport?",
        "Is this for St Patrick's Day, a classroom unit or a community event? That decides how hard to pitch it.",
        "Should the quiz include a few words of Irish, and do your players need hints on pronunciation?",
        "Do you want players' names only, or an email for a prize draw?",
      ],
      howToUseResponses:
        "Sort responses by score to find your winner. Look at the provinces round to see who knows the difference between a county and a province, which is the most common slip. The no-points topic question at the end tells you what to write more of for next year's quiz.",
      customizeSteps: [
        "Swap questions to suit your audience, for example more sport for a club night, keeping one point on each correct option.",
        "Move the score bands if you add or remove questions so the top result still needs nearly every answer right.",
        "Share the link or embed it on your site, then read the scores in the dashboard or export them to CSV.",
      ],
      faqs: [
        {
          q: "What are good questions for an Irish quiz?",
          a: "Mix geography, history, language and culture so no single expert dominates. Rivers, provinces, writers and a few everyday Irish words work well for most groups.",
        },
        {
          q: "What are the four provinces of Ireland?",
          a: "Leinster, Munster, Connacht and Ulster. The quiz uses them as a pick-all-that-apply round with two counties mixed in as traps.",
        },
        {
          q: "Can I use this as a St Patrick's Day quiz?",
          a: "Yes. Share the link before the day or run it live at your event, and read the results by score afterwards.",
        },
        {
          q: "How is the Irish quiz scored?",
          a: "Each correct answer is worth a point. In the provinces round a county picked by mistake takes a point away. The total picks one of three results.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "leadership-style-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["hr-people", "education"],
    searchName: "Leadership style quiz",
    title: "Leadership style quiz",
    icon: "Compass",
    metaDescription:
      "A leadership style quiz built on everyday team situations. Each answer places you on a scale from directing to delegating, with a practical tip per result.",
    description: "Six workplace situations that place you on a scale from directing to delegating.",
    blurb:
      "Instead of asking people to pick a label, it puts them in six real situations: a missed deadline, a new starter, a big decision. Each answer scores how much control you hand to the team, and the total lands on one of four styles with a strength and a blind spot for each.",
    tags: ["leadership style quiz", "management style quiz", "leadership assessment", "manager training", "team leadership"],
    greeting:
      "What kind of leader are you on a normal Tuesday? Six quick situations, no right or wrong answers. Pick what you would actually do, not what sounds best.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your first name?", required: true, maxLength: 40 },
      {
        ref: "team_size",
        type: "dropdown",
        title: "How many people report to you?",
        required: true,
        options: [
          { label: "None yet, I'm preparing to lead" },
          { label: "1 to 3" },
          { label: "4 to 8" },
          { label: "9 to 15" },
          { label: "More than 15" },
        ],
      },
      {
        ref: "new_project",
        type: "single_select",
        title: "A new project lands on your team. What do you do first?",
        required: true,
        options: [
          { label: "Share the goal and ask who wants to own it", score: 3 },
          { label: "Write the plan and hand out the tasks", score: 0 },
          { label: "Run a session so the team shapes the plan together", score: 2 },
          { label: "Draft a plan, then walk the team through why", score: 1 },
        ],
      },
      {
        ref: "missed_deadline",
        type: "single_select",
        title: "A reliable teammate misses a deadline. How do you handle it?",
        required: true,
        options: [
          { label: "Ask what got in the way and what they need from me", score: 2 },
          { label: "Set a new date and check in daily until it's done", score: 0 },
          { label: "Trust them to sort it and mention it at our next one-to-one", score: 3 },
          { label: "Go through the work with them and show where it slipped", score: 1 },
        ],
      },
      {
        ref: "new_starter",
        type: "single_select",
        title: "Someone new joins the team. How do you get them up to speed?",
        required: true,
        options: [
          { label: "Give them a clear checklist and review each step", score: 0 },
          { label: "Pair them with a teammate and let them find their way", score: 3 },
          { label: "Meet often, explain the reasons behind how we work", score: 1 },
          { label: "Ask how they like to learn and build the plan with them", score: 2 },
        ],
      },
      {
        ref: "big_decision",
        type: "single_select",
        title: "A decision needs making that affects the whole team. How is it made?",
        required: true,
        options: [
          { label: "I gather views, then make the call and explain it", score: 1 },
          { label: "We talk it through and agree together", score: 2 },
          { label: "I decide quickly and let everyone know", score: 0 },
          { label: "The people closest to the work decide", score: 3 },
        ],
      },
      {
        ref: "disagreement",
        type: "single_select",
        title: "Two teammates disagree on how to do a task. What do you do?",
        required: true,
        options: [
          { label: "Leave it with them; they'll work it out", score: 3 },
          { label: "Pick the approach and move them on", score: 0 },
          { label: "Help them talk it through until they agree", score: 2 },
          { label: "Hear both sides, choose, and explain my reasoning", score: 1 },
        ],
      },
      {
        ref: "feedback",
        type: "single_select",
        title: "How does your team usually hear how they're doing?",
        required: true,
        options: [
          { label: "I tell them straight away when something needs fixing", score: 0 },
          { label: "Regular coaching conversations with examples", score: 1 },
          { label: "They ask for it when they want it", score: 3 },
          { label: "Two-way check-ins where they rate themselves first", score: 2 },
        ],
      },
      {
        ref: "delegation_comfort",
        type: "opinion_scale",
        title: "How comfortable are you handing over work you could do faster yourself?",
        required: false,
        steps: 5,
        startAt: 1,
        labelLow: "I'd rather do it",
        labelHigh: "Happy to let go",
      },
      {
        ref: "growth",
        type: "long_text",
        title: "What's one thing about how you lead that you'd like to get better at?",
        required: false,
        maxLength: 600,
      },
    ],
    scoreEndings: [
      { atLeast: 14, then: "end_delegating" },
      { atLeast: 9, then: "end_supporting" },
      { atLeast: 5, then: "end_coaching" },
    ],
    endings: [
      {
        ref: "end_delegating",
        title: "You lead by delegating 🪁",
        body: "You hand real ownership to your team and trust them to run with it. That works best with experienced people; with newer ones, agree how and when you'll check in so freedom doesn't feel like being left alone.",
      },
      {
        ref: "end_supporting",
        title: "You lead by supporting",
        body: "You share decisions and help people find their own answers, which builds commitment. Watch for slow calls when the team needs a quick one; sometimes the kindest move is to decide.",
      },
      {
        ref: "end_coaching",
        title: "You lead by coaching",
        body: "You set the direction but explain the why and invite ideas, which is a strong fit for growing teams. The next step is letting people own a decision end to end, even if they'd do it differently.",
      },
    ],
    ending: {
      title: "You lead by directing",
      body: "You give clear instructions and keep a close eye on the work, which helps in a crisis or with new starters. Try handing one decision a week to the team and see who grows into it.",
    },
    guide: {
      questionsToConsider: [
        "Is this for self-reflection, a manager training session or a team workshop? The wording of the results should fit the setting.",
        "Do you want names, or should the quiz be anonymous so people answer honestly?",
        "Are the six situations close to what your managers actually face, or should you swap some for your own?",
        "What will you do with the results: a group discussion, one-to-ones or a training plan?",
      ],
      howToUseResponses:
        "Look at the spread of results across a group of managers rather than any one person. If most land on directing, delegation is a good theme for your next training session. Read the answers to the last question together: the things people want to get better at are the most useful input for planning coaching, and they are in the person's own words.",
      customizeSteps: [
        "Rewrite the situations to match your workplace, keeping each option's score between 0 for directing and 3 for delegating.",
        "Keep the option order mixed in every question you add, so the delegating answer is never always in the same spot.",
        "Share the link before a workshop or embed it in your training pages, and read the spread of results in the dashboard.",
      ],
      faqs: [
        {
          q: "What are the four leadership styles in this quiz?",
          a: "Directing, coaching, supporting and delegating. They run from giving close instructions to handing over full ownership, and each result explains when that style helps and when it gets in the way.",
        },
        {
          q: "How does the leadership style quiz decide my result?",
          a: "Each answer scores how much control you hand to the team, from 0 to 3. The total across six situations places you in one of four bands.",
        },
        {
          q: "Is one leadership style better than the others?",
          a: "No. Good leaders shift style with the person and the task. The quiz shows where you tend to start, which is useful to know when a situation needs something different.",
        },
        {
          q: "Is this a validated psychological assessment?",
          a: "No. It is a reflection tool for training and conversation, not a formal assessment, and should not be used to make decisions about someone's job.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "logo-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["marketing", "education"],
    searchName: "Logo quiz",
    title: "Logo quiz",
    icon: "Palette",
    metaDescription:
      "A scored logo quiz about the stories inside famous logos: FedEx's hidden arrow, Subaru's stars, Toblerone's bear. Players get a result by score.",
    description: "Ten scored questions about the hidden details in logos people see every day.",
    blurb:
      "Instead of asking players to name a logo from a picture, it asks what is hidden in it, so even people who see these marks daily have to think. A prancing horse round costs a point for each wrong pick, and the total lands on one of three results.",
    tags: ["logo quiz", "brand logo trivia", "design quiz", "marketing trivia", "branding quiz"],
    greeting: "You see these logos every day. But do you know what's hidden in them? Ten questions, then your result.",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on the scoreboard?", required: true, maxLength: 40 },
      {
        ref: "fedex",
        type: "single_select",
        title: "What's hidden in the white space between the 'E' and the 'x' of the FedEx logo?",
        required: true,
        options: [{ label: "A key" }, { label: "An arrow", score: 1 }, { label: "A plane" }, { label: "A letter F" }],
      },
      {
        ref: "amazon",
        type: "single_select",
        title: "The curved arrow under the Amazon wordmark runs between which two letters?",
        required: true,
        options: [{ label: "A to Z", score: 1 }, { label: "M to N" }, { label: "A to N" }, { label: "Z to A" }],
      },
      {
        ref: "starbucks",
        type: "single_select",
        title: "Who is the figure in the Starbucks logo?",
        required: true,
        options: [{ label: "A Norse sea goddess" }, { label: "A twin-tailed siren", score: 1 }, { label: "Poseidon's daughter" }, { label: "A ship's figurehead" }],
      },
      {
        ref: "tostitos",
        type: "single_select",
        title: "In the Tostitos wordmark, what do the two t's either side of the 'i' form?",
        required: true,
        options: [
          { label: "Two people sharing a chip over a bowl of salsa", score: 1 },
          { label: "A pair of corn stalks" },
          { label: "A sombrero" },
          { label: "Two hands waving" },
        ],
      },
      {
        ref: "horses",
        type: "multi_select",
        title: "Which of these car makers have a horse in their badge? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 4,
        options: [
          { label: "Ferrari", score: 1 },
          { label: "Lamborghini", score: -1 },
          { label: "Porsche", score: 1 },
          { label: "Peugeot", score: -1 },
        ],
      },
      {
        ref: "maserati",
        type: "single_select",
        title: "Which car maker uses a trident as its badge?",
        required: true,
        options: [{ label: "Alfa Romeo" }, { label: "Maserati", score: 1 }, { label: "Lancia" }, { label: "Bugatti" }],
      },
      {
        ref: "subaru",
        type: "single_select",
        title: "Subaru's six-star badge shows which star cluster?",
        required: true,
        options: [{ label: "Orion's Belt" }, { label: "The Plough" }, { label: "The Pleiades", score: 1 }, { label: "The Southern Cross" }],
      },
      {
        ref: "toblerone",
        type: "single_select",
        title: "Which animal is hidden in the mountain on the classic Toblerone logo?",
        required: true,
        options: [{ label: "A goat" }, { label: "An eagle" }, { label: "A bear", score: 1 }, { label: "A marmot" }],
      },
      {
        ref: "baskin",
        type: "single_select",
        title: "Which number is hidden in the pink 'BR' of the Baskin-Robbins logo?",
        required: true,
        options: [{ label: "7" }, { label: "13" }, { label: "31", score: 1 }, { label: "50" }],
      },
      {
        ref: "mitsubishi",
        type: "single_select",
        title: "Mitsubishi's three red shapes match its name. What does the name refer to?",
        required: true,
        options: [{ label: "Three diamonds", score: 1 }, { label: "Three mountains" }, { label: "Three arrows" }, { label: "Three petals" }],
      },
      {
        ref: "favourite",
        type: "long_text",
        title: "No points here: which logo do you think is the cleverest, and why?",
        required: false,
        maxLength: 400,
      },
    ],
    scoreEndings: [
      { atLeast: 10, then: "end_expert" },
      { atLeast: 6, then: "end_spotter" },
    ],
    endings: [
      {
        ref: "end_expert",
        title: "Brand detective 🔍",
        body: "Hidden arrows, star clusters, a bear in a mountain: you spotted nearly all of it. Designers would enjoy talking to you.",
      },
      {
        ref: "end_spotter",
        title: "Good eye",
        body: "A solid score. A couple of hidden details slipped past, but you notice more than most.",
      },
    ],
    ending: {
      title: "You'll never unsee them now",
      body: "Next time you pass a FedEx van or open a Toblerone, look again. Then come back and beat your score.",
    },
    guide: {
      questionsToConsider: [
        "Is this for a design class, a marketing team social or a brand campaign? That sets how obscure the details can be.",
        "Should the logos come from one field, such as cars or food, or a mix so everyone has a chance?",
        "Should a wrong pick in the horse round cost a point, or simply earn nothing?",
        "Are all the logos you plan to use still current? Brands redesign, so check each detail before you share.",
      ],
      howToUseResponses:
        "Sort responses by score to pick a winner. The answers to the last, unscored question are the fun part: read out the best reasons at the end of a session, or use them to start a discussion about what makes a logo memorable. If a question is missed by almost everyone, check the logo has not been redesigned since you wrote it.",
      customizeSteps: [
        "Swap in logos from your industry or region, keeping one point on each correct option and checking each detail is current.",
        "Adjust the score bands so the top result still needs nearly every answer right.",
        "Share the link or embed it on your site, then read the scores and favourite-logo answers in the dashboard.",
      ],
      faqs: [
        {
          q: "What makes a good logo quiz question?",
          a: "A detail people have seen many times without noticing, such as the arrow in the FedEx logo. It is harder than naming a logo and makes for a better reveal.",
        },
        {
          q: "Can I use logo images in the quiz?",
          a: "This version describes each logo in words, which keeps it fair in a chat. If you add images, only use ones you have the right to use.",
        },
        {
          q: "How is the logo quiz scored?",
          a: "Each correct answer is worth a point, and in the horse round a wrong pick takes a point away. The total picks one of three results.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "marketing-research-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["education", "marketing", "product-research"],
    searchName: "Marketing research quiz",
    title: "Marketing research quiz",
    icon: "FileSearch",
    metaDescription:
      "A scored marketing research quiz built on real scenarios: sampling, biased questions, primary versus secondary data and A/B tests. For students and teams.",
    description: "Ten scored scenario questions on sampling, question wording and reading results.",
    blurb:
      "Every question is a small research decision rather than a definition to recite, so it tests judgement, not memory. A spot-the-open-question round takes a point for each wrong pick, and the total lands on one of three results with a pointer on what to study next.",
    tags: ["marketing research quiz", "market research test", "survey design quiz", "marketing students", "research methods"],
    greeting:
      "Let's see how you'd run a real research project. Ten scenarios on sampling, questions and results. Take your time with each one.",
    questions: [
      { ref: "name", type: "short_text", title: "What's your name?", required: true, maxLength: 60 },
      {
        ref: "secondary",
        type: "single_select",
        title: "You read a government census report to size your market. What kind of data is that?",
        required: true,
        options: [
          { label: "Primary data" },
          { label: "Secondary data", score: 1 },
          { label: "Qualitative data" },
          { label: "Panel data" },
        ],
      },
      {
        ref: "why_churn",
        type: "single_select",
        title: "You don't yet know why customers are leaving. What's the best first step?",
        required: true,
        options: [
          { label: "A large multiple-choice survey" },
          { label: "In-depth interviews with people who left", score: 1 },
          { label: "An A/B test on the pricing page" },
          { label: "Counting website visits" },
        ],
      },
      {
        ref: "bad_question",
        type: "single_select",
        title: "What's wrong with asking 'How happy are you with our fast and friendly service?'",
        required: true,
        options: [
          { label: "Nothing, it's clear" },
          { label: "It's too short" },
          { label: "It asks about two things and suggests the answer", score: 1 },
          { label: "It should be a yes/no question" },
        ],
      },
      {
        ref: "random_sample",
        type: "single_select",
        title: "Every customer on your list has an equal chance of being picked. What is that called?",
        required: true,
        options: [
          { label: "A convenience sample" },
          { label: "A quota sample" },
          { label: "A simple random sample", score: 1 },
          { label: "A snowball sample" },
        ],
      },
      {
        ref: "selection_bias",
        type: "single_select",
        title: "You survey only people who visited your shop last Saturday about your brand as a whole. What's the main risk?",
        required: true,
        options: [
          { label: "The sample may not represent all your customers", score: 1 },
          { label: "The questions will be too long" },
          { label: "The data will be secondary" },
          { label: "There is no risk if the sample is large" },
        ],
      },
      {
        ref: "open_questions",
        type: "multi_select",
        title: "Which of these are open-ended questions? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "What made you choose us over other options?", score: 1 },
          { label: "Did you buy from us in the last month?", score: -1 },
          { label: "What would you change about the checkout?", score: 1 },
          { label: "Rate us from 1 to 5", score: -1 },
          { label: "Tell us about the last time you used the app", score: 1 },
        ],
      },
      {
        ref: "ab_test",
        type: "single_select",
        title: "Half your visitors see a green button and half see a blue one. What can this test show?",
        required: true,
        options: [
          { label: "Why people prefer one colour" },
          { label: "Whether the colour change causes a difference in clicks", score: 1 },
          { label: "Which colour your whole market likes" },
          { label: "Nothing without a focus group" },
        ],
      },
      {
        ref: "correlation",
        type: "single_select",
        title: "Customers who read your newsletter spend more. What can you safely conclude?",
        required: true,
        options: [
          { label: "The newsletter makes people spend more" },
          { label: "Reading and spending are linked, but the cause is unclear", score: 1 },
          { label: "High spenders never unsubscribe" },
          { label: "You should stop other marketing" },
        ],
      },
      {
        ref: "focus_group",
        type: "single_select",
        title: "What's a common weakness of focus groups?",
        required: true,
        options: [
          { label: "One loud voice can sway the rest", score: 1 },
          { label: "They only produce numbers" },
          { label: "They always need thousands of people" },
          { label: "They can't be recorded" },
        ],
      },
      {
        ref: "nps",
        type: "single_select",
        title: "A Net Promoter Score question asks customers about what?",
        required: true,
        options: [
          { label: "How much they paid" },
          { label: "How likely they are to recommend you", score: 1 },
          { label: "How often they buy" },
          { label: "How they found you" },
        ],
      },
      {
        ref: "hardest",
        type: "dropdown",
        title: "No points here: which topic felt hardest?",
        required: false,
        options: [
          { label: "Types of data" },
          { label: "Sampling" },
          { label: "Writing good questions" },
          { label: "Experiments and A/B tests" },
          { label: "Reading results" },
        ],
      },
    ],
    scoreEndings: [
      { atLeast: 11, then: "end_ready" },
      { atLeast: 7, then: "end_solid" },
    ],
    endings: [
      {
        ref: "end_ready",
        title: "Ready to run the study 📊",
        body: "You spotted the biased question, the sampling trap and the correlation. You'd plan research people can trust.",
      },
      {
        ref: "end_solid",
        title: "Solid foundations",
        body: "You know the basics well. Go back over sampling and the difference between a link and a cause, which is where most points slip.",
      },
    ],
    ending: {
      title: "Worth another pass",
      body: "Research methods take practice. Review how to write neutral questions and pick a fair sample, then try again.",
    },
    guide: {
      questionsToConsider: [
        "Is this a practice quiz for students, a check after training, or a warm-up for a team workshop?",
        "Which topics has your group actually covered? Drop any scenario that tests something you have not taught yet.",
        "Should a wrong pick in the open-question round cost a point, or just earn nothing?",
        "Do you need names to track progress, or should it be anonymous so people answer without pressure?",
      ],
      howToUseResponses:
        "Sort by score to see who is ready and who needs support. Then look question by question: the one most people get wrong is where your next lesson should start. The unscored question at the end tells you which topic felt hardest in the learners' own view, which does not always match where they lost points.",
      customizeSteps: [
        "Rewrite the scenarios around your own product or case study, keeping one point on each correct option.",
        "Move the score bands if you change the number of questions so the top result stays hard to reach.",
        "Share the link with your class or team, or embed it in your course page, and export the results to CSV.",
      ],
      faqs: [
        {
          q: "What topics should a marketing research quiz cover?",
          a: "Types of data, sampling, question wording, experiments and reading results. Scenario questions test whether someone can apply these, not just define them.",
        },
        {
          q: "What is the difference between primary and secondary research?",
          a: "Primary research is data you collect yourself, such as a survey or interviews. Secondary research uses data someone else already collected, such as a census or industry report.",
        },
        {
          q: "Can I use this quiz for a class?",
          a: "Yes. Share one link, ask for names if you want to track progress, and review the most-missed scenarios in the next session.",
        },
        {
          q: "How is the marketing research quiz scored?",
          a: "Each correct answer is worth a point. In the open-question round each right pick adds a point and each wrong one takes a point away. The total picks one of three results.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "product-recommendation-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes", "generate-leads"],
    roles: ["marketing", "sales"],
    searchName: "Product recommendation quiz",
    title: "Houseplant finder quiz",
    icon: "ShoppingBag",
    metaDescription:
      "A product recommendation quiz, shown for a plant shop: questions on pets, light and space match each shopper to one houseplant and say why it fits.",
    description: "Pets, light and space in, one houseplant that will survive the spot out.",
    blurb:
      "Built around a plant shop so you can see the pattern working, then swap in your own range. A must-have filter comes first in the logic: anyone with pets goes straight to a pet-safe pick. Everyone else is matched on the light their spot gets, and an unsure shopper gets the hardest plant to kill rather than a guess.",
    tags: ["product recommendation quiz", "product finder quiz", "houseplant quiz", "plant shop quiz", "shopping quiz"],
    greeting:
      "Looking for a plant that will actually last? Tell me a little about your home and I'll pick one for the spot you have in mind.",
    questions: [
      { ref: "name", type: "short_text", title: "First, what should I call you?", required: true, maxLength: 40 },
      {
        ref: "gift",
        type: "yes_no",
        title: "Is this plant a gift for someone else?",
        required: true,
      },
      {
        ref: "experience",
        type: "opinion_scale",
        title: "How have houseplants gone for you so far?",
        required: true,
        steps: 5,
        startAt: 1,
        labelLow: "I've lost a few",
        labelHigh: "Everything thrives",
      },
      {
        ref: "size",
        type: "single_select",
        title: "Where will it live?",
        required: true,
        options: [
          { label: "A shelf or desk, so something small" },
          { label: "A tabletop or windowsill" },
          { label: "On the floor, as a statement plant" },
        ],
      },
      {
        ref: "watering",
        type: "single_select",
        title: "Be honest: how often will it get watered?",
        required: true,
        options: [
          { label: "Every few days, I like looking after plants" },
          { label: "About once a week" },
          { label: "Whenever I remember" },
          { label: "I travel a lot" },
        ],
      },
      {
        ref: "email",
        type: "email",
        title: "Want a care card for your match? Leave your email and we'll send it over.",
        required: false,
      },
      {
        ref: "pets",
        type: "yes_no",
        title: "Are there cats or dogs at home that might chew on leaves?",
        required: true,
      },
      {
        ref: "light",
        type: "single_select",
        title: "Last one. How much light does that spot get?",
        required: true,
        options: [
          { label: "Direct sun for part of the day" },
          { label: "Bright, but out of direct sun" },
          { label: "Not much, it's away from the window" },
          { label: "I'm not sure" },
        ],
      },
    ],
    branches: [
      { when: "pets", is: true, then: "end_pet_safe" },
      { when: "light", is: "Direct sun for part of the day", then: "end_sun" },
      { when: "light", is: "Bright, but out of direct sun", then: "end_bright" },
      { when: "light", is: "Not much, it's away from the window", then: "end_low" },
    ],
    endings: [
      {
        ref: "end_pet_safe",
        title: "Your match: Parlour Palm 🌿",
        body: "It is widely listed as safe for cats and dogs, so a curious nibble is no emergency. It copes with low to medium light and likes to dry out a little between drinks; just keep it out of hot afternoon sun.",
      },
      {
        ref: "end_sun",
        title: "Your match: Jade Plant",
        body: "A succulent that loves a sunny sill and stores water in its thick leaves, so a missed week does it no harm. Water only when the soil is dry all the way down.",
      },
      {
        ref: "end_bright",
        title: "Your match: Monstera",
        body: "Bright, indirect light is exactly what it wants, and it rewards you with big split leaves. Water about once a week when the top few centimetres are dry, and give it room to spread.",
      },
      {
        ref: "end_low",
        title: "Your match: ZZ Plant",
        body: "Its glossy leaves keep going in dim corners where most plants give up, and it stores water in its roots, so it forgives long gaps between watering.",
      },
    ],
    ending: {
      title: "Your match: Snake Plant",
      body: "Not sure about the light is fine. A snake plant copes with almost any spot, from a bright window to a dim hallway, and only needs water every couple of weeks.",
    },
    guide: {
      questionsToConsider: [
        "What is the one thing that rules products out completely, like pets here, and does it come before the other deciding questions?",
        "Which single difference between your products should the final question capture: light, budget, skin type, size?",
        "What should an unsure shopper get: your most forgiving product, a bundle, or a chat with your team?",
        "Which answers change how you pack or follow up, such as the gift question or the plant size, even if they do not change the match?",
        "Have you told shoppers what they get for leaving an email?",
      ],
      howToUseResponses:
        "Count how many people land on each match. If one plant almost never comes up, the light question may be steering people away from it, or few shoppers have that kind of spot. Use the size and gift answers when you pack an order, and the watering and experience answers to decide which care tips go into a follow-up email. People who admit to losing plants are the ones who most need that care card.",
      customizeSteps: [
        "Replace the plants in the endings with your own products, and say in each one why it suits the answers that led there.",
        "Put your must-have filter before the deciding question, and rewrite that question so each option points to exactly one product.",
        "Test every path, then embed the quiz on your shop or category pages and read which products people match with in the dashboard.",
      ],
      faqs: [
        {
          q: "What is a product recommendation quiz?",
          a: "A short quiz that asks shoppers about their needs and suggests the product that fits. Each result names one product and gives the reason, so the choice feels personal rather than random.",
        },
        {
          q: "What questions should a product recommendation quiz ask?",
          a: "Only questions whose answers change the recommendation, plus a couple that help you pack or follow up. Start with anything that rules products out, like pets or allergies, and finish with the question that picks the product.",
        },
        {
          q: "How does the quiz decide which product to show?",
          a: "Branching logic. Pet owners go to the pet-safe plant, everyone else is routed by the light their spot gets, and anyone unsure lands on the most forgiving plant.",
        },
        {
          q: "Can I use this for products other than plants?",
          a: "Yes. The plant shop is an example. Swap in your products, rewrite the deciding questions and endings, and keep the same pattern of a filter first and a deciding question last.",
        },
      ],
    },
  }),

  defineTemplate({
    slug: "stranger-things-trivia-quiz",
    type: "quiz",
    category: "marketing",
    goals: ["engage-with-quizzes"],
    roles: ["marketing"],
    searchName: "Stranger Things trivia quiz",
    title: "Stranger Things trivia quiz",
    icon: "Zap",
    metaDescription:
      "A scored Stranger Things trivia quiz covering seasons 1 to 4: Eggos, Christmas lights, Starcourt Mall and Vecna. Fans get a result that matches their score.",
    description: "Ten scored questions on seasons 1 to 4, with spoilers up to Vecna.",
    blurb:
      "Covers seasons 1 to 4 and says so up front, so nobody gets spoiled or tripped up by a season they haven't watched. It moves through the show in order, from Will going missing to the Hellfire Club, a pick-all round takes a point for each wrong name, and the total lands on one of three results.",
    tags: ["stranger things trivia", "stranger things quiz", "tv trivia", "fan quiz", "trivia night"],
    greeting:
      "Welcome to Hawkins. This quiz covers seasons 1 to 4, with spoilers all the way up to Vecna. Ten questions, then your result.",
    questions: [
      { ref: "player", type: "short_text", title: "What name should go on the scoreboard?", required: true, maxLength: 40 },
      {
        ref: "town",
        type: "single_select",
        title: "In which US state is the town of Hawkins?",
        required: true,
        options: [{ label: "Ohio" }, { label: "Indiana", score: 1 }, { label: "Illinois" }, { label: "Iowa" }],
      },
      {
        ref: "game",
        type: "single_select",
        title: "Which game are the boys playing in the basement when season 1 begins?",
        required: true,
        options: [{ label: "Monopoly" }, { label: "Dungeons & Dragons", score: 1 }, { label: "Risk" }, { label: "Clue" }],
      },
      {
        ref: "lights",
        type: "single_select",
        title: "How does Joyce talk to Will while he's trapped in the Upside Down?",
        required: true,
        options: [
          { label: "Through a radio" },
          { label: "Through Christmas lights", score: 1 },
          { label: "Through a walkie-talkie" },
          { label: "Through the TV" },
        ],
      },
      {
        ref: "eggo",
        type: "single_select",
        title: "What's Eleven's favourite food?",
        required: true,
        options: [{ label: "Pancakes" }, { label: "Eggo waffles", score: 1 }, { label: "Pizza" }, { label: "Mac and cheese" }],
      },
      {
        ref: "mall",
        type: "single_select",
        title: "What's the name of the new mall at the centre of season 3?",
        required: true,
        options: [{ label: "Hawkins Plaza" }, { label: "Starcourt Mall", score: 1 }, { label: "Pinewood Mall" }, { label: "Lakeside Center" }],
      },
      {
        ref: "scoops",
        type: "single_select",
        title: "Where do Steve and Robin work in season 3?",
        required: true,
        options: [
          { label: "Family Video" },
          { label: "Scoops Ahoy", score: 1 },
          { label: "The Hawkins Post" },
          { label: "Palace Arcade" },
        ],
      },
      {
        ref: "vecna",
        type: "single_select",
        title: "What name do the kids give the villain of season 4?",
        required: true,
        options: [{ label: "The Demogorgon" }, { label: "The Mind Flayer" }, { label: "Vecna", score: 1 }, { label: "The Shadow Monster" }],
      },
      {
        ref: "song",
        type: "single_select",
        title: "Which song pulls Max out of Vecna's trance?",
        required: true,
        options: [
          { label: "Running Up That Hill", score: 1 },
          { label: "Should I Stay or Should I Go" },
          { label: "Every Breath You Take" },
          { label: "Africa" },
        ],
      },
      {
        ref: "hellfire",
        type: "multi_select",
        title: "Which of these characters are in the Hellfire Club in season 4? Pick all that apply.",
        required: true,
        minSelections: 1,
        maxSelections: 5,
        options: [
          { label: "Eddie Munson", score: 1 },
          { label: "Steve Harrington", score: -1 },
          { label: "Dustin Henderson", score: 1 },
          { label: "Nancy Wheeler", score: -1 },
          { label: "Mike Wheeler", score: 1 },
        ],
      },
      {
        ref: "guitar",
        type: "single_select",
        title: "Which Metallica track does Eddie play on guitar in the Upside Down?",
        required: true,
        options: [{ label: "Enter Sandman" }, { label: "Master of Puppets", score: 1 }, { label: "One" }, { label: "Fade to Black" }],
      },
      {
        ref: "favourite_season",
        type: "rating",
        title: "No points here: how would you rate season 4 overall?",
        required: false,
        scale: 5,
      },
    ],
    scoreEndings: [
      { atLeast: 11, then: "end_hellfire" },
      { atLeast: 7, then: "end_party" },
    ],
    endings: [
      {
        ref: "end_hellfire",
        title: "Hellfire Club approved 🎲",
        body: "Nearly flawless, right down to the Metallica track. Eddie would hand you the guitar.",
      },
      {
        ref: "end_party",
        title: "Part of the party",
        body: "A strong score. A few details got away from you, but you know your way around Hawkins.",
      },
    ],
    ending: {
      title: "Time for a rewatch 📺",
      body: "The Upside Down hides plenty of detail. Put season 1 back on and come back for another try.",
    },
    guide: {
      questionsToConsider: [
        "Which seasons have your players watched? Say it in the greeting so nobody gets spoiled.",
        "Is this for a watch party, a trivia night or a fan community? That decides how deep the questions should go.",
        "Should a wrong name in the Hellfire round cost a point, or simply earn nothing?",
        "Do you want to add questions on newer episodes once your audience has caught up?",
      ],
      howToUseResponses:
        "Sort by score to crown a winner, or pair high and low scorers into teams for a second round. Check which question most players missed: if it is from one season, that is a sign many of your players have not seen it yet. The unscored season rating is a fun talking point to share with the group afterwards.",
      customizeSteps: [
        "Set the season range for your group and edit the questions to match, keeping one point on each correct option.",
        "Adjust the score bands if you add or remove questions so the top result still needs nearly every answer right.",
        "Share the link before a watch party or embed it on your fan site, and read the scores in the dashboard.",
      ],
      faqs: [
        {
          q: "Which seasons does this Stranger Things quiz cover?",
          a: "Seasons 1 to 4. The greeting says so, and you can add questions on later episodes once your players have watched them.",
        },
        {
          q: "Does the quiz contain spoilers?",
          a: "Yes, up to the end of season 4, including the villain's identity. Warn players in the greeting or trim the later questions if your group is behind.",
        },
        {
          q: "How is the Stranger Things trivia quiz scored?",
          a: "Each correct answer is worth a point. In the Hellfire Club round each right name adds a point and each wrong one takes a point away. The total picks one of three results.",
        },
      ],
    },
  }),
];
