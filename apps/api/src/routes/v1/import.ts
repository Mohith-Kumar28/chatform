import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import { ErrorEnvelope } from "../../lib/openapi.js";
import type { GuardVars } from "../../lib/guards.js";
import { requireScope, type AuthzVars } from "../../lib/authorize.js";
import { validator } from "../../lib/validator.js";
import { ImportedDocumentView } from "../../lib/v1-schemas.js";
import { ImportError } from "../../lib/import/types.js";
import { convertImport } from "../../lib/import/phrase.js";

/**
 * Converting a Typeform, Google Form or Tally form, for an integration.
 *
 * The same conversion the dashboard's Import runs, shaped like
 * `/v1/ai/generate-form`: it returns the document and saves nothing, so a
 * caller reviews it and posts it to `/v1/forms` to keep it. No model is
 * involved, so it spends no AI allowance.
 */
export const importV1Router = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

importV1Router.post(
  "/import",
  requireScope("form", "write"),
  validator("json", z.object({ url: z.string().trim().min(4).max(2000) })),
  describeRoute({
    tags: ["v1"],
    summary: "Convert a public Typeform, Google Form or Tally form into a form document",
    description:
      "Reads the form behind a public link and converts its questions, options, required fields, endings and jumps. " +
      "Returns the document **without saving it**, plus a report of anything that could not be copied (payments, scores, rules that test a different question). " +
      "Post the document to `POST /v1/forms` to keep it. The source form must open without signing in.",
    responses: {
      200: { description: "The converted document and its report", content: { "application/json": { schema: resolver(ImportedDocumentView) } } },
      403: { description: "The key lacks the form:write scope", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      422: { description: "The link cannot be imported; `error.code` says why", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    try {
      // Nothing is saved: the conversion alone, worded by the model on the caller's org.
      return c.json(await convertImport(c.env, c.req.valid("json").url, c.get("orgId") as string));
    } catch (err) {
      if (err instanceof ImportError) {
        return c.json({ error: { code: err.code, message: err.message } }, err.code === "unreachable" ? 502 : 422);
      }
      console.error("v1_import_failed", { message: err instanceof Error ? err.message : String(err) });
      return c.json({ error: { code: "import_failed", message: "The form could not be converted" } }, 500);
    }
  },
);
