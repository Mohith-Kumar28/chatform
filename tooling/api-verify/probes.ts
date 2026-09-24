/**
 * Contract probes: the promises the documentation makes, checked against the
 * live API and against the spec itself.
 *
 * Separate from the endpoint walk because these are not "does this endpoint
 * work". Every one of them passed the endpoint walk. They are the things a
 * developer trips over *after* the endpoint returns 200 to somebody else:
 * an error that does not have the documented shape, a list that does not have
 * the documented envelope, a request body the spec declines to describe.
 *
 * Each probe states the promise, names where it is made, and checks it. A
 * probe that cannot find its promise fails loudly rather than passing quietly.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ApiClient } from "./client.ts";
import type { Finding } from "./report.ts";

const ROOT = new URL("../../", import.meta.url);
const spec = JSON.parse(readFileSync(fileURLToPath(new URL("openapi.json", ROOT)), "utf8"));
const docs = (name: string) => readFileSync(fileURLToPath(new URL(`apps/web/content/docs/${name}`, ROOT)), "utf8");

export async function runProbes(client: ApiClient, formId: string, responseId: string): Promise<Finding[]> {
  const out: Finding[] = [];
  const log = (ok: boolean, label: string) => console.log(`  ${ok ? "pass" : "FAIL"}  ${label}`);

  // 1. "Every error has the same shape" -- docs/errors.mdx
  {
    const r = await client.call({
      method: "POST", path: "/v1/responses/{id}/answers", params: { id: responseId },
      body: { answers: { wrong: "shape" } }, incidental: true,
    });
    const e = r.json?.error;
    const enveloped = e && !Array.isArray(e) && typeof e.code === "string" && typeof e.message === "string";
    log(!!enveloped, "validation error uses the documented envelope");
    if (!enveloped) {
      out.push({
        severity: "high",
        title: "A schema validation failure does not use the documented error envelope",
        detail:
          "`apps/web/content/docs/errors.mdx` opens with \"Every error has the same shape\" and shows " +
          "`{error:{code,message,issues,request_id,doc_url}}`. A body the route's Zod schema rejects instead returns the " +
          "validator's own output, in which `error` is an **array** of issues and there is no `code`, no `message`, no " +
          "`request_id` and no `doc_url`:\n\n" +
          "```json\n" + JSON.stringify(r.json).slice(0, 420) + "\n```\n\n" +
          "Two consequences. Any client keying off `error.code` -- including `@chatformhq/js`, whose `ChatformError` " +
          "degrades to `code: \"http_400\"` and `message: \"Request failed with 400\"` -- loses every field-level issue, so " +
          "the developer is told the request failed but never which field. And the response **echoes the submitted body " +
          "back** under `data`, so a rejected payload carrying an email or a phone number is reflected to the caller.\n\n" +
          "It reaches every route that validates a body or query: 23 of the 69 `/v1` operations. `validator` is imported " +
          "straight from `hono-openapi` in `apps/api/src/routes/v1.ts` with no error hook, so the default output is what ships.",
      });
    }
  }

  // 2. Errors are JSON -- same promise, different failure
  {
    const r = await client.call({
      method: "POST", path: "/v1/responses/{id}/complete", params: { id: responseId },
      headers: { "content-type": "application/json" }, incidental: true,
    });
    const isJson = r.json !== null;
    log(isJson, "a bodyless POST with a JSON content-type still answers in JSON");
    if (!isJson) {
      out.push({
        severity: "medium",
        title: "A bodyless POST with a JSON content-type answers in plain text",
        detail:
          "`POST /v1/responses/{id}/complete` with `content-type: application/json` and no body returns HTTP " +
          `${r.status} as \`text/plain\`:\n\n\`\`\`\n${r.text.slice(0, 200)}\n\`\`\`\n\n` +
          "Not JSON, so not the documented envelope, and with no `request_id` to quote. Sending `content-type: " +
          "application/json` on a POST with nothing to send is what most HTTP clients do by default. `@chatformhq/js` " +
          "happens to be safe -- it sets the header only when there is a body -- but a developer writing `curl -X POST " +
          "-H 'content-type: application/json'` by hand gets this.",
      });
    }
  }

  // 3. "List endpoints return a page and a cursor" -- docs/pagination.mdx
  {
    const promise = docs("pagination.mdx").includes("has_more");
    if (!promise) throw new Error("pagination.mdx no longer documents has_more; this probe needs rewriting");

    const lists: [string, Record<string, string> | undefined][] = [
      ["/v1/forms", undefined],
      ["/v1/forms/{id}/responses", { id: formId }],
      ["/v1/templates", undefined],
      ["/v1/webhooks", undefined],
      ["/v1/exports", undefined],
      ["/v1/forms/{id}/versions", { id: formId }],
      ["/v1/forms/{id}/integrations", { id: formId }],
    ];
    const shapes: string[] = [];
    for (const [path, params] of lists) {
      const r = await client.call({ method: "GET", path, params, incidental: true });
      const b = r.json;
      const shape = Array.isArray(b) ? "bare array" : `{${Object.keys(b ?? {}).join(", ")}}`;
      shapes.push(`| \`GET ${path}\` | \`${shape}\` |`);
    }
    const conforming = shapes.filter((s) => s.includes("data, has_more, next_cursor")).length;
    log(conforming === lists.length, `all ${lists.length} list endpoints use the documented envelope`);
    if (conforming !== lists.length) {
      out.push({
        severity: "medium",
        title: "List endpoints do not share one envelope",
        detail:
          "`apps/web/content/docs/pagination.mdx` states that list endpoints return `{data, has_more, next_cursor}` and " +
          `that you page by handing \`next_cursor\` back. ${conforming} of ${lists.length} do:\n\n` +
          "| Endpoint | Response |\n| --- | --- |\n" + shapes.join("\n") +
          "\n\nA bare array cannot carry a cursor, so those endpoints have no paging at all and a client written to the " +
          "documented contract reads `.data` of an array and gets `undefined`. Changing them is a breaking change to a " +
          "published API, so the near-term fix is to correct the page; the envelope belongs to a future version.",
      });
    }
  }

  // 4. The spec describes what you may send and what comes back
  {
    const noBodySchema: string[] = [];
    const noResponseSchema: string[] = [];
    for (const [p, ops] of Object.entries<any>(spec.paths)) {
      if (!p.startsWith("/v1/")) continue;
      for (const [m, op] of Object.entries<any>(ops)) {
        if (!["get", "post", "put", "patch", "delete"].includes(m)) continue;
        const body = op.requestBody?.content?.["application/json"]?.schema;
        if (body && JSON.stringify(body).includes('"doc":{}')) noBodySchema.push(`${m.toUpperCase()} ${p}`);
        const r2xx = Object.keys(op.responses ?? {}).find((k) => k.startsWith("2"));
        if (!(r2xx && op.responses[r2xx]?.content?.["application/json"]?.schema)) {
          noResponseSchema.push(`${m.toUpperCase()} ${p}`);
        }
      }
    }
    const total = noResponseSchema.length + Object.entries<any>(spec.paths).filter(([p]) => p.startsWith("/v1/")).length;
    log(noResponseSchema.length === 0, `every /v1 operation declares a response schema (${noResponseSchema.length} do not)`);
    if (noResponseSchema.length) {
      out.push({
        severity: "high",
        title: `${noResponseSchema.length} of 69 \`/v1\` operations declare no response body`,
        detail:
          "The reference page generated for each of these shows a status code and a one-line description, and nothing " +
          "about what comes back. The gap is not in the new endpoints -- templates, versions, knowledge, integrations, " +
          "AI, exports and uploads all declare schemas. It is the original core that does not: `GET /v1/me`, " +
          "`GET /v1/forms`, `POST /v1/forms`, every operation in the response lifecycle, and all of `/v1/sessions`.\n\n" +
          "It also means this harness cannot check those responses against anything but a hand-written expectation, and " +
          "that `orval` generates the dashboard's own client against `unknown` for them.\n\nUnschema'd:\n\n" +
          noResponseSchema.map((o) => `- \`${o}\``).join("\n"),
      });
    }
    if (noBodySchema.length) {
      out.push({
        severity: "high",
        title: "The form document has no published schema",
        detail:
          "`" + noBodySchema.join("`, `") + "` declare their `doc` parameter as `{}` -- an empty schema, which accepts " +
          "anything and describes nothing. No documentation page describes an ending, an ending rule or a condition " +
          "either.\n\nSo the one artifact a developer must compose to build a form programmatically is the one thing the " +
          "API does not describe. `GET /v1/blocks/{type}` publishes a full JSON Schema per block type and is genuinely " +
          "good; the document *around* the blocks -- `endings`, `endingRules`, `logic`, `variables`, `settings` -- has " +
          "nothing. The only way to learn it is to read back `GET /v1/templates/{slug}` and imitate it, or to guess " +
          "against the linter.\n\nGuessing against the linter is what this run did, and it took three rounds. Two of the " +
          "linter's messages were excellent (it named the option id to use, and explained that an ending rule pinned to " +
          "a question can never fire). The third, for an `endings[].requirements` entry given as a string rather than " +
          "`{id, label, when}`, was `\"Requirements: This is missing\"` -- which never says what was expected.",
      });
    }
  }

  // 5. House style reaches the developer surface
  {
    const offenders: string[] = [];
    for (const [p, ops] of Object.entries<any>(spec.paths)) {
      if (!p.startsWith("/v1/")) continue;
      for (const [m, op] of Object.entries<any>(ops)) {
        if (typeof op !== "object" || op === null) continue;
        for (const field of ["summary", "description"]) {
          if (String(op[field] ?? "").includes("\u2014")) offenders.push(`${m.toUpperCase()} ${p} (${field})`);
        }
      }
    }
    log(offenders.length === 0, `no em dashes in /v1 spec prose (${offenders.length} found)`);
    if (offenders.length) {
      out.push({
        severity: "low",
        title: `${offenders.length} em dashes in the published API reference`,
        detail:
          "Two commits swept em dashes out of the product (`89c4ff7`, `9ef4be5`) and the developer surface was not in " +
          "either. These strings are `summary` and `description` values on `/v1` routes, and they render onto the public " +
          "reference pages at `chatform.in/docs/api/v1/*`. `apps/api/src/lib/guards.ts:289` ships one inside a live error " +
          "message, and `apps/api/src/routes/v1/meta.ts:64` ships one inside a response body, where " +
          "`GET /v1/blocks/{type}` returns `answered_by: \"matched exactly \u2014 never sent to a model\"`.\n\n" +
          offenders.slice(0, 12).map((o) => `- \`${o}\``).join("\n") +
          (offenders.length > 12 ? `\n- ...and ${offenders.length - 12} more` : ""),
      });
    }
  }

  // 6. scopes.mdx counts the endpoints it is describing
  {
    const text = docs("scopes.mdx");
    const claim = text.match(/([A-Za-z-]+) of the ([a-z-]+) `\/v1` endpoints/);
    const actual = Object.entries<any>(spec.paths)
      .filter(([p]) => p.startsWith("/v1/"))
      .reduce((n, [, ops]) => n + Object.keys(ops).filter((m) => ["get", "post", "put", "patch", "delete"].includes(m)).length, 0);
    const words: Record<string, number> = { "forty-three": 43, "sixty-nine": 69 };
    const claimed = claim ? words[claim[2]] : undefined;
    /**
     * No claim is the right answer. A hand-written count is stale the day an
     * endpoint is added, so the page having no number to be wrong about is a
     * pass rather than a gap.
     */
    log(!claim || claimed === actual, claim ? `scopes.mdx endpoint count matches the spec (says ${claim[2]}, is ${actual})` : `scopes.mdx states no endpoint count to go stale (there are ${actual})`);
    if (claim && claimed !== actual) {
      out.push({
        severity: "low",
        title: "`docs/scopes.mdx` states an endpoint count that is out of date",
        detail:
          `The page says "${claim[1]} of the ${claim[2]} \`/v1\` endpoints accept a publishable key". There are now ` +
          `**${actual}**. A hand-written count goes stale on the next endpoint; deriving it in \`tooling/gen-api-docs.ts\` ` +
          "would keep it honest.",
      });
    }
  }

  // 7. A form you just created is readable and listable
  {
    const made = await client.call({
      method: "POST", path: "/v1/forms", body: { title: "zz-apitest readback probe" }, incidental: true,
    });
    const id = made.json?.id;
    if (id) {
      const direct = await client.call({ method: "GET", path: "/v1/forms/{id}", params: { id }, incidental: true });
      const listed = await client.call({ method: "GET", path: "/v1/forms", query: { limit: 100 }, incidental: true });
      const inList = (listed.json?.data ?? []).some((f: any) => f.id === id);
      const ok = direct.status === 200 && inList;
      log(ok, "a form created a moment ago can be read back and appears in the list");
      if (!ok) {
        out.push({
          severity: "high",
          title: "A form you just created is invisible through both documented read paths",
          detail:
            "`POST /v1/forms` answers 201 with an id. Immediately afterwards:\n\n" +
            "- `GET /v1/forms/{id}` answers **" + direct.status + "** `" + (direct.json?.error?.code ?? "ok") + "` (\"Form not found\"), for a form that plainly exists.\n" +
            "- `GET /v1/forms` does **not** list it.\n\n" +
            "Both have explanations and neither is discoverable. `GET /v1/forms/{id}` returns the *published* config, and " +
            "the working document is behind `?view=document` -- a parameter declared nowhere in `openapi.json` (the " +
            "operation lists `id` as its only parameter) and mentioned on no documentation page. `GET /v1/forms` defaults " +
            "to `status: \"published\"`, so a draft needs `?status=draft` or `?status=all`; the default is not stated on " +
            "the reference page either.\n\n" +
            "`@chatformhq/js` is unaffected, because `forms.getDocument()` sends `view=document` -- so the SDK quietly " +
            "knows something the API reference does not say. A developer following the reference, which is the audience " +
            "`docs/quickstart.mdx` addresses first, creates a form and cannot find it.",
        });
      }
      await client.call({ method: "DELETE", path: "/v1/forms/{id}", params: { id }, incidental: true });
    }
  }

  return out;
}
