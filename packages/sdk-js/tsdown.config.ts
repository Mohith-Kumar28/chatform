import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/browser.ts", "src/webhooks.ts"],
  dts: true,
  /**
   * ESM for everything that holds state, dual for what does not.
   *
   * A session client keeps resume state in browser storage. If a bundler loaded
   * both the ESM and CJS copies — trivially possible in a mixed codebase — there
   * would be two of them writing the same keys, and the bug would look like
   * random session loss. `webhooks` is a pure function, so it is safe to ship
   * both ways for the Node servers that still need CJS.
   */
  format: ["esm"],
  outputOptions: { minify: false },
});
