import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../env.js";

/**
 * Every page view the site has, in one object's own SQLite.
 *
 * Three tables carry it, each one row per thing:
 *   - `visitors`: a browser. When it first and last came, how often, how long it
 *     stayed, where it is, and the source that first brought it.
 *   - `visits`: one sitting. When it started and ended, the page it came in and
 *     left on, and where it came from.
 *   - `views`: one page opened, with the time it was actually looked at and the
 *     page's web vitals.
 *
 * A view is a handful of local writes in one transaction: no network, no D1, no
 * queue. The reports are plain SQL with joins, read by the platform console
 * through `lib/traffic-query.ts`.
 *
 * Nothing here runs on a schedule. Old rows are deleted from the write path, at
 * most once an hour.
 *
 * Text columns hold "" rather than NULL when unknown, so a breakdown never has
 * a null key and "known" is always `!= ''`.
 *
 * The tables are created here, in the constructor, and so is any column added
 * since: there is no migration file for a Durable Object's own SQLite.
 */

/** One beacon, already filtered and enriched by `lib/traffic.ts`. */
export interface TrafficHit {
  at: number;
  event: "view" | "leave";
  visitor: string;
  /** An id this same browser was counted under before; its rows move to `visitor`. */
  previous?: string;
  visit: string;
  area: string;
  path: string;
  referrerHost: string;
  channel: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  /** The saved campaign link the visit came through (`utm_id`), or "". */
  link: string;
  country: string;
  region: string;
  city: string;
  lat: number | null;
  lon: number | null;
  device: string;
  browser: string;
  os: string;
  language: string;
  screenW: number | null;
  userId: string;
  /** On `leave`: visible time on the page, and its web vitals. */
  engagedMs: number;
  lcp: number | null;
  inp: number | null;
  ttfb: number | null;
  cls: number | null;
}

export interface Breakdown {
  key: string;
  visitors: number;
  visits: number;
  views: number;
}

export interface PageRow {
  area: string;
  path: string;
  visitors: number;
  visits: number;
  views: number;
}

export interface TrafficTotals {
  visitors: number;
  visits: number;
  views: number;
  newVisitors: number;
  /** Visits that saw exactly one page. */
  bounced: number;
  /** Visible time, summed over every page opened in the period. */
  engagedMs: number;
}

export interface Vitals {
  key: string;
  samples: number;
  lcp: number | null;
  inp: number | null;
  ttfb: number | null;
  cls: number | null;
}

export interface VisitorRow {
  visitor: string;
  first_seen: number;
  last_seen: number;
  visits: number;
  views: number;
  days: number;
  engaged_ms: number;
  country: string;
  region: string;
  city: string;
  device: string;
  browser: string;
  os: string;
  language: string;
  screen_w: number | null;
  channel: string;
  source: string;
  medium: string;
  campaign: string;
  referrer_host: string;
  landing_area: string;
  landing_path: string;
  last_area: string;
  last_path: string;
  user_id: string;
}

export interface VisitRow {
  visit: string;
  started_at: number;
  last_at: number;
  views: number;
  engaged_ms: number;
  channel: string;
  source: string;
  campaign: string;
  referrer_host: string;
  country: string;
  city: string;
  device: string;
  browser: string;
  os: string;
}

export interface ViewRow {
  at: number;
  visit: string;
  area: string;
  path: string;
  engaged_ms: number;
}

export const VISITOR_SORTS = {
  recent: "last_seen DESC",
  views: "views DESC, last_seen DESC",
  visits: "visits DESC, last_seen DESC",
  days: "days DESC, last_seen DESC",
  time: "engaged_ms DESC, last_seen DESC",
} as const;
export type VisitorSort = keyof typeof VISITOR_SORTS;

/**
 * Who a page view belongs to. People looking at chatform itself (the site, the
 * docs, sign-in, the dashboard and the builder) and people filling in somebody's
 * form are different crowds, and no report mixes them.
 */
export const AUDIENCES = {
  site: ["marketing", "docs", "auth", "app", "builder"],
  respondents: ["form", "embed"],
} as const;
export type Audience = keyof typeof AUDIENCES;

/** `AND <column> IN (…)` for an audience's areas; nothing when the caller wants everyone. */
const inAudience = (column: string, audience?: Audience): string =>
  audience ? `AND ${column} IN (${AUDIENCES[audience].map((a) => `'${a}'`).join(", ")})` : "";

/**
 * Narrowing a report to one campaign (`utm_campaign`, lowercased). The value is
 * whatever a link carried, so it is always bound, never written into the SQL:
 * each fragment holds one bare `?`, goes after every other placeholder of its
 * query, and `binds` is spread after every other bind.
 */
function forCampaign(campaign?: string) {
  const on = !!campaign;
  return {
    binds: on ? [campaign!] : [],
    /** A page view belongs to a campaign when its visit came from it. */
    views: (column: string) => (on ? `AND ${column} IN (SELECT visit FROM visits WHERE campaign = ?)` : ""),
    /** On `visits`, and on `visitors` where it reads as "first came from". */
    own: on ? "AND campaign = ?" : "",
    /** A visitor who has ever come through it: for who is here now. */
    visitor: on ? "AND visitor IN (SELECT visitor FROM visits WHERE campaign = ?)" : "",
  };
}

