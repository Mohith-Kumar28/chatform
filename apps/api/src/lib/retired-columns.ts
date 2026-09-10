import { safeReadFormDoc, type Block } from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * Questions a form used to ask, recovered for the responses that answered them.
 *
 * Deleting a question in the builder has never deleted its answers —
 * `submission_answers` rows are keyed by `(submission_id, block_ref)` and hold
 * no reference to the block. What deleting it *did* do was hide them: both the
 * results table and the exports built their column list from the form's current
 * document, so removing five "Team member N" questions took five columns off
 * the screen and out of every CSV, for responses that had answered them. The
 * data was still in D1 and unreachable from the product, which is
 * indistinguishable from deletion for anyone who did not have a database
 * console.
 *
 * A published version is a full snapshot of the document (`form_versions.
 * schema_json`), so the question is recoverable in the wording it was asked in
 * — not just the ref. That matters more than it sounds: a retired
 * `multiple_choice` needs its own `options` to turn `opt_founder001` back into
 * "Founder", and `displayAnswer` can only do that given the block. A title
 * alone would produce a column of ids.
 *
 * Retired columns go *after* the live ones, in both surfaces. The current form
 * is what the author is thinking about; its history belongs at the far end of
 * the table.
 */

/**
 * How far back through published versions a deleted question is worth chasing.
 *
 * Each version is a whole document, so this is the read that has to stay
 * bounded. Fifty is far more history than a form that still has the answers in
 * question typically has, and the scan stops early the moment every retired ref
 * has been resolved — the common case is one version, or none at all.
 */
const VERSION_SCAN = 50;

/**
 * A ref with answers but no question left anywhere: it was asked by a draft
 * that was never published, or by a version older than the scan window.
 *
 * The ref is then all the wording there is. It renders as a column headed by
 * its own ref rather than being dropped, because a column of real answers
 * under an ugly header is still the answers, and dropping it is the behaviour
 * this whole module exists to undo.
 */
function placeholderBlock(ref: string, type: string): Block {
  return {
    id: ref,
    ref,
    title: ref,
    type,
    required: false,
    visibility: null,
    image_key: null,
    agentHints: null,
    media: null,
  } as unknown as Block;
}

/**
 * Resolve the questions behind answers whose block is gone from the form.
 *
 * `seen` is ref → `block_type`, taken from the answers a caller has *already*
 * loaded rather than from a fresh scan of `submission_answers`. That is
 * deliberate on both counts: it costs no extra query, and it cannot invent a
 * column that has nothing under it in the rows being rendered — a question
 * deleted after only a test response would otherwise show up as an empty column
 * forever.
 */
export async function resolveRetiredBlocks(
  env: Bindings,
  formId: string,
  seen: ReadonlyMap<string, string>,
  liveRefs: ReadonlySet<string>,
): Promise<Block[]> {
  const pending = new Map<string, string>();
  for (const [ref, type] of seen) if (!liveRefs.has(ref)) pending.set(ref, type);
  if (pending.size === 0) return [];

  const versions = await env.DB.prepare(
    `SELECT schema_json FROM form_versions WHERE form_id = ? ORDER BY version DESC LIMIT ?`,
  )
    .bind(formId, VERSION_SCAN)
    .all<{ schema_json: string }>();

  const out: Block[] = [];
  for (const v of versions.results ?? []) {
    if (pending.size === 0) break;
    let doc;
    try {
      // A historical version that no longer parses is skipped, not thrown:
      // an unreadable snapshot from a year ago must not take down the results
      // page of a form that is collecting responses today.
      doc = safeReadFormDoc(JSON.parse(v.schema_json));
    } catch {
      continue;
    }
    if (!doc) continue;
    // Newest version first, and in that version's own block order — so five
    // questions retired together come back in the order they were asked.
    for (const b of doc.blocks) {
      if (!pending.has(b.ref)) continue;
      pending.delete(b.ref);
      if (b.type === "welcome" || b.type === "statement") continue;
      out.push(b);
    }
  }

  for (const ref of [...pending.keys()].sort()) {
    out.push(placeholderBlock(ref, pending.get(ref)!));
  }
  return out;
}
