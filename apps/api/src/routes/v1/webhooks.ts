import { Hono } from "hono";
import { DeletedView, OkView, Paged, WebhookDeliveryView, WebhookQueueStatsView } from "../../lib/v1-schemas.js";
import { page } from "../../lib/api-page.js";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "../../lib/validator.js";
import { z } from "zod";
import { BAD_WEBHOOK_URL, deliverableUrl } from "../../lib/webhook-url.js";
import type { Bindings } from "../../env.js";
import { keyOwnsForm, type GuardVars } from "../../lib/guards.js";
import { requireScope, requireGauge, type AuthzVars } from "../../lib/authorize.js";
import { idempotent } from "../../lib/idempotency.js";
import { EVENT_ALIASES, listDeliveries, redeliver, retryAllFailed, webhookQueueStats } from "../../lib/webhooks.js";
import { audit } from "../../lib/gate-log.js";

/**
 * Webhook endpoints, manageable with an API key.
 *
 * The dashboard's own webhook routes are session-guarded, so a key could not
 * reach them — which made the `webhook:read` and `webhook:write` scopes describe
 * an ability no key actually had, and the SDK's webhook methods 401 on every
 * call. These are the same operations behind the scopes that were always meant
 * to gate them.
 */

export const webhooksV1Router = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

const KNOWN_EVENTS = Object.keys(EVENT_ALIASES);
/** Both namespaces, because a subscription may legitimately use either. */
const ACCEPTED_EVENTS = [...new Set([...KNOWN_EVENTS, ...Object.values(EVENT_ALIASES).flat()])];

const WebhookView = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.string()),
  formId: z.string().nullable(),
  active: z.boolean(),
  consecutiveFailures: z.number(),
  createdAt: z.number(),
  secretPreview: z.string(),
});

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  events: string;
  form_id: string | null;
  active: number;
  consecutive_failures: number;
  created_at: number;
}

function project(row: WebhookRow) {
  return {
    id: row.id,
    url: row.url,
    events: JSON.parse(row.events) as string[],
    formId: row.form_id,
    active: row.active === 1,
    consecutiveFailures: row.consecutive_failures ?? 0,
    createdAt: row.created_at,
    // The full signing secret is returned exactly once, at creation — the same
    // way an API key is.
    secretPreview: `${row.secret.slice(0, 11)}…`,
  };
}

const COLUMNS = `id, url, secret, events, form_id, active, consecutive_failures, created_at`;

