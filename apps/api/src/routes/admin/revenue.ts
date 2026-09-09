import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import {
  DAY_MS,
  MRR_CENTS,
  NOT_COMPED,
  OpsRows,
  RANGES,
  RangeQuery,
  dayKeys,
  loadMetrics,
  rows,
  seriesOf,
  type RangeKey,
} from "./shared.js";

/**
 * The money, and what moves it.
 *
 * Two things on this page are worth more than the revenue chart itself.
 *
 * The **upgrade funnel** reads `feature_access_log`, which records every time an
 * organization reached for something its plan does not include and whether it
 * subsequently bought. That is not a guess about what people would pay for; it
 * is a list of the moments they tried. It is the single best input to both
 * pricing and the roadmap, and it already existed with nothing reading it.
 *
 * The **dunning board** is the other: subscriptions in grace, cancelling at
 * period end, or already gone, with the revenue attached to each. Churn is
 * cheapest to fix before it completes.
 */

export const revenueRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

const RevenueResponse = z.object({
  days: z.array(z.string()),
  mrrSeries: z.array(z.number()),
  payingSeries: z.array(z.number()),
  mrrByPlan: z.array(z.object({ plan: z.string(), orgs: z.number(), mrrCents: z.number() })),
  totals: z.object({
    mrrCents: z.number(),
    arrCents: z.number(),
    payingOrgs: z.number(),
    arpaCents: z.number(),
    trialing: z.number(),
    atRiskCents: z.number(),
    collectedCents: z.number(),
    failedCents: z.number(),
    refundedCents: z.number(),
  }),
  paymentsSeries: z.array(z.object({ date: z.string(), succeeded: z.number(), failed: z.number() })),
  statusBoard: z.array(z.object({ status: z.string(), orgs: z.number(), mrrCents: z.number() })),
  upgradeFunnel: z.array(
    z.object({
      feature: z.string(),
      orgs: z.number(),
      denials: z.number(),
      converted: z.number(),
      conversion: z.number(),
      topSurface: z.string().nullable(),
    }),
  ),
  cancellations: OpsRows,
  comped: OpsRows,
  recentPayments: OpsRows,
});

