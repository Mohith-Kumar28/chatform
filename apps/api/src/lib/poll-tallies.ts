import type { Bindings } from "../env.js";

/**
 * The counts behind a `poll` block.
 *
 * Two operations and no more: move a vote, and read the split. Everything that
 * makes a poll interesting to a respondent happens in the runtime; this only
 * has to be right about arithmetic.
 */

export interface PollTally {
  /** Option ids to their count, including the options nobody picked. */
  counts: Record<string, number>;
  total: number;
}

/**
 * Move one vote from one option to another.
 *
 * `from` is what this respondent picked before, if anything: a poll answer can
 * be changed, and changing it has to move the bar rather than add to both. It
 * is the same call either way, which is what keeps the two paths from drifting
 * apart the way an increment-here and decrement-there pair would.
 *
 * The decrement is floored at zero. A count that has already been rebuilt, or
 * a vote moved twice by a retry, must not leave a negative bar on a public
 * page over an arithmetic race nobody can see.
 */
export async function movePollVote(
  env: Bindings,
  args: { formId: string; blockRef: string; from?: string | null; to?: string | null },
): Promise<void> {
  const { formId, blockRef, from, to } = args;
  if (from === to) return;

  const now = Date.now();
  const statements = [];

  if (to) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO poll_tallies (form_id, block_ref, option_id, count, updated_at)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT (form_id, block_ref, option_id)
         DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
      ).bind(formId, blockRef, to, now),
    );
  }
  if (from) {
    statements.push(
      env.DB.prepare(
        `UPDATE poll_tallies SET count = MAX(0, count - 1), updated_at = ?
          WHERE form_id = ? AND block_ref = ? AND option_id = ?`,
      ).bind(now, formId, blockRef, from),
    );
  }
  if (statements.length > 0) await env.DB.batch(statements);
}

/**
 * The split for one poll.
 *
 * Returns only the rows that exist; the runtime fills the options nobody has
 * picked with zero, because it is the side that knows what the options are.
 */
export async function readPollTally(env: Bindings, formId: string, blockRef: string): Promise<PollTally> {
  const rows = await env.DB.prepare(
    `SELECT option_id, count FROM poll_tallies WHERE form_id = ? AND block_ref = ? AND count > 0`,
  )
    .bind(formId, blockRef)
    .all<{ option_id: string; count: number }>();

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows.results ?? []) {
    counts[row.option_id] = row.count;
    total += row.count;
  }
  return { counts, total };
}
