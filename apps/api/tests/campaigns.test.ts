import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi, seedTenant, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { trafficStore } from "../src/lib/traffic.js";
import { linkTarget, randomCode, slugify } from "../src/lib/campaign-presets.js";
import type { TrafficHit } from "../src/do/traffic-do.js";

const E = env as unknown as Bindings;

let admin: Tenant;

const call = (method: string, path: string, body?: unknown) =>
  fetchApi(path, {
    method,
    headers: { cookie: admin.cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T,>(res: Response) => (await res.json()) as T;

interface CampaignBody {
  id: string;
  key: string;
  name: string;
  status: string;
  spendCents: number | null;
}
interface LinkBody {
  id: string;
  code: string;
  target: string;
  source: string;
  medium: string;
  content: string | null;
  channel: string;
  archived: boolean;
}

/** The stats are cached for a minute; a test that just wrote rows must not read the minute before. */
async function fresh(id?: string) {
  for (const range of ["1d", "7d", "30d", "90d"]) {
    await env.KV_CONFIG.delete(`admin:campaigns:stats:${range}`);
    if (id) await env.KV_CONFIG.delete(`admin:campaign:${id}:${range}`);
  }
}

beforeAll(async () => {
  await applySchema();
  admin = await seedTenant("founder");
});

beforeEach(() => {
  (env as unknown as Record<string, string | undefined>).PLATFORM_ADMIN_EMAILS = "founder@example.com";
});

describe("campaign presets", () => {
  it("builds a target that can only lead back to the site", () => {
    const link = { id: "cl_1", destination: "/signin?mode=signup", source: "x", medium: "social", campaign: "launch", content: "thread 1" };
    expect(linkTarget(link)).toBe("/signin?mode=signup&utm_source=x&utm_medium=social&utm_campaign=launch&utm_content=thread+1&utm_id=cl_1");
    expect(linkTarget({ ...link, destination: "", content: null })).toBe("/?utm_source=x&utm_medium=social&utm_campaign=launch&utm_id=cl_1");
  });

  it("slugs a label and draws codes without look-alike characters", () => {
    expect(slugify("  Priya's Reel #2 ", 100)).toBe("priyas-reel-2");
    expect(slugify("!!!", 100)).toBe("");
    for (let i = 0; i < 20; i++) expect(randomCode()).toMatch(/^[a-hjkmnp-z2-9]{7}$/);
  });
});

describe("campaigns and their links", () => {
  let campaign: CampaignBody;
  let first: LinkBody;

  it("creates a campaign, and refuses a second one with the same key", async () => {
    const res = await call("POST", "/api/admin/campaigns", { name: "October Launch", spendCents: 50_000 });
    expect(res.status, await res.clone().text()).toBe(200);
    campaign = await json<CampaignBody>(res);
    expect(campaign).toMatchObject({ name: "October Launch", key: "october-launch", status: "active", spendCents: 50_000 });
    expect(campaign.id).toMatch(/^cmp_[a-f0-9]{16}$/);

    expect((await call("POST", "/api/admin/campaigns", { name: "October launch" })).status).toBe(409);
    expect((await call("POST", "/api/admin/campaigns", { name: "!!!" })).status).toBe(400);
  });

  it("makes links from a channel and a label, each with its own code in KV", async () => {
    const res = await call("POST", `/api/admin/campaigns/${campaign.id}/links`, { destination: "/pricing", channel: "x_post", label: "Launch thread" });
    expect(res.status, await res.clone().text()).toBe(200);
    first = await json<LinkBody>(res);
    expect(first).toMatchObject({ source: "x", medium: "social", content: "launch-thread", channel: "x_post", archived: false });
    expect(first.code).toMatch(/^[a-z0-9]{7}$/);
    expect(first.target).toBe(`/pricing?utm_source=x&utm_medium=social&utm_campaign=october-launch&utm_content=launch-thread&utm_id=${first.id}`);
    expect(await env.KV_CONFIG.get(`link:${first.code}`)).toBe(first.target);

    // A partner link takes its source from the label; a custom code is kept, and cannot be taken twice.
    const partner = await call("POST", `/api/admin/campaigns/${campaign.id}/links`, {
      destination: "/",
      channel: "partner",
      label: "Acme Agency",
      code: "acme",
    });
    expect(await json<LinkBody>(partner)).toMatchObject({ source: "acme-agency", medium: "affiliate", code: "acme" });
    expect((await call("POST", `/api/admin/campaigns/${campaign.id}/links`, { destination: "/", channel: "other", label: "Again", code: "acme" })).status).toBe(409);
  });

  it("refuses a destination on another host, and a link for a campaign that is not there", async () => {
    for (const destination of ["https://evil.test", "//evil.test", "/\\evil.test", "pricing"]) {
      const res = await call("POST", `/api/admin/campaigns/${campaign.id}/links`, { destination, channel: "other", label: "x" });
      expect(res.status, destination).toBe(400);
    }
    expect((await call("POST", "/api/admin/campaigns/cmp_missing/links", { destination: "/", channel: "other", label: "x" })).status).toBe(404);
    expect((await call("PATCH", "/api/admin/campaign-links/cl_missing", { archived: true })).status).toBe(404);
    expect((await call("PATCH", "/api/admin/campaigns/cmp_missing", { name: "x" })).status).toBe(404);
    expect((await call("GET", "/api/admin/campaigns/cmp_missing")).status).toBe(404);
  });

  it("edits a link: a new code moves its KV entry, and an archived link keeps answering", async () => {
    const moved = await json<LinkBody>(await call("PATCH", `/api/admin/campaign-links/${first.id}`, { code: "thread", destination: "/" }));
    expect(moved).toMatchObject({ code: "thread", source: "x", content: "launch-thread" });
    expect(await env.KV_CONFIG.get(`link:${first.code}`)).toBeNull();
    expect(await env.KV_CONFIG.get("link:thread")).toBe(moved.target);
    expect(moved.target.startsWith("/?utm_source=x")).toBe(true);

    const archived = await json<LinkBody>(await call("PATCH", `/api/admin/campaign-links/${first.id}`, { archived: true }));
    expect(archived.archived).toBe(true);
    expect(await env.KV_CONFIG.get("link:thread")).toBe(moved.target);
    expect((await json<LinkBody>(await call("PATCH", `/api/admin/campaign-links/${first.id}`, { archived: false }))).archived).toBe(false);
    first = moved;
  });

  it("answers the edge worker for a code KV has lost, and puts it back", async () => {
    await env.KV_CONFIG.delete("link:thread");
    const res = await fetchApi("/p/l/thread");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ target: first.target });
    expect(await env.KV_CONFIG.get("link:thread")).toBe(first.target);
    expect((await fetchApi("/p/l/nothing-here")).status).toBe(404);
    expect((await fetchApi("/p/l/%27%20OR%201")).status).toBe(404);
  });

  it("locks the key once links carry it, and lets the rest change", async () => {
    expect((await call("PATCH", `/api/admin/campaigns/${campaign.id}`, { key: "renamed" })).status).toBe(409);
    const paused = await json<CampaignBody>(await call("PATCH", `/api/admin/campaigns/${campaign.id}`, { status: "paused", name: "Launch", spendCents: null }));
    expect(paused).toMatchObject({ status: "paused", name: "Launch", key: "october-launch", spendCents: null });
    await call("PATCH", `/api/admin/campaigns/${campaign.id}`, { status: "active", spendCents: 50_000 });
  });

  it("reports visitors, sign-ups, revenue and people per campaign and per link", async () => {
    const store = trafficStore(E);
    const now = Date.now();
    const hit = (over: Partial<TrafficHit>): TrafficHit => ({
      at: now - 60_000, event: "view", visitor: "v1", visit: "s1", area: "marketing", path: "/", referrerHost: "",
      channel: "Social", source: "X (Twitter)", medium: "social", campaign: "october-launch", content: "", link: first.id,
      country: "IN", region: "", city: "", lat: null, lon: null, device: "desktop", browser: "Chrome", os: "macOS",
      language: "en", screenW: 1440, userId: "", engagedMs: 0, lcp: null, inp: null, ttfb: null, cls: null, ...over,
    });
    await store.record(hit({}));
    await store.record(hit({ visitor: "v2", visit: "s2" }));
    await store.record(hit({ visitor: "v3", visit: "s3", link: "" }));
    await store.record(hit({ visitor: "v4", visit: "s4", campaign: "typed-by-hand", link: "" }));

    // Two people signed up from the campaign: one through the link, one from a hand-typed address.
    const viaLink = await seedTenant("linked");
    const loose = await seedTenant("loose");
    await env.DB.prepare(`UPDATE user_sign_ins SET campaign = 'october-launch', source = 'X (Twitter)', medium = 'social', link_id = ? WHERE user_id = ? AND kind = 'sign_up'`)
      .bind(first.id, viaLink.userId)
      .run();
    await env.DB.prepare(`UPDATE user_sign_ins SET campaign = 'october-launch', source = 'X (Twitter)', medium = 'social' WHERE user_id = ? AND kind = 'sign_up'`)
      .bind(loose.userId)
      .run();
    // Mail of ours that happens to carry the same campaign name is nobody's campaign.
    const mailed = await seedTenant("mailed");
    await env.DB.prepare(`UPDATE user_sign_ins SET campaign = 'october-launch', source = 'Chatform', medium = 'email' WHERE user_id = ? AND kind = 'sign_up'`)
      .bind(mailed.userId)
      .run();
    // The linked account paid twice; the money belongs to the organization its first member made.
    const org = await env.DB.prepare(`SELECT organization_id AS id FROM members WHERE user_id = ? ORDER BY created_at, id LIMIT 1`)
      .bind(viaLink.userId)
      .first<{ id: string }>();
    for (const [i, status] of ["succeeded", "succeeded", "failed"].entries()) {
      await env.DB.prepare(`INSERT INTO payments (id, organization_id, dodo_payment_id, amount_cents, currency, status, created_at) VALUES (?, ?, ?, 1900, 'USD', ?, ?)`)
        .bind(`pay_c${i}`, org!.id, `dodo_c${i}`, status, now)
        .run();
    }
    await fresh(campaign.id);

    const list = await json<{
      totals: { visitors: { value: number }; signups: { value: number }; revenue: { currency: string; cents: number }[] };
      campaigns: { id: string; links: number; channels: string[]; visitors: { value: number }; signups: { value: number }; revenue: { cents: number }[]; costPerSignupCents: number | null; series: number[] }[];
      untracked: { key: string; visitors: number }[];
      channels: { key: string }[];
    }>(await call("GET", "/api/admin/campaigns?range=7d"));
    const row = list.campaigns.find((x) => x.id === campaign.id)!;
    expect(row).toMatchObject({ links: 2, visitors: { value: 3 }, signups: { value: 2 }, revenue: [{ currency: "USD", cents: 3800 }], costPerSignupCents: 25_000 });
    expect(row.channels.sort()).toEqual(["Partner or affiliate", "X post"]);
    expect(row.series.reduce((a, b) => a + b, 0)).toBe(3);
    expect(list.untracked).toContainEqual({ key: "typed-by-hand", visitors: 1, signups: 0 });
    expect(list.totals).toMatchObject({ visitors: { value: 4 }, signups: { value: 2 }, revenue: [{ currency: "USD", cents: 3800 }] });
    expect(list.channels.map((x) => x.key)).toContain("google_ads");

    const detail = await json<{
      totals: { visitors: { value: number }; signups: { value: number } };
      links: { id: string; visitors: number; signups: number; lastVisitAt: number | null }[];
      unlinked: { visitors: number; signups: number };
      people: { email: string; linkId: string | null; orgId: string | null; stage: string }[];
      stages: { key: string; value: number }[];
      series: { visitors: number; signups: number }[];
      breakdowns: { sources: { key: string; visitors: number }[] };
    }>(await call("GET", `/api/admin/campaigns/${campaign.id}?range=7d`));
    expect(detail.totals).toMatchObject({ visitors: { value: 3 }, signups: { value: 2 } });
    expect(detail.links.find((l) => l.id === first.id)).toMatchObject({ visitors: 2, signups: 1, lastVisitAt: now - 60_000 });
    expect(detail.links.find((l) => l.id !== first.id)).toMatchObject({ visitors: 0, signups: 0, lastVisitAt: null });
    expect(detail.unlinked).toMatchObject({ visitors: 1, signups: 1 });
    expect(detail.people.map((p) => p.email).sort()).toEqual(["linked@example.com", "loose@example.com"]);
    expect(detail.people.find((p) => p.email === "linked@example.com")).toMatchObject({ linkId: first.id, orgId: org!.id });
    expect(detail.stages[0]).toEqual({ key: "signed_up", label: "Signed up", value: 2 });
    expect(detail.series.reduce((n, d) => n + d.signups, 0)).toBe(2);
    expect(detail.breakdowns.sources).toEqual([{ key: "X (Twitter)", visitors: 3 }]);

    // The same campaign, as the Traffic page's filter sees it.
    await env.KV_CONFIG.delete("admin:traffic:site:7d:c=october-launch");
    const traffic = await json<{ totals: { visitors: number }; signups: { value: number } }>(await call("GET", "/api/admin/traffic?range=7d&campaign=October-Launch"));
    expect(traffic.totals.visitors).toBe(3);
    // The filter is the campaign alone: mail carrying its name is a sign-up from it too.
    expect(traffic.signups.value).toBe(3);
    const visitors = await json<{ total: number }>(await call("GET", "/api/admin/visitors?range=7d&campaign=october-launch"));
    expect(visitors.total).toBe(3);
  });

  it("saves a campaign that was only ever a tag, under the key its links already carry", async () => {
    const res = await call("POST", "/api/admin/campaigns", { name: "Typed by hand", key: "Typed-By-Hand" });
    expect(await json<CampaignBody>(res)).toMatchObject({ key: "typed-by-hand" });
    await fresh();
    const list = await json<{ untracked: { key: string }[]; campaigns: { key: string; visitors: { value: number } }[] }>(await call("GET", "/api/admin/campaigns?range=7d"));
    expect(list.untracked.map((u) => u.key)).not.toContain("typed-by-hand");
    expect(list.campaigns.find((x) => x.key === "typed-by-hand")?.visitors.value).toBe(1);
  });

  it("serves the mail numbers that used to sit on this page", async () => {
    const mail = await json<{ email: unknown[]; followups: { sent: number } }>(await call("GET", "/api/admin/mail?range=7d"));
    expect(mail.followups).toEqual({ sent: 0, clicked: 0, recovered: 0 });
    expect(Array.isArray(mail.email)).toBe(true);
  });
});

describe("migration 0064", () => {
  it("turned every saved link into a link of a campaign, with a code of its own", async () => {
    const orphans = await env.DB.prepare(`SELECT COUNT(*) AS n FROM campaign_links WHERE campaign_id IS NULL OR code IS NULL`).first<{ n: number }>();
    expect(orphans?.n).toBe(0);
  });
});
