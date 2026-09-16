import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { fromMinorUnits, paymentDashboardUrl, PAYMENT_PROVIDERS, type PaymentProviderName } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";
import { requirePermission, type AuthzVars } from "../lib/authorize.js";

/**
 * `GET /api/forms/:id/payments` — every checkout attempt on a form, for
 * reconciling against the gateway's own dashboard.
 *
 * The results table already shows each response's payment answer, and that is
 * the right place to read "did this person pay". It is the wrong place to
 * reconcile, because the answer only exists for attempts that settled into a
 * response. The records that need a human are exactly the others: a payment
 * that landed after the session was abandoned, a second successful payment
 * from a respondent who had two tabs open (`failure_reason = 'duplicate'`, to
 * be refunded by hand — we never refund on our own), a checkout the gateway
 * says failed while the respondent insists it went through. Those live only in
 * `respondent_payments`, so this reads that table directly.
 *
 * Read with `submission:read`, the permission that already lets someone see
 * what a respondent paid in the results table. Nothing here is more sensitive
 * than that answer: no credentials, no raw gateway payload
 * (`raw_last_event` can carry the payer's card network, contact and address,
 * and stays in D1), and the account is named by its label.
 *
 * Offset paging, like `GET /forms/:id/submissions`, because the builder is the
 * caller and pages are numbered; the `/v1` twin (`v1/form-payments.ts`) walks a
 * keyset cursor instead.
 */

export const formPaymentsRouter = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

formPaymentsRouter.use(
  "/forms/:id/payments",
  requireSession,
  requireOrg,
  requireFormAccess,
  requirePermission("submission", "read"),
);

export const RECORD_STATUSES = ["created", "paid", "failed", "expired", "refunded", "superseded"] as const;

/** A `respondent_payments` row, as read for the listing. */
export interface PaymentRecordRow {
  id: string;
  block_ref: string;
  provider: string;
  environment: string;
  status: string;
  amount_minor: number;
  currency: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  submission_id: string | null;
  session_id: string;
  failure_reason: string | null;
  settled_to_session: number;
  is_test: number;
  payment_account_id: string;
  account_label: string | null;
  created_at: number;
  updated_at: number;
  paid_at: number | null;
  expires_at: number | null;
}

/**
 * The columns both surfaces read, joined to the account's label.
 *
 * `LEFT JOIN` because the listing must not lose a payment whose account row is
 * somehow gone — accounts are disconnected rather than deleted, and the FK has
 * no cascade for exactly that reason, but a reconciliation screen that hides a
 * payment when its account looks odd is the one screen that must not.
 */
export const PAYMENT_RECORD_SELECT = `
  SELECT rp.id, rp.block_ref, rp.provider, rp.environment, rp.status, rp.amount_minor, rp.currency,
         rp.provider_order_id, rp.provider_payment_id, rp.submission_id, rp.session_id, rp.failure_reason,
         rp.settled_to_session, rp.is_test, rp.payment_account_id, pa.display_label AS account_label,
         rp.created_at, rp.updated_at, rp.paid_at, rp.expires_at
    FROM respondent_payments rp
    LEFT JOIN payment_accounts pa ON pa.id = rp.payment_account_id`;

function providerOf(raw: string): PaymentProviderName | null {
  return PAYMENT_PROVIDERS.find((p) => p === raw) ?? null;
}

/** Where the admin opens this record in their own gateway. */
export function recordDashboardUrl(row: PaymentRecordRow): string | null {
  const provider = providerOf(row.provider);
  if (!provider) return null;
  return paymentDashboardUrl(provider, row.provider_payment_id, row.environment === "test" ? "test" : "live");
}

const PaymentRecord = z.object({
  id: z.string(),
  blockRef: z.string(),
  provider: z.string(),
  environment: z.enum(["test", "live"]),
  status: z.enum(RECORD_STATUSES),
  /** A second successful payment on a question already paid. Refund it in the gateway. */
  duplicate: z.boolean(),
  amountMinor: z.number().int(),
  /** Major units, from `amountMinor` and the currency's exponent. */
  amount: z.number(),
  currency: z.string(),
  providerOrderId: z.string().nullable(),
  providerPaymentId: z.string().nullable(),
  dashboardUrl: z.string().nullable(),
  submissionId: z.string().nullable(),
  sessionId: z.string(),
  failureReason: z.string().nullable(),
  /** Whether the response's answer was written from this record. */
  settledToSession: z.boolean(),
  isTest: z.boolean(),
  accountId: z.string(),
  accountLabel: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  paidAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
});

const PaymentList = z.object({
  payments: z.array(PaymentRecord),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

function project(row: PaymentRecordRow): z.infer<typeof PaymentRecord> {
  return {
    id: row.id,
    blockRef: row.block_ref,
    provider: row.provider,
    environment: row.environment === "test" ? "test" : "live",
    status: row.status as (typeof RECORD_STATUSES)[number],
    duplicate: row.failure_reason === "duplicate",
    amountMinor: row.amount_minor,
    amount: fromMinorUnits(row.amount_minor, row.currency),
    currency: row.currency,
    providerOrderId: row.provider_order_id,
    providerPaymentId: row.provider_payment_id,
    dashboardUrl: recordDashboardUrl(row),
    submissionId: row.submission_id,
    sessionId: row.session_id,
    failureReason: row.failure_reason,
    settledToSession: row.settled_to_session === 1,
    isTest: row.is_test === 1,
    accountId: row.payment_account_id,
    accountLabel: row.account_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
  };
}

formPaymentsRouter.get(
  "/forms/:id/payments",
  describeRoute({
    tags: ["dashboard"],
    summary: "List a form's payment attempts, newest first",
    description:
      "Every checkout opened on a verified payment block, including attempts that never became an answer: " +
      "late payments, duplicates and failures. For reconciling against the gateway's own dashboard.",
    responses: {
      200: { description: "A page of payment attempts", content: { "application/json": { schema: resolver(PaymentList) } } },
    },
  }),
  validator(
    "query",
    z.object({
      status: z.enum([...RECORD_STATUSES, "all"]).default("all"),
      /** One response's attempts — what the results dialog shows beside the answer. */
      submission: z.string().max(40).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  ),
  async (c) => {
    const form = c.get("form")!;
    const { status, submission, limit, offset } = c.req.valid("query");

    // Both the form and its organization: the guard has already tied the form
    // to the caller's org, and the second term costs nothing on the index.
    const where = [`rp.form_id = ?`, `rp.organization_id = ?`];
    const binds: unknown[] = [form.id, form.organization_id];
    if (status !== "all") {
      where.push(`rp.status = ?`);
      binds.push(status);
    }
    if (submission) {
      where.push(`rp.submission_id = ?`);
      binds.push(submission);
    }
    const clause = where.join(" AND ");

    const [page, count] = (await c.env.DB.batch([
      c.env.DB
        .prepare(`${PAYMENT_RECORD_SELECT} WHERE ${clause} ORDER BY rp.created_at DESC, rp.id DESC LIMIT ? OFFSET ?`)
        .bind(...binds, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM respondent_payments rp WHERE ${clause}`).bind(...binds),
    ])) as [D1Result<PaymentRecordRow>, D1Result<{ n: number }>];

    return c.json({
      payments: (page.results ?? []).map(project),
      total: count.results?.[0]?.n ?? 0,
      limit,
      offset,
    });
  },
);
