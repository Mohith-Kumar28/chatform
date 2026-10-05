import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { classifySource } from "../src/lib/traffic-source.js";
import { trafficHit, trafficStore, type TrafficBeacon } from "../src/lib/traffic.js";
import type { TrafficHit } from "../src/do/traffic-do.js";
import { attributionOf } from "../src/lib/user-context.js";
import { withUtm } from "../src/lib/mail-jobs.js";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0";

const e = { ...(env as unknown as Bindings), WEB_ORIGINS: "https://chatform.in" };

const beacon = (over: Partial<TrafficBeacon> = {}): TrafficBeacon => ({
  e: "view",
  v: "visitor0001",
  s: "visit000001",
  a: "marketing",
  p: "/pricing",
  ...over,
});

const req = (ua = CHROME_MAC) =>
  new Request("http://localhost/p/t", { method: "POST", headers: { "user-agent": ua, "cf-ipcountry": "IN" } });

describe("classifySource", () => {
  it("prefers a tagged link over the referrer", () => {
    expect(classifySource("https://www.google.com/", { source: "instagram", medium: "ugc" })).toMatchObject({
      source: "Instagram",
      channel: "Social",
    });
  });

  it("counts an ad click id as paid, whatever else is on the link", () => {
    expect(classifySource(null, { source: "instagram", ad: "meta" })).toMatchObject({ source: "Meta Ads", channel: "Paid" });
  });

  it("files AI assistants before search, and country Googles as Google", () => {
    expect(classifySource("https://gemini.google.com/app")).toMatchObject({ source: "Gemini", channel: "AI" });
    expect(classifySource("https://www.google.co.in/")).toMatchObject({ source: "Google", channel: "Search" });
  });

  it("reads Android app referrers and mail mediums", () => {
    expect(classifySource("android-app://com.linkedin.android/")).toMatchObject({ source: "LinkedIn" });
    expect(classifySource(null, { source: "chatform", medium: "email" })).toMatchObject({ channel: "Email" });
  });

  it("calls no referrer and no tag Direct, and an unknown site Referral", () => {
    expect(classifySource(null)).toMatchObject({ source: "Direct", channel: "Direct" });
    expect(classifySource("https://someblog.dev/post")).toMatchObject({ source: "someblog.dev", channel: "Referral" });
  });
});

describe("trafficHit", () => {
  it("fills in source, place and device from the edge", () => {
    const hit = trafficHit(e, req(INSTAGRAM_IOS), beacon({ u: { source: "ig", medium: "ugc", campaign: "Oct-UGC" }, en: 1, n: 1 }));
    expect(hit).toMatchObject({
      visitor: "visitor0001",
      visit: "visit000001",
      channel: "Social",
      source: "Instagram",
      campaign: "oct-ugc",
      country: "IN",
      device: "mobile",
      browser: "Instagram app",
    });
  });

  it("treats our own site as no referrer", () => {
    expect(trafficHit(e, req(), beacon({ r: "https://chatform.in/blog/x" }))?.channel).toBe("Direct");
  });

  it("drops bots and admin pages, and keeps a user id only on the dashboard", () => {
    expect(trafficHit(e, req("Mozilla/5.0 (compatible; Googlebot/2.1)"), beacon())).toBeNull();
    expect(trafficHit(e, req("HeadlessChrome/120"), beacon())).toBeNull();
    expect(trafficHit(e, req(), beacon({ p: "/admin/traffic" }))).toBeNull();
    expect(trafficHit(e, req(), beacon({ uid: "user_1" }))?.userId).toBe("");
    expect(trafficHit(e, req(), beacon({ a: "app", p: "/dashboard", uid: "user_1" }))?.userId).toBe("user_1");
  });

  it("reads an unmeasured vital as absent, not as zero", () => {
    const hit = trafficHit(e, req(), beacon({ e: "leave", ms: 4200, lcp: 0, ttfb: 180.4, cls: 0.0512 }));
    expect(hit).toMatchObject({ engagedMs: 4200, lcp: null, inp: null, ttfb: 180, cls: 0.051 });
  });
});

