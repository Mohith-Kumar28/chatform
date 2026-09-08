/**
 * The developer API, indexed for the passthrough tools.
 *
 * The curated tools cover the jobs an agent is actually asked to do; this is what
 * covers the rest of the surface without paying context for it. A tool schema
 * costs tokens on every single request whether or not it is used, so the whole
 * remaining API is reachable through four generic tools instead of forty-three
 * specific ones. (The pattern is borrowed from other vendors' MCP servers, which
 * front a hundred-plus endpoints the same way.)
 *
 * The index is read from this worker's own `GET /openapi.json`, not from a
 * checked-in copy and not from `apps/web`. That endpoint derives `security` and
 * `x-required-scope` from Hono's live route table, so the index cannot describe a
 * guard the router does not have — and it already excludes `/api/*` and `/p/*`,
 * which is what stops a passthrough tool from reaching the dashboard's
 * session-only surface at all.
 */
import type { McpCtx } from "./dispatch.js";
import { callApi } from "./dispatch.js";

export const SPEC_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export interface Operation {
  method: string;
  path: string;
  summary: string;
  description?: string;
  /** From `x-required-scope`; absent on the self-describing routes. */
  scope?: string;
  /** True when a publishable key is listed in the operation's security block. */
  publishable: boolean;
  parameters: unknown;
  requestBody: unknown;
  responses: unknown;
  /** Lowercased haystack for keyword search. */
  haystack: string;
}

export interface SpecIndex {
  operations: Operation[];
  byKey: Map<string, Operation>;
}

/**
 * Memoised per isolate.
 *
 * `/v1/blocks` does the same thing with its catalogue and has a test asserting
 * two calls return an identical document. The spec changes on deploy, never
 * within an isolate's life, so rebuilding it per request would be pure cost.
 */
let cached: SpecIndex | null = null;

/** `GET /v1/forms/{id}` → `get /v1/forms/{id}`, the key both tools address. */
export function opKey(method: string, path: string): string {
  return `${method.toLowerCase()} ${path}`;
}

export async function loadSpecIndex(c: McpCtx): Promise<SpecIndex> {
  if (cached) return cached;

  const res = await callApi(c, "GET", "/openapi.json");
  if (res.status !== 200 || res.body === null) {
    throw new Error(`could not read the API spec (HTTP ${res.status})`);
  }
  cached = buildIndex(res.body as SpecDocument);
  return cached;
}

/** Test seam: forget the memoised index. */
export function resetSpecIndex(): void {
  cached = null;
}

type SpecDocument = {
  paths?: Record<string, Record<string, RawOperation>>;
};
type RawOperation = {
  summary?: string;
  description?: string;
  "x-required-scope"?: string;
  security?: Record<string, string[]>[];
  parameters?: unknown;
  requestBody?: unknown;
  responses?: unknown;
};

export function buildIndex(doc: SpecDocument): SpecIndex {
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const [method, raw] of Object.entries(item)) {
      if (!(SPEC_METHODS as readonly string[]).includes(method)) continue;
      const summary = raw.summary ?? "";
      const description = raw.description;
      const schemes = (raw.security ?? []).flatMap((entry) => Object.keys(entry));
      operations.push({
        method,
        path,
        summary,
        description,
        scope: raw["x-required-scope"],
        publishable: schemes.includes("publishableKey"),
        parameters: normaliseUnions(raw.parameters),
        requestBody: normaliseUnions(raw.requestBody),
        responses: raw.responses,
        haystack: [method, path, summary, description ?? "", raw["x-required-scope"] ?? ""]
          .join(" ")
          .toLowerCase(),
      });
    }
  }
  operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return { operations, byKey: new Map(operations.map((o) => [opKey(o.method, o.path), o])) };
}

/**
 * `oneOf` → `anyOf`, everywhere in a schema we hand to a client.
 *
 * Not cosmetic: OpenAI's agents accept `anyOf` and reject `oneOf` and `allOf`
 * outright, and Cursor supports neither `$ref` nor `anyOf` in tool schemas. The
 * spec currently has two `oneOf` nodes, both the `POST /v1/sessions/{sid}/messages`
 * request body and its `/v1/chat/…` alias, and they are semantically a plain
 * union — so widening them costs nothing and stops a client from discarding the
 * schema. (`$ref` needs no handling: hono-openapi inlines everything, so the
 * document has none.)
 */
function normaliseUnions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normaliseUnions);
  if (node === null || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    out[k === "oneOf" ? "anyOf" : k] = normaliseUnions(v);
  }
  return out;
}

/**
 * Keyword search, scored rather than filtered.
 *
 * An exact path match must win over a summary that happens to share a word, or
 * `api_read` gets handed the wrong endpoint and the agent reports that the API
 * does not do something it does.
 */
export function searchOperations(index: SpecIndex, query: string, limit = 12): Operation[] {
  const terms = query.toLowerCase().split(/[\s,/]+/).filter((t) => t.length > 1);
  if (terms.length === 0) return index.operations.slice(0, limit);

  const scored = index.operations.map((op) => {
    let score = 0;
    for (const term of terms) {
      if (op.path.toLowerCase().includes(term)) score += 6;
      if (op.summary.toLowerCase().includes(term)) score += 3;
      else if (op.haystack.includes(term)) score += 1;
      if (op.method === term) score += 2;
    }
    return { op, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.op.path.localeCompare(b.op.path))
    .slice(0, limit)
    .map((s) => s.op);
}

/**
 * Does this concrete path match a templated spec path?
 *
 * `/v1/forms/frm_abc/responses` has to resolve to `/v1/forms/{id}/responses`, and
 * the segment count has to match exactly — otherwise `/v1/forms/x/responses`
 * would satisfy `/v1/forms/{id}` and a read would be dispatched to the wrong
 * handler.
 */
export function resolvePath(index: SpecIndex, method: string, concrete: string): Operation | null {
  const direct = index.byKey.get(opKey(method, concrete));
  if (direct) return direct;

  const want = concrete.split("/").filter(Boolean);
  for (const op of index.operations) {
    if (op.method !== method.toLowerCase()) continue;
    const have = op.path.split("/").filter(Boolean);
    if (have.length !== want.length) continue;
    const matches = have.every((seg, i) => (seg.startsWith("{") && seg.endsWith("}")) || seg === want[i]);
    if (matches) return op;
  }
  return null;
}
