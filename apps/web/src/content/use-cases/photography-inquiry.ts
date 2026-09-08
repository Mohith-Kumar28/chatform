import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "photography-inquiry-form",
  name: "Photography enquiries",
  group: "Win more work",
  audience: "Wedding photographers, videographers, makeup artists, planners, venues",
  navBlurb: "Tell couples whether their date is free before you've even opened your phone.",

  title: "Photography enquiry form — answer the date and the price question instantly",
  description:
    "A wedding enquiry form that checks the date, gives your package range, and only puts real couples in your inbox. Stop answering thirty “what are your rates?” DMs a week. Free, with a prompt to paste in.",
  h1: "Every couple asks the same two things. Answer them at 1am.",
  lede:
    "Is my date free, and what do you charge. Answer those two and the enquiry is worth having. Dodge them and you get thirty DMs and one booking.",

  problem: {
    headline: "You are a pricing FAQ with a camera.",
    body: "Most of your enquiry replies are the same two sentences, typed again.",
    symptoms: [
      "“Hi! Are you free on the 14th of December and what are your packages?” — thirty times a week.",
      "You reply the next morning; they booked someone who replied that night.",
      "You get on a call and discover the budget is a third of your minimum.",
      "You are already booked on their date and you both find that out on message four.",
    ],
  },

  outcomes: [
    {
      title: "The date question answers itself",
      body: "It asks for the date first, checks it against the dates you have blocked, and tells them there and then whether you are free — which is the answer they messaged for.",
    },
    {
      title: "Your rates are said out loud",
      body: "Not hidden behind “drop me a message for pricing”. Couples who cannot afford you find out kindly and immediately, and stop being your Tuesday morning.",
    },
    {
      title: "You reply at 1am without being awake",
      body: "Wedding planning happens late at night, and the vendor who answers first very often gets the call. Yours answers instantly, every time.",
    },
    {
      title: "The calls you do take are real",
      body: "Date free, budget in range, style they actually want. That is a very different call from the one that starts at zero.",
    },
  ],

  demo: [
    { role: "bot", text: "Hi! Congratulations 🎉 First things first — what's the date?" },
    { role: "user", text: "14th December 2027" },
    {
      role: "bot",
      text: "Good news, I'm free on the 14th. Where's it happening?",
    },
    { role: "user", text: "at a farmhouse just outside Bangalore" },
    {
      role: "bot",
      text: "Lovely, I shoot a lot out that way. Is it the full day — mehendi, ceremony and reception — or just part of it?",
      chips: ["Everything", "Ceremony and reception", "Just one day"],
    },
    { role: "user", text: "Everything", picked: "Everything" },
    { role: "user", text: "what do you charge for that" },
    {
      role: "bot",
      text: "Three-day coverage starts at ₹1,85,000 and goes up depending on whether you want a second shooter and an album. Most couples booking all three days land around ₹2,20,000. Does that sit somewhere near what you had in mind?",
      chips: ["Yes, that works", "A bit more than we hoped", "Out of our range"],
    },
    { role: "user", text: "Yes, that works", picked: "Yes, that works" },
    {
      role: "bot",
      text: "Brilliant. Which of these feels most like you?",
      chips: ["Warm and candid", "Bright and editorial", "Dark and moody"],
    },
    { role: "user", text: "Warm and candid", picked: "Warm and candid" },
    { role: "bot", text: "That's very much my thing. What are your names, and the best number for you?" },
    { role: "user", text: "Ananya and Rohit, 9876543210" },
    {
      role: "end",
      text: "Lovely to meet you both.",
      body: "Your date is held for 48 hours. I'll send the full packages tonight — grab a call slot below if you'd rather talk it through.",
      cta: "Book a call",
    },
  ],
  demoCaption:
    "Date checked, price said out loud, style matched — before the photographer picked up their phone.",

  template: { slug: "client-intake", name: "New client intake" },

  draft: {
    prompt: "Wedding photography enquiry form",
    readUrl: "your-studio.com",
    readPages: 4,
    questions: [
      { label: "What's the date?", type: "Date", tone: "number" },
      { label: "Where's it happening?", type: "Short text", tone: "text" },
      { label: "How much coverage?", type: "Single select", tone: "choice" },
      { label: "Which style feels like you?", type: "Picture choice", tone: "choice" },
      { label: "Names and number", type: "Contact info", tone: "contact" },
    ],
  },

  shareSlug: "wedding-enquiry",
  qrLabel: "A QR code for wedding fairs and your printed cards",

  samplePrompt: `Build a wedding photography enquiry form for my studio.

Ask for the wedding date first, before anything else — it is the question couples actually messaged to ask, and it decides whether the rest of the conversation is worth having. Check it against the dates I have blocked out and tell them straight away whether I am free. If I am not, say so kindly, and offer to recommend someone rather than just ending.

Then ask where it is happening, and how much coverage they want — the full multi-day celebration, ceremony and reception only, or a single day.

When they ask what I charge, and they will, answer with the real starting figure for the coverage they have chosen, say what most couples at that level end up spending, and ask whether that sits near what they had in mind. If it is well below my minimum, say so warmly and end there with a recommendation.

Then ask which style feels most like them, offering my three main looks as pictures rather than words.

Finish with both their names and the best number, and offer a call slot.

The tone should be warm and celebratory — these are people planning the biggest day of their life, not buying a service. Congratulate them at the start and mean it.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. No card. Wedding enquiries arrive in seasonal floods and the free plan takes all of them.",
    },
    {
      title: "Put your website in and let it learn your voice",
      body: "Press New form, paste the example below, and include your portfolio site's address. It reads your pages and writes the questions in the words you already use for your packages, so it does not sound like a different studio.",
      figure: "prompt",
      note: "add your own site",
    },
    {
      title: "Block out the dates you are already booked",
      body: "Add your booked dates so a couple asking about one gets told immediately, kindly, and offered a recommendation instead. It is the single most useful thing this form does and it takes two minutes.",
      figure: "flow",
    },
    {
      title: "Write your prices down once",
      body: "In the Agent tab, put your real starting figures and what most couples spend. Yes, out loud. The couples who cannot afford you were never going to book, and the ones who can will trust you more for saying it.",
    },
    {
      title: "Put the link where couples find you",
      body: "Publish, then put the link in your Instagram bio, on your contact page, and in your automatic DM reply. Print the QR for wedding fairs — people scan it standing at your stall.",
      figure: "share",
    },
  ],

  whatYouGet: [
    {
      title: "Enquiries with a date and a budget",
      body: "Every one, without exception, because the form does not let a conversation finish without them.",
    },
    {
      title: "The couple's own words about their day",
      body: "Where it is, what kind of celebration, what style they like — worth reading before you ever get on a call.",
    },
    {
      title: "Fewer enquiries and more bookings",
      body: "The ones who leave were never going to book you. The rest arrive halfway to yes.",
    },
    {
      title: "Everything in a spreadsheet",
      body: "Dates, names, numbers, budgets, exportable whenever — useful when you are planning a season.",
    },
  ],

  resultFields: [
    { label: "Date", value: "14 Dec 2027 — free", tone: "number" },
    { label: "Coverage", value: "All three days", tone: "choice" },
    { label: "Style", value: "Warm and candid", tone: "choice" },
  ],
  responseReference: "CF-2884",

  faq: [
    {
      question: "Does it check my actual calendar?",
      answer:
        "No — and this is worth understanding properly. It checks a list of dates you have blocked out yourself, not a live calendar. So it will tell a couple you are booked on a date you told it about, but it will not know about something you added to Google Calendar this morning. Most photographers update the blocked list once a month and that is plenty; if you need genuine live availability, keep using a scheduling tool for that part.",
    },
    {
      question: "Should I really put my prices in it?",
      answer:
        "That is your call and there are two camps. The argument for is that the couples you lose to a price you stated were never going to book, and you get your evenings back. The argument against is that a package deserves a conversation. A middle path a lot of photographers take: state the starting figure and what most couples spend, and leave the detail to the call.",
    },
    {
      question: "Can I take the booking deposit through it?",
      answer:
        "You can show your payment link or a UPI QR at the end and it will record that they said they paid — but the money does not go through chatform and we cannot confirm it landed. For a wedding deposit, most people send an invoice after the call rather than taking it in the enquiry.",
    },
    {
      question: "Can it hold a date for them?",
      answer:
        "It can say a date is being held and tell them for how long — but it is your word, not an automatic lock. Nothing stops you taking another enquiry for that date, so treat it as a promise you make rather than a mechanism.",
    },
  ],

  related: ["quote-request-form", "contact-form-alternative", "client-intake-form"],
});
