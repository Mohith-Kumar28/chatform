import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { classifySource } from "../src/lib/traffic-source.js";
import { TRAFFIC_BLOBS, writeTraffic, type TrafficBeacon } from "../src/lib/traffic.js";
import { attributionOf, backfillSignupAttribution } from "../src/lib/user-context.js";
import { withUtm } from "../src/lib/mail-jobs.js";
import { sqlText } from "../src/lib/traffic-query.js";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0";

/** The dataset binding, recorded. */
function recorder() {
  const points: AnalyticsEngineDataPoint[] = [];
  const dataset = { writeDataPoint: (p?: AnalyticsEngineDataPoint) => void (p && points.push(p)) } as AnalyticsEngineDataset;
  return { points, env: { ...(env as unknown as Bindings), TRAFFIC: dataset, WEB_ORIGINS: "https://chatform.in" } };
}

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

const blob = (p: AnalyticsEngineDataPoint, key: keyof typeof TRAFFIC_BLOBS) => p.blobs?.[TRAFFIC_BLOBS[key] - 1];

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

describe("writeTraffic", () => {
  it("writes one row, indexed by the visitor, with source, place and device", () => {
    const { points, env: e } = recorder();
    const ok = writeTraffic(e, req(INSTAGRAM_IOS), beacon({ u: { source: "ig", medium: "ugc", campaign: "Oct-UGC" }, en: 1, n: 1 }));
    expect(ok).toBe(true);
    expect(points).toHaveLength(1);
    const p = points[0]!;
    expect(p.indexes).toEqual(["visitor0001"]);
    expect(blob(p, "channel")).toBe("Social");
    expect(blob(p, "source")).toBe("Instagram");
    expect(blob(p, "campaign")).toBe("oct-ugc");
    expect(blob(p, "country")).toBe("IN");
    expect(blob(p, "device")).toBe("mobile");
    expect(blob(p, "browser")).toBe("Instagram app");
    expect(blob(p, "isNew")).toBe("1");
    expect(p.blobs).toHaveLength(20);
  });

  it("treats our own site as no referrer", () => {
    const { points, env: e } = recorder();
    writeTraffic(e, req(), beacon({ r: "https://chatform.in/blog/x" }));
    expect(blob(points[0]!, "channel")).toBe("Direct");
  });

  it("drops bots, admin pages, and keeps a user id only on the dashboard", () => {
    const { points, env: e } = recorder();
    expect(writeTraffic(e, req("Mozilla/5.0 (compatible; Googlebot/2.1)"), beacon())).toBe(false);
    expect(writeTraffic(e, req("HeadlessChrome/120"), beacon())).toBe(false);
    expect(writeTraffic(e, req(), beacon({ p: "/admin/traffic" }))).toBe(false);
    writeTraffic(e, req(), beacon({ uid: "user_1" }));
    writeTraffic(e, req(), beacon({ a: "app", p: "/dashboard", uid: "user_1" }));
    expect(points).toHaveLength(2);
    expect(blob(points[0]!, "userId")).toBe("");
    expect(blob(points[1]!, "userId")).toBe("user_1");
    expect(blob(points[1]!, "signedIn")).toBe("1");
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

  it("classifies older sign-ups and marks sign-ins as never attributed", async () => {
    const user = await env.DB.prepare(`SELECT id FROM users LIMIT 1`).first<{ id: string }>();
    const context = JSON.stringify({ referrer: "https://www.reddit.com/r/SaaS", pageUrl: "https://chatform.in/", utm: {} });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user_sign_ins (id, user_id, kind, method, context_json, created_at) VALUES ('usi_old_up', ?, 'sign_up', 'email', ?, 1)`,
      ).bind(user!.id, context),
      env.DB.prepare(
        `INSERT INTO user_sign_ins (id, user_id, kind, method, context_json, created_at) VALUES ('usi_old_in', ?, 'sign_in', 'email', ?, 1)`,
      ).bind(user!.id, context),
    ]);
    await backfillSignupAttribution(env as unknown as Bindings);
    const rows = await env.DB.prepare(`SELECT id, channel, source FROM user_sign_ins WHERE id IN ('usi_old_up', 'usi_old_in') ORDER BY id`).all();
    expect(rows.results).toEqual([
      { id: "usi_old_in", channel: "none", source: null },
      { id: "usi_old_up", channel: "Social", source: "Reddit" },
    ]);
  });
});

describe("mail links and SQL text", () => {
  it("tags a mail link without losing its own parameters", () => {
    const url = new URL(withUtm("https://chatform.in/f/intake?resume=tok&fu=f1", "followup"));
    expect(url.searchParams.get("resume")).toBe("tok");
    expect(url.searchParams.get("fu")).toBe("f1");
    expect(url.searchParams.get("utm_medium")).toBe("email");
    expect(url.searchParams.get("utm_campaign")).toBe("followup");
  });

  it("cannot carry a quote into SQL", () => {
    expect(sqlText("x' OR 1=1 --")).toBe("'x or 11 --'");
  });
});
