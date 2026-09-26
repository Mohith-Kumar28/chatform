import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "../lib/validator.js";
import { z } from "zod";
import { BAD_WEBHOOK_URL, deliverableUrl } from "../lib/webhook-url.js";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, assertFormAccess, type GuardVars } from "../lib/guards.js";
import {
  EVENT_ALIASES,
  listDeliveries,
  redeliver,
  retryAllFailed,
  sendSigned,
  webhookQueueStats,
} from "../lib/webhooks.js";
import { requirePermission, assertPermission, type AuthzVars } from "../lib/authorize.js";
import { accessFor, workspaceFilter } from "../lib/workspace-access.js";
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
webhooksRouter.patch("/webhooks/:id", requirePermission("webhook", "update"));
webhooksRouter.post("/webhooks/:id/*", requirePermission("webhook", "update"));
webhooksRouter.get("/webhooks/*", requirePermission("webhook", "read"));

type WebhookCtx = Parameters<typeof assertFormAccess>[0] & Parameters<typeof assertPermission>[0];

/**
 * Where a webhook sits decides who may touch it.
 *
 * A form's webhook belongs to that form's workspace, so it is judged there, and
 * a form id from another organization (or a workspace the caller was not added
 * to) is not found. An organization-wide webhook (`formId: null`) fires for
 * every form in every workspace, which makes it an admin's.
 */
async function webhookScope(
  c: WebhookCtx,
  formId: string | null,
  action: "create" | "read" | "update" | "delete",
): Promise<Response | null> {
  const access = await accessFor(c as never);
  if (!formId) {
    if (access.admin) return null;
    return c.json({ error: { code: "forbidden", message: "Only admins manage organization-wide webhooks" } }, 403);
  }
  const form = await assertFormAccess(c, formId);
  if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
  if (access.admin) return null;
  return assertPermission(c, "webhook", action, { workspaceId: form.workspace_id });
}

/** The same judgement for a webhook that already exists, by its id. */
const WEBHOOK_ACTION: Record<string, "read" | "update" | "delete"> = { GET: "read", PATCH: "update", POST: "update", DELETE: "delete" };
async function existingWebhookScope(c: WebhookCtx, next: () => Promise<void>) {
  const id = c.req.param("id");
  if (!id || id === "stats") return next();
  const row = await c.env.DB.prepare(`SELECT form_id FROM webhooks WHERE id = ? AND organization_id = ?`)
    .bind(id, c.get("orgId") ?? "")
    .first<{ form_id: string | null }>();
  if (!row) return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);
  const denied = await webhookScope(c, row.form_id, WEBHOOK_ACTION[c.req.method] ?? "update");
  if (denied) return denied;
  return next();
}
webhooksRouter.use("/webhooks/:id", existingWebhookScope);
webhooksRouter.use("/webhooks/:id/*", existingWebhookScope);

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
    // A member sees the webhooks on forms in their workspaces, and not the
    // organization-wide ones, which are an admin's.
    const access = await accessFor(c as never);
    const filter = workspaceFilter(access, "f.workspace_id");
    const rows = await c.env.DB.prepare(
      access.admin
        ? `SELECT id, url, secret, events, form_id, active, created_at FROM webhooks WHERE organization_id = ? ORDER BY created_at DESC`
        : `SELECT w.id, w.url, w.secret, w.events, w.form_id, w.active, w.created_at
             FROM webhooks w JOIN forms f ON f.id = w.form_id
            WHERE w.organization_id = ?${filter.sql} ORDER BY w.created_at DESC`,
    )
      .bind(orgId, ...filter.binds)
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
      // Shape only here; `webhookUrlSchema` decides whether the address is
      // one we may deliver to, because that answer depends on the environment.
      url: z.string().url().max(2000),
      events: z.array(z.enum(SUBSCRIBABLE_EVENTS)).min(1),
      formId: z.string().nullable().optional(),
    }),
  ),
  describeRoute({ tags: ["dashboard"], summary: "Create a webhook (secret returned once)", responses: { 200: { description: "Created", content: { "application/json": { schema: resolver(WebhookRow.extend({ secret: z.string() })) } } } } }),
  async (c) => {
    const orgId = c.get("orgId");
    if (!orgId) return c.json({ error: { code: "no_organization", message: "Create an organization first" } }, 403);
    const { url, events, formId } = c.req.valid("json");
    if (!deliverableUrl(c.env, url)) return c.json(BAD_WEBHOOK_URL, 400);
    // Also the check that `formId` is this organization's at all, which this
    // route used to skip: `/v1` checked it, the dashboard wrote whatever it got.
    const denied = await webhookScope(c, formId ?? null, "create");
    if (denied) return denied;

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

const QueueCounts = z.object({
  pending: z.number(),
  failed: z.number(),
  delivered24h: z.number(),
  lastDeliveredAt: z.number().nullable(),
});
const QueueStats = z.object({
  total: QueueCounts,
  endpoints: z.array(QueueCounts.extend({ webhookId: z.string() })),
});

webhooksRouter.get(
  "/webhooks/stats",
  describeRoute({ tags: ["dashboard"], summary: "Delivery queue status: pending, failed, delivered in 24h", responses: { 200: { description: "Counts", content: { "application/json": { schema: resolver(QueueStats) } } } } }),
  async (c) => {
    const orgId = c.get("orgId");
    if (!orgId) return c.json({ total: { pending: 0, failed: 0, delivered24h: 0, lastDeliveredAt: null }, endpoints: [] });
    const formId = c.req.query("formId") ?? null;
    const denied = await webhookScope(c, formId, "read");
    if (denied) return denied;
    return c.json(await webhookQueueStats(c.env, orgId, formId));
  },
);

webhooksRouter.patch(
  "/webhooks/:id",
  validator("json", z.object({ active: z.boolean() })),
  describeRoute({ tags: ["dashboard"], summary: "Turn a webhook on or off", responses: { 200: { description: "Updated", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), active: z.boolean() })) } } } } }),
  async (c) => {
    const orgId = c.get("orgId");
    const { active } = c.req.valid("json");
    // Back on means a clean slate: the old failures are why it was off.
    const res = await c.env.DB.prepare(
      `UPDATE webhooks SET active = ?, consecutive_failures = CASE WHEN ? = 1 THEN 0 ELSE consecutive_failures END
        WHERE id = ? AND organization_id = ?`,
    )
      .bind(active ? 1 : 0, active ? 1 : 0, c.req.param("id"), orgId ?? "")
      .run();
    if (!res.meta.changes) return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);
    return c.json({ ok: true, active });
  },
);

