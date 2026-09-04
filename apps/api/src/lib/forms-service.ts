import { FormDoc, lintFormDoc, hasErrors, migrateFormDoc, type FormDoc as FormDocT } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { stripForPublish, checkDocLimits } from "./doc-entitlements.js";
import { limitReached, type Entitlements } from "@repo/entitlements";

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
  | { ok: false; status: 422; code: "invalid_doc"; message: string };

/** Validate and migrate an incoming document. Never store one that has not been through this. */
export function parseDoc(raw: unknown): UpdateDocResult {
  const parsed = FormDoc.safeParse(migrateFormDoc(raw));
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      code: "invalid_doc",
      message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
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
  args: { formId: string; userId: string | null; ent: Entitlements },
): Promise<PublishResult> {
  const row = await env.DB.prepare(
    `SELECT working_schema, theme_json, settings_json FROM forms WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(args.formId)
    .first<{ working_schema: string; theme_json: string | null; settings_json: string | null }>();
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

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, theme_json, settings_json, checksum, published_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      versionId,
      args.formId,
      version,
      JSON.stringify(publishable),
      row.theme_json,
      row.settings_json,
      crypto.randomUUID().slice(0, 16),
      Date.now(),
      args.userId,
      Date.now(),
    ),
    env.DB.prepare(`UPDATE forms SET status = 'published', active_version_id = ?, updated_at = ? WHERE id = ?`).bind(
      versionId,
      Date.now(),
      args.formId,
    ),
  ]);

  return { ok: true, version, versionId, stripped: stripped as unknown[] };
}

/** Store a working document. Callers must have validated it through `parseDoc` first. */
export async function saveWorkingDoc(env: Bindings, formId: string, doc: FormDocT): Promise<void> {
  await env.DB.prepare(`UPDATE forms SET working_schema = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(doc), Date.now(), formId)
    .run();
}
