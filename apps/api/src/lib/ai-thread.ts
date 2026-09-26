import { lintFormDoc, type Block, type FormDoc } from "@repo/form-schema";

/**
 * The builder AI bar's conversation, written by the server as it happens.
 *
 * Every message in it passes through the server already: the prompt arrives
 * at the edit route and the reply leaves it. So the server records both there,
 * in the same request, and the builder only reads the thread. Applying a
 * proposal is the one thing that happens in the browser; it rides along on
 * the autosave that applying triggers anyway (`appliedAiTurns`), so no call is
 * made for the conversation alone.
 *
 * One row per form, `turns_json` the last `MAX_TURNS` turns. Proposed
 * documents are never stored: they are large, and only useful while the offer
 * is on screen, where the browser still holds them.
 */

export interface StoredTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  blocks?: Block[];
  removed?: string[];
  updated?: string[];
  rules?: number;
  rewired?: number;
  orphaned?: string[];
  applied?: boolean;
}

const MAX_TURNS = 40;

export const turnId = () => crypto.randomUUID();

export function describeEdit(added: number, updated: number, removed: number, rules: number): string {
  const parts: string[] = [];
  if (added) parts.push(`${added} new question${added > 1 ? "s" : ""}`);
  if (updated) parts.push(`${updated} question${updated > 1 ? "s" : ""} changed`);
  if (removed) parts.push(`${removed} removed`);
  if (rules) parts.push(`${rules} branching rule${rules > 1 ? "s" : ""}`);
  return parts.length ? `Here is the change: ${parts.join(", ")}.` : "Here is the change.";
}

const unreachable = (doc: FormDoc) => lintFormDoc(doc).find((i) => i.code === "unreachable_blocks")?.refs ?? [];

/** The reply to a proposal, in the shape the builder draws. */
export function proposalTurn(
  base: FormDoc,
  proposed: FormDoc,
  r: { summary?: string; updatedRefs?: string[]; removedRefs?: string[]; rules?: number; rewired?: number },
): StoredTurn {
  const existing = new Set(base.blocks.map((b) => b.ref));
  const blocks = proposed.blocks.filter((b) => !existing.has(b.ref));
  const removed = r.removedRefs ?? [];
  const updated = r.updatedRefs ?? [];
  const rules = r.rules ?? 0;
  // Only what this proposal cuts off: a question already unreachable is not its fault.
  const before = new Set(unreachable(base));
  const orphaned = unreachable(proposed)
    .filter((ref) => !before.has(ref))
    .map((ref) => proposed.blocks.find((b) => b.ref === ref)?.title || ref);
  return {
    id: turnId(),
    role: "assistant",
    text: r.summary?.trim() || describeEdit(blocks.length, updated.length, removed.length, rules),
    blocks,
    removed,
    updated,
    rules,
    rewired: r.rewired ?? 0,
    orphaned,
  };
}

async function readTurns(db: D1Database, formId: string): Promise<StoredTurn[]> {
  const row = await db.prepare(`SELECT turns_json FROM form_ai_threads WHERE form_id = ?`).bind(formId).first<{ turns_json: string }>();
  try {
    const parsed = row ? JSON.parse(row.turns_json) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeTurns(db: D1Database, formId: string, turns: StoredTurn[]) {
  await db
    .prepare(
      `INSERT INTO form_ai_threads (form_id, turns_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(form_id) DO UPDATE SET turns_json = excluded.turns_json, updated_at = excluded.updated_at`,
    )
    .bind(formId, JSON.stringify(turns.slice(-MAX_TURNS)), Date.now())
    .run();
}

/** Add turns to the end of a form's thread. Never throws: a lost message must not fail the edit. */
export async function appendAiTurns(db: D1Database, formId: string, turns: StoredTurn[]): Promise<void> {
  try {
    await writeTurns(db, formId, [...(await readTurns(db, formId)), ...turns]);
  } catch (err) {
    console.error("ai_thread_append_failed", { formId, errMessage: err instanceof Error ? err.message : String(err) });
  }
}

/** Mark proposals applied, from the autosave the apply produced. */
export async function markAiTurnsApplied(db: D1Database, formId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const want = new Set(ids);
    const turns = await readTurns(db, formId);
    if (!turns.some((t) => want.has(t.id))) return;
    await writeTurns(db, formId, turns.map((t) => (want.has(t.id) ? { ...t, applied: true } : t)));
  } catch (err) {
    console.error("ai_thread_applied_failed", { formId, errMessage: err instanceof Error ? err.message : String(err) });
  }
}

/** A thread for a form the generator just built: what was asked, and what it made. */
export async function seedAiThread(
  db: D1Database,
  formId: string,
  prompt: string,
  built: { title: string; questions: number; rules: number },
): Promise<void> {
  const parts = [`${built.questions} question${built.questions === 1 ? "" : "s"}`];
  if (built.rules) parts.push(`${built.rules} branching rule${built.rules === 1 ? "" : "s"}`);
  await appendAiTurns(db, formId, [
    { id: turnId(), role: "user", text: prompt },
    { id: turnId(), role: "assistant", text: `Built “${built.title}”, ${parts.join(", ")}.` },
  ]);
}
