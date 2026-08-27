import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Next runs on Cloudflare Workers through OpenNext: `opennextjs-cloudflare build` compiles
 * a standalone Next build into a single worker plus a static asset directory.
 *
 * No incremental cache is configured, so ISR/`revalidate` fall back to rendering on every
 * request. Nothing in this app uses either — the dashboard is client-rendered against the
 * API worker, and `/f/[slug]` must not serve a stale form.
 */
export default defineCloudflareConfig();
