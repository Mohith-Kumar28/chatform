#!/usr/bin/env node
/**
 * Refuse to publish through npm.
 *
 * These packages export source in the workspace and `dist` when published, and
 * the swap lives in `publishConfig.exports`. pnpm applies that; **npm does not**
 * — so `npm publish` would ship a package.json pointing at `./src/index.ts`,
 * which is not even in `files`. The result installs cleanly and fails on import,
 * which is the worst way for this to go wrong.
 *
 * Verified rather than assumed: `npm pack` produces exports → ./src/*.ts,
 * `pnpm pack` produces exports → ./dist/*.js.
 */
const agent = process.env.npm_config_user_agent ?? "";

if (!agent.includes("pnpm")) {
  console.error(
    "\n  Publish with pnpm, not npm.\n\n" +
      "  npm ignores publishConfig.exports, so this would ship a package whose\n" +
      "  entry points at ./src/index.ts — a package that installs fine and fails\n" +
      "  on import.\n\n" +
      "    pnpm publish --access public\n",
  );
  process.exit(1);
}
