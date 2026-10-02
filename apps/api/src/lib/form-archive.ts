import type { Bindings } from "../env.js";
import { bindChunks, holesFor } from "./d1-bindings.js";
import { enqueueMail } from "./mail.js";

/**
 * Deleting a form archives it.
 *
 * The row stays, hidden from every listing and from respondents by `deleted_at`, and
 * comes back with one click for thirty days. Then the purge below removes it for good:
 * responses, conversations and uploads with it. The person who archived it is warned
 * three days and one day before.
 *
 * A restored form comes back as a draft, whatever it was. Respondents finding a form
 * live again because someone tidied the Archive is worse than one extra click on Publish.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const ARCHIVE_RETENTION_MS = 30 * DAY_MS;

export type PurgeNotice = "3d" | "1d";
const NOTICE_LEAD_MS: Record<PurgeNotice, number> = { "3d": 3 * DAY_MS, "1d": DAY_MS };

/**
 * Warnings go out once a day, in this UTC hour (08:30 in India), so a batch of forms
 * archived together lands as one email rather than one per five-minute tick.
 */
const NOTICE_HOUR_UTC = 3;

/** Archive a form. False when it was not found or already archived. */
export async function archiveForm(
  env: Bindings,
  a: { formId: string; orgId: string; userId: string | null },
  now = Date.now(),
): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE forms SET deleted_at = ?1, purge_at = ?2, deleted_by = ?3, purge_notice = NULL, status = 'archived'
      WHERE id = ?4 AND organization_id = ?5 AND deleted_at IS NULL`,
  )
    .bind(now, now + ARCHIVE_RETENTION_MS, a.userId, a.formId, a.orgId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Bring an archived form back, as a draft. False when it is not in the Archive. */
export async function restoreForm(env: Bindings, a: { formId: string; orgId: string }, now = Date.now()): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE forms SET deleted_at = NULL, purge_at = NULL, deleted_by = NULL, purge_notice = NULL, status = 'draft', updated_at = ?1
      WHERE id = ?2 AND organization_id = ?3 AND deleted_at IS NOT NULL AND purge_at > ?1`,
  )
    .bind(now, a.formId, a.orgId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Delete now instead of waiting: the next sweep removes it. False when it is not in the Archive. */
export async function purgeFormNow(env: Bindings, a: { formId: string; orgId: string }, now = Date.now()): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE forms SET purge_at = ?1 WHERE id = ?2 AND organization_id = ?3 AND deleted_at IS NOT NULL AND purge_at > ?1`,
  )
    .bind(now, a.formId, a.orgId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export interface ArchivedFormRow {
  id: string;
  title: string;
  workspace_id: string;
  organization_id: string;
  deleted_at: number;
  purge_at: number;
  deleted_by_name: string | null;
  responses: number;
  partials: number;
  conversations: number;
  uploads: number;
}

/** What an archived form holds, for the Archive list and the warning email. */
export const ARCHIVED_FORM_SELECT = `
  SELECT f.id, f.title, f.workspace_id, f.organization_id, f.deleted_at, f.purge_at,
         u.name AS deleted_by_name,
         (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.status = 'completed') AS responses,
         (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.status IN ('abandoned','in_progress','disqualified')) AS partials,
         (SELECT COUNT(*) FROM chat_sessions cs WHERE cs.form_id = f.id) AS conversations,
         (SELECT COUNT(*) FROM files fl WHERE fl.form_id = f.id) AS uploads
    FROM forms f LEFT JOIN users u ON u.id = f.deleted_by`;

/**
 * The three-day and one-day warnings.
 *
 * Grouped by recipient: someone who archived ten forms on Monday gets one email
 * listing ten, not ten emails. Each form's stage is claimed on its own row before
 * anything is queued, so a retried tick never sends a warning twice.
 */
export async function sweepPurgeNotices(env: Bindings, now = Date.now()): Promise<number> {
  if (new Date(now).getUTCHours() !== NOTICE_HOUR_UTC) return 0;
  const { results } = await env.DB.prepare(
    `SELECT id, organization_id, purge_at, purge_notice, COALESCE(deleted_by, created_by) AS recipient
       FROM forms
      WHERE purge_at IS NOT NULL AND purge_at > ?1 AND purge_at <= ?2
        AND organization_id <> 'org_import_trials'
        AND (purge_notice IS NULL OR (purge_notice = '3d' AND purge_at <= ?3))
      LIMIT 500`,
  )
    .bind(now, now + NOTICE_LEAD_MS["3d"], now + NOTICE_LEAD_MS["1d"])
    .all<{ id: string; organization_id: string; purge_at: number; purge_notice: string | null; recipient: string | null }>();

  const groups = new Map<string, { userId: string | null; organizationId: string; stage: PurgeNotice; formIds: string[] }>();
  for (const row of results ?? []) {
    const stage: PurgeNotice = row.purge_at - now <= NOTICE_LEAD_MS["1d"] ? "1d" : "3d";
    const claimed = await env.DB.prepare(`UPDATE forms SET purge_notice = ?1 WHERE id = ?2 AND purge_notice IS ?3`)
      .bind(stage, row.id, row.purge_notice)
      .run();
    if ((claimed.meta?.changes ?? 0) === 0) continue;
    const key = `${row.recipient ?? ""}|${row.organization_id}|${stage}`;
    const group = groups.get(key) ?? { userId: row.recipient, organizationId: row.organization_id, stage, formIds: [] };
    group.formIds.push(row.id);
    groups.set(key, group);
  }

  // A chunk per mail, so the renderer's `IN (...)` stays under D1's bound-parameter ceiling.
  for (const g of groups.values()) {
    for (const formIds of bindChunks(g.formIds)) {
      await enqueueMail(env, { kind: "form_purge_notice", ...g, formIds });
    }
  }
  return groups.size;
}

/** Rows deleted per statement while tearing a form down. */
const PAGE = 500;

/**
 * Delete archived forms whose time is up, for good.
 *
 * Waits until the knowledge and bug-report sweeps have cleared the form (they key on
 * the same `purge_at`): both tables hold data outside D1 (vectors and R2 objects),
 * and a form row deleted first would leave those with nothing pointing at them.
 *
 * Big forms are torn down a page at a time and may take several ticks. Nothing is
 * read from a half-purged form in between: it has been out of every listing and the
 * runtime since it was archived.
 */
export async function purgeDueForms(env: Bindings, now = Date.now(), limit = 5): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT f.id FROM forms f
      WHERE f.purge_at IS NOT NULL AND f.purge_at <= ?1 AND f.deleted_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM knowledge_sources k WHERE k.form_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM respondent_feedback r WHERE r.form_id = f.id)
      ORDER BY f.purge_at LIMIT ?2`,
  )
    .bind(now, limit)
    .all<{ id: string }>();

  let purged = 0;
  for (const { id } of results ?? []) {
    try {
      if (await purgeForm(env, id, now)) purged++;
    } catch (err) {
      // One form failing must not hold up the others; it is picked up again next tick.
      console.error("form_purge_failed", { formId: id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return purged;
}

/** True once the form row itself is gone. False means more pages remain for the next tick. */
async function purgeForm(env: Bindings, formId: string, now: number, budget = 40): Promise<boolean> {
  // Respondent uploads: the R2 objects first, since `files` is the only index of their keys.
  for (;;) {
    if (budget-- <= 0) return false;
    const page = await env.DB.prepare(`SELECT id, r2_key FROM files WHERE form_id = ? LIMIT ${PAGE}`)
      .bind(formId)
      .all<{ id: string; r2_key: string | null }>();
    const rows = page.results ?? [];
    if (rows.length === 0) break;
    const keys = rows.flatMap((r) => (r.r2_key ? [r.r2_key] : []));
    if (keys.length > 0) await env.R2.delete(keys);
    await env.DB.batch(
      bindChunks(rows.map((r) => r.id)).map((chunk) => env.DB.prepare(`DELETE FROM files WHERE id IN (${holesFor(chunk)})`).bind(...chunk)),
    );
  }

  // The large tables, a page at a time, children before parents.
  const paged = [
    `DELETE FROM submission_answers WHERE rowid IN (SELECT rowid FROM submission_answers WHERE form_id = ?1 LIMIT ${PAGE * 10})`,
    `DELETE FROM submissions WHERE rowid IN (SELECT rowid FROM submissions WHERE form_id = ?1 LIMIT ${PAGE})`,
    `DELETE FROM chat_sessions WHERE rowid IN (SELECT rowid FROM chat_sessions WHERE form_id = ?1 LIMIT ${PAGE})`,
  ];
  for (const sql of paged) {
    for (;;) {
      if (budget-- <= 0) return false;
      const res = await env.DB.prepare(sql).bind(formId).run();
      if ((res.meta?.changes ?? 0) === 0) break;
    }
  }

  // What names the form without a foreign key, then the form; everything else cascades.
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM followups WHERE form_id = ?1`).bind(formId),
    env.DB.prepare(`DELETE FROM import_trials WHERE form_id = ?1 OR claimed_form_id = ?1`).bind(formId),
    env.DB.prepare(`DELETE FROM forms WHERE id = ?1 AND deleted_at IS NOT NULL AND purge_at <= ?2`).bind(formId, now),
  ]);
  console.log("form_purged", { formId });
  return true;
}
