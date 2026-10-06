import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "../../lib/validator.js";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import {
  TRAFFIC_RANGES,
  cachedJson,
  campaignTraffic,
  emailTraffic,
  trafficLive,
  trafficReport,
  type TrafficRange,
} from "../../lib/traffic-query.js";
import { trafficStore } from "../../lib/traffic.js";
import { AUDIENCES, VISITOR_SORTS, type Audience, type VisitorRow, type VisitorSort } from "../../do/traffic-do.js";
import { DAY_MS, FUNNEL_STAGES, STAGE_OF_ORG } from "./shared.js";

/**
 * Traffic and campaigns: who comes, from where, what they look at, and whether
 * they sign up and stay.
 *
 * Traffic reads `TrafficDO` (`lib/traffic-query.ts`); sign-ups and what those
 * accounts went on to do read D1. The two meet on the attribution columns
 * `user_sign_ins` carries since migration 0050, and on the signed-in user a
 * visitor's dashboard pages report.
 *
 * Caching, by how fast the answer can change:
 *   - a range report: 60s for a day, 5 minutes for a week or a month, an hour
 *     for a quarter, whose shape a few minutes do not move.
 *   - live: 15 seconds in the isolate only. It is polled every 30 seconds.
 *   - campaigns: 5 minutes, like the overview.
 *   - visitors: 30 seconds in the isolate.
 *
 * Every read also tells the browser to keep its answer for as long (`private`),
 * so reloading the console does not ask again for what cannot have changed.
 */

export const trafficRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

const RANGE_KEYS = Object.keys(TRAFFIC_RANGES) as [TrafficRange, ...TrafficRange[]];
const AUDIENCE_KEYS = Object.keys(AUDIENCES) as [Audience, ...Audience[]];
/** Site by default: the people looking at chatform, not the people filling in a customer's form. */
const AudienceParam = z.enum(AUDIENCE_KEYS).default("site");
const TrafficQuery = z.object({ range: z.enum(RANGE_KEYS).default("7d"), audience: AudienceParam });
const CampaignsQuery = z.object({ range: z.enum(RANGE_KEYS).default("7d") });
const TTL: Record<TrafficRange, number> = { "1d": 60, "7d": 300, "30d": 300, "90d": 3600 };
const keepFor = (seconds: number) => `private, max-age=${seconds}`;

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
  range: z.enum(RANGE_KEYS),
  audience: z.enum(AUDIENCE_KEYS),
  bucket: z.enum(["hour", "day"]),
  totals: Totals,
  previous: Totals,
  signups: z.object({
    value: z.number(),
    previous: z.number(),
    /** When each sign-up of the last 24 hours happened, so the reader's own "today" can be counted. */
    recent: z.array(z.number()),
  }),
  series: z.array(
    z.object({
      at: z.number(),
      visitors: z.number(),
      visits: z.number(),
      views: z.number(),
      newVisitors: z.number(),
      /** Page views by people on their first day here. */
      newViews: z.number(),
    }),
  ),
  signupSeries: z.array(z.object({ at: z.number(), signups: z.number() })),
  /** Every hour of the period, thirty days at most: the hour-of-day clock, the weekday grid, the last 24 hours. */
  hourly: z.array(z.object({ at: z.number(), visitors: z.number(), views: z.number(), newViews: z.number() })),
  /** Seen in the last hour. */
  online: z.number(),
  /** Everyone this audience has ever had. */
  allTime: z.number(),
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
      views: z.number(),
    }),
  ),
  devices: z.array(Breakdown),
  browsers: z.array(Breakdown),
  oses: z.array(Breakdown),
  languages: z.array(Breakdown),
  vitals: z.object({ byArea: z.array(VitalsRow), byCountry: z.array(VitalsRow) }),
  /** Page views, by how many different days their reader has come. */
  loyalty: z.array(z.object({ key: z.string(), n: z.number() })),
  /** Page views, by how many pages their visit opened. */
  depth: z.array(z.object({ key: z.string(), n: z.number() })),
  sourceSeries: z.array(z.object({ at: z.number(), source: z.string(), views: z.number() })),
  activeUsers: z.object({ day: z.number(), week: z.number(), month: z.number() }),
  generatedAt: z.number(),
});

