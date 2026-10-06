import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import { validator } from "../../lib/validator.js";
import { apiError } from "../../lib/api-error.js";
import {
  CHANNEL_PRESETS,
  linkKvKey,
  linkTarget,
  presetOf,
  randomCode,
  slugify,
} from "../../lib/campaign-presets.js";
import {
  TRAFFIC_RANGES,
  cachedJson,
  campaignDetailTraffic,
  campaignTraffic,
  type TrafficRange,
} from "../../lib/traffic-query.js";
import { DAY_MS, FUNNEL_STAGES, STAGE_OF_ORG } from "./shared.js";

/**
 * Campaigns: what each marketing effort brought, link by link.
 *
 * A campaign (`campaigns`) owns links (`campaign_links`), one per place it is
 * posted. A link's short address is answered by the edge worker from KV
 * (`link:<code>`, written here on every save), which redirects to the page with
 * the tags and the link's id as `utm_id`. From there nothing is new: the web
 * tracker reports the visit to `TrafficDO`, and a sign-up stamps the same tags
 * on `user_sign_ins`. This file joins the two.
 *
 * What is counted, and where it comes from:
 *   - visitors: `TrafficDO`, site pages only, never mail we sent (`MARKETING`).
 *   - sign-ups, and how far each account got: `user_sign_ins`, by the stages the
 *     overview funnel uses (`STAGE_OF_ORG`).
 *   - revenue: `payments` as the provider reported them, each organization
 *     credited once, to the campaign its first member signed up from.
 *
 * Sign-ups are the ones made in the period; what those accounts went on to do
 * (paying included) is counted up to now, the way a cohort is read.
 *
 * The campaigns and links themselves are read fresh on every request: they are
 * what somebody just changed. The numbers are cached for a minute.
 */

export const campaignsRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

const RANGE_KEYS = Object.keys(TRAFFIC_RANGES) as [TrafficRange, ...TrafficRange[]];
const RangeQuery = z.object({ range: z.enum(RANGE_KEYS).default("30d") });
const STATS_TTL = 60;
/** Below these a rate says more about chance than about the campaign. */
const MIN_VISITORS = 30;
const MIN_SIGNUPS = 5;
const QUIET_DAYS = 30;

/** Mail we send tags its own links; a sign-up from one is not a campaign's doing. */
const NOT_OUR_MAIL = `NOT (COALESCE(si.source, '') = 'Chatform' AND COALESCE(si.medium, '') = 'email')`;

// ─────────────────────────────── shapes ───────────────────────────────

const Moved = z.object({ value: z.number(), previous: z.number() });
const Money = z.object({ currency: z.string(), cents: z.number() });
const STATUSES = ["active", "paused", "archived"] as const;

