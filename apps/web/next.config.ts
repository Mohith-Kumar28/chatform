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
