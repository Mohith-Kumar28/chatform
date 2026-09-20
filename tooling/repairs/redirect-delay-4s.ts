/**
 * One-off: move every stored redirect delay from 5 seconds to 4.
 *
 * The default moved to `DEFAULT_REDIRECT_DELAY_SEC`, which only reaches
 * documents that do not already carry a number, and every document carries
 * one: Zod materialises a default the first time a doc is parsed, and these
 * were all parsed long ago. So the 103 published versions and 26 drafts in
 * production would have sat at 5 forever.
 *
 * Only an exact 5 moves. An author who typed 12 keeps 12, and the four
 * patterns are delimiter-guarded so that `"delaySec":55` cannot be caught and
 * turned into `"delaySec":45` by a careless prefix match.
 *
 * The interesting part is the checksum. `form_versions.checksum` is the
 * fingerprint of the WORKING schema as it stood when that version was
 * published, and the builder shows "unpublished changes" when the current
 * draft no longer fingerprints to it. Rewriting the draft text therefore
 * breaks that comparison and puts an amber dot on every form in the product,
 * all of them wrong.
 *
 * So the checksum is recomputed — but only where this script can prove it
 * understands the row: it re-derives the OLD fingerprint from the OLD draft
 * and only writes a new one if that matches what is stored. A form whose plan
 * resolved differently (an expired subscription in its grace window, an
 * override) fails that check and is left exactly as it was, which is the
 * outcome that cannot be wrong. A form with genuinely unpublished changes
 * fails it too, and keeps its dot.
 *
 * Usage:
 *   wrangler d1 execute chatform --remote --json --command "<the dump query>" > dump.json
 *   tsx tooling/repairs/redirect-delay-4s.ts dump.json > redirect-delay-4s.sql
 *   wrangler d1 execute chatform --remote --file redirect-delay-4s.sql
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalJson } from "@repo/form-schema";

interface Row {
  id: string;
  organization_id: string;
  active_version_id: string | null;
  working_schema: string | null;
  checksum: string | null;
  plan_id: string;
}

/** The four substitutions, each pinned to the delimiter that must follow the value. */
const SUBS: [string, string][] = [
  ['"delaySec":5,', '"delaySec":4,'],
  ['"delaySec":5}', '"delaySec":4}'],
  ['"redirectDelaySec":5,', '"redirectDelaySec":4,'],
  ['"redirectDelaySec":5}', '"redirectDelaySec":4}'],
];

const rewrite = (json: string) => SUBS.reduce((acc, [from, to]) => acc.split(from).join(to), json);

/** `publishFingerprint`, reimplemented here rather than imported: it lives in the API worker. */
const fingerprint = (workingSchema: string, planId: string) =>
  createHash("sha256").update(`${canonicalJson(workingSchema)}\n${planId}`).digest("hex");

const dump = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as { results: Row[] }[];
const rows = dump.flatMap((r) => r.results ?? []);

const sql: string[] = [];
let drafts = 0;
let rechecked = 0;
let leftAlone = 0;

for (const row of rows) {
  if (!row.working_schema) continue;
  const next = rewrite(row.working_schema);
  if (next === row.working_schema) continue;
  drafts++;

  if (!row.active_version_id || !row.checksum || !/^[0-9a-f]{64}$/.test(row.checksum)) {
    // Never published, or published before checksums meant anything. Nothing
    // to keep in step, and `hasUnpublishedChanges` already stays quiet on both.
    continue;
  }
  if (fingerprint(row.working_schema, row.plan_id) !== row.checksum) {
    leftAlone++;
    continue;
  }
  sql.push(
    `UPDATE form_versions SET checksum = '${fingerprint(next, row.plan_id)}' WHERE id = '${row.active_version_id}';`,
  );
  rechecked++;
}

const replaceExpr = (column: string) =>
  SUBS.reduce((expr, [from, to]) => `REPLACE(${expr}, '${from}', '${to}')`, column);

console.log(`-- ${drafts} drafts and every published version move from 5s to 4s.`);
console.log(`-- ${rechecked} checksums follow their draft; ${leftAlone} left alone (draft already ahead of live).`);
console.log(`UPDATE form_versions SET schema_json = ${replaceExpr("schema_json")};`);
console.log(`UPDATE forms SET working_schema = ${replaceExpr("working_schema")};`);
for (const line of sql) console.log(line);
