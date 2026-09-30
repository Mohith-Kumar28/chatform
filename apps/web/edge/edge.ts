// chatform-edge: a small Worker in front of chatform-web, on chatform.in.
//
// The Next worker is about 64MB of script. Starting an isolate for it costs
// 1.5–2s, and a marketing site is quiet enough that most visits found it cold:
// every page, even `/robots.txt`, took about 2.4s to first byte from India on
// 2026-10-01, while a static asset took 0.5s. This worker is a few KB, so it
// starts in milliseconds, answers public marketing pages from the edge cache,
// and only wakes the Next worker (through a service binding) on a miss or for
// anything that is not a cached public page.
//
// What it caches, and why it is safe:
// - GETs to an allow-listed public path, with no query other than `_rsc`;
// - never with a session cookie, and never a response that sets one;
// - only a 200 the Next worker itself marked cacheable;
// - keyed by the web worker's deployed version (`WEB_VERSION`, set by
//   `edge/deploy.mjs` right after each web deploy), so a deploy is a clean
//   cache, and by the four router headers Next varies a page on, so an RSC
//   payload and its HTML page can never be swapped.
//
// `/f/*`, the dashboard, the builder and auth are never on the list: they read
// search params or the session, and caching them would serve one person's page
// to another.

interface Env {
  WEB: { fetch(request: Request): Promise<Response> };
  WEB_VERSION?: string;
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
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
]);
const PREFIXES = ["/form-templates", "/compare/", "/use-cases/", "/blog", "/docs", "/import/"];
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
    if (!env.WEB_VERSION || !cacheable(request, url)) return env.WEB.fetch(request);

    const cache = (caches as unknown as { default: Cache }).default;
    const key = await keyFor(request, url, env.WEB_VERSION);
    const hit = await cache.match(key);
    if (hit) {
      const res = new Response(hit.body, hit);
      res.headers.set("x-edge-cache", "HIT");
      return res;
    }

    const res = await env.WEB.fetch(request);
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
