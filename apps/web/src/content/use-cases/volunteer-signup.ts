import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "volunteer-signup-form",
  name: "Volunteer signups",
  group: "Run a community",
  audience: "Charities, trusts, temples, PTAs, sports clubs, alumni groups",
  navBlurb: "Get volunteers who actually turn up, matched to shifts they can make.",

  title: "Volunteer sign up form — people who actually turn up",
  description:
    "A volunteer form that asks what they care about before it asks about Tuesday mornings. Better matched volunteers, fewer no-shows, waivers signed on the phone. Free, unlimited signups.",
  h1: "Ask why they want to help before you ask about Tuesdays.",
  lede:
    "Every volunteer form opens with a seven-column availability grid. That grid is where the enthusiasm goes to die.",

  problem: {
    headline: "The people who wanted to help gave up on the form.",
    body: "You asked for logistics before you asked what they cared about.",
    symptoms: [
      "A grid of days and time slots as the first thing anyone sees.",
      "People sign up for shifts they were never really free for, and then do not come.",
      "Waivers and consent forms printed, signed, scanned, chased, lost.",
      "You have names and no idea what any of them are actually good at.",
    ],
  },

  outcomes: [
    {
      title: "The yes comes before the logistics",
      body: "They tell you what they care about and what they can do first, while they are still enthusiastic. Availability comes after they have already committed emotionally, which is when people answer it honestly.",
    },
    {
      title: "Volunteers matched to the right thing",
      body: "Somebody who is good with people and somebody who wants to do the quiet sorting job both exist and both are useful. Asking means you place them properly instead of guessing.",
    },
    {
      title: "Waivers signed on their phone",
      body: "The code of conduct and the consent are read and signed in the same conversation, with a finger. Nothing printed, nothing chased.",
    },
    {
      title: "Fewer no-shows on the day",
      body: "People confirm shifts they actually looked at, having already told you what they want to do. Both of those make turning up much more likely.",
    },
  ],

  demo: [
    { role: "bot", text: "Hi! Thanks for wanting to help. What drew you to us — is there something in particular you care about?" },
    { role: "user", text: "my mum was looked after by a hospice like this one" },
    {
      role: "bot",
      text: "Thank you for telling me that, it means a lot. A lot of our best volunteers come to us for exactly that reason. What sort of thing would you enjoy doing?",
      chips: ["Being with people", "Behind the scenes", "Driving", "Fundraising", "Whatever's needed"],
    },
    { role: "user", text: "Being with people", picked: "Being with people" },
    { role: "bot", text: "Lovely. Have you done anything like this before, or would this be new?" },
    { role: "user", text: "new to me, but i looked after my mum for two years so i'm not squeamish" },
    {
      role: "bot",
      text: "That's genuinely relevant experience. Now the practical bit — which days could you usually manage?",
      chips: ["Weekday mornings", "Weekday afternoons", "Evenings", "Weekends"],
    },
    { role: "user", text: "Weekday mornings", pickedAll: ["Weekday mornings", "Weekends"] },
    { role: "bot", text: "Perfect. Last thing — please have a read of our volunteer code of conduct and sign at the bottom." },
    { role: "user", text: "signed" },
    {
      role: "end",
      text: "Welcome, and thank you.",
      body: "Ravi from the volunteer team will call you this week about an induction. We're really glad you got in touch.",
    },
  ],
  demoCaption:
    "The availability question came ninth. By then they had already told you they were coming.",

  template: { slug: "volunteer-signup", name: "Volunteer signup" },

  draft: {
    prompt: "Volunteer signup form for a hospice",
    questions: [
      { label: "What drew you to us?", type: "Long text", tone: "text" },
      { label: "What would you enjoy doing?", type: "Multi select", tone: "choice" },
      { label: "Done anything like this before?", type: "Long text", tone: "text" },
      { label: "Which days could you manage?", type: "Multi select", tone: "choice" },
      { label: "Code of conduct", type: "Signature", tone: "advanced" },
    ],
  },

  shareSlug: "volunteer-with-us",
  qrLabel: "A QR code for posters, the noticeboard and event stalls",

  samplePrompt: `Build a volunteer signup form for our charity.

Open by thanking them for wanting to help, and ask what drew them to us — whether there is something in particular they care about. Read the answer properly and respond to it warmly and personally; people often share something quite personal here and it should not be met with a generic next question.

Then ask what sort of thing they would enjoy doing, offering our real roles as choices — being with people, behind the scenes, driving, fundraising, or whatever is needed — and let them pick more than one.

Then ask whether they have done anything like this before, and accept "no" warmly.

Only now ask about availability: which days and which parts of the day they could usually manage, as choices they can tick, not as a grid.

Then ask their name, email and phone number, and their emergency contact.

Finish by showing our volunteer code of conduct for them to read and sign.

The tone should be warm, grateful and completely unbureaucratic. This is someone offering their time for free. Never make any part of it feel like an application they might fail.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. There is no card and no cost — the free plan covers unlimited signups, which for most organisations means this never costs anything at all.",
    },
    {
      title: "Put the availability question last, not first",
      body: "Paste the example below. The order is the whole trick: what they care about, then what they would enjoy, then experience, and only then which Tuesdays. Every volunteer form you have ever seen does this backwards.",
      figure: "prompt",
      note: "availability comes last",
    },
    {
      title: "Add the code of conduct to be signed",
      body: "Paste your waiver or code of conduct in and add a signature question underneath. They read it and sign with a finger, and it is stored with their details — no printing, no scanning, no chasing.",
      figure: "flow",
    },
    {
      title: "Publish it and put it on the noticeboard",
      body: "You get a link for your website and your newsletter, and a QR code to print for posters, the noticeboard, and your stall at events. People scan those while they are standing there feeling motivated.",
      figure: "share",
    },
    {
      title: "Read what they told you before you call",
      body: "Every signup keeps the whole conversation, including the sentence about why they came. Read it before the induction call — it makes a real difference to that first conversation.",
      figure: "results",
    },
  ],

  whatYouGet: [
    {
      title: "Why each person came",
      body: "In their own words. It is the most useful thing you will have when you call them, and no grid-based form has ever collected it.",
    },
    {
      title: "Roles and availability together",
      body: "What they want to do and when they can do it, so placing them is a decision rather than a puzzle.",
    },
    {
      title: "Signed waivers, filed",
      body: "Stored with the signup, timestamped, nothing to chase.",
    },
    {
      title: "A spreadsheet for your rota",
      body: "Export the lot into whatever you build the rota in.",
    },
  ],

  resultFields: [
    { label: "Role", value: "Being with people", tone: "choice" },
    { label: "Availability", value: "Weekday mornings, weekends", tone: "choice" },
    { label: "Code of conduct", value: "Signed", tone: "advanced" },
  ],
  responseReference: "CF-4407",

  faq: [
    {
      question: "Is it really free for a charity?",
      answer:
        "Yes, genuinely — unlimited forms and unlimited signups on the free plan, no card, no expiry. The paid plans buy things like putting your own logo on the form and removing our small badge, which some organisations want and many are perfectly happy without.",
    },
    {
      question: "Can we collect a DBS or background check?",
      answer:
        "You can ask people to upload a document and you can ask the questions, and it will be stored with their signup. What chatform does not do is run any kind of check for you or connect to a checking service — that stays a separate process with whoever you use for it.",
    },
    {
      question: "Can we take donations through it?",
      answer:
        "Not properly, and we would rather say so plainly than have you find out later. It can show your existing donation link or a UPI QR and record that somebody said they gave — but no money passes through chatform and we cannot confirm anything. For donations, use a proper donation platform.",
    },
    {
      question: "Can several of us see the signups?",
      answer:
        "Yes. You can invite your team, and give people different levels of access — someone who can build forms, someone who can only read the responses. On the free plan it is a single login, and team access starts on the paid plans.",
    },
  ],

  related: ["webinar-registration-form", "customer-feedback-form", "job-application-form"],
});
