/**
 * A form's settings by key, on the developer API.
 *
 * `PUT /v1/forms/{id}/doc` could already change any setting, by sending the
 * whole document back, which is the wrong size of tool for "make it navy": an
 * agent has to read a 30 KB document, find `theme.accent`, and write every
 * question back untouched to change one colour. These two routes are the
 * settings the builder chat can change (`settings-registry.ts`), by the same
 * keys, parsed and plan-checked the same way, and nothing else.
 */
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import { ErrorEnvelope } from "../../lib/openapi.js";
import { validator } from "../../lib/validator.js";
import { keyOwnsForm, loadFormForOrg, type GuardVars } from "../../lib/guards.js";
import { requireScope, type AuthzVars } from "../../lib/authorize.js";
import { getEntitlements } from "../../lib/entitlements.js";
import { parseStoredDoc } from "../../lib/form-activity.js";
import { parseDoc, saveWorkingDoc } from "../../lib/forms-service.js";
import { describeSettings, patchSettings } from "../../lib/form-settings-service.js";
import { FormSettingsView, SettingsPatchedView } from "../../lib/v1-schemas.js";

export const formSettingsV1Router = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

const notFound = { error: { code: "not_found", message: "Form not found" } } as const;

/** The form's working document, through the key's organization and its form pinning. */
async function workingDoc(c: { env: Bindings; get: (k: "orgId") => unknown; req: { param: (k: string) => string | undefined } }) {
  const orgId = c.get("orgId") as string | undefined;
  const id = c.req.param("id");
  if (!orgId || !id || !keyOwnsForm(c as never, id)) return null;
  const form = await loadFormForOrg(c.env, id, orgId);
  if (!form) return null;
  const row = await c.env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<{ working_schema: string }>();
  const doc = parseStoredDoc(row?.working_schema);
  return doc ? { id, orgId, doc } : null;
}

formSettingsV1Router.get(
  "/forms/:id/settings",
  requireScope("form", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "Every setting a form has, by key, with its current value",
    description:
      "The settings you can change with `PATCH /v1/forms/{id}/settings`: colours and fonts, the interviewer's tone and goal, " +
      "who can respond, when the form closes, emails, sharing and embedding. Each carries the builder's label, where it lives in " +
      "the builder, the values it takes, and `locked` when your plan does not include it.",
    responses: {
      200: { description: "The settings", content: { "application/json": { schema: resolver(FormSettingsView) } } },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = await workingDoc(c);
    if (!form) return c.json(notFound, 404);
    const ent = await getEntitlements(c.env, form.orgId);
    return c.json({ settings: describeSettings(form.doc, ent) });
  },
);

const PatchBody = z.object({
  changes: z
    .array(z.object({ key: z.string(), value: z.string().max(10_000) }))
    .min(1)
    .max(40)
    .describe("Each setting by its key from GET /v1/forms/{id}/settings, with the new value as text. Empty text clears a clearable setting."),
  utcOffsetMinutes: z
    .number()
    .int()
    .min(-900)
    .max(900)
    .optional()
    .describe("For a date written without a zone: minutes behind UTC, as JavaScript's Date#getTimezoneOffset() reports it."),
});

formSettingsV1Router.patch(
  "/forms/:id/settings",
  requireScope("form", "write"),
  validator("json", PatchBody),
  describeRoute({
    tags: ["v1"],
    summary: "Change a form's settings by key",
    description:
      "Changes the working document; nothing is live until `POST /v1/forms/{id}/publish`. Every value is checked: one that does " +
      "not parse is listed in `rejected` with the reason and nothing else in the call is held back. A setting your plan does not " +
      "include comes back in `changes` with `locked` and is not applied. 422 when nothing in the call could be applied.",
    responses: {
      200: { description: "What changed", content: { "application/json": { schema: resolver(SettingsPatchedView) } } },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      422: { description: "Nothing could be applied", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = await workingDoc(c);
    if (!form) return c.json(notFound, 404);
    const { changes, utcOffsetMinutes } = c.req.valid("json");
    const ent = await getEntitlements(c.env, form.orgId);
    const applied = patchSettings(form.doc, changes, ent, { utcOffsetMinutes, now: Date.now() });
    const live = applied.changes.filter((ch) => !ch.locked);

    if (live.length === 0 && applied.rejected.length > 0) {
      return c.json(
        { error: { code: "invalid_settings", message: applied.rejected.join("; "), issues: applied.rejected.map((message) => ({ message })) } },
        422,
      );
    }
    if (live.length > 0) {
      const parsed = parseDoc(applied.doc);
      if (!parsed.ok) return c.json({ error: { code: parsed.code, message: parsed.message, issues: parsed.issues } }, parsed.status);
      await saveWorkingDoc(c.env, form.id, parsed.doc, {
        orgId: form.orgId,
        actor: { type: "api_key", id: c.get("userId") ?? null, label: "API" },
        source: "api",
      });
    }
    return c.json({ changes: applied.changes, rejected: applied.rejected });
  },
);
