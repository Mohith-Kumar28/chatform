import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * Opaque keyset cursors.
 *
 * Keyset rather than offset because D1 degrades on large offsets and, worse,
 * an offset shifts under concurrent inserts — a caller paging through responses
 * while new ones arrive would silently skip some and see others twice.
 *
 * Signed because an unsigned cursor is a query the client can rewrite: an
 * unrecognised sort column is a table scan, and a hand-edited position is a
 * wrong page returned as if it were right.
 */

export interface Cursor {
  order: "created" | "updated";
  sort: number;
  id: string;
}

function secretOf(env: Bindings): string {
  return env.SIGNING_SALT || env.BETTER_AUTH_SECRET;
}

export function encodeCursor(env: Bindings, cursor: Cursor): string {
  const payload = `${cursor.order}.${cursor.sort}.${cursor.id}`;
  const sig = sha256Hex(`${payload}.${secretOf(env)}`).slice(0, 16);
  return btoa(`${payload}.${sig}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(env: Bindings, raw: string): Cursor | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const parts = decoded.split(".");
    if (parts.length !== 4) return null;
    const [order, sortRaw, id, sig] = parts as [string, string, string, string];
    if (order !== "created" && order !== "updated") return null;
    if (sha256Hex(`${order}.${sortRaw}.${id}.${secretOf(env)}`).slice(0, 16) !== sig) return null;
    const sort = Number(sortRaw);
    if (!Number.isFinite(sort)) return null;
    return { order, sort, id };
  } catch {
    return null;
  }
}

export interface Page<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

/**
 * Turn `limit + 1` rows into a page.
 *
 * Fetching one extra row is how `has_more` is answered without a second COUNT
 * query over a table that only grows.
 */
export function paginate<T extends { id: string }>(
  env: Bindings,
  rows: T[],
  limit: number,
  order: "created" | "updated",
  sortOf: (row: T) => number,
): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    has_more: hasMore,
    next_cursor: hasMore && last ? encodeCursor(env, { order, sort: sortOf(last), id: last.id }) : null,
  };
}
