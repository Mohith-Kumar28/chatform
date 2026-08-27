import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import {
  PLANS,
  PLAN_LIST,
  FEATURES,
  LIMITS,
  METRICS,
  isPlanId,
  yearlyPerMonthCents,
  yearlySavingPercent,
  periodResetsAt,
  type PlanId,
} from "@repo/entitlements";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { requirePermission, entitlementsFor, type AuthzVars } from "../lib/authorize.js";
import { permissionsFor, ROLE_LABELS, isRoleName } from "../lib/permissions.js";
import {
  getEntitlements,
  invalidateEntitlements,
  getAllUsage,
  countForms,
  countSeats,
  countWorkspaces,
  storageBytes,
  loadPlanCatalogue,
  verifyCatalogue,
} from "../lib/entitlements.js";
import { audit, markConverted } from "../lib/gate-log.js";
import {
  createCheckoutSession,
  createPortalSession,
  changePlan,
  previewChangePlan,
  DodoError,
} from "../lib/dodo.js";
import { returnOrigin, webOrigins } from "../lib/origins.js";
import {
  verifyWebhook,
  statusForFailure,
  eventTarget,
  toEpochMs,
  type DodoWebhookEvent,
} from "../lib/dodo-webhook.js";

/**
 * Billing — Dodo Payments as merchant of record.
 *
 * Dodo owns the money: subscriptions, invoices, cancellation, payment methods, dunning.
 * We own access: `plans`, `subscriptions` and `entitlement_overrides` decide what an
 * organization may do. The webhook is the only thing that moves information from the
 * first into the second, which is why it is idempotent, replay-bounded and scoped to the
 * exact subscription an event names.
 */

type Vars = Partial<AuthzVars & GuardVars>;

export const billingRouter = new Hono<{ Bindings: Bindings; Variables: Vars }>();

/**
 * The two endpoints that must work without a session — the Dodo webhook (Dodo has no
 * cookie) and the plan catalogue (the pricing page is public).
 *
 * They live on their own router because being unauthenticated is not something a route
 * can declare for itself here. Every mounted `/api` router declares
 * `.use("*", requireSession)`, which `app.route("/api", …)` expands to `/api/*` — so those
 * middlewares match every `/api` request, whichever router actually handles it. The only
 * reliable way out is to be registered before them, which `app.ts` does.
 */
export const billingPublicRouter = new Hono<{ Bindings: Bindings }>();

billingPublicRouter.post("/billing/webhook", handleWebhook);

