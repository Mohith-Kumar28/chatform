import { SETTING_SECTIONS, SETTING_SECTION_IDS, type SettingSection } from "@repo/form-schema";
import type { AiCallContext } from "./ai.js";
import { askJev, jevAvailable, type JevEnv, type JevQuestion, type JevResult } from "./jev.js";

/**
 * Which parts of the builder a request is about, decided before the edit model runs.
 *
 * The edit prompt could carry every setting on every turn, and most turns would
 * pay for it: "add a phone question" needs none of the fifty-odd settings, and
 * "make it navy" needs one section of them. A lookup tool was the other way to
 * keep them out, and it lost when it was tried for question types (see the note
 * at the top of `edit-tools.ts`): the model called it on almost every edit, and
 * each call re-sends the whole context.
 *
 * So the choice is made here, by Jev, which is a classifier: it answers each
 * question below with a probability and can write nothing, so the worst it can
 * do is send the model a section too many or too few. Too many costs tokens;
 * too few is caught by falling back to every section whenever the call fails
 * or nothing clears the bar on a request that is not about questions.
 */

/**
 * The bar a section must clear. Tuned by `pnpm --filter @repo/api eval:route`
 * against labelled builder requests.
 *
 * Deliberately low. A section sent that was not needed costs a few lines of
 * prompt (~150 tokens, a hundredth of a cent); a section missed is a change
 * the model cannot make at all. Jev scores the second clause of a compound
 * request low when the first is loud: "use Lora for the headings and make it
 * more professional" put the interviewer at 0.21. Measured 2026-09-30 on 62
 * requests: no misses at 0.15, about 1.7 extra sections a request.
 */
export const T_SECTION = 0.15;
export const T_QUESTION = 0.5;

export interface RequestRoute {
  /** The settings sections to show the model, in registry order. */
  sections: SettingSection[];
  /** It asks how or where to do something rather than asking for a change. */
  asksHowTo: boolean;
  /** It asks to add something to the knowledge base the interviewer answers from. */
  wantsKnowledge: boolean;
  /** Jev's call, for usage logging; null when none was made or it failed. */
  call: JevResult | null;
  /** Every section was sent because Jev could not be asked or did not answer. */
  fellBack: boolean;
}

function sectionQuestion(summary: string): JevQuestion {
  return {
    type: "noul",
    instructions:
      "A request can ask for several things at once. Does any part of `request`, even one clause of it, ask to change or ask about this part of the form's settings?",
    criteria: {
      true: `Some part of the request is about: ${summary}. It may say so in its own words, and other parts may be about something else entirely.`,
      false: "No part of the request is about this. Every part is about something else, such as the questions themselves, their order or their branching.",
    },
  };
}

const HOW_TO: JevQuestion = {
  type: "noul",
  instructions: "Is `request` asking how or where to do something in the form builder, rather than asking for a change to be made?",
  criteria: {
    true: "It asks for directions or an explanation: how do I, where is, can I, what does this do.",
    false: "It asks for something to be changed, added or removed, or answers a question it was asked.",
  },
};

const KNOWLEDGE: JevQuestion = {
  type: "noul",
  instructions: "Does `request` ask to add a web page, a link or some text to what the interviewer knows and answers questions from?",
  criteria: {
    true: "It wants information added to the knowledge base, or a page read so the interviewer can answer from it.",
    false: "It asks for anything else, including copying questions from a link into the form.",
  },
};

const QUESTIONS_ONLY: JevQuestion = {
  type: "noul",
  instructions: "Is `request` only about the form's questions, answer options, endings or branching?",
  criteria: {
    true: "Every part of it is about what the form asks, in what order, and where each answer leads.",
    false: "Some part of it is about how the form looks, how the interviewer behaves, who can respond, when it closes, emails, sharing or embedding.",
  },
};

export async function routeRequest(
  env: JevEnv,
  input: { request: string; previous?: string | null },
  ctx: Omit<AiCallContext, "kind">,
  opts: Pick<NonNullable<Parameters<typeof askJev>[4]>, "fetch" | "onFailure" | "timeoutMs"> = {},
): Promise<RequestRoute> {
  const everything: RequestRoute = {
    sections: [...SETTING_SECTION_IDS],
    asksHowTo: false,
    wantsKnowledge: false,
    call: null,
    fellBack: true,
  };
  const request = input.request.trim();
  if (!request || !jevAvailable(env)) return everything;

  const questions: Record<string, JevQuestion> = { how_to: HOW_TO, knowledge: KNOWLEDGE, questions_only: QUESTIONS_ONLY };
  for (const id of SETTING_SECTION_IDS) questions[`section_${id}`] = sectionQuestion(SETTING_SECTIONS[id]);

  // The previous reply is there for the short answers: "yes, do that" means
  // whatever the AI just offered, and the request alone says nothing.
  const state: Record<string, unknown> = { request: request.slice(0, 2000) };
  if (input.previous) state.previous_reply = input.previous.slice(0, 1000);

  /*
   * One retry, which the answer gate deliberately does without. There a failed
   * call costs nothing, because the agent turn it stands in front of runs
   * anyway. Here it costs the whole prompt: every section sent at once is a
   * prompt in which the model measurably drifts from the setting asked for
   * towards building questions. This runs beside the link reader, so the
   * retry costs time only when the first call has already failed.
   */
  const ask = () => askJev(env, state, questions, ctx, { ...opts, kind: "edit_route" });
  const call = (await ask()) ?? (await ask());
  if (!call) return everything;

  const p = (id: string) => {
    const a = call.answers[id];
    return a?.type === "noul" ? a.noul : 0;
  };
  const sections = SETTING_SECTION_IDS.filter((id) => p(`section_${id}`) >= T_SECTION);
  const asksHowTo = p("how_to") >= T_QUESTION;
  const wantsKnowledge = p("knowledge") >= T_QUESTION;
  // Nothing cleared the bar on a request Jev does not think is about questions:
  // that is a request it could not place, and a setting the model cannot see is
  // one it cannot change. Send them all rather than guess. A how-to question
  // or a knowledge request with no section is already placed: the map of the
  // builder that every prompt carries is what it needs.
  if (sections.length === 0 && p("questions_only") < 0.5 && !asksHowTo && !wantsKnowledge) {
    return { ...everything, call };
  }
  return { sections, asksHowTo, wantsKnowledge, call, fellBack: false };
}
