import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { createAuth } from "../lib/auth.js";

/**
 * M9 billing — Dodo Payments (MoR): hosted checkout + signed webhooks +
 * usage_counters enforcement. E2E requires DODO_API_KEY + DODO_WEBHOOK_SECRET.
 */

export const billingRouter = new Hono<{ Bindings: Bindings; Variables: { userId: string } }>();

billingRouter.use("*", async (c, next) => {
  if (c.req.path === "/api/billing/webhook") return next(); // Dodo calls this
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
  c.set("userId", session.user.id);
  await next();
});

/** Current plan limits for an org (free defaults when no subscription). */
export const FREE_LIMITS = {
  responses_per_month: 100,
  ai_generations_per_month: 10,
  forms_count: 3,
  seats: 1,
  file_storage_mb: 50,
  max_upload_mb_per_file: 5,
  advanced_analytics: 0,
  remove_branding: 0,
  custom_domain: 0,
  hard_stop_on_overage: 1,
};

export async function getPlanLimits(env: Bindings, organizationId: string): Promise<Record<string, number>> {
  const sub = await env.DB.prepare(
    `SELECT p.limits_json FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.organization_id = ? AND s.status IN ('active','trialing') ORDER BY s.created_at DESC LIMIT 1`,
  )
    .bind(organizationId)
    .first<{ limits_json: string }>();
  if (sub) return { ...FREE_LIMITS, ...JSON.parse(sub.limits_json) };
  return FREE_LIMITS;
}

export async function getUsage(env: Bindings, organizationId: string, metric: string): Promise<number> {
  const period = new Date().toISOString().slice(0, 7);
  const row = await env.DB.prepare(
    `SELECT used FROM usage_counters WHERE organization_id = ? AND period = ? AND metric = ?`,
  )
    .bind(organizationId, period, metric)
    .first<{ used: number }>();
  return row?.used ?? 0;
}

export async function incrementUsage(env: Bindings, organizationId: string, metric: string, n = 1): Promise<void> {
  const period = new Date().toISOString().slice(0, 7);
  await env.DB.prepare(
    `INSERT INTO usage_counters (id, organization_id, period, metric, used, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (organization_id, period, metric) DO UPDATE SET used = used + ?, updated_at = ?`,
  )
    .bind(`uc_${crypto.randomUUID().slice(0, 16)}`, organizationId, period, metric, n, Date.now(), n, Date.now())
    .run();
}

/** Hard gate: throws a 402 Response when the org exceeded a hard-stop metric. */
export async function enforceLimit(env: Bindings, organizationId: string, metric: string): Promise<Response | null> {
  const limits = await getPlanLimits(env, organizationId);
  const used = await getUsage(env, organizationId, metric);
  const limit = limits[metric];
  if (limit !== undefined && used >= limit && limits.hard_stop_on_overage) {
    return Response.json(
      { error: { code: "limit_reached", message: `Monthly ${metric.replaceAll("_", " ")} limit reached (${limit}). Upgrade to continue.` } },
      { status: 402 },
    );
  }
  return null;
}

// ─── routes ───

billingRouter.get(
  "/billing/usage",
  describeRoute({
    tags: ["dashboard"],
    summary: "Current usage vs plan limits",
    responses: { 200: { description: "Usage", content: { "application/json": { schema: resolver(z.object({ plan: z.string(), planId: z.string(), status: z.string(), limits: z.record(z.string(), z.number()), usage: z.record(z.string(), z.number()) })) } } } },
  }),
  async (c) => {
    const auth = createAuth(c.env);
    const orgs = await auth.api.listOrganizations({ headers: c.req.raw.headers });
    const orgId = orgs?.[0]?.id;
    if (!orgId) return c.json({ error: { code: "no_organization", message: "No organization" } }, 403);
    const limits = await getPlanLimits(c.env, orgId);
    const usage: Record<string, number> = {};
    for (const metric of ["responses", "ai_generations", "sessions"]) {
      usage[metric] = await getUsage(c.env, orgId, metric);
    }
    const sub = await c.env.DB.prepare(
      `SELECT s.plan_id, s.status, s.current_period_end, p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id
       WHERE s.organization_id = ? AND s.status IN ('active','trialing') LIMIT 1`,
    )
      .bind(orgId)
      .first<{ plan_id: string; status: string; current_period_end: number | null; name: string }>();
    return c.json({ plan: sub?.name ?? "Free", planId: sub?.plan_id ?? "free", status: sub?.status ?? "active", periodEnd: sub?.current_period_end ?? null, limits, usage });
  },
);

