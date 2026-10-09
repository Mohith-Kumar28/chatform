import type { Bindings } from "../env.js";
import type { SessionDO } from "../do/session-do.js";
import { SESSION_LOCATION, sessionObjectId } from "./session-location.js";
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

export async function drainStoragePurges(
  env: Bindings,
): Promise<{ r2: number; vector: number; session_object: number; session: number }> {
  return {
    r2: await drain(env, "r2", BATCH, async (refs) => {
      await env.R2.delete(refs);
    }),
    vector: await drain(env, "vector", BATCH, async (refs) => {
      // Remote-only: a local worker has no index, so there is nothing to delete.
      if (env.VECTORIZE) await env.VECTORIZE.deleteByIds(refs);
    }),
    // Objects listed from the namespace by id, each checking for its own conversation.
    session_object: await drain(env, "session_object", SESSION_BATCH, async (refs) => {
      const failed: string[] = [];
      await Promise.all(
        refs.map(async (ref) => {
          try {
            const stub = env.SESSION_DO.get(env.SESSION_DO.idFromString(ref), SESSION_LOCATION) as unknown as DurableObjectStub<SessionDO>;
            const outcome = await stub.purgeIfOrphaned();
            if (outcome === "purged") console.log("session_object_purged", ref);
          } catch {
            failed.push(ref);
          }
        }),
      );
      return failed;
    }),
    session: await drain(env, "session", SESSION_BATCH, async (refs) => {
      // Each one on its own: a single object failing must not keep the rest queued.
      const failed: string[] = [];
      await Promise.all(
        refs.map(async (ref) => {
          try {
            const stub = env.SESSION_DO.get(sessionObjectId(env.SESSION_DO, ref), SESSION_LOCATION) as unknown as DurableObjectStub<SessionDO>;
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
  kind: "r2" | "vector" | "session" | "session_object",
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

/**
 * Builder images nothing uses any more: replaced logos and avatars, media taken
 * out of a form, images of forms long since purged.
 *
 * An image is named by its id inside form documents (the draft and every
 * published version, so restoring an old version never loses one), organization
 * logos, profile pictures and templates. Each is looked up about once a day, a
 * week after upload at the earliest so one added a moment ago is never taken
 * before the draft that uses it is saved. Deleting the row queues the object.
 */
export async function sweepUnusedAssets(env: Bindings, now = Date.now(), limit = 25): Promise<number> {
  const due =
    (
      await env.DB.prepare(
        `SELECT id FROM files
          WHERE uploaded_by = 'builder' AND form_id IS NULL AND status = 'confirmed'
            AND created_at < ?1 AND COALESCE(checked_at, 0) < ?2
          ORDER BY COALESCE(checked_at, 0) LIMIT ?3`,
      )
        .bind(now - 7 * 86_400_000, now - 86_400_000, limit)
        .all<{ id: string }>()
    ).results ?? [];

  let removed = 0;
  for (const { id } of due) {
    const res = await env.DB.prepare(
      `DELETE FROM files
        WHERE id = ?1
          AND NOT EXISTS (SELECT 1 FROM forms WHERE instr(working_schema, ?1) > 0)
          AND NOT EXISTS (SELECT 1 FROM form_versions WHERE instr(schema_json, ?1) > 0)
          AND NOT EXISTS (SELECT 1 FROM organizations WHERE instr(COALESCE(logo, ''), ?1) > 0)
          AND NOT EXISTS (SELECT 1 FROM users WHERE instr(COALESCE(image, ''), ?1) > 0)
          AND NOT EXISTS (SELECT 1 FROM form_templates WHERE instr(schema_json, ?1) > 0)`,
    )
      .bind(id)
      .run();
    if ((res.meta?.changes ?? 0) > 0) {
      removed++;
      console.log("unused_asset_deleted", id);
    } else {
      await env.DB.prepare(`UPDATE files SET checked_at = ? WHERE id = ?`).bind(now, id).run();
    }
  }
  return removed;
}

/**
 * Respondents nothing points at any more.
 *
 * A respondent is a person across forms, with their email and phone. When the
 * last response that names them goes (deleted, purged with its form or its
 * organization) and no bug report or merged record names them either, keeping
 * their contact details serves nobody. A week since they were last seen, so one
 * in the middle of starting a response is never caught. Their keys cascade.
 */
export async function pruneOrphanRespondents(env: Bindings, now = Date.now()): Promise<number> {
  const res = await env.DB.prepare(
    `DELETE FROM respondents WHERE id IN (
       SELECT r.id FROM respondents r
        WHERE r.last_seen_at < ?1
          AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.respondent_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM respondent_feedback f WHERE f.respondent_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM respondents m WHERE m.merged_into = r.id)
          -- A merged row leads an old id to the surviving person; it stays while they do.
          AND (r.merged_into IS NULL OR NOT EXISTS (SELECT 1 FROM respondents w WHERE w.id = r.merged_into))
        LIMIT 500)`,
  )
    .bind(now - 7 * 86_400_000)
    .run();
  return res.meta?.changes ?? 0;
}
