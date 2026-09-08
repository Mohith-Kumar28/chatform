import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "webinar-registration-form",
  name: "Webinar & workshop signups",
  group: "Fill your calendar",
  audience: "Course creators, studios running workshops, B2B marketers",
  navBlurb: "Register people, and find out what they want answered before you build the deck.",

  title: "Webinar registration form — better show-up rates, and your agenda for free",
  description:
    "A registration form that asks each person what they want answered on the call. You get a higher show-up rate and the agenda writes itself. Free, unlimited registrations, prompt included.",
  h1: "Half the people who register never turn up.",
  lede:
    "Mostly because registering cost them nothing and they had no particular reason of their own to be there.",

  problem: {
    headline: "A name and an email buys you no commitment.",
    body: "And it tells you nothing about what to actually say on the day.",
    symptoms: [
      "Two hundred registrations, sixty people in the room.",
      "You build the whole session guessing at what the audience wants.",
      "You have no idea who in that list is a real buyer and who is a student.",
      "The ones who could not make it live never get told about the recording.",
    ],
  },

  outcomes: [
    {
      title: "More of them actually turn up",
      body: "Somebody who typed the one thing they want answered has made it personal. They are not attending a webinar any more, they are coming to hear their question answered.",
    },
    {
      title: "Your agenda writes itself",
      body: "Read the questions the day before and build the session around the five that keep repeating. It is the best possible brief and it costs one extra question.",
    },
    {
      title: "You know who is worth following up",
      body: "Score by role, company size or what they said they are struggling with, so your follow-up goes to the right twenty people rather than all two hundred.",
    },
    {
      title: "Signup stays under a minute",
      body: "One question at a time keeps it feeling quick, so the extra question does not cost you registrations the way a longer page would.",
    },
  ],

  demo: [
    {
      role: "bot",
      text: "Hi! This one's on pricing your work as a freelancer, Thursday 21st at 4pm. Which session suits you?",
      chips: ["Thu 21st, 4pm", "Fri 22nd, 11am", "Just send the recording"],
    },
    { role: "user", text: "Thu 21st, 4pm", picked: "Thu 21st, 4pm" },
    { role: "bot", text: "Great. What's your name and the best email for the joining link?" },
    { role: "user", text: "Nikhil, nikhil@dotsandlines.in" },
    {
      role: "bot",
      text: "Got it. So I build the right session — what's the one thing you'd like answered on the call?",
    },
    { role: "user", text: "how to raise my rates with existing clients without losing them" },
    {
      role: "bot",
      text: "That's a good one and it comes up a lot. Are you mostly on project fees or retainers at the moment?",
      chips: ["Project fees", "Retainers", "A bit of both"],
    },
    { role: "user", text: "A bit of both", picked: "A bit of both" },
    {
      role: "bot",
      text: "Noted — I'll make sure the retainer version gets covered properly. Want the recording too, in case something comes up?",
      chips: ["Yes please", "No, I'll be there"],
    },
    { role: "user", text: "Yes please", picked: "Yes please" },
    {
      role: "end",
      text: "You're registered, Nikhil.",
      body: "Thursday 21st, 4pm. Joining link on its way, and I'll be covering the raising-rates-with-existing-clients question.",
      cta: "Add to calendar",
    },
  ],
  demoCaption:
    "He is not attending a webinar now. He is coming to hear his own question answered.",

  template: { slug: "webinar-registration", name: "Webinar registration" },

  draft: {
    prompt: "Registration form for a freelancer pricing webinar",
    questions: [
      { label: "Which session?", type: "Single select", tone: "choice" },
      { label: "Name", type: "Short text", tone: "text" },
      { label: "Email for the link", type: "Email", tone: "contact" },
      { label: "What do you want answered?", type: "Long text", tone: "text" },
      { label: "Want the recording?", type: "Yes / no", tone: "choice" },
    ],
  },

  shareSlug: "webinar-signup",
  qrLabel: "A QR code for slides and social posts",

  samplePrompt: `Build a registration form for my webinar.

Start by saying what the session is about and when it runs, and let them pick which session they want if there is more than one — including an option to just get the recording if neither time works.

Then ask their name and the best email for the joining link.

Then the question that matters: ask what the one thing is they would like answered on the call. Read what they write, and if it is short or generic, ask one follow-up to make it specific — that answer is my agenda and a vague version is no use.

Then ask what they do and roughly how big their team or business is, so I know who is in the room.

Finish by asking whether they would like the recording as well in case something comes up, and confirm the date and time back to them clearly.

Keep the whole thing under a minute. The tone should be friendly and direct — like the person running the session, because that is who they think they are talking to. Do not ask for a phone number.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. Thirty seconds, no card. Registrations are unlimited on the free plan.",
    },
    {
      title: "Set up the sessions and the one good question",
      body: "Paste the example below. The important bit is asking what they want answered on the call — that one question is what lifts your show-up rate and hands you the agenda at the same time.",
      figure: "prompt",
      note: "the agenda question",
    },
    {
      title: "Score the room as they register",
      body: "Give points for the roles and company sizes you actually want to talk to. On the day you know who is in the room, and afterwards you know which twenty to follow up rather than all of them.",
      figure: "flow",
    },
    {
      title: "Publish and put the link everywhere you are posting",
      body: "It works as a link in a post, embedded in your landing page, or as a pop-up when someone clicks Register. The QR is useful on the last slide of any talk you give in the meantime.",
      figure: "share",
    },
    {
      title: "Read the questions the day before",
      body: "Sort by the ones that repeat. Build the session around those five. This is the step people skip and it is the one that makes the session good.",
      figure: "results",
    },
  ],

  whatYouGet: [
    {
      title: "Your agenda, written by the audience",
      body: "Every registrant's actual question, in their words, ready to sort the day before.",
    },
    {
      title: "A scored list",
      body: "So follow-up goes to the people worth following up rather than to everyone equally.",
    },
    {
      title: "Who wants the recording",
      body: "Asked upfront, so the people who could not make it live still get looked after.",
    },
    {
      title: "Everything exportable",
      body: "Straight into whatever you send the joining link with.",
    },
  ],

  resultFields: [
    { label: "Session", value: "Thu 21st, 4pm", tone: "number" },
    { label: "Wants answered", value: "Raising rates with existing clients", tone: "text" },
    { label: "Recording", value: "Yes", tone: "choice" },
  ],
  responseReference: "CF-9033",

  faq: [
    {
      question: "Does it send the joining link automatically?",
      answer:
        "It can send a confirmation email when someone registers, and you can put the joining link in it. What it does not do is manage a reminder sequence — no “starts in one hour” emails. Export the list into whatever you already use for sending, and use chatform for the registration and the questions.",
    },
    {
      question: "Does it connect to Zoom?",
      answer:
        "No. There is no Zoom, Teams or Meet integration — you paste your own joining link into the confirmation and the closing message. It is a manual step, and for most people running a monthly session it is a thirty-second one.",
    },
    {
      question: "Will the extra question reduce registrations?",
      answer:
        "Slightly, and it is worth it. The people who will not spend fifteen seconds typing a question were also unlikely to attend. What you get back is a higher show-up rate among the people who did, plus the agenda. Watch your own drop-off numbers for a session or two and decide with evidence.",
    },
    {
      question: "Can I run more than one session from one form?",
      answer:
        "Yes. Offer the sessions as choices at the start and everything after can branch on which one they picked — different confirmations, different closing messages, different follow-ups.",
    },
  ],

  related: ["waitlist-form", "admission-enquiry-form", "volunteer-signup-form"],
});
