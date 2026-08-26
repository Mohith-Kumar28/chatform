import type { NextConfig } from "next";
import path from "node:path";

const monorepoRoot = path.resolve(import.meta.dirname, "../..");

const nextConfig: NextConfig = {
  turbopack: {
    root: monorepoRoot,
  },
  env: {
    API_ORIGIN: process.env.API_ORIGIN ?? "http://localhost:8787",
    NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787",
  },
};

export default nextConfig;
