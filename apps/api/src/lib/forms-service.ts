import { FormDoc, lintFormDoc, hasErrors, migrateFormDoc, type FormDoc as FormDocT } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { stripForPublish, checkDocLimits } from "./doc-entitlements.js";
import { limitReached, type Entitlements } from "@repo/entitlements";
import { describeSchemaError, type ApiIssue } from "./api-error.js";
import {
  parseStoredDoc,
  recordDocChange,
  recordFormEvent,
  stampVersionStatement,
  type Actor,
  type ActivitySource,
} from "./form-activity.js";

/**
 * Form writes, shared by the dashboard and the developer API.
 *
 * Called as functions from both, never over HTTP: routing `/v1` through the
 * dashboard's own handler would run its middleware twice and lose the request
 * id. The surfaces keep their own guards — session plus RBAC on one, key plus
 * scope on the other — and share only the part that decides what a valid
 * document is.
 */

export interface DocIssue {
  level: string;
  code: string;
  message: string;
  path?: string;
}

export type UpdateDocResult =
  | { ok: true; issues: DocIssue[]; doc: FormDocT }
  | { ok: false; status: 422; code: "invalid_doc"; message: string; issues: ApiIssue[] };

/** Validate and migrate an incoming document. Never store one that has not been through this. */
export function parseDoc(raw: unknown): UpdateDocResult {
  const parsed = FormDoc.safeParse(migrateFormDoc(raw));
  if (!parsed.success) {
    // The sentence and the per-field detail are separate audiences; see
    // `describeSchemaError`. `message` no longer carries a dotted path.
    const { message, issues } = describeSchemaError(parsed.error);
    return { ok: false, status: 422, code: "invalid_doc", message, issues };
  }
  return { ok: true, issues: lintFormDoc(parsed.data) as DocIssue[], doc: parsed.data };
}

export type PublishResult =
  | { ok: true; version: number; versionId: string; stripped: unknown[] }
  | { ok: false; status: 402 | 404 | 422; body: unknown };

/**
 * Publish the working document as an immutable version.
 *
 * Lint errors and hard document limits both refuse rather than truncate:
 * silently dropping someone's 140th question would be data loss, and telling
 * them the number is not.
 */
export async function publishForm(
  env: Bindings,
  args: {
    formId: string;
    userId: string | null;
    ent: Entitlements;
    /** Only needed to write history; a publish without it still publishes. */
    orgId?: string;
    /** An optional label for the version, so a changelog entry can have a name. */
    note?: string | null;
    source?: ActivitySource;
  },
): Promise<PublishResult> {
  const row = await env.DB.prepare(
    `SELECT organization_id, working_schema, theme_json, settings_json FROM forms WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(args.formId)
    .first<{ organization_id: string; working_schema: string; theme_json: string | null; settings_json: string | null }>();
  if (!row) {
    return { ok: false, status: 404, body: { error: { code: "not_found", message: "Form not found" } } };
  }

  const parsed = parseDoc(JSON.parse(row.working_schema));
  if (!parsed.ok) {
    return {
      ok: false,
      status: 422,
      body: { error: { code: "invalid_doc", message: "Working document is invalid" } },
    };
  }
  if (hasErrors(parsed.issues as never)) {
    return {
      ok: false,
      status: 422,
      body: {
        error: {
          code: "lint_failed",
          message: parsed.issues.filter((i) => i.level === "error").map((i) => i.message).join("; "),
          issues: parsed.issues.filter((i) => i.level === "error"),
        },
      },
    };
  }

  const overLimit = checkDocLimits(parsed.doc, args.ent);
  if (overLimit.length > 0) {
    const first = overLimit[0]!;
    return {
      ok: false,
      status: 402,
      body: limitReached({
        limitKey: first.limitKey,
        plan: args.ent.planId,
        used: first.used,
        limit: first.limit,
        context: { surface: "publish" },
      }),
    };
  }

  /**
   * Gated settings are removed from the version being published, and every
   * removal is reported. The working document is untouched, so an upgrade
   * republishes the full thing with no re-authoring.
   */
  const { doc: publishable, stripped } = stripForPublish(parsed.doc, args.ent);
  const max = await env.DB.prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM form_versions WHERE form_id = ?`)
    .bind(args.formId)
    .first<{ v: number }>();
  const version = (max?.v ?? 0) + 1;
  const versionId = `ver_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const note = args.note?.trim().slice(0, 200) || null;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, theme_json, settings_json, checksum, note, published_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      versionId,
      args.formId,
      version,
      JSON.stringify(publishable),
      row.theme_json,
      row.settings_json,
      crypto.randomUUID().slice(0, 16),
      note,
      Date.now(),
      args.userId,
      Date.now(),
    ),
    env.DB.prepare(`UPDATE forms SET status = 'published', active_version_id = ?, updated_at = ? WHERE id = ?`).bind(
      versionId,
      Date.now(),
      args.formId,
    ),
    /**
     * Every edit still marked unpublished belongs to this version now. Batched with the
     * insert because a publish whose changes stayed marked unpublished is a history that
     * contradicts the form it describes.
     */
    stampVersionStatement(env, args.formId, versionId),
  ]);

  await recordFormEvent(env, {
    formId: args.formId,
    orgId: args.orgId ?? row.organization_id,
    kind: "published",
    summary: note ? `Published v${version} — ${note}` : `Published version ${version}`,
    versionId,
    actor: { type: args.source === "api" ? "api_key" : "user", id: args.userId },
    source: args.source ?? "api",
  }).catch((err) => console.error("form_activity_failed", err));

  return { ok: true, version, versionId, stripped: stripped as unknown[] };
}

/**
 * Store a working document. Callers must have validated it through `parseDoc` first.
 *
 * `activity` is optional and, when given, buys the form's history one extra point read:
 * the document as it stood before this call, which is the only moment it still exists
 * and the only way the timeline can say what the save actually did.
 */
export async function saveWorkingDoc(
  env: Bindings,
  formId: string,
  doc: FormDocT,
  activity?: { orgId: string; actor?: Actor; source?: ActivitySource },
): Promise<void> {
  const previous = activity
    ? parseStoredDoc(
        (await env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`).bind(formId).first<{ working_schema: string }>())
          ?.working_schema,
      )
    : null;

  // The row's title is the document's title — see the note on the builder's
  // autosave route. Every path that stores a document keeps that true, or a
  // rename made through one of them gives the form a second name.
  await env.DB.prepare(`UPDATE forms SET working_schema = ?, title = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(doc), doc.title, Date.now(), formId)
    .run();

  if (!activity) return;
  // Never at the expense of the save: the document is stored, and a missing history row
  // is a worse timeline rather than a lost edit.
  await recordDocChange(env, {
    formId,
    orgId: activity.orgId,
    before: previous,
    after: doc,
    actor: activity.actor,
    source: activity.source ?? "api",
  }).catch((err) => console.error("form_activity_failed", err));
}
