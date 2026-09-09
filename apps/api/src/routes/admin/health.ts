import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import { DAY_MS, OpsRows, RANGES, RangeQuery, rows, type RangeKey } from "./shared.js";

/**
 * Whether the machinery around the product is actually working.
 *
 * Everything here is a promise the product makes to somebody outside it: a
 * webhook it said it would deliver, an email it said it would send, a
 * spreadsheet feed it said it would keep filled, a billing event it said it
 * processed. Each has its own table with a status column, and none of them was
 * being looked at — a webhook endpoint that has been failing for a week is
 * invisible to us and extremely visible to the customer whose CRM stopped
 * filling up.
 *
 * Deliverability gets its own panel because it is the one that damages *other*
 * customers: a bounce rate above a few percent burns the sending domain, and
 * the first symptom is somebody else's password reset landing in spam.
 */

export const healthRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

const HealthResponse = z.object({
  webhooks: z.object({
    delivered: z.number(),
    failed: z.number(),
    pending: z.number(),
    successRate: z.number(),
    endpointsFailing: z.number(),
    byStatusCode: z.array(z.object({ key: z.string(), value: z.number() })),
    worst: OpsRows,
  }),
  billing: z.object({ byStatus: z.array(z.object({ key: z.string(), value: z.number() })), stuck: OpsRows }),
  integrations: z.object({ byStatus: OpsRows, failing: OpsRows }),
  email: z.object({
    followupsByStatus: z.array(z.object({ key: z.string(), value: z.number() })),
    suppressionsByReason: z.array(z.object({ key: z.string(), value: z.number() })),
    sent: z.number(),
    complaintRate: z.number(),
  }),
  /**
   * The queue everything transactional shares.
   *
   * `email` above is about deliverability — who we stopped mailing, and what
   * happened to one scheduled nudge. This is about whether the pipe works at
   * all: sign-in codes, password resets, invitations, notifications and
   * auto-replies go through one queue, and until this table existed the only
   * record of any of them was a line in the worker log.
   */
  mail: z.object({
    jobs: z.number(),
    messages: z.number(),
    failed: z.number(),
    /** Failures at the queue's retry ceiling — these are in the dead-letter queue. */
    gaveUp: z.number(),
    deliveryRate: z.number(),
    byKind: OpsRows,
    recentFailures: OpsRows,
  }),
  exports: z.array(z.object({ key: z.string(), value: z.number() })),
  sessions: z.object({
    byStatus: z.array(z.object({ key: z.string(), value: z.number() })),
    stale: z.number(),
  }),
  storage: z.object({ files: z.number(), bytes: z.number(), rejected: z.number() }),
});

/**
 * The email queue's `max_retries` from `wrangler.jsonc`.
 *
 * A failure recorded at this attempt number is a job the queue has given up on
 * and moved to the dead-letter queue — a message that will never arrive. Kept
 * beside the query that reads it because the two have to move together: raise
 * the ceiling in the config alone and this silently stops counting anything.
 */
const MAIL_RETRY_CEILING = 5;

const counted = (list: { key: string | null; value: number }[]) =>
  list.map((r) => ({ key: r.key ?? "unknown", value: r.value }));

