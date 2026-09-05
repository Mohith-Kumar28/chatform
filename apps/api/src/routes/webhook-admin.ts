import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { hmac, EVENT_ALIASES } from "../lib/webhooks.js";
import { requirePermission, type AuthzVars } from "../lib/authorize.js";
import { getEntitlements, countWebhooks } from "../lib/entitlements.js";
import { limitReached } from "@repo/entitlements";

export const webhooksRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

/**
 * Every name a subscription may be written as, derived from the dispatcher's own
 * alias table rather than typed out again here.
 *
 * The two lists had already drifted: the dashboard offers `response.completed`
 * and `response.partial` — the canonical namespace — while this validator
 * accepted only the legacy `submission.*` pair, so *every* webhook added from
 * the Integrate tab was refused with a 422 the UI did not show. Deriving the
 * enum means the endpoint accepts exactly what the dispatcher can deliver, and
 * a new event is subscribable the moment it is emitted.
 */
const SUBSCRIBABLE_EVENTS = [...new Set(Object.values(EVENT_ALIASES).flat())] as [string, ...string[]];

webhooksRouter.use("/webhooks/*", requireSession);
webhooksRouter.use("/webhooks", requireSession);
webhooksRouter.use("/webhooks/*", requireOrg);
webhooksRouter.use("/webhooks", requireOrg);

// Webhooks are free on every plan — Youform gives them away and so do we. What the plan
// bounds is how many per form, which is a fair-use ceiling rather than a paywall.
webhooksRouter.use("/webhooks", requirePermission("webhook", "read"));
webhooksRouter.post("/webhooks", requirePermission("webhook", "create"));
webhooksRouter.delete("/webhooks/:id", requirePermission("webhook", "delete"));

const WebhookRow = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.string()),
  formId: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.number(),
  secretPreview: z.string().optional(),
});

webhooksRouter.get(
  "/webhooks",
  describeRoute({ tags: ["dashboard"], summary: "List webhooks", responses: { 200: { description: "Webhooks", content: { "application/json": { schema: resolver(z.array(WebhookRow)) } } } } }),
  async (c) => {
    const orgId = c.get("orgId");
    if (!orgId) return c.json([]);
    const rows = await c.env.DB.prepare(
      `SELECT id, url, secret, events, form_id, active, created_at FROM webhooks WHERE organization_id = ? ORDER BY created_at DESC`,
    )
      .bind(orgId)
      .all<{ id: string; url: string; secret: string; events: string; form_id: string | null; active: number; created_at: number }>();
    return c.json(
      (rows.results ?? []).map((r) => ({
        id: r.id,
        url: r.url,
        events: JSON.parse(r.events) as string[],
        formId: r.form_id,
        active: r.active === 1,
        createdAt: r.created_at,
        // Never return the full signing secret on a list. It is shown exactly
        // once, at creation, the same way API keys are handled.
        secretPreview: `${r.secret.slice(0, 11)}…`,
      })),
    );
  },
);

webhooksRouter.post(
  "/webhooks",
  validator(
    "json",
    z.object({
      url: z.string().url().refine((u) => u.startsWith("https://") || u.startsWith("http://localhost")),
      events: z.array(z.enum(SUBSCRIBABLE_EVENTS)).min(1),
      formId: z.string().nullable().optional(),
    }),
  ),
  describeRoute({ tags: ["dashboard"], summary: "Create a webhook (secret returned once)", responses: { 200: { description: "Created", content: { "application/json": { schema: resolver(WebhookRow.extend({ secret: z.string() })) } } } } }),
  async (c) => {
    const orgId = c.get("orgId");
    if (!orgId) return c.json({ error: { code: "no_organization", message: "Create an organization first" } }, 403);
    const { url, events, formId } = c.req.valid("json");

    /**
     * Per-form ceiling, counted live rather than metered — a counter would drift the
     * moment a webhook is deleted. `formId: null` means an org-wide webhook, which is not
     * bounded per form; the plan's form limit already bounds how many of those matter.
     */
    if (formId) {
      const ent = await getEntitlements(c.env, orgId);
      const limit = ent.limits.webhooks_per_form;
      if (limit != null) {
        const used = await countWebhooks(c.env, formId);
        if (used >= limit) {
          return c.json(
            limitReached({ limitKey: "webhooks_per_form", plan: ent.planId, used, limit, context: { surface: "integrate.webhooks" } }),
            402,
          );
        }
      }
    }

    const id = `wh_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const secret = `whsec_${crypto.randomUUID().replace(/-/g, "")}`;
    await c.env.DB.prepare(
      `INSERT INTO webhooks (id, organization_id, form_id, url, secret, events, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    )
      .bind(id, orgId, formId ?? null, url, secret, JSON.stringify(events), Date.now())
      .run();
    return c.json({ id, url, events, formId: formId ?? null, active: true, createdAt: Date.now(), secret });
  },
);

webhooksRouter.delete(
  "/webhooks/:id",
  describeRoute({ tags: ["dashboard"], summary: "Delete a webhook", responses: { 200: { description: "Deleted", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } } } }),
  async (c) => {
    const orgId = c.get("orgId");
    const res = await c.env.DB.prepare(`DELETE FROM webhooks WHERE id = ? AND organization_id = ?`)
      .bind(c.req.param("id"), orgId ?? "")
      .run();
    if (!res.meta.changes) return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);
    return c.json({ ok: true });
  },
);

webhooksRouter.get(
  "/webhooks/:id/deliveries",
  describeRoute({ tags: ["dashboard"], summary: "Recent deliveries for a webhook", responses: { 200: { description: "Deliveries", content: { "application/json": { schema: resolver(z.array(z.any())) } } } } }),
  async (c) => {
    const id = c.req.param("id");
    const orgId = c.get("orgId");
    const rows = await c.env.DB.prepare(
      `SELECT d.id, d.event_type, d.status, d.response_status, d.last_error, d.attempt, d.created_at
         FROM webhook_deliveries d
         JOIN webhooks w ON w.id = d.webhook_id AND w.organization_id = ?
        WHERE d.webhook_id = ? ORDER BY d.created_at DESC LIMIT 25`,
    )
      .bind(orgId ?? "", id)
      .all();
    return c.json(rows.results ?? []);
  },
);

webhooksRouter.post(
  "/webhooks/:id/test",
  describeRoute({ tags: ["dashboard"], summary: "Send a signed test event", responses: { 200: { description: "Test sent", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), signature: z.string() })) } } } } }),
  async (c) => {
    const id = c.req.param("id");
    const orgId = c.get("orgId");
    const hook = await c.env.DB.prepare(`SELECT url, secret FROM webhooks WHERE id = ? AND organization_id = ?`)
      .bind(id, orgId ?? "")
      .first<{ url: string; secret: string }>();
    if (!hook) return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);
    const body = JSON.stringify({ event: "test", timestamp: Date.now(), formId: null });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await hmac(hook.secret, `${timestamp}.${body}`);
    let ok = false;
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-chatform-event": "test",
          "x-chatform-signature": `t=${timestamp}, v1=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      ok = res.status < 400;
    } catch {
      ok = false;
    }
    return c.json({ ok, signature: `t=${timestamp}, v1=${signature.slice(0, 16)}…` });
  },
);
