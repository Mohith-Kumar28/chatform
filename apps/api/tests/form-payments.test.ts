import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { readFormDoc } from "@repo/form-schema";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import { buildCsv } from "../src/lib/exports.js";

/**
 * Payments in results: the reconciliation listing and the export columns.
 *
 * Two things are worth pinning. The listing shows the attempts that never
 * became an answer — a duplicate, a failure — because those are the ones a
 * human has to act on, and it shows them without leaking what the gateway sent
 * us (`raw_last_event`) or anyone else's form. And every table-shaped export
 * splits a payment into status, amount, currency and gateway id, with a manual
 * "I've paid" never reading as verified.
 */

let t: Tenant;
let other: Tenant;
let key: string;
const VERSION_ID = "ver_fpay";
const ACCOUNT_ID = "pac_fpay0001";

const DOC = {
  schemaVersion: 9,
  title: "Tickets",
  blocks: [
    { id: "blk_fpemail1", ref: "q_email", type: "email", title: "Email?", required: true },
    {
      id: "blk_fppay001",
      ref: "q_ticket",
      type: "payment",
      title: "Ticket",
      required: true,
      method: "gateway",
      paymentAccountId: ACCOUNT_ID,
      amountMode: "fixed",
      amount: 499,
      currency: "INR",
    },
    {
      id: "blk_fppay002",
      ref: "q_tip",
      type: "payment",
      title: "Tip",
      required: false,
      method: "upi",
      upiId: "acme@okhdfcbank",
      amountMode: "fixed",
      amount: 50,
      currency: "INR",
    },
  ],
  endings: [{ id: "end_fp00001", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  settings: { requireAuth: { enabled: true } },
  theme: {},
};

const now = Date.now();

/** `/v1` needs a plan with API access; the same seeding `v1-exports.test.ts` uses. */
async function subscribe(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  const p = PLANS.business;
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('business', 'business', 'business', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(p.priceMonthlyCents, p.priceYearlyCents, JSON.stringify(p.features), JSON.stringify(p.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'business', ?, 'monthly', 'active', ?, ?, 1, ?, ?)
     ON CONFLICT (dodo_subscription_id) DO UPDATE SET plan_id = excluded.plan_id`,
  )
    .bind(`sub_fp_${orgId}`, orgId, `dodo_fp_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("fpay");
  other = await seedTenant("fpayother");
  await subscribe(t.orgId);
  key = (await seedKey(t, "fpaykey", { scopes: { form: ["read"], response: ["read"] } })).raw;

  const paymentRow = (
    id: string,
    over: Partial<{ submission: string | null; status: string; paymentId: string | null; failure: string | null; created: number; amount: number }>,
  ) =>
    env.DB.prepare(
      `INSERT INTO respondent_payments (id, organization_id, form_id, form_version_id, session_id, submission_id, block_ref,
                                        payment_account_id, provider, environment, provider_order_id, provider_payment_id,
                                        amount_minor, currency, status, failure_reason, settled_to_session, is_test,
                                        raw_last_event, created_at, updated_at, paid_at, expires_at)
       VALUES (?, ?, ?, ?, 'chs_fpay', ?, 'q_ticket', ?, 'razorpay', 'live', ?, ?, ?, 'INR', ?, ?, 0, 0,
               '{"card":"secret-ish"}', ?, ?, NULL, NULL)`,
    ).bind(
      id,
      t.orgId,
      t.formId,
      VERSION_ID,
      over.submission ?? null,
      ACCOUNT_ID,
      `order_${id}`,
      over.paymentId ?? null,
      over.amount ?? 49_900,
      over.status ?? "paid",
      over.failure ?? null,
      over.created ?? now,
      over.created ?? now,
    );

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(VERSION_ID, t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`,
    ).bind(JSON.stringify(DOC), VERSION_ID, t.formId),
    env.DB.prepare(
      `INSERT INTO payment_accounts (id, organization_id, provider, credential_kind, environment, provider_account_id,
                                     display_label, credentials_enc, status, created_at, updated_at)
       VALUES (?, ?, 'razorpay', 'oauth', 'live', 'acc_fpay', 'Acme Events', 'v1:x:y', 'active', ?, ?)`,
    ).bind(ACCOUNT_ID, t.orgId, now, now),
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, source, is_test,
                                started_at, updated_at, completed_at)
       VALUES ('sbm_fpay1', ?, ?, ?, 'chs_fpay', 'completed', 'web', 0, ?, ?, ?)`,
    ).bind(t.formId, VERSION_ID, t.orgId, now - 5000, now, now),
    env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_fpay1', 'sbm_fpay1', ?, 'q_ticket', 'payment', ?, ?)`,
    ).bind(
      t.formId,
      JSON.stringify({
        status: "paid",
        method: "gateway",
        verified: true,
        provider: "razorpay",
        paymentRecordId: "rpay_fp_paid",
        paymentId: "pay_RZP0001",
        amount: 499,
        currency: "INR",
        paidAt: now,
      }),
      now,
    ),
    env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_fpay2', 'sbm_fpay1', ?, 'q_tip', 'payment', ?, ?)`,
    ).bind(
      t.formId,
      // A manual payment with a `paymentId` the browser made up.
      JSON.stringify({ status: "paid", method: "upi", verified: false, reference: "CF-ABCDEF", amount: 50, paymentId: "made_up" }),
      now,
    ),
  ]);

  // Three attempts, oldest to newest: a failure, the payment that settled, and
  // a duplicate from a second tab.
  await env.DB.batch([
    paymentRow("rpay_fp_fail", { status: "failed", failure: "card_declined", created: now - 3000 }),
    paymentRow("rpay_fp_paid", { submission: "sbm_fpay1", paymentId: "pay_RZP0001", created: now - 2000 }),
    paymentRow("rpay_fp_dupe", { submission: "sbm_fpay1", paymentId: "pay_RZP0002", failure: "duplicate", created: now - 1000 }),
  ]);
});

