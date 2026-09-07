import type { Block, FormDoc } from "@repo/form-schema";

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Just for the preview list; applying uses `doc`. */
  blocks?: Block[];
  /** Refs of questions the proposal takes out. */
  removed?: string[];
  /** How many branching rules the proposal adds. */
  rules?: number;
  /** How many questions had their routing replaced. */
  rewired?: number;
  /**
   * The whole proposed document.
   *
   * Applying used to push the new blocks onto the end of the local doc, which
   * threw away both the positions the server chose and every branching rule it
   * wrote — the two things that make a conditional question work.
   */
  doc?: FormDoc;
  applied?: boolean;
}

/**
 * The thread outlives the popover.
 *
 * It used to live in component state, so clicking away — which is how the bar
 * collapses — erased what you had asked and what it answered. Kept per form,
 * because the conversation is about this form's questions and means nothing
 * next to another one.
 */
const historyKey = (formId: string) => `chatform:aibar:${formId}`;
const MAX_TURNS = 40;

export function loadHistory(formId: string): Turn[] {
  try {
    const raw = localStorage.getItem(historyKey(formId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Turn[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(formId: string, turns: Turn[]) {
  try {
    // Proposed docs are large and only useful while the offer is live, so the
    // stored copy keeps the conversation and drops the payloads.
    const slim = turns.slice(-MAX_TURNS).map(({ doc, ...rest }) => (doc ? { ...rest, applied: rest.applied ?? false, stale: true } : rest));
    localStorage.setItem(historyKey(formId), JSON.stringify(slim));
  } catch {
    // A full or blocked store is not worth failing a suggestion over.
  }
}

/**
 * Seed the thread with the prompt the form was born from.
 *
 * A form generated from a prompt arrived in the builder with an empty AI bar, so
 * the one message that explains every question on the canvas — the brief — was
 * the only message not in the conversation about it. Follow-ups then landed with
 * no idea what they were amending. Written straight to storage from the create
 * dialog because the bar is not mounted yet when the form is made; it is picked
 * up on the builder's first load like any other stored thread.
 *
 * Never overwrites: a form whose thread already exists has been talked to.
 */
export function seedAiBarThread(
  formId: string,
  prompt: string,
  built: { title: string; questions: number; rules: number },
): void {
  try {
    if (localStorage.getItem(historyKey(formId))) return;
    const parts = [`${built.questions} question${built.questions === 1 ? "" : "s"}`];
    if (built.rules) parts.push(`${built.rules} branching rule${built.rules === 1 ? "" : "s"}`);
    const seeded: Turn[] = [
      { id: crypto.randomUUID(), role: "user", text: prompt },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        // No `doc` and no `blocks`: this is not an offer to apply, it is what
        // already happened. The questions are on the canvas behind the bar.
        text: `Built “${built.title}” — ${parts.join(", ")}.`,
      },
    ];
    localStorage.setItem(historyKey(formId), JSON.stringify(seeded));
  } catch {
    // A blocked store costs the transcript, not the form.
  }
}
