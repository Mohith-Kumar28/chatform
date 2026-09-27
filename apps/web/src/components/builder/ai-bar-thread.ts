import type { Block, FormDoc } from "@repo/form-schema";
import { getApiFormsByIdAiThread } from "@/lib/api/dashboard/dashboard";
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
 * Load the thread. The server writes it as the conversation happens (see
 * `apps/api/src/lib/ai-thread.ts`); the builder only reads it.
 */
export async function loadHistory(formId: string): Promise<Turn[]> {
  return apiData<{ turns?: Turn[] }>(await getApiFormsByIdAiThread(formId)).turns ?? [];
}