healthRouter.get(
  "/admin/health",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "Webhooks, billing events, integrations, email deliverability, storage",
    responses: {
      200: { description: "System health", content: { "application/json": { schema: resolver(HealthResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range as RangeKey;
    const since = Date.now() - RANGES[range] * DAY_MS;

    const [
      wh,
      whCodes,
      whWorst,
      whEndpoints,
      billing,
      stuck,
      integrationStatus,
      integrationsFailing,
      followups,
      suppressions,
      emailsSent,
      exportRows,
      sessions,
      staleSessions,
      storage,
      mailTotals,
      mailByKind,
      mailFailures,
    ] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered,
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending
           FROM webhook_deliveries WHERE created_at >= ?`,
      )
        .bind(since)
        .first<{ delivered: number; failed: number; pending: number }>(),
      rows<{ key: string | null; value: number }>(
        c.env.DB.prepare(
          `SELECT CAST(response_status AS TEXT) AS key, COUNT(*) AS value
             FROM webhook_deliveries
            WHERE created_at >= ? AND response_status IS NOT NULL
            GROUP BY response_status ORDER BY value DESC LIMIT 10`,
        ).bind(since),
      ),
      rows(
        c.env.DB.prepare(
          `SELECT w.id, w.url, w.consecutive_failures, w.organization_id AS org_id, o.name,
                  (SELECT d.last_error FROM webhook_deliveries d WHERE d.webhook_id = w.id
                    ORDER BY d.created_at DESC LIMIT 1) AS last_error,
                  (SELECT d.response_status FROM webhook_deliveries d WHERE d.webhook_id = w.id
                    ORDER BY d.created_at DESC LIMIT 1) AS last_status
             FROM webhooks w JOIN organizations o ON o.id = w.organization_id
            WHERE w.consecutive_failures > 0
            ORDER BY w.consecutive_failures DESC LIMIT 25`,
        ),
      ),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM webhooks WHERE active = 1 AND consecutive_failures >= 3`,
      ).first<{ n: number }>(),
      rows<{ key: string | null; value: number }>(
        c.env.DB.prepare(`SELECT status AS key, COUNT(*) AS value FROM dodo_events GROUP BY status`),
      ),
      rows(
        c.env.DB.prepare(
          `SELECT id, dodo_event_id, type, status, error, created_at FROM dodo_events
            WHERE status != 'processed' ORDER BY created_at DESC LIMIT 25`,
        ),
      ),
      rows(
        c.env.DB.prepare(
          `SELECT provider, status, COUNT(*) AS n FROM integrations GROUP BY provider, status ORDER BY n DESC`,
        ),
      ),
      rows(
        c.env.DB.prepare(
          `SELECT i.id, i.provider, i.status, i.last_error, i.organization_id AS org_id, o.name, i.updated_at
             FROM integrations i JOIN organizations o ON o.id = i.organization_id
            WHERE i.status != 'connected' ORDER BY i.updated_at DESC LIMIT 25`,
        ),
      ),
      rows<{ key: string | null; value: number }>(
        c.env.DB.prepare(
          `SELECT status AS key, COUNT(*) AS value FROM followups WHERE created_at >= ? GROUP BY status`,
        ).bind(since),
      ),
      rows<{ key: string | null; value: number }>(
        c.env.DB.prepare(`SELECT reason AS key, COUNT(*) AS value FROM email_suppressions GROUP BY reason`),
      ),
      c.env.DB.prepare(
        `SELECT COALESCE(SUM(used), 0) AS n FROM usage_counters WHERE metric = 'emails_sent'`,
      ).first<{ n: number }>(),
      rows<{ key: string | null; value: number }>(
        c.env.DB.prepare(`SELECT status AS key, COUNT(*) AS value FROM exports GROUP BY status`),
      ),
      rows<{ key: string | null; value: number }>(
        c.env.DB.prepare(
          `SELECT status AS key, COUNT(*) AS value FROM chat_sessions
            WHERE created_at >= ? AND is_test = 0 GROUP BY status`,
        ).bind(since),
      ),
      /**
       * Sessions still marked active long after anyone could plausibly be in
       * them. The Durable Object's idle alarm is supposed to close these, so a
       * growing number here means alarms are not firing — a failure that is
       * otherwise completely silent.
       */
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM chat_sessions WHERE status = 'active' AND last_activity_at < ?`,
      )
        .bind(Date.now() - 2 * DAY_MS)
        .first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes,
                COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected
           FROM files`,
      ).first<{ files: number; bytes: number; rejected: number }>(),
      /**
       * `MAIL_RETRY_CEILING` is the queue's `max_retries` from `wrangler.jsonc`.
       * A failure at it is a job the queue has given up on and moved to the
       * dead-letter queue — a message that will never arrive, as opposed to one
       * that failed once and went out on the retry.
       */
      c.env.DB.prepare(
        `SELECT COUNT(*) AS jobs,
                COALESCE(SUM(messages), 0) AS messages,
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
                COALESCE(SUM(CASE WHEN status = 'failed' AND attempt >= ?2 THEN 1 ELSE 0 END), 0) AS gave_up
           FROM mail_deliveries WHERE created_at >= ?1`,
      )
        .bind(since, MAIL_RETRY_CEILING)
        .first<{ jobs: number; messages: number; failed: number; gave_up: number }>(),
      rows(
        c.env.DB.prepare(
          `SELECT kind,
                  COUNT(*) AS jobs,
                  COALESCE(SUM(messages), 0) AS messages,
                  COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
             FROM mail_deliveries WHERE created_at >= ?
            GROUP BY kind ORDER BY jobs DESC`,
        ).bind(since),
      ),
      /**
       * The domain, never the address — the column does not exist. Enough to
       * see that one provider is rejecting us, and nothing that puts a
       * customer's or a respondent's address on a cross-tenant screen.
       */
      rows(
        c.env.DB.prepare(
          `SELECT kind, domain, attempt, error, created_at
             FROM mail_deliveries WHERE status = 'failed' AND created_at >= ?
            ORDER BY created_at DESC LIMIT 12`,
        ).bind(since),
      ),
    ]);

    const delivered = wh?.delivered ?? 0;
    const failed = wh?.failed ?? 0;
    const attempted = delivered + failed;

    const suppressionList = counted(suppressions);
    const burning = suppressionList
      .filter((s) => s.key === "bounce" || s.key === "complaint")
      .reduce((n, s) => n + s.value, 0);
    const sent = emailsSent?.n ?? 0;

    return c.json({
      webhooks: {
        delivered,
        failed,
        pending: wh?.pending ?? 0,
        successRate: attempted > 0 ? Math.round((delivered / attempted) * 1000) / 10 : 100,
        endpointsFailing: whEndpoints?.n ?? 0,
        byStatusCode: counted(whCodes),
        worst: whWorst,
      },
      billing: { byStatus: counted(billing), stuck },
      integrations: { byStatus: integrationStatus, failing: integrationsFailing },
      email: {
        followupsByStatus: counted(followups),
        suppressionsByReason: suppressionList,
        sent,
        // Bounces and complaints against everything ever sent. Above ~2% and the
        // sending domain is in trouble.
        complaintRate: sent > 0 ? Math.round((burning / sent) * 10000) / 100 : 0,
      },
      mail: {
        jobs: mailTotals?.jobs ?? 0,
        messages: mailTotals?.messages ?? 0,
        failed: mailTotals?.failed ?? 0,
        gaveUp: mailTotals?.gave_up ?? 0,
        // Jobs that ended in a send, against every job the consumer handled. A
        // retry that succeeds counts as one of each, which is honest: the
        // message arrived, and something went wrong on the way.
        deliveryRate:
          (mailTotals?.jobs ?? 0) > 0
            ? Math.round(((mailTotals!.jobs - mailTotals!.failed) / mailTotals!.jobs) * 1000) / 10
            : 100,
        byKind: mailByKind,
        recentFailures: mailFailures,
      },
      exports: counted(exportRows),
      sessions: { byStatus: counted(sessions), stale: staleSessions?.n ?? 0 },
      storage: { files: storage?.files ?? 0, bytes: storage?.bytes ?? 0, rejected: storage?.rejected ?? 0 },
    });
  },
);

