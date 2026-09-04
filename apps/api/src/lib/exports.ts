import { readFormDoc, displayAnswer, type Block, type FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * Asynchronous response exports.
 *
 * `response:export` has been in the scope vocabulary since scopes existed, and
 * `Q_EXPORTS` has been declared with a consumer since the beginning — with
 * nothing on either end. This is both halves.
 *
 * Asynchronous rather than streamed because the synchronous dashboard route is
 * the wrong shape for an API caller: a Worker has a wall-clock budget and the
 * caller has a timeout, so "here is a URL, it will be ready shortly" is the
 * only honest answer above a few thousand rows. The row in `exports` is what
 * makes it resumable — a caller that loses the connection asks again by id
 * rather than re-running the query.
 */

/** The ceiling on one export. Above this the caller pages the read API instead. */
const MAX_ROWS = 100_000;
/** How many submissions' answers are fetched per round trip. */
const CHUNK = 500;
/** Exports hold respondent data, so the object is not kept indefinitely. */
const RETENTION_HOURS = 24;

export interface ExportFilters {
  /** Statuses to include. Empty or absent means completed only, matching the read API. */
  status?: string[];
  source?: string;
  mode?: "live" | "test" | "all";
  created_after?: number;
  created_before?: number;
}

export interface ExportMessage {
  exportId: string;
}

export interface ExportRow {
  id: string;
  organization_id: string;
  form_id: string;
  status: string;
  format: string;
  filters_json: string | null;
  r2_key: string | null;
  row_count: number | null;
  bytes: number | null;
  error: string | null;
  created_at: number;
  completed_at: number | null;
  expires_at: number | null;
}

export function newExportId(): string {
  return `exp_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/**
 * Create the row and hand the work to the queue.
 *
 * The row is written before the message is sent so that a caller who follows
 * the returned id immediately sees `queued` rather than a 404 — the opposite
 * order has a window where the export exists only inside the queue.
 */
export async function enqueueExport(
  env: Bindings,
  input: {
    orgId: string;
    formId: string;
    requestedBy: string | null;
    actorType: "user" | "api_key";
    format: "csv" | "json";
    filters: ExportFilters;
  },
): Promise<string> {
  const id = newExportId();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO exports (id, organization_id, form_id, requested_by, actor_type, format, filters_json, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
  )
    .bind(
      id,
      input.orgId,
      input.formId,
      input.requestedBy,
      input.actorType,
      input.format,
      JSON.stringify(input.filters),
      now,
      now + RETENTION_HOURS * 3600_000,
    )
    .run();

  await env.Q_EXPORTS.send({ exportId: id } satisfies ExportMessage);
  return id;
}

function whereFor(formId: string, orgId: string, filters: ExportFilters): { sql: string; binds: unknown[] } {
  const where: string[] = [`form_id = ?`, `organization_id = ?`, `status != 'spam'`];
  const binds: unknown[] = [formId, orgId];

  const statuses = filters.status?.filter(Boolean) ?? ["completed"];
  if (!statuses.includes("all")) {
    where.push(`status IN (${statuses.map(() => "?").join(",")})`);
    binds.push(...statuses);
  }
  if (filters.source) {
    where.push(`source = ?`);
    binds.push(filters.source);
  }
  // Test rows are real rows that must not land in an export of anyone's data
  // unless they were asked for by name.
  if (filters.mode !== "all") {
    where.push(`is_test = ?`);
    binds.push(filters.mode === "test" ? 1 : 0);
  }
  if (filters.created_after !== undefined) {
    where.push(`started_at > ?`);
    binds.push(filters.created_after);
  }
  if (filters.created_before !== undefined) {
    where.push(`started_at < ?`);
    binds.push(filters.created_before);
  }
  return { sql: where.join(" AND "), binds };
}

const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;

/**
 * One column per answerable block, one row per response.
 *
 * Answers are fetched a chunk of responses at a time rather than one query per
 * response. The dashboard's synchronous export does the latter, which makes a
 * 10,000-row file 10,001 round trips — comfortably past a Worker's budget, and
 * the reason the synchronous route has always been capped where it is.
 */
export async function buildCsv(
  env: Bindings,
  formId: string,
  orgId: string,
  doc: FormDoc,
  filters: ExportFilters,
): Promise<{ body: string; rowCount: number }> {
  const answerable = doc.blocks.filter((b) => !["welcome", "statement"].includes(b.type));
  const { sql, binds } = whereFor(formId, orgId, filters);

  const subs = await env.DB.prepare(
    `SELECT id, status, source, started_at, completed_at FROM submissions
      WHERE ${sql} ORDER BY started_at DESC LIMIT ?`,
  )
    .bind(...binds, MAX_ROWS)
    .all<{ id: string; status: string; source: string | null; started_at: number; completed_at: number | null }>();
  const rows = subs.results ?? [];

  // The question, not its ref: `b_short` means nothing to whoever opens the
  // file. The ref follows in brackets so a column can still be matched back.
  const header = [
    "response_id",
    "status",
    "source",
    "started_at",
    "completed_at",
    ...answerable.map((b) => `${b.title} (${b.ref})`),
  ];
  const out: string[] = [header.map(esc).join(",")];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const ids = slice.map((r) => r.id);
    const answers = await env.DB.prepare(
      `SELECT submission_id, block_ref, value_json FROM submission_answers
        WHERE submission_id IN (${ids.map(() => "?").join(",")})`,
    )
      .bind(...ids)
      .all<{ submission_id: string; block_ref: string; value_json: string }>();

    const byResponse = new Map<string, Map<string, string>>(ids.map((id) => [id, new Map()]));
    for (const a of answers.results ?? []) byResponse.get(a.submission_id)?.set(a.block_ref, a.value_json);

    for (const s of slice) {
      const map = byResponse.get(s.id)!;
      out.push(
        [
          s.id,
          s.status,
          s.source ?? "",
          new Date(s.started_at).toISOString(),
          s.completed_at ? new Date(s.completed_at).toISOString() : "",
          // Labels, not ids. A file full of `opt_founder001` is an export of
          // our primary keys, not of anyone's data.
          ...answerable.map((b) => {
            const raw = map.get(b.ref);
            // An unanswered cell is empty, not "(skipped)" — a spreadsheet
            // already has a way to say nothing is there.
            if (!raw) return "";
            try {
              return displayAnswer(b as Block, JSON.parse(raw));
            } catch {
              return raw;
            }
          }),
        ]
          .map(esc)
          .join(","),
      );
    }
  }

  return { body: out.join("\n"), rowCount: rows.length };
}

/** The same rows as `buildCsv`, as JSON Lines — one response object per line. */
export async function buildJsonl(
  env: Bindings,
  formId: string,
  orgId: string,
  filters: ExportFilters,
): Promise<{ body: string; rowCount: number }> {
  const { sql, binds } = whereFor(formId, orgId, filters);
  const subs = await env.DB.prepare(
    `SELECT id, status, source, started_at, completed_at, meta FROM submissions
      WHERE ${sql} ORDER BY started_at DESC LIMIT ?`,
  )
    .bind(...binds, MAX_ROWS)
    .all<{
      id: string;
      status: string;
      source: string | null;
      started_at: number;
      completed_at: number | null;
      meta: string | null;
    }>();
  const rows = subs.results ?? [];
  const lines: string[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const ids = slice.map((r) => r.id);
    const answers = await env.DB.prepare(
      `SELECT submission_id, block_ref, value_json FROM submission_answers
        WHERE submission_id IN (${ids.map(() => "?").join(",")})`,
    )
      .bind(...ids)
      .all<{ submission_id: string; block_ref: string; value_json: string }>();

    const byResponse = new Map<string, Record<string, unknown>>(ids.map((id) => [id, {}]));
    for (const a of answers.results ?? []) {
      try {
        byResponse.get(a.submission_id)![a.block_ref] = JSON.parse(a.value_json);
      } catch {
        // one unparseable value must not lose the whole export
      }
    }

    for (const s of slice) {
      let meta: Record<string, unknown> = {};
      try {
        meta = s.meta ? (JSON.parse(s.meta) as Record<string, unknown>) : {};
      } catch {
        meta = {};
      }
      lines.push(
        JSON.stringify({
          id: s.id,
          object: "response",
          status: s.status,
          source: s.source,
          started_at: s.started_at,
          completed_at: s.completed_at,
          ending_ref: (meta.endingRef as string | null) ?? null,
          answers: byResponse.get(s.id) ?? {},
        }),
      );
    }
  }

  return { body: lines.join("\n"), rowCount: rows.length };
}

/**
 * The queue consumer's half.
 *
 * Claims the row with `WHERE status = 'queued'` so a redelivered message — the
 * queue is at-least-once — cannot run the same export twice and bill the
 * customer for both.
 */
export async function runExport(env: Bindings, exportId: string): Promise<void> {
  const claim = await env.DB.prepare(
    `UPDATE exports SET status = 'running' WHERE id = ? AND status = 'queued'`,
  )
    .bind(exportId)
    .run();
  if (!claim.meta.changes) return;

  const row = await env.DB.prepare(`SELECT * FROM exports WHERE id = ?`).bind(exportId).first<ExportRow>();
  if (!row) return;

  try {
    const form = await env.DB.prepare(
      `SELECT fv.schema_json FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
        WHERE f.id = ? AND f.organization_id = ?`,
    )
      .bind(row.form_id, row.organization_id)
      .first<{ schema_json: string }>();
    if (!form) throw new Error("form_not_found");

    // The published document, not `working_schema`. Answers were collected
    // against published versions, so enumerating columns from the draft names
    // questions nobody was ever asked and omits ones they were.
    const doc = readFormDoc(JSON.parse(form.schema_json));
    const filters = (row.filters_json ? JSON.parse(row.filters_json) : {}) as ExportFilters;

    const built =
      row.format === "json"
        ? await buildJsonl(env, row.form_id, row.organization_id, filters)
        : await buildCsv(env, row.form_id, row.organization_id, doc, filters);

    const ext = row.format === "json" ? "jsonl" : "csv";
    const r2Key = `exports/${row.organization_id}/${row.form_id}/${row.id}.${ext}`;
    const bytes = new TextEncoder().encode(built.body);
    await env.R2.put(r2Key, bytes, {
      httpMetadata: {
        contentType: row.format === "json" ? "application/x-ndjson" : "text/csv; charset=utf-8",
      },
    });

    await env.DB.prepare(
      `UPDATE exports SET status = 'ready', r2_key = ?, row_count = ?, bytes = ?, completed_at = ? WHERE id = ?`,
    )
      .bind(r2Key, built.rowCount, bytes.byteLength, Date.now(), row.id)
      .run();
  } catch (err) {
    // The message is the caller's, so it names the failure without leaking a
    // stack: `GET /v1/exports/:id` is where they will read it.
    const message = err instanceof Error ? err.message : "export_failed";
    await env.DB.prepare(`UPDATE exports SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`)
      .bind(message.slice(0, 300), Date.now(), row.id)
      .run();
    throw err;
  }
}

/**
 * Drop expired export objects and their rows.
 *
 * An export is a full copy of respondent data sitting in a bucket; leaving it
 * there forever turns a 10-minute signed URL into a permanent one for anybody
 * who kept the link and waited for a signing-secret rotation to not happen.
 */
export async function pruneExpiredExports(env: Bindings): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT id, r2_key FROM exports WHERE expires_at IS NOT NULL AND expires_at < ? LIMIT 200`,
  )
    .bind(Date.now())
    .all<{ id: string; r2_key: string | null }>();
  const list = rows.results ?? [];
  for (const row of list) {
    if (row.r2_key) await env.R2.delete(row.r2_key).catch(() => {});
    await env.DB.prepare(`DELETE FROM exports WHERE id = ?`).bind(row.id).run();
  }
  return list.length;
}
