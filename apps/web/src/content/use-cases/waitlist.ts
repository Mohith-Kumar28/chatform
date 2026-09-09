import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "waitlist-form",
  name: "Waitlist signup",
  group: "Grow an audience",
  audience: "Founders, creators, D2C brands and anyone launching something",
  navBlurb: "Collect emails and the sentence that tells you what to build.",

  title: "Waitlist form — collect emails and find out why they signed up",
  description:
    "An email box gets you a list. This gets you a list plus a sentence from each person about what they are using now and what is broken about it. Free, unlimited signups, prompt included.",
  h1: "A waitlist of 300 emails tells you nothing.",
  lede:
    "A waitlist of 300 emails and 300 sentences about what people are stuck with today tells you what to build, what to charge, and who to email first.",

  problem: {
    headline: "You are collecting the least useful thing they would have given you.",
    body: "Everyone who signs up is willing to tell you more. You just did not ask.",
    symptoms: [
      "Launch day arrives and you email 300 people who all get the same message.",
      "You have no idea which of them would actually pay, so you treat them identically.",
      "You are guessing at your positioning while 300 people who could settle it sit in a list.",
      "Half of them signed up eight months ago and no longer remember doing it.",
    ],
  },

  outcomes: [
    {
      title: "You launch knowing what to say",
      body: "Three hundred people describing what they use today and what annoys them about it is the best positioning research you will ever get, and it costs one extra question.",
    },
    {
      title: "You know who to email first",
      body: "Score the answers as they come in, so on launch day the twenty people most likely to buy get a different, better email from the rest.",
    },
    {
      title: "People are more invested than they were",
      body: "Somebody who typed a sentence about their problem has spent something. They remember signing up, and they open the launch email.",
    },
    {
      title: "The signup still takes twenty seconds",
      body: "It is one question at a time, so it never looks like a survey — the email comes first and the rest feels like conversation, not a form.",
    },
  ],

  demo: [
    { role: "bot", text: "Hey! Good to have you. What's the best email to reach you on when we open up?" },
    { role: "user", text: "sam@studioleaf.co" },
    {
      role: "bot",
      text: "Got it. Quick one so we build the right thing first — what are you using for this today?",
    },
    { role: "user", text: "honestly just a spreadsheet and a lot of hope" },
    { role: "bot", text: "Ha — a classic. What's the bit that actually breaks?" },
    {
      role: "user",
      text: "chasing people. i have to manually follow up with everyone who half-fills it and i always forget someone",
    },
    {
      role: "bot",
      text: "That's really useful, thank you. And roughly how many of these are you dealing with in a month?",
      chips: ["Under 10", "10–50", "50–200", "Hundreds"],
    },
    { role: "user", text: "50–200", picked: "50–200" },
    {
      role: "bot",
      text: "Then you're exactly who we're building for. Would you want early access before the public launch, even if it's rough?",
      chips: ["Yes, put me in", "I'll wait for the finished thing"],
    },
    { role: "user", text: "Yes, put me in", picked: "Yes, put me in" },
    {
      role: "end",
      text: "You're in — number 218.",
      body: "We'll email you the week before early access opens. Nothing else, we promise.",
      cta: "Share it with someone",
    },
  ],
  demoCaption:
    "Every signup arrives with an email, a volume, a reason, and a yes or no on early access.",

  template: { slug: "waitlist", name: "Launch waitlist" },

  draft: {
    prompt: "Waitlist signup for a product launch",
    questions: [
      { label: "Best email for you", type: "Email", tone: "contact" },
      { label: "What are you using today?", type: "Long text", tone: "text" },
      { label: "What actually breaks?", type: "Long text", tone: "text" },
      { label: "How many a month?", type: "Single select", tone: "choice" },
      { label: "Want early access?", type: "Yes / no", tone: "choice" },
    ],
  },

  shareSlug: "join-the-waitlist",
  qrLabel: "A QR code for slides, stalls and stickers",

  samplePrompt: `Build a waitlist signup for the product I am launching.

Ask for their email first, so that even if they stop right there I still have the one thing I need.

Then, keeping it light and conversational, ask what they are using for this today. Read the answer — if it is short, like "spreadsheets" or "nothing", ask one friendly follow-up about what specifically breaks or annoys them about it. That sentence is the most valuable thing on the whole form.

Then ask roughly what volume they deal with in a month, offered as bands.

Then ask whether they would want early access before the public launch, even if it is rough and unfinished. Score anyone who says yes and deals with meaningful volume as a priority signup.

Finish by telling them their position on the list and promising we will not email them about anything else.

The tone should be casual and a bit human — this is a founder talking to an early user, not a company collecting a lead. Keep the whole thing under two minutes. Never ask for a phone number or a company size; nobody signing up for a waitlist wants to be sold to yet.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. Thirty seconds, no card. Signups are unlimited on the free plan, so a waitlist that goes well does not cost you anything.",
    },
    {
      title: "Ask for the email first, then the good question",
      body: "Paste the example below. The order is deliberate: email first so a drop-off still leaves you with something, then the question about what they use today — which is the whole reason to do this rather than an email box.",
      figure: "prompt",
      note: "email first, always",
    },
    {
      title: "Score the ones worth emailing first",
      body: "Give points for high volume and for saying yes to early access. On launch day you can sort your list and send the top slice a different, more personal email.",
      figure: "flow",
    },
    {
      title: "Put it on your landing page",
      body: "Publish, then either link it, embed it in the page, or have it pop up when someone clicks Join. It takes one line of code your web person will recognise, or none at all if you just use the link.",
      figure: "share",
    },
    {
      title: "Read the answers before you build anything else",
      body: "After the first fifty signups, read the sentences about what breaks. It is usually the clearest product direction you will get all quarter, and it is free.",
      figure: "results",
    },
  ],

  whatYouGet: [
    {
      title: "The list, obviously",
      body: "Every email, exportable to a spreadsheet or your email tool whenever you want it.",
    },
    {
      title: "A sentence from each person",
      body: "What they use today and what is broken about it, in their own words — the raw material for your landing page copy.",
    },
    {
      title: "A ranking, not just a pile",
      body: "Scored as they arrive, so launch day starts with the twenty people most likely to say yes.",
    },
    {
      title: "The ones who nearly signed up",
      body: "If somebody gives their email and then stops, you still have the email.",
    },
  ],

  resultFields: [
    { label: "Using today", value: "Spreadsheet", tone: "text" },
    { label: "Volume", value: "50–200 a month", tone: "number" },
    { label: "Early access", value: "Yes", tone: "choice" },
  ],
  responseReference: "CF-0218",

  faq: [
    {
      question: "Won't extra questions reduce signups?",
      answer:
        "Fewer people finish than would tap a single email box — that is honest and true. What you get in return is that everyone who did finish told you something worth knowing, and you still keep the email of everyone who dropped off after the first question. For most launches that trade is heavily worth it. Your own drop-off numbers will tell you within a week.",
    },
    {
      question: "Can I show people their position on the list?",
      answer:
        "You can end with a number, yes. What it will not do is keep a live running count that goes up on its own — the closing message is something you write, so treat the number as a nice touch rather than a live counter.",
    },
    {
      question: "Does it send the launch email for me?",
      answer:
        "No. It collects the list and hands it to you; sending goes through whatever you already use. Export to a spreadsheet, import into your email tool, and send from there.",
    },
    {
      question: "Can I stop the same person signing up five times?",
      answer:
        "Yes. Mark the email question \"no duplicate answers\" and a second signup on an address already in the list is refused — that keys on the address itself, so it holds. If you want a guarantee that survives someone using a second address, require sign-in and switch off resubmissions: that keys on the verified person. Switching off resubmissions on its own matches by network, which will also turn away a second genuine signup from the same office or campus.",
    },
  ],

  related: ["contact-form-alternative", "webinar-registration-form", "customer-feedback-form"],
});
