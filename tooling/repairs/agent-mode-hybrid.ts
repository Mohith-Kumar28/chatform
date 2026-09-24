/**
 * One-off: move every Agentic form to Hybrid.
 *
 * Hybrid became the default when it stopped being Agentic under another name:
 * it now asks the author's questions word for word and spends a model turn
 * only on a reply that is not simply the answer (see
 * `apps/api/src/lib/answer-gate.ts`). The default only reaches documents that
 * carry no mode, and every stored document carries one, so without this every
 * existing form would have stayed on the expensive path. Authors can switch
 * back in the builder's Agent tab.
 *
 * The pattern is `"agent":{"mode":"ai"`: `mode` is the first key of the
 * agent settings as Zod serialises them, and the only other `mode` in a
 * document (bot protection's) holds different values, so nothing else can
 * match. Rows that mention `"mode":"ai"` without that prefix are counted and
 * reported rather than guessed at.
 *
 * Checksums: as in `redirect-delay-4s.ts`, recomputed only where the old
 * fingerprint can be reproduced from the old draft. Anything else keeps its
 * checksum, and with it the truth about whether it has unpublished changes.
 *
 * Usage:
 *   wrangler d1 execute chatform --remote --json --command \
 *     "SELECT f.id, f.organization_id, f.active_version_id, f.working_schema, v.checksum, \
 *        COALESCE(s.plan_id, 'free') AS plan_id FROM forms f LEFT JOIN form_versions v ON v.id = f.active_version_id \
 *        LEFT JOIN subscriptions s ON s.organization_id = f.organization_id AND s.status = 'active'" > dump.json
 *   tsx tooling/repairs/agent-mode-hybrid.ts dump.json > agent-mode-hybrid.sql
 *   wrangler d1 execute chatform --remote --file agent-mode-hybrid.sql
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

/**
 * The landing-page demo stays Agentic on purpose: it is the showcase, and its
 * wording lives in `tooling/demo-form/`. Its drafts and versions are left alone.
 */
const KEEP_AGENTIC = ["frm_demo00001"];
const keep = KEEP_AGENTIC.map((id) => `'${id}'`).join(", ");

/** Agent settings open with their mode, so this prefix can only be that field. */
const SUBS: [string, string][] = [['"agent":{"mode":"ai"', '"agent":{"mode":"hybrid"']];

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
let unmatched = 0;

for (const row of rows) {
  if (!row.working_schema || KEEP_AGENTIC.includes(row.id)) continue;
  const next = rewrite(row.working_schema);
  if (next.includes('"mode":"ai"')) unmatched++;
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

console.log(`-- ${drafts} drafts and every published version move from Agentic to Hybrid.`);
if (unmatched > 0) console.log(`-- WARNING: ${unmatched} drafts still say "mode":"ai" in a shape this did not expect. Look before running.`);
console.log(`-- ${rechecked} checksums follow their draft; ${leftAlone} left alone (draft already ahead of live).`);
console.log(`UPDATE form_versions SET schema_json = ${replaceExpr("schema_json")} WHERE form_id NOT IN (${keep});`);
console.log(`UPDATE forms SET working_schema = ${replaceExpr("working_schema")} WHERE id NOT IN (${keep});`);
for (const line of sql) console.log(line);
