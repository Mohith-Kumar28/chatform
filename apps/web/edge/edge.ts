// chatform-edge: a small Worker in front of chatform-web, on chatform.in.
//
// The Next worker is about 54MB of script. Starting an isolate for it costs
// 1.5–2s, and once warm it still spends 0.2–0.35s of CPU on every request, one
// request at a time per isolate. Opening the dashboard fires ~15 router
// prefetches at once, so on 2026-10-01 they queued for 1.3–10s each and the
// click itself waited behind them. This worker is a few KB, starts in
// milliseconds, answers what it can from the edge cache, and only wakes the
// Next worker (through a service binding) on a miss.
//
// Two kinds of response are cached, and nothing else:
//
// 1. Built ahead of time. Next marks a response it served from its build-time
//    cache with `x-nextjs-cache: HIT`. That covers the marketing pages and the
//    dashboard, settings, templates and sign-in shells: the same bytes for
//    every visitor, because they were rendered before anyone asked. Keyed by
//    path and the three router headers that pick HTML, RSC payload, prefetch
//    or one segment. Not by `next-router-state-tree`, `next-url` or `_rsc`:
//    those describe the page the visitor is navigating *from*, a prerendered
//    response is the same whatever they say (checked: `/dashboard` and
//    `/settings/general` return identical bytes for two different trees), and
//    keying on them gave every source page its own copy so a click never hit.
//
// 2. Rendered per request, but only from the URL. The builder (`/forms/<id>/*`)
//    and the app's template pages are rendered on demand because of their
//    `[id]`/`[slug]` segment, and their server components read nothing but
//    that param: no cookies, no headers, no fetch. Every form, setting and
//    answer is loaded in the browser from api.chatform.in, never through here.
//    These are keyed by the full URL and the router headers *including* the
//    state tree, because a dynamic RSC response is rendered relative to it.
//    Adding a page here means checking its server code reads only the URL.
//
// Both are keyed by the web worker's deployed version (`WEB_VERSION`, set by
// `edge/deploy.mjs` right after each web deploy), so a deploy starts clean and
// a page can never point at another build's scripts. Never cached: anything
// but a GET, a non-200, a response that sets a cookie, and the paths in NEVER.
//
// It also answers a campaign's short link, `/r/<code>`, without waking anything:
// the code's target (a path on this site with its tags, written to KV by the API
// when the link is saved) is read and the visitor is redirected to it. See
// `redirectFor` below and `apps/api/src/routes/admin/campaigns.ts`.

import { linkDestination } from "./short-link";

interface Env {
  WEB: { fetch(request: Request): Promise<Response> };
  WEB_VERSION?: string;
  /** The API's config namespace: `link:<code>` holds where a short link leads. */
  KV_CONFIG?: { get(key: string, options?: { cacheTtl?: number }): Promise<string | null> };
  /** The API worker, asked only for a code KV has not heard of. */
  API?: { fetch(request: Request): Promise<Response> };
}

const SHORT_LINK = /^\/r\/([A-Za-z0-9-]{3,40})\/?$/;
/** How long a code nobody has saved is remembered as such, so guessing codes costs one lookup each. */
const UNKNOWN_CODE_SECONDS = 300;

/**
 * `/r/<code>`: a campaign link's short address. KV first, which is one read at
 * the edge; the API second, for a link whose entry is missing, and it writes the
 * entry back. A code that is not a link at all goes to the home page rather than
 * to an error: whoever followed it wanted chatform.
 *
 * Nothing is counted here. Link previews, crawlers and scanners all follow a
 * redirect, so a count of them would say nothing; the page the visitor lands on
 * reports the visit, with the link's id in its address.
 */
async function redirectFor(code: string, url: URL, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
  const to = (target: string | null) =>
    new Response(null, { status: 302, headers: { location: linkDestination(target, url), "cache-control": "no-store" } });

  const stored = await env.KV_CONFIG?.get(`link:${code}`, { cacheTtl: 60 }).catch(() => null);
  if (stored) return to(stored);

  const cache = (caches as unknown as { default: Cache }).default;
  const missKey = new Request(`${url.origin}/__link-miss/${code}`);
  if (await cache.match(missKey)) return to(null);
  let target: string | null = null;
  let known = false;
  try {
    const res = await env.API?.fetch(new Request(`https://api.chatform.in/p/l/${code}`));
    if (res?.ok) target = ((await res.json()) as { target?: string }).target ?? null;
    // Only a definite "no such link" is remembered; an API that is down says nothing about the code.
    known = !!res && (res.ok || res.status === 404);
  } catch {
    target = null;
  }
  if (!target && known) {
    ctx.waitUntil(cache.put(missKey, new Response("", { headers: { "cache-control": `public, s-maxage=${UNKNOWN_CODE_SECONDS}` } })));
  }
  return to(target);
}

