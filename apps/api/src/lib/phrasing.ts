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
