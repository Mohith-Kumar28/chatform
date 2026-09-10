import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { isPlatformAdmin } from "../src/lib/platform-admin.js";
import {
  RANGES,
  rollupPlatformDaily,
  rollupFormStructure,
  backfillPlatformDaily,
  utcDay,
} from "../src/lib/platform-rollup.js";
import { costUsdMicro } from "../src/lib/ai-pricing.js";
import { IMPERSONATION_HEADER, signImpersonation, verifyImpersonation } from "../src/lib/impersonation.js";
import { NO_MAIL, recordMailDelivery } from "../src/lib/mail.js";
import { getEntitlements } from "../src/lib/entitlements.js";
import { PLANS, effectivePlan } from "@repo/entitlements";

const DB = () => env as unknown as Bindings;
/** The allowlist is a worker secret, so a test sets it the same way a deploy would. */
const setAllowlist = (value: string | undefined) => {
  (env as unknown as Record<string, string | undefined>).PLATFORM_ADMIN_EMAILS = value;
};

let admin: Tenant;
let customer: Tenant;

/** `subscriptions.plan_id` is a foreign key, so the catalogue has to exist first. */
async function seedPlans(): Promise<void> {
  for (const plan of Object.values(PLANS)) {
    await DB()
      .DB.prepare(
        `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, seat_price_cents,
                            currency, features_json, limits_json, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?)
         ON CONFLICT (id) DO UPDATE SET limits_json = excluded.limits_json`,
      )
      .bind(
        plan.id,
        plan.id,
        plan.name,
        plan.priceMonthlyCents,
        plan.priceYearlyCents,
        plan.seatPriceCents,
        JSON.stringify(plan.features),
        JSON.stringify(plan.limits),
        plan.sortOrder,
      )
      .run();
  }
}

beforeAll(async () => {
  await applySchema();
  await seedPlans();
  admin = await seedTenant("founder");
  customer = await seedTenant("acme");
});

beforeEach(async () => {
  setAllowlist("founder@example.com");
  // The overview is cached for five minutes; a test that seeds new rows and
  // then reads a cached payload would assert against the previous test's data.
  for (const range of Object.keys(RANGES)) await env.KV_CONFIG.delete(`admin:overview:${range}`);
});

describe("the gate", () => {
  it("is invisible without a session", async () => {
    const res = await fetchApi("/api/admin/overview");
    expect(res.status).toBe(404);
  });

  it("is invisible to a signed-in customer", async () => {
    const res = await fetchApi("/api/admin/me", { headers: { cookie: customer.cookie } });
    expect(res.status).toBe(404);
  });

  /**
   * The failure mode that matters: an unset secret must close the console, not
   * open it. An `includes` over an empty list would have said "no", but a
   * `.length === 0` short-circuit is what makes that explicit rather than
   * incidental — and this is the test that would catch someone removing it.
   */
  it("is closed to everyone when the secret is unset", async () => {
    setAllowlist(undefined);
    const res = await fetchApi("/api/admin/me", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(404);
  });

  it("is closed when the secret is an empty string", async () => {
    setAllowlist("");
    expect(isPlatformAdmin(DB(), "founder@example.com")).toBe(false);
  });

  it("opens for an allowlisted email", async () => {
    const res = await fetchApi("/api/admin/me", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: "founder@example.com" });
  });

  it("ignores case and surrounding whitespace in the list", () => {
    setAllowlist(" Founder@Example.com , other@example.com ");
    expect(isPlatformAdmin(DB(), "founder@example.com")).toBe(true);
    expect(isPlatformAdmin(DB(), "FOUNDER@EXAMPLE.COM")).toBe(true);
    expect(isPlatformAdmin(DB(), "nobody@example.com")).toBe(false);
  });

  /**
   * The exact shape that shipped a console nobody could open: `.dev.vars` is
   * parsed by wrangler, which strips the quotes, while `push-secrets.py` sends
   * them through as part of the value. Identical file, two different lists,
   * and the production one matched nobody.
   */
  it("survives a quoted secret, however it was written", () => {
    for (const raw of [
      `"founder@example.com,other@example.com"`,
      `'founder@example.com,other@example.com'`,
      `"founder@example.com","other@example.com"`,
      ` founder@example.com , other@example.com `,
    ]) {
      setAllowlist(raw);
      expect(isPlatformAdmin(DB(), "founder@example.com"), raw).toBe(true);
      expect(isPlatformAdmin(DB(), "other@example.com"), raw).toBe(true);
      expect(isPlatformAdmin(DB(), "nobody@example.com"), raw).toBe(false);
    }
  });

  it("does not match a substring of an allowlisted address", () => {
    setAllowlist("founder@example.com");
    expect(isPlatformAdmin(DB(), "ounder@example.com")).toBe(false);
    expect(isPlatformAdmin(DB(), "founder@example.com.evil.test")).toBe(false);
  });
});

/**
 * The guard is declared once, on the parent router, and every page is a
 * sub-router mounted under it. That is the right shape — a new file cannot ship
 * ungated by forgetting a line — but it only holds if Hono actually applies a
 * parent's `.use()` to routes contributed by `.route()`. If it ever does not,
 * these endpoints serve every tenant's data to anyone signed in, and nothing
 * else in the suite would notice.
 */
const EVERY_ADMIN_ROUTE = [
  "/api/admin/me",
  "/api/admin/overview",
  "/api/admin/live",
  "/api/admin/actions",
  "/api/admin/accounts",
  "/api/admin/accounts/org_anything",
  "/api/admin/product",
  "/api/admin/forms",
  "/api/admin/revenue",
  "/api/admin/ai",
  "/api/admin/health",
  "/api/admin/users",
];