const auth = (tenant = t) => ({ cookie: tenant.cookie });

interface DashboardPayment {
  id: string;
  status: string;
  duplicate: boolean;
  amount: number;
  amountMinor: number;
  currency: string;
  accountLabel: string | null;
  dashboardUrl: string | null;
  submissionId: string | null;
  failureReason: string | null;
}

describe("GET /api/forms/:id/payments", () => {
  it("lists every attempt newest first, duplicates and failures included", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/payments`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json<{ payments: DashboardPayment[]; total: number }>();
    expect(body.total).toBe(3);
    expect(body.payments.map((p) => p.id)).toEqual(["rpay_fp_dupe", "rpay_fp_paid", "rpay_fp_fail"]);

    const [dupe, paid, failed] = body.payments;
    expect(dupe!.duplicate).toBe(true);
    expect(paid!.duplicate).toBe(false);
    expect(paid!).toMatchObject({
      amount: 499,
      amountMinor: 49_900,
      currency: "INR",
      accountLabel: "Acme Events",
      submissionId: "sbm_fpay1",
      dashboardUrl: "https://dashboard.razorpay.com/app/payments/pay_RZP0001",
    });
    expect(failed!.failureReason).toBe("card_declined");
  });

  it("never returns the gateway's raw payload", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/payments`, { headers: auth() });
    expect(await res.text()).not.toContain("secret-ish");
  });

  it("filters by status and by response, and pages by offset", async () => {
    const byStatus = await (
      await fetchApi(`/api/forms/${t.formId}/payments?status=failed`, { headers: auth() })
    ).json<{ payments: DashboardPayment[]; total: number }>();
    expect(byStatus.payments.map((p) => p.id)).toEqual(["rpay_fp_fail"]);

    const bySubmission = await (
      await fetchApi(`/api/forms/${t.formId}/payments?submission=sbm_fpay1`, { headers: auth() })
    ).json<{ payments: DashboardPayment[]; total: number }>();
    expect(bySubmission.total).toBe(2);

    const paged = await (
      await fetchApi(`/api/forms/${t.formId}/payments?limit=1&offset=1`, { headers: auth() })
    ).json<{ payments: DashboardPayment[]; total: number }>();
    expect(paged.payments.map((p) => p.id)).toEqual(["rpay_fp_paid"]);
    expect(paged.total).toBe(3);
  });

  it("does not open another organization's form", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/payments`, { headers: auth(other) });
    expect(res.status).toBe(404);
  });

  it("needs a session", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/payments`);
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/forms/:id/payments", () => {
  it("walks the same attempts with a cursor", async () => {
    const first = await fetchApi(`/v1/forms/${t.formId}/payments?limit=2`, { headers: { "x-api-key": key } });
    expect(first.status).toBe(200);
    const page1 = await first.json<{ data: { id: string; object: string; response_id: string | null }[]; has_more: boolean; next_cursor: string | null }>();
    expect(page1.data.map((p) => p.id)).toEqual(["rpay_fp_dupe", "rpay_fp_paid"]);
    expect(page1.data[0]!.object).toBe("payment");
    expect(page1.data[1]!.response_id).toBe("sbm_fpay1");
    expect(page1.has_more).toBe(true);

    const page2 = await (
      await fetchApi(`/v1/forms/${t.formId}/payments?limit=2&cursor=${page1.next_cursor}`, { headers: { "x-api-key": key } })
    ).json<{ data: { id: string }[]; has_more: boolean }>();
    expect(page2.data.map((p) => p.id)).toEqual(["rpay_fp_fail"]);
    expect(page2.has_more).toBe(false);
  });

  it("refuses a tampered cursor", async () => {
    const res = await fetchApi(`/v1/forms/${t.formId}/payments?cursor=bm90LWEtY3Vyc29y`, { headers: { "x-api-key": key } });
    expect(res.status).toBe(400);
  });

  it("needs response:read", async () => {
    const narrow = (await seedKey(t, "fpaynoread", { scopes: { form: ["read"] } })).raw;
    const res = await fetchApi(`/v1/forms/${t.formId}/payments`, { headers: { "x-api-key": narrow } });
    expect(res.status).toBe(403);
  });

  it("404s a form in another organization, and a form the key is not pinned to", async () => {
    expect((await fetchApi(`/v1/forms/${other.formId}/payments`, { headers: { "x-api-key": key } })).status).toBe(404);
    const pinned = (await seedKey(t, "fpaypinned", { scopes: { response: ["read"] }, formIds: ["frm_elsewhere"] })).raw;
    expect((await fetchApi(`/v1/forms/${t.formId}/payments`, { headers: { "x-api-key": pinned } })).status).toBe(404);
  });
});

