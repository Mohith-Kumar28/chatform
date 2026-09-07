import type { Bindings } from "../env.js";

/**
 * Everything a departing account leaves behind, removed before the account is.
 *
 * `DELETE FROM users` on its own is not account deletion. It cascades to the
 * four tables that name a user directly — sessions, accounts, members,
 * invitations — and stops there, which would leave the workspace that person
 * created still standing, still holding their forms and every response those
 * forms ever collected, owned by nobody and reachable by nobody. Three other
 * tables name a user in `created_by` with no cascade at all, so on a database
 * enforcing foreign keys the delete would not leave a mess, it would simply
 * fail.
 *
 * The rule is ownership, not authorship:
 *
 *   - A workspace nobody else is in goes with them. It was theirs; its forms,
 *     its responses and its uploaded files were theirs.
 *   - A workspace with other members stays, and their *name* comes off it.
 *     Deleting a shared team's forms because one member left would be data
 *     loss dressed up as a privacy feature.
 *
 * Runs in `beforeDelete`, so a failure aborts the deletion with the account
 * still intact and still usable. That is the right way round: a half-deleted
 * account is worse than one that reported an error and asked to try again.
 */
export async function purgeUserData(env: Bindings, userId: string): Promise<void> {
  const memberships = await env.DB.prepare(`SELECT organization_id AS org FROM members WHERE user_id = ?`)
    .bind(userId)
    .all<{ org: string }>();

  for (const { org } of memberships.results ?? []) {
    const others = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM members WHERE organization_id = ? AND user_id <> ?`,
    )
      .bind(org, userId)
      .first<{ n: number }>();

    if ((others?.n ?? 0) > 0) {
      // Shared. Their authorship is anonymised; the work belongs to the team.
      // These columns are nullable precisely so a person can leave.
      await env.DB.batch([
        env.DB.prepare(`UPDATE forms SET created_by = NULL WHERE created_by = ?1 AND organization_id = ?2`).bind(userId, org),
        env.DB.prepare(`UPDATE workspaces SET created_by = NULL WHERE created_by = ?1 AND organization_id = ?2`).bind(userId, org),
        env.DB.prepare(
          `UPDATE form_versions SET created_by = NULL
            WHERE created_by = ?1 AND form_id IN (SELECT id FROM forms WHERE organization_id = ?2)`,
        ).bind(userId, org),
      ]);
      continue;
    }

    /*
      Sole member: the whole workspace goes.

      R2 first, and deliberately so. The `files` table is the only index we
      have of what this workspace put in the bucket; deleting the organization
      row cascades those rows away, and every object they pointed at would
      still be sitting in R2 with nothing left that knows its key. Orphaned
      objects are not a tidiness problem — they are the customer's respondents'
      uploads, surviving a deletion that told everyone it had removed them.

      It also means anything that throws in here throws with objects already
      destroyed, which is why `purgeOrgObjects` is written so that nothing in
      it scales with the size of the workspace.
    */
    await purgeOrgObjects(env, org);
    await env.DB.prepare(`DELETE FROM organizations WHERE id = ?`).bind(org).run();
  }

  // Anything they authored outside a workspace they were still a member of —
  // a form in a team they were removed from, say. The account is about to go
  // and these columns point at it.
  await env.DB.batch([
    env.DB.prepare(`UPDATE forms SET created_by = NULL WHERE created_by = ?`).bind(userId),
    env.DB.prepare(`UPDATE workspaces SET created_by = NULL WHERE created_by = ?`).bind(userId),
    env.DB.prepare(`UPDATE form_versions SET created_by = NULL WHERE created_by = ?`).bind(userId),
  ]);
}

/**
 * Delete one organization's objects from R2.
 *
 * Paged, because a busy workspace's `files` table is unbounded and `R2.delete`
 * takes at most a thousand keys at a time.
 *
 * The page advances on an `id` cursor rather than by deleting the rows it just
 * cleared, and that is the whole point of the shape. Naming each key in a
 * `WHERE r2_key IN (…)` spent one bound parameter per key against a D1 query
 * that accepts a hundred — so a workspace with a hundred uploaded files, which
 * is one form with a file question and a hundred responses, threw
 * `too many SQL variables` *after* `R2.delete` had already succeeded. The
 * respondent's uploads were gone, the rows still pointed at them, and the
 * deletion the customer asked for came back as a failure. Three bound
 * parameters now, whatever the size of the workspace.
 *
 * The single `DELETE` at the end is belt and braces: these rows cascade with
 * the organization anyway. It runs because "the objects are gone" and "the
 * index of them is gone" should be one step, not two separated by a cascade
 * nobody reading this function can see.
 */
async function purgeOrgObjects(env: Bindings, orgId: string): Promise<void> {
  // R2's own per-call ceiling, so the page size is the batch size.
  const PAGE = 1000;
  let after = "";

  for (;;) {
    const page = await env.DB.prepare(
      `SELECT id, r2_key AS key FROM files
        WHERE organization_id = ?1 AND r2_key IS NOT NULL AND id > ?2
        ORDER BY id LIMIT ${PAGE}`,
    )
      .bind(orgId, after)
      .all<{ id: string; key: string }>();

    const rows = page.results ?? [];
    if (rows.length === 0) break;

    await env.R2.delete(rows.map((r) => r.key));
    // Advanced before the rows are gone, which is why the cursor exists: the
    // table is cleared once, at the end, so "the next page" has to be a
    // position rather than "whatever is left".
    after = rows[rows.length - 1]!.id;
    if (rows.length < PAGE) break;
  }

  await env.DB.prepare(`DELETE FROM files WHERE organization_id = ?`).bind(orgId).run();
}
