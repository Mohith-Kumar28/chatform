import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import type { Bindings } from "../src/env.js";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Bindings {}
}

declare module "vitest" {
  interface ProvidedContext {
    migrations: D1Migration[];
  }
}
