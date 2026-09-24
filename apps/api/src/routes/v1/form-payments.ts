import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "../../lib/validator.js";
import { z } from "zod";
import { fromMinorUnits } from "@repo/form-schema";
import type { Bindings } from "../../env.js";
import { ErrorEnvelope } from "../../lib/openapi.js";
import { keyOwnsForm, loadFormForOrg, type FormRow, type GuardVars } from "../../lib/guards.js";
import { requireScope, type AuthzVars } from "../../lib/authorize.js";
import { decodeCursor, paginate } from "../../lib/cursor.js";
import {
  PAYMENT_RECORD_SELECT,
  RECORD_STATUSES,
  recordDashboardUrl,
  type PaymentRecordRow,
} from "../form-payments.js";

/**
 * `GET /v1/forms/:id/payments` — the developer-API twin of
 * `routes/form-payments.ts`: every checkout attempt on a form, for reconciling
 * against the gateway.
 *
 * `response:read`, because a payment record is part of a response — the same
 * key that can read the answer "Paid ₹499 · verified" can read the record
 * behind it, and nothing here is more than that. No credentials and no raw
 * gateway payload leave D1.
 *
 * A keyset cursor rather than the dashboard's offset, for the reason
 * `GET /v1/forms/:id/responses` has one: a caller walking the list while new
 * payments arrive must neither skip nor repeat a row.
 */

export const formPaymentsV1Router = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

/** As in `v1/integrations.ts`: the key's organization, and its form pinning honoured. */
async function formForKey(c: {
  env: Bindings;
  get: (k: "orgId" | "keyMeta") => unknown;
  req: { param: (k: string) => string | undefined };
}): Promise<FormRow | null> {
  const orgId = c.get("orgId") as string | undefined;
  const formId = c.req.param("id");
  if (!orgId || !formId) return null;
  if (!keyOwnsForm(c as never, formId)) return null;
  return loadFormForOrg(c.env, formId, orgId);
}

const notFound = { error: { code: "not_found", message: "Form not found" } } as const;

const V1Payment = z.object({
  id: z.string(),
  object: z.literal("payment"),
  form_id: z.string(),
  /** The payment question's ref. */
  block_ref: z.string(),
  /** The response this attempt belongs to, once one exists. */
  response_id: z.string().nullable(),
  provider: z.string(),
  /** The gateway account's mode: `test` for sandbox keys, `live` for real money. */
  environment: z.enum(["test", "live"]),
  /** Whether the response itself is a test response, as on `GET /v1/forms/{id}/responses`. */
  mode: z.enum(["test", "live"]),
  status: z.enum(RECORD_STATUSES),
  /** A second successful payment on a question already paid. Refund it in the gateway. */
  duplicate: z.boolean(),
  amount_minor: z.number().int(),
  amount: z.number(),
  currency: z.string(),
  provider_order_id: z.string().nullable(),
  provider_payment_id: z.string().nullable(),
  dashboard_url: z.string().nullable(),
  failure_reason: z.string().nullable(),
  settled_to_response: z.boolean(),
  payment_account_id: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  paid_at: z.number().nullable(),
  expires_at: z.number().nullable(),
});

const V1PaymentList = z.object({
  data: z.array(V1Payment),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});

function project(row: PaymentRecordRow, formId: string): z.infer<typeof V1Payment> {
  return {
    id: row.id,
    object: "payment",
    form_id: formId,
    block_ref: row.block_ref,
    response_id: row.submission_id,
    provider: row.provider,
    environment: row.environment === "test" ? "test" : "live",
    mode: row.is_test === 1 ? "test" : "live",
    status: row.status as (typeof RECORD_STATUSES)[number],
    duplicate: row.failure_reason === "duplicate",
    amount_minor: row.amount_minor,
    amount: fromMinorUnits(row.amount_minor, row.currency),
    currency: row.currency,
    provider_order_id: row.provider_order_id,
    provider_payment_id: row.provider_payment_id,
    dashboard_url: recordDashboardUrl(row),
    failure_reason: row.failure_reason,
    settled_to_response: row.settled_to_session === 1,
    payment_account_id: row.payment_account_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    paid_at: row.paid_at,
    expires_at: row.expires_at,
  };
}

formPaymentsV1Router.get(
  "/forms/:id/payments",
  requireScope("response", "read"),
  validator(
    "query",
    z.object({
      status: z.enum([...RECORD_STATUSES, "all"]).default("all"),
      /** One response's attempts. */
      response_id: z.string().max(40).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      cursor: z.string().optional(),
    }),
  ),
  describeRoute({
    tags: ["v1"],
    summary: "List a form's payment attempts, newest first",
    description:
      "Every checkout opened on a verified payment block, including the ones that never became an answer — a " +
      "payment that arrived after the respondent left, a duplicate from a second tab, a failure. `status` defaults " +
      "to `all`. Amounts are given both in minor units (`amount_minor`, what the gateway charged) and major units. " +
      "Pass `next_cursor` back as `cursor` for the next page.",
    responses: {
      200: { description: "A page of payment attempts", content: { "application/json": { schema: resolver(V1PaymentList) } } },
      400: { description: "Malformed cursor", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = await formForKey(c as never);
    if (!form) return c.json(notFound, 404);
    const q = c.req.valid("query");

    const where = [`rp.form_id = ?`, `rp.organization_id = ?`];
    const binds: unknown[] = [form.id, form.organization_id];
    if (q.status !== "all") {
      where.push(`rp.status = ?`);
      binds.push(q.status);
    }
    if (q.response_id) {
      where.push(`rp.submission_id = ?`);
      binds.push(q.response_id);
    }
    if (q.cursor) {
      const cursor = decodeCursor(c.env, q.cursor);
      if (!cursor || cursor.order !== "created") {
        return c.json({ error: { code: "invalid_cursor", message: "That cursor is not valid for this query" } }, 400);
      }
      // Keyset, with the id as a stable tiebreaker for rows sharing a timestamp.
      where.push(`(rp.created_at < ? OR (rp.created_at = ? AND rp.id < ?))`);
      binds.push(cursor.sort, cursor.sort, cursor.id);
    }

    const rows = await c.env.DB.prepare(
      `${PAYMENT_RECORD_SELECT} WHERE ${where.join(" AND ")} ORDER BY rp.created_at DESC, rp.id DESC LIMIT ?`,
    )
      .bind(...binds, q.limit + 1)
      .all<PaymentRecordRow>();

    const page = paginate(c.env, rows.results ?? [], q.limit, "created", (r) => r.created_at);
    return c.json({
      data: page.data.map((row) => project(row, form.id)),
      has_more: page.has_more,
      next_cursor: page.next_cursor,
    });
  },
);
