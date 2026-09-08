/**
 * The spreadsheet feed, on the developer API.
 *
 * Guarded by `response:export`, which is the same permission the dashboard route
 * checks — `assertPermission(c, "submission", "export")` already maps to that scope,
 * so a key with it would have passed the authorization check all along. The only
 * thing standing in the way was `requireSession`.
 *
 * A feed is a live URL over the same rows an export produces, which is why it is not
 * a `form:write` matter: what it hands out is respondent data, on a schedule.
 */
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import { ErrorEnvelope } from "../../lib/openapi.js";
import { keyOwnsForm, loadFormForOrg, type FormRow, type GuardVars } from "../../lib/guards.js";
import { requireScope, assertFeature, type AuthzVars } from "../../lib/authorize.js";
import { readFeed, upsertFeed, deleteFeed, projectFeed, publicOrigin } from "../../lib/feed-service.js";

export const integrationsV1Router = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

/** As in `v1/versions.ts`: the key's organization, and its form pinning honoured. */
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

const IntegrationRow = z.object({
  id: z.string(),
  provider: z.string(),
  status: z.string(),
  createdAt: z.number(),
  feedUrl: z.string().optional(),
  includePartials: z.boolean().optional(),
});

integrationsV1Router.get(
  "/forms/:id/integrations",
  requireScope("response", "export"),
  describeRoute({
    tags: ["v1"],
    summary: "A form's non-webhook integrations",
    description:
      "Currently just the spreadsheet feed, if one exists. An empty array means no feed has been created.",
    responses: {
      200: { description: "Integrations", content: { "application/json": { schema: resolver(z.array(IntegrationRow)) } } },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = await formForKey(c as never);
    if (!form) return c.json(notFound, 404);
    const feed = await readFeed(c.env, form.id);
    return c.json(feed ? [projectFeed(feed, publicOrigin(c.req.url))] : []);
  },
);

integrationsV1Router.put(
  "/forms/:id/integrations/spreadsheet",
  requireScope("response", "export"),
  validator(
    "json",
    z
      .object({
        includePartials: z.boolean().optional(),
        /** Mint a new token and invalidate the old one. */
        rotate: z.boolean().optional(),
      })
      .optional(),
  ),
  describeRoute({
    tags: ["v1"],
    summary: "Create, update or rotate the spreadsheet feed",
    description:
      "Idempotent by nature — one feed per form — which is why this is a PUT. The returned `feedUrl` is a live CSV a " +
      "spreadsheet can re-read on a schedule; it is unauthenticated, so the URL is the whole credential. Send " +
      "`rotate: true` to invalidate the previous one.",
    responses: {
      200: { description: "The feed", content: { "application/json": { schema: resolver(IntegrationRow) } } },
      402: { description: "Including unfinished responses needs a plan that allows it", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = await formForKey(c as never);
    if (!form) return c.json(notFound, 404);
    const { includePartials = false, rotate = false } = c.req.valid("json") ?? {};

    /**
     * The same gate the CSV export uses, for the same reason: what you finished
     * collecting is yours on every plan, and the unfinished responses are the slice
     * that is sold. A feed asking for partials asks for that slice on a schedule.
     */
    if (includePartials) {
      const locked = await assertFeature(c as never, "export_partials", { surface: "v1.integrations.feed" });
      if (locked) return locked;
    }

    const saved = await upsertFeed(c.env, form, { includePartials, rotate });
    return c.json(projectFeed(saved, publicOrigin(c.req.url)));
  },
);

integrationsV1Router.delete(
  "/forms/:id/integrations/spreadsheet",
  requireScope("response", "export"),
  describeRoute({
    tags: ["v1"],
    summary: "Revoke the spreadsheet feed",
    description: "The URL stops working immediately. Any spreadsheet reading it will start failing to refresh.",
    responses: {
      200: { description: "Revoked" },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = await formForKey(c as never);
    if (!form) return c.json(notFound, 404);
    await deleteFeed(c.env, form.id);
    return c.json({ ok: true });
  },
);
