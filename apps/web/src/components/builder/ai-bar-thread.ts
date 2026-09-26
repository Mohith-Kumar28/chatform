import type { Block, FormDoc } from "@repo/form-schema";
import { getApiFormsByIdAiThread, putApiFormsByIdAiThread } from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Just for the preview list; applying uses `doc`. */
  blocks?: Block[];
  /** Refs of questions the proposal takes out. */
  removed?: string[];
  /** Refs of questions whose settings the proposal changes — unique, required, bounds. */
  updated?: string[];
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
  /**
   * Titles of questions this proposal leaves with no route to them, that had
   * one before it. The server lints every proposal and nothing read the
   * answer: an edit that cut seven questions off the flow was offered with a
   * plain "Apply", and applied.
   */
  orphaned?: string[];
  applied?: boolean;
}

/**
 * The thread outlives the popover.
 *
 * It used to live in component state, so clicking away — which is how the bar
 * collapses — erased what you had asked and what it answered. Kept per form,
 * because the conversation is about this form's questions and means nothing
 * next to another one, and on the server, so everyone who opens the form
 * sees the same one.
 */
const historyKey = (formId: string) => `chatform:aibar:${formId}`;
const MAX_TURNS = 40;

/**
 * Load the thread. The server writes it as the conversation happens (see
 * `apps/api/src/lib/ai-thread.ts`); the builder only reads it.
 *
 * TEMPORARY: threads from before that lived in this browser's storage only.
 * One still here is carried up the first time its form is opened, then the
 * local copy is dropped. Remove this, `readLocal`, `clearLocal` and
 * `PUT /api/forms/{id}/ai-thread` once those have drained.
 */
export async function loadHistory(formId: string): Promise<Turn[]> {
  const remote = apiData<{ turns?: Turn[] }>(await getApiFormsByIdAiThread(formId)).turns ?? [];
  if (remote.length > 0) {
    clearLocal(formId);
    return remote;
  }
  const local = readLocal(formId);
  if (local.length > 0) {
    // Saved copies never held a proposal's document, so they go up as they are.
    await putApiFormsByIdAiThread(formId, { turns: local.slice(-MAX_TURNS) as never });
    clearLocal(formId);
  }
  return local;
}

function readLocal(formId: string): Turn[] {
  try {
    const raw = localStorage.getItem(historyKey(formId));
    const parsed = raw ? (JSON.parse(raw) as Turn[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearLocal(formId: string) {
  try {
    localStorage.removeItem(historyKey(formId));
  } catch {
    /* nothing to clear */
  }
}
