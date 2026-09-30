import type { ImportSource } from "@/components/import/import-client";

/**
 * The words on each `/import/<source>` page.
 *
 * Every line here traces to what the importer actually does
 * (`apps/api/src/lib/import/`), checked against real public forms: what each
 * source's public page exposes, and what our reader keeps. When the reader
 * changes, this changes with it. No claim here about a feature we do not copy.
 */
export interface ImportSourcePage {
  source: ImportSource;
  slug: string;
  name: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  comesWith: string[];
  check: string[];
  faq: { question: string; answer: string }[];
  /** The home page's switch section: the tab and the panel it opens. */
  band: {
    tagline: string;
    title: string;
    accent: string;
    body: string;
    steps: [string, string, string];
    /** The existing comparison page for this builder, when there is one. */
    compare?: string;
    /** A block-family colour from globals.css, for the panel's ground. */
    family: "content" | "advanced" | "contact" | "number" | "scale";
  };
}

const shared = {
  responses: {
    question: "Are my existing responses imported?",
    answer:
      "No. The importer copies the form, not its responses. Export your responses from your current builder before you switch.",
  },
  original: {
    question: "Does importing change my original form?",
    answer: "No. We only read the public link. Your original form keeps working exactly as it did.",
  },
  account: {
    question: "Do I need an account to try it?",
    answer:
      "No. Paste a link and you can talk to the converted form straight away. You need a free account only to keep it. Without one you can convert up to three forms a day.",
  },
};

