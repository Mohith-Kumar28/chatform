/**
 * Checks category files without writing anything.
 *
 * `pnpm gen:templates` writes shared outputs, so several authors running it at
 * once race each other. This imports only the files named (or every file), which
 * runs `defineTemplate`'s checks and `buildAuthoredDoc`'s lint, then reports
 * slugs, titles and meta descriptions that collide with any other file.
 *
 *   pnpm --filter @repo/tooling exec tsx templates/check.ts templates/form/contact.ts
 *   pnpm --filter @repo/tooling exec tsx templates/check.ts          # everything
 */
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { TemplateSeed } from "./define.js";

const here = dirname(fileURLToPath(import.meta.url));
const all = ["form", "survey", "quiz"].flatMap((t) =>
  readdirSync(join(here, t))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(here, t, f)),
);
const named = process.argv.slice(2).map((p) => resolve(process.cwd(), p));
const targets = new Set(named.length > 0 ? named : all);

const seen = new Map<string, string>();
let failed = 0;
let count = 0;
for (const file of all) {
  let seeds: TemplateSeed[] = [];
  try {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, TemplateSeed[]>;
    seeds = Object.values(mod).flat();
  } catch (err) {
    if (targets.has(file)) {
      failed++;
      console.error(`FAIL ${file}\n  ${(err as Error).message}`);
    }
    continue;
  }
  for (const t of seeds) {
    for (const [kind, value] of [
      ["slug", t.slug],
      ["searchName", t.searchName.toLowerCase()],
      ["metaDescription", t.metaDescription],
    ] as const) {
      const key = `${kind}:${value}`;
      const other = seen.get(key);
      if (other && targets.has(file)) {
        failed++;
        console.error(`DUPLICATE ${kind} "${value}" in ${t.slug} and ${other}`);
      }
      seen.set(key, t.slug);
    }
    if (targets.has(file)) {
      count++;
      console.log(
        `ok ${t.type}/${t.category} ${t.slug}: ${t.blockCount} questions, ${t.facts.branches} branches, ${t.facts.endings} endings${t.facts.scored ? ", scored" : ""}`,
      );
    }
  }
}
console.log(`${count} templates checked, ${failed} problems`);
process.exit(failed > 0 ? 1 : 0);