/** Public: the pricing page needs the catalogue before anyone signs in. */
billingPublicRouter.get(
  "/billing/plans",
  describeRoute({
    tags: ["billing"],
    summary: "Public plan catalogue",
    responses: {
      200: {
        description: "Plans",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                plans: z.array(
                  z.object({
                    id: z.string(),
                    name: z.string(),
                    tagline: z.string(),
                    priceMonthlyCents: z.number(),
                    priceYearlyCents: z.number(),
                    priceYearlyPerMonthCents: z.number(),
                    yearlySavingPercent: z.number(),
                    seatPriceCents: z.number(),
                    currency: z.string(),
                    features: z.array(z.string()),
                    limits: z.record(z.string(), z.number().nullable()),
                    checkoutReady: z.boolean(),
                  }),
                ),
                features: z.record(
                  z.string(),
                  z.object({ label: z.string(), blurb: z.string(), minPlan: z.string(), soon: z.boolean() }),
                ),
                limits: z.record(z.string(), z.object({ label: z.string(), unit: z.string(), mode: z.string() })),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const seeded = await loadPlanCatalogue(c.env);
    const byId = new Map(seeded.map((r) => [r.id, r]));

    return c.json({
      // Prices and features come from the seeded rows, not the in-process catalogue: what
      // the pricing page promises must be what the gates actually enforce.
      plans: PLAN_LIST.map((plan) => {
        const row = byId.get(plan.id);
        return {
          id: plan.id,
          name: row?.name ?? plan.name,
          tagline: plan.tagline,
          priceMonthlyCents: row?.priceMonthlyCents ?? plan.priceMonthlyCents,
          priceYearlyCents: row?.priceYearlyCents ?? plan.priceYearlyCents,
          priceYearlyPerMonthCents: yearlyPerMonthCents(plan),
          yearlySavingPercent: yearlySavingPercent(plan),
          seatPriceCents: row?.seatPriceCents ?? plan.seatPriceCents,
          currency: row?.currency ?? plan.currency,
          features: row?.features ?? [...plan.features],
          limits: row?.limits ?? plan.limits,
          /**
           * Whether this plan can actually be bought right now. The pricing page needs to
           * know: offering a Buy button that 503s is worse than saying "contact us".
           */
          checkoutReady: plan.id === "free" || Boolean(row?.dodoProductMonthlyId),
        };
      }),
      features: Object.fromEntries(
        Object.entries(FEATURES).map(([key, meta]) => [
          key,
          {
            label: meta.label,
            blurb: meta.blurb,
            minPlan: PLAN_LIST.find((p) => (p.features as readonly string[]).includes(key))?.id ?? "business",
            // Priced but not built. The pricing page MUST render this — listing an unbuilt
            // feature as included in a paid plan is a misrepresentation, not a tactic.
            soon: meta.soon === true,
          },
        ]),
      ),
      limits: Object.fromEntries(
        Object.entries(LIMITS).map(([key, meta]) => [key, { label: meta.label, unit: meta.unit, mode: meta.mode }]),
      ),
    });
  },
);

// Everything on this router needs a session and an organization. The two public
// endpoints live on `billingPublicRouter` above.
billingRouter.use("/billing/*", requireSession);
billingRouter.use("/billing/*", requireOrg);

/**
 * The one call the whole UI reads: plan, features, limits, usage, role, permissions.
 *
 * Deliberately a single endpoint rather than four. Every gated control in the app needs
 * all of it, and splitting it means a component can render with the plan loaded but the
 * usage not, which is exactly when a paywall flickers.
 */
billingRouter.get(
  "/billing/entitlements",
  describeRoute({
    tags: ["billing"],
    summary: "Plan, features, limits, usage and permissions for the active organization",
    responses: {
      200: {
        description: "Entitlements",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                planId: z.string(),
                planName: z.string(),
                status: z.string(),
                cycle: z.string().nullable(),
                periodStart: z.number().nullable(),
                periodEnd: z.number().nullable(),
                cancelAtPeriodEnd: z.boolean(),
                inGrace: z.boolean(),
                seats: z.number(),
                features: z.record(z.string(), z.boolean()),
                limits: z.record(z.string(), z.number().nullable()),
                usage: z.record(z.string(), z.number()),
                gauges: z.record(z.string(), z.number()),
                periodResetsAt: z.number(),
                role: z.string(),
                roleLabel: z.string(),
                permissions: z.record(z.string(), z.array(z.string())),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const userId = c.get("userId")!;
    const [ent, usage, roleRow] = await Promise.all([
      getEntitlements(c.env, orgId),
      getAllUsage(c.env, orgId),
      c.env.DB.prepare(`SELECT role FROM members WHERE organization_id = ? AND user_id = ?`)
        .bind(orgId, userId)
        .first<{ role: string }>(),
    ]);

    // Gauges are counted live rather than metered, so they are fetched here rather than
    // read from usage_counters.
    const [forms, seats, workspaces, bytes] = await Promise.all([
      countForms(c.env, orgId),
      countSeats(c.env, orgId),
      countWorkspaces(c.env, orgId),
      storageBytes(c.env, orgId),
    ]);

    const role = roleRow?.role ?? "";
    const primary = role.split(",")[0]?.trim() ?? "";

    return c.json({
      ...ent,
      usage: Object.fromEntries(METRICS.map((m) => [m, usage[m] ?? 0])),
      gauges: {
        forms_count: forms,
        seats,
        workspaces_count: workspaces,
        file_storage_mb: Math.ceil(bytes / (1024 * 1024)),
        file_storage_bytes: bytes,
      },
      periodResetsAt: periodResetsAt(Date.now()),
      role,
      roleLabel: isRoleName(primary) ? ROLE_LABELS[primary].label : primary,
      permissions: permissionsFor(role),
    });
  },
);

/**
 * Backwards-compatible usage payload.
 *
 * `/billing/usage` predates this work and is called from two places in the web app. It
 * keeps working, now with correct numbers, so nothing breaks before the UI is rewritten to
 * use `/billing/entitlements`.
 */
billingRouter.get(
  "/billing/usage",
  describeRoute({
    tags: ["billing"],
    summary: "Current usage vs plan limits",
    responses: {
      200: {
        description: "Usage",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                plan: z.string(),
                planId: z.string(),
                status: z.string(),
                periodEnd: z.number().nullable(),
                limits: z.record(z.string(), z.number().nullable()),
                usage: z.record(z.string(), z.number()),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const [ent, usage] = await Promise.all([getEntitlements(c.env, orgId), getAllUsage(c.env, orgId)]);
    return c.json({
      plan: ent.planName,
      planId: ent.planId,
      status: ent.status,
      periodEnd: ent.periodEnd,
      limits: ent.limits,
      usage: Object.fromEntries(METRICS.map((m) => [m, usage[m] ?? 0])),
    });
  },
);

const CheckoutBody = z.object({
  planId: z.enum(["pro", "business"]),
  cycle: z.enum(["monthly", "yearly"]).default("monthly"),
  discountCode: z.string().max(64).optional(),
});

billingRouter.post(
  "/billing/checkout",
  requirePermission("billing", "manage"),
  validator("json", CheckoutBody),
  describeRoute({
    tags: ["billing"],
    summary: "Start a Dodo checkout for a plan",
    responses: {
      200: { description: "Checkout URL", content: { "application/json": { schema: resolver(z.object({ url: z.string() })) } } },
      409: { description: "Already subscribed — change plan instead" },
      503: { description: "Dodo or the plan is not configured" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const userId = c.get("userId")!;
    const { planId, cycle, discountCode } = c.req.valid("json");

    const ent = await getEntitlements(c.env, orgId);
    if (ent.planId !== "free") {
      // A second checkout would leave the org with two subscriptions and two charges.
      return c.json(
        { error: { code: "already_subscribed", message: `This organization is on ${ent.planName}. Use change-plan instead.` } },
        409,
      );
    }

    const productId = await productIdFor(c.env, planId, cycle);
    if (!productId) {
      return c.json(
        {
          error: {
            code: "plan_not_configured",
            message: `The ${cycle} ${planId} product is not linked to Dodo yet. See GET /api/billing/config-check.`,
          },
        },
        503,
      );
    }

    const [user, customer] = await Promise.all([
      c.env.DB.prepare(`SELECT name, email FROM users WHERE id = ?`).bind(userId).first<{ name: string; email: string }>(),
      c.env.DB.prepare(`SELECT dodo_customer_id FROM dodo_customers WHERE organization_id = ?`)
        .bind(orgId)
        .first<{ dodo_customer_id: string }>(),
    ]);
    const org = await c.env.DB.prepare(`SELECT name FROM organizations WHERE id = ?`).bind(orgId).first<{ name: string }>();

    try {
      const session = await createCheckoutSession(c.env, {
        // Resolved from this request's own origin, so a purchase started in local dev
        // returns to local dev and one started in production returns to production.
        returnTo: returnOrigin(c.env, c.req),
        productId,
        orgId,
        planId,
        cycle,
        userId,
        customerEmail: user?.email ?? "",
        customerName: org?.name ?? user?.name ?? "Customer",
        existingCustomerId: customer?.dodo_customer_id ?? null,
        discountCode,
      });
      if (!session.checkout_url) {
        return c.json({ error: { code: "checkout_failed", message: "Dodo returned no checkout URL" } }, 502);
      }
      await audit(c.env, {
        orgId,
        action: "billing.checkout_started",
        actorType: "user",
        actorId: userId,
        resourceType: "plan",
        resourceId: planId,
        meta: { cycle },
      });
      return c.json({ url: session.checkout_url });
    } catch (err) {
      return dodoFailure(c, err);
    }
  },
);

billingRouter.post(
  "/billing/portal",
  requirePermission("billing", "manage"),
  describeRoute({
    tags: ["billing"],
    summary: "Open the Dodo customer portal",
    responses: {
      200: { description: "Portal link", content: { "application/json": { schema: resolver(z.object({ url: z.string() })) } } },
      404: { description: "No Dodo customer for this organization yet" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const row = await c.env.DB.prepare(`SELECT dodo_customer_id FROM dodo_customers WHERE organization_id = ?`)
      .bind(orgId)
      .first<{ dodo_customer_id: string }>();
    if (!row) {
      return c.json(
        { error: { code: "no_customer", message: "This organization has never been billed, so there is nothing to manage yet." } },
        404,
      );
    }
    try {
      const session = await createPortalSession(c.env, row.dodo_customer_id, returnOrigin(c.env, c.req));
      return c.json({ url: session.link });
    } catch (err) {
      return dodoFailure(c, err);
    }
  },
);

const ChangeBody = z.object({
  planId: z.enum(["free", "pro", "business"]),
  cycle: z.enum(["monthly", "yearly"]).default("monthly"),
});

/** Rank used to decide upgrade vs downgrade, which decides when the change applies. */
const RANK: Record<PlanId, number> = { free: 0, pro: 1, business: 2 };

billingRouter.post(
  "/billing/preview-change",
  requirePermission("billing", "manage"),
  validator("json", ChangeBody),
  describeRoute({
    tags: ["billing"],
    summary: "Quote a plan change before committing to it",
    responses: { 200: { description: "Quote" }, 404: { description: "No subscription to change" } },
  }),
  async (c) => {
    const ctx = await planChangeContext(c);
    if ("response" in ctx) return ctx.response;
    try {
      const preview = await previewChangePlan(c.env, {
        subscriptionId: ctx.subscriptionId,
        productId: ctx.productId,
        direction: ctx.direction,
      });
      return c.json({ direction: ctx.direction, effectiveAt: ctx.direction === "upgrade" ? "immediately" : "next_billing_date", preview });
    } catch (err) {
      return dodoFailure(c, err);
    }
  },
);

billingRouter.post(
  "/billing/change-plan",
  requirePermission("billing", "manage"),
  validator("json", ChangeBody),
  describeRoute({
    tags: ["billing"],
    summary: "Upgrade or downgrade an existing subscription",
    responses: { 200: { description: "Applied or scheduled" }, 404: { description: "No subscription to change" } },
  }),
  async (c) => {
    const ctx = await planChangeContext(c);
    if ("response" in ctx) return ctx.response;
    const orgId = c.get("orgId")!;
    try {
      const result = await changePlan(c.env, {
        subscriptionId: ctx.subscriptionId,
        productId: ctx.productId,
        direction: ctx.direction,
      });

      if (ctx.direction === "downgrade") {
        // Record the intent locally so the UI can say "drops to Free on the 14th"
        // immediately; the authoritative flip still arrives as subscription.updated.
        await c.env.DB.prepare(
          `UPDATE subscriptions SET scheduled_plan_id = ?, scheduled_at = ?, updated_at = ?
            WHERE dodo_subscription_id = ?`,
        )
          .bind(ctx.targetPlanId, ctx.periodEnd, Date.now(), ctx.subscriptionId)
          .run();
      }

      await invalidateEntitlements(c.env, orgId);
      await audit(c.env, {
        orgId,
        action: ctx.direction === "upgrade" ? "billing.upgraded" : "billing.downgrade_scheduled",
        actorType: "user",
        actorId: c.get("userId") ?? null,
        resourceType: "subscription",
        resourceId: ctx.subscriptionId,
        meta: { to: ctx.targetPlanId, cycle: ctx.cycle },
      });

      return c.json({
        ok: true,
        direction: ctx.direction,
        effectiveAt: ctx.direction === "upgrade" ? "immediately" : "next_billing_date",
        // Present when the business requires plan-change payments via a hosted link.
        paymentLink: result.payment_link ?? null,
      });
    } catch (err) {
      return dodoFailure(c, err);
    }
  },
);

billingRouter.get(
  "/billing/invoices",
  requirePermission("billing", "read"),
  describeRoute({
    tags: ["billing"],
    summary: "Payment history",
    responses: { 200: { description: "Payments" } },
  }),
  async (c) => {
    const res = await c.env.DB.prepare(
      `SELECT dodo_payment_id AS id, amount_cents, currency, status, invoice_url, paid_at, created_at
         FROM payments WHERE organization_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(c.get("orgId")!)
      .all();
    return c.json({ invoices: res.results ?? [] });
  },
);

/**
 * Is this environment actually able to take money?
 *
 * Owner-only, and deliberately explicit: the failure it prevents is a Buy button that
 * 503s because nobody linked the Dodo products, which is precisely the state the repo was
 * in before this work.
 */
billingRouter.get(
  "/billing/config-check",
  requirePermission("billing", "manage"),
  describeRoute({
    tags: ["billing"],
    summary: "Report missing billing configuration",
    responses: { 200: { description: "Configuration report" } },
  }),
  async (c) => {
    const problems: string[] = [];
    if (!c.env.DODO_API_KEY) problems.push("DODO_API_KEY is not set — checkout and the portal are unavailable");
    if (!c.env.DODO_WEBHOOK_SECRET) problems.push("DODO_WEBHOOK_SECRET is not set — subscriptions will never activate");
    if (c.env.DODO_ENVIRONMENT !== "live" && c.env.DODO_ENVIRONMENT !== "test") {
      problems.push('DODO_ENVIRONMENT is not set — defaulting to test mode');
    }

    const rows = await loadPlanCatalogue(c.env);
    for (const row of rows) {
      if (row.id === "free") continue;
      if (!row.dodoProductMonthlyId) problems.push(`plan "${row.id}" has no monthly Dodo product id`);
      if (!row.dodoProductYearlyId) problems.push(`plan "${row.id}" has no yearly Dodo product id`);
    }

    const catalogue = await verifyCatalogue(c.env);
    problems.push(...catalogue.problems);

    /**
     * The origins are reported here on purpose.
     *
     * "Is production accidentally using my local URL?" should not require reading config
     * files and reasoning about which ones wrangler uploads. Owner-only, because
     * `webOrigins` is effectively the CORS allowlist.
     */
    if (!c.env.APP_ORIGIN.startsWith("https://")) {
      problems.push(`APP_ORIGIN is "${c.env.APP_ORIGIN}" — not HTTPS, so session cookies cannot be Secure`);
    }

    return c.json({
      ok: problems.length === 0,
      environment: c.env.DODO_ENVIRONMENT === "live" ? "live" : "test",
      // What this deployment actually resolved, not what any config file says.
      appOrigin: c.env.APP_ORIGIN,
      webOrigins: webOrigins(c.env),
      returnsTo: returnOrigin(c.env, c.req),
      problems,
    });
  },
);

// ────────────────────────────────── webhook ──────────────────────────────────

/**
 * Dodo delivery receiver.
 *
 * Order matters and is not negotiable: read the raw body once, verify, dedupe, then act.
 * Verifying after parsing would mean signing a re-serialized body that no longer matches
 * the bytes Dodo signed.
 */
async function handleWebhook(c: { req: { text(): Promise<string>; header(name: string): string | undefined }; env: Bindings; json: (b: unknown, s?: number) => Response; text: (b: string, s?: number) => Response }): Promise<Response> {
  const raw = await c.req.text();

  const verdict = await verifyWebhook(
    c.env.DODO_WEBHOOK_SECRET,
    {
      id: c.req.header("webhook-id"),
      timestamp: c.req.header("webhook-timestamp"),
      signature: c.req.header("webhook-signature"),
    },
    raw,
  );
  if (!verdict.ok) {
    console.warn("dodo_webhook_rejected", verdict.reason);
    return c.text(verdict.reason, statusForFailure(verdict.reason));
  }

  /**
   * Idempotency, and the retry path it must not eat.
   *
   * Dodo retries 8 times over roughly 28 hours, and every retry of one delivery carries the
   * SAME `webhook-id`. Without the insert below, one payment becomes eight subscriptions.
   *
   * But treating every repeat as a duplicate is just as wrong, and worse because it is
   * silent: a handler that failed returns 5xx precisely so Dodo will retry, and if the
   * retry is then dismissed as a duplicate the event stays `failed` forever and the
   * subscription never activates. So a repeat is only a duplicate when the first attempt
   * actually *succeeded*; a repeat of something that failed is the retry doing its job.
   *
   * Found by probing the deployed worker rather than by reading: the first version of this
   * swallowed every retry.
   */
  const inserted = await c.env.DB.prepare(
    `INSERT INTO dodo_events (id, dodo_event_id, type, payload, status, created_at)
     VALUES (?, ?, ?, ?, 'received', ?)
     ON CONFLICT (dodo_event_id) DO NOTHING`,
  )
    .bind(`de_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, verdict.id, safeType(raw), raw, Date.now())
    .run();

  if ((inserted.meta?.changes ?? 0) === 0) {
    const prior = await c.env.DB.prepare(`SELECT status FROM dodo_events WHERE dodo_event_id = ?`)
      .bind(verdict.id)
      .first<{ status: string }>();
    if (prior?.status === "processed") {
      return c.json({ received: true, duplicate: true });
    }
    // A retry of an attempt that did not succeed. Fall through and try again.
    console.log("dodo_webhook_retry", verdict.id, `previous status: ${prior?.status ?? "unknown"}`);
  }

  let evt: DodoWebhookEvent;
  try {
    evt = JSON.parse(raw) as DodoWebhookEvent;
  } catch {
    await markEvent(c.env, verdict.id, "failed", "payload is not valid JSON");
    return c.text("invalid json", 400);
  }

  try {
    const outcome = await dispatch(c.env, evt);
    await markEvent(c.env, verdict.id, "processed", outcome);
    return c.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markEvent(c.env, verdict.id, "failed", message);
    console.error("dodo_webhook_handler_failed", evt.type, message);
    // 5xx so Dodo retries. The event row stays, and its dodo_event_id makes the retry a
    // duplicate — so recovery is: fix the bug, then replay from the Dodo dashboard.
    return c.json({ error: { code: "handler_failed", message: "Event recorded but not processed" } }, 500);
  }
}

function safeType(raw: string): string {
  try {
    return String((JSON.parse(raw) as { type?: unknown }).type ?? "unknown").slice(0, 80);
  } catch {
    return "unparseable";
  }
}

async function markEvent(env: Bindings, id: string, status: string, note?: string): Promise<void> {
  await env.DB.prepare(`UPDATE dodo_events SET status = ?, processed_at = ?, error = ? WHERE dodo_event_id = ?`)
    .bind(status, Date.now(), note?.slice(0, 500) ?? null, id)
    .run();
}

/**
 * Act on one event.
 *
 * Every branch that changes entitlements invalidates the KV cache and writes an audit
 * row. Returning a short string rather than void so `dodo_events.error` doubles as a
 * "what did we do about it" log for events we deliberately ignore.
 */
export async function dispatch(env: Bindings, evt: DodoWebhookEvent): Promise<string> {
  const target = eventTarget(evt);
  const subscriptionId = evt.data?.subscription_id;

  // Without metadata we cannot attribute the event, and guessing is how a Business
  // payment silently provisions Pro. Record and stop.
  if (!target) return "ignored: no organizationId in metadata";

  const { orgId } = target;
  const customerId = evt.data?.customer?.customer_id ?? null;
  if (customerId) await upsertCustomer(env, orgId, customerId, evt.data?.customer?.email ?? null);

  switch (evt.type) {
    case "subscription.active":
    case "subscription.renewed": {
      if (!subscriptionId) return "ignored: no subscription_id";
      const planId = resolvePlanId(target.planId);
      await upsertSubscription(env, {
        orgId,
        subscriptionId,
        planId,
        cycle: target.cycle ?? "monthly",
        status: evt.data?.trial_period_days && evt.type === "subscription.active" ? "trialing" : "active",
        productId: evt.data?.product_id ?? null,
        customerId,
        periodStart: toEpochMs(evt.data?.previous_billing_date),
        periodEnd: toEpochMs(evt.data?.next_billing_date),
        cancelAtPeriodEnd: Boolean(evt.data?.cancel_at_next_billing_date),
        seats: evt.data?.quantity ?? 1,
        // A successful renewal clears any grace window a prior failure opened.
        graceUntil: null,
      });
      await invalidateEntitlements(env, orgId);
      if (evt.type === "subscription.active") await markConverted(env, orgId);
      await audit(env, {
        orgId,
        action: evt.type === "subscription.active" ? "subscription.activated" : "subscription.renewed",
        actorType: "webhook",
        resourceType: "subscription",
        resourceId: subscriptionId,
        meta: { planId, cycle: target.cycle },
      });
      return `${evt.type} → ${planId}`;
    }

    case "subscription.plan_changed":
    case "subscription.paused":
    case "subscription.unpaused":
    case "subscription.updated": {
      if (!subscriptionId) return "ignored: no subscription_id";
      /**
       * Reconcile from the payload rather than from our own assumptions: these events fire
       * on ANY field change, including ones we did not initiate — a plan change applying at
       * a period boundary, a pause from the customer portal, a seat quantity edit.
       *
       * `subscription.plan_changed` is the one that matters most: it is what fires when a
       * scheduled downgrade actually applies, hours or weeks after we requested it. Its
       * metadata is the metadata of the *original* checkout, so the plan is resolved from
       * `product_id` against the `plans` table instead — trusting the stale metadata would
       * silently keep the customer on the tier they just left.
       */
      const status = mapStatus(evt.data?.status);
      const fromProduct = evt.data?.product_id ? await planForProduct(env, evt.data.product_id) : null;
      await env.DB.prepare(
        `UPDATE subscriptions
            SET status = COALESCE(?, status),
                current_period_start = COALESCE(?, current_period_start),
                current_period_end = COALESCE(?, current_period_end),
                cancel_at_period_end = ?,
                seats = COALESCE(?, seats),
                plan_id = COALESCE(?, plan_id),
                updated_at = ?
          WHERE dodo_subscription_id = ?`,
      )
        .bind(
          status,
          toEpochMs(evt.data?.previous_billing_date),
          toEpochMs(evt.data?.next_billing_date),
          evt.data?.cancel_at_next_billing_date ? 1 : 0,
          evt.data?.quantity ?? null,
          fromProduct ?? (target.planId && isPlanId(target.planId) ? target.planId : null),
          Date.now(),
          subscriptionId,
        )
        .run();
      await invalidateEntitlements(env, orgId);
      return `updated → ${status ?? "unchanged"}`;
    }

    case "subscription.on_hold":
    case "subscription.failed": {
      if (!subscriptionId) return "ignored: no subscription_id";
      // Open the grace window rather than revoking. Dodo's dunning is retrying the card;
      // taking a paying customer's analytics away over a temporary decline is how churn
      // gets manufactured. `resolve()` honours paid entitlements until grace_until.
      const graceUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await env.DB.prepare(
        `UPDATE subscriptions SET status = 'on_hold', grace_until = ?, updated_at = ?
          WHERE dodo_subscription_id = ? AND organization_id = ?`,
      )
        .bind(graceUntil, Date.now(), subscriptionId, orgId)
        .run();
      await invalidateEntitlements(env, orgId);
      await audit(env, {
        orgId,
        action: "subscription.on_hold",
        actorType: "webhook",
        resourceType: "subscription",
        resourceId: subscriptionId,
        meta: { graceUntil, reason: evt.type },
      });
      return `on_hold, grace until ${new Date(graceUntil).toISOString()}`;
    }

    case "subscription.cancelled":
    case "subscription.expired": {
      if (!subscriptionId) return "ignored: no subscription_id";
      // Scoped to the subscription the event names. The old handler ran
      // `WHERE organization_id = ?`, cancelling every subscription the org had — so one
      // cancelled add-on took the whole account down with it.
      await env.DB.prepare(
        `UPDATE subscriptions SET status = ?, updated_at = ?
          WHERE dodo_subscription_id = ? AND organization_id = ?`,
      )
        .bind(evt.type === "subscription.expired" ? "expired" : "canceled", Date.now(), subscriptionId, orgId)
        .run();
      await invalidateEntitlements(env, orgId);
      await audit(env, {
        orgId,
        action: evt.type,
        actorType: "webhook",
        resourceType: "subscription",
        resourceId: subscriptionId,
      });
      // Entitlements are NOT dropped here: `resolve()` honours the period the customer
      // already paid for, and nothing about their data changes either way.
      return evt.type;
    }

    case "payment.succeeded": {
      const paymentId = evt.data?.payment_id;
      if (!paymentId) return "ignored: no payment_id";
      await env.DB.prepare(
        `INSERT INTO payments (id, organization_id, subscription_id, dodo_payment_id, amount_cents, currency, status, invoice_url, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?)
         ON CONFLICT (dodo_payment_id) DO UPDATE SET status = 'succeeded', paid_at = excluded.paid_at`,
      )
        .bind(
          `pay_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
          orgId,
          subscriptionId ?? null,
          paymentId,
          evt.data?.total_amount ?? evt.data?.settlement_amount ?? 0,
          evt.data?.currency ?? "USD",
          (evt.data?.payment_link as string | null) ?? null,
          Date.now(),
          Date.now(),
        )
        .run();
      return "payment recorded";
    }

    case "payment.failed": {
      const paymentId = evt.data?.payment_id;
      if (!paymentId) return "ignored: no payment_id";
      await env.DB.prepare(
        `INSERT INTO payments (id, organization_id, subscription_id, dodo_payment_id, amount_cents, currency, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)
         ON CONFLICT (dodo_payment_id) DO UPDATE SET status = 'failed'`,
      )
        .bind(
          `pay_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
          orgId,
          subscriptionId ?? null,
          paymentId,
          evt.data?.total_amount ?? 0,
          evt.data?.currency ?? "USD",
          Date.now(),
        )
        .run();
      await audit(env, { orgId, action: "payment.failed", actorType: "webhook", resourceType: "payment", resourceId: paymentId });
      return "payment failure recorded";
    }

    case "refund.succeeded": {
      await audit(env, { orgId, action: "refund.succeeded", actorType: "webhook", meta: { paymentId: evt.data?.payment_id } });
      await invalidateEntitlements(env, orgId);
      return "refund recorded";
    }

    default:
      return `ignored: ${evt.type} needs no action`;
  }
}

/** Dodo statuses we do not model map to null, i.e. "leave the column alone". */
function mapStatus(status: string | undefined): string | null {
  switch (status) {
    case "active":
    case "trialing":
    case "on_hold":
      return status;
    case "cancelled":
      return "canceled";
    // A paused subscription is not cancelled and not entitled: `resolve()` treats it the
    // same as on_hold, so a customer who pauses keeps access until their paid period ends.
    case "paused":
      return "on_hold";
    case "expired":
    case "failed":
      return "expired";
    default:
      return null;
  }
}

/**
 * Which plan a Dodo product id belongs to.
 *
 * The authoritative answer for a plan change, because the event's metadata still describes
 * the checkout that created the subscription rather than the tier it is on now.
 */
async function planForProduct(env: Bindings, productId: string): Promise<PlanId | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM plans
      WHERE dodo_product_monthly_id = ?1 OR dodo_product_yearly_id = ?1
      LIMIT 1`,
  )
    .bind(productId)
    .first<{ id: string }>();
  return row && isPlanId(row.id) ? (row.id as PlanId) : null;
}

/** An unrecognised plan id from metadata falls back to free, never to a paid plan. */
function resolvePlanId(value: string | null): PlanId {
  return value && isPlanId(value) ? (value as PlanId) : "free";
}

async function upsertCustomer(env: Bindings, orgId: string, customerId: string, email: string | null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO dodo_customers (id, organization_id, dodo_customer_id, billing_email, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (organization_id) DO UPDATE SET dodo_customer_id = excluded.dodo_customer_id,
                                                billing_email = COALESCE(excluded.billing_email, dodo_customers.billing_email)`,
  )
    .bind(`dc_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, orgId, customerId, email, Date.now())
    .run();
}

interface UpsertArgs {
  orgId: string;
  subscriptionId: string;
  planId: PlanId;
  cycle: "monthly" | "yearly";
  status: string;
  productId: string | null;
  customerId: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
  graceUntil: number | null;
}

async function upsertSubscription(env: Bindings, a: UpsertArgs): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, dodo_product_id, dodo_customer_id,
                               cycle, status, current_period_start, current_period_end, cancel_at_period_end,
                               grace_until, scheduled_plan_id, scheduled_at, seats, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, NULL, ?13, ?14, ?14)
     ON CONFLICT (dodo_subscription_id) DO UPDATE SET
       plan_id = excluded.plan_id,
       dodo_product_id = COALESCE(excluded.dodo_product_id, subscriptions.dodo_product_id),
       dodo_customer_id = COALESCE(excluded.dodo_customer_id, subscriptions.dodo_customer_id),
       cycle = excluded.cycle,
       status = excluded.status,
       current_period_start = COALESCE(excluded.current_period_start, subscriptions.current_period_start),
       current_period_end = COALESCE(excluded.current_period_end, subscriptions.current_period_end),
       cancel_at_period_end = excluded.cancel_at_period_end,
       grace_until = excluded.grace_until,
       scheduled_plan_id = NULL,
       scheduled_at = NULL,
       seats = excluded.seats,
       updated_at = excluded.updated_at`,
  )
    .bind(
      `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`,
      a.orgId,
      a.planId,
      a.subscriptionId,
      a.productId,
      a.customerId,
      a.cycle,
      a.status,
      a.periodStart,
      a.periodEnd,
      a.cancelAtPeriodEnd ? 1 : 0,
      a.graceUntil,
      a.seats,
      Date.now(),
    )
    .run();
}

// ────────────────────────────────── helpers ──────────────────────────────────

async function productIdFor(env: Bindings, planId: PlanId, cycle: "monthly" | "yearly"): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT dodo_product_monthly_id, dodo_product_yearly_id FROM plans WHERE id = ?`,
  )
    .bind(planId)
    .first<{ dodo_product_monthly_id: string | null; dodo_product_yearly_id: string | null }>();
  return (cycle === "yearly" ? row?.dodo_product_yearly_id : row?.dodo_product_monthly_id) ?? null;
}

type ChangeCtx =
  | { response: Response }
  | {
      subscriptionId: string;
      productId: string;
      direction: "upgrade" | "downgrade";
      targetPlanId: PlanId;
      cycle: "monthly" | "yearly";
      periodEnd: number | null;
    };

/**
 * Everything both change-plan routes need, resolved once.
 *
 * Downgrading to Free is not a plan change in Dodo's model — there is no free product to
 * move to — so it is refused here with a pointer at the portal, which is where
 * cancellation belongs.
 */
async function planChangeContext(c: {
  env: Bindings;
  get: (k: string) => unknown;
  req: { valid: (t: "json") => { planId: PlanId; cycle: "monthly" | "yearly" } };
  json: (b: unknown, s?: number) => Response;
}): Promise<ChangeCtx> {
  const orgId = c.get("orgId") as string;
  const { planId, cycle } = c.req.valid("json");

  const sub = await c.env.DB.prepare(
    `SELECT dodo_subscription_id, plan_id, current_period_end FROM subscriptions
      WHERE organization_id = ? AND status IN ('active','trialing','on_hold')
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(orgId)
    .first<{ dodo_subscription_id: string; plan_id: string; current_period_end: number | null }>();

  if (!sub) {
    return {
      response: c.json(
        { error: { code: "no_subscription", message: "There is no subscription to change. Start one with checkout." } },
        404,
      ),
    };
  }

  if (planId === "free") {
    return {
      response: c.json(
        {
          error: {
            code: "use_portal",
            message: "Moving to Free means cancelling. Use the billing portal so the cancellation is recorded by Dodo.",
          },
        },
        409,
      ),
    };
  }

  const current = isPlanId(sub.plan_id) ? (sub.plan_id as PlanId) : "free";
  if (current === planId) {
    return { response: c.json({ error: { code: "same_plan", message: `Already on ${PLANS[planId].name}.` } }, 409) };
  }

  const productId = await productIdFor(c.env, planId, cycle);
  if (!productId) {
    return {
      response: c.json(
        { error: { code: "plan_not_configured", message: `The ${cycle} ${planId} product is not linked to Dodo yet.` } },
        503,
      ),
    };
  }

  return {
    subscriptionId: sub.dodo_subscription_id,
    productId,
    direction: RANK[planId] > RANK[current] ? "upgrade" : "downgrade",
    targetPlanId: planId,
    cycle,
    periodEnd: sub.current_period_end,
  };
}

/** One place that turns a Dodo failure into a response, so the mapping stays consistent. */
function dodoFailure(c: { json: (b: unknown, s?: number) => Response }, err: unknown): Response {
  if (err instanceof DodoError) {
    if (err.status === 503) {
      return c.json({ error: { code: "billing_not_configured", message: "Billing is not configured on this environment." } }, 503);
    }
    if (err.status === 422) {
      return c.json({ error: { code: "dodo_rejected", message: "Dodo rejected the request. Check the plan configuration." } }, 422);
    }
    if (err.status === 409) {
      return c.json({ error: { code: "dodo_conflict", message: "A previous plan change is still pending payment." } }, 409);
    }
  }
  console.error("billing_upstream_error", err);
  return c.json({ error: { code: "upstream_error", message: "The payment provider is unavailable. Try again shortly." } }, 502);
}

/**
 * Legacy exports.
 *
 * `enforceLimit` / `incrementUsage` / `getPlanLimits` / `FREE_LIMITS` used to live here and
 * were imported by nothing. They are gone; `lib/entitlements.ts` and `lib/authorize.ts`
 * replace them, and the features/limits split means nothing can ever again answer
 * "Monthly remove branding limit reached (0)".
 */
export { getEntitlements, invalidateEntitlements } from "../lib/entitlements.js";
export { entitlementsFor } from "../lib/authorize.js";
