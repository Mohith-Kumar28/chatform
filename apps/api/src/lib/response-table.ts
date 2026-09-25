import {
  displayAnswer,
  paymentCells,
  paymentColumnTitles,
  readFormDoc,
  RESPONDENT_COLUMNS,
  respondentCells,
  type Block,
} from "@repo/form-schema";
import { csvCell, csvRow } from "@repo/guard";
import type { Bindings } from "../env.js";
import { resolveRetiredBlocks } from "./retired-columns.js";
import { parseMeta, readRespondentContext } from "./respondent-context.js";

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
 * `csvCell` from `@repo/guard` is the de-fanger that used to live here as
 * `deFang`. Moved rather than copied: two of the three export paths did not
 * have it, so the same answer came out safe through this one and live through
 * the others. The `-40` carve-out went with it — mangling an ordinary negative
 * number to defend against `-1+cmd|…` costs more data than it saves.
 */
const deFang = csvCell;

export async function buildResponseTable(
  env: Bindings,
  formId: string,
  { includePartials, limit = 10_000 }: TableOptions,
): Promise<ResponseTable | null> {
  /**
   * Document, responses and answers in one round trip.
   *
   * None of the three waits on another — the answers are scoped by the same
   * window the response list uses, not by ids the list has to return first — so
   * awaiting them in turn was three hops to D1 for one table.
   */
  const [formRes, subsRes, answersRes] = (await env.DB.batch([
    env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`).bind(formId),
    /**
     * Newest first, by the same instant the results table calls "Submitted" —
     * `completed_at` when there is one, else `started_at`. Sorting on
     * `started_at` alone put a response begun on Monday and finished on
     * Wednesday under Monday, so the export and the screen disagreed about
     * which row was newest.
     *
     * `id` breaks the tie, which also keeps this window and the answers window
     * below agreeing on their last row: they ask for the same ordering with
     * different limits, and SQLite is free to return equal keys in any order.
     */
    env.DB
      .prepare(
        `SELECT id, status, started_at, completed_at, source,
                json_extract(meta, '$.context') AS context_json,
                json_extract(meta, '$.country') AS meta_country,
                json_extract(meta, '$.userAgent') AS meta_user_agent
           FROM submissions
          WHERE form_id = ?1 AND status != 'spam' AND (?2 = 1 OR status = 'completed')
          ORDER BY COALESCE(completed_at, started_at) DESC, id DESC LIMIT ?3`,
      )
      .bind(formId, includePartials ? 1 : 0, limit + 1),
    /**
     * One read for every answer in the window — not for every answer on the form.
     *
     * The subquery repeats the `LIMIT` above rather than joining on `form_id`,
     * because the two are very different reads on a form with a long history: the
     * feed serves the newest 5,000 responses, and a plain join would drag every
     * answer ever recorded into a Worker's memory to build them.
     *
     * Ordering is incidental — the rows are bucketed by id below.
     */
    env.DB
      .prepare(
        `SELECT a.submission_id, a.block_ref, a.block_type, a.value_json
           FROM submission_answers a
          WHERE a.submission_id IN (
                  SELECT id FROM submissions
                   WHERE form_id = ?1 AND status != 'spam' AND (?2 = 1 OR status = 'completed')
                   ORDER BY COALESCE(completed_at, started_at) DESC, id DESC LIMIT ?3
                )`,
      )
      .bind(formId, includePartials ? 1 : 0, limit),
  ])) as [
    D1Result<{ working_schema: string }>,
    D1Result<{
      id: string;
      status: string;
      started_at: number;
      completed_at: number | null;
      source: string | null;
      context_json: string | null;
      meta_country: string | null;
      meta_user_agent: string | null;
    }>,
    D1Result<{ submission_id: string; block_ref: string; block_type: string; value_json: string }>,
  ];

  const form = (formRes.results ?? [])[0];
  if (!form) return null;

  const doc = readFormDoc(JSON.parse(form.working_schema));
  const answerable = doc.blocks.filter((b) => !["welcome", "statement"].includes(b.type));

  const all = subsRes.results ?? [];
  const truncated = all.length > limit;
  const kept = truncated ? all.slice(0, limit) : all;

  const bySubmission = new Map<string, Map<string, string>>();
  /** Every ref these rows answered, and what it was answered as. */
  const seen = new Map<string, string>();
  for (const a of answersRes.results ?? []) {
    let bucket = bySubmission.get(a.submission_id);
    if (!bucket) bySubmission.set(a.submission_id, (bucket = new Map()));
    bucket.set(a.block_ref, a.value_json);
    seen.set(a.block_ref, a.block_type);
  }

  /**
   * Questions these responses answered that the form no longer asks.
   *
   * An export that silently drops them is the worst version of this bug: the
   * table on screen at least still has the data behind it, but a spreadsheet
   * someone downloads and archives is the record. See `retired-columns.ts`.
   */
  const retired = await resolveRetiredBlocks(env, formId, seen, new Set(doc.blocks.map((b) => b.ref)));
  const columns = [...answerable, ...retired];

  const retiredRefs = new Set(retired.map((b) => b.ref));

  // The question, not its ref. `b_short` means nothing to whoever opens this;
  // the ref follows in brackets so a column can still be matched to the doc.
  const header = [
    "submission_id",
    "status",
    "started_at",
    "completed_at",
    ...columns.flatMap((b) => {
      // "archived", not "removed": the question is gone from the form, but these
      // answers are very much still here, and `[removed]` next to a column full
      // of data reads as though the data was what went. It also matters that the
      // same question re-added later gets a new ref, so both columns can be
      // present at once and neither is a mistake.
      const title = `${b.title} (${b.ref})${retiredRefs.has(b.ref) ? " [archived]" : ""}`;
      return b.type === "payment" ? [title, ...paymentColumnTitles(title)] : [title];
    }),
    // Where and on what, after every answer: see `respondent-columns.ts`.
    ...RESPONDENT_COLUMNS.map((c) => c.title),
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
      ...columns.flatMap((b) => {
        const v = map.get(b.ref);
        let parsed: unknown;
        let cell: string;
        // An unanswered cell is empty, not "(skipped)" — a spreadsheet already
        // has a way to say nothing is there.
        if (!v) {
          cell = "";
        } else {
          try {
            parsed = JSON.parse(v);
            cell = deFang(displayAnswer(b as Block, parsed));
          } catch {
            cell = deFang(v);
          }
        }
        if (b.type !== "payment") return [cell];
        /*
         * A payment also gets its reconciliation cells, right beside the
         * sentence. Here rather than in each caller, so the CSV, the workbook
         * and the feed all carry them — see `paymentCells`. A retired payment
         * question gets them too: a payment from a question since deleted is
         * still money someone received.
         */
        const currency = (b as Extract<Block, { type: "payment" }>).currency;
        return [cell, ...paymentCells(parsed, currency).map(deFang)];
      }),
      // Page URLs, referrers and UTMs are the respondent's own strings.
      ...respondentCells(
        readRespondentContext(
          {
            context: s.context_json ? parseMeta(s.context_json) : undefined,
            country: s.meta_country,
            userAgent: s.meta_user_agent,
          },
          s.source,
        ),
        s.completed_at ?? s.started_at,
      ).map(deFang),
    ];
  });

  return { header, rows, count: rows.length, truncated };
}

/** RFC 4180: every field quoted, embedded quotes doubled, formulas de-fanged. */
export function toCsv({ header, rows }: ResponseTable): string {
  return [header, ...rows].map((row) => csvRow(row)).join("\n");
}

/**
 * The same table, cut in two by whether the response was finished.
 *
 * Both halves keep the whole table's header — including any retired column
 * only an unfinished response ever answered — so the two sheets line up column
 * for column and a formula written against one works on the other.
 *
 * The cut is made on the `status` column already in the table rather than by
 * asking D1 twice: the rows are in memory, the window and its column list were
 * settled by one query, and a second pass would be free to disagree with the
 * first about which responses are the newest.
 */
export function splitByCompletion(table: ResponseTable): {
  completed: ResponseTable;
  partial: ResponseTable;
} {
  const at = table.header.indexOf("status");
  const completed: string[][] = [];
  const partial: string[][] = [];
  for (const row of table.rows) (row[at] === "completed" ? completed : partial).push(row);

  const half = (rows: string[][]): ResponseTable => ({
    header: table.header,
    rows,
    count: rows.length,
    // Truncation is a property of the window, not of either half: the cap cut
    // rows off the end of both.
    truncated: table.truncated,
  });
  return { completed: half(completed), partial: half(partial) };
}

/**
 * What the file is called once it lands in someone's Downloads folder.
 *
 * `responses-frm_9f3a2b1c8d.xlsx` told whoever downloaded it nothing: not which
 * form, not when, and not which of the three exports they took that afternoon
 * it was. The form's own title and a timestamp answer all three, and they sort
 * sensibly in a folder because the date leads the stamp.
 *
 * `offsetMinutes` is the caller's `getTimezoneOffset()` — minutes to add to
 * local time to reach UTC, so IST arrives as -330. Without it the stamp is UTC,
 * which near midnight names the wrong day for most of the world.
 */
export function exportFilename(title: string, ext: string, offsetMinutes = 0): string {
  /**
   * Windows refuses `\/:*?"<>|` in a name and every platform refuses control
   * characters, so a form titled `Q3: sales / marketing` has to be rewritten
   * rather than escaped. Length is capped because some filesystems stop at 255
   * bytes, and a 200-character form title is not a better name than its first
   * eighty characters.
   */
  const clean =
    title
      // eslint-disable-next-line no-control-regex
      .replace(/[ -]/g, "")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80)
      .trim() || "Responses";

  // Shifted into the caller's day before it is read, then formatted off the ISO
  // string so the result is identical in every runtime and locale.
  const iso = new Date(Date.now() - offsetMinutes * 60_000).toISOString();
  const stamp = `${iso.slice(0, 10)} ${iso.slice(11, 13)}${iso.slice(14, 16)}`;

  return `${clean} ${stamp}.${ext}`;
}

/**
 * The header that carries it, in both spellings.
 *
 * A form named in Hindi, or with an emoji in it, cannot go in `filename=` —
 * that one is ASCII, and the bytes either get mangled or the header gets
 * rejected outright. RFC 5987's `filename*` carries the real name; the plain
 * `filename` stays as the fallback for anything that does not read it.
 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
