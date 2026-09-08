import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every `/v1` path a documentation page names must exist in the spec.
 *
 * This exists because it has already gone wrong: the SDK once documented and
 * shipped webhook methods pointing at session-guarded routes that answered 401
 * to every key, an `analytics()` call against a route that was never written,
 * and a set of `/v1/chat/forms/…` paths that came from a double mount and were
 * never real. All three were discoverable by comparing prose against the spec,
 * and nothing was doing that.
 *
 * Parameter *names* are deliberately ignored — a page writing `{formId}` where
 * the spec says `{id}` is clearer prose, not a broken link. What is checked is
 * that the endpoint exists at all.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = join(ROOT, "apps/web/content/docs");
const SPEC = join(ROOT, "openapi.json");

/**
 * `/v1/forms/{id}/responses`, `/v1/forms/$FORM_ID/responses` and
 * `/v1/forms/frm_abc.../responses` are all one shape.
 *
 * The last of those matters: pages show real-looking ids in example responses,
 * often elided with an ellipsis, and those stand in for a path parameter rather
 * than claiming an endpoint lives at that literal id.
 */
const PLACEHOLDER =
  /^(\{.*\}|\$\{?[A-Za-z_]\w*\}?|:\w+|(chs|frm|sbm|exp|ver|key|file|ast|whk|org|ws)_\S*|[.…]{1,3})$/;

function normalise(path: string): string {
  return path
    .split("/")
    .map((seg) => (PLACEHOLDER.test(seg) ? "{}" : seg))
    .join("/");
}

const spec = JSON.parse(readFileSync(SPEC, "utf8")) as { paths: Record<string, unknown> };
const known = new Set(Object.keys(spec.paths).map(normalise));

/**
 * A `/v1` path in prose, a code fence, a curl line or a URL.
 *
 * Trailing punctuation and a query string are trimmed: `/v1/blocks.` and
 * `/v1/forms/x/responses?limit=50` both name a real endpoint.
 */
const PATH_RE = /(?:https?:\/\/[^\s/]+)?(\/v1\/[A-Za-z0-9_\-{}$:./]*)/g;

function* mdxFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* mdxFiles(full);
    else if (entry.endsWith(".mdx")) yield full;
  }
}

const problems: string[] = [];

for (const file of mdxFiles(DOCS)) {
  // The generated reference pages are produced *from* the spec, so checking
  // them against it proves nothing and would only ever fail on a bug in the
  // generator that the generator's own output would hide.
  if (file.includes(`${join("docs", "api")}`)) continue;

  const text = readFileSync(file, "utf8");
  for (const [lineNo, line] of text.split("\n").entries()) {
    for (const match of line.matchAll(PATH_RE)) {
      const raw = match[1]!.replace(/[.,;:)\]]+$/, "").split("?")[0]!;
      const candidate = normalise(raw.replace(/\/$/, ""));
      if (known.has(candidate)) continue;
      // A prefix mentioned as a concept ("everything under /v1") is not a claim
      // that an endpoint lives there.
      if (candidate === "/v1" || candidate === "/v1/") continue;
      problems.push(`${relative(ROOT, file)}:${lineNo + 1}  ${raw}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} documented path(s) are not in openapi.json:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nEither the endpoint was renamed, or the page promises something that does not exist.\n" +
      "Run `pnpm gen:openapi` first if you just added the route.\n",
  );
  process.exit(1);
}

const METHODS = ["get", "post", "put", "patch", "delete"];
type Operation = { "x-internal"?: boolean; "x-required-scope"?: string };
const operations = Object.entries(spec.paths as Record<string, Record<string, Operation>>).flatMap(
  ([path, item]) =>
    Object.entries(item)
      .filter(([method]) => METHODS.includes(method))
      .map(([method, op]) => ({ path, method, op })),
);

/**
 * The reference must not publish an endpoint a developer cannot call.
 *
 * This is the check that was missing when 47 session-authenticated dashboard
 * operations shipped as developer documentation. It reads the generated pages
 * rather than the generator's intent, so deleting the filter and regenerating
 * fails here instead of on someone's integration.
 */
const REFERENCE = join(DOCS, "api");
const internalPaths = new Set(operations.filter(({ op }) => op["x-internal"]).map(({ path }) => path));
const published: string[] = [];
for (const file of mdxFiles(REFERENCE)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/"path":\s*"([^"]+)"/g)) {
    if (internalPaths.has(match[1]!)) published.push(`${relative(ROOT, file)}  ${match[1]}`);
  }
  if (!/^llmsExclude: true$/m.test(text)) {
    published.push(`${relative(ROOT, file)}  missing llmsExclude — it would be inlined into llms-full.txt`);
  }
}

/**
 * The scope table in `scopes.mdx` must list exactly the scopes that gate an
 * endpoint.
 *
 * It listed two that gate nothing (`response:read_partial`, `response:delete`)
 * for long enough that the doc invited developers to request permissions with no
 * effect. Now the spec carries `x-required-scope` per operation, so the table has
 * a source of truth to be checked against.
 */
const enforced = new Set(operations.map(({ op }) => op["x-required-scope"]).filter(Boolean) as string[]);
const scopeDoc = readFileSync(join(DOCS, "scopes.mdx"), "utf8");
const documented = new Set<string>();
for (const row of scopeDoc.matchAll(/^\|\s*`(\w+)`\s*\|([^|]+)\|/gm)) {
  for (const action of row[2]!.matchAll(/`(\w+)`/g)) documented.add(`${row[1]}:${action[1]}`);
}
const scopeProblems = [
  ...[...enforced].filter((s) => !documented.has(s)).map((s) => `${s} gates an endpoint but scopes.mdx omits it`),
  ...[...documented].filter((s) => !enforced.has(s)).map((s) => `${s} is in the scopes.mdx table but gates nothing`),
];

if (published.length > 0 || scopeProblems.length > 0) {
  if (published.length > 0) {
    console.error(`\n${published.length} problem(s) in the generated reference:\n`);
    for (const p of published) console.error(`  ${p}`);
    console.error("\nRun `pnpm gen:api-docs` to regenerate it from the spec.\n");
  }
  if (scopeProblems.length > 0) {
    console.error(`\n${scopeProblems.length} scope documentation problem(s):\n`);
    for (const p of scopeProblems) console.error(`  ${p}`);
    console.error("");
  }
  process.exit(1);
}

const internalCount = operations.filter(({ op }) => op["x-internal"]).length;
console.log(
  `spec coverage ok — every /v1 path in the docs exists (${known.size} paths in the spec), ` +
    `${internalCount} internal operations withheld from the reference, ` +
    `${enforced.size} scopes documented and enforced`,
);
