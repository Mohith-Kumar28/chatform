import { defineConfig } from "vitest/config";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

// Migrations are read here, in Node, because the Workers runtime the tests run
// inside has no filesystem access. They are injected as a test-context value.
const migrations = await readD1Migrations(path.resolve(import.meta.dirname, "../../packages/db/drizzle"));

/**
 * Tests run inside the real Workers runtime (Miniflare) against the real
 * wrangler bindings — D1, R2, KV, Queues, the SessionDO — so guards, SQL and
 * Durable Object behavior are exercised as they ship, not as mocks.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        compatibilityDate: "2026-08-01",
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          ENVIRONMENT: "test",
          APP_ORIGIN: "http://localhost",
          BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
          SIGNING_SALT: "test-salt",
        },
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    provide: { migrations },
  },
});
