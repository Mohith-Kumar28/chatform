// Deploys chatform-edge with the version chatform-web is serving right now, so
// the edge cache key changes with every web deploy. Run after the web deploy.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wrangler = (args, opts = {}) => execFileSync("pnpm", ["exec", "wrangler", ...args], { cwd: join(here, ".."), encoding: "utf8", ...opts });

const status = JSON.parse(wrangler(["deployments", "status", "--name", "chatform-web", "--json"]));
const version = status.versions?.sort((a, b) => b.percentage - a.percentage)[0]?.version_id;
if (!version) throw new Error("could not read chatform-web's deployed version");
console.log(`chatform-web is serving ${version}; deploying chatform-edge`);
wrangler(["deploy", "-c", "edge/wrangler.jsonc", "--var", `WEB_VERSION:${version}`], { stdio: "inherit" });

/**
 * Warm the cache the visitors will read, before any of them arrive.
 *
 * The first request for each page after a deploy wakes the big Next worker and
 * pays its cold start. Doing that here, for every page in the sitemap, as both
 * the HTML and the RSC payload a client navigation asks for, means the first
 * real visitor gets a cached page too. The edge cache is per location, and this
 * warms the one nearest whoever deploys, which is where our visitors are.
 */
const sitemap = await (await fetch("https://chatform.in/sitemap.xml")).text();
const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.startsWith("https://chatform.in"));
/**
 * The signed-in app's prerendered shells, which the sitemap leaves out. Each is
 * also warmed as the `/_tree` prefetch the dashboard fires for every link it
 * shows. The builder's pages are per form and are cached on first use instead.
 */
const APP_SHELLS = [
  "/dashboard", "/templates", "/signin", "/forgot-password",
  "/settings/general", "/settings/profile", "/settings/security", "/settings/team",
  "/settings/workspaces", "/settings/organizations", "/settings/api-keys", "/settings/usage",
];
const shells = APP_SHELLS.map((p) => `https://chatform.in${p}`);
// fetch follows Next's 307 to the `_rsc` URL it insists on, headers included.
const jobs = [
  ...[...pages, ...shells].flatMap((u) => [() => fetch(u), () => fetch(u, { headers: { rsc: "1" } })]),
  ...shells.map((u) => () => fetch(u, { headers: { rsc: "1", "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree" } })),
];
const urls = [...pages, ...shells];
let done = 0;
const worker = async () => {
  while (jobs.length) {
    const job = jobs.shift();
    try {
      const res = await job();
      await res.arrayBuffer();
    } catch {
      // A page that fails to warm is simply warmed by its first visitor.
    }
    done += 1;
  }
};
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`warmed ${done} responses for ${urls.length} pages`);
