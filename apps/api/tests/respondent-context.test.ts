import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { PLANS } from "@repo/entitlements";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import { buildRespondentContext, parseUserAgent, readRespondentContext } from "../src/lib/respondent-context.js";

const DB = () => env as unknown as Bindings;

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const WIN_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

describe("parseUserAgent", () => {
  it("names the browser a Chromium fork is, not the Chrome it claims to be", () => {
    expect(parseUserAgent(WIN_EDGE)).toEqual({
      type: "desktop",
      browser: "Edge",
      browserVersion: "129",
      os: "Windows",
      osVersion: "10/11",
    });
    expect(parseUserAgent(MAC_CHROME)).toMatchObject({ browser: "Chrome", os: "macOS", type: "desktop" });
  });

  it("tells a phone from a tablet", () => {
    expect(parseUserAgent(IPHONE)).toMatchObject({ type: "mobile", browser: "Safari", os: "iOS", osVersion: "17.5" });
    expect(parseUserAgent(ANDROID_TABLET)).toMatchObject({ type: "tablet", os: "Android", osVersion: "14" });
  });

  it("returns nulls for no user agent rather than guessing", () => {
    expect(parseUserAgent(null)).toEqual({ type: null, browser: null, browserVersion: null, os: null, osVersion: null });
  });
});

describe("buildRespondentContext", () => {
  it("takes geo from the edge and the rest from the browser", () => {
    const ctx = buildRespondentContext({
      client: {
        channel: "popup",
        pageUrl: "https://acme.com/pricing?utm_source=news&utm_campaign=fall#plans",
        referrer: "https://www.google.com/search?q=acme",
        utm: { medium: "email" },
        language: "en-GB",
        screen: "1440x900",
      },
      edge: {
        country: "GB",
        region: "England",
        regionCode: "ENG",
        city: "London",
        postalCode: "EC1A",
        latitude: "51.50853",
        longitude: "-0.12574",
        continent: "EU",
        timezone: "Europe/London",
        asn: 5089,
        asOrganization: "Virgin Media",
      },
      userAgent: MAC_CHROME,
      timezone: "Europe/London",
      fallbackChannel: "link",
    });
    expect(ctx.channel).toBe("popup");
    // The fragment is not part of the page.
    expect(ctx.pageUrl).toBe("https://acme.com/pricing?utm_source=news&utm_campaign=fall");
    expect(ctx.referrerHost).toBe("google.com");
    expect(ctx.utm).toEqual({ source: "news", campaign: "fall", medium: "email" });
    expect(ctx.geo).toMatchObject({ country: "GB", city: "London", latitude: 51.5085, longitude: -0.1257 });
    expect(ctx.network).toEqual({ asn: 5089, organization: "Virgin Media" });
    expect(ctx.device.browser).toBe("Chrome");
  });

  it("refuses what is not a page and what is not a place", () => {
    const ctx = buildRespondentContext({
      client: { pageUrl: "javascript:alert(1)", referrer: "not a url", screen: "<b>big</b>" },
      edge: { country: "XX", latitude: "999" },
      fallbackChannel: "link",
    });
    expect(ctx.pageUrl).toBeNull();
    expect(ctx.referrer).toBeNull();
    expect(ctx.screen).toBeNull();
    expect(ctx.geo.country).toBeNull();
    expect(ctx.geo.latitude).toBeNull();
  });

  it("reads an old response's country and user agent back as a partial context", () => {
    const ctx = readRespondentContext({ country: "IN", userAgent: IPHONE }, "chat");
    expect(ctx?.geo.country).toBe("IN");
    expect(ctx?.device.type).toBe("mobile");
    expect(ctx?.channel).toBe("link");
    expect(readRespondentContext({ variables: {} }, "chat")).toBeNull();
  });
});

