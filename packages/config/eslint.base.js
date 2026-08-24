/** @type {import('eslint').Linter.Config} */
export const baseConfig = {
  ignores: ["node_modules/**", "dist/**", ".next/**", ".turbo/**", ".wrangler/**", "coverage/**"],
  rules: {
    "no-console": ["warn", { allow: ["warn", "error"] }],
    eqeqeq: ["error", "smart"],
  },
};
