#!/usr/bin/env node
/**
 * Move inline agent knowledge into `knowledge_sources`.
 *
 * Knowledge used to be `settings.agent.knowledge` on the form document — an
 * array of title/body entries inlined into the system prompt. It is now rows,
 * chunked and embedded and retrieved per question. This copies what every
 * existing form had into the new tables so nobody loses a knowledge base they
 * typed.
 *
 * Rows land as `status = 'pending'`. Nothing here embeds anything: wrangler has
 * no Workers AI binding, and the ingest sweep (`sweepStuckKnowledgeIngest`,
 * every five minutes) picks up anything pending for more than two minutes. So
 * the sequence at deploy time is: migrate, run this, wait one cron tick.
 *
 * Reads the stored JSON directly rather than through `FormDoc`, because the
 * schema no longer has the field — by the time this runs, parsing a document
 * would drop the very thing it is here to rescue.
 *
 * Usage:
 *   node tooling/backfill-knowledge-sources.mjs            # local D1
 *   node tooling/backfill-knowledge-sources.mjs --remote    # deployed D1
 *
 * Idempotent: source ids are derived from the form id and the entry's position,
 * so a second run rewrites the same rows rather than duplicating them. Re-runs
 * do reset `status` to `pending`, which re-indexes — harmless, and the right
 * thing if the first pass failed.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const remote = process.argv.includes("--remote");
const target = remote ? "--remote" : "--local";
const API_DIR = new URL("../apps/api", import.meta.url).pathname;

function d1(sql) {
  const out = execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "chatform", target, "--json", "--command", sql],
    { cwd: API_DIR, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  const start = out.indexOf("[");
  return JSON.parse(out.slice(start));
}

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;

/**
 * Both columns are read because they disagree, legitimately.
 *
 * `settings_json` is the settings block alone and `working_schema` is the whole
 * document; which one carries the agent block depends on how old the form is
 * and which write path last touched it. Taking whichever yields entries is the
 * only way to catch every form.
 */
const rows =
  d1(
    `SELECT id, organization_id, settings_json, working_schema
       FROM forms
      WHERE deleted_at IS NULL
        AND (settings_json LIKE '%"knowledge"%' OR working_schema LIKE '%"knowledge"%')`,
  )[0]?.results ?? [];

function entriesFor(row) {
  for (const raw of [row.settings_json, row.working_schema]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      // `settings_json` is the settings object; `working_schema` wraps it.
      const agent = parsed?.agent ?? parsed?.settings?.agent;
      const entries = agent?.knowledge;
      if (Array.isArray(entries) && entries.length > 0) return entries;
    } catch {
      // A document that will not parse is not one this script can rescue.
    }
  }
  return [];
}

const statements = [];
let sources = 0;

for (const row of rows) {
  for (const [i, entry] of entriesFor(row).entries()) {
    const title = String(entry?.title ?? "").trim();
    const body = String(entry?.body ?? "").trim();
    // An empty entry was invisible in the old UI and would become a source row
    // that fails to index. Drop it rather than carry the noise across.
    if (!title && !body) continue;

    const id = `kbs_mig${row.id.replace(/[^a-zA-Z0-9]/g, "").slice(-10)}${String(i).padStart(2, "0")}`;
    statements.push(
      `INSERT INTO knowledge_sources (id, organization_id, form_id, kind, title, raw_text, status, bytes, chunk_count, created_at)` +
        ` VALUES (${q(id)}, ${q(row.organization_id)}, ${q(row.id)}, 'text', ${q(title || "Untitled")}, ${q(body)}, 'pending', 0, 0, ${Date.now()})` +
        ` ON CONFLICT (id) DO UPDATE SET title = excluded.title, raw_text = excluded.raw_text, status = 'pending', error = NULL;`,
    );
    sources += 1;
  }
}

if (statements.length === 0) {
  console.log(`nothing to migrate (${target})`);
  process.exit(0);
}

const file = join(tmpdir(), `knowledge-backfill-${Date.now()}.sql`);
writeFileSync(file, `${statements.join("\n")}\n`);
try {
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "chatform", target, "--file", file], {
    cwd: API_DIR,
    stdio: "inherit",
  });
  console.log(
    `migrated ${sources} knowledge entr${sources === 1 ? "y" : "ies"} across ${rows.length} form(s) (${target}).\n` +
      `They are pending; the ingest sweep will index them within ~5 minutes.`,
  );
} finally {
  unlinkSync(file);
}