describe("TrafficDO", () => {
  const MIN = 60_000;
  const DAY = 86_400_000;
  const now = Date.now();
  const store = trafficStore(env as unknown as Bindings);

  /** A stored hit: a view unless said otherwise, from a tagged Instagram link in India. */
  const hit = (over: Partial<TrafficHit>): TrafficHit => ({
    at: now,
    event: "view",
    visitor: "ana",
    visit: "ana-1",
    area: "marketing",
    path: "/",
    referrerHost: "instagram.com",
    channel: "Social",
    source: "Instagram",
    medium: "ugc",
    campaign: "oct-ugc",
    content: "",
    country: "IN",
    region: "KA",
    city: "Bengaluru",
    lat: 12.9,
    lon: 77.6,
    device: "mobile",
    browser: "Chrome",
    os: "Android",
    language: "en-IN",
    screenW: 412,
    userId: "",
    engagedMs: 0,
    lcp: null,
    inp: null,
    ttfb: null,
    cls: null,
    ...over,
  });

  beforeAll(async () => {
    // Ana, three days ago: lands on the home page from Instagram, reads pricing, leaves.
    await store.record(hit({ at: now - 3 * DAY }));
    await store.record(hit({ at: now - 3 * DAY + 20_000, event: "leave", engagedMs: 18_000, lcp: 1900, ttfb: 300 }));
    await store.record(hit({ at: now - 3 * DAY + MIN, path: "/pricing" }));
    await store.record(hit({ at: now - 3 * DAY + 3 * MIN, event: "leave", path: "/pricing", engagedMs: 90_000 }));
    // Ana again, ten minutes ago, direct, and this time signed in on the dashboard.
    const direct = { visit: "ana-2", channel: "Direct", source: "Direct", medium: "", campaign: "", referrerHost: "" };
    await store.record(hit({ ...direct, at: now - 10 * MIN, area: "app", path: "/dashboard", userId: "user_ana" }));
    // Ben, two minutes ago: one page from Google, on a desktop in Germany, and gone.
    await store.record(
      hit({
        at: now - 2 * MIN,
        visitor: "ben",
        visit: "ben-1",
        path: "/blog/forms",
        channel: "Search",
        source: "Google",
        medium: "",
        campaign: "",
        referrerHost: "google.com",
        country: "DE",
        region: "BE",
        city: "Berlin",
        device: "desktop",
        os: "macOS",
      }),
    );
    // A leave whose view never arrived must not invent anybody.
    await store.record(hit({ visitor: "ghost", visit: "ghost-1", event: "leave", engagedMs: 5_000 }));
  });

  it("keeps one row per visitor: when they came, how often, how long, and their first source", async () => {
    const { total, rows } = await store.visitors({ since: now - 30 * DAY, sort: "views", q: "", userIds: [], limit: 50, offset: 0 });
    expect(total).toBe(2);
    expect(rows[0]).toMatchObject({
      visitor: "ana",
      visits: 2,
      views: 3,
      days: 2,
      engaged_ms: 108_000,
      first_seen: now - 3 * DAY,
      last_seen: now - 10 * MIN,
      // First touch stays; where they are now follows the latest page.
      source: "Instagram",
      campaign: "oct-ugc",
      landing_path: "/",
      last_path: "/dashboard",
      user_id: "user_ana",
    });
    expect(rows[1]).toMatchObject({ visitor: "ben", visits: 1, views: 1, days: 1, country: "DE" });
  });

  it("searches visitors by what is on the row, and by the accounts a name matched", async () => {
    const find = (q: string, userIds: string[] = []) =>
      store.visitors({ since: 0, sort: "recent", q, userIds, limit: 50, offset: 0 }).then((r) => r.rows.map((v) => v.visitor));
    expect(await find("berlin")).toEqual(["ben"]);
    expect(await find("ana@example.com", ["user_ana"])).toEqual(["ana"]);
    expect(await find("nobody")).toEqual([]);
  });

  it("lays out a visitor's visits and the pages of each, with the time spent on them", async () => {
    const found = await store.visitor("ana");
    expect(found?.visits.map((v) => [v.visit, v.views, v.source])).toEqual([
      ["ana-2", 1, "Direct"],
      ["ana-1", 2, "Instagram"],
    ]);
    // The first visit ran from its first view to its last leave.
    expect(found!.visits[1]!.last_at - found!.visits[1]!.started_at).toBe(3 * MIN);
    expect(found?.views.map((v) => [v.path, v.engaged_ms])).toEqual([
      ["/", 18_000],
      ["/pricing", 90_000],
      ["/dashboard", 0],
    ]);
    expect(await store.visitor("ghost")).toBeNull();
  });

  it("reports a period: totals, sources, pages, entries, exits, places and vitals", async () => {
    const r = await store.report(7);
    expect(r.bucket).toBe("day");
    expect(r.totals).toEqual({ visitors: 2, visits: 3, views: 4, newVisitors: 2, bounced: 2, engagedMs: 108_000 });
    expect(r.previous.views).toBe(0);
    expect(r.series.reduce((sum, p) => sum + p.views, 0)).toBe(4);
    expect(r.series.reduce((sum, p) => sum + p.newVisitors, 0)).toBe(2);
    expect(r.sources.map((s) => [s.source, s.channel, s.visitors, s.views])).toEqual(
      expect.arrayContaining([
        ["Instagram", "Social", 1, 2],
        ["Direct", "Direct", 1, 1],
        ["Google", "Search", 1, 1],
      ]),
    );
    expect(r.campaigns).toEqual([{ key: "oct-ugc", visitors: 1, visits: 1, views: 2 }]);
    expect(r.entries.map((p) => p.path).sort()).toEqual(["/", "/blog/forms", "/dashboard"]);
    expect(r.exits.map((p) => p.path).sort()).toEqual(["/blog/forms", "/dashboard", "/pricing"]);
    expect(r.geo.map((g) => [g.country, g.city, g.lat]).sort()).toEqual([
      ["DE", "Berlin", 12.9],
      ["IN", "Bengaluru", 12.9],
    ]);
    expect(r.devices.map((d) => d.key).sort()).toEqual(["desktop", "mobile"]);
    expect(r.vitals.byArea).toEqual([{ key: "marketing", samples: 1, lcp: 1900, inp: null, ttfb: 300, cls: null }]);
    expect(r.activeUsers).toEqual({ day: 1, week: 1, month: 1 });
    // A one-day range is hourly, and sees only today's two visits.
    const day = await store.report(1);
    expect(day.bucket).toBe("hour");
    expect(day.totals).toMatchObject({ visitors: 2, visits: 2, views: 2, newVisitors: 1 });
  });

  it("shows who is here now", async () => {
    const live = await store.live();
    // Ben was seen two minutes ago; Ana ten.
    expect(live.online).toBe(1);
    expect(live.pages).toEqual([{ area: "marketing", path: "/blog/forms", visitors: 1 }]);
    expect(live.views.reduce((a, b) => a + b, 0)).toBe(2);
    expect(live.countries.map((c) => c.key)).toEqual(["DE"]);
  });

  it("answers the campaign page and the daily rollup", async () => {
    expect(await store.campaigns(7)).toEqual([{ campaign: "oct-ugc", visitors: 1, visits: 1, views: 2, formViews: 0 }]);
    expect(await store.emailVisits(7)).toEqual([]);
    const day = new Date(now - 3 * DAY).toISOString().slice(0, 10);
    const rows = await store.dailyRollup(day);
    expect(rows).toEqual(
      expect.arrayContaining([
        { metric: "traffic_visitors", dimension: "", value: 1 },
        { metric: "traffic_views", dimension: "", value: 2 },
        { metric: "traffic_visitors_by_channel", dimension: "Social", value: 1 },
        { metric: "traffic_visitors_by_country", dimension: "IN", value: 1 },
      ]),
    );
  });

  it("moves a browser's history to its fingerprint the first time it reports one", async () => {
    await store.record(hit({ visitor: "fp-ben", previous: "ben", visit: "ben-2", path: "/pricing" }));
    const moved = await store.visitor("fp-ben");
    expect(moved?.visitor).toMatchObject({ visits: 2, views: 2, landing_path: "/blog/forms", last_path: "/pricing" });
    expect(moved?.views.map((v) => v.path)).toEqual(["/blog/forms", "/pricing"]);
    expect(await store.visitor("ben")).toBeNull();
    // Sent again, or naming an id that never existed, it changes nothing.
    await store.record(hit({ visitor: "fp-ben", previous: "ben", visit: "ben-2", path: "/" }));
    expect((await store.visitor("fp-ben"))?.visitor.visits).toBe(2);
  });

  it("lets a late, older hit move a visitor's start back and never their present", async () => {
    await store.record(hit({ at: now - 20 * DAY, visit: "ana-0", path: "/templates", source: "Reddit", city: "Mysuru" }));
    const { rows } = await store.visitors({ since: 0, sort: "views", q: "", userIds: [], limit: 50, offset: 0 });
    expect(rows[0]).toMatchObject({
      visitor: "ana",
      visits: 3,
      views: 4,
      days: 3,
      first_seen: now - 20 * DAY,
      last_seen: now - 10 * MIN,
      source: "Reddit",
      landing_path: "/templates",
      last_path: "/dashboard",
      city: "Bengaluru",
    });
  });
});

