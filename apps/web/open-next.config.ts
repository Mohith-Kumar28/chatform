import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import cache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * Next runs on Cloudflare Workers through OpenNext: `opennextjs-cloudflare build` compiles
 * a standalone Next build into a single worker plus a static asset directory.
 *
 * The incremental cache is the read-only, assets-backed one. Without it a
 * prerendered page falls back to rendering on every request — which was fine
 * while nothing was prerendered, and stopped being fine the moment the docs
 * added a hundred and eighteen pages that only change on deploy.
 *
 * Read-only is the right shape here: nothing in this app revalidates. The
 * dashboard is client-rendered against the API worker, and `/f/[slug]` fetches
 * with `no-store` and reads search params, so it stays dynamic and never
 * consults this at all.
 */
export default defineCloudflareConfig({ incrementalCache: cache });