describe("the dashboard sees it", () => {
  let org: Tenant;
  const auth = (t: Tenant) => ({ cookie: t.cookie, "content-type": "application/json" });

  beforeAll(async () => {
    await applySchema();
    org = await seedTenant("rctx");
    const pro = PLANS.pro;
    await DB()
      .DB.prepare(
        `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, seat_price_cents,
                            currency, features_json, limits_json, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?)
         ON CONFLICT (id) DO UPDATE SET features_json = excluded.features_json, limits_json = excluded.limits_json`,
      )
      .bind(pro.id, pro.id, pro.name, pro.priceMonthlyCents, pro.priceYearlyCents, pro.seatPriceCents,
            JSON.stringify(pro.features), JSON.stringify(pro.limits), pro.sortOrder)
      .run();
    await DB()
      .DB.prepare(
        `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                    current_period_start, current_period_end, seats, created_at, updated_at)
         VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?)`,
      )
      .bind(`sub_rctx`, org.orgId, `dodo_rctx`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
      .run();
    await invalidateEntitlements(DB(), org.orgId);

    const london = buildRespondentContext({
      client: { channel: "popup", referrer: "https://www.linkedin.com/feed/", language: "en-GB" },
      edge: { country: "GB", region: "England", city: "London", latitude: 51.5, longitude: -0.12, timezone: "Europe/London" },
      userAgent: MAC_CHROME,
      fallbackChannel: "link",
    });
    const rows: Array<[string, unknown]> = [
      ["sub_rctx_1", { country: "GB", userAgent: MAC_CHROME, variables: {}, context: london }],
      ["sub_rctx_2", { country: "GB", userAgent: MAC_CHROME, variables: {}, context: london }],
      // From before contexts existed.
      ["sub_rctx_3", { country: "IN", userAgent: IPHONE, variables: {} }],
    ];
    for (const [i, [id, meta]] of rows.entries()) {
      await DB()
        .DB.prepare(
          `INSERT INTO submissions (id, form_id, organization_id, status, source, started_at, completed_at, duration_ms, meta)
           VALUES (?, ?, ?, 'completed', 'chat', ?, ?, 1000, ?)`,
        )
        .bind(id, org.formId, org.orgId, Date.now() - i * 1000, Date.now(), JSON.stringify(meta))
        .run();
    }
  });

  it("returns metadata on each response, partial for the old one", async () => {
    const res = await fetchApi(`/api/forms/${org.formId}/submissions?status=completed`, { headers: auth(org) });
    expect(res.status).toBe(200);
    const { submissions } = await res.json<{
      submissions: Array<{ id: string; metadata: { channel: string; geo: { city: string | null; country: string | null } } | null }>;
    }>();
    const byId = new Map(submissions.map((s) => [s.id, s]));
    expect(byId.get("sub_rctx_1")?.metadata).toMatchObject({ channel: "popup", geo: { city: "London" } });
    expect(byId.get("sub_rctx_3")?.metadata).toMatchObject({ channel: "link", geo: { country: "IN", city: null } });
  });

  it("puts one dot per city on the map and counts channels and referrers", async () => {
    const res = await fetchApi(`/api/forms/${org.formId}/analytics`, { headers: auth(org) });
    expect(res.status).toBe(200);
    const body = await res.json<{
      places: Array<{ city: string; count: number; lat: number; lon: number }>;
      byChannel: Array<{ label: string; count: number }>;
      byReferrer: Array<{ label: string; count: number }>;
      byBrowser: Array<{ label: string; count: number }>;
    }>();
    expect(body.places).toEqual([
      { country: "GB", region: "England", city: "London", lat: 51.5, lon: -0.1, count: 2, completed: 2 },
    ]);
    expect(body.byChannel).toEqual([{ label: "popup", count: 2, completed: 2 }]);
    expect(body.byReferrer).toEqual([{ label: "linkedin.com", count: 2, completed: 2 }]);
    expect(body.byBrowser).toEqual([{ label: "Chrome", count: 2, completed: 2 }]);
  });

  it("breaks responses down by device, language and the hour they started", async () => {
    const res = await fetchApi(`/api/forms/${org.formId}/analytics`, { headers: auth(org) });
    const body = await res.json<{
      byDeviceType: Array<{ label: string; count: number; completed: number }>;
      byLanguage: Array<{ label: string; count: number; completed: number }>;
      byWeekHour: number[][];
    }>();
    expect(body.byDeviceType).toEqual([{ label: "desktop", count: 2, completed: 2 }]);
    // en-GB folds into en: one language to translate into, not two.
    expect(body.byLanguage).toEqual([{ label: "en", count: 2, completed: 2 }]);
    expect(body.byWeekHour).toHaveLength(7);
    expect(body.byWeekHour.every((row) => row.length === 24)).toBe(true);
    // The response with no context has no zone, so only the two London ones land.
    expect(body.byWeekHour.flat().reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe("from session open to the stored response", () => {
  it("stamps the browser's context and the parsed device onto the response", async () => {
    const t = await seedTenant("rctxlive");
    const slug = "rctx-live";
    const json = JSON.stringify({
      schemaVersion: 6,
      title: "Ctx",
      blocks: [
        { id: "blk_rc000001", ref: "q_name", type: "short_text", title: "Name?", required: true },
        { id: "blk_rc000002", ref: "q_more", type: "short_text", title: "More?", required: true },
      ],
      endings: [{ id: "end_rc000001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
      logic: [],
      endingRules: [],
      variables: [],
      hiddenFields: [],
      layout: {},
      settings: { agent: { mode: "template" }, onComplete: { requireSubmit: false } },
      theme: {},
    });
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
         VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
      ).bind("ver_rctxlive", t.formId, json, now, t.userId),
      env.DB.prepare(
        `UPDATE forms SET status = 'published', slug = ?1, working_schema = ?2, active_version_id = ?3 WHERE id = ?4`,
      ).bind(slug, json, "ver_rctxlive", t.formId),
    ]);

    const open = await fetchApi(`/p/forms/${slug}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": IPHONE },
      body: JSON.stringify({
        client: {
          channel: "side_tab",
          pageUrl: "https://acme.com/blog/post?utm_source=x",
          referrer: "https://t.co/abc",
          language: "en-IN",
          screen: "390x844",
        },
      }),
    });
    expect(open.status).toBe(200);
    const { sessionId, respondentToken } = await open.json<{ sessionId: string; respondentToken: string }>();

    const sent = await fetchApi(`/p/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-respondent-token": respondentToken },
      body: JSON.stringify({ type: "structured", ref: "q_name", value: "Asha", turnId: "turn_rctx_1" }),
    });
    expect(sent.status).toBeLessThan(300);

    let row: { source: string; meta: string } | null = null;
    for (let i = 0; i < 40 && !row; i++) {
      row = await env.DB.prepare(`SELECT source, meta FROM submissions WHERE session_id = ?`)
        .bind(sessionId)
        .first<{ source: string; meta: string }>();
      if (!row) await new Promise((r) => setTimeout(r, 50));
    }
    expect(row).not.toBeNull();
    // A side tab is an embed, whatever the (absent) Origin header says.
    expect(row!.source).toBe("embed");
    const ctx = readRespondentContext(JSON.parse(row!.meta), row!.source);
    expect(ctx).toMatchObject({
      channel: "side_tab",
      pageUrl: "https://acme.com/blog/post?utm_source=x",
      referrerHost: "t.co",
      utm: { source: "x" },
      language: "en-IN",
      screen: "390x844",
      device: { type: "mobile", os: "iOS" },
    });
  });
});
