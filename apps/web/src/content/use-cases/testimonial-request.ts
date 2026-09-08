import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "testimonial-request-form",
  name: "Testimonials",
  group: "Hear from customers",
  audience: "Freelancers, agencies, course creators, wedding and local businesses",
  navBlurb: "Turn “they were great!” into a quote you can actually put on your website.",

  title: "Testimonial request form — get quotes you can actually use",
  description:
    "Most testimonial forms collect “great service, thanks!”, which you cannot put on a website. This one asks what it was like before, so you get a specific, quotable line — plus permission to publish it. Free, with a prompt to paste in.",
  h1: "“They were great!” is not a testimonial.",
  lede:
    "It is a nice thing to receive and completely useless on a landing page. The line you need is the one about what it was like before you.",

  problem: {
    headline: "Happy clients give you nothing to work with.",
    body: "Not because they are not happy. Because you asked them a question with no good short answer.",
    symptoms: [
      "“Amazing to work with, highly recommend!” — true, and interchangeable with every other testimonial on the internet.",
      "You feel rude asking a follow-up, so you publish the vague one.",
      "You are never quite sure you are allowed to use their name and photo.",
      "The unhappy ones say nothing to you and everything to Google.",
    ],
  },

  outcomes: [
    {
      title: "Specific quotes, not compliments",
      body: "The line that sells is the one with a number or a before in it. “Our site took nine seconds to load, now it's under two” does work that “great service” cannot.",
    },
    {
      title: "Written permission, in the same breath",
      body: "It asks whether you may publish the quote, their name and their photo — so you never have to send that awkward second email, and you never have to wonder.",
    },
    {
      title: "The happy ones go on to Google",
      body: "Somebody who has just spent two minutes describing why they liked you is at their most willing. That is the moment to hand them the review link, not a week later.",
    },
    {
      title: "The unhappy ones come to you first",
      body: "A low score can end somewhere else entirely — a private note to you instead of a public star rating. You get to fix it before it becomes a review.",
    },
  ],

  demo: [
    {
      role: "bot",
      text: "Hi Meera! Quick one — how did the whole thing go, out of five?",
      card: { kind: "rating", max: 5, picked: 5 },
    },
    { role: "user", text: "5" },
    { role: "bot", text: "Lovely, thank you. In a sentence, what did we actually do for you?" },
    { role: "user", text: "you redid our website, it's great now" },
    {
      role: "bot",
      text: "Glad you like it! Can I ask what it was like before — what was the thing that was actually bothering you?",
    },
    {
      role: "user",
      text: "it took about 9 seconds to load on mobile and we couldn't change anything ourselves, every tiny edit meant emailing someone and waiting 3 days",
    },
    { role: "bot", text: "That's really helpful. And has anything actually changed since — anything you've noticed in the business?" },
    { role: "user", text: "enquiries are up, maybe a third more? and i updated the pricing page myself last week which felt amazing honestly" },
    {
      role: "bot",
      text: "That's a brilliant answer. May we quote you on that, with your name and your company?",
      chips: ["Yes, name and company", "Name only", "Anonymously please"],
    },
    { role: "user", text: "Yes, name and company", picked: "Yes, name and company" },
    {
      role: "end",
      text: "Thank you, genuinely.",
      body: "That's the kind of thing that helps us more than you'd think. If you have twenty spare seconds, a Google review would mean a lot.",
      cta: "Leave a Google review",
    },
  ],
  demoCaption:
    "“It's great now” became “nine seconds to load, and I updated the pricing page myself.” Same client, one follow-up.",

  template: { slug: "testimonial-request", name: "Testimonial request" },

  draft: {
    prompt: "Testimonial request for a web design studio",
    questions: [
      { label: "How did it go, out of five?", type: "Rating", tone: "scale" },
      { label: "What did we do for you?", type: "Long text", tone: "text" },
      { label: "What was it like before?", type: "Long text", tone: "text" },
      { label: "May we quote you?", type: "Single select", tone: "choice" },
      { label: "A photo, if you're happy to", type: "File upload", tone: "advanced" },
    ],
  },

  shareSlug: "leave-a-testimonial",
  qrLabel: "A QR code for the invoice or the thank-you card",

  samplePrompt: `Build a testimonial request form for my business.

Start by asking how the whole thing went, out of five stars.

If they give four or five, carry on: ask in a sentence what we actually did for them. Then — and this is the important one — ask what it was like BEFORE, what the thing was that was actually bothering them. Then ask whether anything has measurably changed since. If any of those answers come back short or vague, ask one warm follow-up rather than accepting it, because a one-line testimonial is no use to either of us.

Then ask whether we may quote them, and give three choices: with their name and company, name only, or anonymously. Offer them the chance to upload a photo if they are happy to. Finish by thanking them properly and offering a link to leave a Google review.

If they give three stars or below, do not ask for a testimonial at all. Ask kindly what went wrong and what we could have done differently, thank them for telling us, and end there — no review link, no quote request.

The tone throughout should be grateful and human, never salesy, and never pushy about the review.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up — thirty seconds, no card. Testimonials are exactly the sort of thing you do occasionally and in bursts, which the free plan handles fine.",
    },
    {
      title: "Paste the prompt and change the questions to yours",
      body: "Press New form and paste in the example below. The one thing worth keeping exactly as written is the instruction to ask what it was like before — that single question is what turns a compliment into a quote.",
      figure: "prompt",
      note: "keep the “before” question",
    },
    {
      title: "Split the happy from the unhappy",
      body: "Set it so four and five stars go on to the testimonial questions and end with your Google review link, while three and below go somewhere else entirely — a kind, private question about what went wrong, and no review link at all.",
      figure: "flow",
    },
    {
      title: "Ask for permission properly",
      body: "Add the question about how they would like to be credited: full name and company, first name only, or anonymously. It takes them one tap and it means you can publish without second-guessing yourself later.",
    },
    {
      title: "Send it at the right moment",
      body: "The best time is right after something has gone well — the project shipped, the event finished, the invoice was paid. Put the link in that email, or the QR on the thank-you card.",
      figure: "share",
    },
  ],

  whatYouGet: [
    {
      title: "Quotes with something in them",
      body: "A before, an after, and often a number — the three things a testimonial needs to do any work on a page.",
    },
    {
      title: "Permission on the record",
      body: "Stored with the quote: whether you may use it, and how they want to be named.",
    },
    {
      title: "The bad news, privately",
      body: "The unhappy answers come to you instead of to a public review, and they tell you what to fix.",
    },
    {
      title: "A photo, sometimes",
      body: "Uploaded in the same conversation, which is the only time anyone will ever do it.",
    },
  ],

  resultFields: [
    { label: "Rating", value: "5 out of 5", tone: "scale" },
    { label: "Result", value: "~⅓ more enquiries", tone: "number" },
    { label: "Permission", value: "Name and company", tone: "choice" },
  ],
  responseReference: "CF-1187",

  faq: [
    {
      question: "Isn't it pushy to ask a follow-up question?",
      answer:
        "It is the opposite, if it is worded well. People give short answers because they do not know what you want, not because they are unwilling — most are pleased to be asked something specific about a thing they enjoyed. It asks once, warmly, and moves on if the answer is still short. Nobody gets interrogated.",
    },
    {
      question: "Can I collect video testimonials?",
      answer:
        "No — this is a genuine gap. There are no video questions in chatform, so you cannot ask somebody to record themselves. If video is central to how you sell, you will need a separate tool for that part. What this does instead is get you the written quote worth putting on a page.",
    },
    {
      question: "How do I get people to actually do it?",
      answer:
        "Timing beats persuasion. Ask immediately after the good thing happened, when the feeling is fresh, rather than in a quarterly round-up. Say how long it takes. And send a link rather than a form — the first thing people see is a question, not a wall of boxes, which is a much easier thing to start.",
    },
    {
      question: "Can I put the testimonials straight onto my website?",
      answer:
        "You copy them across yourself — there is no widget that publishes them for you. You get the quote, the permission and the name in one place, and you paste them where you want them. For most people that is a five-minute job once a month.",
    },
  ],

  related: ["customer-feedback-form", "client-intake-form", "contact-form-alternative"],
});