webhooksV1Router.get(
  "/webhooks",
  requireScope("webhook", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "List webhook endpoints",
    responses: { 200: { description: "Endpoints", content: { "application/json": { schema: resolver(Paged(WebhookView)) } } } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const formId = c.req.query("formId");
    const rows = await c.env.DB.prepare(
      `SELECT ${COLUMNS} FROM webhooks WHERE organization_id = ?
        ${formId ? "AND (form_id = ? OR form_id IS NULL)" : ""}
        ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(...(formId ? [orgId, formId] : [orgId]))
      .all<WebhookRow>();
    return c.json(page((rows.results ?? []).map(project)));
  },
);

webhooksV1Router.get(
  "/webhooks/stats",
  requireScope("webhook", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "Delivery queue status: pending, failed and delivered in the last 24 hours, per endpoint",
    responses: { 200: { description: "Counts", content: { "application/json": { schema: resolver(WebhookQueueStatsView) } } } },
  }),
  async (c) => c.json(await webhookQueueStats(c.env, c.get("orgId")!, c.req.query("formId") ?? null)),
);

webhooksV1Router.patch(
  "/webhooks/:id",
  requireScope("webhook", "write"),
  validator("json", z.object({ active: z.boolean() })),
  describeRoute({
    tags: ["v1"],
    summary: "Turn an endpoint on or off. Turning it on clears its failure count",
    responses: {
      200: { description: "Updated", content: { "application/json": { schema: resolver(WebhookView) } } },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const id = c.req.param("id");
    const { active } = c.req.valid("json");
    const res = await c.env.DB.prepare(
      `UPDATE webhooks SET active = ?, consecutive_failures = CASE WHEN ? = 1 THEN 0 ELSE consecutive_failures END
        WHERE id = ? AND organization_id = ?`,
    )
      .bind(active ? 1 : 0, active ? 1 : 0, id, orgId)
      .run();
    if ((res.meta?.changes ?? 0) === 0) return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);
    await audit(c.env, {
      orgId,
      actorType: "api_key",
      actorId: c.get("keyId") ?? null,
      action: "webhook.update",
      resourceType: "webhook",
      resourceId: id,
      meta: { active },
    });
    const row = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM webhooks WHERE id = ?`).bind(id).first<WebhookRow>();
    return c.json(project(row!));
  },
);

webhooksV1Router.post(
  "/webhooks",
  requireScope("webhook", "write"),
  idempotent("POST /v1/webhooks"),
  validator(
    "json",
    z.object({
      // Shape only; the address rule lives in `webhookUrlSchema`.
      url: z.string().url().max(2000),
      events: z.array(z.string()).min(1).max(20),
      /** Omit to receive events for every form in the organization. */
      formId: z.string().max(64).optional(),
    }),
  ),
  describeRoute({
    tags: ["v1"],
    summary: "Create a webhook endpoint. The signing secret is returned ONCE",
    responses: {
      201: { description: "Created, with the signing secret", content: { "application/json": { schema: resolver(WebhookView) } } },
      404: { description: "Form not found" },
      422: { description: "Unknown event name" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const body = c.req.valid("json");

    // The rule its dashboard twin has always had. This route accepted any
    // scheme and any host, so a URL the dashboard refused could be created
    // here and then delivered to — `http://10.0.0.1/` included.
    if (!deliverableUrl(c.env, body.url)) return c.json(BAD_WEBHOOK_URL, 400);

    if (body.formId && !keyOwnsForm(c, body.formId)) {
      return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    }

    /**
     * An unknown event name is refused rather than stored.
     *
     * Silently accepting one means an endpoint that never fires and a customer
     * who cannot tell why — the single most common webhook support question.
     */
    const unknown = body.events.filter((e) => !ACCEPTED_EVENTS.includes(e));
    if (unknown.length > 0) {
      return c.json(
        {
          error: {
            code: "unknown_event",
            message: `Not an event we send: ${unknown.join(", ")}`,
            issues: unknown.map((e) => ({ code: "unknown_event", message: e })),
            known: KNOWN_EVENTS,
          },
        },
        422,
      );
    }

    if (body.formId) {
      const owned = await c.env.DB.prepare(
        `SELECT id FROM forms WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
      )
        .bind(body.formId, orgId)
        .first();
      if (!owned) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    }

    const id = `wh_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const secret = `whsec_${crypto.randomUUID().replace(/-/g, "")}`;
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO webhooks (id, organization_id, form_id, url, secret, events, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    )
      .bind(id, orgId, body.formId ?? null, body.url, secret, JSON.stringify(body.events), now)
      .run();

    await audit(c.env, {
      orgId,
      actorType: "api_key",
      actorId: c.get("keyId") ?? null,
      action: "webhook.create",
      resourceType: "webhook",
      resourceId: id,
      meta: { url: body.url, events: body.events },
    });

    return c.json(
      {
        id,
        url: body.url,
        events: body.events,
        formId: body.formId ?? null,
        active: true,
        consecutiveFailures: 0,
        createdAt: now,
        secretPreview: `${secret.slice(0, 11)}…`,
        /** Shown once. Store it now — it is not retrievable. */
        secret,
      },
      201,
    );
  },
);

webhooksV1Router.delete(
  "/webhooks/:id",
  requireScope("webhook", "write"),
  describeRoute({
    tags: ["v1"],
    summary: "Delete a webhook endpoint",
    responses: {
      200: { description: "Deleted", content: { "application/json": { schema: resolver(DeletedView) } } },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const id = c.req.param("id");
    const res = await c.env.DB.prepare(`DELETE FROM webhooks WHERE id = ? AND organization_id = ?`)
      .bind(id, orgId)
      .run();
    if ((res.meta?.changes ?? 0) === 0) {
      return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);
    }
    await audit(c.env, {
      orgId,
      actorType: "api_key",
      actorId: c.get("keyId") ?? null,
      action: "webhook.delete",
      resourceType: "webhook",
      resourceId: id,
    });
    return c.json({ ok: true, deleted: true });
  },
);

webhooksV1Router.get(
  "/webhooks/:id/deliveries",
  requireScope("webhook", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "Recent deliveries with every attempt, for working out why an endpoint is quiet. Filter with ?status=pending|failed|success",
    responses: {
      200: { description: "Deliveries", content: { "application/json": { schema: resolver(Paged(WebhookDeliveryView)) } } },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const id = c.req.param("id");
    const status = c.req.query("status");
    const rows = await listDeliveries(c.env, orgId, id, {
      status: status === "pending" || status === "failed" || status === "success" ? status : undefined,
      limit: 50,
    });
    if (!rows) return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);
    return c.json(page(rows));
  },
);

/**
 * Send one delivery again, now.
 *
 * Automatic retries give up after about ten hours; after a deploy that fixed
 * the endpoint, the failed list is the recovery path. A failed delivery gets a
 * fresh round of retries; a delivered one is sent again as a copy.
 */
webhooksV1Router.post(
  "/webhooks/:id/deliveries/:deliveryId/replay",
  requireScope("webhook", "write"),
  describeRoute({
    tags: ["v1"],
    summary: "Replay one delivery",
    responses: {
      200: { description: "Queued", content: { "application/json": { schema: resolver(OkView) } } },
      404: { description: "Not found" },
      422: { description: "Nothing to replay" },
    },
  }),
  async (c) => {
    const result = await redeliver(c.env, c.get("orgId")!, c.req.param("id"), c.req.param("deliveryId"));
    if (result === "not_found") return c.json({ error: { code: "not_found", message: "Delivery not found" } }, 404);
    if (result === "not_replayable") {
      return c.json({ error: { code: "not_replayable", message: "A test send cannot be replayed." } }, 422);
    }
    return c.json({ ok: true, queued: true });
  },
);

webhooksV1Router.post(
  "/webhooks/:id/retry-failed",
  requireScope("webhook", "write"),
  describeRoute({
    tags: ["v1"],
    summary: "Send every failed delivery of an endpoint again (up to 500)",
    responses: {
      200: { description: "Queued", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), queued: z.number() })) } } },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const owned = await c.env.DB.prepare(`SELECT id FROM webhooks WHERE id = ? AND organization_id = ?`)
      .bind(c.req.param("id"), orgId)
      .first();
    if (!owned) return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);
    return c.json({ ok: true, queued: await retryAllFailed(c.env, orgId, c.req.param("id")) });
  },
);

export { requireGauge };
