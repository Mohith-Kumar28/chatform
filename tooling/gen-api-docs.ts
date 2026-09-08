/**
 * Generate the API reference pages from the OpenAPI spec.
 *
 * Each page is frontmatter plus a single `<APIPage/>` tag, so the output is a
 * few KB and reviewable in a diff — which is why it is committed rather than
 * built. `next build` then needs no code generation of its own, and the
 * Cloudflare build stays hermetic.
 *
 * The spec is also copied into the app as an import rather than read from disk
 * at request time: nothing in the docs pipeline should touch the filesystem
 * inside a worker.
 *
 * What is copied is the *developer* surface, not the whole spec. `openapi.json`
 * carries the dashboard's session-authenticated routes too, because orval
 * generates the web app's own client from it — but a reference page for
 * `POST /api/keys` documents an endpoint that answers every API key with "Sign in
 * required", and 47 of those shipped. `x-internal`, stamped by
 * `apps/api/src/lib/openapi.ts`, is what separates the two.
 */
import { generateFiles } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SPEC = resolve(here, "../openapi.json");
const OUT = resolve(here, "../apps/web/content/docs/api");
const SPEC_COPY = resolve(here, "../apps/web/src/lib/openapi/spec.json");

const METHODS = ["get", "post", "put", "patch", "delete"];

type Operation = { "x-internal"?: boolean; tags?: string[] };
type Spec = {
  paths: Record<string, Record<string, Operation>>;
  tags?: { name: string; description?: string }[];
};

const spec = JSON.parse(readFileSync(SPEC, "utf8")) as Spec;

/** Drop every operation the API marked internal, then any path left with none. */
const paths: Spec["paths"] = {};
let dropped = 0;
for (const [path, item] of Object.entries(spec.paths)) {
  const kept: Record<string, Operation> = {};
  for (const [method, op] of Object.entries(item)) {
    if (METHODS.includes(method) && op?.["x-internal"]) {
      dropped++;
      continue;
    }
    kept[method] = op;
  }
  if (Object.keys(kept).some((method) => METHODS.includes(method))) paths[path] = kept;
}

const usedTags = new Set(
  Object.values(paths).flatMap((item) =>
    Object.entries(item)
      .filter(([method]) => METHODS.includes(method))
      .flatMap(([, op]) => op.tags ?? []),
  ),
);

const publicSpec: Spec = {
  ...spec,
  paths,
  tags: (spec.tags ?? []).filter((t) => usedTags.has(t.name)),
};

mkdirSync(dirname(SPEC_COPY), { recursive: true });
writeFileSync(SPEC_COPY, `${JSON.stringify(publicSpec, null, 2)}\n`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await generateFiles({
  /**
   * Keyed, not a bare path.
   *
   * Passing the path directly writes the *absolute* path of whoever ran the
   * generator into every page — so the committed output would only render on
   * that machine. A named schema record makes the reference `chatform`, which
   * the app resolves through its own imported copy.
   *
   * The copy is also what is generated *from*, so the pages and the document
   * they render against cannot disagree about which operations exist.
   */
  input: createOpenAPI({ input: { chatform: SPEC_COPY } }),
  output: OUT,
  // One page per operation, grouped by tag, so the sidebar reads as the surfaces
  // do — the developer API, then the signed URLs it hands out, then health.
  per: "operation",
  groupBy: "tag",
});

/**
 * Keep the generated pages out of `llms-full.txt`.
 *
 * `source.config.ts` has documented `llmsExclude` as existing for exactly this
 * since it was added, and nothing ever set it: all 98 operation pages were
 * inlined, which is 52KB — 15% of the file — of `export default function
 * Layout(props)` and no endpoint documentation at all, because the schemas
 * render client-side from `spec.json`. An assistant reading it learned nothing
 * and spent a sixth of its budget doing so. `llms.txt` still links every page,
 * and the spec itself is one fetch away.
 */
function* mdxFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* mdxFiles(full);
    else if (entry.endsWith(".mdx")) yield full;
  }
}

let excluded = 0;
for (const file of mdxFiles(OUT)) {
  const text = readFileSync(file, "utf8");
  const end = text.indexOf("\n---", 3);
  if (!text.startsWith("---") || end === -1) {
    throw new Error(`generated page has no frontmatter to extend: ${file}`);
  }
  writeFileSync(file, `${text.slice(0, end)}\nllmsExclude: true${text.slice(end)}`);
  excluded++;
}

/**
 * Order the reference deliberately.
 *
 * Fumadocs falls back to alphabetical, which put `billing` and `dashboard` ahead
 * of `v1` — so the first thing a developer met in the API reference was two
 * groups of endpoints they could not call. Only `v1` is left of those, but the
 * ordering is written down now so the next tag does not decide it by name.
 */
const GROUP_ORDER = ["v1", "public", "health"];
const groups = readdirSync(OUT).filter((entry) => statSync(join(OUT, entry)).isDirectory());
const ordered = [
  ...GROUP_ORDER.filter((g) => groups.includes(g)),
  ...groups.filter((g) => !GROUP_ORDER.includes(g)).sort(),
];
writeFileSync(
  join(OUT, "meta.json"),
  `${JSON.stringify({ title: "API reference", pages: ordered }, null, 2)}\n`,
);

console.log(
  `wrote the API reference to ${OUT} — ${excluded} operations in ${ordered.length} group(s), ` +
    `${dropped} internal operations withheld`,
);