/** Sign-ups in `[from, to)`, per UTC day or hour, and by where they came from. */
async function signupFacts(env: Bindings, days: number, bucket: "hour" | "day") {
  const now = Date.now();
  const from = now - days * DAY_MS;
  const size = bucket === "hour" ? 3_600_000 : DAY_MS;
  const [counts, bySource, series, recent] = await env.DB.batch([
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
    env.DB.prepare(
      `SELECT created_at AS at FROM user_sign_ins WHERE kind = 'sign_up' AND created_at >= ?1 ORDER BY created_at DESC LIMIT 500`,
    ).bind(now - DAY_MS),
  ]);
  const c = (counts!.results[0] ?? {}) as { value?: number | null; previous?: number | null };
  return {
    signups: {
      value: c.value ?? 0,
      previous: c.previous ?? 0,
      recent: ((recent!.results ?? []) as { at: number }[]).map((r) => Number(r.at)),
    },
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
    const { range, audience } = c.req.valid("query");
    const days = TRAFFIC_RANGES[range];
    const payload = await cachedJson(c.env, `admin:traffic:${audience}:${range}`, TTL[range], async () => {
      const [report, facts] = await Promise.all([
        trafficReport(c.env, range, audience),
        // A sign-up is somebody joining chatform: it belongs to the site, never to a form's respondents.
        audience === "site" ? signupFacts(c.env, days, days <= 2 ? "hour" : "day") : NO_SIGNUPS,
      ]);
      return { ...report, ...facts, generatedAt: Date.now() };
    });
    c.header("cache-control", keepFor(Math.min(TTL[range], 300)));
    return c.json(payload);
  },
);

const NO_SIGNUPS = { signups: { value: 0, previous: 0, recent: [] as number[] }, signupsBySource: [], signupSeries: [] };

