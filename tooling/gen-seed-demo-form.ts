/**
 * Generates `tooling/seed-demo-form.sql` from `tooling/demo-form/`.
 *
 * Same idea as `gen-seed-templates.ts` — author in TypeScript, generate the
 * SQL, commit it, verify by regenerating and diffing — with one deliberate
 * difference that is worth stating up front.
 *
 * A `form_templates` row is a catalogue entry: mutable, so that generator
 * upserts it with `ON CONFLICT (id) DO UPDATE`. A `form_versions` row is a
 * published artifact. Respondents may be halfway through answering it, and the
 * whole point of versioning is that the document they started is the document
 * they finish. So this file is **append-only in version blocks**: each revision
 * inserts a new row and prior rows are re-emitted verbatim, never rewritten.
 *
 * That is enforced rather than documented. The generator reads the SQL it wrote
 * last time, compares the checksum of each version block against the document
 * as it stands now, and refuses to emit anything if the document has changed
 * while `DEMO_REVISION` has not.
 *
 * Run: `pnpm gen:demo`. Verified by `pnpm demo:verify`, which is in `pnpm
 * check`. Apply with `pnpm seed:demo` (local) or `pnpm seed:demo:remote`.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalJson, sha256Hex } from "@repo/form-schema";
import { DEMO_FORM, DEMO_SLUG, DEMO_REVISION, DEMO_OWNER_EMAIL, DEMO_KNOWLEDGE } from "./demo-form/index.js";

const FORM_ID = "frm_demo00001";

/**
 * Fixed, and spaced a day apart per revision.
 *
 * `Date.now()` would fail `demo:verify` on every run, since it regenerates and
 * diffs. A day per revision keeps `published_at` ordered, which is what the
 * version list in the builder sorts by.
 */
const EPOCH = 1_770_000_000_000;
const stamp = (revision: number) => EPOCH + revision * 86_400_000;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const versionId = (revision: number) => `ver_demo${String(revision).padStart(4, "0")}`;

/**
 * The same fingerprint the builder computes, so the form does not read as
 * having unpublished changes the moment it is seeded.
 *
 * `publishFingerprint` in `apps/api/src/lib/publish-state.ts` hashes the
 * canonicalised working schema with the plan id, and `hasUnpublishedChanges`
 * compares that against `form_versions.checksum`. A placeholder here would be
 * *quiet* rather than wrong — anything that is not 64 hex characters is
 * ignored — but the column would be lying, and the builder would offer a
 * republish that somebody would eventually click.
 *
 * `business` because that is the plan this form has to be on for `requireAuth`
 * to survive `clampForRuntime`.
 */
async function checksumFor(schemaJson: string): Promise<string> {
  return sha256Hex(`${canonicalJson(schemaJson)}\nbusiness`);
}

/** `-- version: 3 checksum: <64 hex>` — how a past revision is recognised. */
const TRAILER = /^-- version: (\d+) checksum: ([0-9a-f]{64})$/gm;

interface PastVersion {
  revision: number;
  checksum: string;
}

function readPastVersions(sql: string): PastVersion[] {
  const found: PastVersion[] = [];
  for (const m of sql.matchAll(TRAILER)) {
    found.push({ revision: Number(m[1]), checksum: m[2]! });
  }
  return found.sort((a, b) => a.revision - b.revision);
}

const VERSION_MARKER = "-- ─── version ";
const FOOTER_MARKER = "-- ─── point the form at the newest version ";

/**
 * Everything between one version's marker and the next, kept byte for byte.
 *
 * Re-emitting a past revision by regenerating it would mean the output depended
 * on today's source for a document that shipped months ago — exactly the
 * rewriting this file exists to prevent. So prior blocks are copied out of the
 * file that already exists.
 *
 * The footer is cut off first. It sits after the last version block and is
 * rewritten on every run, so slicing to end-of-file would carry a copy of it
 * into the block list and emit it twice — which is what happened the first time
 * this ran twice.
 */
function sliceVersionBlocks(sql: string): string[] {
  const body = sql.split(FOOTER_MARKER)[0] ?? sql;
  return body
    .split(VERSION_MARKER)
    .slice(1)
    .map((p) => VERSION_MARKER + p.replace(/\n+$/, "") + "\n");
}

