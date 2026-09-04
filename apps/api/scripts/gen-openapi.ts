/**
 * Write `openapi.json` from the running worker.
 *
 * This replaces a ritual that was documented in three places and done by hand:
 * start `wrangler dev`, curl the spec, kill the server, regenerate the client.
 * Every step of that is a chance to commit a spec that does not match the code —
 * and since orval reads the committed file, a stale spec silently means a stale
 * web client too.
 *
 * The worker is booted rather than the app imported, because the app's module
 * graph reaches `cloudflare:workers` through the session object and Node cannot
 * resolve that.
 *
 *   pnpm gen:openapi     # writes it
 *   pnpm openapi:verify  # fails if what is committed is out of date
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_startWorker } from "wrangler";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../../openapi.json");

const worker = await unstable_startWorker({
  config: resolve(here, "../wrangler.jsonc"),
  dev: { logLevel: "error" },
});

try {
  const res = await worker.fetch("http://local.test/openapi.json");
  if (!res.ok) throw new Error(`spec generation failed: ${res.status} ${await res.text()}`);
  const spec = (await res.json()) as { paths: Record<string, unknown> };
  writeFileSync(OUT, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`wrote ${OUT} — ${Object.keys(spec.paths ?? {}).length} paths`);
} finally {
  await worker.dispose();
}
