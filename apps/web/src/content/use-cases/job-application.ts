import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "job-application-form",
  name: "Job applications",
  group: "Hire and onboard",
  audience: "Cafés, shops, salons, small agencies — anyone hiring one to five people",
  navBlurb: "Get a shortlist instead of an inbox, with the deal-breakers asked upfront.",

  title: "Online job application form for a small business",
  description:
    "An application form that asks the deal-breaker questions first, so you read ten good CVs instead of eighty. Free, unlimited applications, works from a QR in the window.",
  h1: "Eighty CVs, and six of them can work weekends.",
  lede:
    "You find that out on CV sixty-one. The form could have found it out before anybody attached anything.",

  problem: {
    headline: "You are reading CVs to learn things a question could have asked.",
    body: "Availability, notice period, whether they can legally work here. None of that is on a CV.",
    symptoms: [
      "Eighty applications, most of them a CV with no covering note and no context.",
      "You get to interview before discovering they cannot do the shift you are actually hiring for.",
      "Half of them applied to everything and cannot name your business.",
      "The good ones take a job elsewhere while you are still reading.",
    ],
  },

  outcomes: [
    {
      title: "The deal-breakers get asked first",
      body: "Shift availability, start date, right to work. Anyone who cannot do the job finds out politely in thirty seconds, and never reaches your inbox.",
    },
    {
      title: "You read ten, not eighty",
      body: "Score the answers as they arrive and the shortlist builds itself while you are working. You read the top ten properly instead of skimming all of them badly.",
    },
    {
      title: "You find out who actually wants this job",
      body: "One question — why this place, specifically — separates the people who applied to you from the people who applied to everything.",
    },
    {
      title: "Applying takes two minutes on a phone",
      body: "Which is where people look for work. A form that needs a desktop and a formatted CV loses good candidates who were never going to sit down at a laptop.",
    },
  ],

  demo: [
    { role: "bot", text: "Hi! Thanks for your interest in the barista role. First — are you able to work weekends? Most of our shifts are Saturday and Sunday." },
    { role: "user", text: "yeah weekends are fine, i'm at college during the week" },
    {
      role: "bot",
      text: "Perfect, that works well. When could you start?",
      chips: ["Straight away", "In two weeks", "In a month", "Later"],
    },
    { role: "user", text: "In two weeks", picked: "In two weeks" },
    { role: "bot", text: "Great. Have you worked in a café or bar before?" },
    { role: "user", text: "a bit, i did about 6 months at a place near college but mostly on the till" },
    {
      role: "bot",
      text: "Useful — till experience counts for a lot. Have you used an espresso machine, or would that be new?",
      chips: ["Used one before", "Would be new to me"],
    },
    { role: "user", text: "Would be new to me", picked: "Would be new to me" },
    { role: "bot", text: "That's fine, we train. Why this place in particular?" },
    { role: "user", text: "i come here most weeks honestly, and the staff always seem to actually like each other which is rare" },
    {
      role: "bot",
      text: "That's a lovely reason. Last bit — your name, number, and pop your CV in if you have one.",
      card: { kind: "upload", hint: "Your CV, if you have one", fileName: "cv-aisha.pdf", fileSize: "180 KB" },
    },
    { role: "user", text: "Aisha, 9876543210, sent" },
    {
      role: "end",
      text: "Thanks Aisha — that's everything.",
      body: "We'll be in touch within a week. If we've not called by then, do chase us.",
    },
  ],
  demoCaption:
    "Weekends, start date, experience and a real reason — before anybody opened a CV.",

  template: { slug: "job-application", name: "Job application" },

  draft: {
    prompt: "Application form for a weekend barista role",
    questions: [
      { label: "Can you work weekends?", type: "Yes / no", tone: "choice" },
      { label: "When could you start?", type: "Single select", tone: "choice" },
      { label: "Café or bar experience?", type: "Long text", tone: "text" },
      { label: "Why here in particular?", type: "Long text", tone: "text" },
      { label: "Your CV", type: "File upload", tone: "advanced" },
    ],
  },

  shareSlug: "join-the-team",
  qrLabel: "A QR code for the window and the noticeboard",

  samplePrompt: `Build a job application form for a weekend barista role at my café.

Ask the deal-breakers first, before anything else. Can they work weekends, since that is what the shifts are. When could they start. If they cannot do weekends at all, thank them warmly, explain that this particular role is weekend-based, invite them to apply again when we have weekday shifts, and end there — do not collect a CV from someone who cannot do the job.

Then ask whether they have worked in a café or bar before, and read the answer properly. If they have, ask one follow-up about what they actually did there. If they have not, say that is fine and that we train.

Ask whether they have used an espresso machine, with an option for "would be new to me", and make clear that is not a problem.

Then ask why this place in particular. This is the question that separates people who want this job from people who applied to forty jobs.

Finish by asking their name, their phone number, and inviting them to upload a CV if they have one — but make it optional, because good people applying for a weekend job on their phone very often do not have one to hand.

Keep it under three minutes and keep the tone friendly and human. Nobody should feel they are being assessed by a machine.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. No card. Applications are unlimited on the free plan, which matters when a job ad goes well.",
    },
    {
      title: "Put your deal-breakers at the very top",
      body: "Paste the example below and change the deal-breakers to yours — shifts, start date, right to work, a licence, whatever actually decides it. Asking them first is what saves you the eighty CVs.",
      figure: "prompt",
      note: "your deal-breakers first",
    },
    {
      title: "Let it end politely for the wrong fits",
      body: "Somebody who cannot do the shift should be thanked, told why, and invited to apply again another time — not walked through eight more questions. It is kinder and it keeps your inbox clean.",
      figure: "flow",
    },
    {
      title: "Make the CV optional",
      body: "Add the upload but do not require it. A good weekend candidate applying from their phone at a bus stop often has no CV to hand, and requiring one loses them for no reason.",
    },
    {
      title: "Put the QR in the window",
      body: "Publish and print the QR for the window, the counter and the noticeboard, and put the link in your job ad. People scan the window one while they are standing outside reading the card.",
      figure: "share",
    },
  ],

  whatYouGet: [
    {
      title: "A shortlist, already sorted",
      body: "Scored as they arrive on the things you said matter, so the ten worth reading are at the top.",
    },
    {
      title: "The answers a CV never has",
      body: "Availability, start date, why you, and what they actually did in the last place.",
    },
    {
      title: "CVs when people have them",
      body: "Attached to the conversation, not scattered across your email.",
    },
    {
      title: "A record of every applicant",
      body: "Exportable, in one place, so you can go back to the runner-up in three months when you are hiring again.",
    },
  ],

  resultFields: [
    { label: "Weekends", value: "Yes", tone: "choice" },
    { label: "Starts", value: "In two weeks", tone: "choice" },
    { label: "Experience", value: "6 months, till only", tone: "text" },
  ],
  responseReference: "CF-5590",

  faq: [
    {
      question: "Is it fair to screen people out automatically?",
      answer:
        "It depends entirely on what you screen on. Screening on a genuine requirement of the job — the shifts exist and they are the shifts — is fair and saves both sides time. Screening on anything that stands in for age, background or circumstance is not, and you should not do it. Keep your knock-out questions to things a candidate would agree are actually the job.",
    },
    {
      question: "Can it read and rank CVs for me?",
      answer:
        "No. It collects the CV and attaches it to the application, and the scoring works on the answers people give — not on the document. Somebody still has to read the CVs, but only the ten that got through, which was the point.",
    },
    {
      question: "Is this suitable for a bigger company?",
      answer:
        "It is built for small hiring — a few roles, a few people, no applicant tracking system. If you are running structured hiring across many roles with compliance requirements, a proper ATS will serve you better. For a café hiring two people, this is much less work than either.",
    },
    {
      question: "Can candidates come back to it later?",
      answer:
        "Yes. It saves as they go, so somebody who starts on the bus and stops can pick it up that evening from the same link with nothing lost.",
    },
  ],

  related: ["exit-interview-form", "volunteer-signup-form", "client-intake-form"],
});
