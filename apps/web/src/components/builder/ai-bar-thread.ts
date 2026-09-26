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
 * Load the thread from the server.
 *
 * It lived only in this browser's storage, so a teammate, or a support admin
 * acting as the author, opened the bar to nothing. The server holds it now.
 * A thread still sitting in this browser from before is carried up the first
 * time the form is opened here, then the local copy is dropped.
 */
export async function loadHistory(formId: string): Promise<Turn[]> {
  const remote = apiData<{ turns?: Turn[] }>(await getApiFormsByIdAiThread(formId)).turns ?? [];
  if (remote.length > 0) {
    clearLocal(formId);
    return remote;
  }
  const local = readLocal(formId);
  if (local.length > 0) {
    await saveHistory(formId, local);
    clearLocal(formId);
  }
  return local;
}

/** Proposed docs are large and only useful while the offer is live, so the saved copy drops them. */
export async function saveHistory(formId: string, turns: Turn[]): Promise<void> {
  const slim = turns
    .slice(-MAX_TURNS)
    .map(({ doc, ...rest }) => (doc ? { ...rest, applied: rest.applied ?? false, stale: true } : rest));
  await putApiFormsByIdAiThread(formId, { turns: slim as never });
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
    // Local first, so the builder has it even if this request is still in
    // flight when it loads; `loadHistory` carries it up if this one fails.
    localStorage.setItem(historyKey(formId), JSON.stringify(seeded));
    void saveHistory(formId, seeded).catch(() => {});
  } catch {
    // A blocked store costs the transcript, not the form.
  }
}
