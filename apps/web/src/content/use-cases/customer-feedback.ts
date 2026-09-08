import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "customer-feedback-form",
  name: "Customer feedback",
  group: "Hear from customers",
  audience: "Restaurants, cafés, salons, gyms, hotels and homestays",
  navBlurb: "Catch the unhappy customer before they reach Google. Send the happy ones there.",

  title: "Customer feedback form — a QR on the table, an answer before the review",
  description:
    "A feedback form people scan at the table and actually finish. Two stars asks what happened, straight away. Five stars gets your Google review link. Free, with a prompt you can paste in.",
  h1: "The one-star review was a fixable evening.",
  lede:
    "They were unhappy for forty minutes while sitting in your restaurant, and the first you heard of it was on Google two days later.",

  problem: {
    headline: "Feedback arrives too late to be worth anything.",
    body: "By the time you read it, they have gone home and told everyone.",
    symptoms: [
      "The comment card nobody fills in, in a holder nobody looks at.",
      "A one-star review with no detail — you cannot even work out which night it was.",
      "Your happiest customers say lovely things to the staff and nothing to Google.",
      "You have a rating, but no idea what actually happened to cause it.",
    ],
  },

  outcomes: [
    {
      title: "You hear about it the same night",
      body: "A two-star tap immediately asks what happened, and it lands with you while they are still on the premises. Sometimes you can fix it before they leave, which is the only fix that really counts.",
    },
    {
      title: "The good ones go to Google",
      body: "Somebody who has just given you five stars is at their most willing. Handing them the review link right then is worth more than any campaign.",
    },
    {
      title: "You find out what, not just how much",
      body: "“Three stars” is a number. “The mains took forty minutes and nobody said anything” is something you can act on tomorrow.",
    },
    {
      title: "People actually do it",
      body: "One question at a time on their own phone, scanned off the table, is a different proposition from a card and a pen. It is quick enough that it happens while they wait for the bill.",
    },
  ],

  demo: [
    {
      role: "bot",
      text: "Thanks for coming in tonight! How was it, out of five?",
      card: { kind: "rating", max: 5, picked: 2 },
    },
    { role: "user", text: "2" },
    { role: "bot", text: "Sorry to hear that — genuinely. What happened?" },
    { role: "user", text: "waited nearly 45 min for mains and nobody came over to say anything" },
    {
      role: "bot",
      text: "That's not good enough and I'm sorry. Was the food itself alright when it did arrive, or was that a problem too?",
    },
    { role: "user", text: "food was actually really good. it was just the wait and nobody telling us" },
    {
      role: "bot",
      text: "Understood — thank you for being specific, it helps. Are you still here? The manager would like to come over.",
      chips: ["Yes, still here", "No, we've left"],
    },
    { role: "user", text: "Yes, still here", picked: "Yes, still here" },
    {
      role: "end",
      text: "She's on her way over now.",
      body: "Thank you for telling us instead of leaving. It genuinely makes a difference.",
    },
  ],
  demoCaption:
    "Two stars, a specific reason, and the manager at the table — all before the bill arrived.",

  template: { slug: "csat-survey", name: "Customer satisfaction" },

  draft: {
    prompt: "Feedback form for a restaurant, QR code on the table",
    questions: [
      { label: "How was it, out of five?", type: "Rating", tone: "scale" },
      { label: "What happened?", type: "Long text", tone: "text" },
      { label: "How was the food itself?", type: "Rating", tone: "scale" },
      { label: "Are you still here?", type: "Yes / no", tone: "choice" },
      { label: "Anything else?", type: "Long text", tone: "text" },
    ],
  },

  shareSlug: "how-was-it",
  qrLabel: "A QR code for the table, the bill folder and the door",

  samplePrompt: `Build a feedback form for my restaurant that people scan from a QR code on the table.

Open by thanking them for coming in and asking how it was, out of five stars. Keep it to one question — most people will not get past a second one if the first is not this.

If they give four or five, say thank you warmly, ask briefly if anything stood out, and then offer them the link to leave a Google review. Do not ask them anything else.

If they give three or below, do not thank them and move on — ask what happened, and mean it. Then read what they say and ask one specific follow-up about the part that seems to matter most, whether that is the food, the wait, the service or the room. Then ask whether they are still on the premises, and if they are, tell them the manager would like to come over.

Keep it very short either way. Someone doing this at a table has about ninety seconds of goodwill and the whole thing needs to fit inside that.

The tone should sound like the owner, not a survey company. If somebody is unhappy, apologise plainly and do not be defensive.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up — thirty seconds, no card. Feedback comes in bursts on busy nights and the free plan takes as much of it as you get.",
    },
    {
      title: "Keep it to four questions or fewer",
      body: "Paste the example below. The temptation is to ask about everything — the food, the room, the service, the music. Resist it. A table has about ninety seconds of goodwill and a long form spends all of it before you learn anything.",
      figure: "prompt",
      note: "shorter than you think",
    },
    {
      title: "Split it at three stars",
      body: "Four and five stars end with your Google review link. Three and below go somewhere completely different — a real apology, a specific follow-up question, and an offer to fetch the manager. Never show the review link to an unhappy customer.",
      figure: "flow",
    },
    {
      title: "Print the QR and put it where they sit",
      body: "Publish and download the QR code. Table talkers, the bill folder, the back of the menu, the door on the way out. People scan it while they are waiting for the card machine.",
      figure: "share",
    },
    {
      title: "Read it the next morning",
      body: "Every response is the whole conversation, so you can see the night it happened and what was actually said. Check it with your coffee before service.",
      figure: "results",
    },
  ],

  whatYouGet: [
    {
      title: "The reason, not just the rating",
      body: "In their words, on the night, with enough detail to know which shift and which table.",
    },
    {
      title: "More Google reviews",
      body: "Because you asked the happy ones at the exact moment they were happy, instead of a week later by email.",
    },
    {
      title: "A pattern after a fortnight",
      body: "Twenty responses in, the same complaint starts repeating and you know exactly what to fix first.",
    },
    {
      title: "Something to show the team",
      body: "Real words from real customers beat a manager's opinion in every staff meeting ever held.",
    },
  ],

  resultFields: [
    { label: "Rating", value: "2 out of 5", tone: "scale" },
    { label: "Issue", value: "45 min wait, no update", tone: "text" },
    { label: "Still on site", value: "Yes", tone: "choice" },
  ],
  responseReference: "CF-7715",

  faq: [
    {
      question: "Do people really scan a QR code at the table?",
      answer:
        "Far more than fill in a comment card, and much more than answer an email two days later. The things that make the difference are putting it where they are already sitting, saying how long it takes, and keeping it genuinely short. If the first thing on screen is one friendly question rather than a page of boxes, most people start.",
    },
    {
      question: "Is it fair to only show the review link to happy customers?",
      answer:
        "It is worth thinking about, and the line matters. What you should never do is stop an unhappy customer leaving a public review — they can, and they should be able to. What you are doing here is choosing who you personally ask for one, which is what every business does anyway. Ask the happy ones, and give the unhappy ones a faster, more direct route to you.",
    },
    {
      question: "Can I ask for it in the local language?",
      answer:
        "Partly. If a customer writes in another language it will reply in that language for the rest of that conversation. What you cannot do yet is publish one form with your questions written out in two languages and let people pick. If most of your customers would want that, this is a real limitation today.",
    },
    {
      question: "Can I see whether it is a particular night or a particular shift?",
      answer:
        "Yes — every response is timestamped, so patterns by night and by service show up quickly. You can also add a question about which meal it was if you want to split it more precisely than that.",
    },
  ],

  related: ["testimonial-request-form", "appointment-booking-form", "admission-enquiry-form"],
});