const Campaign = z.object({
  id: z.string(),
  name: z.string(),
  /** What goes in `utm_campaign`. */
  key: z.string(),
  notes: z.string().nullable(),
  status: z.enum(STATUSES),
  startsAt: z.number().nullable(),
  endsAt: z.number().nullable(),
  spendCents: z.number().nullable(),
  spendCurrency: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
type Campaign = z.infer<typeof Campaign>;

const Link = z.object({
  id: z.string(),
  campaignId: z.string(),
  label: z.string(),
  channel: z.string(),
  destination: z.string(),
  source: z.string(),
  medium: z.string(),
  content: z.string().nullable(),
  /** The short address is `/r/<code>` on the site. */
  code: z.string(),
  /** Where the short address sends people: a path and query on the site. */
  target: z.string(),
  archived: z.boolean(),
  createdAt: z.number(),
});
type Link = z.infer<typeof Link>;

const Channel = z.object({
  key: z.string(),
  label: z.string(),
  medium: z.string(),
  source: z.enum(["fixed", "pick", "label"]),
  sources: z.array(z.string()),
});

const Insight = z.object({
  kind: z.enum(["best_signups", "best_rate", "no_signups", "quiet_links", "cost_per_signup"]),
  campaignId: z.string().nullable(),
  /** The campaign's name, so the sentence needs no second lookup. */
  name: z.string().nullable(),
  values: z.record(z.string(), z.union([z.number(), z.string()])),
});

const CampaignsResponse = z.object({
  range: z.enum(RANGE_KEYS),
  totals: z.object({
    visitors: Moved,
    signups: Moved,
    paid: Moved,
    revenue: z.array(Money.extend({ previous: z.number() })),
  }),
  campaigns: z.array(
    Campaign.extend({
      /** Links that are not archived, and the channels they were made for. */
      links: z.number(),
      channels: z.array(z.string()),
      visitors: Moved,
      signups: Moved,
      paid: z.number(),
      revenue: z.array(Money),
      /** Spend over every sign-up the campaign ever brought. Null without spend or sign-ups. */
      costPerSignupCents: z.number().nullable(),
      /** Visitors a day across the period, oldest first. */
      series: z.array(z.number()),
    }),
  ),
  /** Campaign names seen on links nobody saved here. */
  untracked: z.array(z.object({ key: z.string(), visitors: z.number(), signups: z.number() })),
  insights: z.array(Insight),
  channels: z.array(Channel),
  generatedAt: z.number(),
});

const CampaignDetailResponse = z.object({
  range: z.enum(RANGE_KEYS),
  campaign: Campaign,
  channels: z.array(Channel),
  totals: z.object({
    visitors: Moved,
    visits: z.number(),
    signups: Moved,
    paid: Moved,
    revenue: z.array(Money),
  }),
  costPerSignupCents: z.number().nullable(),
  series: z.array(z.object({ at: z.number(), visitors: z.number(), visits: z.number(), signups: z.number() })),
  stages: z.array(z.object({ key: z.string(), label: z.string(), value: z.number() })),
  links: z.array(
    Link.extend({
      visitors: z.number(),
      visits: z.number(),
      signups: z.number(),
      paid: z.number(),
      /** The last visit it ever brought, however long ago. */
      lastVisitAt: z.number().nullable(),
    }),
  ),
  /** Carried the campaign's name and no saved link: a hand-typed address, or one copied before links had ids. */
  unlinked: z.object({ visitors: z.number(), visits: z.number(), signups: z.number(), paid: z.number() }),
  people: z.array(
    z.object({
      userId: z.string(),
      name: z.string().nullable(),
      email: z.string(),
      at: z.number(),
      linkId: z.string().nullable(),
      source: z.string().nullable(),
      orgId: z.string().nullable(),
      /** A key of the funnel's stages: how far their account got. */
      stage: z.string(),
      plan: z.string().nullable(),
    }),
  ),
  breakdowns: z.object({
    sources: z.array(z.object({ key: z.string(), visitors: z.number() })),
    countries: z.array(z.object({ key: z.string(), visitors: z.number() })),
    landings: z.array(z.object({ key: z.string(), visitors: z.number() })),
  }),
  generatedAt: z.number(),
});

// ─────────────────────────────── reading ───────────────────────────────

const CAMPAIGN_COLUMNS = `id, name, key, notes, status, starts_at AS startsAt, ends_at AS endsAt, spend_cents AS spendCents,
  spend_currency AS spendCurrency, created_at AS createdAt, updated_at AS updatedAt`;

interface LinkRecord {
  id: string;
  campaignId: string;
  label: string | null;
  name: string;
  channel: string | null;
  destination: string;
  source: string;
  medium: string;
  campaign: string;
  content: string | null;
  code: string | null;
  archivedAt: number | null;
  createdAt: number;
}

const LINK_COLUMNS = `id, campaign_id AS campaignId, label, name, channel, destination, source, medium, campaign, content, code,
  archived_at AS archivedAt, created_at AS createdAt`;

const toLink = (r: LinkRecord): Link => ({
  id: r.id,
  campaignId: r.campaignId,
  label: r.label ?? r.name,
  channel: presetOf(r.channel).key,
  destination: r.destination,
  source: r.source,
  medium: r.medium,
  content: r.content,
  code: r.code ?? "",
  target: linkTarget(r),
  archived: r.archivedAt != null,
  createdAt: r.createdAt,
});

async function loadCampaigns(env: Bindings): Promise<Campaign[]> {
  return (await env.DB.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM campaigns ORDER BY created_at DESC LIMIT 500`).all<Campaign>()).results ?? [];
}

async function loadCampaign(env: Bindings, id: string): Promise<Campaign | null> {
  return env.DB.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM campaigns WHERE id = ?`).bind(id).first<Campaign>();
}

async function loadLinks(env: Bindings, campaignId?: string): Promise<Link[]> {
  const stmt = campaignId
    ? env.DB.prepare(`SELECT ${LINK_COLUMNS} FROM campaign_links WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 500`).bind(campaignId)
    : env.DB.prepare(`SELECT ${LINK_COLUMNS} FROM campaign_links WHERE campaign_id IS NOT NULL ORDER BY created_at DESC LIMIT 2000`);
  return ((await stmt.all<LinkRecord>()).results ?? []).map(toLink);
}

interface SignupRow {
  campaign: string;
  link: string;
  period: "cur" | "prev";
  stages: Record<string, number>;
}

/**
 * Sign-ups since `before`, per campaign, link and period, and how far each
 * account got. The furthest organization a person belongs to counts, so an
 * invited teammate on a paying account is "paid".
 */
async function signupRows(env: Bindings, from: number, before: number, key?: string): Promise<SignupRow[]> {
  const columns = FUNNEL_STAGES.filter(([, , n]) => n > 0)
    .map(([k, , n]) => `SUM(CASE WHEN stage >= ${n} THEN 1 ELSE 0 END) AS ${k}`)
    .join(", ");
  const res = await env.DB.prepare(
    `SELECT campaign, link, period, COUNT(*) AS signed_up, ${columns} FROM (
       SELECT si.campaign AS campaign, COALESCE(si.link_id, '') AS link,
              CASE WHEN si.created_at >= ?1 THEN 'cur' ELSE 'prev' END AS period,
              COALESCE((SELECT MAX(${STAGE_OF_ORG}) FROM organizations o
                          JOIN members m ON m.organization_id = o.id
                         WHERE m.user_id = si.user_id), 0) AS stage
         FROM user_sign_ins si
        WHERE si.kind = 'sign_up' AND si.created_at >= ?2 AND si.campaign IS NOT NULL AND ${NOT_OUR_MAIL}
              ${key ? "AND si.campaign = ?3" : ""}
     ) GROUP BY campaign, link, period`,
  )
    .bind(...(key ? [from, before, key] : [from, before]))
    .all<Record<string, number | string>>();
  return (res.results ?? []).map((row) => ({
    campaign: String(row.campaign),
    link: String(row.link),
    period: row.period === "cur" ? "cur" : "prev",
    stages: Object.fromEntries(FUNNEL_STAGES.map(([k]) => [k, Number(row[k] ?? 0)])),
  }));
}

interface RevenueRow {
  campaign: string;
  period: "cur" | "prev";
  currency: string;
  cents: number;
}

/**
 * What the accounts a campaign brought have paid, as the provider reported each
 * payment. An organization is credited once, to the campaign its first member
 * signed up from: counting every member would count the same money per seat.
 */
async function revenueRows(env: Bindings, from: number, before: number, key?: string): Promise<RevenueRow[]> {
  const res = await env.DB.prepare(
    `SELECT si.campaign AS campaign, CASE WHEN si.created_at >= ?1 THEN 'cur' ELSE 'prev' END AS period,
            p.currency AS currency, SUM(p.amount_cents) AS cents
       FROM payments p
       JOIN members m ON m.organization_id = p.organization_id
        AND m.id = (SELECT m2.id FROM members m2 WHERE m2.organization_id = p.organization_id ORDER BY m2.created_at, m2.id LIMIT 1)
       JOIN user_sign_ins si ON si.user_id = m.user_id AND si.kind = 'sign_up'
      WHERE p.status = 'succeeded' AND si.created_at >= ?2 AND si.campaign IS NOT NULL AND ${NOT_OUR_MAIL}
            ${key ? "AND si.campaign = ?3" : ""}
      GROUP BY 1, 2, 3`,
  )
    .bind(...(key ? [from, before, key] : [from, before]))
    .all<RevenueRow>();
  return res.results ?? [];
}

/** Every sign-up a campaign ever brought: what its whole spend is divided by. */
async function signupsEver(env: Bindings, key?: string): Promise<Map<string, number>> {
  const res = await env.DB.prepare(
    `SELECT si.campaign AS campaign, COUNT(*) AS n FROM user_sign_ins si
      WHERE si.kind = 'sign_up' AND si.campaign IS NOT NULL AND ${NOT_OUR_MAIL} ${key ? "AND si.campaign = ?1" : ""}
      GROUP BY si.campaign`,
  )
    .bind(...(key ? [key] : []))
    .all<{ campaign: string; n: number }>();
  return new Map((res.results ?? []).map((r) => [r.campaign, Number(r.n)]));
}

const sumStage = (rows: SignupRow[], period: "cur" | "prev", stage: string) =>
  rows.reduce((n, r) => (r.period === period ? n + (r.stages[stage] ?? 0) : n), 0);

const moneyOf = (rows: RevenueRow[], period: "cur" | "prev") => {
  const by = new Map<string, number>();
  for (const r of rows) if (r.period === period) by.set(r.currency, (by.get(r.currency) ?? 0) + Number(r.cents));
  return [...by].map(([currency, cents]) => ({ currency, cents })).sort((a, b) => b.cents - a.cents);
};

const costPer = (campaign: Campaign, signups: number) =>
  campaign.spendCents != null && signups > 0 ? Math.round(campaign.spendCents / signups) : null;

/** The UTC days a period covers, as the start of each. */
function dayStarts(from: number, now: number): number[] {
  const out: number[] = [];
  for (let at = Math.floor(from / DAY_MS) * DAY_MS; at <= now; at += DAY_MS) out.push(at);
  return out;
}

const statsKey = (range: TrafficRange) => `admin:campaigns:stats:${range}`;
const detailKey = (id: string, range: TrafficRange) => `admin:campaign:${id}:${range}`;

// ─────────────────────────────── the list ───────────────────────────────

campaignsRouter.get(
  "/admin/campaigns",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "Every campaign: its links, visitors, sign-ups, paying accounts and revenue",
    responses: {
      200: { description: "Campaigns", content: { "application/json": { schema: resolver(CampaignsResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const { range } = c.req.valid("query");
    const days = TRAFFIC_RANGES[range];
    const now = Date.now();
    const from = now - days * DAY_MS;
    const before = from - days * DAY_MS;

    const [saved, links, stats] = await Promise.all([
      loadCampaigns(c.env),
      loadLinks(c.env),
      cachedJson(c.env, statsKey(range), STATS_TTL, async () => {
        const [traffic, signups, revenue, ever] = await Promise.all([
          campaignTraffic(c.env, days),
          signupRows(c.env, from, before),
          revenueRows(c.env, from, before),
          signupsEver(c.env),
        ]);
        return { traffic, signups, revenue, ever: [...ever], generatedAt: Date.now() };
      }),
    ]);
    const { traffic, signups, revenue } = stats;
    const ever = new Map(stats.ever);
    const starts = dayStarts(from, now);
    const quietBefore = now - QUIET_DAYS * DAY_MS;
    const lastVisit = new Map(traffic.linkLastVisit.map((l) => [l.link, l.at]));

    const campaigns = saved.map((campaign) => {
      const own = links.filter((l) => l.campaignId === campaign.id && !l.archived);
      const t = traffic.campaigns.find((x) => x.campaign === campaign.key);
      const mine = signups.filter((s) => s.campaign === campaign.key);
      const perDay = new Map(traffic.series.filter((s) => s.campaign === campaign.key).map((s) => [s.at, s.visitors]));
      return {
        ...campaign,
        links: own.length,
        channels: [...new Set(own.map((l) => presetOf(l.channel).label))],
        visitors: { value: t?.visitors ?? 0, previous: t?.previous ?? 0 },
        signups: { value: sumStage(mine, "cur", "signed_up"), previous: sumStage(mine, "prev", "signed_up") },
        paid: sumStage(mine, "cur", "paid"),
        revenue: moneyOf(revenue.filter((r) => r.campaign === campaign.key), "cur"),
        costPerSignupCents: costPer(campaign, ever.get(campaign.key) ?? 0),
        series: starts.map((at) => perDay.get(at) ?? 0),
        /** Not sent: links old enough to judge that have brought nobody lately. */
        quiet: campaign.status === "active" ? own.filter((l) => l.createdAt < quietBefore && (lastVisit.get(l.id) ?? 0) < quietBefore).length : 0,
      };
    });

    const known = new Set(saved.map((s) => s.key));
    const names = new Set([...traffic.campaigns.map((t) => t.campaign), ...signups.filter((s) => s.period === "cur").map((s) => s.campaign)]);
    const untracked = [...names]
      .filter((key) => !known.has(key))
      .map((key) => ({
        key,
        visitors: traffic.campaigns.find((t) => t.campaign === key)?.visitors ?? 0,
        signups: sumStage(signups.filter((s) => s.campaign === key), "cur", "signed_up"),
      }))
      .filter((u) => u.visitors > 0 || u.signups > 0)
      .sort((a, b) => b.visitors - a.visitors || b.signups - a.signups)
      .slice(0, 50);

    const insights: z.infer<typeof Insight>[] = [];
    const live = campaigns.filter((x) => x.status !== "archived");
    const rate = (x: (typeof campaigns)[number]) => (x.visitors.value > 0 ? x.signups.value / x.visitors.value : 0);
    const best = [...live].sort((a, b) => b.signups.value - a.signups.value)[0];
    if (best && best.signups.value >= MIN_SIGNUPS) {
      insights.push({ kind: "best_signups", campaignId: best.id, name: best.name, values: { signups: best.signups.value, visitors: best.visitors.value } });
    }
    const sharpest = live
      .filter((x) => x.visitors.value >= MIN_VISITORS && x.signups.value >= MIN_SIGNUPS)
      .sort((a, b) => rate(b) - rate(a))[0];
    if (sharpest && sharpest.id !== best?.id) {
      insights.push({ kind: "best_rate", campaignId: sharpest.id, name: sharpest.name, values: { signups: sharpest.signups.value, visitors: sharpest.visitors.value } });
    }
    const empty = live.filter((x) => x.visitors.value >= MIN_VISITORS && x.signups.value === 0).sort((a, b) => b.visitors.value - a.visitors.value)[0];
    if (empty) insights.push({ kind: "no_signups", campaignId: empty.id, name: empty.name, values: { visitors: empty.visitors.value } });
    const cheapest = live
      .filter((x) => x.costPerSignupCents != null && (ever.get(x.key) ?? 0) >= MIN_SIGNUPS)
      .sort((a, b) => a.costPerSignupCents! - b.costPerSignupCents!)[0];
    if (cheapest) {
      insights.push({ kind: "cost_per_signup", campaignId: cheapest.id, name: cheapest.name, values: { cents: cheapest.costPerSignupCents!, currency: cheapest.spendCurrency } });
    }
    const quiet = live.reduce((n, x) => n + x.quiet, 0);
    if (quiet > 0) insights.push({ kind: "quiet_links", campaignId: null, name: null, values: { links: quiet, days: QUIET_DAYS } });

    const previousMoney = new Map(moneyOf(revenue, "prev").map((m) => [m.currency, m.cents]));
    const currentMoney = moneyOf(revenue, "cur");
    for (const currency of previousMoney.keys()) {
      if (!currentMoney.some((m) => m.currency === currency)) currentMoney.push({ currency, cents: 0 });
    }

    return c.json({
      range,
      totals: {
        visitors: { value: traffic.totals.visitors, previous: traffic.totals.previous },
        signups: { value: sumStage(signups, "cur", "signed_up"), previous: sumStage(signups, "prev", "signed_up") },
        paid: { value: sumStage(signups, "cur", "paid"), previous: sumStage(signups, "prev", "paid") },
        revenue: currentMoney.map((m) => ({ ...m, previous: previousMoney.get(m.currency) ?? 0 })),
      },
      campaigns: campaigns.map(({ quiet: _quiet, ...rest }) => rest),
      untracked,
      insights,
      channels: CHANNEL_PRESETS,
      generatedAt: stats.generatedAt,
    });
  },
);

// ─────────────────────────────── one campaign ───────────────────────────────

campaignsRouter.get(
  "/admin/campaigns/:id",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "One campaign: its trend, funnel, links, and the people who signed up from it",
    responses: {
      200: { description: "Campaign", content: { "application/json": { schema: resolver(CampaignDetailResponse) } } },
      404: { description: "Not an admin, or no such campaign" },
    },
  }),
  async (c) => {
    const { range } = c.req.valid("query");
    const id = c.req.param("id");
    const campaign = await loadCampaign(c.env, id);
    if (!campaign) return apiError(c, 404, "not_found", "Not found");
    const days = TRAFFIC_RANGES[range];
    const now = Date.now();
    const from = now - days * DAY_MS;
    const before = from - days * DAY_MS;
    const key = campaign.key;

    const [links, stats] = await Promise.all([
      loadLinks(c.env, id),
      cachedJson(c.env, detailKey(id, range), STATS_TTL, async () => {
        const [traffic, signups, revenue, ever, perDay, people] = await Promise.all([
          campaignDetailTraffic(c.env, key, days),
          signupRows(c.env, from, before, key),
          revenueRows(c.env, from, before, key),
          signupsEver(c.env, key),
          c.env.DB.prepare(
            `SELECT CAST(si.created_at / ?3 AS INTEGER) * ?3 AS at, COUNT(*) AS signups FROM user_sign_ins si
              WHERE si.kind = 'sign_up' AND si.campaign = ?1 AND si.created_at >= ?2 AND ${NOT_OUR_MAIL} GROUP BY 1`,
          )
            .bind(key, from, DAY_MS)
            .all<{ at: number; signups: number }>(),
          c.env.DB.prepare(
            `SELECT si.user_id AS userId, u.name AS name, u.email AS email, si.created_at AS at, si.link_id AS linkId, si.source AS source,
                    (SELECT m.organization_id FROM members m WHERE m.user_id = si.user_id ORDER BY m.created_at LIMIT 1) AS orgId,
                    COALESCE((SELECT MAX(${STAGE_OF_ORG}) FROM organizations o
                                JOIN members m ON m.organization_id = o.id
                               WHERE m.user_id = si.user_id), 0) AS stage,
                    (SELECT p.name FROM subscriptions s
                       JOIN plans p ON p.id = s.plan_id
                       JOIN members m ON m.organization_id = s.organization_id
                      WHERE m.user_id = si.user_id AND s.status IN ('active', 'trialing') LIMIT 1) AS plan
               FROM user_sign_ins si JOIN users u ON u.id = si.user_id
              WHERE si.kind = 'sign_up' AND si.campaign = ?1 AND si.created_at >= ?2 AND ${NOT_OUR_MAIL}
              ORDER BY si.created_at DESC LIMIT 200`,
          )
            .bind(key, from)
            .all<{
              userId: string; name: string | null; email: string; at: number; linkId: string | null;
              source: string | null; orgId: string | null; stage: number; plan: string | null;
            }>(),
        ]);
        return {
          traffic,
          signups,
          revenue,
          ever: ever.get(key) ?? 0,
          perDay: perDay.results ?? [],
          people: people.results ?? [],
          generatedAt: Date.now(),
        };
      }),
    ]);
    const { traffic, signups } = stats;
    const ids = new Set(links.map((l) => l.id));
    const visitsOf = new Map(traffic.links.map((l) => [l.key, l]));
    const lastVisit = new Map(traffic.linkLastVisit.map((l) => [l.link, l.at]));
    const signupsOf = (link: string, stage: string) => sumStage(signups.filter((s) => s.link === link), "cur", stage);
    // Anything that did not come through one of this campaign's links counts for the campaign alone.
    const loose = (stage: string) => sumStage(signups.filter((s) => !ids.has(s.link)), "cur", stage);
    const looseTraffic = traffic.links.filter((l) => !ids.has(l.key));
    const signupsPerDay = new Map(stats.perDay.map((r) => [Number(r.at), Number(r.signups)]));
    const trafficPerDay = new Map(traffic.series.map((r) => [r.at, r]));
    const top = (list: { key: string; visitors: number }[]) => list.map((b) => ({ key: b.key, visitors: b.visitors }));

    return c.json({
      range,
      campaign,
      channels: CHANNEL_PRESETS,
      totals: {
        visitors: { value: traffic.totals.visitors, previous: traffic.totals.previous },
        visits: traffic.totals.visits,
        signups: { value: sumStage(signups, "cur", "signed_up"), previous: sumStage(signups, "prev", "signed_up") },
        paid: { value: sumStage(signups, "cur", "paid"), previous: sumStage(signups, "prev", "paid") },
        revenue: moneyOf(stats.revenue, "cur"),
      },
      costPerSignupCents: costPer(campaign, stats.ever),
      series: dayStarts(from, now).map((at) => ({
        at,
        visitors: trafficPerDay.get(at)?.visitors ?? 0,
        visits: trafficPerDay.get(at)?.visits ?? 0,
        signups: signupsPerDay.get(at) ?? 0,
      })),
      stages: FUNNEL_STAGES.map(([k, label]) => ({ key: k, label, value: sumStage(signups, "cur", k) })),
      links: links.map((l) => ({
        ...l,
        visitors: visitsOf.get(l.id)?.visitors ?? 0,
        visits: visitsOf.get(l.id)?.visits ?? 0,
        signups: signupsOf(l.id, "signed_up"),
        paid: signupsOf(l.id, "paid"),
        lastVisitAt: lastVisit.get(l.id) ?? null,
      })),
      unlinked: {
        visitors: looseTraffic.reduce((n, l) => n + l.visitors, 0),
        visits: looseTraffic.reduce((n, l) => n + l.visits, 0),
        signups: loose("signed_up"),
        paid: loose("paid"),
      },
      people: stats.people.map((p) => ({
        ...p,
        stage: FUNNEL_STAGES.find(([, , n]) => n === Number(p.stage))?.[0] ?? "signed_up",
      })),
      breakdowns: {
        sources: top(traffic.sources),
        countries: top(traffic.countries),
        landings: top(traffic.landings),
      },
      generatedAt: stats.generatedAt,
    });
  },
);

// ─────────────────────────────── writing ───────────────────────────────

const nullableTime = z.number().int().min(0).nullable().optional();

const CampaignFields = {
  notes: z.string().trim().max(2000).nullable().optional(),
  startsAt: nullableTime,
  endsAt: nullableTime,
  spendCents: z.number().int().min(0).max(100_000_000_00).nullable().optional(),
  spendCurrency: z.string().regex(/^[A-Z]{3}$/, "A three-letter currency code").optional(),
};

const CampaignCreate = z.object({
  name: z.string().trim().min(1).max(120),
  /** `utm_campaign`. Made from the name when left out; given as is when saving one already in use. */
  key: z.string().trim().min(1).max(150).optional(),
  ...CampaignFields,
});

const CampaignUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  key: z.string().trim().min(1).max(150).optional(),
  status: z.enum(STATUSES).optional(),
  ...CampaignFields,
});

/** A path on chatform (`/pricing`, `/f/slug`), never another host: `//x` and `/\x` are someone else's. */
const Destination = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(?![/\\])[^\s\\]*$/, "A path on chatform, starting with /");
const Code = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{2,39}$/, "3 to 40 letters, numbers or dashes");
const Slug = (max: number) => z.string().trim().min(1).max(max);