/**
 * What the Campaigns page counts: tagged visits to chatform itself. Mail we send
 * tags its own links (`lib/mail-jobs.ts`) and a customer's form can be shared
 * with any tags its author likes; neither is a campaign of ours. A visit that
 * came through a saved link counts wherever that link pointed, a form included.
 */
const MARKETING = `s.campaign != '' AND NOT (s.source = 'Chatform' AND s.medium = 'email')
  AND (w.area IN ('marketing', 'docs', 'auth', 'app', 'builder') OR s.link != '')`;

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Page-level rows are the bulk; visits and visitors are small and kept longer. */
const VIEW_DAYS = 180;
const VISIT_DAYS = 400;
const LIVE_MINUTES = 30;
const ONLINE_MS = 5 * MINUTE;

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const VISITOR_COLUMNS =
  "visitor, first_seen, last_seen, visits, views, days, engaged_ms, country, region, city, device, browser, os, language, screen_w, channel, source, medium, campaign, referrer_host, landing_area, landing_path, last_area, last_path, user_id";
const VISITOR_SEARCH = ["visitor", "country", "region", "city", "browser", "os", "source", "campaign", "referrer_host", "landing_path", "user_id"];

/**
 * How a view updates a visitor who already has a row. Hits nearly always arrive
 * in order, but a late one must not rewrite the present, so each side says
 * which way it may move: where they are now follows the newest hit (and an
 * unknown value never erases a known one), and what first brought them follows
 * the oldest.
 */
const LATEST = ["country", "region", "city", "device", "browser", "os", "language", "last_area", "last_path", "user_id"]
  .map((c) => `${c} = CASE WHEN excluded.${c} != '' AND excluded.last_seen >= last_seen THEN excluded.${c} ELSE ${c} END`)
  .join(", ");
const FIRST_TOUCH = ["channel", "source", "medium", "campaign", "referrer_host", "landing_area", "landing_path"]
  .map((c) => `${c} = CASE WHEN excluded.first_seen < first_seen THEN excluded.${c} ELSE ${c} END`)
  .join(", ");

/** p75 of the values that were measured. */
function p75(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v != null).sort((a, b) => a - b);
  return xs.length ? xs[Math.min(xs.length - 1, Math.ceil(xs.length * 0.75) - 1)]! : null;
}