export const IMPORT_PAGES: ImportSourcePage[] = [
  {
    source: "typeform",
    slug: "typeform",
    name: "Typeform",
    title: "Typeform to chatform converter: import your Typeform free | chatform",
    description:
      "Paste a public Typeform link and get it back as a conversational form: questions, choices, required fields, welcome and thank-you screens, and jumps. Free, no account needed to try.",
    h1: "Bring your Typeform over.",
    lede: "Paste its public link. You get the same questions, in the same order, running as a conversation you can try before you sign up.",
    comesWith: [
      "Every question, with its description, choices and required setting",
      "Welcome and thank-you screens",
      "Jumps that depend on the answer to the question they follow",
      "Groups, flattened into their questions",
      "Hidden fields",
    ],
    check: [
      "Rules that test an earlier answer are listed for you to rebuild in the Flow tab",
      "Scores and calculations are not copied",
      "Payment and Calendly blocks become a note: add them again",
      "Pictures on picture-choice answers are dropped; the answers stay",
    ],
    band: {
      tagline: "Keep every question",
      title: "Keep your questions.",
      accent: "Lose the script.",
      body: "Questions, choices, required fields, welcome screens and jumps come over, then it follows up when an answer is too thin.",
      steps: ["Paste your public Typeform link.", "Talk to it as a conversation, right here.", "Sign up free to keep it, then publish."],
      compare: "/typeform-alternative",
      family: "content",
    },
    faq: [
      shared.account,
      {
        question: "Can I import a private Typeform?",
        answer:
          "No. The importer reads what anyone with the link can see, so the form has to be published and open without signing in.",
      },
      shared.responses,
      shared.original,
    ],
  },
  {
    source: "google_forms",
    slug: "google-forms",
    name: "Google Forms",
    title: "Google Forms to chatform converter: import your Google Form free | chatform",
    description:
      "Paste a Google Form's respondent link and get it back as a conversational form: questions, choices, grids, scales, sections and go-to-section branching. Free, no account needed to try.",
    h1: "Turn your Google Form into a conversation.",
    lede: "Paste the link you send to respondents. You get the same questions and the same section branching, running as a conversation you can try before you sign up.",
    comesWith: [
      "Every question, with its description, options and required setting",
      "Grids, linear scales, dropdowns, dates and checkboxes",
      "Email, number and link validation",
      "Sections, and \"go to section\" branching on answers",
      "Your confirmation message",
    ],
    check: [
      "Images and videos are not copied",
      "Quiz points and answer keys are not copied",
      "A section's own \"after this section\" setting is not copied; answer-based jumps are",
    ],
    band: {
      tagline: "Make it a conversation",
      title: "Your Google Form.",
      accent: "Now it listens.",
      body: "Sections, go-to-section branching, grids, scales, dates and validation come over, and required stays required.",
      steps: ["Paste a Google Form link that opens without sign-in.", "Talk to it as a conversation, right here.", "Sign up free to keep it, then publish."],
      compare: "/google-forms-alternative",
      family: "advanced",
    },
    faq: [
      shared.account,
      {
        question: "Why does it say my form needs sign-in?",
        answer:
          "Google only shows a form's questions to people allowed to answer it. If your form is limited to your organization, or collects email addresses through sign-in, allow anyone with the link to respond, import it, then change it back.",
      },
      {
        question: "Can I import a closed Google Form?",
        answer:
          "Not while it is closed: Google stops serving a closed form's questions. Turn on Accepting responses for a minute, import it, then turn it off again.",
      },
      shared.responses,
    ],
  },
  {
    source: "tally",
    slug: "tally",
    name: "Tally",
    title: "Tally to chatform converter: import your Tally form free | chatform",
    description:
      "Paste a Tally form link and get it back as a conversational form: questions, options, ratings, scales, thank-you page and follow-up logic. Free, no account needed to try.",
    h1: "Bring your Tally form over.",
    lede: "Paste its link. You get the same questions and the same follow-ups, running as a conversation you can try before you sign up.",
    comesWith: [
      "Every question, with its options, placeholder and required setting",
      "Ratings, linear scales, dates, file uploads and signatures",
      "Follow-up questions shown only for certain answers",
      "Your thank-you page",
      "Hidden fields",
    ],
    check: [
      "Show and hide rules that do not sit right after their question are listed for you to rebuild",
      "Calculated fields and payment blocks are not copied",
      "Images and embeds are not copied",
    ],
    band: {
      tagline: "Keep your follow-ups",
      title: "Your Tally form.",
      accent: "Now it talks back.",
      body: "Questions, ratings, scales and the follow-ups you show only for certain answers come over, and run one question at a time.",
      steps: ["Paste your Tally form link.", "Talk to it as a conversation, right here.", "Sign up free to keep it, then publish."],
      compare: "/tally-alternative",
      family: "contact",
    },
    faq: [
      shared.account,
      {
        question: "Can I import a password-protected Tally form?",
        answer: "No. Remove the password, import it, then add the password back if you still need it on the original.",
      },
      shared.responses,
      shared.original,
    ],
  },
  {
    source: "jotform",
    slug: "jotform",
    name: "Jotform",
    title: "Jotform to chatform converter: import your Jotform free | chatform",
    description:
      "Paste a Jotform link and get it back as a conversational form: fields, required stars, grids, scales, section headings and fields shown for certain answers. Free, no account needed to try.",
    h1: "Turn your Jotform into a conversation.",
    lede: "Paste the form link. You get the same fields and the same show-this-if logic, asked one at a time as a conversation you can try before you sign up.",
    comesWith: [
      "Every field, with its choices and required star",
      "Names, addresses, dates, file uploads and signatures",
      "Grids, rating stars and scales, with their end labels",
      "Fields shown only for certain answers",
      "Section headings and text blocks",
    ],
    check: [
      "Show and hide rules that do not sit right after their question are listed for you to rebuild",
      "Payment fields, widgets and images are not copied",
      "Appointment slots come over as a date question",
    ],
    band: {
      tagline: "One question at a time",
      title: "Your Jotform.",
      accent: "Minus the wall of fields.",
      body: "Fields, required stars, grids, scales and the fields you show only for certain answers come over, and get asked one at a time.",
      steps: ["Paste your Jotform link.", "Talk to it as a conversation, right here.", "Sign up free to keep it, then publish."],
      compare: "/jotform-alternative",
      family: "number",
    },
    faq: [
      shared.account,
      {
        question: "Does my Jotform's conditional logic come over?",
        answer:
          "Fields you show only for certain answers come over as a branch when they sit right after the question they depend on, which is how most forms use them. Other conditions, like calculations or page skips, are listed for you to rebuild.",
      },
      shared.responses,
      shared.original,
    ],
  },
  {
    source: "youform",
    slug: "youform",
    name: "Youform",
    title: "Youform to chatform converter: import your Youform free | chatform",
    description:
      "Paste a public Youform link and get it back as a conversational form: blocks, picture choices, statements, thank-you screens and jumps, images included. Free, no account needed to try.",
    h1: "Bring your Youform over.",
    lede: "Paste its public link. You get the same blocks and the same jumps, and the conversation reads each answer and asks a follow-up when one is too thin.",
    comesWith: [
      "Every block, with its choices, placeholder and required setting",
      "Picture choices, with their pictures",
      "Welcome, statement and thank-you screens",
      "Jumps that depend on the answer to the block they follow",
      "Images, copied into your account",
    ],
    check: [
      "Rules that test an earlier answer or a variable are listed for you to rebuild",
      "Scores and calculations are not copied",
      "Payment and scheduling blocks become a note: add them again",
    ],
    band: {
      tagline: "An agent, not a script",
      title: "Your Youform.",
      accent: "Now it follows up.",
      body: "Blocks, picture choices, thank-you screens and jumps come over with their images, then it follows up on thin answers.",
      steps: ["Paste your public Youform link.", "Talk to it as a conversation, right here.", "Sign up free to keep it, then publish."],
      compare: "/youform-alternative",
      family: "scale",
    },
    faq: [
      shared.account,
      {
        question: "Can I import a Youform that isn't published?",
        answer: "No. The importer reads the public link, so the form has to be published and open without signing in.",
      },
      shared.responses,
      shared.original,
    ],
  },
  {
    source: "website",
    slug: "website",
    name: "Website",
    title: "Turn any website form into a conversational form, free | chatform",
    description:
      "Paste a link to any page with a form on it, like a contact page, signup or application, and get it back as a conversational form with the same fields, options and required settings. Free, no account needed to try.",
    h1: "Bring a form over from any website.",
    lede: "Paste the link to a page with a form on it. You get the same fields and options, asked one at a time as a conversation.",
    comesWith: [
      "Every field, with its label and placeholder",
      "Dropdowns, radio buttons and checkboxes, with their options in order",
      "Email, phone, website, number and date fields, by their type or their label",
      "Required fields, when the page marks them",
      "A Typeform, Google Form, Tally, Jotform or Youform embedded in the page",
    ],
    check: [
      "A form the page builds only after it loads can't be read: link to the form itself",
      "Search boxes and single-field signups are skipped",
      "Where the page doesn't mark required fields, every field comes over optional",
    ],
    band: {
      tagline: "Any page with a form",
      title: "Your contact page.",
      accent: "Now it's a conversation.",
      body: "Fields, dropdowns, checkboxes and required marks come over from any page's form, asked one question at a time.",
      steps: ["Paste the link to a page with a form.", "Talk to it as a conversation, right here.", "Sign up free to keep it, then publish."],
      family: "contact",
    },
    faq: [
      shared.account,
      {
        question: "What if the page has no form?",
        answer: "We tell you we couldn't find one. Paste the link to the page the form is on, or to the form itself.",
      },
      shared.responses,
      shared.original,
    ],
  },
];

export function importPage(slug: string): ImportSourcePage | undefined {
  return IMPORT_PAGES.find((p) => p.slug === slug);
}