const LinkCreate = z.object({
  destination: Destination,
  channel: z.string().max(40),
  /** Who or what this link is for: a creator, a post, an ad. */
  label: z.string().trim().min(1).max(120),
  source: Slug(60).optional(),
  medium: Slug(60).optional(),
  content: Slug(100).optional(),
  code: Code.optional(),
});

const LinkUpdate = z.object({
  destination: Destination.optional(),
  channel: z.string().max(40).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  source: Slug(60).optional(),
  medium: Slug(60).optional(),
  content: Slug(100).nullable().optional(),
  code: Code.optional(),
  archived: z.boolean().optional(),
});

/** A just-changed campaign should not wait out the minute its numbers are cached for. */
async function forget(env: Bindings, id?: string): Promise<void> {
  const keys = RANGE_KEYS.flatMap((r) => (id ? [statsKey(r), detailKey(id, r)] : [statsKey(r)]));
  await Promise.all(keys.map((k) => env.KV_CONFIG.delete(k).catch(() => {})));
}

const isUniqueViolation = (err: unknown) => /UNIQUE constraint failed/i.test(err instanceof Error ? err.message : String(err));

campaignsRouter.post(
  "/admin/campaigns",
  validator("json", CampaignCreate),
  describeRoute({
    tags: ["admin"],
    summary: "Start a campaign",
    responses: {
      200: { description: "Created", content: { "application/json": { schema: resolver(Campaign) } } },
      404: { description: "Not an admin" },
      409: { description: "Another campaign already uses that key" },
    },
  }),
  async (c) => {
    const input = c.req.valid("json");
    // A key given as is matches what a link already out there carries; one made from the name is kept URL-plain.
    const key = input.key ? input.key.toLowerCase() : slugify(input.name, 100);
    if (!key) return apiError(c, 400, "invalid_request", "Give the campaign a name with letters or numbers in it");
    const now = Date.now();
    const row: Campaign = {
      id: `cmp_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      name: input.name,
      key,
      notes: input.notes || null,
      status: "active",
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      spendCents: input.spendCents ?? null,
      spendCurrency: input.spendCurrency ?? "USD",
      createdAt: now,
      updatedAt: now,
    };
    try {
      await c.env.DB.prepare(
        `INSERT INTO campaigns (id, name, key, notes, status, starts_at, ends_at, spend_cents, spend_currency, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(row.id, row.name, row.key, row.notes, row.status, row.startsAt, row.endsAt, row.spendCents, row.spendCurrency,
          c.get("platformAdminEmail") ?? null, now, now)
        .run();
    } catch (err) {
      if (isUniqueViolation(err)) return apiError(c, 409, "conflict", "Another campaign already uses that name in its links");
      throw err;
    }
    await forget(c.env);
    return c.json(row);
  },
);

campaignsRouter.patch(
  "/admin/campaigns/:id",
  validator("json", CampaignUpdate),
  describeRoute({
    tags: ["admin"],
    summary: "Edit a campaign, pause it, archive it or bring it back",
    responses: {
      200: { description: "Saved", content: { "application/json": { schema: resolver(Campaign) } } },
      404: { description: "Not an admin, or no such campaign" },
      409: { description: "The key is taken, or links already carry the old one" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const current = await loadCampaign(c.env, id);
    if (!current) return apiError(c, 404, "not_found", "Not found");
    const key = input.key ? input.key.toLowerCase() : current.key;
    if (key !== current.key) {
      // Links already shared carry the old key; changing it would orphan everything they bring.
      const has = await c.env.DB.prepare(`SELECT 1 AS x FROM campaign_links WHERE campaign_id = ? LIMIT 1`).bind(id).first();
      if (has) return apiError(c, 409, "conflict", "This campaign already has links, so its key cannot change");
    }
    const pick = <T,>(given: T | undefined, kept: T): T => (given === undefined ? kept : given);
    const next: Campaign = {
      ...current,
      name: input.name ?? current.name,
      key,
      notes: input.notes === undefined ? current.notes : input.notes || null,
      status: input.status ?? current.status,
      startsAt: pick(input.startsAt, current.startsAt),
      endsAt: pick(input.endsAt, current.endsAt),
      spendCents: pick(input.spendCents, current.spendCents),
      spendCurrency: input.spendCurrency ?? current.spendCurrency,
      updatedAt: Date.now(),
    };
    try {
      await c.env.DB.prepare(
        `UPDATE campaigns SET name = ?, key = ?, notes = ?, status = ?, starts_at = ?, ends_at = ?, spend_cents = ?, spend_currency = ?, updated_at = ?
          WHERE id = ?`,
      )
        .bind(next.name, next.key, next.notes, next.status, next.startsAt, next.endsAt, next.spendCents, next.spendCurrency, next.updatedAt, id)
        .run();
    } catch (err) {
      if (isUniqueViolation(err)) return apiError(c, 409, "conflict", "Another campaign already uses that key");
      throw err;
    }
    await forget(c.env, id);
    return c.json(next);
  },
);

/** The tags a link carries: what was typed under Advanced, else what its channel and label say. */
function tagsFor(channel: string, label: string, given: { source?: string; medium?: string; content?: string | null }) {
  const preset = presetOf(channel);
  const named = slugify(label, 100);
  const source = slugify(given.source ?? (preset.source === "label" ? named : preset.sources[0]!), 60);
  const medium = slugify(given.medium ?? preset.medium, 60);
  const content = given.content === null ? null : slugify(given.content ?? named, 100) || null;
  return { channel: preset.key, source, medium, content };
}

campaignsRouter.post(
  "/admin/campaigns/:id/links",
  validator("json", LinkCreate),
  describeRoute({
    tags: ["admin"],
    summary: "Make a link for a campaign",
    responses: {
      200: { description: "Created", content: { "application/json": { schema: resolver(Link) } } },
      404: { description: "Not an admin, or no such campaign" },
      409: { description: "That short code is taken" },
    },
  }),
  async (c) => {
    const campaignId = c.req.param("id");
    const input = c.req.valid("json");
    const campaign = await loadCampaign(c.env, campaignId);
    if (!campaign) return apiError(c, 404, "not_found", "Not found");
    const tags = tagsFor(input.channel, input.label, input);
    if (!tags.source || !tags.medium) return apiError(c, 400, "invalid_request", "The label needs letters or numbers in it");

    const now = Date.now();
    const record: LinkRecord = {
      id: `cl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      campaignId,
      label: input.label,
      name: input.label,
      channel: tags.channel,
      destination: input.destination,
      source: tags.source,
      medium: tags.medium,
      campaign: campaign.key,
      content: tags.content,
      code: input.code ?? randomCode(),
      archivedAt: null,
      createdAt: now,
    };
    // A code somebody chose either is free or is not; one we drew is simply drawn again.
    for (let attempt = 0; ; attempt++) {
      try {
        await c.env.DB.prepare(
          `INSERT INTO campaign_links (id, name, destination, source, medium, campaign, content, created_by, created_at,
             campaign_id, code, label, channel, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(record.id, record.name, record.destination, record.source, record.medium, record.campaign, record.content,
            c.get("platformAdminEmail") ?? null, now, campaignId, record.code, record.label, record.channel, now)
          .run();
        break;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (input.code || attempt >= 4) return apiError(c, 409, "conflict", "That short code is already taken");
        record.code = randomCode();
      }
    }
    const link = toLink(record);
    await c.env.KV_CONFIG.put(linkKvKey(link.code), link.target);
    await forget(c.env, campaignId);
    return c.json(link);
  },
);

campaignsRouter.patch(
  "/admin/campaign-links/:id",
  validator("json", LinkUpdate),
  describeRoute({
    tags: ["admin"],
    summary: "Edit a campaign link, archive it or bring it back. An archived link keeps working.",
    responses: {
      200: { description: "Saved", content: { "application/json": { schema: resolver(Link) } } },
      404: { description: "Not an admin, or no such link" },
      409: { description: "That short code is taken" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const current = await c.env.DB.prepare(`SELECT ${LINK_COLUMNS} FROM campaign_links WHERE id = ?`).bind(id).first<LinkRecord>();
    if (!current || !current.campaignId) return apiError(c, 404, "not_found", "Not found");

    const label = input.label ?? current.label ?? current.name;
    const channel = input.channel ?? current.channel ?? "other";
    // A changed channel or label rewrites the tags it implies; otherwise they stay exactly as they were shared.
    const retag = input.channel !== undefined || input.label !== undefined;
    const tags = retag
      ? tagsFor(channel, label, { source: input.source, medium: input.medium, content: input.content })
      : {
          channel: presetOf(channel).key,
          source: input.source ? slugify(input.source, 60) : current.source,
          medium: input.medium ? slugify(input.medium, 60) : current.medium,
          content: input.content === undefined ? current.content : input.content === null ? null : slugify(input.content, 100) || null,
        };
    if (!tags.source || !tags.medium) return apiError(c, 400, "invalid_request", "The label needs letters or numbers in it");

    const now = Date.now();
    const next: LinkRecord = {
      ...current,
      label,
      name: label,
      channel: tags.channel,
      destination: input.destination ?? current.destination,
      source: tags.source,
      medium: tags.medium,
      content: tags.content,
      code: input.code ?? current.code ?? randomCode(),
      archivedAt: input.archived === undefined ? current.archivedAt : input.archived ? (current.archivedAt ?? now) : null,
    };
    try {
      await c.env.DB.prepare(
        `UPDATE campaign_links SET name = ?, label = ?, channel = ?, destination = ?, source = ?, medium = ?, content = ?, code = ?,
                archived_at = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(next.name, next.label, next.channel, next.destination, next.source, next.medium, next.content, next.code, next.archivedAt, now, id)
        .run();
    } catch (err) {
      if (isUniqueViolation(err)) return apiError(c, 409, "conflict", "That short code is already taken");
      throw err;
    }
    const link = toLink(next);
    // Archiving only puts a link away on this page. Somebody may still click it wherever it was
    // posted, so its short address keeps answering.
    if (current.code && current.code !== link.code) await c.env.KV_CONFIG.delete(linkKvKey(current.code));
    await c.env.KV_CONFIG.put(linkKvKey(link.code), link.target);
    await forget(c.env, current.campaignId);
    return c.json(link);
  },
);

/**
 * Where a short code leads, for the edge worker when KV has not heard of it
 * (a link older than its KV entry, or an entry that was lost). One indexed read,
 * and the answer goes back into KV so the next click costs nothing.
 */
export async function resolveLinkCode(env: Bindings, code: string): Promise<string | null> {
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(code)) return null;
  const row = await env.DB.prepare(`SELECT ${LINK_COLUMNS} FROM campaign_links WHERE code = ?`).bind(code).first<LinkRecord>();
  if (!row) return null;
  const target = linkTarget(row);
  await env.KV_CONFIG.put(linkKvKey(code), target).catch(() => {});
  return target;
}