revenueRouter.get(
  "/admin/revenue",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "MRR, payments, churn risk, and which paywall converts",
    responses: {
      200: { description: "Revenue", content: { "application/json": { schema: resolver(RevenueResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range as RangeKey;
    const days = RANGES[range];
    const window = dayKeys(days);
    const since = Date.now() - days * DAY_MS;
    const now = Date.now();

    const metrics = await loadMetrics(c.env, window[0]!, window[window.length - 1]!);
    const mrrSeries = seriesOf(metrics, "mrr_cents", window);
    const payingSeries = seriesOf(metrics, "paying_orgs", window);

    const [byPlan, statusBoard, payments, paymentDays, funnel, cancellations, comped, recentPayments, atRisk] =
      await Promise.all([
        rows<{ plan: string; orgs: number; mrr: number }>(
          c.env.DB.prepare(
            `SELECT p.id AS plan, COUNT(*) AS orgs, COALESCE(SUM(${MRR_CENTS}), 0) AS mrr
               FROM subscriptions s JOIN plans p ON p.id = s.plan_id
              WHERE s.status IN ('active','trialing') AND ${NOT_COMPED}
              GROUP BY p.id ORDER BY mrr DESC`,
          ),
        ),
        /**
         * Every subscription state, with the revenue standing behind it — which
         * is what turns a status count into a priority. Ten cancelling Free
         * trials and one cancelling Business account are not the same row.
         */
        rows<{ status: string; orgs: number; mrr: number }>(
          c.env.DB.prepare(
            `SELECT CASE
                      WHEN s.cancel_at_period_end = 1 AND s.status = 'active' THEN 'cancelling'
                      ELSE s.status END AS status,
                    COUNT(*) AS orgs, COALESCE(SUM(${MRR_CENTS}), 0) AS mrr
               FROM subscriptions s JOIN plans p ON p.id = s.plan_id
              WHERE ${NOT_COMPED}
              GROUP BY status ORDER BY mrr DESC`,
          ),
        ),
        c.env.DB.prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_cents ELSE 0 END), 0) AS collected,
             COALESCE(SUM(CASE WHEN status = 'failed' THEN amount_cents ELSE 0 END), 0) AS failed,
             COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount_cents ELSE 0 END), 0) AS refunded
           FROM payments WHERE COALESCE(paid_at, created_at) >= ?`,
        )
          .bind(since)
          .first<{ collected: number; failed: number; refunded: number }>(),
        rows<{ date: string; succeeded: number; failed: number }>(
          c.env.DB.prepare(
            `SELECT strftime('%Y-%m-%d', COALESCE(paid_at, created_at) / 1000, 'unixepoch') AS date,
                    COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_cents ELSE 0 END), 0) AS succeeded,
                    COALESCE(SUM(CASE WHEN status = 'failed' THEN amount_cents ELSE 0 END), 0) AS failed
               FROM payments WHERE COALESCE(paid_at, created_at) >= ?
              GROUP BY date`,
          ).bind(since),
        ),
        /**
         * The paywall conversion funnel.
         *
         * One row per (org, feature) already, so `COUNT(*)` is accounts and
         * `SUM(denial_count)` is attempts — and the gap between those two is
         * itself the signal. A feature fifty accounts hit once is curiosity; a
         * feature five accounts hit forty times each is a purchase somebody
         * could not complete.
         */
        rows<{ feature: string; orgs: number; denials: number; converted: number; surface: string | null }>(
          c.env.DB.prepare(
            `SELECT feature,
                    COUNT(*) AS orgs,
                    COALESCE(SUM(denial_count), 0) AS denials,
                    COALESCE(SUM(CASE WHEN converted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS converted,
                    (SELECT f2.surface FROM feature_access_log f2
                      WHERE f2.feature = feature_access_log.feature AND f2.surface IS NOT NULL
                      GROUP BY f2.surface ORDER BY SUM(f2.denial_count) DESC LIMIT 1) AS surface
               FROM feature_access_log
              GROUP BY feature
              ORDER BY denials DESC`,
          ),
        ),
        rows(
          c.env.DB.prepare(
            `SELECT o.id AS org_id, o.name, s.plan_id, s.status, s.cancel_at_period_end,
                    s.current_period_end, s.updated_at, ${MRR_CENTS} AS mrr_cents
               FROM subscriptions s
               JOIN organizations o ON o.id = s.organization_id
               JOIN plans p ON p.id = s.plan_id
              WHERE ${NOT_COMPED}
                AND (s.status IN ('canceled','expired','on_hold','past_due') OR s.cancel_at_period_end = 1)
              ORDER BY s.updated_at DESC LIMIT 50`,
          ),
        ),
        /**
         * Accounts on a paid plan that pay nothing — the manual grants. Listed
         * because a comp nobody remembers giving is indistinguishable from a
         * billing bug, and both show up here.
         */
        rows(
          c.env.DB.prepare(
            `SELECT o.id AS org_id, o.name, s.plan_id, s.status, s.created_at,
                    (SELECT COUNT(*) FROM forms f WHERE f.organization_id = o.id AND f.deleted_at IS NULL) AS forms
               FROM subscriptions s JOIN organizations o ON o.id = s.organization_id
              WHERE s.dodo_subscription_id LIKE 'internal_manual_%'
              ORDER BY s.created_at DESC LIMIT 25`,
          ),
        ),
        rows(
          c.env.DB.prepare(
            `SELECT p.id, p.organization_id AS org_id, o.name, p.amount_cents, p.currency, p.status,
                    p.invoice_url, COALESCE(p.paid_at, p.created_at) AS at
               FROM payments p JOIN organizations o ON o.id = p.organization_id
              ORDER BY at DESC LIMIT 40`,
          ),
        ),
        c.env.DB.prepare(
          `SELECT COALESCE(SUM(${MRR_CENTS}), 0) AS mrr
             FROM subscriptions s JOIN plans p ON p.id = s.plan_id
            WHERE ${NOT_COMPED}
              AND (s.status IN ('on_hold','past_due') OR s.cancel_at_period_end = 1 OR (s.grace_until IS NOT NULL AND s.grace_until > ?))`,
        )
          .bind(now)
          .first<{ mrr: number }>(),
      ]);

    const mrrCents = Math.round(byPlan.reduce((n, r) => n + r.mrr, 0));
    const payingOrgs = byPlan.reduce((n, r) => n + r.orgs, 0);
    const trialing = statusBoard.find((s) => s.status === "trialing")?.orgs ?? 0;

    const byDate = new Map(paymentDays.map((r) => [r.date, r]));

    return c.json({
      days: window,
      mrrSeries,
      payingSeries,
      mrrByPlan: byPlan.map((r) => ({ plan: r.plan, orgs: r.orgs, mrrCents: Math.round(r.mrr) })),
      totals: {
        mrrCents,
        arrCents: mrrCents * 12,
        payingOrgs,
        // Average revenue per paying account. Dividing by *all* accounts would
        // report a number that falls every time the free tier grows, which is
        // not what ARPA is for.
        arpaCents: payingOrgs > 0 ? Math.round(mrrCents / payingOrgs) : 0,
        trialing,
        atRiskCents: Math.round(atRisk?.mrr ?? 0),
        collectedCents: payments?.collected ?? 0,
        failedCents: payments?.failed ?? 0,
        refundedCents: payments?.refunded ?? 0,
      },
      paymentsSeries: window.map((date) => ({
        date,
        succeeded: byDate.get(date)?.succeeded ?? 0,
        failed: byDate.get(date)?.failed ?? 0,
      })),
      statusBoard: statusBoard.map((r) => ({ status: r.status, orgs: r.orgs, mrrCents: Math.round(r.mrr) })),
      upgradeFunnel: funnel.map((r) => ({
        feature: r.feature,
        orgs: r.orgs,
        denials: r.denials,
        converted: r.converted,
        conversion: r.orgs > 0 ? Math.round((r.converted / r.orgs) * 1000) / 10 : 0,
        topSurface: r.surface,
      })),
      cancellations,
      comped,
      recentPayments,
    });
  },
);
