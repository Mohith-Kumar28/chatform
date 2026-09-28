import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "../../lib/validator.js";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import {
  TRAFFIC_RANGES,
  TrafficNotConfigured,
  cachedJson,
  campaignTraffic,
  emailTraffic,
  trafficLive,
  trafficReport,
  type TrafficRange,
} from "../../lib/traffic-query.js";
import { DAY_MS, FUNNEL_STAGES, STAGE_OF_ORG } from "./shared.js";

/**
 * Traffic and campaigns: who comes, from where, what they look at, and whether
 * they sign up and stay.
 *
 * Traffic reads Analytics Engine (`lib/traffic-query.ts`); sign-ups and what
 * those accounts went on to do read D1. The two meet on the attribution columns
 * `user_sign_ins` carries since migration 0050.
 *
 * Caching, by how fast the answer can change:
 *   - a range report: 60s for a day, 5 minutes for a week or a month, an hour
 *     for a quarter, whose shape a few minutes do not move.
 *   - live: 15 seconds in the isolate only. It is polled every 30 seconds.
 *   - campaigns: 5 minutes, like the overview.
 */

export const trafficRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

const RANGE_KEYS = Object.keys(TRAFFIC_RANGES) as [TrafficRange, ...TrafficRange[]];
const TrafficQuery = z.object({ range: z.enum(RANGE_KEYS).default("7d") });
const TTL: Record<TrafficRange, number> = { "1d": 60, "7d": 300, "30d": 300, "90d": 3600 };

const Breakdown = z.object({ key: z.string(), visitors: z.number(), visits: z.number(), views: z.number() });
const PageRow = z.object({
  area: z.string(),
  path: z.string(),
  visitors: z.number(),
  visits: z.number(),
  views: z.number(),
});
const Totals = z.object({
  visitors: z.number(),
  visits: z.number(),
  views: z.number(),
  newVisitors: z.number(),
  bounced: z.number(),
  engagedMs: z.number(),
});
const VitalsRow = z.object({
  key: z.string(),
  samples: z.number(),
  lcp: z.number().nullable(),
  inp: z.number().nullable(),
  ttfb: z.number().nullable(),
  cls: z.number().nullable(),
});
const SignupsBy = z.object({ channel: z.string(), source: z.string(), signups: z.number() });

const TrafficResponse = z.object({
  /** False until `CF_ANALYTICS_TOKEN` is set: the page says so instead of failing. */
  configured: z.boolean(),
  range: z.enum(RANGE_KEYS),
  bucket: z.enum(["hour", "day"]),
  totals: Totals,
  previous: Totals,
  signups: z.object({ value: z.number(), previous: z.number() }),
  series: z.array(
    z.object({ at: z.number(), visitors: z.number(), visits: z.number(), views: z.number(), newVisitors: z.number() }),
  ),
  signupSeries: z.array(z.object({ at: z.number(), signups: z.number() })),
  /** Hourly visitors for the weekday × hour grid; null on the one-day range. */
  hourly: z.array(z.object({ at: z.number(), visitors: z.number() })).nullable(),
  channels: z.array(Breakdown),
  sources: z.array(
    z.object({ source: z.string(), channel: z.string(), visitors: z.number(), visits: z.number(), views: z.number() }),
  ),
  signupsBySource: z.array(SignupsBy),
  referrers: z.array(Breakdown),
  campaigns: z.array(Breakdown),
  areas: z.array(Breakdown),
  pages: z.array(PageRow),
  entries: z.array(PageRow),
  exits: z.array(z.object({ area: z.string(), path: z.string(), visits: z.number() })),
  geo: z.array(
    z.object({
      country: z.string(),
      region: z.string(),
      city: z.string(),
      lat: z.number(),
      lon: z.number(),
      visitors: z.number(),
      visits: z.number(),
    }),
  ),
  devices: z.array(Breakdown),
  browsers: z.array(Breakdown),
  oses: z.array(Breakdown),
  languages: z.array(Breakdown),
  vitals: z.object({ byArea: z.array(VitalsRow), byCountry: z.array(VitalsRow) }),
  activeUsers: z.object({ day: z.number(), week: z.number(), month: z.number() }),
  generatedAt: z.number(),
});

