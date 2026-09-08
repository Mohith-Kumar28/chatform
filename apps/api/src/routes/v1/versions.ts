/**
 * Version history on the developer API: list, read, diff, roll back.
 *
 * `/v1` could publish a form but never look at what it had published, let alone put
 * a version back — so an integration that shipped a bad document had no way to undo
 * it programmatically. Not a decision: `routes/form-history.ts` shipped two days
 * after the pass that built the developer API, and nothing checks that a new
 * dashboard capability also reaches `/v1`.
 *
 * Every handler delegates to `lib/versions-service.ts`, which the dashboard routes
 * use too.
 */
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import { ErrorEnvelope } from "../../lib/openapi.js";
import { keyOwnsForm, loadFormForOrg, type FormRow, type GuardVars } from "../../lib/guards.js";
import { requireScope, type AuthzVars } from "../../lib/authorize.js";
import { afterResponse } from "../../lib/form-activity.js";
import { listVersions, readVersion, restoreVersion } from "../../lib/versions-service.js";
import { idempotent } from "../../lib/idempotency.js";

export const versionsV1Router = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

/**
 * The `/v1` equivalent of `requireFormAccess`.
 *
 * The dashboard's guard resolves a form through the signed-in user's organization;
 * this resolves it through the key's, and additionally honours form pinning — a key
 * restricted to a list of forms must not reach outside it. 404 rather than 403
 * throughout, so a restricted key cannot use this route to discover which form ids
 * exist.
 */
async function formForKey(c: {
  env: Bindings;
  get: (k: "orgId" | "keyMeta") => unknown;
  req: { param: (k: string) => string | undefined };
}): Promise<FormRow | null> {
  const orgId = c.get("orgId") as string | undefined;
  const formId = c.req.param("id");
  if (!orgId || !formId) return null;
  if (!keyOwnsForm(c as never, formId)) return null;
  return loadFormForOrg(c.env, formId, orgId);
}

const notFound = { error: { code: "not_found", message: "Form not found" } } as const;

const VersionSummary = z.object({
  version: z.number(),
  versionId: z.string(),
  note: z.string().nullable(),
  publishedAt: z.number(),
  authorLabel: z.string().nullable(),
  changeCount: z.number(),
  isActive: z.boolean(),
  /** Responses recorded against this exact version. What makes a rollback consequential. */
  responses: z.number(),
});

versionsV1Router.get(
  "/forms/:id/versions",
  requireScope("form", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "Every published version of a form, newest first",
    description:
      "Each version carries the number of completed responses recorded against it — a version nobody answered can be replaced freely; one with responses behind it is the schema those answers were recorded against.",
    responses: {
      200: { description: "Versions", content: { "application/json": { schema: resolver(z.array(VersionSummary)) } } },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = await formForKey(c as never);
    if (!form) return c.json(notFound, 404);
    return c.json(await listVersions(c.env, form));
  },
);

versionsV1Router.get(
  "/forms/:id/versions/:version",
  requireScope("form", "read"),
  validator("query", z.object({ compare: z.coerce.number().int().min(1).optional() })),
  describeRoute({
    tags: ["v1"],
    summary: "One published version, optionally diffed against another",
    description: "Pass `compare` with another version number to get the list of changes between them.",
    responses: {
      200: { description: "The published document, plus a diff when `compare` is given" },
      404: { description: "No such form or version", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = await formForKey(c as never);
    if (!form) return c.json(notFound, 404);
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) {
      return c.json({ error: { code: "not_found", message: "No such version" } }, 404);
    }
    const found = await readVersion(c.env, form.id, version, c.req.valid("query").compare);
    if (!found) return c.json({ error: { code: "not_found", message: "No such version" } }, 404);
    return c.json(found);
  },
);

/**
 * `form:write`, not `form:publish`.
 *
 * Restoring overwrites the working document; it does not change what respondents
 * see. Putting a version back and then making it live are two acts, and only the
 * second one is a publish — so a key that may edit but not publish can still undo a
 * bad draft, which is the point of having the route at all.
 */
versionsV1Router.post(
  "/forms/:id/versions/:version/restore",
  requireScope("form", "write"),
  idempotent("POST /v1/forms/:id/versions/:version/restore"),
  describeRoute({
    tags: ["v1"],
    summary: "Restore a published version into the working document",
    description:
      "Writes the draft, not the live form — respondents see nothing change until you publish. Returns the restored document and what it changed.",
    responses: {
      200: { description: "The draft now matches that version" },
      404: { description: "No such form or version", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      422: { description: "That version cannot be read", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = await formForKey(c as never);
    if (!form) return c.json(notFound, 404);
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) {
      return c.json({ error: { code: "not_found", message: "No such version" } }, 404);
    }

    /**
     * Attributed to the key, not to the person who minted it.
     *
     * The activity feed and the audit log both answer "who did this", and "the
     * nightly sync key" is a truer answer than the name of whoever created it
     * months ago.
     */
    const done = await restoreVersion(c.env, form, version, {
      type: "api_key",
      id: c.get("keyId") ?? "unknown",
    });
    if (done === null) return c.json({ error: { code: "not_found", message: "No such version" } }, 404);
    if (done === "invalid") {
      return c.json({ error: { code: "invalid_doc", message: "That version cannot be read" } }, 422);
    }

    const { sideEffects, ...body } = done;
    await afterResponse(c, sideEffects);
    return c.json(body);
  },
);