function versionBlock(revision: number, schemaJson: string, checksum: string): string {
  const id = versionId(revision);
  const at = stamp(revision);
  return [
    `${VERSION_MARKER}${revision} ──────────────────────────────────────────────────`,
    `-- version: ${revision} checksum: ${checksum}`,
    `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, note, published_at, created_at)`,
    `SELECT ${q(id)}, f.id, ${revision}, ${q(schemaJson)}, ${q(checksum)}, 'Seeded from tooling/demo-form', ${at}, ${at}`,
    `  FROM forms f WHERE f.slug = ${q(DEMO_SLUG)}`,
    `ON CONFLICT (form_id, version) DO NOTHING;`,
    "",
  ].join("\n");
}

async function sqlFor(previous: string | null): Promise<string> {
  const doc = DEMO_FORM.doc;
  const schemaJson = JSON.stringify(doc);
  const checksum = await checksumFor(schemaJson);

  const past = previous ? readPastVersions(previous) : [];
  const latest = past.at(-1);

  if (latest) {
    if (latest.checksum === checksum && DEMO_REVISION !== latest.revision) {
      throw new Error(
        `the demo form document is unchanged but DEMO_REVISION moved from ${latest.revision} to ${DEMO_REVISION}. ` +
          `Set it back to ${latest.revision}: a revision with no change publishes a duplicate document.`,
      );
    }
    if (latest.checksum !== checksum && DEMO_REVISION === latest.revision) {
      throw new Error(
        `the demo form document changed but DEMO_REVISION is still ${DEMO_REVISION}. ` +
          `Bump it to ${latest.revision + 1} in tooling/demo-form/index.ts — a published version is immutable, ` +
          `so a change ships as a new one rather than by rewriting the old.`,
      );
    }
    if (latest.checksum !== checksum && DEMO_REVISION !== latest.revision + 1) {
      throw new Error(
        `DEMO_REVISION is ${DEMO_REVISION} but the last published revision is ${latest.revision}. ` +
          `Revisions are consecutive: set it to ${latest.revision + 1}.`,
      );
    }
  } else if (DEMO_REVISION !== 1) {
    throw new Error(`nothing has been published yet, so DEMO_REVISION must be 1 (it is ${DEMO_REVISION}).`);
  }

  const header = [
    "-- GENERATED by tooling/gen-seed-demo-form.ts from tooling/demo-form/ — do not edit by hand.",
    "-- Regenerate with: pnpm gen:demo",
    "-- Apply with:      pnpm seed:demo          (local)",
    "--                  pnpm seed:demo:remote   (production)",
    "--",
    "-- The form behind \"Try a demo form\" on the landing page. Unlike",
    "-- seed-templates.sql, which upserts a mutable catalogue row, this file is",
    "-- APPEND-ONLY: each revision inserts a new form_versions row and prior rows are",
    "-- never rewritten, because a published version is what respondents already",
    "-- part-way through are answering.",
    "--",
    "-- DO NOT EDIT THIS FORM IN THE BUILDER. tooling/demo-form/index.ts is the source",
    "-- of truth, and the next seed overwrites working_schema without warning.",
    "--",
    "-- The organization and workspace are resolved at apply time from the owner's",
    "-- email, because the ids differ between a local database and production and a",
    "-- committed file cannot know either. If that address owns no organization here,",
    "-- the INSERT matches no rows and writes nothing — which is why the file ends in a",
    "-- SELECT. An empty result means nothing was seeded.",
    "",
    "-- ─── the form row, created once ─────────────────────────────────────────",
    "-- ON CONFLICT DO NOTHING, with every mutable column updated separately below,",
    "-- so that fingerprint_salt is minted exactly once. It keys the respondent",
    "-- device hash, and a re-seed that rotated it would make every past respondent",
    "-- look like a new one.",
    `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status,`,
    `                   working_schema, fingerprint_salt, created_at, updated_at)`,
    `SELECT ${q(FORM_ID)}, m.organization_id, w.id, u.id, ${q(doc.title)}, ${q(DEMO_SLUG)}, 'published',`,
    `       ${q(schemaJson)}, lower(hex(randomblob(16))), ${EPOCH}, ${EPOCH}`,
    `  FROM members m`,
    `  JOIN users u ON u.id = m.user_id`,
    `  JOIN workspaces w ON w.organization_id = m.organization_id`,
    ` WHERE u.email = ${q(DEMO_OWNER_EMAIL)} AND m.role LIKE '%owner%'`,
    ` ORDER BY w.created_at ASC`,
    ` LIMIT 1`,
    `ON CONFLICT (slug) DO NOTHING;`,
    "",
  ].join("\n");

  const blocks = previous ? sliceVersionBlocks(previous) : [];
  const current = versionBlock(DEMO_REVISION, schemaJson, checksum);
  const allBlocks = latest && latest.checksum === checksum ? blocks : [...blocks, current];

  /*
   * The demo's knowledge, as rows rather than as part of the document.
   *
   * Emitted BEFORE the version blocks, and that position is load-bearing.
   * `sliceVersionBlocks` re-reads this file on every generation by splitting
   * everything above `FOOTER_MARKER` on `VERSION_MARKER` — so anything placed
   * between the last version block and the footer is read back as part of that
   * block and re-emitted with it, growing the file by one copy per run. Ask how
   * I know. Up here it sits in the header, which is rewritten wholesale and
   * never parsed, and the form row it references is created immediately above.
   *
   * Seeded `pending` and left there deliberately: embedding requires Workers
   * AI, and this file is applied by `wrangler d1 execute`, which has no
   * bindings and no network. `sweepStuckKnowledgeIngest` picks up anything
   * pending for more than two minutes, so the demo indexes itself within one
   * cron tick of being seeded — locally and in production alike.
   *
   * Ids are derived from the ordinal so a re-seed updates the same rows rather
   * than accumulating duplicates, and the ON CONFLICT resets status to
   * `pending` so edited copy is genuinely re-indexed.
   */
  const knowledgeRows = [
    "",
    "-- ─── the demo agent's knowledge ────────────────────────────────────────",
    "-- Seeded pending: seed SQL cannot embed anything. The ingest sweep indexes",
    "-- these within a few minutes. Source: tooling/demo-form/knowledge.ts.",
    ...DEMO_KNOWLEDGE.flatMap((entry, i) => {
      const id = `kbs_demo${String(i + 1).padStart(4, "0")}`;
      return [
        `INSERT INTO knowledge_sources (id, organization_id, form_id, kind, title, raw_text, status, bytes, chunk_count, created_at)`,
        `SELECT ${q(id)}, f.organization_id, ${q(FORM_ID)}, 'text', ${q(entry.title)}, ${q(entry.body)}, 'pending', 0, 0, ${EPOCH}`,
        `  FROM forms f WHERE f.id = ${q(FORM_ID)}`,
        `ON CONFLICT (id) DO UPDATE SET title = excluded.title,`,
        `                               raw_text = excluded.raw_text,`,
        `                               status = 'pending',`,
        `                               error = NULL;`,
      ];
    }),
    "",
  ].join("\n");

  const footer = [
    `${FOOTER_MARKER}──────────────────────────────`,
    "-- Rewritten on every generation, unlike the version rows above. The working",
    "-- schema and the active version are the two things a re-seed is for.",
    `UPDATE forms SET working_schema = ${q(schemaJson)},`,
    `                 title = ${q(doc.title)},`,
    `                 status = 'published',`,
    `                 active_version_id = ${q(versionId(DEMO_REVISION))},`,
    `                 updated_at = ${stamp(DEMO_REVISION)}`,
    ` WHERE slug = ${q(DEMO_SLUG)};`,
    "",
    "-- Read this. One row means the form is seeded and live; no rows means the",
    "-- owner's email matched no organization and nothing above did anything.",
    `SELECT slug, status, active_version_id, organization_id FROM forms WHERE slug = ${q(DEMO_SLUG)};`,
    "",
  ].join("\n");

  return [header, knowledgeRows, ...allBlocks, footer].join("\n");
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "seed-demo-form.sql");
const previous = existsSync(out) ? readFileSync(out, "utf8") : null;
writeFileSync(out, await sqlFor(previous));
console.log(
  `wrote ${out} — ${DEMO_SLUG} revision ${DEMO_REVISION}, ` +
    `${DEMO_FORM.blockCount} questions, ~${DEMO_FORM.estMinutes} min`,
);