/** Route handlers, the respondent runtime, payments and previews: always live. */
const NEVER = [/^\/api\//, /^\/_next\//, /^\/f\//, /^\/pay(\/|$)/, /^\/preview(\/|$)/, /^\/og(\/|$)/, /^\/cdn-cgi\//, /^\/__/, /^\/geo-preview/];

/** Dynamic pages whose server output depends on the URL alone (see 2 above). */
const URL_ONLY = [/^\/forms\/[^/]+(\/.*)?$/, /^\/templates\/[^/]+(\/use)?$/];

/** The router headers that choose which variant of a prerendered page is sent. */
const STATIC_VARY = ["rsc", "next-router-prefetch", "next-router-segment-prefetch"];
/**
 * A page rendered per request is rendered relative to the state tree, so it
 * joins the key. `next-url` does not: Next reads it only for intercepting
 * routes, which this app has none of, and keying on it would split every
 * prefetch by the page it was fired from.
 */
const DYNAMIC_VARY = [...STATIC_VARY, "next-router-state-tree"];

const EDGE_TTL_SECONDS = 86_400;

/**
 * What the browser is told. Revalidate every time: a HIT here is already fast,
 * and a browser holding a page across a deploy would ask for scripts the new
 * build no longer has.
 */
const BROWSER_CACHE_CONTROL = "private, no-cache";

async function keyFor(request: Request, url: URL, version: string, kind: "static" | "dynamic"): Promise<Request> {
  const vary = kind === "static" ? STATIC_VARY : DYNAMIC_VARY;
  const parts = vary.map((h) => `${h}=${request.headers.get(h) ?? ""}`);
  if (kind === "dynamic") {
    const query = new URLSearchParams(url.search);
    query.delete("_rsc");
    query.sort();
    parts.push(`q=${query.toString()}`);
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("&")));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const key = new URL(url.origin + url.pathname);
  key.searchParams.set("__v", version);
  key.searchParams.set("__k", kind);
  key.searchParams.set("__h", hex);
  return new Request(key.toString(), { method: "GET" });
}

function served(res: Response, cache: "HIT" | "MISS" | "BYPASS"): Response {
  const out = new Response(res.body, res);
  if (cache !== "BYPASS") out.headers.set("cache-control", BROWSER_CACHE_CONTROL);
  out.headers.set("x-edge-cache", cache);
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const short = request.method === "GET" || request.method === "HEAD" ? SHORT_LINK.exec(path) : null;
    if (short) return redirectFor(short[1]!.toLowerCase(), url, env, ctx);
    if (!env.WEB_VERSION || request.method !== "GET" || NEVER.some((r) => r.test(path))) {
      return env.WEB.fetch(request);
    }

    const cache = (caches as unknown as { default: Cache }).default;
    const urlOnly = URL_ONLY.some((r) => r.test(path));
    const staticKey = await keyFor(request, url, env.WEB_VERSION, "static");
    const dynamicKey = urlOnly ? await keyFor(request, url, env.WEB_VERSION, "dynamic") : null;

    const hit = (await cache.match(staticKey)) ?? (dynamicKey ? await cache.match(dynamicKey) : undefined);
    if (hit) return served(hit, "HIT");

    const res = await env.WEB.fetch(request);
    let key: Request | null = null;
    if (res.status === 200 && !res.headers.has("set-cookie")) {
      if (res.headers.get("x-nextjs-cache") === "HIT") key = staticKey;
      else if (dynamicKey) key = dynamicKey;
    }
    if (!key) return served(res, "BYPASS");

    const stored = new Response(res.clone().body, res);
    stored.headers.set("cache-control", `public, s-maxage=${EDGE_TTL_SECONDS}`);
    stored.headers.delete("vary");
    ctx.waitUntil(cache.put(key, stored));
    return served(res, "MISS");
  },
};
