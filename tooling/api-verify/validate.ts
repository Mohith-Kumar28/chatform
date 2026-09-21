/**
 * Check a live response against the schema `openapi.json` declares for it.
 *
 * Deliberately a subset of JSON Schema, not an engine. The failure this is
 * hunting is "the spec promises a field the API does not send" — a renamed
 * key, a dropped property, a documented shape that drifted. Catching that
 * needs `required`, `properties`, `items`, `$ref` and the composition
 * keywords, and nothing else. Pulling in ajv to be thorough about
 * `patternProperties` would buy precision nobody is asking for.
 *
 * Unknown keywords are ignored rather than failed, so a schema feature we do
 * not model can never manufacture a finding.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SPEC_PATH = fileURLToPath(new URL("../../openapi.json", import.meta.url));
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));

export interface SchemaVerdict {
  /** "ok" | "no-schema" | "mismatch" */
  verdict: "ok" | "no-schema" | "mismatch";
  problems: string[];
}

function deref(node: any, seen = 0): any {
  if (!node || typeof node !== "object" || seen > 20) return node;
  if (typeof node.$ref === "string") {
    const parts = node.$ref.replace(/^#\//, "").split("/");
    let cur: any = spec;
    for (const p of parts) cur = cur?.[p.replaceAll("~1", "/").replaceAll("~0", "~")];
    return deref(cur, seen + 1);
  }
  return node;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function matchesType(value: unknown, type: string): boolean {
  const actual = typeOf(value);
  if (type === "integer") return actual === "number" && Number.isInteger(value);
  if (type === "number") return actual === "number";
  return actual === type;
}

function check(value: unknown, rawSchema: any, path: string, problems: string[], depth = 0): void {
  if (depth > 12) return;
  const schema = deref(rawSchema);
  if (!schema || typeof schema !== "object") return;

  // Composition: a value need only satisfy one branch, so a failure in all of
  // them is the finding, and a failure in some of them is normal.
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = schema[key];
    if (Array.isArray(branches) && branches.length) {
      const ok = branches.some((b: any) => {
        const sub: string[] = [];
        check(value, b, path, sub, depth + 1);
        return sub.length === 0;
      });
      if (!ok) problems.push(`${path}: matched none of ${branches.length} ${key} branches (got ${typeOf(value)})`);
      return;
    }
  }
  if (Array.isArray(schema.allOf)) {
    for (const b of schema.allOf) check(value, b, path, problems, depth + 1);
  }

  if (schema.type) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    const nullable = schema.nullable === true || types.includes("null");
    if (value === null && nullable) return;
    if (!types.some((t) => matchesType(value, t))) {
      problems.push(`${path}: spec says ${types.join("|")}, got ${typeOf(value)}`);
      return;
    }
  }

  if (Array.isArray(schema.enum) && value !== null && !schema.enum.includes(value as any)) {
    problems.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeOf(value) === "object" && (schema.properties || schema.required)) {
    const obj = value as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!(req in obj)) problems.push(`${path}.${req}: required by the spec, absent from the response`);
    }
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (k in obj) check(obj[k], sub, `${path}.${k}`, problems, depth + 1);
    }
  }

  if (Array.isArray(value) && schema.items) {
    // One element is enough to catch a renamed field, and keeps the report short.
    if (value.length) check(value[0], schema.items, `${path}[0]`, problems, depth + 1);
  }
}

export function validateResponse(method: string, path: string, status: number, body: unknown): SchemaVerdict {
  const op = spec.paths?.[path]?.[method.toLowerCase()];
  if (!op) return { verdict: "no-schema", problems: [`no such operation in openapi.json`] };

  const responses = op.responses ?? {};
  const decl = responses[String(status)] ?? responses.default;
  if (!decl) return { verdict: "no-schema", problems: [`spec declares no ${status} response`] };

  const schema = deref(decl).content?.["application/json"]?.schema;
  if (!schema) return { verdict: "no-schema", problems: [] };

  const problems: string[] = [];
  check(body, schema, "$", problems);
  return { verdict: problems.length ? "mismatch" : "ok", problems };
}

/** Every `/v1` operation the spec declares, as `METHOD path`. */
export function v1Operations(): string[] {
  const out: string[] = [];
  for (const [p, ops] of Object.entries<any>(spec.paths ?? {})) {
    if (!p.startsWith("/v1/")) continue;
    for (const m of Object.keys(ops)) {
      if (["get", "post", "put", "patch", "delete"].includes(m)) out.push(`${m.toUpperCase()} ${p}`);
    }
  }
  return out.sort();
}

export function operationSummary(method: string, path: string): string {
  return spec.paths?.[path]?.[method.toLowerCase()]?.summary ?? "";
}