const TrafficLiveResponse = z.object({
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
  validator("query", z.object({ audience: AudienceParam })),
  describeRoute({
    tags: ["admin"],
    summary: "Visitors a minute at a time for the last half hour, and who is here now",
    responses: {
      200: { description: "Live traffic", content: { "application/json": { schema: resolver(TrafficLiveResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    c.header("cache-control", keepFor(15));
    const { audience } = c.req.valid("query");
    return c.json(await cachedJson(c.env, `admin:traffic:live:${audience}`, 15, () => trafficLive(c.env, audience)));
  },
);

// ─────────────────────────────── visitors ───────────────────────────────

/** Visitors are kept for 400 days, so this list reaches further back than the Traffic page. */
const VISITOR_RANGES = { ...TRAFFIC_RANGES, "365d": 365 } as const;
const VISITOR_RANGE_KEYS = Object.keys(VISITOR_RANGES) as [keyof typeof VISITOR_RANGES, ...(keyof typeof VISITOR_RANGES)[]];
const VISITOR_SORT_KEYS = Object.keys(VISITOR_SORTS) as [VisitorSort, ...VisitorSort[]];
const VISITOR_PAGE = 50;

const VisitorsQuery = z.object({
  range: z.enum(VISITOR_RANGE_KEYS).default("30d"),
  audience: AudienceParam,
  sort: z.enum(VISITOR_SORT_KEYS).default("recent"),
  q: z.string().trim().max(80).default(""),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

const Visitor = z.object({
  visitor: z.string(),
  first_seen: z.number(),
  last_seen: z.number(),
  visits: z.number(),
  views: z.number(),
  /** Distinct UTC days they came on. */
  days: z.number(),
  /** Visible time on every page, summed. */
  engaged_ms: z.number(),
  country: z.string(),
  region: z.string(),
  city: z.string(),
  device: z.string(),
  browser: z.string(),
  os: z.string(),
  language: z.string(),
  screen_w: z.number().nullable(),
  /** First touch: what brought them the first time. */
  channel: z.string(),
  source: z.string(),
  medium: z.string(),
  campaign: z.string(),
  referrer_host: z.string(),
  landing_area: z.string(),
  landing_path: z.string(),
  last_area: z.string(),
  last_path: z.string(),
  /** The account this browser has been signed in to, if it ever opened the dashboard. */
  user_id: z.string(),
  user_email: z.string().nullable(),
  user_name: z.string().nullable(),
});

const VisitorsResponse = z.object({ total: z.number(), pageSize: z.number(), rows: z.array(Visitor) });

const VisitorDetailResponse = z.object({
  visitor: Visitor,
  visits: z.array(
    z.object({
      visit: z.string(),
      started_at: z.number(),
      last_at: z.number(),
      views: z.number(),
      engaged_ms: z.number(),
      channel: z.string(),
      source: z.string(),
      campaign: z.string(),
      referrer_host: z.string(),
      country: z.string(),
      city: z.string(),
      device: z.string(),
      browser: z.string(),
      os: z.string(),
    }),
  ),
  /** The pages of those visits, oldest first. */
  views: z.array(
    z.object({ at: z.number(), visit: z.string(), area: z.string(), path: z.string(), engaged_ms: z.number() }),
  ),
});

/** Who each signed-in visitor is. One D1 read for the page, none when nobody on it has signed in. */
async function withUsers(env: Bindings, rows: VisitorRow[]): Promise<z.infer<typeof Visitor>[]> {
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const users = ids.length
    ? ((
        await env.DB.prepare(`SELECT id, email, name FROM users WHERE id IN (${ids.map(() => "?").join(", ")})`)
          .bind(...ids)
          .all<{ id: string; email: string; name: string | null }>()
      ).results ?? [])
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    ...r,
    user_email: byId.get(r.user_id)?.email ?? null,
    user_name: byId.get(r.user_id)?.name ?? null,
  }));
}

trafficRouter.get(
  "/admin/visitors",
  validator("query", VisitorsQuery),
  describeRoute({
    tags: ["admin"],
    summary: "Every visitor seen in a period: when they came, how often, from where, and who they are once signed in",
    responses: {
      200: { description: "Visitors", content: { "application/json": { schema: resolver(VisitorsResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const { range, audience, sort, q, offset } = c.req.valid("query");
    const payload = await cachedJson(c.env, `admin:visitors:${audience}:${range}:${sort}:${offset}:${q}`, 30, async () => {
      // A name or an email is on the account, not on the visitor: find the accounts first.
      const userIds =
        q.length >= 3
          ? ((
              await c.env.DB.prepare(`SELECT id FROM users WHERE email LIKE ?1 OR name LIKE ?1 LIMIT 50`)
                .bind(`%${q}%`)
                .all<{ id: string }>()
            ).results ?? []).map((u) => u.id)
          : [];
      const list = await trafficStore(c.env).visitors({
        since: Date.now() - VISITOR_RANGES[range] * DAY_MS,
        audience,
        sort,
        q,
        userIds,
        limit: VISITOR_PAGE,
        offset,
      });
      return { total: list.total, pageSize: VISITOR_PAGE, rows: await withUsers(c.env, list.rows) };
    });
    c.header("cache-control", keepFor(30));
    return c.json(payload);
  },
);

trafficRouter.get(
  "/admin/visitors/:id",
  describeRoute({
    tags: ["admin"],
    summary: "One visitor: their visits, and the pages of each in order",
    responses: {
      200: { description: "Visitor", content: { "application/json": { schema: resolver(VisitorDetailResponse) } } },
      404: { description: "Not an admin, or no such visitor" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const payload = await cachedJson(c.env, `admin:visitor:${id}`, 30, async () => {
      const found = await trafficStore(c.env).visitor(id);
      if (!found) return null;
      const [visitor] = await withUsers(c.env, [found.visitor]);
      return { visitor: visitor!, visits: found.visits, views: found.views };
    });
    if (!payload) return c.json({ error: { code: "not_found", message: "Not found" } }, 404);
    c.header("cache-control", keepFor(30));
    return c.json(payload);
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
  validator("query", CampaignsQuery),
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
      const [traffic, emailVisits] = await Promise.all([campaignTraffic(c.env, days), emailTraffic(c.env, days)]);
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
