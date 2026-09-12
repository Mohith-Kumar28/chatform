/**
 * Generating and editing a form document with a model, on the developer API.
 *
 * Why this was dashboard-only, since it is the question worth answering: nothing
 * decided it. `requirePermission("ai", "generate")` already handles an API key — it
 * checks the key's scopes instead of a role — but `PERMISSION_TO_SCOPE` had no
 * `ai.generate` entry, so deny-by-default refused every key. That mapping is
 * deliberately absent for `billing.*`, `apikey.*` and `audit.*`, where refusing a key
 * is the point; AI generation simply fell in the same hole because the builder was
 * the only caller and nobody had decided otherwise.
 *
 * It has a real cost, so it keeps every guard the dashboard has and gains one: its
 * own `ai:generate` scope, which is not in the agent key preset. A key that authors
 * forms from documents its caller wrote should not be able to start spending the
 * organization's model budget without someone asking for that.
 *
 * The handlers are the dashboard's own functions, imported. The edit path is two
 * hundred lines of document surgery and having a second copy of it would be the worst
 * option on the table.
 */
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import { ErrorEnvelope } from "../../lib/openapi.js";
import type { GuardVars } from "../../lib/guards.js";
import { requireScope, requireQuota, type AuthzVars } from "../../lib/authorize.js";
import { GenerateBody, EditFormBody, ClarifyBody, generateFormHandler, editFormHandler, clarifyFormHandler } from "../ai.js";

export const aiV1Router = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

/**
 * Scope first, then quota.
 *
 * The order matters for what the caller is told: a key without the scope should hear
 * "you lack `ai:generate`", not "you are out of generations this month" — the second
 * is true of every key that cannot generate at all, and sends the reader to the
 * billing page to fix a permissions problem.
 */
aiV1Router.use("/ai/*", requireScope("ai", "generate"));
aiV1Router.use("/ai/*", requireQuota("ai_generations", "v1.ai.generate"));

aiV1Router.post(
  "/ai/generate-form",
  validator("json", GenerateBody),
  describeRoute({
    tags: ["v1"],
    summary: "Generate a form document from a natural-language prompt",
    description:
      "Returns a document and its lint issues **without saving anything** — pass the result to `POST /v1/forms` to keep it. " +
      "Consumes one `ai_generations` unit and the tokens it costs, charged only when a usable document comes back. " +
      "If you are already driving this from a model of your own, writing the document yourself and posting it to `/v1/forms` costs you nothing here.",
    responses: {
      200: {
        description: "The generated document, its lint issues, and the tokens spent",
        content: {
          "application/json": {
            schema: resolver(z.object({ doc: z.unknown(), issues: z.array(z.any()), tokens: z.number() })),
          },
        },
      },
      402: { description: "Out of generations for this billing period", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      403: { description: "The key lacks the ai:generate scope", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      502: { description: "Generation failed after retries" },
      503: { description: "AI is not configured on this deployment" },
    },
  }),
  generateFormHandler,
);

aiV1Router.post(
  "/ai/edit-form",
  validator("json", EditFormBody),
  describeRoute({
    tags: ["v1"],
    summary: "Ask a model to change an existing form: add, edit or remove questions and rewire the flow",
    description:
      "Returns the proposed document **without saving it** — send it to `PUT /v1/forms/{id}/doc` to keep it. " +
      "An edit may add no questions at all: most requests about a working form change the routing rather than the wording. " +
      "Pass `history` (oldest first) when this is a follow-up, or the model cannot resolve 'also', 'it' or 'instead'.",
    responses: {
      200: { description: "The proposed document and what changed" },
      402: { description: "Out of generations for this billing period", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      403: { description: "The key lacks the ai:generate scope", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      422: { description: "The request would change nothing" },
      502: { description: "Generation failed after retries" },
    },
  }),
  editFormHandler,
);

aiV1Router.post(
  "/ai/clarify-form",
  validator("json", ClarifyBody),
  describeRoute({
    tags: ["v1"],
    summary: "Ask what a form request leaves open, before generating from it",
    description:
      "Returns up to three questions whose answers would change the form — and **usually returns none**, which is the " +
      "intended answer rather than a failure. Worth calling when a person is going to see the result: a request that " +
      "asks to take a payment but names no UPI id, or to branch by plan without naming the plans, produces a form with " +
      "a hole in it that only they can fill.\n\n" +
      "Feed the answers back as `clarifications` on `POST /v1/ai/generate-form`. Skipping this endpoint entirely is " +
      "fine; generation does not require it.\n\n" +
      "Runs on the cheapest tier and is not charged as a generation — it is a question about a form, not a form — " +
      "though its tokens are still counted.",
    responses: {
      200: {
        description: "Questions worth asking, oldest concern first. An empty list means the request is answerable as it stands.",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                questions: z.array(
                  z.object({
                    question: z.string(),
                    why: z.string(),
                    kind: z.enum(["choice", "text"]),
                    options: z.array(z.string()),
                  }),
                ),
              }),
            ),
          },
        },
      },
      403: { description: "The key lacks the ai:generate scope", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  clarifyFormHandler,
);
