import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext build output — a bundled copy of the whole app plus its dependencies.
    // Linting it turns 6 real errors into 650.
    ".open-next/**",
    // fumadocs-mdx's generated content index. Machine-written, gitignored, and
    // it carries a @ts-nocheck the config would otherwise object to.
    ".source/**",
  ]),
]);

export default eslintConfig;
