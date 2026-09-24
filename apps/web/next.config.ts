import type { NextConfig } from "next";
import path from "node:path";
import { createMDX } from "fumadocs-mdx/next";

const monorepoRoot = path.resolve(import.meta.dirname, "../..");

const nextConfig: NextConfig = {
  turbopack: {
    root: monorepoRoot,
  },
  experimental: {
    /**
     * Keep visited route segments in the client cache.
     *
     * The default for dynamic routes is 0 — no caching at all — so every switch
     * between Questions and Flow, which are sibling routes under the builder,
     * paid a fresh server round trip and flashed a loading fallback. Nothing
     * here renders on the server beyond a shell: every page in this app is a
     * client component that fetches through react-query, so a cached RSC
     * payload cannot be stale in any way a user could notice.
     */
    staleTimes: { dynamic: 180, static: 300 },
  },
  /**
   * The markdown mirror.
   *
   * `/docs/quickstart.md` is the URL `llms.txt` advertises and the docs header
   * copies; `/docs-md/quickstart` is where the route handler that serves it can
   * actually live, because a Next route segment cannot carry a file extension
   * and `route.ts` cannot share a segment with the `page.tsx` already serving
   * `/docs/[[...slug]]`.
   *
   * Two entries because `/docs` itself is a page too, and `:path*` needs at
   * least one segment to match.
   */
  async rewrites() {
    return [
      { source: "/docs.md", destination: "/docs-md" },
      { source: "/docs/:path*.md", destination: "/docs-md/:path*" },
    ];
  },
  async headers() {
    return [
      {
        /**
         * Everything except the hosted form.
         *
         * SAMEORIGIN rather than DENY: the builder frames /preview/[id] from
         * this same origin, and DENY would break the live preview that makes
         * "preview equals production" true.
         *
         * /f/ is excluded because it is the one route that is *meant* to be
         * framed. Its per-form allowlist is enforced where it cannot be
         * bypassed — when a session is opened, against the Origin header the
         * browser sets.
         *
         * /pay/return goes with it, for the same reason at one remove: a gateway that has to
         * leave the page for a bank or a UPI app leaves the *iframe* an embedded form is in, and
         * sends the respondent back to this page — inside that same frame. Refused there, the
         * embed showed a blocked frame instead of the form, with the payment already made. The
         * page itself holds nothing a host page could read: it takes a record id from the
         * address, and its only credential comes from storage the frame already has.
         */
        source: "/:path((?!f/|pay/return).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        /**
         * The hosted form gets the two headers that have nothing to do with
         * framing.
         *
         * The exclusion above exists so `/f/` *can* be framed — and it was
         * dropping `nosniff` and `Referrer-Policy` along with the frame
         * directives, on the one route that renders author-supplied content to
         * strangers. Neither of these constrains an embedder.
         *
         * `Referrer-Policy` matters here specifically: a hosted form is linked
         * from emails, QR codes and other people's pages, and without this the
         * full referring URL travels on every asset request the page makes.
         */
        source: "/f/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // The embed loader is fetched cross-origin by definition.
        source: "/embed.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
        ],
      },
    ];
  },
  env: {
    API_ORIGIN: process.env.API_ORIGIN ?? "http://localhost:8787",
    NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787",
  },
};

/**
 * MDX is compiled at build time, so nothing in the docs pipeline runs in the
 * worker — no compiler in the bundle, and no filesystem reads at request time.
 */
export default createMDX()(nextConfig);
