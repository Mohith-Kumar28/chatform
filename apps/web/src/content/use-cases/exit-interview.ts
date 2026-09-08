import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "exit-interview-form",
  name: "Exit interviews",
  group: "Hire and onboard",
  audience: "Solo HR leads, ops managers and founders of small teams",
  navBlurb: "Get past “personal reasons” to the thing that is about to cost you three more people.",

  title: "Exit interview form — get a real answer instead of “personal reasons”",
  description:
    "Exit interviews die on one-word answers, and nobody asks the follow-up because it is awkward. This form does. Free, anonymous if you want it, prompt included.",
  h1: "“Personal reasons” is where every exit interview dies.",
  lede:
    "Somebody just made a decision about your company that took months, and the record of it is two words.",

  problem: {
    headline: "Nobody asks the second question.",
    body: "Especially not the manager who is part of the answer.",
    symptoms: [
      "“Better opportunity.” “Personal reasons.” “Nothing in particular.”",
      "The person who most needs to hear the real reason is the one sitting in the room.",
      "The same manager loses three people in a year and nothing in the paperwork connects them.",
      "You find out on Glassdoor what you could have found out in the exit interview.",
    ],
  },

  outcomes: [
    {
      title: "The awkward follow-up gets asked",
      body: "“Was there anything about the role or the team that made the decision easier?” is the question that unlocks it, and it never gets asked by a person because asking it is uncomfortable. Something that is not a person asks it every single time.",
    },
    {
      title: "People say more when nobody is watching",
      body: "There is real research behind this — people disclose more and manage impressions less when they know they are talking to software rather than a person. An exit interview is exactly the situation that effect was measured in.",
    },
    {
      title: "You can see the pattern across leavers",
      body: "Three people gave different job titles as their reason and all three mentioned the same manager in passing. That only shows up when the answers have detail in them.",
    },
    {
      title: "It happens even when HR is busy",
      body: "A link sent on the last day gets completed. A meeting that has to be scheduled in someone's notice period frequently does not.",
    },
  ],

  demo: [
    { role: "bot", text: "Thanks for doing this — it's genuinely useful and nothing here goes to your manager. What's taking you to the new role?" },
    { role: "user", text: "just personal reasons really" },
    {
      role: "bot",
      text: "That's completely fair, and you don't have to go into it. Can I ask it a slightly different way — was there anything about the role here that made the decision easier than it might have been?",
    },
    { role: "user", text: "i suppose i'd stopped learning anything. same work for about 18 months" },
    {
      role: "bot",
      text: "Thank you, that's really helpful. Did you ever raise that with anyone here?",
      chips: ["Yes", "No", "Sort of"],
    },
    { role: "user", text: "Sort of", picked: "Sort of" },
    { role: "bot", text: "What happened when you did?" },
    { role: "user", text: "it came up in a 1:1, got a 'let's revisit next quarter' and then it never came up again" },
    {
      role: "bot",
      text: "Understood. How would you rate your experience working here overall?",
      card: { kind: "rating", max: 10, picked: 6 },
    },
    { role: "user", text: "6" },
    { role: "bot", text: "And would you recommend us to someone with your skills?", chips: ["Yes", "With caveats", "No"] },
    { role: "user", text: "With caveats", picked: "With caveats" },
    {
      role: "end",
      text: "Thank you — genuinely.",
      body: "This goes to the people team, not to your manager. Best of luck in the new role.",
    },
  ],
  demoCaption:
    "“Personal reasons” became a stalled development conversation and a manager who never followed up.",

  template: { slug: "exit-interview", name: "Exit interview" },

  draft: {
    prompt: "Exit interview for a 60-person company",
    questions: [
      { label: "What's taking you to the new role?", type: "Long text", tone: "text" },
      { label: "Did you raise it with anyone?", type: "Single select", tone: "choice" },
      { label: "What happened when you did?", type: "Long text", tone: "text" },
      { label: "How was it here, out of ten?", type: "Opinion scale", tone: "scale" },
      { label: "Would you recommend us?", type: "Single select", tone: "choice" },
    ],
  },

  shareSlug: "exit-interview",
  qrLabel: "A QR code, if you hand this over on the last day",

  samplePrompt: `Build an exit interview form for our company.

Open by thanking them and saying plainly that their answers go to the people team and not to their manager, because that single sentence changes what people are willing to say.

Ask what is taking them to the new role. If the answer is short or closed — "personal reasons", "better opportunity", "nothing in particular" — do not accept it and move on. Ask it a different way instead: was there anything about the role or the team here that made the decision easier than it might have been? Ask this warmly, and make clear they do not have to answer.

If they name something, ask whether they ever raised it with anyone here, and what happened when they did. That second question is usually where the real answer lives.

Then ask how they would rate their overall experience out of ten, and whether they would recommend us to someone with their skills, with an option for "with caveats".

Finish by asking whether there is anything they would want the leadership team to know that they never said while they worked here.

The tone should be calm, respectful and completely non-defensive. Never argue with an answer, never justify anything, never ask them to soften something. Thank them properly at the end.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. No card. For a small team this sits comfortably inside the free plan.",
    },
    {
      title: "Say who sees it, in the first line",
      body: "Paste the example below. The sentence that does the most work is the one at the very start saying this does not go to their manager — without it, most of what follows will be polite and useless.",
      figure: "prompt",
      note: "say who reads it",
    },
    {
      title: "Make it refuse a one-word answer",
      body: "The instruction to re-ask the question a different way when somebody says “personal reasons” is the entire point of doing this here rather than in a Google Form. Keep that part exactly as written.",
      figure: "flow",
    },
    {
      title: "Decide whether to make it anonymous",
      body: "For a small team, anonymous answers are often the only honest ones. Simply do not ask for a name. For a larger company you might want it attributed so you can spot patterns by team — there is a real trade-off and it is worth deciding deliberately.",
    },
    {
      title: "Send the link on the last week, not the last day",
      body: "Publish and send the link during their notice period rather than on the final afternoon, when nobody has the appetite. Read the answers a fortnight later, when you can hear them.",
      figure: "results",
    },
  ],

  whatYouGet: [
    {
      title: "An actual reason",
      body: "Past the first polite answer, in their words, with the follow-up already asked.",
    },
    {
      title: "A pattern you can act on",
      body: "Across leavers, the repeated words are the finding — a team, a manager, a stalled conversation that keeps recurring.",
    },
    {
      title: "A number to track",
      body: "An overall score and a would-you-recommend, so you can see whether anything you changed worked.",
    },
    {
      title: "Something you can take to leadership",
      body: "Direct quotes from people leaving are considerably harder to wave away than a summary.",
    },
  ],

  resultFields: [
    { label: "Real reason", value: "Stopped learning, 18 months", tone: "text" },
    { label: "Raised it?", value: "Sort of — never revisited", tone: "choice" },
    { label: "Would recommend", value: "With caveats", tone: "choice" },
  ],
  responseReference: "CF-8126",

  faq: [
    {
      question: "Will people be honest with an AI?",
      answer:
        "The research says more honest, not less. Lucas and colleagues at USC ran an experiment where people were told the same virtual interviewer was either automated or operated by a human — those who believed it was automated reported less fear of disclosing, showed less impression management, and were rated as more willing to open up. An exit interview is precisely the situation where that matters.",
    },
    {
      question: "Can I make it properly anonymous?",
      answer:
        "Yes — simply do not ask for a name or an email, and do not turn on any of the identity checks. What you should know is that responses still carry a timestamp, so in a very small team the date alone can identify somebody. If real anonymity matters, say so honestly to your team rather than over-promising it.",
    },
    {
      question: "Is this better than a conversation with a person?",
      answer:
        "Different, and best used alongside one. A good HR lead having a genuine conversation will always get more than a form. The problem is that the conversation often does not happen, and when it does, the one question that matters is the one nobody wants to ask out loud. Use this to get the honest written answer, and have the conversation too.",
    },
    {
      question: "Can I use this for engagement surveys too?",
      answer:
        "Yes, and it works well for the same reason — the follow-up on a low score is where the useful information is. Ask the score, then have it ask what would have to change to move it by one point.",
    },
  ],

  related: ["job-application-form", "client-intake-form", "customer-feedback-form"],
});