const EMPTY_TOTALS = { visitors: 0, visits: 0, views: 0, newVisitors: 0, bounced: 0, engagedMs: 0 };

/** Sign-ups in `[from, to)`, per UTC day or hour, and by where they came from. */
async function signupFacts(env: Bindings, days: number, bucket: "hour" | "day") {
  const now = Date.now();
  const from = now - days * DAY_MS;
  const size = bucket === "hour" ? 3_600_000 : DAY_MS;
  const [counts, bySource, series] = await env.DB.batch([
    env.DB.prepare(
      `SELECT SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) AS value,
              SUM(CASE WHEN created_at < ?1 THEN 1 ELSE 0 END) AS previous
         FROM user_sign_ins WHERE kind = 'sign_up' AND created_at >= ?2`,
    ).bind(from, from - days * DAY_MS),
    env.DB.prepare(
      `SELECT COALESCE(channel, 'Direct') AS channel, COALESCE(source, 'Direct') AS source, COUNT(*) AS signups
         FROM user_sign_ins WHERE kind = 'sign_up' AND created_at >= ?1
        GROUP BY 1, 2 ORDER BY signups DESC LIMIT 50`,
    ).bind(from),
    env.DB.prepare(
      `SELECT CAST(created_at / ?2 AS INTEGER) * ?2 AS at, COUNT(*) AS signups
         FROM user_sign_ins WHERE kind = 'sign_up' AND created_at >= ?1
        GROUP BY 1 ORDER BY 1`,
    ).bind(from, size),
  ]);
  const c = (counts!.results[0] ?? {}) as { value?: number | null; previous?: number | null };
  return {
    signups: { value: c.value ?? 0, previous: c.previous ?? 0 },
    signupsBySource: (bySource!.results ?? []) as z.infer<typeof SignupsBy>[],
    signupSeries: (series!.results ?? []) as { at: number; signups: number }[],
  };
}

