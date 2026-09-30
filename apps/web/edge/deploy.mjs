// Deploys chatform-edge with the version chatform-web is serving right now, so
// the edge cache key changes with every web deploy. Run after the web deploy.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wrangler = (args, opts = {}) => execFileSync("pnpm", ["exec", "wrangler", ...args], { cwd: join(here, ".."), encoding: "utf8", ...opts });

const status = JSON.parse(wrangler(["deployments", "status", "--name", "chatform-web", "--json"]));
const version = status.versions?.sort((a, b) => b.percentage - a.percentage)[0]?.version_id;
if (!version) throw new Error("could not read chatform-web's deployed version");
console.log(`chatform-web is serving ${version}; deploying chatform-edge`);
wrangler(["deploy", "-c", "edge/wrangler.jsonc", "--var", `WEB_VERSION:${version}`], { stdio: "inherit" });
