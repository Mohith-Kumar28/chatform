/**
 * One-off: switch Captcha off on every stored form.
 *
 * `settings.captcha.enabled` now defaults to false, which only reaches
 * documents that do not already carry a value, and every document carries one:
 * Zod materialised the old `true` the first time each was parsed. So the 135
 * drafts and 252 published versions in production would have kept their
 * captcha on forever, none of them by anybody's choice.
 *
 * Every stored document spells it `"captcha":{"enabled":true,` (checked before
 * running: no other spelling exists), and the trailing comma pins the match to
 * that one key.
 *
 * The checksum follows the same rule as `redirect-delay-4s.ts`: it is the
 * fingerprint of the working schema at publish time, so rewriting a draft
 * without it puts a false "unpublished changes" dot on the form. It is only
 * rewritten where the OLD fingerprint can be reproduced from the OLD draft.
 * The plan is not in the dump, so every plan id is tried; a match on one is
 * proof of which plan the form was published on. No match means the draft is
 * already ahead of live, and that form keeps its dot.
 *
 * Usage:
 *   wrangler d1 execute chatform --remote --json --command \
 *     "SELECT f.id, f.active_version_id, f.working_schema, v.checksum FROM forms f LEFT JOIN form_versions v ON v.id = f.active_version_id" > dump.json
 *   tsx tooling/repairs/captcha-off.ts dump.json > captcha-off.sql
 *   wrangler d1 execute chatform --remote --file captcha-off.sql
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalJson } from "@repo/form-schema";
import { PLAN_IDS } from "@repo/entitlements";

interface Row {
  id: string;
  active_version_id: string | null;
  working_schema: string | null;
  checksum: string | null;
}

const FROM = '"captcha":{"enabled":true,';
const TO = '"captcha":{"enabled":false,';

const rewrite = (json: string) => json.split(FROM).join(TO);

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
    // Never published, or published before checksums meant anything.
    continue;
  }
  const planId = PLAN_IDS.find((id) => fingerprint(row.working_schema!, id) === row.checksum);
  if (!planId) {
    leftAlone++;
    continue;
  }
  sql.push(
    `UPDATE form_versions SET checksum = '${fingerprint(next, planId)}' WHERE id = '${row.active_version_id}';`,
  );
  rechecked++;
}

console.log(`-- ${drafts} drafts and every published version have Captcha switched off.`);
console.log(`-- ${rechecked} checksums follow their draft; ${leftAlone} left alone (draft already ahead of live).`);
console.log(`UPDATE form_versions SET schema_json = REPLACE(schema_json, '${FROM}', '${TO}');`);
console.log(`UPDATE forms SET working_schema = REPLACE(working_schema, '${FROM}', '${TO}');`);
for (const line of sql) console.log(line);
