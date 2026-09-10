import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every `/v1` path a documentation page names must exist in the spec.
 *
 * This exists because it has already gone wrong: the SDK once documented and
 * shipped webhook methods pointing at session-guarded routes that answered 401
 * to every key, an `analytics()` call against a route that was never written,
 * and a set of `/v1/chat/forms/…` paths that came from a double mount and were
 * never real. All three were discoverable by comparing prose against the spec,
 * and nothing was doing that.
 *
 * Parameter *names* are deliberately ignored — a page writing `{formId}` where
 * the spec says `{id}` is clearer prose, not a broken link. What is checked is
 * that the endpoint exists at all.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = join(ROOT, "apps/web/content/docs");
const SPEC = join(ROOT, "openapi.json");

/**
 * `/v1/forms/{id}/responses`, `/v1/forms/$FORM_ID/responses` and
 * `/v1/forms/frm_abc.../responses` are all one shape.
 *
 * The last of those matters: pages show real-looking ids in example responses,
 * often elided with an ellipsis, and those stand in for a path parameter rather
 * than claiming an endpoint lives at that literal id.
 */
const PLACEHOLDER =
  /^(\{.*\}|\$\{?[A-Za-z_]\w*\}?|:\w+|(chs|frm|sbm|exp|ver|key|file|ast|whk|org|ws)_\S*|[.…]{1,3})$/;

function normalise(path: string): string {
  return path
    .split("/")
    .map((seg) => (PLACEHOLDER.test(seg) ? "{}" : seg))
    .join("/");
}

const spec = JSON.parse(readFileSync(SPEC, "utf8")) as { paths: Record<string, unknown> };
const known = new Set(Object.keys(spec.paths).map(normalise));

/**
 * A `/v1` path in prose, a code fence, a curl line or a URL.
 *
 * Trailing punctuation and a query string are trimmed: `/v1/blocks.` and
 * `/v1/forms/x/responses?limit=50` both name a real endpoint.
 */
const PATH_RE = /(?:https?:\/\/[^\s/]+)?(\/v1\/[A-Za-z0-9_\-{}$:./]*)/g;

function* mdxFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* mdxFiles(full);
    else if (entry.endsWith(".mdx")) yield full;
  }
}

const problems: string[] = [];

