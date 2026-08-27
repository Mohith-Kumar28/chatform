import type { Block, FormDoc } from "@repo/form-schema";

/**
 * Template-mode phrasing: deterministic, zero-cost question/ack text.
 * The AI agent layer (M5) replaces these with LLM-generated phrasing.
 */

export function greeting(doc: FormDoc): string {
  const first = doc.blocks[0];
  if (first?.type === "welcome") {
    return [first.title, first.description].filter(Boolean).join("\n\n");
  }
  return `Hi! I'll walk you through "${doc.title}" — it only takes a minute.`;
}

export function questionText(block: Block): string {
  return [block.title, block.description].filter(Boolean).join("\n\n");
}

const TRANSITIONS = ["Got it!", "Thanks!", "Perfect.", "Great!", "Noted."];

export function transitionAck(index: number): string {
  return TRANSITIONS[index % TRANSITIONS.length]!;
}

export function clarifyText(block: Block, hint: string, attempt: number): string {
  const openers = ["Hmm, ", "Sorry — ", "One more try: ", "Let me rephrase: "];
  const opener = openers[Math.min(attempt, openers.length - 1)]!;
  return `${opener}${hint} ${block.title}`;
}

export function escalateText(block: Block): string {
  return `No problem — let's make this easier. You can use the controls below for "${block.title}".`;
}

export function closingText(endingTitle: string): string {
  return endingTitle;
}

/**
 * Is this a question rather than an attempt at an answer?
 *
 * Only used on the deterministic path — when the agent is unavailable or its
 * budget is spent — and only after validation has already failed. Getting it
 * wrong in either direction is cheap: a missed question is answered with the
 * old clarify line, and a false positive re-asks the question either way.
 */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  return /^(why|what|whats|what's|how|who|when|where|which|can|could|would|will|should|do|does|did|is|are|am)\b/i.test(t);
}

/**
 * What to say when the respondent asked something and there is no agent to
 * answer it.
 *
 * The scripted path used to reply to "Why do you want my phone number?" with
 * "Sorry — Please enter a valid phone number with country code." — which reads
 * as a machine that did not listen, and is the exact opposite of the product's
 * claim. It cannot answer an arbitrary question without a model, but it can
 * stop pretending the question was a bad answer, and the form's author may have
 * already written the answer to this one.
 */
export function asideText(block: Block): string {
  const why = block.agentHints?.whyWeAsk?.trim();
  if (why) return why;
  return block.required
    ? "Good question — I can't answer that one here, but this answer is needed to finish."
    : "Good question — I can't answer that one here, and you're welcome to skip this if you'd rather.";
}
