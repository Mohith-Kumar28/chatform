import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "quote-request-form",
  name: "Quote requests",
  group: "Win more work",
  audience: "Builders, cleaners, landscapers, movers, decorators, interior designers",
  navBlurb: "Get the photos and the scope before you drive across town to quote.",

  title: "Quote request form — stop quoting blind",
  description:
    "A quote request form that asks for the room size, the photos and the budget before you commit to a site visit. Sorts the real jobs from the price-shoppers. Free, with a prompt you can paste in.",
  h1: "Stop driving across town to quote a job that was never real.",
  lede:
    "Half a day, fuel, and a conversation that ends with “we'll think about it”. You could have known from the first three answers.",

  problem: {
    headline: "You are quoting on almost no information.",
    body: "So either you guess, or you go and look. Both are expensive.",
    symptoms: [
      "“How much for a kitchen?” with no size, no finish, no timeline and no budget.",
      "You book a site visit, drive out, and discover the budget is a third of the job.",
      "People send one photo taken in the dark, or none at all.",
      "You quote low to win it, then find the damp behind the units.",
    ],
  },

  outcomes: [
    {
      title: "Photos, before you get in the van",
      body: "It asks for pictures at the moment somebody mentions the problem — while they are standing in the room, phone already in hand. That is the only moment they will ever take them.",
    },
    {
      title: "You know the size of the job",
      body: "Rooms, rough measurements, finish level, timeline. Enough to give a range on the phone and only visit the ones worth visiting.",
    },
    {
      title: "Price-shoppers filter themselves",
      body: "A budget band asked early, kindly, tells you within one answer whether this is a job or a fishing trip — without you having to ask it out loud.",
    },
    {
      title: "Fewer nasty surprises",
      body: "The questions you always forget to ask on the phone get asked every single time, in the same order, by something that never has a busy morning.",
    },
  ],

  demo: [
    {
      role: "bot",
      text: "Hi! I can get you a rough price. What's the job — which rooms are we talking about?",
      chips: ["Kitchen", "Bathroom", "Whole house", "Something else"],
    },
    { role: "user", text: "Kitchen", picked: "Kitchen" },
    { role: "bot", text: "Roughly how big is it — in feet, or just describe it if that's easier." },
    { role: "user", text: "not sure, it's a normal size kitchen, fits a small table" },
    {
      role: "bot",
      text: "That's fine — that usually means somewhere around 10 by 12. Is this a refit keeping the layout, or are you moving the sink and the units around?",
      chips: ["Keeping the layout", "Moving things around", "Not sure yet"],
    },
    { role: "user", text: "Moving things around", picked: "Moving things around" },
    { role: "bot", text: "Good to know — that changes the plumbing. Any damp, or anything you've noticed behind the units?" },
    { role: "user", text: "yeah actually there's a patch under the window that's gone dark" },
    {
      role: "bot",
      text: "Worth seeing that before we price it. Could you take a photo of it now while you're there?",
      card: { kind: "upload", hint: "A photo of the damp patch", fileName: "kitchen-window.jpg", fileSize: "2.4 MB" },
    },
    { role: "user", text: "sent" },
    {
      role: "bot",
      text: "Perfect, thank you. And what have you got in mind budget-wise? It helps us quote the right spec rather than the wrong one.",
      chips: ["Under ₹2L", "₹2–5L", "₹5–10L", "More than ₹10L"],
    },
    { role: "user", text: "₹5–10L", picked: "₹5–10L" },
    { role: "bot", text: "That's a proper refit budget. What's the address, and when were you hoping to start?" },
    { role: "user", text: "14 Chapel Street, ideally before Diwali" },
    {
      role: "end",
      text: "That's everything I need.",
      body: "You'll get a range by tomorrow, and we'll come and look at that damp patch before we firm anything up.",
      cta: "See our recent work",
    },
  ],
  demoCaption:
    "It got the damp patch photographed while they were standing in the kitchen. Nobody sends that photo later.",

  template: { slug: "quote-request", name: "Quote request" },

  draft: {
    prompt: "Quote request form for a kitchen fitting company",
    questions: [
      { label: "Which rooms?", type: "Single select", tone: "choice" },
      { label: "Roughly how big?", type: "Short text", tone: "text" },
      { label: "Photos of the space", type: "File upload", tone: "advanced" },
      { label: "Budget in mind", type: "Single select", tone: "choice" },
      { label: "Address for the visit", type: "Address", tone: "contact" },
    ],
  },

  shareSlug: "get-a-quote",
  qrLabel: "A QR code for the van, the board and the leaflet",

  samplePrompt: `Build a quote request form for my kitchen and bathroom fitting business.

Start by asking which rooms the job covers. Then ask roughly how big the space is, and accept a rough description rather than insisting on exact measurements — most people genuinely do not know, and being difficult about it loses the enquiry.

Ask whether they are keeping the existing layout or moving things around, because that changes the plumbing and the price. Then ask whether there is anything they have noticed — damp, cracks, anything behind the units.

If they mention any kind of problem, immediately ask them to take a photo of it right then, while they are standing there. Ask for photos of the whole space too.

Then ask what budget they have in mind, offered as bands rather than a blank box, and explain briefly that it helps us quote the right specification rather than the wrong one.

Finish with the address, when they want the work started, and the best number to reach them on.

Keep the tone straightforward and friendly — like a good tradesperson on the phone, not a call centre. If they ask how long a job like this takes, whether we're insured, or whether we clear the old units away, answer from my notes and carry on.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. No card, and the free plan takes as many enquiries as you can handle.",
    },
    {
      title: "Describe the jobs you actually quote for",
      body: "Press New form and paste the example below in, swapping kitchens and bathrooms for whatever you do. The more specific you are about your trade, the better the questions it writes.",
      figure: "prompt",
      note: "your trade, your rooms",
    },
    {
      title: "Make it ask for photos at the right moment",
      body: "The instruction that matters is asking for a photo the instant somebody mentions a problem. A form that demands photos upfront loses people; one that asks while they are standing in the room gets them almost every time.",
      figure: "flow",
    },
    {
      title: "Set what happens to the small jobs",
      body: "Decide what should happen below your minimum — usually a polite note that you start above that figure, and a suggestion of who might help. It saves them a wait and saves you a call.",
    },
    {
      title: "Put the QR on the van",
      body: "Publish, then put the link on your website and your Google listing, and print the QR for the van, the board outside a job, and your leaflets. People scan those standing on their own driveway.",
      figure: "share",
    },
  ],

  whatYouGet: [
    {
      title: "Photos you would never otherwise get",
      body: "Taken at the moment the problem was mentioned, stored with the enquiry, ready before you decide whether to visit.",
    },
    {
      title: "Enough to give a range on the phone",
      body: "Rooms, size, layout change, condition, budget and timing — in one place, in the order you would have asked.",
    },
    {
      title: "The address and the timing",
      body: "So booking the visit is one call, not three messages working out where and when.",
    },
    {
      title: "A record of what they told you",
      body: "Useful when the job grows and somebody says they mentioned the damp at the start. They did, and you have it.",
    },
  ],

  resultFields: [
    { label: "Job", value: "Kitchen, layout change", tone: "choice" },
    { label: "Flagged", value: "Damp under window", tone: "text" },
    { label: "Budget", value: "₹5–10L", tone: "number" },
  ],
  responseReference: "CF-6042",

  faq: [
    {
      question: "Will asking for budget put people off?",
      answer:
        "The serious ones, no — they would rather you quoted the right spec than the wrong one, and saying that out loud is why the question works. Offer bands, never a blank box, and ask it after they have described the job. You will be able to see exactly how many people stop at that question in your own results, so you can decide with numbers rather than nerves.",
    },
    {
      question: "How many photos can people send?",
      answer:
        "Up to ten files per question on the free plan, five megabytes each — plenty for phone photos. Paid plans lift that to twenty-five megabytes, which matters if people are sending video from a newer phone.",
    },
    {
      question: "Can it give people a price automatically?",
      answer:
        "It can score a job and route it — a big refit ends differently from a small repair — but it will not calculate and quote a figure on your behalf, and you would not want it to. What it does is get you everything you need to quote properly in one pass.",
    },
    {
      question: "Can I take a deposit through it?",
      answer:
        "You can show your payment link or a UPI QR at the end and it will record that they said they paid — but the money does not pass through chatform, so we cannot confirm it arrived. For a deposit on a job that has not been quoted yet, most people leave payment out entirely and handle it after the visit.",
    },
  ],

  related: ["contact-form-alternative", "photography-inquiry-form", "appointment-booking-form"],
});
