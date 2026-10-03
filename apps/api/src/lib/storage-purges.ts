import type { Bindings } from "../env.js";
import type { SessionDO } from "../do/session-do.js";
import { SESSION_LOCATION } from "./session-location.js";
import { bindChunks, holesFor } from "./d1-bindings.js";

/**
 * Delete what deleted rows left outside D1.
 *
 * The rows are queued by triggers (migration 0058), so this never has to know
 * which route deleted what: a purge, a response delete, a workspace or an
 * organization going by cascade all land here the same way. A batch that fails
 * stays queued and is tried again next tick; after `MAX_ATTEMPTS` it is dropped
 * with a log line rather than blocking the queue behind it forever.
 */

const MAX_ATTEMPTS = 10;
/** R2 and Vectorize both delete up to a thousand at once. */
const BATCH = 1000;
/** One Durable Object call each, so far fewer per tick. */
const SESSION_BATCH = 100;

type Row = { id: number; ref: string; attempts: number };

export async function drainStoragePurges(env: Bindings): Promise<{ r2: number; vector: number; session: number }> {
  return {
    r2: await drain(env, "r2", BATCH, async (refs) => {
      await env.R2.delete(refs);
    }),
    vector: await drain(env, "vector", BATCH, async (refs) => {
      // Remote-only: a local worker has no index, so there is nothing to delete.
      if (env.VECTORIZE) await env.VECTORIZE.deleteByIds(refs);
    }),
    session: await drain(env, "session", SESSION_BATCH, async (refs) => {
      // Each one on its own: a single object failing must not keep the rest queued.
      const failed: string[] = [];
      await Promise.all(
        refs.map(async (ref) => {
          try {
            const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(ref), SESSION_LOCATION) as unknown as DurableObjectStub<SessionDO>;
            await stub.purge();
          } catch {
            failed.push(ref);
          }
        }),
      );
      return failed;
    }),
  };
}

async function drain(
  env: Bindings,
  kind: "r2" | "vector" | "session",
  limit: number,
  remove: (refs: string[]) => Promise<string[] | void>,
): Promise<number> {
  const rows =
    (
      await env.DB.prepare(`SELECT id, ref, attempts FROM storage_purges WHERE kind = ? ORDER BY id LIMIT ?`)
        .bind(kind, limit)
        .all<Row>()
    ).results ?? [];
  if (rows.length === 0) return 0;

  let failedRefs: Set<string>;
  try {
    failedRefs = new Set((await remove([...new Set(rows.map((r) => r.ref))])) ?? []);
  } catch (err) {
    console.error("storage_purge_failed", kind, err instanceof Error ? err.message : String(err));
    failedRefs = new Set(rows.map((r) => r.ref));
  }

  const done = rows.filter((r) => !failedRefs.has(r.ref) || r.attempts + 1 >= MAX_ATTEMPTS);
  const retry = rows.filter((r) => failedRefs.has(r.ref) && r.attempts + 1 < MAX_ATTEMPTS);
  for (const r of rows) {
    if (failedRefs.has(r.ref) && r.attempts + 1 >= MAX_ATTEMPTS) console.error("storage_purge_gave_up", kind, r.ref);
  }
  const writes = [
    ...bindChunks(done.map((r) => r.id)).map((ids) => env.DB.prepare(`DELETE FROM storage_purges WHERE id IN (${holesFor(ids)})`).bind(...ids)),
    ...bindChunks(retry.map((r) => r.id)).map((ids) =>
      env.DB.prepare(`UPDATE storage_purges SET attempts = attempts + 1 WHERE id IN (${holesFor(ids)})`).bind(...ids),
    ),
  ];
  if (writes.length > 0) await env.DB.batch(writes);
  return done.length;
}

/**
 * Uploads that were never confirmed: the respondent left mid-upload, or the
 * confirm call never arrived. A day is long past any upload in progress; the
 * row goes, and its trigger queues the object.
 */
export async function prunePendingUploads(env: Bindings, now = Date.now()): Promise<number> {
  const res = await env.DB.prepare(
    `DELETE FROM files WHERE rowid IN (SELECT rowid FROM files WHERE status = 'pending' AND created_at < ? LIMIT 500)`,
  )
    .bind(now - 86_400_000)
    .run();
  return res.meta?.changes ?? 0;
}
