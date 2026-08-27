import { defineConfig } from "orval";

/**
 * Generates the frontend data layer from the API's OpenAPI spec.
 * Run: `pnpm gen:api` (after `apps/api` is running) or point `input` at a saved spec file.
 * Output is committed — hooks/types must NEVER be written by hand.
 */
export default defineConfig({
  chatform: {
    input: "./openapi.json",
    output: {
      target: "./apps/web/src/lib/api/generated.ts",
      client: "react-query",
      mode: "tags-split",
      /**
       * Deliberately no `baseUrl`.
       *
       * With one set, orval bakes it into every generated URL — and the mutator passes an
       * absolute URL straight through, so `NEXT_PUBLIC_API_ORIGIN` had no effect on a
       * single generated hook and the whole app talked to localhost regardless of
       * configuration. Relative paths let the mutator prepend the real origin.
       */
      override: {
        query: {
          useSuspense: false,
        },
        mutator: {
          path: "./apps/web/src/lib/api/mutator.ts",
          name: "customFetch",
        },
      },
    },
  },
});
