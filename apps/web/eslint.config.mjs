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
  /**
   * Better Auth UI, vendored.
   *
   * These files arrive from the `@better-auth-ui` shadcn registry — the
   * account, security and organization screens, the code inputs, the strength
   * meter — and they are re-fetched by `shadcn add`, which would overwrite any
   * edit made here. They trip `react-hooks/set-state-in-effect` in a dozen
   * places by reading `sessionStorage` in a mount effect, which is the ordinary
   * way to do that in an SSR app and is not a bug we are entitled to "fix" in
   * somebody else's source.
   *
   * Everything WE write against them — the provider config, the pages, the
   * password field — lives outside this directory and is linted normally. Only
   * the vendored tree is exempt, and only for rules about how it is written
   * internally.
   */
  {
    files: ["src/components/auth/**", "src/lib/auth/*-plugin*"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
]);

export default eslintConfig;