trafficRouter.get(
  "/admin/traffic",
  validator("query", TrafficQuery),
  describeRoute({
    tags: ["admin"],
    summary: "Visitors, sources, pages, places and speed for a period",
    responses: {
      200: { description: "Traffic", content: { "application/json": { schema: resolver(TrafficResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range;
    const days = TRAFFIC_RANGES[range];
    try {
      const payload = await cachedJson(c.env, `admin:traffic:${range}`, TTL[range], async () => {
        const [report, facts] = await Promise.all([
          trafficReport(c.env, range),
          signupFacts(c.env, days, days <= 2 ? "hour" : "day"),
        ]);
        return { configured: true, ...report, ...facts, generatedAt: Date.now() };
      });
      return c.json(payload);
    } catch (err) {
      if (!(err instanceof TrafficNotConfigured)) throw err;
      const facts = await signupFacts(c.env, days, days <= 2 ? "hour" : "day");
      return c.json({
        configured: false,
        range,
        bucket: days <= 2 ? "hour" : "day",
        totals: EMPTY_TOTALS,
        previous: EMPTY_TOTALS,
        series: [],
        hourly: null,
        channels: [],
        sources: [],
        referrers: [],
        campaigns: [],
        areas: [],
        pages: [],
        entries: [],
        exits: [],
        geo: [],
        devices: [],
        browsers: [],
        oses: [],
        languages: [],
        vitals: { byArea: [], byCountry: [] },
        activeUsers: { day: 0, week: 0, month: 0 },
        ...facts,
        generatedAt: Date.now(),
      });
    }
  },
);

const TrafficLiveResponse = z.object({
  configured: z.boolean(),
  minutes: z.number(),
  /** End of the newest minute, epoch ms. */
  until: z.number(),
  /** Distinct visitors in the last five minutes. */
  online: z.number(),
  visitors: z.array(z.number()),
  views: z.array(z.number()),
  pages: z.array(z.object({ area: z.string(), path: z.string(), visitors: z.number() })),
  sources: z.array(Breakdown),
  countries: z.array(Breakdown),
});

trafficRouter.get(
  "/admin/traffic/live",
  describeRoute({
    tags: ["admin"],
    summary: "Visitors a minute at a time for the last half hour, and who is here now",
    responses: {
      200: { description: "Live traffic", content: { "application/json": { schema: resolver(TrafficLiveResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    try {
      const live = await cachedJson(c.env, "admin:traffic:live", 15, () => trafficLive(c.env));
      return c.json({ configured: true, ...live });
    } catch (err) {
      if (!(err instanceof TrafficNotConfigured)) throw err;
      return c.json({
        configured: false,
        minutes: 30,
        until: Date.now(),
        online: 0,
        visitors: [],
        views: [],
        pages: [],
        sources: [],
        countries: [],
      });
    }
  },
);

// ─────────────────────────────── campaigns ───────────────────────────────

/** Lowercase, and only what survives a URL and a SQL literal untouched. */
const slugPart = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((v) => v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_.\-+]/g, ""))
    .refine((v) => v.length > 0, "Letters, numbers, dashes and underscores only");

const CampaignInput = z.object({
  name: z.string().trim().min(1).max(120),
  /** A path on the site (`/`, `/pricing`) or a form link (`/f/slug`). Never another host. */
  destination: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/[^\s]*$/, "A path on chatform, starting with /"),
  source: slugPart(60),
  medium: slugPart(60),
  campaign: slugPart(100),
  content: slugPart(100).optional(),
});

const CampaignRow = z.object({
  id: z.string(),
  name: z.string(),
  destination: z.string(),
  source: z.string(),
  medium: z.string(),
  campaign: z.string(),
  content: z.string().nullable(),
  createdAt: z.number(),
});

const CampaignStats = z.object({
  campaign: z.string(),
  visitors: z.number(),
  visits: z.number(),
  views: z.number(),
  formViews: z.number(),
  /** Accounts that signed up from the campaign in the period, and how far they got. */
  stages: z.record(z.string(), z.number()),
});

const CampaignsResponse = z.object({
  configured: z.boolean(),
  range: z.enum(RANGE_KEYS),
  links: z.array(CampaignRow),
  stats: z.array(CampaignStats),
  stageLabels: z.array(z.object({ key: z.string(), label: z.string() })),
  email: z.array(
    z.object({
      kind: z.string(),
      sent: z.number(),
      visitors: z.number(),
      visits: z.number(),
    }),
  ),
  followups: z.object({ sent: z.number(), clicked: z.number(), recovered: z.number() }),
  generatedAt: z.number(),
});

/**
 * Sign-ups per campaign, and how far each account got: the same stages as the
 * overview funnel (`STAGE_OF_ORG`), for the organizations each person belongs to.
 * The furthest one counts, so an invited teammate on a paying account is "paid".
 */
async function campaignStages(env: Bindings, from: number) {
  const columns = FUNNEL_STAGES.filter(([, , n]) => n > 0)
    .map(([key, , n]) => `SUM(CASE WHEN stage >= ${n} THEN 1 ELSE 0 END) AS ${key}`)
    .join(", ");
  const res = await env.DB.prepare(
    `SELECT campaign, COUNT(*) AS signed_up, ${columns} FROM (
       SELECT si.campaign AS campaign,
              COALESCE((SELECT MAX(${STAGE_OF_ORG}) FROM organizations o
                          JOIN members m ON m.organization_id = o.id
                         WHERE m.user_id = si.user_id), 0) AS stage
         FROM user_sign_ins si
        WHERE si.kind = 'sign_up' AND si.created_at >= ?1 AND si.campaign IS NOT NULL
     ) GROUP BY campaign`,
  )
    .bind(from)
    .all<Record<string, number | string>>();
  const out = new Map<string, Record<string, number>>();
  for (const row of res.results ?? []) {
    const stages: Record<string, number> = {};
    for (const [key] of FUNNEL_STAGES) stages[key] = Number(row[key] ?? 0);
    out.set(String(row.campaign), stages);
  }
  return out;
}

async function loadLinks(env: Bindings) {
  const res = await env.DB.prepare(
    `SELECT id, name, destination, source, medium, campaign, content, created_at AS createdAt
       FROM campaign_links WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 200`,
  ).all<z.infer<typeof CampaignRow>>();
  return res.results ?? [];
}

trafficRouter.get(
  "/admin/campaigns",
  validator("query", TrafficQuery),
  describeRoute({
    tags: ["admin"],
    summary: "Campaign links, their traffic and the accounts they brought, plus mail we sent",
    responses: {
      200: { description: "Campaigns", content: { "application/json": { schema: resolver(CampaignsResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range;
    const days = TRAFFIC_RANGES[range];
    const from = Date.now() - days * DAY_MS;

    // The links are the one part a person just changed, so they are never cached.
    const links = await loadLinks(c.env);
    const cached = await cachedJson(c.env, `admin:campaigns:${range}`, 300, async () => {
      const [stages, mail, followups] = await Promise.all([
        campaignStages(c.env, from),
        c.env.DB.prepare(
          `SELECT kind, SUM(messages) AS sent FROM mail_deliveries WHERE created_at >= ?1 AND status = 'sent' GROUP BY kind`,
        )
          .bind(from)
          .all<{ kind: string; sent: number }>(),
        c.env.DB.prepare(
          `SELECT COUNT(*) AS sent, SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked,
                  SUM(CASE WHEN recovered_at IS NOT NULL THEN 1 ELSE 0 END) AS recovered
             FROM followups WHERE sent_at >= ?1`,
        )
          .bind(from)
          .first<{ sent: number; clicked: number | null; recovered: number | null }>(),
      ]);
      let configured = true;
      let traffic: Awaited<ReturnType<typeof campaignTraffic>> = [];
      let emailVisits: Awaited<ReturnType<typeof emailTraffic>> = [];
      try {
        [traffic, emailVisits] = await Promise.all([campaignTraffic(c.env, days), emailTraffic(c.env, days)]);
      } catch (err) {
        if (!(err instanceof TrafficNotConfigured)) throw err;
        configured = false;
      }
      const names = new Set([...traffic.map((t) => t.campaign), ...stages.keys()]);
      const stats = [...names].map((campaign) => {
        const t = traffic.find((x) => x.campaign === campaign);
        return {
          campaign,
          visitors: t?.visitors ?? 0,
          visits: t?.visits ?? 0,
          views: t?.views ?? 0,
          formViews: t?.formViews ?? 0,
          stages: stages.get(campaign) ?? Object.fromEntries(FUNNEL_STAGES.map(([key]) => [key, 0])),
        };
      });
      const kinds = new Set([...(mail.results ?? []).map((m) => m.kind), ...emailVisits.map((e) => e.kind)]);
      const email = [...kinds]
        .map((kind) => {
          const v = emailVisits.find((e) => e.kind === kind);
          return {
            kind,
            sent: (mail.results ?? []).find((m) => m.kind === kind)?.sent ?? 0,
            visitors: v?.visitors ?? 0,
            visits: v?.visits ?? 0,
          };
        })
        .sort((a, b) => b.sent - a.sent);
      return {
        configured,
        stats,
        email,
        followups: {
          sent: followups?.sent ?? 0,
          clicked: followups?.clicked ?? 0,
          recovered: followups?.recovered ?? 0,
        },
        generatedAt: Date.now(),
      };
    });

    return c.json({
      range,
      links,
      stageLabels: FUNNEL_STAGES.map(([key, label]) => ({ key, label })),
      ...cached,
    });
  },
);

trafficRouter.post(
  "/admin/campaigns",
  validator("json", CampaignInput),
  describeRoute({
    tags: ["admin"],
    summary: "Save a campaign link",
    responses: {
      200: { description: "Saved", content: { "application/json": { schema: resolver(CampaignRow) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const row = {
      id: `cl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      name: input.name,
      destination: input.destination,
      source: input.source,
      medium: input.medium,
      campaign: input.campaign,
      content: input.content ?? null,
      createdAt: Date.now(),
    };
    await c.env.DB.prepare(
      `INSERT INTO campaign_links (id, name, destination, source, medium, campaign, content, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        row.id,
        row.name,
        row.destination,
        row.source,
        row.medium,
        row.campaign,
        row.content,
        c.get("platformAdminEmail") ?? null,
        row.createdAt,
      )
      .run();
    return c.json(row);
  },
);

trafficRouter.delete(
  "/admin/campaigns/:id",
  describeRoute({
    tags: ["admin"],
    summary: "Archive a campaign link. Its traffic stays counted.",
    responses: {
      200: { description: "Archived", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    await c.env.DB.prepare(`UPDATE campaign_links SET archived_at = ? WHERE id = ? AND archived_at IS NULL`)
      .bind(Date.now(), c.req.param("id"))
      .run();
    return c.json({ ok: true });
  },
);
