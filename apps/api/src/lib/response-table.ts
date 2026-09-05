import { displayAnswer, readFormDoc, type Block } from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * Responses, flattened to a table.
 *
 * Three surfaces need exactly this shape — the CSV export, the XLSX export and
 * the spreadsheet feed — and before this they would have been three
 * transcriptions of the same twenty lines, free to disagree about which columns
 * exist and how an unanswered cell is written.
 *
 * It also stops doing what the CSV export did: one `submission_answers` query
 * per submission, so exporting ten thousand responses cost ten thousand and one
 * round trips to D1. Answers arrive in a single joined read now.
 */

export interface ResponseTable {
  /** Human column titles, in order. */
  header: string[];
  rows: string[][];
  /** How many rows were built, before any cap was applied. */
  count: number;
  /** True when the cap cut the result short. */
  truncated: boolean;
}

export interface TableOptions {
  includePartials: boolean;
  /** Hard ceiling on rows. The exports allow more than the always-on feed does. */
  limit?: number;
}

/**
 * Cells that a spreadsheet would execute rather than display.
 *
 * These rows are typed by strangers, and this data now goes somewhere that
 * treats a leading `=` as a program. Prefixing with an apostrophe is the
 * conventional neutralisation: Excel and Sheets both render the rest verbatim
 * and drop the quote.
 *
 * A leading `-` is left alone when the cell is an ordinary negative number,
 * because mangling `-40` to protect against `-1+cmd|…` would corrupt far more
 * data than it saves.
 */
function deFang(value: string): string {
  if (!value) return value;
  const head = value[0]!;
  if (head === "=" || head === "+" || head === "@" || head === "\t" || head === "\r") {
    return `'${value}`;
  }
  if (head === "-" && !Number.isFinite(Number(value))) return `'${value}`;
  return value;
}

export async function buildResponseTable(
  env: Bindings,
  formId: string,
  { includePartials, limit = 10_000 }: TableOptions,
): Promise<ResponseTable | null> {
  const form = await env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`)
    .bind(formId)
    .first<{ working_schema: string }>();
  if (!form) return null;

  const doc = readFormDoc(JSON.parse(form.working_schema));
  const answerable = doc.blocks.filter((b) => !["welcome", "statement"].includes(b.type));

  const subs = await env.DB.prepare(
    `SELECT id, status, started_at, completed_at FROM submissions
      WHERE form_id = ?1 AND status != 'spam' AND (?2 = 1 OR status = 'completed')
      ORDER BY started_at DESC LIMIT ?3`,
  )
    .bind(formId, includePartials ? 1 : 0, limit + 1)
    .all<{ id: string; status: string; started_at: number; completed_at: number | null }>();

  const all = subs.results ?? [];
  const truncated = all.length > limit;
  const kept = truncated ? all.slice(0, limit) : all;

  /**
   * One read for every answer on the form, joined rather than looked up per
   * submission. The `submission_id` ordering is incidental — the rows are
   * bucketed by id below, so the query is free to return them in any order.
   */
  const answers = await env.DB.prepare(
    `SELECT a.submission_id, a.block_ref, a.value_json
       FROM submission_answers a
       JOIN submissions s ON s.id = a.submission_id
      WHERE s.form_id = ?1 AND s.status != 'spam' AND (?2 = 1 OR s.status = 'completed')`,
  )
    .bind(formId, includePartials ? 1 : 0)
    .all<{ submission_id: string; block_ref: string; value_json: string }>();

  const bySubmission = new Map<string, Map<string, string>>();
  for (const a of answers.results ?? []) {
    let bucket = bySubmission.get(a.submission_id);
    if (!bucket) bySubmission.set(a.submission_id, (bucket = new Map()));
    bucket.set(a.block_ref, a.value_json);
  }

  // The question, not its ref. `b_short` means nothing to whoever opens this;
  // the ref follows in brackets so a column can still be matched to the doc.
  const header = [
    "submission_id",
    "status",
    "started_at",
    "completed_at",
    ...answerable.map((b) => `${b.title} (${b.ref})`),
  ];

  const rows = kept.map((s) => {
    const map = bySubmission.get(s.id) ?? new Map<string, string>();
    return [
      s.id,
      s.status,
      new Date(s.started_at).toISOString(),
      s.completed_at ? new Date(s.completed_at).toISOString() : "",
      // Labels, not ids. A sheet full of `opt_founder001` and
      // `{"row_ui000001":"col_bad00001"}` is not an export of anyone's data —
      // it is an export of our primary keys, and whoever opens it has no way
      // to decode them.
      ...answerable.map((b) => {
        const v = map.get(b.ref);
        // An unanswered cell is empty, not "(skipped)" — a spreadsheet already
        // has a way to say nothing is there.
        if (!v) return "";
        try {
          return deFang(displayAnswer(b as Block, JSON.parse(v)));
        } catch {
          return deFang(v);
        }
      }),
    ];
  });

  return { header, rows, count: rows.length, truncated };
}

/** RFC 4180: every field quoted, embedded quotes doubled. */
export function toCsv({ header, rows }: ResponseTable): string {
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  return [header, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}