export class TrafficDO extends DurableObject<Bindings> {
  private sql: SqlStorage;
  private lastPrune = 0;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS visitors (
        visitor TEXT PRIMARY KEY, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
        visits INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, days INTEGER NOT NULL DEFAULT 0,
        engaged_ms INTEGER NOT NULL DEFAULT 0,
        country TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', lat REAL, lon REAL,
        device TEXT NOT NULL DEFAULT '', browser TEXT NOT NULL DEFAULT '', os TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '', screen_w INTEGER,
        channel TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', medium TEXT NOT NULL DEFAULT '',
        campaign TEXT NOT NULL DEFAULT '', referrer_host TEXT NOT NULL DEFAULT '',
        landing_area TEXT NOT NULL DEFAULT '', landing_path TEXT NOT NULL DEFAULT '',
        last_area TEXT NOT NULL DEFAULT '', last_path TEXT NOT NULL DEFAULT '', user_id TEXT NOT NULL DEFAULT '');
      CREATE INDEX IF NOT EXISTS visitors_last_seen ON visitors (last_seen);
      CREATE TABLE IF NOT EXISTS visits (
        visit TEXT PRIMARY KEY, visitor TEXT NOT NULL, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
        views INTEGER NOT NULL DEFAULT 0, engaged_ms INTEGER NOT NULL DEFAULT 0,
        channel TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', medium TEXT NOT NULL DEFAULT '',
        campaign TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', referrer_host TEXT NOT NULL DEFAULT '',
        entry_area TEXT NOT NULL DEFAULT '', entry_path TEXT NOT NULL DEFAULT '',
        exit_area TEXT NOT NULL DEFAULT '', exit_path TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', lat REAL, lon REAL,
        device TEXT NOT NULL DEFAULT '', browser TEXT NOT NULL DEFAULT '', os TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '', user_id TEXT NOT NULL DEFAULT '');
      CREATE INDEX IF NOT EXISTS visits_last_at ON visits (last_at);
      CREATE INDEX IF NOT EXISTS visits_visitor ON visits (visitor, started_at);
      CREATE TABLE IF NOT EXISTS views (
        at INTEGER NOT NULL, visitor TEXT NOT NULL, visit TEXT NOT NULL, area TEXT NOT NULL, path TEXT NOT NULL,
        engaged_ms INTEGER NOT NULL DEFAULT 0, lcp INTEGER, inp INTEGER, ttfb INTEGER, cls REAL);
      CREATE INDEX IF NOT EXISTS views_at ON views (at);
      CREATE INDEX IF NOT EXISTS views_visit ON views (visit, at);
      CREATE TABLE IF NOT EXISTS seen (day TEXT NOT NULL, visitor TEXT NOT NULL, PRIMARY KEY (day, visitor)) WITHOUT ROWID;
    `);
    // Added after the table had rows: the saved link a visit came through. A constant
    // default, so SQLite adds the column without rewriting a row.
    if (!this.all<{ name: string }>("SELECT name FROM pragma_table_info('visits')").some((c) => c.name === "link")) {
      this.sql.exec("ALTER TABLE visits ADD COLUMN link TEXT NOT NULL DEFAULT ''");
    }
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS visits_campaign ON visits (campaign, last_at);
      CREATE INDEX IF NOT EXISTS visits_link ON visits (link, last_at);
      CREATE INDEX IF NOT EXISTS visitors_campaign ON visitors (campaign);
    `);
  }

  private all<T>(query: string, ...binds: (string | number | null)[]): T[] {
    return this.sql.exec(query, ...binds).toArray() as T[];
  }

  // ─────────────────────────────── writing ───────────────────────────────

  record(hit: TrafficHit): void {
    this.ctx.storage.transactionSync(() => (hit.event === "view" ? this.view(hit) : this.leave(hit)));
    this.prune(Date.now());
  }

  /**
   * A browser known by a new id: everything recorded under the old one moves
   * to it, so a returning visitor keeps their history. Only when the new id
   * has none of its own yet; two histories are never merged.
   */
  private rename(from: string, to: string): void {
    if (this.all("SELECT 1 FROM visitors WHERE visitor = ?", to).length) return;
    if (this.sql.exec("UPDATE visitors SET visitor = ? WHERE visitor = ?", to, from).rowsWritten === 0) return;
    this.sql.exec("UPDATE views SET visitor = ?1 WHERE visit IN (SELECT visit FROM visits WHERE visitor = ?2)", to, from);
    this.sql.exec("UPDATE visits SET visitor = ? WHERE visitor = ?", to, from);
    this.sql.exec("UPDATE OR IGNORE seen SET visitor = ? WHERE visitor = ?", to, from);
  }

  private view(h: TrafficHit): void {
    const sql = this.sql;
    if (h.previous) this.rename(h.previous, h.visitor);
    const newVisit =
      sql.exec(
        `INSERT OR IGNORE INTO visits (visit, visitor, started_at, last_at, views, channel, source, medium, campaign, content, referrer_host,
           entry_area, entry_path, exit_area, exit_path, country, region, city, lat, lon, device, browser, os, language, user_id, link)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        h.visit, h.visitor, h.at, h.at, h.channel, h.source, h.medium, h.campaign, h.content, h.referrerHost,
        h.area, h.path, h.area, h.path, h.country, h.region, h.city, h.lat, h.lon, h.device, h.browser, h.os, h.language, h.userId,
        h.link ?? "",
      ).rowsWritten > 0;
    if (!newVisit) {
      sql.exec(
        `UPDATE visits SET last_at = MAX(last_at, ?1), views = views + 1, exit_area = ?2, exit_path = ?3,
                user_id = CASE WHEN ?4 != '' THEN ?4 ELSE user_id END
          WHERE visit = ?5`,
        h.at, h.area, h.path, h.userId, h.visit,
      );
    }
    const newDay = sql.exec("INSERT OR IGNORE INTO seen (day, visitor) VALUES (?, ?)", utcDay(h.at), h.visitor).rowsWritten > 0;
    sql.exec("INSERT INTO views (at, visitor, visit, area, path) VALUES (?, ?, ?, ?, ?)", h.at, h.visitor, h.visit, h.area, h.path);
    sql.exec(
      `INSERT INTO visitors (visitor, first_seen, last_seen, visits, views, days, country, region, city, lat, lon, device, browser, os,
         language, screen_w, channel, source, medium, campaign, referrer_host, landing_area, landing_path, last_area, last_path, user_id)
       VALUES (?, ?, ?, 1, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (visitor) DO UPDATE SET
         first_seen = MIN(first_seen, excluded.first_seen), last_seen = MAX(last_seen, excluded.last_seen),
         visits = visits + ?, views = views + 1, days = days + ?,
         lat = COALESCE(excluded.lat, lat), lon = COALESCE(excluded.lon, lon), screen_w = COALESCE(excluded.screen_w, screen_w),
         ${LATEST}, ${FIRST_TOUCH}`,
      h.visitor, h.at, h.at, h.country, h.region, h.city, h.lat, h.lon, h.device, h.browser, h.os,
      h.language, h.screenW, h.channel, h.source, h.medium, h.campaign, h.referrerHost, h.area, h.path, h.area, h.path, h.userId,
      newVisit ? 1 : 0, newDay ? 1 : 0,
    );
  }

  /**
   * The page was hidden or left: its visible time goes on the view it belongs
   * to, and moves the end of the visit. A leave whose view never arrived
   * (blocked, rate limited) updates nothing, so it cannot invent a visit.
   */
  private leave(h: TrafficHit): void {
    const ms = Math.round(h.engagedMs);
    this.sql.exec(
      `UPDATE views SET engaged_ms = engaged_ms + ?1, lcp = COALESCE(lcp, ?2), inp = COALESCE(inp, ?3),
              ttfb = COALESCE(ttfb, ?4), cls = COALESCE(cls, ?5)
        WHERE rowid = (SELECT rowid FROM views WHERE visit = ?6 ORDER BY (area = ?7 AND path = ?8) DESC, at DESC LIMIT 1)`,
      ms, h.lcp, h.inp, h.ttfb, h.cls, h.visit, h.area, h.path,
    );
    this.sql.exec(
      `UPDATE visits SET last_at = MAX(last_at, ?1), engaged_ms = engaged_ms + ?2,
              user_id = CASE WHEN ?3 != '' THEN ?3 ELSE user_id END
        WHERE visit = ?4`,
      h.at, ms, h.userId, h.visit,
    );
    this.sql.exec(
      `UPDATE visitors SET last_seen = MAX(last_seen, ?1), engaged_ms = engaged_ms + ?2,
              user_id = CASE WHEN ?3 != '' THEN ?3 ELSE user_id END
        WHERE visitor = ?4`,
      h.at, ms, h.userId, h.visitor,
    );
  }

  private prune(now: number): void {
    if (now - this.lastPrune < HOUR) return;
    this.lastPrune = now;
    this.sql.exec("DELETE FROM views WHERE at < ?", now - VIEW_DAYS * DAY);
    this.sql.exec("DELETE FROM visits WHERE last_at < ?", now - VISIT_DAYS * DAY);
    this.sql.exec("DELETE FROM visitors WHERE last_seen < ?", now - VISIT_DAYS * DAY);
    this.sql.exec("DELETE FROM seen WHERE day < ?", utcDay(now - VISIT_DAYS * DAY));
  }

  // ─────────────────────────────── reading ───────────────────────────────

  /** Views in `[from, to)` grouped by `expr`, a column of the view (`w`) or of its visit (`s`). */
  private breakdown(expr: string, from: number, to: number, limit: number, where = "", audience?: Audience, campaign?: string): Breakdown[] {
    const only = forCampaign(campaign);
    return this.all<Breakdown>(
      `SELECT ${expr} AS key, COUNT(DISTINCT w.visitor) AS visitors, COUNT(DISTINCT w.visit) AS visits, COUNT(*) AS views
         FROM views w JOIN visits s ON s.visit = w.visit
        WHERE w.at >= ? AND w.at < ? ${inAudience("w.area", audience)} ${where} ${only.views("w.visit")}
        GROUP BY key ORDER BY views DESC LIMIT ${limit}`,
      from, to, ...only.binds,
    );
  }

  private totals(from: number, to: number, audience?: Audience, campaign?: string): TrafficTotals {
    const only = forCampaign(campaign);
    const t = this.all<{ visitors: number; visits: number; views: number; engaged: number | null }>(
      `SELECT COUNT(DISTINCT visitor) AS visitors, COUNT(DISTINCT visit) AS visits, COUNT(*) AS views, SUM(engaged_ms) AS engaged
         FROM views WHERE at >= ? AND at < ? ${inAudience("area", audience)} ${only.views("visit")}`,
      from, to, ...only.binds,
    )[0]!;
    const one = (query: string, ...binds: (string | number)[]) => this.all<{ n: number }>(query, ...binds)[0]!.n;
    return {
      visitors: t.visitors,
      visits: t.visits,
      views: t.views,
      // `last_seen` is the indexed column, and nobody first seen after `from` was last seen before it.
      // New to an audience means it is where they first landed.
      newVisitors: one(
        `SELECT COUNT(*) AS n FROM visitors WHERE last_seen >= ?1 AND first_seen >= ?1 AND first_seen < ?2 ${inAudience("landing_area", audience)} ${only.own}`,
        from, to, ...only.binds,
      ),
      bounced: one(
        `SELECT COUNT(*) AS n FROM (SELECT visit FROM views WHERE at >= ? AND at < ? ${inAudience("area", audience)} ${only.views("visit")} GROUP BY visit HAVING COUNT(*) = 1)`,
        from, to, ...only.binds,
      ),
      engagedMs: t.engaged ?? 0,
    };
  }

  /** p75 of each web vital per area and per country, over the newest pages that measured one. */
  private vitals(from: number, audience?: Audience, campaign?: string): { byArea: Vitals[]; byCountry: Vitals[] } {
    const only = forCampaign(campaign);
    type Sample = { area: string; country: string; lcp: number | null; inp: number | null; ttfb: number | null; cls: number | null };
    const rows = this.all<Sample>(
      `SELECT w.area, s.country, w.lcp, w.inp, w.ttfb, w.cls FROM views w JOIN visits s ON s.visit = w.visit
        WHERE w.at >= ? ${inAudience("w.area", audience)} AND (w.lcp IS NOT NULL OR w.ttfb IS NOT NULL) ${only.views("w.visit")}
        ORDER BY w.at DESC LIMIT 20000`,
      from, ...only.binds,
    );
    const by = (key: "area" | "country", limit: number): Vitals[] => {
      const groups = new Map<string, Sample[]>();
      for (const r of rows) {
        if (!r[key]) continue;
        const list = groups.get(r[key]);
        if (list) list.push(r);
        else groups.set(r[key], [r]);
      }
      return [...groups]
        .map(([k, list]) => ({
          key: k,
          samples: list.length,
          lcp: p75(list.map((r) => r.lcp)),
          inp: p75(list.map((r) => r.inp)),
          ttfb: p75(list.map((r) => r.ttfb)),
          cls: p75(list.map((r) => r.cls)),
        }))
        .sort((a, b) => b.samples - a.samples)
        .slice(0, limit);
    };
    return { byArea: by("area", 10), byCountry: by("country", 12) };
  }

  /**
   * Everything the Traffic page shows for the last `days` days of one audience,
   * and the totals of the period before. The two audiences never share a number:
   * every query below is bounded to the audience's areas. With a `campaign`,
   * every one is also narrowed to the visits that came from it (`forCampaign`).
   */
  report(days: number, audience: Audience, campaign?: string) {
    const only = forCampaign(campaign);
    const V = only.views("w.visit");
    const now = Date.now();
    const to = now + MINUTE;
    const from = now - days * DAY;
    const hourly = days <= 2;
    const size = hourly ? HOUR : DAY;
    const W = inAudience("w.area", audience);
    // A view by someone on their first day here: what "new" means for a page view.
    const FIRST_DAY = `SUM(v.first_seen / ${DAY} = w.at / ${DAY})`;

    const fresh = new Map(
      this.all<{ at: number; n: number }>(
        `SELECT first_seen / ${size} * ${size} AS at, COUNT(*) AS n FROM visitors
          WHERE last_seen >= ?1 AND first_seen >= ?1 ${inAudience("landing_area", audience)} ${only.own} GROUP BY 1`,
        from, ...only.binds,
      ).map((r) => [r.at, r.n]),
    );
    const series = this.all<{ at: number; visitors: number; visits: number; views: number; newViews: number }>(
      `SELECT w.at / ${size} * ${size} AS at, COUNT(DISTINCT w.visitor) AS visitors, COUNT(DISTINCT w.visit) AS visits,
              COUNT(*) AS views, ${FIRST_DAY} AS newViews
         FROM views w JOIN visitors v ON v.visitor = w.visitor WHERE w.at >= ? ${W} ${V} GROUP BY 1 ORDER BY 1`,
      from, ...only.binds,
    ).map((r) => ({ ...r, newVisitors: fresh.get(r.at) ?? 0 }));

    const activeUsers = (d: number) =>
      this.all<{ n: number }>(
        `SELECT COUNT(DISTINCT user_id) AS n FROM visits WHERE last_at >= ? AND user_id != '' ${only.own}`,
        now - d * DAY, ...only.binds,
      )[0]!.n;
    const one = (query: string, ...binds: (string | number)[]) => this.all<{ n: number }>(query, ...binds)[0]!.n;

    return {
      bucket: hourly ? ("hour" as const) : ("day" as const),
      totals: this.totals(from, to, audience, campaign),
      previous: this.totals(from - days * DAY, from, audience, campaign),
      series,
      // Every hour of the period (thirty days at most), for the hour-of-day clock, the weekday
      // grid and the last-24-hours chart, each folded into the reader's zone on the client.
      hourly: this.all<{ at: number; visitors: number; views: number; newViews: number }>(
        `SELECT w.at / ${HOUR} * ${HOUR} AS at, COUNT(DISTINCT w.visitor) AS visitors, COUNT(*) AS views, ${FIRST_DAY} AS newViews
           FROM views w JOIN visitors v ON v.visitor = w.visitor WHERE w.at >= ? ${W} ${V} GROUP BY 1 ORDER BY 1`,
        now - Math.min(Math.max(days, 1), 30) * DAY, ...only.binds,
      ),
      // Seen in the last hour, and everyone this audience has ever had.
      online: one(
        `SELECT COUNT(*) AS n FROM visitors WHERE last_seen >= ? ${inAudience("last_area", audience)} ${only.visitor}`,
        now - HOUR, ...only.binds,
      ),
      allTime: one(`SELECT COUNT(*) AS n FROM visitors WHERE 1 = 1 ${inAudience("landing_area", audience)} ${only.own}`, ...only.binds),
      channels: this.breakdown("s.channel", from, to, 10, "", audience, campaign),
      sources: this.all<{ source: string; channel: string; visitors: number; visits: number; views: number }>(
        `SELECT s.source, s.channel, COUNT(DISTINCT w.visitor) AS visitors, COUNT(DISTINCT w.visit) AS visits, COUNT(*) AS views
           FROM views w JOIN visits s ON s.visit = w.visit WHERE w.at >= ? ${W} ${V}
          GROUP BY s.source, s.channel ORDER BY views DESC LIMIT 25`,
        from, ...only.binds,
      ),
      referrers: this.breakdown("s.referrer_host", from, to, 25, "AND s.referrer_host != ''", audience, campaign),
      campaigns: this.breakdown("s.campaign", from, to, 25, "AND s.campaign != ''", audience, campaign),
      areas: this.breakdown("w.area", from, to, 10, "", audience, campaign),
      pages: this.all<PageRow>(
        `SELECT w.area, w.path, COUNT(DISTINCT w.visitor) AS visitors, COUNT(DISTINCT w.visit) AS visits, COUNT(*) AS views
           FROM views w WHERE w.at >= ? ${W} ${V} GROUP BY w.area, w.path ORDER BY views DESC LIMIT 40`,
        from, ...only.binds,
      ),
      // The page each visit started on, and the one it ended on.
      entries: this.all<PageRow>(
        `SELECT entry_area AS area, entry_path AS path, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS visits, COUNT(*) AS views
           FROM visits WHERE last_at >= ?1 AND started_at >= ?1 ${inAudience("entry_area", audience)} ${only.own}
          GROUP BY 1, 2 ORDER BY visits DESC LIMIT 25`,
        from, ...only.binds,
      ),
      exits: this.all<{ area: string; path: string; visits: number }>(
        `SELECT exit_area AS area, exit_path AS path, COUNT(*) AS visits
           FROM visits WHERE last_at >= ? ${inAudience("exit_area", audience)} ${only.own} GROUP BY 1, 2 ORDER BY visits DESC LIMIT 25`,
        from, ...only.binds,
      ),
      geo: this.all<{
        country: string; region: string; city: string; lat: number | null; lon: number | null;
        visitors: number; visits: number; views: number;
      }>(
        `SELECT s.country, s.region, s.city, AVG(s.lat) AS lat, AVG(s.lon) AS lon,
                COUNT(DISTINCT w.visitor) AS visitors, COUNT(DISTINCT w.visit) AS visits, COUNT(*) AS views
           FROM views w JOIN visits s ON s.visit = w.visit WHERE w.at >= ? ${W} AND s.country != '' ${V}
          GROUP BY s.country, s.region, s.city ORDER BY views DESC LIMIT 400`,
        from, ...only.binds,
      ).map((g) => ({ ...g, lat: Math.round((g.lat ?? 0) * 10) / 10, lon: Math.round((g.lon ?? 0) * 10) / 10 })),
      devices: this.breakdown("s.device", from, to, 5, "AND s.device != ''", audience, campaign),
      browsers: this.breakdown("s.browser", from, to, 10, "AND s.browser != ''", audience, campaign),
      oses: this.breakdown("s.os", from, to, 10, "AND s.os != ''", audience, campaign),
      languages: this.breakdown("substr(s.language, 1, 2)", from, to, 10, "AND s.language != ''", audience, campaign),
      vitals: this.vitals(from, audience, campaign),
      // Page views by how many different days their reader has come, and by how many pages their visit opened.
      loyalty: this.all<{ key: string; n: number }>(
        `SELECT CASE WHEN v.days <= 1 THEN '1 day' WHEN v.days <= 3 THEN '2 to 3 days' WHEN v.days <= 9 THEN '4 to 9 days' ELSE '10+ days' END AS key,
                COUNT(*) AS n FROM views w JOIN visitors v ON v.visitor = w.visitor WHERE w.at >= ? ${W} ${V} GROUP BY key ORDER BY MIN(v.days)`,
        from, ...only.binds,
      ),
      depth: this.all<{ key: string; n: number }>(
        `SELECT CASE WHEN s.views <= 1 THEN '1 page' WHEN s.views <= 3 THEN '2 to 3 pages' WHEN s.views <= 9 THEN '4 to 9 pages' ELSE '10+ pages' END AS key,
                COUNT(*) AS n FROM views w JOIN visits s ON s.visit = w.visit WHERE w.at >= ? ${W} ${V} GROUP BY key ORDER BY MIN(s.views)`,
        from, ...only.binds,
      ),
      // Page views per bucket per source, for the stacked chart; the client keeps the top few and folds the rest.
      sourceSeries: this.all<{ at: number; source: string; views: number }>(
        `SELECT w.at / ${size} * ${size} AS at, s.source, COUNT(*) AS views
           FROM views w JOIN visits s ON s.visit = w.visit WHERE w.at >= ? ${W} ${V} GROUP BY 1, 2`,
        from, ...only.binds,
      ),
      // People signed in to the dashboard or builder: today, this week, this month.
      activeUsers: { day: activeUsers(1), week: activeUsers(7), month: activeUsers(30) },
    };
  }

  /** The last half hour a minute at a time, who is here now, and where, for one audience. */
  live(audience: Audience, campaign?: string) {
    const only = forCampaign(campaign);
    const now = Date.now();
    const until = Math.floor(now / MINUTE) * MINUTE + MINUTE;
    const from = until - LIVE_MINUTES * MINUTE;
    const recent = now - ONLINE_MS;
    const visitors = new Array<number>(LIVE_MINUTES).fill(0);
    const views = new Array<number>(LIVE_MINUTES).fill(0);
    for (const r of this.all<{ at: number; visitors: number; views: number }>(
      `SELECT at / ${MINUTE} * ${MINUTE} AS at, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS views
         FROM views WHERE at >= ? ${inAudience("area", audience)} ${only.views("visit")} GROUP BY 1`,
      from, ...only.binds,
    )) {
      const i = Math.floor((r.at - from) / MINUTE);
      if (i >= 0 && i < LIVE_MINUTES) {
        visitors[i] = r.visitors;
        views[i] = r.views;
      }
    }
    return {
      minutes: LIVE_MINUTES,
      until,
      // Seen in the last five minutes, on the page they were last on: a leave counts, so someone reading does too.
      online: this.all<{ n: number }>(
        `SELECT COUNT(*) AS n FROM visitors WHERE last_seen >= ? ${inAudience("last_area", audience)} ${only.visitor}`,
        recent, ...only.binds,
      )[0]!.n,
      visitors,
      views,
      pages: this.all<{ area: string; path: string; visitors: number }>(
        `SELECT last_area AS area, last_path AS path, COUNT(*) AS visitors FROM visitors
          WHERE last_seen >= ? ${inAudience("last_area", audience)} ${only.visitor} GROUP BY 1, 2 ORDER BY visitors DESC LIMIT 10`,
        recent, ...only.binds,
      ),
      sources: this.breakdown("s.source", from, until, 8, "", audience, campaign),
      countries: this.breakdown("s.country", recent, until, 8, "AND s.country != ''", audience, campaign),
    };
  }

  /**
   * Every campaign's traffic for the last `days` days, for the Campaigns page:
   * per campaign with the period before, per saved link, and a day at a time.
   * Visitors are counted, not clicks: a redirect is hit by every link preview
   * and crawler, a recorded visit is a person who saw the page.
   */
  campaignStats(days: number) {
    const now = Date.now();
    const from = now - days * DAY;
    const before = from - days * DAY;
    const JOINED = `FROM views w JOIN visits s ON s.visit = w.visit`;
    const everyone = this.all<{ visitors: number; previous: number }>(
      `SELECT COUNT(DISTINCT CASE WHEN w.at >= ?1 THEN w.visitor END) AS visitors,
              COUNT(DISTINCT CASE WHEN w.at < ?1 THEN w.visitor END) AS previous
         ${JOINED} WHERE w.at >= ?2 AND ${MARKETING}`,
      from, before,
    )[0]!;
    return {
      totals: everyone,
      campaigns: this.all<{ campaign: string; visitors: number; previous: number; visits: number; views: number }>(
        `SELECT s.campaign, COUNT(DISTINCT CASE WHEN w.at >= ?1 THEN w.visitor END) AS visitors,
                COUNT(DISTINCT CASE WHEN w.at < ?1 THEN w.visitor END) AS previous,
                COUNT(DISTINCT CASE WHEN w.at >= ?1 THEN w.visit END) AS visits,
                SUM(w.at >= ?1) AS views
           ${JOINED} WHERE w.at >= ?2 AND ${MARKETING} GROUP BY s.campaign ORDER BY visitors DESC LIMIT 300`,
        from, before,
      ),
      links: this.all<{ link: string; visitors: number; visits: number; views: number }>(
        `SELECT s.link, COUNT(DISTINCT w.visitor) AS visitors, COUNT(DISTINCT w.visit) AS visits, COUNT(*) AS views
           ${JOINED} WHERE w.at >= ? AND s.link != '' AND ${MARKETING} GROUP BY s.link LIMIT 2000`,
        from,
      ),
      /** When each saved link last brought anyone, however long ago: what makes a link "quiet". */
      linkLastVisit: this.all<{ link: string; at: number }>(
        `SELECT link, MAX(last_at) AS at FROM visits WHERE link != '' GROUP BY link LIMIT 2000`,
      ),
      series: this.all<{ campaign: string; at: number; visitors: number }>(
        `SELECT s.campaign, w.at / ${DAY} * ${DAY} AS at, COUNT(DISTINCT w.visitor) AS visitors
           ${JOINED} WHERE w.at >= ? AND ${MARKETING} GROUP BY 1, 2 ORDER BY 2`,
        from,
      ),
    };
  }

  /** One campaign: its totals and the period before, a day at a time, per link, and where its visitors came from and landed. */
  campaignDetail(key: string, days: number) {
    const now = Date.now();
    const from = now - days * DAY;
    const before = from - days * DAY;
    const WHERE = `FROM views w JOIN visits s ON s.visit = w.visit WHERE w.at >= ?1 AND ${MARKETING} AND s.campaign = ?2`;
    const by = (expr: string, extra = "") =>
      this.all<Breakdown>(
        `SELECT ${expr} AS key, COUNT(DISTINCT w.visitor) AS visitors, COUNT(DISTINCT w.visit) AS visits, COUNT(*) AS views
           ${WHERE} ${extra} GROUP BY key ORDER BY visitors DESC LIMIT 12`,
        from, key,
      );
    return {
      totals: this.all<{ visitors: number; previous: number; visits: number; views: number }>(
        `SELECT COUNT(DISTINCT CASE WHEN w.at >= ?3 THEN w.visitor END) AS visitors,
                COUNT(DISTINCT CASE WHEN w.at < ?3 THEN w.visitor END) AS previous,
                COUNT(DISTINCT CASE WHEN w.at >= ?3 THEN w.visit END) AS visits,
                SUM(w.at >= ?3) AS views
           ${WHERE}`,
        before, key, from,
      )[0]!,
      series: this.all<{ at: number; visitors: number; visits: number }>(
        `SELECT w.at / ${DAY} * ${DAY} AS at, COUNT(DISTINCT w.visitor) AS visitors, COUNT(DISTINCT w.visit) AS visits
           ${WHERE} GROUP BY 1 ORDER BY 1`,
        from, key,
      ),
      /** `key` is the link id, "" for visits that carried the campaign and no link. */
      links: by("s.link"),
      linkLastVisit: this.all<{ link: string; at: number }>(
        `SELECT link, MAX(last_at) AS at FROM visits WHERE campaign = ? AND link != '' GROUP BY link`,
        key,
      ),
      sources: by("s.source"),
      countries: by("s.country", "AND s.country != ''"),
      landings: by("s.entry_path"),
    };
  }

  /** Visits that arrived from mail we sent, per mail kind (`utm_campaign`). */
  emailVisits(days: number) {
    return this.all<{ kind: string; visitors: number; visits: number }>(
      `SELECT campaign AS kind, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS visits
         FROM visits WHERE last_at >= ? AND medium = 'email' AND source = 'Chatform'
        GROUP BY campaign ORDER BY visits DESC LIMIT 30`,
      Date.now() - days * DAY,
    );
  }

  /** One whole UTC day, as the `traffic_*` metrics `platform_metrics_daily` keeps for good. */
  dailyRollup(day: string) {
    const from = Date.parse(`${day}T00:00:00Z`);
    const to = from + DAY;
    const t = this.totals(from, to);
    const rows: { metric: string; dimension: string; value: number }[] = [
      { metric: "traffic_visitors", dimension: "", value: t.visitors },
      { metric: "traffic_visits", dimension: "", value: t.visits },
      { metric: "traffic_views", dimension: "", value: t.views },
    ];
    const add = (metric: string, list: Breakdown[]) => {
      for (const b of list) rows.push({ metric, dimension: b.key, value: b.visitors });
    };
    add("traffic_visitors_by_channel", this.breakdown("s.channel", from, to, 20));
    add("traffic_visitors_by_area", this.breakdown("w.area", from, to, 20));
    add("traffic_visitors_by_country", this.breakdown("s.country", from, to, 50, "AND s.country != ''"));
    add("traffic_visitors_by_campaign", this.breakdown("s.campaign", from, to, 100, "AND s.campaign != ''"));
    return rows;
  }

  /**
   * Visitors of one audience seen since `since`, searched and sorted: those with
   * a visit that began in it. `userIds` are accounts the search also matched.
   */
  visitors(opts: {
    since: number; audience: Audience; sort: VisitorSort; q: string; userIds: string[]; limit: number; offset: number;
    /** Only those who have come through this campaign. */
    campaign?: string;
  }) {
    const binds: (string | number)[] = [opts.since];
    let where = `WHERE last_seen >= ? AND EXISTS (SELECT 1 FROM visits s WHERE s.visitor = visitors.visitor ${inAudience("s.entry_area", opts.audience)})`;
    if (opts.q) {
      const users = opts.userIds.slice(0, 50);
      where += ` AND (${VISITOR_SEARCH.map((c) => `${c} LIKE ?`).join(" OR ")}${
        users.length ? ` OR user_id IN (${users.map(() => "?").join(", ")})` : ""
      })`;
      binds.push(...VISITOR_SEARCH.map(() => `%${opts.q}%`), ...users);
    }
    const only = forCampaign(opts.campaign);
    where += ` ${only.visitor}`;
    binds.push(...only.binds);
    const order = VISITOR_SORTS[opts.sort] ?? VISITOR_SORTS.recent;
    return {
      total: this.all<{ n: number }>(`SELECT COUNT(*) AS n FROM visitors ${where}`, ...binds)[0]!.n,
      rows: this.all<VisitorRow>(
        `SELECT ${VISITOR_COLUMNS} FROM visitors ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
        ...binds, Math.floor(opts.limit), Math.floor(opts.offset),
      ),
    };
  }

  /** One visitor, their latest visits, and the pages of those visits in order. */
  visitor(id: string) {
    const visitor = this.all<VisitorRow>(`SELECT ${VISITOR_COLUMNS} FROM visitors WHERE visitor = ?`, id)[0] ?? null;
    if (!visitor) return null;
    const visits = this.all<VisitRow>(
      `SELECT visit, started_at, last_at, views, engaged_ms, channel, source, campaign, referrer_host, country, city, device, browser, os
         FROM visits WHERE visitor = ? ORDER BY started_at DESC LIMIT 30`,
      id,
    );
    const views = visits.length
      ? this.all<ViewRow>(
          `SELECT at, visit, area, path, engaged_ms FROM views
            WHERE visit IN (${visits.map(() => "?").join(", ")}) ORDER BY at LIMIT 600`,
          ...visits.map((v) => v.visit),
        )
      : [];
    return { visitor, visits, views };
  }
}
