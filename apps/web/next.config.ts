import type { NextConfig } from "next";
import path from "node:path";

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

export default nextConfig;