/** Parse one RFC 4180 line of fully quoted fields — all this suite's exports write. */
function cells(line: string): string[] {
  return [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]!.replaceAll('""', '"'));
}

describe("payment columns in exports", () => {
  it("splits each payment into status, amount, currency and gateway id on the dashboard CSV", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions/export`, { headers: auth() });
    expect(res.status).toBe(200);
    const [head, row] = (await res.text()).split("\n");
    const header = cells(head!);
    const values = cells(row!);
    const at = (title: string) => values[header.indexOf(title)];

    expect(header.indexOf("Ticket (q_ticket) — Payment status")).toBe(header.indexOf("Ticket (q_ticket)") + 1);
    expect(at("Ticket (q_ticket)")).toBe("Paid ₹499 · verified");
    expect(at("Ticket (q_ticket) — Payment status")).toBe("paid · verified");
    expect(at("Ticket (q_ticket) — Amount")).toBe("499");
    expect(at("Ticket (q_ticket) — Currency")).toBe("INR");
    expect(at("Ticket (q_ticket) — Gateway payment ID")).toBe("pay_RZP0001");

    expect(at("Tip (q_tip) — Payment status")).toBe("paid · unverified");
    // The browser's own `paymentId` is not the gateway's, and is not shown as one.
    expect(at("Tip (q_tip) — Gateway payment ID")).toBe("");
    // Non-payment columns are untouched.
    expect(header).toContain("Email? (q_email)");
    expect(header.filter((h) => h.startsWith("Email? (q_email)"))).toHaveLength(1);
  });

  it("carries the same columns on the /v1 export", async () => {
    const built = await buildCsv(env as never, t.formId, t.orgId, readFormDoc(DOC), {});
    const [head, row] = built.body.split("\n");
    const header = cells(head!);
    const values = cells(row!);
    expect(values[header.indexOf("Ticket (q_ticket) — Payment status")]).toBe("paid · verified");
    expect(values[header.indexOf("Ticket (q_ticket) — Gateway payment ID")]).toBe("pay_RZP0001");
    expect(values[header.indexOf("Tip (q_tip) — Payment status")]).toBe("paid · unverified");
  });
});
