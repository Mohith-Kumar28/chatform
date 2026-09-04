import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import { keyOwnsForm, type GuardVars } from "../../lib/guards.js";
import { requireScope, requireGauge, type AuthzVars } from "../../lib/authorize.js";
import { idempotent } from "../../lib/idempotency.js";
import { EVENT_ALIASES } from "../../lib/webhooks.js";
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
    responses: { 200: { description: "Endpoints", content: { "application/json": { schema: resolver(z.array(WebhookView)) } } } },
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
    return c.json((rows.results ?? []).map(project));
  },
);

webhooksV1Router.post(
  "/webhooks",
  requireScope("webhook", "write"),
  idempotent("POST /v1/webhooks"),
  validator(
    "json",
    z.object({
      url: z.string().url().max(2000),
      events: z.array(z.string()).min(1).max(20),
      /** Omit to receive events for every form in the organization. */
      formId: z.string().max(64).optional(),
    }),
  ),
  describeRoute({
    tags: ["v1"],
    summary: "Create a webhook endpoint — the signing secret is returned ONCE",
    responses: {
      201: { description: "Created" },
      404: { description: "Form not found" },
      422: { description: "Unknown event name" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const body = c.req.valid("json");

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
    responses: { 200: { description: "Deleted" }, 404: { description: "Not found" } },
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
    summary: "Recent delivery attempts, for working out why an endpoint is quiet",
    responses: { 200: { description: "Deliveries" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const id = c.req.param("id");
    const owned = await c.env.DB.prepare(`SELECT id FROM webhooks WHERE id = ? AND organization_id = ?`)
      .bind(id, orgId)
      .first();
    if (!owned) return c.json({ error: { code: "not_found", message: "Webhook not found" } }, 404);

    const rows = await c.env.DB.prepare(
      `SELECT id, event_type, attempt, status, response_status, last_error, next_retry_at, created_at
         FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
      .bind(id)
      .all();
    return c.json({ data: rows.results ?? [] });
  },
);

/**
 * Send the last failed delivery again, now.
 *
 * The retry schedule runs out at two hours; after a deploy that fixed the
 * endpoint, waiting for a sweep that will never come again is not a recovery
 * path.
 */
webhooksV1Router.post(
  "/webhooks/:id/deliveries/:deliveryId/replay",
  requireScope("webhook", "write"),
  describeRoute({
    tags: ["v1"],
    summary: "Replay one delivery",
    responses: { 200: { description: "Queued" }, 404: { description: "Not found" }, 422: { description: "Nothing to replay" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const row = await c.env.DB.prepare(
      `SELECT d.message_json FROM webhook_deliveries d
         JOIN webhooks w ON w.id = d.webhook_id
        WHERE d.id = ? AND d.webhook_id = ? AND w.organization_id = ?`,
    )
      .bind(c.req.param("deliveryId"), c.req.param("id"), orgId)
      .first<{ message_json: string | null }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Delivery not found" } }, 404);
    if (!row.message_json) {
      // Deliveries from before the message was stored cannot be replayed
      // honestly — the event would have to be guessed at.
      return c.json(
        { error: { code: "not_replayable", message: "This delivery predates replay support." } },
        422,
      );
    }
    await c.env.Q_WEBHOOKS.send({ ...JSON.parse(row.message_json), attempt: 0 });
    return c.json({ ok: true, queued: true });
  },
);

export { requireGauge };
