import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "contact-form-alternative",
  name: "Contact form that qualifies",
  group: "Win more work",
  audience: "Agencies, studios, freelancers and anyone with an enquiry form",
  navBlurb: "Turn “Hi, I need a website” into a brief you can quote from, before you reply.",

  title: "A contact form that asks the follow-up question for you",
  description:
    "Most contact forms give you a name, an email and one useless sentence. This one asks what a human would ask next — budget, timing, what they actually need — so you can quote instead of scheduling a call. Free, with a prompt you can paste in.",
  h1: "Stop replying to “Hi, I need a website.”",
  lede:
    "A name, an email, and one sentence that could mean anything. Then three emails to find out it was never going to be a fit.",

  problem: {
    headline: "Your contact form collects strangers, not enquiries.",
    body: "It takes whatever lands in the box and hands it to you with no context at all.",
    symptoms: [
      "“Hi, I'd like a quote” — for what, by when, at what budget? Nobody knows, including them.",
      "You spend two emails discovering the budget is a tenth of your minimum.",
      "Real enquiries and total time-wasters arrive looking identical in your inbox.",
      "The good ones go cold because you took a day to reply and they messaged four people.",
    ],
  },

  outcomes: [
    {
      title: "You can quote from the first message",
      body: "Scope, timing, budget band and what they have already tried — collected while they were still in the mood to type. Most of the time you can reply with a number instead of a calendar link.",
    },
    {
      title: "The wrong-fit ones sort themselves out",
      body: "Somebody with a budget you cannot work with gets told so, kindly, right there — with something useful instead. You never have to write that email again.",
    },
    {
      title: "The right-fit ones get your attention immediately",
      body: "Send the serious ones straight to your booking link at the end of the conversation, while they are still holding their phone.",
    },
    {
      title: "It answers the price question",
      body: "“What do you charge?” is what they came to ask. Write your ranges once and it says them out loud, mid-conversation, instead of making somebody guess or leave.",
    },
  ],

  demo: [
    { role: "bot", text: "Hi! Tell me what you're trying to get built and I'll see if we're a fit." },
    { role: "user", text: "we need a new website" },
    {
      role: "bot",
      text: "Happy to help. Is this a fresh build from nothing, or replacing something that already exists?",
      chips: ["Brand new", "Replacing an old one", "Not sure"],
    },
    { role: "user", text: "Replacing an old one", picked: "Replacing an old one" },
    { role: "bot", text: "Got it. What's wrong with the current one — what made you start looking?" },
    { role: "user", text: "it's slow and we can't update it ourselves, have to email our old developer every time" },
    {
      role: "bot",
      text: "That's a really common one, and it usually means a rebuild on something you can edit yourself rather than a redesign. Roughly what have you set aside for this?",
      chips: ["Under ₹1L", "₹1–3L", "₹3–8L", "More than ₹8L"],
    },
    { role: "user", text: "₹3–8L", picked: "₹3–8L" },
    { role: "bot", text: "That's comfortably in range. When would you want it live?" },
    { role: "user", text: "before the end of the quarter ideally" },
    {
      role: "bot",
      text: "Doable. And what's the best email for the proposal? — Yes, we do handle hosting and ongoing edits, it's part of the retainer.",
    },
    { role: "user", text: "priya@northwind.co, and yes that was going to be my next question" },
    {
      role: "end",
      text: "That's everything, thanks Priya.",
      body: "You'll have a proposal and a rough number by tomorrow afternoon. If you'd rather talk it through first, grab a slot below.",
      cta: "Book a 20-minute call",
    },
  ],
  demoCaption:
    "It asked why they were looking, priced the range, and answered the hosting question before it was asked.",

  template: { slug: "lead-capture", name: "Lead capture" },

  draft: {
    prompt: "Enquiry form for a web design studio",
    readUrl: "northwind.co",
    readPages: 6,
    questions: [
      { label: "What are you looking to build?", type: "Long text", tone: "text" },
      { label: "Brand new or a rebuild?", type: "Single select", tone: "choice" },
      { label: "Rough budget", type: "Single select", tone: "choice" },
      { label: "When do you need it live?", type: "Date", tone: "number" },
      { label: "Best email for you", type: "Email", tone: "contact" },
    ],
  },

  shareSlug: "start-a-project",
  qrLabel: "A QR code for your business card and deck",

  samplePrompt: `Build an enquiry form for my web design studio that replaces our contact form.

Start by asking what they are trying to get built, in their own words, and then read that answer properly. If it is vague — something like "a website" or "a quote" — ask one friendly follow-up to find out whether it is a brand new build or a replacement for something that already exists, and what made them start looking now.

Then ask roughly what budget they have set aside, offered as bands rather than a blank box, because people will not type a number. Then ask when they need it live.

If the budget is below our minimum, do not carry on collecting details — say kindly that we start above that, point them at something genuinely useful for smaller projects, and end there. If the budget is comfortably in range, ask for their name and email and finish by offering a call.

Read our website first and use our own words for the services, so it does not describe us in language we would never use.

Answer their questions as they come up — what we charge, whether we do hosting, how long a project usually takes, whether we work with people outside India — and then carry on where you left off.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. Thirty seconds, no card. The free plan is unlimited forms and unlimited enquiries, so there is nothing to decide yet.",
    },
    {
      title: "Paste your website address, then the prompt",
      body: "Press New form and paste in the example below. Include your own site's address in it — it will read your pages first and write the questions using the words you already use for your services, rather than inventing a description of you.",
      figure: "prompt",
      note: "put your own site in",
    },
    {
      title: "Set your knock-out rule",
      body: "This is the part that saves you the most time. Say what your minimum project is, and what should happen to anyone below it — usually a kind note and a link to something useful. Everyone above it carries on to the questions that matter.",
      figure: "flow",
    },
    {
      title: "Add the three things everyone asks you",
      body: "In the Agent tab, write down your price ranges, your usual timeline, and whether you handle hosting. From then on it answers those mid-conversation, in your words, and picks the enquiry back up straight after.",
    },
    {
      title: "Put it where your contact form is now",
      body: "Publish, then either replace your Contact page link or drop the form straight into the page. Both take a minute and neither needs a developer.",
      figure: "share",
    },
  ],

  whatYouGet: [
    {
      title: "A brief, not a name and an email",
      body: "Every enquiry arrives with scope, budget band, timing and the reason they started looking — the four things you would otherwise spend two emails getting.",
    },
    {
      title: "The whole conversation to read back",
      body: "Including the bit where they mentioned the thing that turns out to be the actual project.",
    },
    {
      title: "Fewer enquiries, and you will be glad",
      body: "The people who were never going to buy get a straight answer instead of your Tuesday morning.",
    },
    {
      title: "Where people give up",
      body: "If everyone stops at the budget question, you can see that, and decide whether to ask it later instead.",
    },
  ],

  resultFields: [
    { label: "Project", value: "Rebuild, self-editable", tone: "choice" },
    { label: "Budget", value: "₹3–8L", tone: "number" },
    { label: "Email", value: "priya@northwind.co", tone: "contact" },
  ],
  responseReference: "CF-4821",

  faq: [
    {
      question: "Will asking for a budget scare people off?",
      answer:
        "Some, and those are mostly the ones you want to lose. The trick is to offer bands rather than a blank box — people will pick a range when they would never type a number — and to ask it after they have already described the project, once they are invested in the conversation. You will be able to see in your own results exactly how many stop there, which beats guessing.",
    },
    {
      question: "Can I put this on my existing website?",
      answer:
        "Yes. You can link to it as its own page, or drop it into your site so it sits inline where your form is now, or have it slide in from the edge when someone clicks Contact. All four options are copy-and-paste, and if you have someone who looks after your site they will have it live in five minutes.",
    },
    {
      question: "Does it reply to people automatically?",
      answer:
        "It talks to them while they are filling it in, and it can end by pointing them at your booking link. What it does not do is carry on emailing them afterwards — it is a form, not an inbox. You get the enquiry and you reply as you would now, just with much more to go on.",
    },
    {
      question: "What if someone asks it something I have not covered?",
      answer:
        "It says it does not know and that a human will come back to them, rather than inventing an answer. You can also list topics it must never discuss, and it will decline those politely and carry on.",
    },
    {
      question: "Is this just a chatbot on my website?",
      answer:
        "No — and the difference matters if you have been burned by one. A chatbot wanders. This is your form, in charge the whole time: your questions, in your order, with your knock-out rule enforced. The AI is only allowed to word things nicely, read what people write, and answer from the notes you gave it.",
    },
  ],

  related: ["quote-request-form", "client-intake-form", "photography-inquiry-form"],
});
