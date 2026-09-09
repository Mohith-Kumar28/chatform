import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { isPlatformAdmin } from "../src/lib/platform-admin.js";
import { rollupPlatformDaily, rollupFormStructure, backfillPlatformDaily, utcDay } from "../src/lib/platform-rollup.js";
import { costUsdMicro } from "../src/lib/ai-pricing.js";
import { IMPERSONATION_HEADER, signImpersonation, verifyImpersonation } from "../src/lib/impersonation.js";
import { PLANS } from "@repo/entitlements";

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
  for (const range of ["7d", "30d", "90d", "365d"]) await env.KV_CONFIG.delete(`admin:overview:${range}`);
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