for (const file of mdxFiles(DOCS)) {
  // The generated reference pages are produced *from* the spec, so checking
  // them against it proves nothing and would only ever fail on a bug in the
  // generator that the generator's own output would hide.
  if (file.includes(`${join("docs", "api")}`)) continue;

  const text = readFileSync(file, "utf8");
  for (const [lineNo, line] of text.split("\n").entries()) {
    for (const match of line.matchAll(PATH_RE)) {
      const raw = match[1]!.replace(/[.,;:)\]]+$/, "").split("?")[0]!;
      const candidate = normalise(raw.replace(/\/$/, ""));
      if (known.has(candidate)) continue;
      // A prefix mentioned as a concept ("everything under /v1") is not a claim
      // that an endpoint lives there.
      if (candidate === "/v1" || candidate === "/v1/") continue;
      problems.push(`${relative(ROOT, file)}:${lineNo + 1}  ${raw}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} documented path(s) are not in openapi.json:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nEither the endpoint was renamed, or the page promises something that does not exist.\n" +
      "Run `pnpm gen:openapi` first if you just added the route.\n",
  );
  process.exit(1);
}

const METHODS = ["get", "post", "put", "patch", "delete"];
type Operation = { "x-internal"?: boolean; "x-required-scope"?: string };
const operations = Object.entries(spec.paths as Record<string, Record<string, Operation>>).flatMap(
  ([path, item]) =>
    Object.entries(item)
      .filter(([method]) => METHODS.includes(method))
      .map(([method, op]) => ({ path, method, op })),
);

/**
 * The reference must not publish an endpoint a developer cannot call.
 *
 * This is the check that was missing when 47 session-authenticated dashboard
 * operations shipped as developer documentation. It reads the generated pages
 * rather than the generator's intent, so deleting the filter and regenerating
 * fails here instead of on someone's integration.
 */
const REFERENCE = join(DOCS, "api");
const internalPaths = new Set(operations.filter(({ op }) => op["x-internal"]).map(({ path }) => path));
const published: string[] = [];
for (const file of mdxFiles(REFERENCE)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/"path":\s*"([^"]+)"/g)) {
    if (internalPaths.has(match[1]!)) published.push(`${relative(ROOT, file)}  ${match[1]}`);
  }
  if (!/^llmsExclude: true$/m.test(text)) {
    published.push(`${relative(ROOT, file)}  missing llmsExclude — it would be inlined into llms-full.txt`);
  }
}

/**
 * The scope table in `scopes.mdx` must list exactly the scopes that gate an
 * endpoint.
 *
 * It listed two that gate nothing (`response:read_partial`, `response:delete`)
 * for long enough that the doc invited developers to request permissions with no
 * effect. Now the spec carries `x-required-scope` per operation, so the table has
 * a source of truth to be checked against.
 */
const enforced = new Set(operations.map(({ op }) => op["x-required-scope"]).filter(Boolean) as string[]);
const scopeDoc = readFileSync(join(DOCS, "scopes.mdx"), "utf8");
const documented = new Set<string>();
for (const row of scopeDoc.matchAll(/^\|\s*`(\w+)`\s*\|([^|]+)\|/gm)) {
  for (const action of row[2]!.matchAll(/`(\w+)`/g)) documented.add(`${row[1]}:${action[1]}`);
}
const scopeProblems = [
  ...[...enforced].filter((s) => !documented.has(s)).map((s) => `${s} gates an endpoint but scopes.mdx omits it`),
  ...[...documented].filter((s) => !enforced.has(s)).map((s) => `${s} is in the scopes.mdx table but gates nothing`),
];

if (published.length > 0 || scopeProblems.length > 0) {
  if (published.length > 0) {
    console.error(`\n${published.length} problem(s) in the generated reference:\n`);
    for (const p of published) console.error(`  ${p}`);
    console.error("\nRun `pnpm gen:api-docs` to regenerate it from the spec.\n");
  }
  if (scopeProblems.length > 0) {
    console.error(`\n${scopeProblems.length} scope documentation problem(s):\n`);
    for (const p of scopeProblems) console.error(`  ${p}`);
    console.error("");
  }
  process.exit(1);
}

/**
 * A dashboard capability must also reach `/v1`, or be listed here as deliberate.
 *
 * This is the check that was missing. `/v1` was built in one pass in September and
 * covered everything that existed then; templates predated it and were overlooked,
 * and integrations and version history shipped the day and the third day *after* —
 * each session-only because the builder was the only caller, and nothing noticed.
 * The same pass had already fixed this exact shape of bug for webhooks, where the
 * SDK promised `webhooks.*` against a session-guarded route.
 *
 * Matching is by resource word rather than by path, because the two surfaces spell
 * things differently on purpose (`?ws=` became `?workspace=`, `POST` became `PUT`
 * where the operation is idempotent). A dashboard path is satisfied when some `/v1`
 * operation shares its distinctive segment.
 */
const DASHBOARD_ONLY: Record<string, string> = {
  "/api/keys": "minting and revoking keys needs a signed-in person — no key may widen its own authority",
  "/api/keys/scopes": "vocabulary for the key-creation dialog",
  "/api/keys/{id}": "see /api/keys",
  "/api/keys/{id}/rotate": "see /api/keys",
  "/api/billing/checkout": "changing a plan needs a person, not a key",
  "/api/billing/portal": "see /api/billing/checkout",
  "/api/billing/plans": "public pricing catalogue for the marketing site",
  "/api/billing/usage": "reachable per-key through GET /v1/me",
  "/api/billing/entitlements": "reachable per-key through GET /v1/me",
  "/api/billing/config-check": "deployment diagnostics",
  "/api/audit-logs": "the Business-tier activity log, read by an admin",
  "/api/audit-logs/export": "see /api/audit-logs",
  "/api/auth/ok": "session probe",
  "/api/auth-providers": "which sign-in buttons to render",
  "/api/invitation-preview": "unauthenticated invite landing page",
  "/api/ai/generate-form/stream": "server-sent events for the builder's progress UI; /v1/ai/generate-form is the API form",
  "/api/ai/add-blocks": "deprecated alias of /api/ai/edit-form",
  "/api/forms/{id}/preview/sessions": "opens a session against the *draft*, for the builder's preview pane",
  "/api/forms/{id}/submissions/export": "browser download; /v1/forms/{id}/exports is the API form",
  "/api/forms/{id}/submissions/export.xlsx": "browser download of a typed workbook the API does not produce",
  "/api/forms/{id}/history": "the builder's activity feed; /v1/forms/{id}/versions is the API form",
  "/api/workspaces": "workspaces are an organization-management concern, not a form one",
  "/api/workspaces/{id}": "see /api/workspaces",

  /**
   * The platform console, and the one group here that must never gain a `/v1`
   * equivalent.
   *
   * Everything else on this list is dashboard-only because a key is the wrong
   * credential for it. These are different in kind: they read across every
   * tenant at once, so an API key that could reach them would be a key that
   * reads other people's organizations. There is no scope that makes that
   * acceptable, which is why the guard is an email allowlist in a worker secret
   * rather than a permission — see `apps/api/src/lib/platform-admin.ts`.
   */
  "/api/admin/me": "platform console — cross-tenant, never reachable by a key",
  "/api/admin/overview": "see /api/admin/me",
  "/api/admin/live": "see /api/admin/me",
  "/api/admin/actions": "see /api/admin/me",
  "/api/admin/accounts": "see /api/admin/me",
  "/api/admin/accounts/{orgId}": "see /api/admin/me",
  "/api/admin/product": "see /api/admin/me",
  "/api/admin/forms": "see /api/admin/me",
  "/api/admin/revenue": "see /api/admin/me",
  "/api/admin/ai": "see /api/admin/me",
  "/api/admin/health": "see /api/admin/me",
  "/api/admin/users": "see /api/admin/me",
  "/api/admin/billing-events/{id}/reprocess": "see /api/admin/me",
  "/api/admin/subscriptions/{id}/grace": "see /api/admin/me",
  "/api/admin/accounts/{orgId}/overrides": "see /api/admin/me",
  "/api/admin/accounts/{orgId}/overrides/{key}": "see /api/admin/me",
  "/api/admin/accounts/{orgId}/refresh-entitlements": "see /api/admin/me",
  "/api/admin/accounts/{orgId}/plan": "see /api/admin/me — a comped plan is a platform decision, not a tenant one",
  /**
   * Emphatically never. A key that could mint an impersonation token would be a
   * key that can become any user on the platform.
   */
  "/api/admin/impersonate": "see /api/admin/me — and a key must never be able to become a person",

  /**
   * Covered under a different noun.
   *
   * The dashboard says "submissions" and the developer API says "responses" — the
   * rename was deliberate (a conversation produces a response, not a submission) and
   * the word match cannot see through it.
   */
  "/api/forms/{id}/submissions": "GET /v1/forms/{id}/responses is the same capability, renamed",

  /**
   * Known gaps, listed rather than hidden. Each is a decision waiting to be made, not
   * a capability anyone concluded should stay off the API.
   */
  "/api/forms/{id}/submissions#delete":
    "TODO: no /v1 equivalent for deleting responses in bulk. It would give the declared-but-unused " +
    "`response:delete` scope its first endpoint. Left out deliberately for now: irreversible bulk " +
    "deletion of respondent data over an API key wants a deliberate product decision, not a symmetry fix.",
  "/api/webhooks/{id}/test":
    "TODO: no /v1 equivalent. `POST /v1/webhooks/{id}/deliveries/{id}/replay` covers debugging a delivery " +
    "that happened; firing a synthetic one to check a new endpoint is not reachable by key yet.",
  "/api/forms/{id}/workspace":
    "TODO: moving a form between workspaces has no /v1 equivalent. Owned by the workspace/organization " +
    "separation work — decide there rather than here.",
};

/** The distinctive part of a dashboard path — what a `/v1` equivalent would share. */
function resourceWords(path: string): string[] {
  return path
    .split("/")
    .filter((seg) => seg !== "" && seg !== "api" && !seg.startsWith("{"))
    .map((seg) => seg.toLowerCase());
}

const v1Paths = operations.filter(({ path }) => path.startsWith("/v1/")).map(({ path }) => path.toLowerCase());
const uncovered: string[] = [];
for (const { path, method, op } of operations) {
  if (!path.startsWith("/api/") || !op["x-internal"]) continue;
  // A `#method` suffix lets one path be waived for one verb only — `GET` on a
  // form's submissions is covered by `/v1`, `DELETE` on it is not.
  if (path in DASHBOARD_ONLY || `${path}#${method}` in DASHBOARD_ONLY) continue;
  const words = resourceWords(path);
  const reached = words.length > 0 && words.every((w) => v1Paths.some((p) => p.includes(w)));
  if (!reached) uncovered.push(`${method.toUpperCase()} ${path}`);
}

if (uncovered.length > 0) {
  console.error(`\n${uncovered.length} dashboard capability(ies) have no /v1 equivalent:\n`);
  for (const p of uncovered) console.error(`  ${p}`);
  console.error(
    "\nEither build the /v1 route so an integrator can do this too, or add the path to\n" +
      "DASHBOARD_ONLY in tooling/check-spec-coverage.ts with the reason it is not for keys.\n" +
      "This check exists because templates, integrations and version history were each\n" +
      "session-only for no reason anyone chose.\n",
  );
  process.exit(1);
}

const internalCount = operations.filter(({ op }) => op["x-internal"]).length;
console.log(
  `spec coverage ok — every /v1 path in the docs exists (${known.size} paths in the spec), ` +
    `${internalCount} internal operations withheld from the reference, ` +
    `${enforced.size} scopes documented and enforced`,
);
