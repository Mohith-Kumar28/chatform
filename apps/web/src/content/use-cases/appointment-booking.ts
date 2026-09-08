import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "appointment-booking-form",
  name: "Appointment booking",
  group: "Fill your calendar",
  audience: "Salons, clinics, tutors, coaches, garages — anyone with a diary",
  navBlurb: "Take bookings from a link or a QR code, with the details you need before they arrive.",

  title: "Appointment booking form — take bookings without the phone tag",
  description:
    "Set up a booking form that asks for the day, the time and everything you need before the appointment — and answers your customer's questions while they book. Free, no card, and a prompt you can paste in.",
  h1: "Take the booking while they are still interested.",
  lede:
    "Somebody wants an appointment at 11pm on a Sunday. Either they can book it right then, or they mean to call on Monday and forget.",

  problem: {
    headline: "The booking you lose is the one nobody hears about.",
    body: "Every missed call is somebody who was ready to pay you.",
    symptoms: [
      "You are mid-appointment, the phone rings, and you cannot answer it — and they do not call back.",
      "The ones who do get through take four messages to settle on a time.",
      "They arrive without saying it is their first visit, or which treatment, or that they are bringing someone.",
      "Somebody books, forgets, and does not turn up — and the slot was never offered to anyone else.",
    ],
  },

  outcomes: [
    {
      title: "Bookings arrive while you are working",
      body: "The form does not need you awake. Late evenings and Sunday mornings are when people finally get round to booking things, and that is exactly when nobody is answering a phone.",
    },
    {
      title: "You already know what the appointment is",
      body: "First visit or regular, which service, how long they will need, anything you should know beforehand. You walk into the appointment prepared instead of finding out at the door.",
    },
    {
      title: "Fewer no-shows, because they told you more",
      body: "Somebody who has answered five questions about their appointment has thought about it. It stops being a vague intention and starts being a plan they made.",
    },
    {
      title: "You stop repeating yourself",
      body: "Parking, where the door is, what to bring, whether you take card. Write those once and it answers them for you, in the middle of the booking, without anyone having to ring.",
    },
  ],

  demo: [
    {
      role: "bot",
      text: "Hi! I can get you booked in. What are you after — a cut, colour, or both?",
      chips: ["Cut", "Colour", "Both"],
    },
    { role: "user", text: "Both", picked: "Both" },
    {
      role: "bot",
      text: "Lovely. Both together takes about two and a half hours, so let's find a slot with room. Which day suits?",
      card: { kind: "scheduling", buttonLabel: "Pick a day and time", provider: "chatform", slot: "Thu 14 Sept, 10:00" },
    },
    { role: "user", text: "Thursday the 14th at 10am" },
    { role: "bot", text: "Got it. Have you been in before, or is this your first time with us?", chips: ["First time", "Been before"] },
    { role: "user", text: "first time", picked: "First time" },
    {
      role: "bot",
      text: "Welcome! Anything I should tell the stylist — colour history, allergies, anything you've had done recently?",
    },
    { role: "user", text: "i had it bleached about 4 months ago, went a bit brassy" },
    {
      role: "bot",
      text: "Good to know — I'll flag the previous bleach so she can plan the toner. Is there parking? Yes, free on Chapel Street after 10am, two minutes' walk.",
    },
    { role: "user", text: "oh perfect, i was about to ask that" },
    { role: "bot", text: "Last thing — best number to reach you on if anything changes?" },
    { role: "user", text: "07700 900142" },
    {
      role: "end",
      text: "You're booked in.",
      body: "Thursday 14 September, 10:00 — cut and colour with Priya. We'll text you the morning before.",
      cta: "Add to calendar",
    },
  ],
  demoCaption:
    "It asked about the bleach because the answer was vague, and answered the parking question before it was asked.",

  template: { slug: "appointment-booking", name: "Appointment booking" },

  draft: {
    prompt: "Booking form for a hair salon",
    questions: [
      { label: "What are you after?", type: "Single select", tone: "choice" },
      { label: "Which day and time?", type: "Date & time", tone: "number" },
      { label: "First visit with us?", type: "Yes / no", tone: "choice" },
      { label: "Anything we should know?", type: "Long text", tone: "text" },
      { label: "Best number for you", type: "Phone", tone: "contact" },
    ],
  },

  shareSlug: "book-an-appointment",
  qrLabel: "A QR code for the window and the counter",

  samplePrompt: `Build a booking form for my hair salon.

Ask which service they want — cut, colour, both, or a treatment — and tell them roughly how long each one takes so they know what they are committing to. Then ask which day and time they would like, offering slots between 9am and 6pm on weekdays and 9am to 4pm on Saturdays, in 30 minute steps, and do not offer dates in the past.

Ask whether they have been to us before. If it is their first visit, ask a little more: what their hair is like now, anything that has been done to it in the last six months, and any allergies or sensitivities. If they are a regular, skip all that and just ask whether they want the same stylist.

Finish by asking for their name and their mobile number so we can text a reminder.

Keep the tone warm and unfussy, the way you would talk to someone at the desk. If an answer is vague, ask one friendly follow-up rather than accepting it. If they ask about parking, prices, or whether we do patch tests, answer them from what I tell you and then carry on with the booking.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. It takes about thirty seconds, there is no card, and the free plan is genuinely free — unlimited forms, unlimited bookings.",
    },
    {
      title: "Describe the booking form in your own words",
      body: "Press New form, then just say what you need. There is a full example below — copy it, paste it in, and change the bits that are not you. It writes every question, decides which ones need a follow-up, and sets up the branching so first-timers get asked more than regulars.",
      figure: "prompt",
      note: "change the hours to yours",
    },
    {
      title: "Tell it the things you get asked all day",
      body: "In the Agent tab, add short notes: where to park, what a colour costs, whether you do patch tests, what happens if they are late. When somebody asks mid-booking, it answers from your notes and then picks the booking back up exactly where it left off.",
      figure: "flow",
    },
    {
      title: "Publish it and put the link where people already are",
      body: "Hit Publish and you get a link. Put it in your Instagram bio, on your Google listing, in your out-of-hours voicemail message. Download the QR code and stick it in the window and on the counter — people scan it while they are standing there deciding.",
      figure: "share",
    },
    {
      title: "Read the bookings over your coffee",
      body: "Each one arrives as the whole conversation, so you can see what they said about their hair, not just a row in a spreadsheet. Export the lot to a spreadsheet whenever you want it.",
      figure: "results",
    },
  ],

  whatYouGet: [
    {
      title: "The whole conversation, per booking",
      body: "Not just the day and time — what they said about their hair, the question they asked, the thing they mentioned in passing that turns out to matter.",
    },
    {
      title: "A day and a time you can put in the diary",
      body: "Asked as a proper date and time, so it comes out as one, not as somebody typing “next Tuesdayish”.",
    },
    {
      title: "The ones who nearly booked",
      body: "If somebody gets halfway and stops, you still have what they told you — and you can see which question is where people give up.",
    },
    {
      title: "Everything in a spreadsheet when you want it",
      body: "One click, one file, one column per question. Yours to keep.",
    },
  ],

  resultFields: [
    { label: "Service", value: "Cut and colour", tone: "choice" },
    { label: "Slot", value: "Thu 14 Sept, 10:00", tone: "number" },
    { label: "Mobile", value: "07700 900142", tone: "contact" },
  ],
  responseReference: "CF-2201",

  faq: [
    {
      question: "Does this connect to my Google Calendar?",
      answer:
        "Not automatically — it does not read your calendar or hide slots you are already busy in. What it does is ask for a day and a time inside the hours you set, and hand you the answer so you can put it in your diary. If you already use Cal.com or Calendly for real availability, you can point people there from inside the conversation instead, once they have answered everything else.",
    },
    {
      question: "Can I take a deposit?",
      answer:
        "You can show your payment link or a UPI QR code at the end of the booking and it will record that they said they paid. To be completely straight with you: the money does not go through chatform, so we cannot confirm it landed — you check that where you normally would. Plenty of people use it exactly this way for deposits; just do not expect it to reconcile for you.",
    },
    {
      question: "What if two people book the same slot?",
      answer:
        "It can happen, because the form does not know your diary. Most small places handle it by leaving a little room in the slot length and confirming by text the day before. If double bookings would be a serious problem for you, use a real availability tool for the slot and chatform for everything you need to know before the appointment.",
    },
    {
      question: "Do people actually fill these in?",
      answer:
        "More than fill in a page of boxes, which is the whole point. They are answering one thing at a time, in plain language, on their phone, and they can ask you a question in the middle without leaving. If someone stops halfway, you can see exactly where.",
    },
    {
      question: "Do I need a website?",
      answer:
        "No. The form has its own link and its own page, and looks like yours — your colours, your logo. Put the link in your Instagram bio or print the QR. If you do have a website, you can drop the form into it as well.",
    },
  ],

  related: ["client-intake-form", "customer-feedback-form", "quote-request-form"],
});
