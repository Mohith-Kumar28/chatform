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

/**
 * What the agent says to somebody who came back through a follow-up link.
 *
 * It names what they already did, because the research on unfinished tasks is
 * clear that people do *not* remember them — the Zeigarnik effect does not
 * replicate — while the disposition to resume one, once reminded, is real. So
 * this rebuilds the context instead of assuming it: it says how many questions
 * they got through and that the answers were kept, which is the thing they will
 * actually be wondering.
 */
export function resumeGreeting(doc: FormDoc, answered: number): string {
  const title = doc.title;
  if (answered <= 0) return `Let's pick up "${title}" where you left off.`;
  const n = answered === 1 ? "the first question" : `${answered} questions`;
  return `Welcome back — you'd already answered ${n} of "${title}". I've kept them, so let's carry on from here.`;
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

/**
 * What the agent says when a code has just gone out.
 *
 * The destination is repeated back deliberately. It is the last chance to
 * notice a typo before waiting for a message that is never going to arrive,
 * and the number or address they typed is not always the one we normalized.
 */
export function codeSentText(channel: "sms" | "email", destination: string): string {
  return channel === "sms"
    ? `I've texted a 6-digit code to ${destination} — pop it in below to confirm the number.`
    : `I've emailed a 6-digit code to ${destination} — pop it in below to confirm the address.`;
}

/** When they replied to the code step with something that is not a code. */
export function codeExpectedText(channel: "sms" | "email"): string {
  return channel === "sms"
    ? "I still need the 6-digit code from that text — or say the word and I'll send another."
    : "I still need the 6-digit code from that email — or say the word and I'll send another.";
}

/** Once the code checks out, before the conversation moves on. */
export function codeVerifiedText(channel: "sms" | "email"): string {
  return channel === "sms" ? "Number confirmed, thank you." : "Address confirmed, thank you.";
}
