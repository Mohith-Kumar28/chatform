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

console.log(`spec coverage ok — every /v1 path in the docs exists (${known.size} paths in the spec)`);
