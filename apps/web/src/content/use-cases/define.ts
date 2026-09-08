import type { DemoTurn } from "@/components/marketing/chat-demo-scripts";
import type { DraftedQuestion } from "@/components/marketing/ai-build-preview";

/**
 * One use-case guide, as data.
 *
 * These pages exist for somebody who has never heard of chatform. They arrive
 * from a search like "appointment booking form" or "how to collect
 * testimonials", they run a salon or a studio or a small charity, and they do
 * not care what we are built on or how many question types there are. They
 * care whether this fixes the thing that is annoying them this week.
 *
 * So the shape of this type is the shape of that argument, in that order:
 *
 *   1. `problem`  — the thing that is annoying them, named before we appear.
 *   2. `outcomes` — what is different for their business afterwards.
 *   3. `demo`     — what the person filling it in actually sees. This is the
 *                   most persuasive thing on the page and it plays itself.
 *   4. `steps`    — how to get there today, including a prompt to paste.
 *   5. `whatYouGet`, `faq` — the objections, answered.
 *
 * Deliberately absent: any field for a feature list. Every one of these pages
 * could be written as "chatform supports conditional logic and 27 question
 * types", and every one of them would be worse.
 */

export type UseCaseGroup =
  | "Win more work"
  | "Fill your calendar"
  | "Hear from customers"
  | "Grow an audience"
  | "Run a community"
  | "Hire and onboard";

export interface UseCaseStep {
  /** Imperative, and short enough to scan as a numbered list. */
  title: string;
  body: string;
  /**
   * Which product surface to draw beside this step.
   *
   * These name the reproduction components in `components/marketing`, not
   * screenshots. A screenshot is a picture of one theme at one width taken on
   * one day; these are the real interface, so they follow light and dark, they
   * reflow on a phone, and they cannot quietly stop matching the product.
   */
  figure?: "prompt" | "questions" | "flow" | "share" | "results" | "chat";
  /** A margin aside, in the hand. At most one per page — see `annotate.tsx`. */
  note?: string;
}

export interface UseCaseInput {
  /** The search phrase, as the URL: `appointment-booking-form`. */
  slug: string;
  /** Short label, for the nav menu. */
  name: string;
  group: UseCaseGroup;
  /** Who this is for, in their own words. Shown under the nav label. */
  audience: string;
  /** One line, for the dropdown and the hub card. */
  navBlurb: string;

  title: string;
  description: string;
  h1: string;
  lede: string;

  problem: {
    headline: string;
    body: string;
    /** The three or four specific things going wrong today. */
    symptoms: readonly string[];
  };

  /** What is different about their business afterwards. Three or four. */
  outcomes: readonly { title: string; body: string }[];

  /** The conversation, played back. Every turn must be something the product does. */
  demo: readonly DemoTurn[];
  demoCaption: string;

  /** One of the 35 seeded templates, when there is a fitting one. */
  template?: { slug: string; name: string };

  /**
   * The paste-in prompt.
   *
   * Long on purpose. A one-line prompt produces a one-line form, and the whole
   * promise of the page is that somebody with no time gets something usable on
   * the first try. These are written to be copied whole.
   */
  samplePrompt: string;

  /**
   * What the builder draws back after that prompt.
   *
   * Shown beside the step that tells them to paste it, so the promise and the
   * result sit next to each other. Every question here has to be one the
   * sample prompt would actually produce — this is a claim about the product,
   * not a mood board.
   */
  draft: {
    /** The short version, as it appears in the prompt bar. */
    prompt: string;
    /** Only when reading a site is genuinely part of this use case's story. */
    readUrl?: string;
    readPages?: number;
    questions: readonly DraftedQuestion[];
  };

  /** The slug in the shared link, so the share figure shows their form. */
  shareSlug: string;
  /** What the QR is for, in their world: "Stick it on the counter". */
  qrLabel: string;

  steps: readonly UseCaseStep[];

  /** What lands in their inbox and dashboard afterwards. Outcome-shaped. */
  whatYouGet: readonly { title: string; body: string }[];

  /**
   * The three values pulled out of that conversation, as the results pane
   * would show them. Authored rather than derived: the transcript beside them
   * comes straight from `demo`, but which three answers matter is a judgement
   * about this particular job, not something a function can work out.
   */
  resultFields: readonly { label: string; value: string; tone: string }[];
  /** The reference on the sample response. Cosmetic, but it should not repeat. */
  responseReference: string;

  faq: readonly { question: string; answer: string }[];

  /** Slugs of two or three sibling guides. */
  related: readonly string[];
}

export interface UseCase extends UseCaseInput {
  /** `/use-cases/<slug>`, computed once. */
  path: string;
}

export function defineUseCase(input: UseCaseInput): UseCase {
  if (input.samplePrompt.length < 400) {
    throw new Error(
      `defineUseCase(${input.slug}): the sample prompt is ${input.samplePrompt.length} characters. ` +
        `These exist so somebody with no time gets a usable form on the first try; a short one ` +
        `produces a short form and wastes the visit.`,
    );
  }
  if (input.steps.length < 4) {
    throw new Error(`defineUseCase(${input.slug}): a step-by-step with ${input.steps.length} steps is not one.`);
  }
  if (input.demo.length < 5) {
    throw new Error(`defineUseCase(${input.slug}): the demo is the most persuasive thing on the page. Five turns minimum.`);
  }
  return { ...input, path: `/use-cases/${input.slug}` };
}
