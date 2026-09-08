import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "client-intake-form",
  name: "Client intake",
  group: "Win more work",
  audience: "Coaches, consultants, designers and anyone with a first session",
  navBlurb: "Walk into session one already knowing what they actually want to fix.",

  title: "Client intake form for coaches and consultants",
  description:
    "An intake form clients finish, that gets past “I want to grow” to the thing they actually need. Saves your first session for work instead of discovery. Free, with a prompt you can paste in.",
  h1: "Stop spending session one finding out what they want.",
  lede:
    "They wrote “growth” in the box. Growth in revenue, in headcount, in audience? You will find out forty minutes into a paid hour.",

  problem: {
    headline: "The long intake form is the one nobody finishes.",
    body: "So you shorten it, and now you learn nothing.",
    symptoms: [
      "Twenty questions in a Google Form, and half your new clients quietly never send it back.",
      "The ones who do answer “what's your biggest challenge?” with a single word.",
      "You chase the missing answers by email the night before the session.",
      "The real problem only comes out in the last ten minutes of the first call.",
    ],
  },

  outcomes: [
    {
      title: "They finish it",
      body: "Nobody abandons a conversation the way they abandon a page of twenty boxes. The same questions get asked, one at a time, and people answer them because it does not feel like paperwork.",
    },
    {
      title: "You get a real answer, not a word",
      body: "When somebody writes “growth”, it asks which kind — and you start the session with the actual problem instead of excavating for it.",
    },
    {
      title: "Session one is worth what you charge for it",
      body: "You arrive knowing the goal, the history, what they have already tried and what they are afraid of. That is a completely different hour from the one that starts with “so, tell me about yourself”.",
    },
    {
      title: "Nothing chased by email",
      body: "They can start on their phone, stop, and finish later without losing anything. The agreement gets signed in the same conversation.",
    },
  ],

  demo: [
    { role: "bot", text: "Hi Sam — a few questions before we meet, so we don't spend our first session on them. What made you look for a coach now?" },
    { role: "user", text: "i want to grow the business" },
    {
      role: "bot",
      text: "Let's make that concrete — when you picture it having worked, what's different? More revenue, a bigger team, more of your time back, something else?",
      chips: ["More revenue", "Bigger team", "My time back", "Something else"],
    },
    { role: "user", text: "My time back", picked: "My time back" },
    { role: "bot", text: "That's a different problem from growth, and a much more solvable one. Roughly how many hours a week are you working now?" },
    { role: "user", text: "honestly probably 65-70" },
    { role: "bot", text: "And what's the piece you know you should have handed over months ago but haven't?" },
    { role: "user", text: "all the client onboarding. i do every kickoff call myself because i don't trust anyone else to do it properly" },
    {
      role: "bot",
      text: "That's a really useful answer — thank you. On a scale of 1 to 10, how ready do you feel to change that in the next three months?",
      card: { kind: "rating", max: 10, picked: 6 },
    },
    { role: "user", text: "6" },
    { role: "bot", text: "Honest. Last thing — have a read of the coaching agreement and sign if you're happy." },
    { role: "user", text: "signed" },
    {
      role: "end",
      text: "Thanks Sam — that's everything.",
      body: "See you Tuesday at 10. I'll have read all of this before we start.",
      cta: "Add to calendar",
    },
  ],
  demoCaption:
    "“I want to grow the business” became “I do every kickoff call myself because I don't trust anyone else.” That is the session.",

  template: { slug: "client-intake", name: "New client intake" },

  draft: {
    prompt: "Intake form for a business coach",
    questions: [
      { label: "What made you look for a coach now?", type: "Long text", tone: "text" },
      { label: "What's different when it's worked?", type: "Single select", tone: "choice" },
      { label: "Hours you work in a week", type: "Number", tone: "number" },
      { label: "How ready do you feel?", type: "Opinion scale", tone: "scale" },
      { label: "Coaching agreement", type: "Signature", tone: "advanced" },
    ],
  },

  shareSlug: "new-client-intake",
  qrLabel: "A QR code, if you ever hand this over in person",

  samplePrompt: `Build a new client intake form for my coaching practice.

Open by asking what made them look for a coach now — and read that answer properly. If it is vague, like "growth" or "get organised" or "the next level", ask one follow-up to find out what specifically is different when it has worked: more revenue, a bigger team, more of their own time back, or something else entirely.

Then ask what they have already tried and why it did not stick. Ask how many hours a week they are working. Ask what they know they should have handed over months ago but have not.

Ask on a scale of one to ten how ready they feel to change things in the next three months, and if they answer six or below, ask gently what is in the way.

Finish by showing them my coaching agreement to read and sign, then ask for the best email and phone number.

The tone should be warm, curious and completely unhurried — like a good first conversation, not a form. Never accept a one-word answer to a question about their goal. Always ask one more. If they ask what the sessions are like, how long the engagement usually runs, or what happens if they need to cancel, answer from my notes and then carry on.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. Thirty seconds, no card, and the free plan covers more clients than most practices take in a year.",
    },
    {
      title: "Describe your intake in plain words",
      body: "Press New form and paste the example below. Change the questions to yours — the important part is the instruction to never accept a one-word answer about their goal, because that is the whole reason this beats the form you have now.",
      figure: "prompt",
      note: "keep the follow-up rule",
    },
    {
      title: "Add the agreement they need to sign",
      body: "Add a signature question and paste your terms above it. They read and sign with a finger on their phone, in the same conversation, so nothing has to be printed, scanned or chased.",
      figure: "flow",
    },
    {
      title: "Let them stop and come back",
      body: "It saves as they go by default. A client can start on the train, stop, and finish it that evening from the same link with nothing lost. Long intake forms live or die on this.",
    },
    {
      title: "Send it with the booking confirmation",
      body: "Publish and paste the link into whatever you already send when someone books — your confirmation email, your welcome message. It fits anywhere a link fits.",
      figure: "share",
    },
  ],

  whatYouGet: [
    {
      title: "The conversation, before the conversation",
      body: "You read what they actually said, in their words, including the sentence they would never have said out loud on a first call.",
    },
    {
      title: "A signed agreement",
      body: "Drawn with a finger, stored with their answers, done before session one instead of during it.",
    },
    {
      title: "The half-finished ones too",
      body: "If a client starts and stops, you still have what they gave you — which is usually enough to know whether to follow up.",
    },
    {
      title: "Everything exportable",
      body: "Take it into your notes, your CRM, wherever your client records live.",
    },
  ],

  resultFields: [
    { label: "Real goal", value: "Time back, not growth", tone: "choice" },
    { label: "Hours a week", value: "65–70", tone: "number" },
    { label: "Readiness", value: "6 out of 10", tone: "scale" },
  ],
  responseReference: "CF-5104",

  faq: [
    {
      question: "Can I use this for therapy or counselling intake?",
      answer:
        "Please do not — not for anything involving protected health information. chatform is not HIPAA compliant, we do not sign a BAA, and building a clinical intake on it would put you on the wrong side of your obligations. Coaching, consulting, and business advisory work is squarely fine; clinical work needs a tool built for it.",
    },
    {
      question: "How long can the intake be?",
      answer:
        "Longer than you would dare make a normal form, which is the point. Because people answer one thing at a time and can stop and come back, a fifteen-question intake finishes at a rate a fifteen-field page never would. That said — every question should earn its place, and you will be able to see in your results exactly where people slow down.",
    },
    {
      question: "Is the signature legally binding?",
      answer:
        "It is a drawn signature captured with a timestamp, stored alongside their answers — the same kind of electronic signature most coaching and consulting agreements are signed with. Whether that meets your requirements depends on where you are and what you are signing, so if it is a high-value contract, take proper advice rather than ours.",
    },
    {
      question: "Can I ask different questions of different clients?",
      answer:
        "Yes. You can branch on anything they have already said — a first-time client gets asked more than a returning one, a corporate client gets asked about stakeholders, an individual does not. You set it up once and it takes the right path for each person automatically.",
    },
  ],

  related: ["contact-form-alternative", "appointment-booking-form", "testimonial-request-form"],
});