billingRouter.post(
  "/billing/checkout",
  validator("json", z.object({ planId: z.enum(["pro", "team"]), cycle: z.enum(["monthly", "yearly"]).default("monthly") })),
  describeRoute({ tags: ["dashboard"], summary: "Create a Dodo checkout session", responses: { 200: { description: "Checkout URL", content: { "application/json": { schema: resolver(z.object({ url: z.string() })) } } }, 503: { description: "Dodo not configured" } } }),
  async (c) => {
    if (!c.env.DODO_API_KEY) {
      return c.json({ error: { code: "billing_not_configured", message: "DODO_API_KEY is not set — add it to .dev.vars to enable checkout" } }, 503);
    }
    const auth = createAuth(c.env);
    const orgs = await auth.api.listOrganizations({ headers: c.req.raw.headers });
    const orgId = orgs?.[0]?.id;
    if (!orgId) return c.json({ error: { code: "no_organization", message: "No organization" } }, 403);
    const { planId, cycle } = c.req.valid("json");

    const plan = await c.env.DB.prepare(`SELECT dodo_product_id, dodo_price_monthly_id, dodo_price_yearly_id FROM plans WHERE id = ?`).bind(planId).first<{ dodo_product_id: string | null; dodo_price_monthly_id: string | null; dodo_price_yearly_id: string | null }>();
    const priceId = cycle === "yearly" ? plan?.dodo_price_yearly_id : plan?.dodo_price_monthly_id;
    if (!plan?.dodo_product_id || !priceId) {
      return c.json({ error: { code: "plan_not_configured", message: "Plan is not linked to a Dodo product yet — create products in the Dodo dashboard and set the IDs in the plans table" } }, 503);
    }

    const res = await fetch("https://live.dodopayments.com/checkouts", {
      method: "POST",
      headers: { authorization: `Bearer ${c.env.DODO_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        product_cart: [{ product_id: plan.dodo_product_id, quantity: 1 }],
        payment_link: true,
        metadata: { organizationId: orgId, planId, cycle },
        customisation: { redirect_url: `${c.env.APP_ORIGIN}/billing?success=1` },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("dodo_checkout_failed", res.status, t.slice(0, 200));
      return c.json({ error: { code: "checkout_failed", message: "Dodo checkout creation failed" } }, 502);
    }
    const data = (await res.json()) as { payment_link?: string; checkout_url?: string; id?: string };
    const url = data.payment_link ?? data.checkout_url;
    if (!url) return c.json({ error: { code: "checkout_failed", message: "No checkout URL returned" } }, 502);
    return c.json({ url });
  },
);

/** Dodo webhook — HMAC-SHA256 (base64) over raw body with DODO_WEBHOOK_SECRET. */
billingRouter.post("/billing/webhook", async (c) => {
  const raw = await c.req.text();
  const sigHeader = c.req.header("webhook-signature") ?? "";
  const secret = c.env.DODO_WEBHOOK_SECRET;
  if (!secret) return c.text("webhook secret not configured", 503);

  // signature format: v1,<base64sig>,t=<ts>,v1,<base64sig>
  const parts = sigHeader.split(",").map((x) => x.trim());
  const ts = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sigs = parts.filter((p) => p.startsWith("v1,")).map((p) => p.slice(3));
  if (!ts || sigs.length === 0) return c.text("invalid signature header", 400);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${raw}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (!sigs.some((s) => s === expected)) return c.text("signature mismatch", 401);

  const evt = JSON.parse(raw) as { event_id?: string; type: string; data: Record<string, unknown> };
  if (evt.event_id) {
    const existing = await c.env.DB.prepare(`SELECT id FROM dodo_events WHERE dodo_event_id = ?`).bind(evt.event_id).first();
    if (existing) return c.json({ received: true, duplicate: true });
    await c.env.DB.prepare(`INSERT INTO dodo_events (id, dodo_event_id, type, payload, status, created_at) VALUES (?, ?, ?, ?, 'received', ?)`)
      .bind(`de_${crypto.randomUUID().slice(0, 16)}`, evt.event_id, evt.type, raw, Date.now())
      .run();
  }

  const meta = (evt.data?.metadata ?? {}) as { organizationId?: string; planId?: string };
  const orgId = meta.organizationId;

  if (orgId && (evt.type === "subscription.active" || evt.type === "payment.succeeded")) {
    const planId = meta.planId ?? "pro";
    const subId = (evt.data?.subscription_id as string) ?? `sub_${evt.event_id ?? crypto.randomUUID().slice(0, 10)}`;
    await c.env.DB.prepare(
      `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, status, current_period_start, current_period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
       ON CONFLICT (dodo_subscription_id) DO UPDATE SET status = 'active', updated_at = ?`,
    )
      .bind(
        `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`,
        orgId,
        planId,
        subId,
        Date.now(),
        Date.now() + 30 * 86400_000,
        Date.now(),
        Date.now(),
        Date.now(),
      )
      .run();
  }
  if (orgId && (evt.type === "subscription.cancelled" || evt.type === "subscription.expired")) {
    await c.env.DB.prepare(`UPDATE subscriptions SET status = 'canceled', updated_at = ? WHERE organization_id = ?`).bind(Date.now(), orgId).run();
  }

  return c.json({ received: true });
});
