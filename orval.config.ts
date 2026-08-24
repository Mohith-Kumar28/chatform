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
      baseUrl: "http://localhost:8787",
      override: {
        query: {
          useQuery: true,
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
