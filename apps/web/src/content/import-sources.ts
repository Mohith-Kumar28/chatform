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
];

export function importPage(slug: string): ImportSourcePage | undefined {
  return IMPORT_PAGES.find((p) => p.slug === slug);
}
