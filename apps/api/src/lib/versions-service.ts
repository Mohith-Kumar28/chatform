/**
 * A form's published versions: list them, read one, put one back.
 *
 * Extracted from `routes/form-history.ts` so the dashboard and `/v1` run the same
 * code. Version history shipped two days *after* the pass that built the developer
 * API, which is the whole reason it was session-only: nothing decided it, the
 * builder was simply the only caller at the time and no check would notice.
 *
 * Side effects are returned rather than performed here — `recordFormEvent` and
 * `audit` want `executionCtx.waitUntil`, which belongs to the route.
 */
import { diffFormDoc, summarizeChanges } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import type { FormRow } from "./guards.js";
import { parseStoredDoc, recordFormEvent, resolveActorNames } from "./form-activity.js";
import { audit } from "./gate-log.js";

export interface VersionRow {
  id: string;
  version: number;
  note: string | null;
  schema_json: string;
  published_at: number | null;
  created_at: number;
}

export function loadVersion(env: Bindings, formId: string, version: number): Promise<VersionRow | null> {
  return env.DB.prepare(
    `SELECT id, version, note, schema_json, published_at, created_at FROM form_versions WHERE form_id = ? AND version = ?`,
  )
    .bind(formId, version)
    .first<VersionRow>();
}

/**
 * Every version, newest first, each with the number of responses recorded against
 * it — which is what decides whether a rollback is a tidy-up or a decision. A
 * version nobody answered can be replaced freely; one with four hundred responses
 * behind it is the schema those answers were recorded against.
 */
export async function listVersions(env: Bindings, form: Pick<FormRow, "id" | "active_version_id">) {
  const rows = await env.DB.prepare(
    `SELECT v.id, v.version, v.note, v.published_at, v.created_at, v.created_by,
            (SELECT COUNT(*) FROM submissions s WHERE s.form_version_id = v.id AND s.status = 'completed') AS responses,
            (SELECT COUNT(*) FROM form_activity a WHERE a.form_version_id = v.id AND a.kind = 'edited') AS change_entries
       FROM form_versions v
      WHERE v.form_id = ?
      ORDER BY v.version DESC`,
  )
    .bind(form.id)
    .all<{
      id: string;
      version: number;
      note: string | null;
      published_at: number | null;
      created_at: number;
      created_by: string | null;
      responses: number;
      change_entries: number;
    }>();

  const withNames = await resolveActorNames(
    env,
    (rows.results ?? []).map((r) => ({ ...r, actor_id: r.created_by, actor_label: null as string | null })),
  );

  return withNames.map((r) => ({
    version: r.version,
    versionId: r.id,
    note: r.note,
    publishedAt: r.published_at ?? r.created_at,
    authorLabel: r.actor_label,
    changeCount: r.change_entries,
    isActive: r.id === form.active_version_id,
    responses: r.responses,
  }));
}

/**
 * One version, optionally diffed against another.
 *
 * `compare` defaults to nothing rather than to the previous version: diffing is a
 * second query and a second parse, and the caller asks for it when it is about to
 * show one.
 */
export async function readVersion(
  env: Bindings,
  formId: string,
  version: number,
  compare?: number,
): Promise<{
  version: number;
  versionId: string;
  note: string | null;
  publishedAt: number;
  doc: unknown;
  comparedTo: number | null;
  changes: ReturnType<typeof diffFormDoc>;
  summary: string | null;
} | null> {
  const row = await loadVersion(env, formId, version);
  if (!row) return null;

  const doc = parseStoredDoc(row.schema_json);
  let changes: ReturnType<typeof diffFormDoc> = [];
  let comparedTo: number | null = null;
  if (compare && compare !== version && doc) {
    const other = await loadVersion(env, formId, compare);
    const otherDoc = parseStoredDoc(other?.schema_json ?? null);
    if (otherDoc) {
      // Older on the left, so the diff reads as "what this version changed".
      const [before, after] = compare < version ? [otherDoc, doc] : [doc, otherDoc];
      changes = diffFormDoc(before, after);
      comparedTo = compare;
    }
  }

  return {
    version: row.version,
    versionId: row.id,
    note: row.note,
    publishedAt: row.published_at ?? row.created_at,
    doc,
    comparedTo,
    changes,
    summary: comparedTo === null ? null : summarizeChanges(changes),
  };
}

export interface Restored {
  ok: true;
  version: number;
  summary: string;
  changes: ReturnType<typeof diffFormDoc>;
  doc: unknown;
  /** Activity + audit writes. Hand to `afterResponse`; do not await on the hot path. */
  sideEffects: Promise<unknown>;
}

/**
 * Put a published version back into the working document.
 *
 * Restoring writes the *draft*, not the live form. Swinging `active_version_id`
 * back would be one call and would change what respondents see mid-session, with no
 * chance to look at what was restored first. This way the recovery stays reversible
 * until someone publishes, and the publish is the deliberate act it always is.
 */
export async function restoreVersion(
  env: Bindings,
  form: Pick<FormRow, "id" | "organization_id">,
  version: number,
  actor: { type: "user" | "api_key"; id: string },
): Promise<Restored | null | "invalid"> {
  const row = await loadVersion(env, form.id, version);
  if (!row) return null;

  const restored = parseStoredDoc(row.schema_json);
  if (!restored) return "invalid";

  const current = await env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ? AND deleted_at IS NULL`)
    .bind(form.id)
    .first<{ working_schema: string }>();
  const before = parseStoredDoc(current?.working_schema);
  const changes = before ? diffFormDoc(before, restored) : [];

  await env.DB.prepare(`UPDATE forms SET working_schema = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(restored), Date.now(), form.id)
    .run();

  const summary =
    changes.length === 0
      ? `Restored version ${version} (no change to the draft)`
      : `Restored version ${version} — ${summarizeChanges(changes)}`;

  const sideEffects = Promise.all([
    recordFormEvent(env, {
      formId: form.id,
      orgId: form.organization_id,
      kind: "restored",
      summary,
      changes,
      actor,
    }),
    audit(env, {
      orgId: form.organization_id,
      action: "form.restored",
      actorType: actor.type,
      actorId: actor.id,
      resourceType: "form",
      resourceId: form.id,
      meta: { version, changes: changes.length },
    }),
  ]);

  return { ok: true, version, summary, changes, doc: restored, sideEffects };
}
