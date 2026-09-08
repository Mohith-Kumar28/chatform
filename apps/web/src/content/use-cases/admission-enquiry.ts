import { defineUseCase } from "./define";

export default defineUseCase({
  slug: "admission-enquiry-form",
  name: "Admission enquiry",
  group: "Fill your calendar",
  audience: "Schools, preschools, coaching centres, tuition and academies",
  navBlurb: "Answer the fee and batch questions on the spot, then book the campus visit.",

  title: "Admission enquiry form — answer the fee question, then book the visit",
  description:
    "An admission enquiry form that answers what parents actually want to know — fees, batches, timings — and then takes their number and books a campus visit. Free, works from a WhatsApp link or a QR on your flyer.",
  h1: "Parents ask three questions. Answer them before asking for the number.",
  lede:
    "Fees, batch timings, and whether there is a seat. Everything else on your enquiry form is you asking for something before you have given anything.",

  problem: {
    headline: "Your front desk answers the same four questions all day.",
    body: "And still loses the parent who called at eight in the evening.",
    symptoms: [
      "The first thing every parent asks is the fee, and your form asks for their phone number first.",
      "Enquiries come in over WhatsApp, over calls, on a paper register, and none of them are in the same place.",
      "Somebody notes down a number with no idea which class, which batch or which board.",
      "You call back the next morning and they have already visited the centre down the road.",
    ],
  },

  outcomes: [
    {
      title: "The questions get answered at 9pm",
      body: "Parents look at schools after their own workday ends. A form that can tell them the fee structure and the batch timings at that hour is the difference between an enquiry and a missed call.",
    },
    {
      title: "Every enquiry lands in one place",
      body: "Not a register, not four staff phones. One list, with the class, the board, the batch they want and a number you can actually call.",
    },
    {
      title: "More parents actually visit",
      body: "It ends by asking which day suits them for a campus visit, while they are still interested — instead of leaving that to a follow-up call that half of them never take.",
    },
    {
      title: "Your desk gets its day back",
      body: "The repetitive four questions stop reaching a person. What reaches a person is a parent who already knows the fee and still wants to come in.",
    },
  ],

  demo: [
    {
      role: "bot",
      text: "Namaste! I can help with admissions. Which class is this for?",
      chips: ["Class 9", "Class 10", "Class 11", "Class 12"],
    },
    { role: "user", text: "Class 11", picked: "Class 11" },
    {
      role: "bot",
      text: "And which stream — are you looking at JEE, NEET, or board-focused coaching?",
      chips: ["JEE", "NEET", "Boards only"],
    },
    { role: "user", text: "NEET", picked: "NEET" },
    { role: "user", text: "what are the fees for this" },
    {
      role: "bot",
      text: "For the two-year NEET programme starting Class 11 it's ₹1,45,000 a year, payable in three instalments, and that includes all study material and the test series. There's a 10% early-admission concession until 30 September.",
    },
    { role: "user", text: "ok. is there an evening batch? he has school till 4" },
    {
      role: "bot",
      text: "Yes — the evening batch runs 5:30 to 8:30, Monday to Saturday, which is what most school-going students take. Would you like to come and see the centre?",
    },
    { role: "user", text: "yes, maybe this weekend" },
    {
      role: "bot",
      text: "Lovely. Which day and time works — we're open 10 to 6 on Saturday and Sunday.",
      card: { kind: "scheduling", buttonLabel: "Pick a day and time", provider: "chatform", slot: "Sat 16 Sept, 11:00" },
    },
    { role: "user", text: "Saturday 11am" },
    { role: "bot", text: "Done. And the best number to send the confirmation to?" },
    { role: "user", text: "9876543210" },
    {
      role: "end",
      text: "See you Saturday.",
      body: "Saturday 16 September, 11:00 — NEET, Class 11. We'll send directions on WhatsApp.",
      cta: "Get directions",
    },
  ],
  demoCaption:
    "The parent asked about fees and the evening batch. Both got answered before anyone asked for a phone number.",

  template: { slug: "course-enrollment", name: "Course enrolment" },

  draft: {
    prompt: "Admission enquiry form for a NEET and JEE coaching centre",
    questions: [
      { label: "Which class is this for?", type: "Single select", tone: "choice" },
      { label: "Which stream?", type: "Single select", tone: "choice" },
      { label: "Student's name", type: "Short text", tone: "text" },
      { label: "Preferred visit day and time", type: "Date & time", tone: "number" },
      { label: "Parent's mobile number", type: "Phone", tone: "contact" },
    ],
  },

  shareSlug: "admission-enquiry",
  qrLabel: "A QR code for flyers, hoardings and the gate",

  samplePrompt: `Build an admission enquiry form for my coaching centre.

Start by asking which class the student is going into, then which stream they want — JEE, NEET, or board-focused. Then ask the student's name and which board they are studying under.

Ask which batch timing suits them — morning, afternoon or evening — and mention what hours each batch runs so they can choose properly rather than guessing.

Then ask whether they would like to visit the centre, and if yes, offer a day and a time within our opening hours. Finish by asking for the parent's name and mobile number.

Most parents ask about fees before anything else. When they do, answer it straight away with the real figure for the programme they have picked, mention the instalment option and any concession that is running, and then carry on with the enquiry. Do the same for questions about batch timings, transport, hostel, the test series, and faculty.

Keep the tone warm and respectful — this is a parent making a big decision about their child, not a customer buying something. Never pressure anyone. If they say they are just looking, take the details kindly and let them go.`,

  steps: [
    {
      title: "Open chatform and make an account",
      body: "Go to chatform.in and sign up. There is no card and no trial clock — the free plan takes unlimited enquiries, which for most centres is the whole admission season covered.",
    },
    {
      title: "Describe your centre and let it write the form",
      body: "Press New form and paste the example below in, changing the classes, streams and batches to yours. If your centre has a website, put the address in too and it will read it first so the wording sounds like you.",
      figure: "prompt",
      note: "your classes, your batches",
    },
    {
      title: "Write down your fees and timings once",
      body: "This is the step that matters most. In the Agent tab, add short notes for each programme's fee, the instalment plan, batch hours, transport, and anything else your desk repeats all day. From then on, parents get those answers instantly — in the middle of the enquiry, at any hour.",
      figure: "flow",
    },
    {
      title: "Turn on the mobile number check",
      body: "In Settings, ask for a texted code before the enquiry is accepted. Wrong numbers are the single biggest waste in admissions follow-up, and this removes almost all of them.",
    },
    {
      title: "Print the QR and send the link",
      body: "Publish it, then put the QR on your flyers, your hoarding and the gate, and send the link on WhatsApp to anyone who calls after hours. Parents scan it standing outside your centre.",
      figure: "share",
    },
  ],

  whatYouGet: [
    {
      title: "One list of every enquiry",
      body: "Class, stream, board, batch preference and a verified mobile number — instead of a register, four staff phones and somebody's memory.",
    },
    {
      title: "Visits already booked",
      body: "With a day and a time the parent chose, not a promise to call back.",
    },
    {
      title: "What parents are actually worried about",
      body: "Every question they asked, in their own words, sitting in the transcript. After a week you know exactly what your brochure is failing to say.",
    },
    {
      title: "A spreadsheet for your counsellors",
      body: "Download the lot whenever you want and hand it to whoever does the calling.",
    },
  ],

  resultFields: [
    { label: "Class and stream", value: "Class 11, NEET", tone: "choice" },
    { label: "Visit booked", value: "Sat 16 Sept, 11:00", tone: "number" },
    { label: "Parent mobile", value: "9876543210", tone: "contact" },
  ],
  responseReference: "CF-3310",

  faq: [
    {
      question: "Can parents use this on WhatsApp?",
      answer:
        "You send them the link on WhatsApp and it opens in their phone browser and works exactly like a chat. There is no app to install and nothing to sign up for. It is not a WhatsApp bot — we do not send messages on your behalf — but for the way most centres actually share things, a link in a WhatsApp reply, it works perfectly.",
    },
    {
      question: "Can it take the admission fee?",
      answer:
        "Not directly, and we would rather be plain about that. It can show your UPI QR or your payment link at the end and record that the parent said they paid — but the money never passes through us, so we cannot confirm it landed. Most centres use it for the enquiry and the visit, and take the fee at the desk where they always have.",
    },
    {
      question: "Will it give out a wrong fee figure?",
      answer:
        "It only says what you write in your notes. If you have not told it something, it says it does not know and that someone from the centre will confirm — it does not guess. Update the note when your fees change and every conversation from that moment uses the new figure.",
    },
    {
      question: "Can I have it in Hindi or my regional language?",
      answer:
        "Not properly yet, and this is a real limitation. If a parent writes in Hindi, it will reply in Hindi within that conversation. What you cannot do yet is publish one form in two languages with both sets of questions written out. If that is essential for you, it is worth waiting.",
    },
    {
      question: "Is my parents' data safe?",
      answer:
        "The enquiries are yours, stored for you to read and export, and never used to train an AI model. You can delete any enquiry, or all of them, whenever you want. You can also put a password on the form, or restrict it so each number can only enquire once.",
    },
  ],

  related: ["appointment-booking-form", "customer-feedback-form", "webinar-registration-form"],
});