/**
 * People, as opposed to accounts.
 *
 * The accounts explorer answers "which organization", and most of the time that
 * is the right unit. This one exists for the times a support request arrives
 * from an email address and the question is simply: who is this, when did they
 * last sign in, and which organizations can they see.
 */
healthRouter.get(
  "/admin/users",
  validator(
    "query",
    z.object({
      q: z.string().max(120).optional(),
      sort: z.enum(["created", "last_seen", "orgs"]).default("created"),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  ),
  describeRoute({
    tags: ["admin"],
    summary: "Every person, their organizations and their last sign-in",
    responses: {
      200: {
        description: "Users",
        content: {
          "application/json": {
            schema: resolver(z.object({ users: OpsRows, total: z.number(), limit: z.number(), offset: z.number() })),
          },
        },
      },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const { q, sort, limit, offset } = c.req.valid("query");
    const order = { created: "u.created_at DESC", last_seen: "last_seen_at DESC", orgs: "orgs DESC" }[sort];

    const list = await rows(
      c.env.DB.prepare(
        `SELECT u.id, u.name, u.email, u.email_verified, u.created_at,
                (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at,
                (SELECT COUNT(*) FROM members m WHERE m.user_id = u.id) AS orgs,
                (SELECT GROUP_CONCAT(o.name, ', ') FROM members m JOIN organizations o ON o.id = m.organization_id
                  WHERE m.user_id = u.id) AS org_names,
                /* How they get in. A person can have both, so this is a list. */
                (SELECT GROUP_CONCAT(DISTINCT a.provider_id) FROM accounts a WHERE a.user_id = u.id) AS providers
           FROM users u
          WHERE (?1 IS NULL OR u.email LIKE ?1 OR u.name LIKE ?1)
          ORDER BY ${order}
          LIMIT ?2 OFFSET ?3`,
      ).bind(q ? `%${q}%` : null, limit, offset),
    );

    const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>();
    return c.json({ users: list, total: total?.n ?? 0, limit, offset });
  },
);