webhooksRouter.get(
  "/webhooks/:id/deliveries",
  describeRoute({ tags: ["dashboard"], summary: "Recent deliveries for a webhook, with every attempt", responses: { 200: { description: "Deliveries", content: { "application/json": { schema: resolver(z.array(z.any())) } } } } }),
  async (c) => {
    const status = c.req.query("status");
    const rows = await listDeliveries(c.env, c.get("orgId") ?? "", c.req.param("id"), {
      status: status === "pending" || status === "failed" || status === "success" ? status : undefined,
      limit: 25,
      withPayload: true,
    });
    if (!rows) return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);
    return c.json(rows);
  },
);

webhooksRouter.post(
  "/webhooks/:id/deliveries/:deliveryId/retry",
  describeRoute({ tags: ["dashboard"], summary: "Send one delivery again, now", responses: { 200: { description: "Queued", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), queued: z.boolean() })) } } } } }),
  async (c) => {
    const result = await redeliver(c.env, c.get("orgId") ?? "", c.req.param("id"), c.req.param("deliveryId"));
    if (result === "not_found") return c.json({ error: { code: "not_found", message: "Delivery not found" } }, 404);
    if (result === "not_replayable") {
      return c.json({ error: { code: "not_replayable", message: "A test send cannot be retried. Use Test connection." } }, 422);
    }
    return c.json({ ok: true, queued: true });
  },
);

webhooksRouter.post(
  "/webhooks/:id/retry-failed",
  describeRoute({ tags: ["dashboard"], summary: "Send every failed delivery again", responses: { 200: { description: "Queued", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), queued: z.number() })) } } } } }),
  async (c) => {
    const queued = await retryAllFailed(c.env, c.get("orgId") ?? "", c.req.param("id"));
    return c.json({ ok: true, queued });
  },
);

webhooksRouter.post(
  "/webhooks/:id/test",
  describeRoute({ tags: ["dashboard"], summary: "Send a signed test event", responses: { 200: { description: "Test sent", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), status: z.number().nullable(), error: z.string().nullable(), signature: z.string() })) } } } } }),
  async (c) => {
    const id = c.req.param("id");
    const orgId = c.get("orgId");
    const hook = await c.env.DB.prepare(`SELECT url, secret FROM webhooks WHERE id = ? AND organization_id = ?`)
      .bind(id, orgId ?? "")
      .first<{ url: string; secret: string }>();
    if (!hook) return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);
    const eventId = `evt_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const deliveryId = `whd_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const body = JSON.stringify({ id: eventId, event: "test", timestamp: Date.now(), formId: null });
    // The same signed request a real delivery makes, headers and all.
    const result = await sendSigned(hook, { eventId, deliveryId, eventType: "test", body });
    /**
     * Logged like any delivery, so the endpoint's history shows the test. It
     * is never retried and never counted in the queue status.
     */
    const now = Date.now();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO webhook_deliveries (id, webhook_id, event_id, event_type, payload, message_json, attempt, status, response_status, last_error, delivered_at, created_at, updated_at)
         VALUES (?, ?, ?, 'test', ?, NULL, 1, ?, ?, ?, ?, ?, ?)`,
      ).bind(deliveryId, id, eventId, body, result.ok ? "success" : "dead", result.status, result.error, result.ok ? now : null, now, now),
      c.env.DB.prepare(
        `INSERT INTO webhook_attempts (id, delivery_id, attempt, response_status, error, response_body, duration_ms, created_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      ).bind(`wha_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, deliveryId, result.status, result.error, result.responseBody, result.durationMs, now),
    ]);
    return c.json({
      ok: result.ok,
      status: result.status,
      // Only when nothing answered; a status code already says what went wrong.
      error: result.status == null ? result.error : null,
      signature: "v1 (Standard Webhooks) and x-chatform-signature",
    });
  },
);
