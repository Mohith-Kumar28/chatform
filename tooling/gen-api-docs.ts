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
 */
import { generateFiles } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SPEC = resolve(here, "../openapi.json");
const OUT = resolve(here, "../apps/web/content/docs/api");
const SPEC_COPY = resolve(here, "../apps/web/src/lib/openapi/spec.json");

mkdirSync(dirname(SPEC_COPY), { recursive: true });
writeFileSync(SPEC_COPY, readFileSync(SPEC, "utf8"));

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
   */
  input: createOpenAPI({ input: { chatform: SPEC } }),
  output: OUT,
  // One page per operation, grouped by tag, so the sidebar reads as the surfaces
  // do — v1, public, dashboard, billing.
  per: "operation",
  groupBy: "tag",
});

console.log(`wrote the API reference to ${OUT}`);
