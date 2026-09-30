// The OpenNext worker, wrapped with an edge cache for the public marketing pages.
//
// Every page request used to start the Worker and read the prerender from the
// assets-backed incremental cache: about 2.4s to first byte from India on
// 2026-10-01, for pages that only change on deploy. Cloudflare's own edge cache
// never kept them, because Next answers with `Vary` on four router headers
// (see the `html-is-never-edge-cached` note), so this keeps them in the Cache
// API instead, one entry per exact combination of those headers.
//
// Safe by construction:
// - only GETs to an allow-listed public path, with no query other than `_rsc`;
// - never with a session cookie, and never a response that sets one;
// - only a 200 that Next itself marked cacheable;
// - keyed by the deployed version, so a deploy is a clean cache.
//
// `/f/*`, the dashboard, the builder and auth are never on the list: they read
// search params or the session, and caching them would serve one person's page
// to another.

// @ts-expect-error: produced by `opennextjs-cloudflare build`
import openNext from "./.open-next/worker.js";

// @ts-expect-error: produced by `opennextjs-cloudflare build`
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

interface Env {
  CF_VERSION_METADATA?: { id: string };
  [key: string]: unknown;
}

const EXACT = new Set([
  "/",
  "/pricing",
  "/compare",
  "/use-cases",
  "/why-conversation-works",
  "/form-statistics",
  "/conversational-forms",
  "/ai-form-builder",
  "/import",
  "/ai-info",
  "/contact",
]);
const PREFIXES = ["/form-templates", "/compare/", "/use-cases/", "/blog", "/docs", "/import/"];

/** The request headers Next varies a page's response on. */
const VARY = ["rsc", "next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch"];

const EDGE_TTL_SECONDS = 86_400;

function cacheable(request: Request, url: URL): boolean {
  if (request.method !== "GET") return false;
  if ([...url.searchParams.keys()].some((k) => k !== "_rsc")) return false;
  if (/(^|;\s*)(__Secure-)?better-auth\./.test(request.headers.get("cookie") ?? "")) return false;
  const path = url.pathname.replace(/\/$/, "") || "/";
  return EXACT.has(path) || PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}

async function keyFor(request: Request, url: URL, version: string): Promise<Request> {
  const variant = VARY.map((h) => `${h}=${request.headers.get(h) ?? ""}`).join("&");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(variant));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const key = new URL(url.toString());
  key.searchParams.set("__v", version);
  key.searchParams.set("__h", hex);
  return new Request(key.toString(), { method: "GET" });
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    if (!cacheable(request, url)) return openNext.fetch(request, env, ctx);

    const cache = (caches as unknown as { default: Cache }).default;
    const key = await keyFor(request, url, env.CF_VERSION_METADATA?.id ?? "dev");
    const hit = await cache.match(key);
    if (hit) {
      const res = new Response(hit.body, hit);
      res.headers.set("x-edge-cache", "HIT");
      return res;
    }

    const res: Response = await openNext.fetch(request, env, ctx);
    if (res.status === 200 && !res.headers.has("set-cookie") && /s-maxage=\d+/.test(res.headers.get("cache-control") ?? "")) {
      const stored = new Response(res.clone().body, res);
      stored.headers.set("cache-control", `public, s-maxage=${EDGE_TTL_SECONDS}`);
      stored.headers.delete("vary");
      ctx.waitUntil(cache.put(key, stored));
    }
    const out = new Response(res.body, res);
    out.headers.set("x-edge-cache", "MISS");
    return out;
  },
};