describe("POST /p/t", () => {
  it("answers 204 to anything, and never errors on garbage", async () => {
    for (const body of ["", "not json", JSON.stringify({ e: "view" }), "x".repeat(5000), JSON.stringify(beacon())]) {
      const res = await fetchApi("/p/t", { method: "POST", body, headers: { "user-agent": CHROME_MAC } });
      expect(res.status).toBe(204);
    }
  });
});

describe("sign-up attribution", () => {
  beforeAll(applySchema);

  it("credits the visit that signed up, else the first page ever seen", () => {
    const first = {
      referrer: "https://www.google.com/",
      pageUrl: "https://chatform.in/blog/post?utm_source=newsletter&utm_medium=email&utm_campaign=sept",
      utm: {},
    };
    expect(attributionOf(first, null)).toMatchObject({
      channel: "Email",
      source: "Newsletter",
      campaign: "sept",
      landingPath: "/blog/post",
    });
    expect(attributionOf(first, { utm: { source: "instagram", medium: "ugc", campaign: "oct-ugc" } })).toMatchObject({
      channel: "Social",
      source: "Instagram",
      medium: "ugc",
      campaign: "oct-ugc",
      landingPath: "/blog/post",
    });
    // A direct visit is not a touch: the first one still gets the credit.
    expect(attributionOf(first, {})).toMatchObject({ campaign: "sept" });
  });

  it("stamps a sign-up's columns, from the header or the Google cookie", async () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        pageUrl: "https://chatform.in/",
        visitorId: "visitorabc123",
        lastTouch: { utm: { source: "youtube", medium: "ugc", campaign: "launch-video" } },
      }),
    );
    const email = "attributed@example.com";
    const res = await fetchApi("/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": CHROME_MAC,
        // Better Auth checks the origin of any request that carries cookies.
        origin: "http://localhost",
        cookie: `other=1; cf_client=${payload}`,
      },
      body: JSON.stringify({ email, password: "supersecret123", name: "A" }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const row = await env.DB.prepare(
      `SELECT si.visitor_id, si.channel, si.source, si.medium, si.campaign FROM user_sign_ins si
         JOIN users u ON u.id = si.user_id WHERE u.email = ? AND si.kind = 'sign_up'`,
    )
      .bind(email)
      .first();
    expect(row).toEqual({ visitor_id: "visitorabc123", channel: "Social", source: "YouTube", medium: "ugc", campaign: "launch-video" });
  });
});

describe("mail links", () => {
  it("tags a mail link without losing its own parameters", () => {
    const url = new URL(withUtm("https://chatform.in/f/intake?resume=tok&fu=f1", "followup"));
    expect(url.searchParams.get("resume")).toBe("tok");
    expect(url.searchParams.get("fu")).toBe("f1");
    expect(url.searchParams.get("utm_medium")).toBe("email");
    expect(url.searchParams.get("utm_campaign")).toBe("followup");
  });
});