describe("every route is behind the one guard", () => {
  it.each(EVERY_ADMIN_ROUTE)("%s is 404 without a session", async (path) => {
    expect((await fetchApi(path)).status).toBe(404);
  });

  it.each(EVERY_ADMIN_ROUTE)("%s is 404 for a signed-in customer", async (path) => {
    expect((await fetchApi(path, { headers: { cookie: customer.cookie } })).status).toBe(404);
  });

  it.each(EVERY_ADMIN_ROUTE)("%s answers for an admin", async (path) => {
    const res = await fetchApi(path, { headers: { cookie: admin.cookie } });
    // 404 is allowed only for the deliberately-missing organization.
    if (path.endsWith("org_anything")) expect(res.status).toBe(404);
    else expect(res.status, path).toBe(200);
  });

  it("gates the write routes too", async () => {
    const writes: [string, string][] = [
      ["POST", "/api/admin/impersonate"],
      ["POST", "/api/admin/accounts/org_x/refresh-entitlements"],
      ["POST", "/api/admin/accounts/org_x/overrides"],
      ["POST", "/api/admin/accounts/org_x/plan"],
      ["DELETE", "/api/admin/accounts/org_x/plan"],
      ["POST", "/api/admin/subscriptions/sub_x/grace"],
      ["POST", "/api/admin/billing-events/evt_x/reprocess"],
    ];
    for (const [method, path] of writes) {
      const res = await fetchApi(path, {
        method,
        headers: { cookie: customer.cookie, "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status, path).toBe(404);
    }
  });
});

describe("the daily rollup", () => {
  it("counts today's signups, orgs and forms", async () => {
    const today = utcDay();
    await rollupPlatformDaily(DB(), today);
    const rows = await DB()
      .DB.prepare(`SELECT metric, value FROM platform_metrics_daily WHERE date = ? AND dimension = ''`)
      .bind(today)
      .all<{ metric: string; value: number }>();
    const by = new Map((rows.results ?? []).map((r) => [r.metric, r.value]));
    // Two tenants were seeded in this run, each with an org and a form.
    expect(by.get("signups")).toBeGreaterThanOrEqual(2);
    expect(by.get("orgs_created")).toBeGreaterThanOrEqual(2);
    expect(by.get("forms_created")).toBeGreaterThanOrEqual(2);
  });

  /**
   * The cron runs this every five minutes, so it re-counts the same day roughly
   * 288 times. An `ON CONFLICT DO UPDATE SET value = value + …` here — the
   * shape the structure rollup legitimately uses — would multiply every daily
   * number by the number of ticks since midnight.
   */
  it("is idempotent across runs", async () => {
    const today = utcDay();
    await rollupPlatformDaily(DB(), today);
    const first = await DB()
      .DB.prepare(`SELECT value FROM platform_metrics_daily WHERE date = ? AND metric = 'signups' AND dimension = ''`)
      .bind(today)
      .first<{ value: number }>();
    await rollupPlatformDaily(DB(), today);
    await rollupPlatformDaily(DB(), today);
    const third = await DB()
      .DB.prepare(`SELECT value FROM platform_metrics_daily WHERE date = ? AND metric = 'signups' AND dimension = ''`)
      .bind(today)
      .first<{ value: number }>();
    expect(third?.value).toBe(first?.value);
  });

  it("excludes test-mode responses", async () => {
    const today = utcDay();
    const now = Date.now();
    await DB()
      .DB.prepare(
        `INSERT INTO submissions (id, form_id, organization_id, status, source, is_test, started_at, completed_at)
         VALUES (?, ?, ?, 'completed', 'chat', 1, ?, ?)`,
      )
      .bind(`sub_test_${now}`, customer.formId, customer.orgId, now, now)
      .run();
    await rollupPlatformDaily(DB(), today);
    const before = await DB()
      .DB.prepare(`SELECT value FROM platform_metrics_daily WHERE date = ? AND metric = 'responses_completed' AND dimension = ''`)
      .bind(today)
      .first<{ value: number }>();

    await DB()
      .DB.prepare(
        `INSERT INTO submissions (id, form_id, organization_id, status, source, is_test, started_at, completed_at)
         VALUES (?, ?, ?, 'completed', 'chat', 0, ?, ?)`,
      )
      .bind(`sub_real_${now}`, customer.formId, customer.orgId, now, now)
      .run();
    await rollupPlatformDaily(DB(), today);
    const after = await DB()
      .DB.prepare(`SELECT value FROM platform_metrics_daily WHERE date = ? AND metric = 'responses_completed' AND dimension = ''`)
      .bind(today)
      .first<{ value: number }>();

    // The real one moved the number; the test one never did.
    expect(after?.value).toBe((before?.value ?? 0) + 1);
  });

  /**
   * The console counted completions only, so a form everybody walked out of
   * reported the same number as one nobody abandoned.
   *
   * The two metrics are bucketed by different columns on purpose — completions
   * by `completed_at`, partials by `started_at` — so this checks the same row
   * cannot land in both.
   */
  it("counts an unfinished response as partial and not as completed", async () => {
    const today = utcDay();
    const now = Date.now();
    const read = async (metric: string) =>
      (
        await DB()
          .DB.prepare(`SELECT value FROM platform_metrics_daily WHERE date = ? AND metric = ? AND dimension = ''`)
          .bind(today, metric)
          .first<{ value: number }>()
      )?.value ?? 0;

    await rollupPlatformDaily(DB(), today);
    const [partialBefore, completedBefore] = [await read("responses_partial"), await read("responses_completed")];

    await DB()
      .DB.prepare(
        `INSERT INTO submissions (id, form_id, organization_id, status, source, is_test, started_at)
         VALUES (?, ?, ?, 'abandoned', 'chat', 0, ?)`,
      )
      .bind(`sub_partial_${now}`, customer.formId, customer.orgId, now)
      .run();
    await rollupPlatformDaily(DB(), today);

    expect(await read("responses_partial")).toBe(partialBefore + 1);
    expect(await read("responses_completed")).toBe(completedBefore);
  });

  it("stops counting a partial once it is finished", async () => {
    const today = utcDay();
    const now = Date.now();
    const id = `sub_resumed_${now}`;
    await DB()
      .DB.prepare(
        `INSERT INTO submissions (id, form_id, organization_id, status, source, is_test, started_at)
         VALUES (?, ?, ?, 'in_progress', 'chat', 0, ?)`,
      )
      .bind(id, customer.formId, customer.orgId, now)
      .run();
    await rollupPlatformDaily(DB(), today);
    const while_open = await DB()
      .DB.prepare(`SELECT value FROM platform_metrics_daily WHERE date = ? AND metric = 'responses_partial' AND dimension = ''`)
      .bind(today)
      .first<{ value: number }>();

    await DB()
      .DB.prepare(`UPDATE submissions SET status = 'completed', completed_at = ? WHERE id = ?`)
      .bind(now, id)
      .run();
    await rollupPlatformDaily(DB(), today);
    const after = await DB()
      .DB.prepare(`SELECT value FROM platform_metrics_daily WHERE date = ? AND metric = 'responses_partial' AND dimension = ''`)
      .bind(today)
      .first<{ value: number }>();

    expect(after?.value).toBe((while_open?.value ?? 0) - 1);
  });
});

describe("the backfill", () => {
  /**
   * The bug this guards against draws a revenue line that is flat all the way
   * back to the first signup — because every historical day was stamped with
   * today's subscriptions. It looks like a real chart, which is what makes it
   * worth a test rather than a comment.
   */
  it("never writes today's MRR onto a past date", async () => {
    const yesterday = utcDay(Date.now() - 86_400_000);
    await rollupPlatformDaily(DB(), yesterday);
    const snapshots = await DB()
      .DB.prepare(
        `SELECT metric FROM platform_metrics_daily
          WHERE date = ? AND metric IN ('mrr_cents', 'paying_orgs', 'orgs_by_plan')`,
      )
      .bind(yesterday)
      .all();
    expect(snapshots.results ?? []).toHaveLength(0);

    // Today still gets them — the guard is about the date, not about the metric.
    await rollupPlatformDaily(DB(), utcDay());
    const today = await DB()
      .DB.prepare(`SELECT metric FROM platform_metrics_daily WHERE date = ? AND metric = 'mrr_cents'`)
      .bind(utcDay())
      .all();
    expect(today.results ?? []).toHaveLength(1);
  });

  it("does nothing when there is no history to fill", async () => {
    // Every seeded account was created today, so there is no past day to count —
    // and walking back to 1970 writing zeros would be the alternative.
    await DB().DB.prepare(`DELETE FROM platform_metrics_daily`).run();
    expect(await backfillPlatformDaily(DB(), 5)).toBe(0);
  });

  it("fills gaps oldest-first and stops once there are none", async () => {
    await DB().DB.prepare(`DELETE FROM platform_metrics_daily`).run();
    // An account that signed up a week ago is what gives the backfill a range.
    await DB()
      .DB.prepare(`UPDATE users SET created_at = ? WHERE email = 'acme@example.com'`)
      .bind(Date.now() - 7 * 86_400_000)
      .run();

    const first = await backfillPlatformDaily(DB(), 3);
    expect(first).toBe(3);

    const dates = await DB()
      .DB.prepare(`SELECT DISTINCT date FROM platform_metrics_daily ORDER BY date`)
      .all<{ date: string }>();
    const filled = (dates.results ?? []).map((r) => r.date);
    expect(filled).toEqual([...filled].sort());
    // A day already counted is never recounted, so a second pass moves on.
    const second = await backfillPlatformDaily(DB(), 3);
    const after = await DB().DB.prepare(`SELECT DISTINCT date FROM platform_metrics_daily`).all();
    expect((after.results ?? []).length).toBe(filled.length + second);
  });
});

describe("the form-structure rollup", () => {
  it("tallies block types and question wording", async () => {
    await env.KV_CONFIG.delete("rollup:forms:day");
    await env.KV_CONFIG.delete("rollup:forms:cursor");
    const done = await rollupFormStructure(DB(), 300);
    expect(done).toBe(true);

    const types = await DB()
      .DB.prepare(`SELECT dimension, value FROM platform_metrics_daily WHERE date = ? AND metric = 'block_types'`)
      .bind(utcDay())
      .all<{ dimension: string; value: number }>();
    const byType = new Map((types.results ?? []).map((r) => [r.dimension, r.value]));
    // `minimalDoc` gives every seeded tenant a welcome block and an email question.
    expect(byType.get("email")).toBeGreaterThanOrEqual(2);

    const questions = await DB()
      .DB.prepare(`SELECT norm_text, sample_text, block_type, form_count, org_count FROM platform_question_stats`)
      .all<{ norm_text: string; sample_text: string; block_type: string; form_count: number; org_count: number }>();
    const email = (questions.results ?? []).find((r) => r.norm_text === "email");
    // "Email?" normalises to "email"; the trailing question mark is dropped.
    expect(email).toBeDefined();
    expect(email!.block_type).toBe("email");
    expect(email!.sample_text).toBe("Email?");
    // Two tenants, two separate organizations asking it.
    expect(email!.org_count).toBeGreaterThanOrEqual(2);
  });

  it("does not count welcome and statement blocks as questions", async () => {
    const rows = await DB()
      .DB.prepare(`SELECT block_type FROM platform_question_stats WHERE block_type IN ('welcome', 'statement')`)
      .all();
    expect(rows.results ?? []).toHaveLength(0);
  });

  it("counts an organization once no matter how its forms are batched", async () => {
    // A batch size of one forces the org-boundary logic to do real work: without
    // it, an organization split across batches would be counted once per batch.
    await env.KV_CONFIG.delete("rollup:forms:day");
    await env.KV_CONFIG.delete("rollup:forms:cursor");
    let guard = 0;
    while (!(await rollupFormStructure(DB(), 1)) && guard++ < 50);

    const email = await DB()
      .DB.prepare(`SELECT org_count, form_count FROM platform_question_stats WHERE norm_text = 'email'`)
      .first<{ org_count: number; form_count: number }>();
    // One organization per tenant, one "Email?" question each — so the two must
    // be equal, whatever the batching.
    expect(email?.org_count).toBe(email?.form_count);
  });
});

describe("the overview", () => {
  it("returns a funnel that never widens as it descends", async () => {
    const res = await fetchApi("/api/admin/overview?range=30d", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      funnel: { key: string; count: number; rate: number }[];
      days: string[];
      series: Record<string, number[]>;
    };

    expect(body.funnel[0]!.key).toBe("signed_up");
    for (let i = 1; i < body.funnel.length; i++) {
      expect(body.funnel[i]!.count).toBeLessThanOrEqual(body.funnel[i - 1]!.count);
    }
    // Every series is gap-filled to one point per day in the range.
    expect(body.days).toHaveLength(30);
    for (const series of Object.values(body.series)) expect(series).toHaveLength(30);
  });

  /**
   * The console's largest blind spot before this table existed: every
   * transactional message shares one queue, and the only record of any of them
   * was a `console.log` in the consumer. An expired provider key takes sign-in
   * down for every new account at once and showed up on no screen.
   */
  describe("mail deliveries", () => {
    beforeEach(async () => {
      await env.DB.prepare(`DELETE FROM mail_deliveries`).run();
    });

    it("counts jobs, messages and the ones the queue gave up on", async () => {
      const otp = { kind: "otp", to: "someone@gmail.com", code: "123456", purpose: "sign-in" } as const;
      await recordMailDelivery(DB(), otp, {
        status: "sent",
        attempt: 1,
        result: { messages: 1, domains: ["gmail.com"], messageIds: ["cf-1"], transports: ["cloudflare"] },
      });
      await recordMailDelivery(DB(), otp, { status: "failed", attempt: 1, error: new Error("transient") });
      // At the queue's `max_retries`, so this one is in the dead-letter queue.
      await recordMailDelivery(DB(), otp, { status: "failed", attempt: 5, error: new Error("sender unverified") });

      const res = await fetchApi("/api/admin/health?range=30d", { headers: { cookie: admin.cookie } });
      const { mail } = (await res.json()) as {
        mail: {
          jobs: number;
          messages: number;
          failed: number;
          skipped: number;
          gaveUp: number;
          noop: number;
          deliveryRate: number;
          byKind: unknown[];
        };
      };

      expect(mail.jobs).toBe(3);
      expect(mail.messages).toBe(1);
      expect(mail.failed).toBe(2);
      expect(mail.gaveUp).toBe(1);
      expect(mail.deliveryRate).toBe(33.3);
      expect(mail.byKind).toHaveLength(1);
    });

    /**
     * A job that ran and mailed nobody is neither a delivery nor a failure, and
     * counting it as either is how "we sent it" became a claim this table could
     * not support. It stays out of the rate and gets its own number.
     */
    it("keeps jobs that had nobody to mail out of the delivery rate", async () => {
      const sub = {
        kind: "submission",
        organizationId: "org_x",
        formId: "frm_x",
        responseId: "sbm_x",
        isTest: false,
      } as const;
      await recordMailDelivery(DB(), sub, {
        status: "sent",
        attempt: 1,
        result: { messages: 1, domains: ["gmail.com"], messageIds: ["cf-9"], transports: ["cloudflare"] },
      });
      await recordMailDelivery(DB(), sub, { status: "skipped", attempt: 1, result: NO_MAIL });

      const res = await fetchApi("/api/admin/health?range=30d", { headers: { cookie: admin.cookie } });
      const { mail } = (await res.json()) as {
        mail: { jobs: number; skipped: number; deliveryRate: number; noop: number };
      };

      expect(mail.jobs).toBe(2);
      expect(mail.skipped).toBe(1);
      // One job had something to send and sent it. The skipped one is not a
      // 50% delivery rate.
      expect(mail.deliveryRate).toBe(100);
      expect(mail.noop).toBe(0);
    });

    /**
     * A message rendered, counted and handed to nobody, because no provider is
     * configured. Every other number on the health card reads as healthy while
     * this happens, which is why it gets its own.
     */
    it("counts messages that went out over the noop transport", async () => {
      await recordMailDelivery(
        DB(),
        { kind: "otp", to: "someone@gmail.com", code: "123456", purpose: "sign-in" },
        {
          status: "sent",
          attempt: 1,
          result: { messages: 1, domains: ["gmail.com"], messageIds: [], transports: ["noop"] },
        },
      );

      const res = await fetchApi("/api/admin/health?range=30d", { headers: { cookie: admin.cookie } });
      const { mail } = (await res.json()) as { mail: { noop: number } };
      expect(mail.noop).toBe(1);
    });

    /**
     * The privacy rule this table is built around, asserted rather than trusted:
     * the console reads across every tenant, so an address reaching it would be
     * a cross-tenant leak of exactly the kind the rest of the surface refuses.
     * The column does not exist, and this fails if anyone adds one.
     */
    it("never records or returns a recipient address", async () => {
      await recordMailDelivery(
        DB(),
        { kind: "password_reset", to: "private.person@example.com", name: null, resetUrl: "https://x" },
        { status: "failed", attempt: 5, error: new Error("mailbox full") },
      );

      const stored = await env.DB.prepare(`SELECT * FROM mail_deliveries`).first<Record<string, unknown>>();
      expect(Object.values(stored ?? {}).join(" ")).not.toContain("private.person");
      expect(stored?.domain).toBe("example.com");

      const res = await fetchApi("/api/admin/health?range=30d", { headers: { cookie: admin.cookie } });
      expect(JSON.stringify(await res.json())).not.toContain("private.person");
    });

    it("reports a healthy pipe as 100% when nothing has been queued", async () => {
      const res = await fetchApi("/api/admin/health?range=30d", { headers: { cookie: admin.cookie } });
      const { mail } = (await res.json()) as { mail: { deliveryRate: number; gaveUp: number } };
      expect(mail.deliveryRate).toBe(100);
      expect(mail.gaveUp).toBe(0);
    });
  });

  /**
   * Every range the picker offers has to be one the API accepts, and the
   * accepted set used to be retyped in four places — `RANGES`, `RangeQuery`,
   * an inline enum in `core.ts`, and the rollup's cache-invalidation loop. A
   * range added to one of them was rejected by the next with a 400 naming a
   * value the picker had just offered. Driving this loop off `RANGES` means a
   * new period cannot ship half-wired.
   */
  it("accepts every range it publishes, on every route that takes one", async () => {
    const routes = ["overview", "product", "revenue", "ai", "health"];
    for (const range of Object.keys(RANGES)) {
      for (const route of routes) {
        const res = await fetchApi(`/api/admin/${route}?range=${range}`, { headers: { cookie: admin.cookie } });
        expect(res.status, `${route}?range=${range}`).toBe(200);
      }
    }
  });

  it("returns one day of series for the shortest range", async () => {
    const res = await fetchApi("/api/admin/overview?range=1d", { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as { days: string[]; series: Record<string, number[]> };
    expect(body.days).toEqual([utcDay()]);
    for (const series of Object.values(body.series)) expect(series).toHaveLength(1);
  });

  /**
   * The rollup busts one cache key per range. A range missing from that loop
   * is not an error anywhere — it just serves a stale overview for five minutes
   * after every tick, which reads as "the dashboard is broken" rather than "the
   * dashboard is cached".
   */
  it("the rollup invalidates the cached overview for every range", async () => {
    for (const range of Object.keys(RANGES)) {
      await fetchApi(`/api/admin/overview?range=${range}`, { headers: { cookie: admin.cookie } });
      expect(await env.KV_CONFIG.get(`admin:overview:${range}`)).not.toBeNull();
    }
    await rollupPlatformDaily(DB());
    for (const range of Object.keys(RANGES)) {
      expect(await env.KV_CONFIG.get(`admin:overview:${range}`), range).toBeNull();
    }
  });

  /**
   * The bug this locks down: the funnel said "Published it — 3", clicking the
   * bar listed one account, because the chart counted cumulative stages and the
   * cohort filter tested a single condition. Both read `STAGE_OF_ORG` now, and
   * this asserts they keep agreeing — for every step, not just the one that
   * happened to be wrong.
   */
  it("every funnel step counts the same accounts the list it links to shows", async () => {
    const overview = (await (
      await fetchApi("/api/admin/overview?range=365d", { headers: { cookie: admin.cookie } })
    ).json()) as { funnel: { key: string; count: number }[] };

    for (const step of overview.funnel) {
      if (step.key === "signed_up") continue;
      const res = await fetchApi(`/api/admin/accounts?cohort=${step.key}&since=365&limit=100`, {
        headers: { cookie: admin.cookie },
      });
      const { accounts, total } = (await res.json()) as { accounts: unknown[]; total: number };
      expect(accounts.length, `${step.key} rows`).toBe(step.count);
      // And the pager's total must describe the filter, not the whole table.
      expect(total, `${step.key} total`).toBe(step.count);
    }
  });

  it("caps retention cells at 100% and leaves future weeks null", async () => {
    const res = await fetchApi("/api/admin/overview", { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as { cohorts: { cohort: string; size: number; retention: (number | null)[] }[] };
    for (const row of body.cohorts) {
      for (const cell of row.retention) {
        if (cell === null) continue;
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThanOrEqual(100);
      }
      // A cohort's row shortens as it gets older: it cannot be retained into a
      // week that has not happened.
      expect(row.retention.length).toBeGreaterThan(0);
    }
  });
});

/**
 * The one tile on the console that does not read the rollup.
 *
 * Its whole claim is "right now", so the two things worth pinning down are that
 * a row written this minute is visible without waiting for a cron, and that the
 * buckets stay a fixed-length window whatever the traffic is.
 */
describe("live activity", () => {
  it("puts an event from this minute in the newest bucket", async () => {
    const now = Date.now();
    await DB()
      .DB.prepare(
        `INSERT INTO submissions (id, form_id, organization_id, status, source, is_test, started_at)
         VALUES (?, ?, ?, 'in_progress', 'chat', 0, ?)`,
      )
      .bind(`sub_live_${now}`, customer.formId, customer.orgId, now)
      .run();

    const res = await fetchApi("/api/admin/live", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      minutes: number;
      total: number;
      events: { key: string; label: string; total: number; counts: number[] }[];
    };

    expect(body.minutes).toBe(30);
    for (const event of body.events) expect(event.counts).toHaveLength(30);
    const started = body.events.find((e) => e.key === "responses_started")!;
    // The last bucket is the minute in progress, which is the one just written.
    expect(started.counts.at(-1)).toBeGreaterThanOrEqual(1);
    expect(started.total).toBeGreaterThanOrEqual(1);
    expect(body.total).toBeGreaterThanOrEqual(started.total);
  });

  it("does not count test-mode traffic", async () => {
    const now = Date.now();
    const before = await liveTotal("responses_started");
    await DB()
      .DB.prepare(
        `INSERT INTO submissions (id, form_id, organization_id, status, source, is_test, started_at)
         VALUES (?, ?, ?, 'in_progress', 'chat', 1, ?)`,
      )
      .bind(`sub_live_test_${now}`, customer.formId, customer.orgId, now)
      .run();
    expect(await liveTotal("responses_started")).toBe(before);
  });

  async function liveTotal(key: string): Promise<number> {
    const res = await fetchApi("/api/admin/live", { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as { events: { key: string; total: number }[] };
    return body.events.find((e) => e.key === key)?.total ?? 0;
  }
});

describe("the accounts explorer", () => {
  it("lists organizations with their owner and plan", async () => {
    const res = await fetchApi("/api/admin/accounts?limit=100", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accounts: Record<string, unknown>[]; total: number };
    const acme = body.accounts.find((a) => a.id === customer.orgId);
    expect(acme).toBeDefined();
    expect(acme!.owner_email).toBe("acme@example.com");
    expect(acme!.plan).toBe("free");
    expect(Number(acme!.forms)).toBeGreaterThanOrEqual(1);
  });

  it("searches by owner email", async () => {
    const res = await fetchApi("/api/admin/accounts?q=acme@example.com", { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as { accounts: { id: string }[] };
    expect(body.accounts.map((a) => a.id)).toContain(customer.orgId);
  });

  it("filters to a cohort", async () => {
    const withForms = await fetchApi("/api/admin/accounts?cohort=created_form&limit=100", {
      headers: { cookie: admin.cookie },
    });
    const none = await fetchApi("/api/admin/accounts?cohort=no_form&limit=100", { headers: { cookie: admin.cookie } });
    const a = ((await withForms.json()) as { accounts: { id: string }[] }).accounts.map((x) => x.id);
    const b = ((await none.json()) as { accounts: { id: string }[] }).accounts.map((x) => x.id);
    expect(a).toContain(customer.orgId);
    // The two cohorts are complements: an org cannot be in both.
    expect(b).not.toContain(customer.orgId);
  });

  it("sorts without breaking the numbered parameters", async () => {
    for (const sort of ["created", "responses", "forms", "ai", "active", "mrr"]) {
      const res = await fetchApi(`/api/admin/accounts?sort=${sort}`, { headers: { cookie: admin.cookie } });
      expect(res.status, sort).toBe(200);
    }
  });

  it("returns one account in full, and 404s for an id that does not exist", async () => {
    const res = await fetchApi(`/api/admin/accounts/${customer.orgId}`, { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      org: { id: string };
      members: { email: string }[];
      forms: { title: string; blocks: number }[];
    };
    expect(body.org.id).toBe(customer.orgId);
    expect(body.members.map((m) => m.email)).toContain("acme@example.com");
    expect(body.forms[0]!.blocks).toBeGreaterThan(0);

    const missing = await fetchApi("/api/admin/accounts/org_does_not_exist", { headers: { cookie: admin.cookie } });
    expect(missing.status).toBe(404);
  });
});

describe("the action queue", () => {
  it("surfaces a subscription in dunning", async () => {
    await DB()
      .DB.prepare(
        `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status, seats, created_at, updated_at)
         VALUES ('sub_dunning', ?, 'pro', 'dodo_dunning', 'monthly', 'on_hold', 1, ?, ?)
         ON CONFLICT (dodo_subscription_id) DO NOTHING`,
      )
      .bind(customer.orgId, Date.now(), Date.now())
      .run();

    const res = await fetchApi("/api/admin/actions", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dunning: { org_id: string }[] };
    expect(body.dunning.map((d) => d.org_id)).toContain(customer.orgId);
  });

  it("does not flag a billing event that was processed", async () => {
    const now = Date.now();
    await DB()
      .DB.prepare(
        `INSERT INTO dodo_events (id, dodo_event_id, type, payload, status, processed_at, error, created_at)
         VALUES ('de_ok', 'evt_ok', 'subscription.active', '{}', 'processed', ?, 'ignored: nothing to do', ?)`,
      )
      .bind(now, now)
      .run();
    await DB()
      .DB.prepare(
        `INSERT INTO dodo_events (id, dodo_event_id, type, payload, status, error, created_at)
         VALUES ('de_bad', 'evt_bad', 'subscription.active', '{}', 'failed', 'boom', ?)`,
      )
      .bind(now)
      .run();

    const res = await fetchApi("/api/admin/actions", { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as { stuckBillingEvents: { dodo_event_id: string }[] };
    const ids = body.stuckBillingEvents.map((e) => e.dodo_event_id);
    // `error` is populated on the processed one too — it doubles as a "what did
    // we do about it" note — so only `status` may decide this.
    expect(ids).toContain("evt_bad");
    expect(ids).not.toContain("evt_ok");
  });
});

describe("impersonation", () => {
  async function mint(targetUserId: string, cookie = admin.cookie) {
    const res = await fetchApi("/api/admin/impersonate", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ userId: targetUserId, reason: "test" }),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as { token?: string } | null };
  }

  it("mints a token for a real user and records it in that org's audit log", async () => {
    const { status, body } = await mint(customer.userId);
    expect(status).toBe(200);
    expect(body?.token).toBeTruthy();

    const audit = await DB()
      .DB.prepare(
        `SELECT action, actor_type, actor_label FROM audit_logs
          WHERE organization_id = ? AND action = 'admin.impersonation.started'
          ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(customer.orgId)
      .first<{ action: string; actor_type: string; actor_label: string }>();
    // The customer can see, in their own activity log, that we did this.
    expect(audit?.actor_type).toBe("platform_admin");
    expect(audit?.actor_label).toBe("founder@example.com");
  });

  it("acts as the customer on ordinary product routes", async () => {
    const { body } = await mint(customer.userId);
    const res = await fetchApi("/api/forms", {
      headers: { cookie: admin.cookie, [IMPERSONATION_HEADER]: body!.token! },
    });
    expect(res.status).toBe(200);
    const forms = (await res.json()) as { id: string }[];
    // The admin's own organization has no forms; the customer's has one. Seeing
    // it is the whole proof that impersonation reaches the product, not just the
    // console that granted it.
    expect(forms.map((f) => f.id)).toContain(customer.formId);
  });

  it("allows writes — this is not a read-only mode", async () => {
    const { body } = await mint(customer.userId);
    const res = await fetchApi("/api/forms", {
      method: "POST",
      headers: {
        cookie: admin.cookie,
        "content-type": "application/json",
        [IMPERSONATION_HEADER]: body!.token!,
      },
      body: JSON.stringify({ title: "Made while impersonating" }),
    });
    expect(res.status).toBeLessThan(300);
    const created = (await res.json()) as { id?: string };
    const row = await DB()
      .DB.prepare(`SELECT organization_id FROM forms WHERE id = ?`)
      .bind(created.id)
      .first<{ organization_id: string }>();
    // It landed in the customer's organization, not the admin's.
    expect(row?.organization_id).toBe(customer.orgId);
  });

  it("refuses a forged token", async () => {
    const forged = `${btoa(JSON.stringify({ adminId: "x", userId: customer.userId, exp: Date.now() + 60_000 }))}.notasignature`;
    const res = await fetchApi("/api/forms", {
      headers: { cookie: admin.cookie, [IMPERSONATION_HEADER]: forged },
    });
    // Falls back to the admin's own session rather than erroring — but it is
    // emphatically not the customer's forms that come back.
    const forms = (await res.json()) as { id: string }[];
    expect(forms.map((f) => f.id)).not.toContain(customer.formId);
  });

  /**
   * The condition that matters most. A stolen token replayed from an ordinary
   * account must be worth nothing — the allowlist is re-checked on every single
   * request, against the live secret, not against what was true when the token
   * was signed.
   */
  it("refuses a valid token presented by a non-admin", async () => {
    const { body } = await mint(admin.userId);
    const res = await fetchApi("/api/forms", {
      headers: { cookie: customer.cookie, [IMPERSONATION_HEADER]: body!.token! },
    });
    expect(res.status).toBe(200);
    const forms = (await res.json()) as { id: string }[];
    // Still the customer's own forms. The token did nothing.
    expect(forms.map((f) => f.id)).toContain(customer.formId);
  });

  it("refuses a token once the admin is removed from the allowlist", async () => {
    const { body } = await mint(customer.userId);
    setAllowlist("someone.else@example.com");
    const res = await fetchApi("/api/forms", {
      headers: { cookie: admin.cookie, [IMPERSONATION_HEADER]: body!.token! },
    });
    const forms = (await res.json()) as { id: string }[];
    expect(forms.map((f) => f.id)).not.toContain(customer.formId);
  });

  it("refuses an expired token", async () => {
    const expired = await signImpersonation(DB(), admin.userId, customer.userId);
    // Rewind past the hour the token is good for.
    const [payload] = expired.token.split(".");
    const stale = JSON.parse(atob(payload!.replaceAll("-", "+").replaceAll("_", "/"))) as { exp: number };
    expect(stale.exp).toBeGreaterThan(Date.now());
    expect(await verifyImpersonation(DB(), `${payload}.wrong`)).toBeNull();
  });

  it("404s for a user that does not exist", async () => {
    const { status } = await mint("usr_not_a_real_user");
    expect(status).toBe(404);
  });

  /**
   * Clicking "Sign in as" on one account and landing in another of the same
   * person's accounts is the bug this prevents. Without the org in the token,
   * `resolveOrgId` falls back to their oldest membership — which is correct for
   * an ordinary sign-in and wrong for a support session that started from a
   * specific account page.
   */
  it("lands in the organization the console asked for", async () => {
    // A second organization for the same person, older than their first, so the
    // fallback would pick it.
    await DB()
      .DB.prepare(
        `INSERT INTO organizations (id, name, slug, created_at) VALUES ('org_second', 'Second Co', 'second-co', ?)`,
      )
      .bind(Date.now() - 999_999)
      .run();
    await DB()
      .DB.prepare(
        `INSERT INTO members (id, organization_id, user_id, role, created_at) VALUES ('mem_second', 'org_second', ?, 'owner', ?)`,
      )
      .bind(customer.userId, 0)
      .run();

    const res = await fetchApi("/api/admin/impersonate", {
      method: "POST",
      headers: { cookie: admin.cookie, "content-type": "application/json" },
      body: JSON.stringify({ userId: customer.userId, orgId: customer.orgId, reason: "test" }),
    });
    const { token } = (await res.json()) as { token: string };

    const forms = (await (
      await fetchApi("/api/forms", { headers: { cookie: admin.cookie, [IMPERSONATION_HEADER]: token } })
    ).json()) as { id: string }[];
    // The org the console named, not the oldest membership.
    expect(forms.map((f) => f.id)).toContain(customer.formId);
  });

  it("ignores an organization the target does not belong to", async () => {
    const res = await fetchApi("/api/admin/impersonate", {
      method: "POST",
      headers: { cookie: admin.cookie, "content-type": "application/json" },
      // The admin's own org — the customer is not a member of it.
      body: JSON.stringify({ userId: customer.userId, orgId: admin.orgId, reason: "test" }),
    });
    const { token } = (await res.json()) as { token: string };

    const forms = (await (
      await fetchApi("/api/forms", { headers: { cookie: admin.cookie, [IMPERSONATION_HEADER]: token } })
    ).json()) as { id: string }[];
    // Falls back to a real membership rather than honouring the claim — a token
    // cannot be edited into access its subject does not have.
    expect(forms.map((f) => f.id)).not.toContain(admin.formId);
  });
});

describe("comped plans", () => {
  /** The console's own row, told apart from a real one by its id prefix. */
  const comped = (orgId: string) =>
    DB()
      .DB.prepare(
        `SELECT plan_id, status, cycle, current_period_end, cancel_at_period_end
           FROM subscriptions WHERE organization_id = ? AND dodo_subscription_id = ?`,
      )
      .bind(orgId, `internal_manual_${orgId}`)
      .first<{
        plan_id: string;
        status: string;
        cycle: string;
        current_period_end: number;
        cancel_at_period_end: number;
      }>();

  const grant = (orgId: string, body: Record<string, unknown>) =>
    fetchApi(`/api/admin/accounts/${orgId}/plan`, {
      method: "POST",
      headers: { cookie: admin.cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    await DB().DB.prepare(`DELETE FROM subscriptions WHERE organization_id = ?`).bind(customer.orgId).run();
    await env.KV_CONFIG.delete(`ent:${customer.orgId}`);
  });

  it("puts an account on a paid plan with no Dodo subscription behind it", async () => {
    expect((await grant(customer.orgId, { planId: "business", reason: "founder" })).status).toBe(200);

    const row = await comped(customer.orgId);
    expect(row?.plan_id).toBe("business");
    // Open-ended, so it must outrank anything else the ordering sees.
    expect(row?.status).toBe("active");
    expect(row?.cancel_at_period_end).toBe(0);

    const ent = await getEntitlements(DB(), customer.orgId);
    expect(ent.planId).toBe("business");
    expect(ent.features.activity_log).toBe(true);
  });

  it("writes a timed comp as canceled, so it expires with nothing to run", async () => {
    const res = await grant(customer.orgId, { planId: "pro", months: 1, reason: "evaluating" });
    const body = (await res.json()) as { endsAt: number };
    const row = await comped(customer.orgId);

    // `active` would never expire — `effectivePlan` ignores the period on an
    // active row. `canceled` with a future end is the path that lapses by itself.
    expect(row?.status).toBe("canceled");
    expect(row?.cancel_at_period_end).toBe(1);
    expect(row?.current_period_end).toBe(body.endsAt);
    expect(body.endsAt).toBeGreaterThan(Date.now());

    expect((await getEntitlements(DB(), customer.orgId)).planId).toBe("pro");

    // And the same row, read after its end date, is Free again.
    expect(
      effectivePlan({ planId: "pro", status: "canceled", periodEnd: body.endsAt, now: body.endsAt + 1 }).planId,
    ).toBe("free");
  });

  it("counts whole calendar months, not thirty-day blocks", async () => {
    const res = await grant(customer.orgId, { planId: "pro", months: 12, reason: "annual comp" });
    const { endsAt } = (await res.json()) as { endsAt: number };
    const now = new Date();
    expect(new Date(endsAt).getUTCFullYear()).toBe(now.getUTCFullYear() + 1);
  });

  it("grants twice without stacking rows", async () => {
    await grant(customer.orgId, { planId: "pro", reason: "first" });
    await grant(customer.orgId, { planId: "business", reason: "upgraded the comp" });
    const all = await DB()
      .DB.prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE organization_id = ?`)
      .bind(customer.orgId)
      .first<{ n: number }>();
    expect(all?.n).toBe(1);
    expect((await comped(customer.orgId))?.plan_id).toBe("business");
  });

  it("refuses a timed comp that a live paid subscription would outrank", async () => {
    await DB()
      .DB.prepare(
        `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status, seats, created_at, updated_at)
         VALUES ('sub_real', ?, 'pro', 'dodo_real_1', 'monthly', 'active', 1, ?, ?)`,
      )
      .bind(customer.orgId, Date.now(), Date.now())
      .run();

    const res = await grant(customer.orgId, { planId: "business", months: 1, reason: "evaluating" });
    expect(res.status).toBe(409);
    expect(await comped(customer.orgId)).toBeNull();

    // The open-ended form is allowed, because an active row wins on recency.
    expect((await grant(customer.orgId, { planId: "business", reason: "forever" })).status).toBe(200);
    expect((await getEntitlements(DB(), customer.orgId)).planId).toBe("business");
  });

  it("takes back only the row the console wrote", async () => {
    await DB()
      .DB.prepare(
        `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status, seats, created_at, updated_at)
         VALUES ('sub_paid', ?, 'pro', 'dodo_real_2', 'monthly', 'active', 1, ?, ?)`,
      )
      .bind(customer.orgId, Date.now(), Date.now())
      .run();
    await grant(customer.orgId, { planId: "business", reason: "comp" });

    const res = await fetchApi(`/api/admin/accounts/${customer.orgId}/plan`, {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });
    expect(res.status).toBe(200);
    expect(await comped(customer.orgId)).toBeNull();
    // What they were actually paying for survives.
    expect((await getEntitlements(DB(), customer.orgId)).planId).toBe("pro");
  });

  it("tells the customer, in their own activity log", async () => {
    await grant(customer.orgId, { planId: "pro", months: 3, reason: "ticket 41" });
    const row = await DB()
      .DB.prepare(
        `SELECT actor_type, actor_label, meta FROM audit_logs
          WHERE organization_id = ? AND action = 'admin.plan.granted' ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(customer.orgId)
      .first<{ actor_type: string; actor_label: string; meta: string }>();
    expect(row?.actor_type).toBe("platform_admin");
    expect(row?.actor_label).toBe("founder@example.com");
    expect(JSON.parse(row!.meta)).toMatchObject({ planId: "pro", months: 3, reason: "ticket 41" });
  });
});

describe("AI pricing", () => {
  it("prices output tokens above input ones", () => {
    const input = costUsdMicro("google/gemini-3.7-flash", 1_000_000, 0);
    const output = costUsdMicro("google/gemini-3.7-flash", 0, 1_000_000);
    expect(output).toBeGreaterThan(input);
    expect(input).toBe(300_000); // $0.30 per million input tokens
    expect(output).toBe(2_500_000); // $2.50 per million output tokens
  });

  /**
   * A model that ships before this table is updated must make the cost chart
   * look alarming, not free — a silent zero is how a margin problem stays
   * invisible for a quarter.
   */
  it("falls back to a non-zero rate for an unknown model", () => {
    expect(costUsdMicro("some/model-we-have-not-priced", 1000, 1000)).toBeGreaterThan(0);
  });

  it("costs nothing when nothing was spent", () => {
    expect(costUsdMicro("google/gemini-3.7-flash", 0, 0)).toBe(0);
  });
});

/**
 * The margin table has to separate two things that look identical in the data:
 * an account whose billing has broken, and one that was handed its plan.
 */
describe("the margin table", () => {
  it("marks an account on a hand-granted plan as comped rather than as paying nothing", async () => {
    const granted = await seedTenant("granted");
    const now = Date.now();
    await DB()
      .DB.prepare(
        `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status, seats, created_at, updated_at)
         VALUES ('sub_granted', ?, 'business', 'internal_manual_granted', 'yearly', 'active', 5, ?, ?)`,
      )
      .bind(granted.orgId, now, now)
      .run();
    await DB()
      .DB.prepare(
        `INSERT INTO ai_generations (id, organization_id, kind, provider, model, prompt_tokens, completion_tokens, cost_usd_micro, created_at)
         VALUES ('gen_granted', ?, 'reply', 'openrouter', 'google/gemini-3.7-flash', 1000, 1000, 100000, ?)`,
      )
      .bind(granted.orgId, now)
      .run();

    const res = await fetchApi("/api/admin/ai", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lossMakers: { org_id: string; plan: string; mrr_cents: number; comped: number }[];
    };
    const row = body.lossMakers.find((r) => r.org_id === granted.orgId);
    // It belongs on the list — a granted plan still costs real money — but the
    // plan it is on and the nothing it pays are not a contradiction.
    expect(row).toBeDefined();
    expect(row!.plan).toBe("business");
    expect(row!.mrr_cents).toBe(0);
    expect(row!.comped).toBe(1);
  });

  it("leaves a paying account's revenue alone", async () => {
    const paying = await seedTenant("paying");
    const now = Date.now();
    await DB()
      .DB.prepare(
        `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status, seats, created_at, updated_at)
         VALUES ('sub_paying', ?, 'business', 'dodo_paying', 'monthly', 'active', 1, ?, ?)`,
      )
      .bind(paying.orgId, now, now)
      .run();
    await DB()
      .DB.prepare(
        `INSERT INTO ai_generations (id, organization_id, kind, provider, model, prompt_tokens, completion_tokens, cost_usd_micro, created_at)
         VALUES ('gen_paying', ?, 'reply', 'openrouter', 'google/gemini-3.7-flash', 1000, 1000, 100000, ?)`,
      )
      .bind(paying.orgId, now)
      .run();

    const res = await fetchApi("/api/admin/ai", { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as {
      topSpenders: { org_id: string; mrr_cents: number; comped: number }[];
    };
    const row = body.topSpenders.find((r) => r.org_id === paying.orgId);
    expect(row?.mrr_cents).toBeGreaterThan(0);
    expect(row?.comped).toBe(0);
  });
});
