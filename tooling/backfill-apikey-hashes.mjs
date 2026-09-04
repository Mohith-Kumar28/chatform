#!/usr/bin/env node
/**
 * Re-encode pre-plugin API key hashes.
 *
 * The hand-rolled implementation stored SHA-256 as lowercase hex; the Better
 * Auth api-key plugin stores the same 32 bytes as unpadded base64url. Both are
 * encodings of an identical digest, so this converts them without ever seeing a
 * raw key — every customer key keeps working, with nothing for the customer to
 * do.
 *
 * It could not live in the migration: SQLite has hex() and unhex() and no
 * base64 at all.
 *
 * Usage:
 *   node tooling/backfill-apikey-hashes.mjs            # local D1
 *   node tooling/backfill-apikey-hashes.mjs --remote    # deployed D1
 *
 * Idempotent by construction: the SELECT matches only 64-character lowercase
 * hex, and a base64url digest is 43 characters with non-hex bytes in it, so a
 * second run finds nothing.
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
    { cwd: API_DIR, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const start = out.indexOf("[");
  return JSON.parse(out.slice(start));
}

function hexToBase64Url(hex) {
  return Buffer.from(hex, "hex")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const rows =
  d1(
    `SELECT id, key FROM api_keys WHERE length(key) = 64 AND key GLOB '[0-9a-f]*' AND key NOT GLOB '*[^0-9a-f]*'`,
  )[0]?.results ?? [];

if (rows.length === 0) {
  console.log(`nothing to convert (${target})`);
  process.exit(0);
}

const statements = rows
  .map((r) => `UPDATE api_keys SET key = '${hexToBase64Url(r.key)}' WHERE id = '${r.id}';`)
  .join("\n");

const file = join(tmpdir(), `apikey-backfill-${Date.now()}.sql`);
writeFileSync(file, `${statements}\n`);
try {
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "chatform", target, "--file", file], {
    cwd: API_DIR,
    stdio: "inherit",
  });
  console.log(`converted ${rows.length} key hash(es) (${target})`);
} finally {
  unlinkSync(file);
}
