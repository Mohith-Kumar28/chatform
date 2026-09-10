/**
 * D1 accepts a hundred bound parameters per statement. Per *statement* — a
 * batch does not raise the ceiling, it just sends several statements that each
 * have to stay under it.
 *
 * This is the limit that produced `too many SQL variables` in production once
 * already: `purgeOrgObjects` used to name every R2 key in one `IN (…)`, and a
 * workspace with a hundred uploaded files threw *after* the objects were
 * deleted. Nothing local catches it — the D1 in miniflare and in the vitest
 * pool does not enforce the cap — so an `IN (…)` built from a page of rows is
 * only ever wrong in production, and only once the page gets big.
 *
 * So: any list that comes from a page of rows, a request body, or a sweep's
 * `LIMIT` goes through `bindChunks` first, and the caller sends the pieces in
 * one `DB.batch()`.
 */

/** Cloudflare's documented ceiling. Here to be named at the call sites, not to be reached. */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Ids per statement. Half the ceiling, so a statement can bind a form id, a
 * status and a timestamp beside its list without anybody having to count.
 */
export const BIND_CHUNK = 50;

/** Split a list into slices small enough to bind. Empty in, empty out. */
export function bindChunks<T>(items: readonly T[], size = BIND_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** `?,?,?` for a slice — always paired with `bindChunks`, never with a raw list. */
export function holesFor(items: readonly unknown[]): string {
  return items.map(() => "?").join(",");
}
