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
export default defineCloudflareConfig({
  incrementalCache: cache,
  /**
   * Serve a cached page without starting Next's router.
   *
   * Measured on the live site before this: 20 back-to-back requests to `/`
   * came back with a median TTFB of 334ms but a p90 of 1.80s, and 35% of them
   * over 1.2s — every one of them on `x-nextjs-cache: HIT`. The prerendered
   * HTML was never the problem; assembling the Next server around it on a cold
   * isolate was, and a third of visitors paid for it. On a throttled phone
   * that was about a quarter of the page's LCP.
   *
   * Interception answers those requests from the incremental cache directly,
   * so the routing layer is only built when something actually needs it.
   *
   * Safe here specifically because nothing in this app uses PPR — the adapter
   * says to leave this off if that changes, since a partial shell has to go
   * through the router to be completed. There is no `experimental.ppr` in
   * `next.config.ts` and no `experimental_ppr` on any route.
   */
  enableCacheInterception: true,
});
