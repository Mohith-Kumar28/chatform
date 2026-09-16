import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import type { SessionDO } from "../src/do/session-do.js";

/**
 * A payment question that only moves on when the admin's own gateway says so.
 *
 * The gateway is faked at the one seam the payment flow calls through —
 * `withAdapter` — so what is exercised is everything above it: the session's
 * guards, the D1 record and its state machine, the dedupe of webhook
 * deliveries, the routing of a paid record into a live conversation or onto an
 * abandoned response, and the validator that refuses every answer the browser
 * sends. The adapters themselves, and the signature schemes, are tested
 * against their own fixtures elsewhere; here a delivery is "signed" by a
 * header the mocked verifier checks.
 *
 * The gateway flag is mocked on, so the suite does not depend on an env var
 * the Miniflare bindings do not set.
 */

const gw = vi.hoisted(() => ({
  flagOn: true,
  creates: 0,
  fetches: 0,
  failCreate: false,
  lastCustomer: null as null | { phone?: string | null },
  orders: new Map<
    string,
    {
      recordId: string;
      amountMinor: number;
      currency: string;
      status: string;
      paymentId?: string;
      reportMinor?: number;
      /** A refund the gateway has taken in and not finished. Still `paid`; see `refundPending`. */
      refundPending?: boolean;
    }
  >(),
  /** Runs inside `createCheckout`, so a test can move the world while a start is waiting on it. */
  onCreate: null as null | (() => Promise<void>),
  /** The same, inside `fetchStatus`. */
  onFetch: null as null | (() => Promise<void>),
}));

vi.mock("../src/lib/payments/flag.js", () => ({ gatewayEnabled: () => gw.flagOn }));

vi.mock("../src/lib/payments/accounts.js", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  const { ProviderError } = await import("../src/lib/payments/types.js");
  const adapter = (account: { provider: string }) => ({
    provider: account.provider,
    async createCheckout(req: { recordId: string; amountMinor: number; currency: string; customer: { phone?: string | null } }) {
      // As the real Cashfree adapter does: no number, no order.
      if (account.provider === "cashfree" && !req.customer.phone) throw new ProviderError("bad_request", "phone_required");
      gw.creates += 1;
      gw.lastCustomer = req.customer;
      if (gw.failCreate) throw new ProviderError("upstream", "gateway down", 503);
      const orderId = `ord_${req.recordId}`;
      gw.orders.set(orderId, {
        recordId: req.recordId,
        amountMinor: req.amountMinor,
        currency: req.currency,
        status: "created",
      });
      // The gateway takes its time, and the conversation carries on around it.
      if (gw.onCreate) await gw.onCreate();
      return { providerOrderId: orderId, launch: { kind: "redirect", url: `https://checkout.example/${orderId}`, sessionId: orderId } };
    },
    async fetchStatus(orderId: string) {
      gw.fetches += 1;
      if (gw.onFetch) await gw.onFetch();
      const o = gw.orders.get(orderId);
      if (!o) throw new ProviderError("not_found", "no such order", 404);
      return {
        status: o.status,
        providerPaymentId: o.paymentId ?? null,
        amountMinor: o.reportMinor ?? o.amountMinor,
        currency: o.currency,
        paidAt: o.status === "paid" ? Date.now() : null,
        ...(o.refundPending ? { refundPending: true } : {}),
      };
    },
    async describeAccount() {
      throw new Error("unused");
    },
  });
  const Unavailable = real.AccountUnavailableError as new (status: string) => Error;
  return {
    ...real,
    withAdapter: async (_env: unknown, account: { provider: string; status?: string }, fn: (a: unknown, acc: unknown) => unknown) => {
      // As the real one does: a disconnected row has had its credentials wiped, so there is
      // nothing to call the gateway with. What the caller does about it is the thing under test.
      if (account.status === "disconnected") throw new Unavailable("disconnected");
      return fn(adapter(account), account);
    },
  };
});

vi.mock("../src/lib/payments/webhook-sig.js", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  const verify = async (headers: Headers, raw: string) =>
    headers.get("x-test-signature") === "valid"
      ? { ok: true, events: (JSON.parse(raw) as { events: unknown[] }).events }
      : { ok: false, reason: "signature_mismatch", status: 401 };
  return {
    ...real,
    verifyCashfreeWebhook: (_env: unknown, headers: Headers, raw: string) => verify(headers, raw),
    verifyRazorpayWebhook: (_env: unknown, headers: Headers, raw: string) => verify(headers, raw),
    verifyStripeWebhook: (_secret: unknown, headers: Headers, raw: string) => verify(headers, raw),
  };
});

// ───────────────────────────── fixtures ─────────────────────────────

let t: Tenant;
let free: Tenant;

const ACCOUNT = "pac_gwrazorpay01";
const LIVE_ACCOUNT = "pac_gwstripelive1";
const FREE_ACCOUNT = "pac_gwfreeacct01";
const CASHFREE_ACCOUNT = "pac_gwcashfree01";
const MERCHANT = "acc_merchant_one";

function paymentDoc(opts: {
  account?: string;
  requireAuth?: boolean;
  amount?: Record<string, unknown>;
  variables?: unknown[];
  /** A question between the name and the payment, whose answer the rules price from. */
  priced?: { ref: string; title: string };
  logic?: unknown[];
} = {}) {
  return {
    schemaVersion: 9,
    title: "Registration",
    blocks: [
      { id: "blk_gwname001", ref: "q_name", type: "short_text", title: "Team name?", required: true },
      ...(opts.priced
        ? [{ id: "blk_gwprice01", ref: opts.priced.ref, type: "short_text", title: opts.priced.title, required: true }]
        : []),
      {
        id: "blk_gwpay0001",
        ref: "q_pay",
        type: "payment",
        title: "Registration fee",
        required: true,
        method: "gateway",
        paymentAccountId: opts.account ?? ACCOUNT,
        currency: "INR",
        ...(opts.amount ?? { amountMode: "fixed", amount: 499 }),
      },
      { id: "blk_gwafter01", ref: "q_after", type: "short_text", title: "Anything else?", required: false },
    ],
    endings: [{ id: "end_gw00001", ref: "end_thanks", title: "All done!", bodyMd: "Thanks." }],
    logic: opts.logic ?? [],
    endingRules: [],
    variables: opts.variables ?? [],
    hiddenFields: [],
    layout: {},
    settings: {
      agent: { mode: "template" },
      onComplete: { requireSubmit: false },
      ...(opts.requireAuth === false ? {} : { requireAuth: { enabled: true, method: "google", afterBlocks: 0 } }),
    },
    theme: {},
  };
}

async function subscribe(orgId: string, plan: "pro" | "business"): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  const p = PLANS[plan];
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES (?1, ?1, ?2, ?3, ?4, 'USD', ?5, ?6, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(plan, p.name, p.priceMonthlyCents, p.priceYearlyCents, JSON.stringify(p.features), JSON.stringify(p.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'monthly', 'active', ?5, ?6, 1, ?7, ?7)`,
  )
    .bind(`sub_gw_${orgId}`, orgId, plan, `dodo_gw_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

async function insertAccount(
  id: string,
  orgId: string,
  over: { provider?: string; environment?: string; providerAccountId?: string } = {},
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO payment_accounts (id, organization_id, provider, credential_kind, environment, provider_account_id,
                                   display_label, credentials_enc, status, currencies_json, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'oauth', ?4, ?5, 'Test account', 'sealed', 'active', '["INR"]', ?6, ?6)`,
  )
    .bind(id, orgId, over.provider ?? "razorpay", over.environment ?? "test", over.providerAccountId ?? `${MERCHANT}_${id}`, now)
    .run();
}

/** A published form of its own, so each scenario gets the document it needs. */
async function publishForm(tenant: Tenant, label: string, doc: unknown): Promise<{ formId: string; slug: string }> {
  const formId = `frm_${label}`;
  const slug = `${label}-form`;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7, 'salt', ?8, ?8)`,
    ).bind(formId, tenant.orgId, tenant.workspaceId, tenant.userId, label, slug, JSON.stringify(doc), now),
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(`ver_${label}`, formId, JSON.stringify(doc), now, tenant.userId),
    env.DB.prepare(`UPDATE forms SET status = 'published', active_version_id = ?1 WHERE id = ?2`).bind(`ver_${label}`, formId),
  ]);
  return { formId, slug };
}

let main: { formId: string; slug: string };
let open: { formId: string; slug: string };
let variable: { formId: string; slug: string };
let freeForm: { formId: string; slug: string };
let cashfreeForm: { formId: string; slug: string };
let liveForm: { formId: string; slug: string };
let tiered: { formId: string; slug: string };
let scored: { formId: string; slug: string };

/** `set_variable` when a short-text answer is exactly `value`. */
const setWhen = (id: string, ref: string, value: string, variable: string, to: number) => ({
  id,
  action_kind: "set_variable",
  when: { op: "and", conditions: [{ left: { kind: "ref", ref }, op: "eq", value }], groups: [] },
  variable,
  expr: to,
});

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("gwpay");
  free = await seedTenant("gwfree");
  await subscribe(t.orgId, "pro");
  await insertAccount(ACCOUNT, t.orgId, { providerAccountId: MERCHANT });
  await insertAccount(LIVE_ACCOUNT, t.orgId, { provider: "stripe", environment: "live" });
  await insertAccount(FREE_ACCOUNT, free.orgId);

  main = await publishForm(t, "gwmain", paymentDoc());
  open = await publishForm(t, "gwopen", paymentDoc({ requireAuth: false }));
  variable = await publishForm(
    t,
    "gwvar",
    paymentDoc({
      amount: { amountMode: "variable", amountVariable: "total", minAmount: 1, maxAmount: 5000 },
      variables: [{ name: "total", type: "number", initial: 250 }],
    }),
  );
  freeForm = await publishForm(free, "gwfreeform", paymentDoc({ account: FREE_ACCOUNT }));
  await insertAccount(CASHFREE_ACCOUNT, t.orgId, { provider: "cashfree", providerAccountId: "cfm_gw_merchant" });
  cashfreeForm = await publishForm(t, "gwcashfree", paymentDoc({ account: CASHFREE_ACCOUNT }));
  liveForm = await publishForm(t, "gwlive", paymentDoc({ account: LIVE_ACCOUNT }));
  // The price comes from an answer: 1 ticket ₹250, 4 tickets ₹1000, 36 tickets past the form's ₹5000 limit.
  tiered = await publishForm(
    t,
    "gwtiered",
    paymentDoc({
      priced: { ref: "q_tickets", title: "How many tickets?" },
      amount: { amountMode: "variable", amountVariable: "total", minAmount: 1, maxAmount: 5000 },
      variables: [{ name: "total", type: "number", initial: 0 }],
      logic: [
        setWhen("rul_gwtier001", "q_tickets", "1", "total", 250),
        setWhen("rul_gwtier004", "q_tickets", "4", "total", 1000),
        setWhen("rul_gwtier036", "q_tickets", "36", "total", 9000),
      ],
    }),
  );
  // An `add_score` the engine re-applies on every answer after the one that met it.
  scored = await publishForm(
    t,
    "gwscored",
    paymentDoc({
      priced: { ref: "q_workshop", title: "Add the workshop?" },
      amount: { amountMode: "variable", amountVariable: "total", minAmount: 1, maxAmount: 5000 },
      variables: [{ name: "total", type: "number", initial: 1000 }],
      logic: [
        {
          id: "rul_gwscore01",
          action_kind: "add_score",
          when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_workshop" }, op: "eq", value: "yes" }], groups: [] },
          variable: "total",
          amount: 500,
        },
      ],
    }),
  );
});

beforeEach(() => {
  gw.flagOn = true;
  gw.failCreate = false;
  gw.onCreate = null;
  gw.onFetch = null;
});

// ───────────────────────────── helpers ─────────────────────────────

interface Session {
  sid: string;
  token: string;
}

const stubFor = (sid: string) =>
  env.SESSION_DO.get(env.SESSION_DO.idFromName(sid)) as unknown as DurableObjectStub<SessionDO>;

let identities = 0;
async function signIn(sid: string): Promise<void> {
  identities += 1;
  const res = await stubFor(sid).attachIdentity({
    provider: "google",
    subject: `google-sub-gw-${identities}`,
    email: `payer${identities}@northwind.co`,
    phone: null,
    name: "Maya",
    pictureUrl: null,
    verifiedAt: Date.now(),
  });
  expect(res.accepted).toBe(true);
}

async function openHosted(slug: string): Promise<Session> {
  const res = await fetchApi(`/p/forms/${slug}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(res.status, await res.clone().text()).toBe(200);
  const body = (await res.json()) as { sessionId: string; respondentToken: string };
  return { sid: body.sessionId, token: body.respondentToken };
}

const post = (path: string, token: string, body?: unknown) =>
  fetchApi(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-respondent-token": token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function answerName(s: Session): Promise<void> {
  const res = await post(`/p/sessions/${s.sid}/messages`, s.token, { type: "structured", ref: "q_name", value: "Byte Force" });
  expect(res.status).toBe(202);
}

/** Signed in and sitting on the payment question. */
async function atPayment(slug = main.slug): Promise<Session> {
  const s = await openHosted(slug);
  await signIn(s.sid);
  await answerName(s);
  expect((await stubFor(s.sid).getStatus())?.currentRef).toBe("q_pay");
  return s;
}

async function startPay(s: Session): Promise<{ status: number; body: Record<string, any> }> {
  const res = await post(`/p/sessions/${s.sid}/payments`, s.token, { ref: "q_pay" });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const latestSeq = async (sid: string) => (await (stubFor(sid) as unknown as SessionDO).eventsSince(0, 1)).latestSeq;

async function eventsAfter(sid: string, seq: number): Promise<{ type: string; data: Record<string, any> }[]> {
  const page = await (stubFor(sid) as unknown as SessionDO).eventsSince(seq, 500);
  return page.events as { type: string; data: Record<string, any> }[];
}

/** The gateway takes the money. */
function gatewayPays(recordId: string, over: { reportMinor?: number } = {}): void {
  const order = gw.orders.get(`ord_${recordId}`);
  expect(order, "no order at the fake gateway").toBeTruthy();
  order!.status = "paid";
  order!.paymentId = `pay_${recordId.slice(-8)}`;
  if (over.reportMinor !== undefined) order!.reportMinor = over.reportMinor;
}

/** Past confirm's two-second throttle, without sleeping through it. */
async function age(recordId: string): Promise<void> {
  await env.DB.prepare(`UPDATE respondent_payments SET updated_at = updated_at - 10000 WHERE id = ?1`).bind(recordId).run();
}

/** Signed in, past the name, and on the payment question with `ref` answered `value`. */
async function atPricedPayment(form: { slug: string }, ref: string, value: string): Promise<Session> {
  const s = await openHosted(form.slug);
  await signIn(s.sid);
  await answerName(s);
  const res = await post(`/p/sessions/${s.sid}/messages`, s.token, { type: "structured", ref, value });
  expect(res.status).toBe(202);
  expect((await stubFor(s.sid).getStatus())?.currentRef).toBe("q_pay");
  return s;
}

/** The pencil on the ticket count, and a new answer: the edit a respondent makes. */
async function changeTickets(s: Session, value: string): Promise<void> {
  expect((await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "edit", ref: "q_tickets" })).status).toBe(202);
  expect(
    (await post(`/p/sessions/${s.sid}/messages`, s.token, { type: "structured", ref: "q_tickets", value })).status,
  ).toBe(202);
}

/** Paid, confirmed and settled: the question is answered and the chat has moved on. */
async function paidAndSettled(s: Session): Promise<string> {
  const { body } = await startPay(s);
  const recordId = body.recordId as string;
  gatewayPays(recordId);
  await age(recordId);
  await post(`/p/sessions/${s.sid}/payments/${recordId}/confirm`, s.token);
  expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toMatchObject({ paymentRecordId: recordId });
  return recordId;
}

async function recordRow(recordId: string) {
  return env.DB.prepare(`SELECT * FROM respondent_payments WHERE id = ?1`).bind(recordId).first<Record<string, any>>();
}

async function webhook(provider: "razorpay" | "cashfree", events: unknown[], signature = "valid"): Promise<Response> {
  return fetchApi(`/p/payments/webhooks/${provider}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-signature": signature },
    body: JSON.stringify({ events }),
  });
}

const forged = { status: "paid", method: "gateway", verified: true, amount: 499, currency: "INR", paymentRecordId: "rpay_forged000000" };

// ───────────────────────────── the lockdown ─────────────────────────────

describe("an answer the browser sends", () => {
  it("is refused on the hosted chat, however convincing", async () => {
    const s = await atPayment();
    const seq = await latestSeq(s.sid);
    const res = await post(`/p/sessions/${s.sid}/messages`, s.token, { type: "structured", ref: "q_pay", value: forged });
    expect(res.status).toBe(202);

    const events = await eventsAfter(s.sid, seq);
    expect(events.find((e) => e.type === "validation_error")?.data).toMatchObject({ ref: "q_pay", code: "payment_unverified" });
    const state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toBeUndefined();
    expect(state?.currentRef).toBe("q_pay");
  });

  it("is refused over /v1 chat", async () => {
    const api = (path: string, body: unknown) =>
      fetchApi(path, {
        method: "POST",
        headers: { "x-api-key": t.apiKeyRaw, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const opened = (await (await api(`/v1/forms/${main.formId}/sessions`, {})).json()) as { sessionId: string };
    await signIn(opened.sessionId);
    await api(`/v1/sessions/${opened.sessionId}/messages`, { type: "structured", ref: "q_name", value: "Byte Force" });

    const turn = (await (
      await api(`/v1/sessions/${opened.sessionId}/messages`, { type: "structured", ref: "q_pay", value: forged })
    ).json()) as { validation: { code: string } | null; answers: Record<string, unknown>; pendingPayment: unknown };
    expect(turn.validation?.code).toBe("payment_unverified");
    expect(turn.answers.q_pay).toBeUndefined();
    expect(turn.pendingPayment).toBeNull();
  });

  it("is refused by /v1/responses/:id/answers", async () => {
    const writer = await seedKey(t, "gwresponsewriter", {
      scopes: { form: ["read"], response: ["read", "write"], session: ["create", "write", "read"] },
    });
    const headers = { "x-api-key": writer.raw, "content-type": "application/json" };
    const created = await fetchApi(`/v1/forms/${main.formId}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({ answers: { q_name: "Byte Force" } }),
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const res = await fetchApi(`/v1/responses/${id}/answers`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: "q_pay", value: forged }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { issues: { ref: string; code: string }[] } };
    expect(body.error.issues).toContainEqual(expect.objectContaining({ ref: "q_pay", code: "payment_unverified" }));
  });
});

// ───────────────────────────── starting ─────────────────────────────

describe("pressing Pay", () => {
  it("takes a payment from a respondent nobody has identified", async () => {
    /*
     * Paying does not require signing in. The form's own `requireAuth` decides
     * that, the way it does for every other question — this used to be a 403
     * with an `auth_required` card, which made every donation and tip-jar form
     * a sign-in form.
     */
    const s = await openHosted(open.slug);
    await answerName(s);
    const seq = await latestSeq(s.sid);

    const started = await startPay(s);
    expect(started.status).toBe(200);
    expect(started.body.launch).toBeTruthy();
    const events = await eventsAfter(s.sid, seq);
    expect(events.map((e) => e.type)).not.toContain("auth_required");
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM respondent_payments WHERE session_id = ?1 AND status = 'created'`,
    )
      .bind(s.sid)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("still gates the conversation when the form asks respondents to sign in", async () => {
    /*
     * The gate belongs to the form, not to the payment block. Removing the
     * payment step's own identity check must not have loosened it: this form
     * asks before the first question, and still does.
     */
    const s = await openHosted(main.slug);
    const events = await eventsAfter(s.sid, 0);
    expect(events.map((e) => e.type)).toContain("auth_required");
    const answered = await post(`/p/sessions/${s.sid}/messages`, s.token, { type: "text", text: "Byte Force" });
    expect(answered.status).toBe(400);
  });

  it("opens one checkout, however many times it is pressed", async () => {
    const s = await atPayment();
    const before = gw.creates;
    const seq = await latestSeq(s.sid);

    const first = await startPay(s);
    expect(first.status).toBe(200);
    expect(first.body.launch).toMatchObject({ kind: "redirect" });
    const second = await startPay(s);
    expect(second.status).toBe(200);
    expect(second.body.recordId).toBe(first.body.recordId);
    expect(gw.creates).toBe(before + 1);

    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM respondent_payments WHERE session_id = ?1`)
      .bind(s.sid)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);

    const required = (await eventsAfter(s.sid, seq)).filter((e) => e.type === "payment_required");
    expect(required).toHaveLength(2);
    expect(required[0]!.data).toMatchObject({ ref: "q_pay", provider: "razorpay", amountMinor: 49900, amount: 499, currency: "INR" });

    // The record carries the server's amount and a response to land on.
    const row = await recordRow(first.body.recordId);
    // A real respondent on a sandbox account: a test payment on a live response.
    expect(row).toMatchObject({ status: "created", amount_minor: 49900, currency: "INR", environment: "test", is_test: 0 });
    expect(row?.submission_id).toBeTruthy();
  });

  it("resolves a variable amount on the server", async () => {
    const s = await atPayment(variable.slug);
    const started = await startPay(s);
    expect(started.status).toBe(200);
    expect(gw.orders.get(`ord_${started.body.recordId}`)?.amountMinor).toBe(25000);
    expect((await recordRow(started.body.recordId))?.amount_minor).toBe(25000);
  });

  it("refuses a plan without collect_payments", async () => {
    const s = await openHosted(freeForm.slug);
    // Free cannot keep a sign-in gate, so the clamp has already switched it off.
    await answerName(s);
    const started = await startPay(s);
    expect(started.status).toBe(402);
    expect(started.body.error.code).toBe("plan_required");
  });

  it("refuses when gateway payments are switched off", async () => {
    const s = await atPayment();
    gw.flagOn = false;
    const started = await startPay(s);
    expect(started.status).toBe(409);
    expect(started.body.error.code).toBe("payment_unavailable");
  });

  it("refuses a question that is not the current one", async () => {
    const s = await openHosted(main.slug);
    await signIn(s.sid);
    const started = await startPay(s);
    expect(started.status).toBe(409);
    expect(started.body.error.code).toBe("stale_ref");
  });

  it("marks the record failed and tells the respondent when the gateway refuses the order", async () => {
    const s = await atPayment();
    gw.failCreate = true;
    const seq = await latestSeq(s.sid);
    const started = await startPay(s);
    expect(started.body.error.code).toBe("payment_unavailable");
    const failed = (await eventsAfter(s.sid, seq)).find((e) => e.type === "payment_failed");
    expect(failed?.data.code).toBe("payment_unavailable");
    const row = await recordRow(failed!.data.recordId);
    expect(row).toMatchObject({ status: "failed", failure_reason: "provider_upstream" });
  });

  it("nudges typed text back to the checkout instead of reading it as an answer", async () => {
    const s = await atPayment();
    await startPay(s);
    const seq = await latestSeq(s.sid);
    await post(`/p/sessions/${s.sid}/messages`, s.token, { type: "text", text: "I paid already" });
    const types = (await eventsAfter(s.sid, seq)).map((e) => e.type);
    expect(types).toContain("payment_required");
    expect(types).not.toContain("answer_recorded");
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toBeUndefined();
  });
});

// ───────────────────────────── settling ─────────────────────────────

describe("settling", () => {
  it("settles through confirm and moves the conversation on", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    const seq = await latestSeq(s.sid);

    // Unpaid, confirm changes nothing.
    await age(recordId);
    const early = await post(`/p/sessions/${s.sid}/payments/${recordId}/confirm`, s.token);
    expect(((await early.json()) as { status: string }).status).toBe("created");

    gatewayPays(recordId);
    await age(recordId);
    const res = await post(`/p/sessions/${s.sid}/payments/${recordId}/confirm`, s.token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ recordId, status: "paid", settled: true });

    const state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toMatchObject({
      status: "paid",
      method: "gateway",
      verified: true,
      provider: "razorpay",
      paymentRecordId: recordId,
      amount: 499,
      currency: "INR",
    });
    expect(state?.currentRef).toBe("q_after");
    expect(state?.pendingPayment).toBeNull();
    const types = (await eventsAfter(s.sid, seq)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["payment_settled", "answer_recorded", "question"]));
    expect((await recordRow(recordId))?.settled_to_session).toBe(1);
  });

  it("refuses to confirm another session's payment", async () => {
    const a = await atPayment();
    const b = await atPayment();
    const { body } = await startPay(a);
    const res = await post(`/p/sessions/${b.sid}/payments/${body.recordId}/confirm`, b.token);
    expect(res.status).toBe(404);
  });

  it("settles from a signed webhook, and does nothing with the same delivery twice", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    gatewayPays(recordId);

    const event = {
      eventId: `evt_${recordId}`,
      type: "paid",
      providerAccountId: MERCHANT,
      providerOrderId: `ord_${recordId}`,
      ourRecordId: null,
      raw: { hello: "world" },
    };
    const unsigned = await webhook("razorpay", [event], "forged");
    expect(unsigned.status).toBe(401);
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toBeUndefined();

    const first = await webhook("razorpay", [event]);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ processed: 1, duplicates: 0 });
    const state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toMatchObject({ verified: true, paymentRecordId: recordId });
    expect(state?.currentRef).toBe("q_after");

    const fetchesBefore = gw.fetches;
    const again = await webhook("razorpay", [event]);
    expect(await again.json()).toMatchObject({ processed: 0, duplicates: 1 });
    expect(gw.fetches).toBe(fetchesBefore);
  });

  it("never settles an amount the record did not ask for", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    gatewayPays(recordId, { reportMinor: 100 });

    const res = await webhook("razorpay", [
      { eventId: `evt_mismatch_${recordId}`, type: "paid", providerOrderId: `ord_${recordId}`, raw: {} },
    ]);
    expect(res.status).toBe(200);
    expect(await recordRow(recordId)).toMatchObject({ status: "created", failure_reason: "amount_mismatch" });
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toBeUndefined();
  });

  it("ignores an event for a different merchant", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    gatewayPays(recordId);
    const fetchesBefore = gw.fetches;

    const res = await webhook("razorpay", [
      {
        eventId: `evt_other_${recordId}`,
        type: "paid",
        providerAccountId: "acc_somebody_else",
        providerOrderId: `ord_${recordId}`,
        raw: {},
      },
    ]);
    expect(await res.json()).toMatchObject({ ignored: 1, processed: 0 });
    expect(gw.fetches).toBe(fetchesBefore);
    expect((await recordRow(recordId))?.status).toBe("created");
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toBeUndefined();
  });

  it("writes the answer onto the response when the payment lands after the conversation ended", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    const submissionId = (await recordRow(recordId))?.submission_id as string;

    // They walk away; the session is abandoned with the checkout still out.
    const stop = await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "stop" });
    expect(stop.status).toBe(202);
    expect((await stubFor(s.sid).getStatus())?.status).toBe("abandoned");

    gatewayPays(recordId);
    const res = await webhook("razorpay", [
      { eventId: `evt_late_${recordId}`, type: "paid", providerAccountId: MERCHANT, ourRecordId: recordId, raw: {} },
    ]);
    expect(res.status).toBe(200);

    const answer = await env.DB.prepare(
      `SELECT value_json FROM submission_answers WHERE submission_id = ?1 AND block_ref = 'q_pay'`,
    )
      .bind(submissionId)
      .first<{ value_json: string }>();
    expect(JSON.parse(answer!.value_json)).toMatchObject({ status: "paid", method: "gateway", verified: true, paymentRecordId: recordId });
    const sub = await env.DB.prepare(`SELECT meta FROM submissions WHERE id = ?1`).bind(submissionId).first<{ meta: string }>();
    expect(JSON.parse(sub!.meta).latePayment).toMatchObject({ ref: "q_pay", recordId });
    expect(await recordRow(recordId)).toMatchObject({ status: "paid", settled_to_session: 1 });
  });

  it("flags a second payment for a question that is already paid", async () => {
    const s = await atPayment();
    const first = await startPay(s);
    // A second checkout for the same question, as a second tab would have had
    // before the first one paid.
    await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "retry_payment", ref: "q_pay" });
    const second = await startPay(s);
    expect(second.body.recordId).not.toBe(first.body.recordId);

    gatewayPays(first.body.recordId);
    await age(first.body.recordId);
    await post(`/p/sessions/${s.sid}/payments/${first.body.recordId}/confirm`, s.token);
    expect((await stubFor(s.sid).getStatus())?.currentRef).toBe("q_after");

    gatewayPays(second.body.recordId);
    await webhook("razorpay", [
      { eventId: `evt_dup_${second.body.recordId}`, type: "paid", ourRecordId: second.body.recordId, raw: {} },
    ]);
    expect(await recordRow(second.body.recordId)).toMatchObject({ status: "paid", failure_reason: "duplicate", settled_to_session: 0 });
    expect(((await stubFor(s.sid).getStatus())?.answers.q_pay as { paymentRecordId: string }).paymentRecordId).toBe(
      first.body.recordId,
    );
  });

  it("marks the answer refunded when the gateway reports a refund", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    const submissionId = (await recordRow(recordId))?.submission_id as string;
    gatewayPays(recordId);
    await age(recordId);
    await post(`/p/sessions/${s.sid}/payments/${recordId}/confirm`, s.token);

    // The live answer is projected in the background; wait for its row.
    const answerRow = () =>
      env.DB.prepare(`SELECT value_json FROM submission_answers WHERE submission_id = ?1 AND block_ref = 'q_pay'`)
        .bind(submissionId)
        .first<{ value_json: string }>();
    for (let i = 0; i < 50 && !(await answerRow()); i += 1) await new Promise((r) => setTimeout(r, 10));
    expect(await answerRow()).toBeTruthy();

    gw.orders.get(`ord_${recordId}`)!.status = "refunded";
    const res = await webhook("razorpay", [{ eventId: `evt_refund_${recordId}`, type: "refunded", ourRecordId: recordId, raw: {} }]);
    expect(res.status).toBe(200);
    expect((await recordRow(recordId))?.status).toBe("refunded");
    expect(JSON.parse((await answerRow())!.value_json)).toMatchObject({ paymentRecordId: recordId, refunded: true });
  });

  it("marks the account revoked when the gateway says access was withdrawn", async () => {
    const id = "pac_gwrevoked001";
    await insertAccount(id, t.orgId, { providerAccountId: "acc_revoke_me" });
    const res = await webhook("razorpay", [{ eventId: "evt_revoke_1", type: "revoked", providerAccountId: "acc_revoke_me", raw: {} }]);
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(`SELECT status FROM payment_accounts WHERE id = ?1`).bind(id).first<{ status: string }>();
    expect(row?.status).toBe("revoked");
  });
});

describe("the headless API", () => {
  const api = (path: string, body?: unknown) =>
    fetchApi(path, {
      method: "POST",
      headers: { "x-api-key": t.apiKeyRaw, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("opens, reports and confirms a checkout through the /v1 twins", async () => {
    const opened = (await (await api(`/v1/forms/${main.formId}/sessions`, {})).json()) as { sessionId: string };
    const sid = opened.sessionId;
    await signIn(sid);
    const named = (await (await api(`/v1/sessions/${sid}/messages`, { type: "structured", ref: "q_name", value: "Byte Force" })).json()) as {
      question: { ref: string; paymentProvider?: string; paymentAccountId?: string };
    };
    // The question names its gateway, and never the account behind it.
    expect(named.question).toMatchObject({ ref: "q_pay", paymentMethod: "gateway", paymentProvider: "razorpay" });
    expect(JSON.stringify(named)).not.toContain(ACCOUNT);

    const started = await api(`/v1/sessions/${sid}/payments`, { ref: "q_pay" });
    expect(started.status).toBe(200);
    const { recordId } = (await started.json()) as { recordId: string };

    // A turn taken while it is open says so.
    const nudged = (await (await api(`/v1/sessions/${sid}/messages`, { type: "text", text: "done?" })).json()) as {
      pendingPayment: { recordId: string; amountMinor: number } | null;
      events: { type: string }[];
    };
    expect(nudged.pendingPayment).toMatchObject({ recordId, amountMinor: 49900 });
    expect(nudged.events.map((e) => e.type)).toContain("payment_required");

    gatewayPays(recordId);
    await age(recordId);
    const confirmed = await api(`/v1/sessions/${sid}/payments/${recordId}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ status: "paid", settled: true });
    expect((await stubFor(sid).getStatus())?.answers.q_pay).toMatchObject({ verified: true, paymentRecordId: recordId });
  });

  it("refuses the /v1 twins for a session another organization owns", async () => {
    const s = await atPayment();
    const res = await fetchApi(`/v1/sessions/${s.sid}/payments`, {
      method: "POST",
      headers: { "x-api-key": free.apiKeyRaw, "content-type": "application/json" },
      body: JSON.stringify({ ref: "q_pay" }),
    });
    expect([402, 404]).toContain(res.status);
    expect((await stubFor(s.sid).getStatus())?.pendingPayment).toBeNull();
  });
});

describe("the published form", () => {
  it("says which gateway a payment question uses, and not which account", async () => {
    const res = await fetchApi(`/p/forms/${main.slug}/config`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const config = JSON.parse(text) as { blocks: { ref: string; paymentMethod?: string; paymentProvider?: string }[] };
    expect(config.blocks.find((b) => b.ref === "q_pay")).toMatchObject({ paymentMethod: "gateway", paymentProvider: "razorpay" });
    expect(text).not.toContain(ACCOUNT);
  });
});

// ───────────────────────────── waiting ─────────────────────────────

describe("an open checkout", () => {
  it("comes back on resync without a new message", async () => {
    const s = await atPayment();
    await startPay(s);
    const seq = await latestSeq(s.sid);
    const res = await fetchApi(`/p/sessions/${s.sid}/resync`, { method: "POST", headers: { "x-respondent-token": s.token } });
    expect(res.status).toBe(202);
    const types = (await eventsAfter(s.sid, seq)).map((e) => e.type);
    expect(types).toEqual(["payment_required"]);
  });

  it("keeps the session alive past the idle alarm while the checkout can still be paid", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const stub = stubFor(s.sid);

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await stub.getStatus())?.status).toBe("active");
    const alarm = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    expect(alarm).toBeGreaterThanOrEqual((body.expiresAt as number) + 15 * 60 * 1000);
  });

  it("asks the gateway once more after the grace period, and settles if it was paid", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const stub = stubFor(s.sid);
    await expireCheckout(stub);
    gatewayPays(body.recordId);

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const state = await stub.getStatus();
    expect(state?.status).toBe("active");
    expect(state?.answers.q_pay).toMatchObject({ verified: true, paymentRecordId: body.recordId });
    expect(state?.currentRef).toBe("q_after");
  });

  it("abandons after the grace period when nothing was paid", async () => {
    const s = await atPayment();
    await startPay(s);
    const stub = stubFor(s.sid);
    await expireCheckout(stub);

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await stub.getStatus())?.status).toBe("abandoned");
  });

  it("is dropped by cancel_payment, and the question comes back", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const seq = await latestSeq(s.sid);
    const res = await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "cancel_payment" });
    expect(res.status).toBe(202);
    const events = await eventsAfter(s.sid, seq);
    expect(events.find((e) => e.type === "payment_failed")?.data.code).toBe("payment_cancelled");
    expect(events.map((e) => e.type)).toContain("question");
    expect((await recordRow(body.recordId))?.status).toBe("superseded");
    expect((await stubFor(s.sid).getStatus())?.pendingPayment).toBeNull();
  });
});

// ───────────────────────────── the price moving ─────────────────────────────

describe("a variable amount that changes", () => {
  it("never settles a payment for a price the question no longer asks", async () => {
    const s = await atPricedPayment(tiered, "q_tickets", "1");
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    expect((await recordRow(recordId))?.amount_minor).toBe(25000);

    // They change the answer the total comes from, then pay the old checkout, still live at the gateway.
    await changeTickets(s, "4");
    expect((await stubFor(s.sid).getStatus())?.currentRef).toBe("q_pay");
    gatewayPays(recordId);
    const seq = await latestSeq(s.sid);
    await age(recordId);
    const res = await post(`/p/sessions/${s.sid}/payments/${recordId}/confirm`, s.token);
    expect(await res.json()).toMatchObject({ status: "paid", settled: false });

    expect(await recordRow(recordId)).toMatchObject({ status: "paid", failure_reason: "amount_changed", settled_to_session: 0 });
    const state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toBeUndefined();
    expect(state?.currentRef).toBe("q_pay");
    expect(state?.pendingPayment).toBeNull();
    const failed = (await eventsAfter(s.sid, seq)).find((e) => e.type === "payment_failed");
    expect(failed?.data).toMatchObject({ ref: "q_pay", recordId, code: "payment_amount_changed" });

    // Pay now charges what the question asks.
    const again = await startPay(s);
    expect(again.status).toBe(200);
    expect((await recordRow(again.body.recordId))?.amount_minor).toBe(100000);
  });

  it("takes a paid answer off the question when an edit changes its price, and puts it back if the price returns", async () => {
    const s = await atPricedPayment(tiered, "q_tickets", "1");
    const recordId = await paidAndSettled(s);
    expect((await stubFor(s.sid).getStatus())?.currentRef).toBe("q_after");

    await changeTickets(s, "4");
    let state = await stubFor(s.sid).getStatus();
    // Not carried past by the resume: the payment question is asked again.
    expect(state?.answers.q_pay).toBeUndefined();
    expect(state?.currentRef).toBe("q_pay");
    expect((await recordRow(recordId))?.failure_reason).toBe("amount_changed");

    // Back to the price they paid: that payment answers the question again, with no second charge.
    await changeTickets(s, "1");
    const before = gw.creates;
    const reused = await startPay(s);
    expect(reused.body.error.code).toBe("already_paid");
    expect(gw.creates).toBe(before);
    state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toMatchObject({ paymentRecordId: recordId, amount: 250 });
    expect((await recordRow(recordId))?.failure_reason).toBeNull();
  });

  it("takes a paid answer off when an edit puts the total outside the form's limits", async () => {
    const s = await atPricedPayment(tiered, "q_tickets", "1");
    const recordId = await paidAndSettled(s);

    await changeTickets(s, "36");
    const state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toBeUndefined();
    expect(state?.currentRef).toBe("q_pay");
    expect((await recordRow(recordId))?.failure_reason).toBe("amount_changed");

    // And Pay says the total is theirs to change, rather than charging it.
    const before = gw.creates;
    const refused = await startPay(s);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: "payment_unavailable" });
    expect(refused.body.error.message).toContain("outside what this form can take");
    expect(gw.creates).toBe(before);
  });

  it("never settles an old checkout against a total the form refuses to charge", async () => {
    const s = await atPricedPayment(tiered, "q_tickets", "1");
    const { body } = await startPay(s);
    const recordId = body.recordId as string;

    await changeTickets(s, "36");
    gatewayPays(recordId);
    await age(recordId);
    const res = await post(`/p/sessions/${s.sid}/payments/${recordId}/confirm`, s.token);
    expect(await res.json()).toMatchObject({ status: "paid", settled: false });

    expect(await recordRow(recordId)).toMatchObject({ status: "paid", failure_reason: "amount_changed", settled_to_session: 0 });
    const state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toBeUndefined();
    expect(state?.currentRef).toBe("q_pay");
  });

  it("reuses a payment refused at settlement once the price comes back to it", async () => {
    const s = await atPricedPayment(tiered, "q_tickets", "1");
    const { body } = await startPay(s);
    const recordId = body.recordId as string;

    // Four tickets, then the one-ticket checkout paid in the tab still open: refused, never settled.
    await changeTickets(s, "4");
    gatewayPays(recordId);
    await age(recordId);
    await post(`/p/sessions/${s.sid}/payments/${recordId}/confirm`, s.token);
    expect(await recordRow(recordId)).toMatchObject({ failure_reason: "amount_changed", settled_to_session: 0 });

    // Back to one ticket: that payment is the answer, and nobody is charged again.
    await changeTickets(s, "1");
    const before = gw.creates;
    const reused = await startPay(s);
    expect(reused.body.error.code).toBe("already_paid");
    expect(gw.creates).toBe(before);
    const state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toMatchObject({ paymentRecordId: recordId, amount: 250 });
    expect(state?.currentRef).toBe("q_after");
    expect(await recordRow(recordId)).toMatchObject({ failure_reason: null, settled_to_session: 1 });
  });

  it("prices from the answers, not from variables the engine keeps adding to", async () => {
    const s = await atPricedPayment(scored, "q_workshop", "yes");
    const recordId = await paidAndSettled(s);
    expect((await recordRow(recordId))?.amount_minor).toBe(150000);

    // Recording the payment re-applied the rule; the price it was asked at still stands.
    let state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toMatchObject({ paymentRecordId: recordId, amount: 1500 });
    expect(state?.currentRef).toBe("q_after");
    expect((await recordRow(recordId))?.failure_reason).toBeNull();

    // And again on the answer after it.
    await post(`/p/sessions/${s.sid}/messages`, s.token, { type: "structured", ref: "q_after", value: "No" });
    state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toMatchObject({ paymentRecordId: recordId });
    expect(state?.status).toBe("completed");
    expect((await recordRow(recordId))?.failure_reason).toBeNull();
  });
});

describe("settling at the same moment", () => {
  it("records one payment once, when the confirm and the webhook arrive together", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    gatewayPays(recordId);
    await age(recordId);
    // The record is paid before either reaches the session, as the confirm route leaves it.
    await env.DB.prepare(`UPDATE respondent_payments SET status = 'paid', paid_at = ?2 WHERE id = ?1`)
      .bind(recordId, Date.now())
      .run();
    const seq = await latestSeq(s.sid);

    const stub = stubFor(s.sid);
    const results = await Promise.all([stub.settlePayment(recordId), stub.settlePayment(recordId)]);
    expect(results.map((r) => r.reason).sort()).toEqual(["already_settled", "settled"]);

    const events = await eventsAfter(s.sid, seq);
    expect(events.filter((e) => e.type === "payment_settled")).toHaveLength(1);
    expect(events.filter((e) => e.type === "answer_recorded" && e.data.ref === "q_pay")).toHaveLength(1);
    expect((await stub.getStatus())?.currentRef).toBe("q_after");
  });

  it("flags the second of two checkouts paid together as a duplicate", async () => {
    const s = await atPayment();
    const first = await startPay(s);
    await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "retry_payment", ref: "q_pay" });
    const second = await startPay(s);
    for (const id of [first.body.recordId, second.body.recordId] as string[]) {
      await env.DB.prepare(`UPDATE respondent_payments SET status = 'paid', paid_at = ?2 WHERE id = ?1`)
        .bind(id, Date.now())
        .run();
    }

    const stub = stubFor(s.sid);
    const results = await Promise.all([
      stub.settlePayment(first.body.recordId),
      stub.settlePayment(second.body.recordId),
    ]);
    expect(results.map((r) => r.reason).sort()).toEqual(["duplicate", "settled"]);
    const rows = await env.DB.prepare(
      `SELECT failure_reason, settled_to_session FROM respondent_payments WHERE id IN (?1, ?2) ORDER BY settled_to_session`,
    )
      .bind(first.body.recordId, second.body.recordId)
      .all<{ failure_reason: string | null; settled_to_session: number }>();
    expect(rows.results).toEqual([
      { failure_reason: "duplicate", settled_to_session: 0 },
      { failure_reason: null, settled_to_session: 1 },
    ]);
  });
});

describe("a question already paid for", () => {
  it("is not re-recorded as paid after the gateway refunds it", async () => {
    const s = await atPayment();
    const recordId = await paidAndSettled(s);

    gw.orders.get(`ord_${recordId}`)!.status = "refunded";
    await webhook("razorpay", [{ eventId: `evt_live_refund_${recordId}`, type: "refunded", ourRecordId: recordId, raw: {} }]);
    expect((await recordRow(recordId))?.status).toBe("refunded");
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toMatchObject({ paymentRecordId: recordId, refunded: true });

    // Back to the question, and Pay: a new checkout, not "you've already paid".
    await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "edit", ref: "q_pay" });
    const before = gw.creates;
    const started = await startPay(s);
    expect(started.status).toBe(200);
    expect(gw.creates).toBe(before + 1);
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toMatchObject({ refunded: true });
  });

  it("is not charged again after Start over", async () => {
    const s = await atPayment();
    const recordId = await paidAndSettled(s);

    expect((await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "restart" })).status).toBe(202);
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toBeUndefined();
    await answerName(s);

    const before = gw.creates;
    const started = await startPay(s);
    expect(started.body.error.code).toBe("already_paid");
    expect(gw.creates).toBe(before);
    const state = await stubFor(s.sid).getStatus();
    expect(state?.answers.q_pay).toMatchObject({ paymentRecordId: recordId });
    expect(state?.currentRef).toBe("q_after");
  });

  it("flags a payment from another session of the same response as a duplicate", async () => {
    const s = await atPayment();
    const settledId = await paidAndSettled(s);
    const submissionId = (await recordRow(settledId))?.submission_id as string;

    // The respondent's other device, which adopted the same response, had a checkout out too.
    const otherId = "rpay_gwotherdevice01";
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO respondent_payments (id, organization_id, form_id, form_version_id, session_id, submission_id, block_ref,
                                        payment_account_id, provider, environment, provider_order_id, amount_minor, currency,
                                        status, created_at, updated_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, 'chs_gwotherdevice', ?5, 'q_pay', ?6, 'razorpay', 'test', ?7, 49900, 'INR', 'created', ?8, ?8, ?9)`,
    )
      .bind(otherId, t.orgId, main.formId, `ver_gwmain`, submissionId, ACCOUNT, `ord_${otherId}`, now, now + 1_800_000)
      .run();
    gw.orders.set(`ord_${otherId}`, { recordId: otherId, amountMinor: 49900, currency: "INR", status: "paid", paymentId: "pay_other" });

    const res = await webhook("razorpay", [{ eventId: `evt_other_device_${otherId}`, type: "paid", ourRecordId: otherId, raw: {} }]);
    expect(res.status).toBe(200);
    expect(await recordRow(otherId)).toMatchObject({ status: "paid", failure_reason: "duplicate", settled_to_session: 0 });
    const answer = await env.DB.prepare(`SELECT value_json FROM submission_answers WHERE submission_id = ?1 AND block_ref = 'q_pay'`)
      .bind(submissionId)
      .first<{ value_json: string }>();
    if (answer) expect(JSON.parse(answer.value_json).paymentRecordId).toBe(settledId);
  });
});

describe("a checkout left open by a payment made elsewhere", () => {
  /** A payment the respondent's other device settled onto the same session's question. */
  async function settledElsewhere(s: Session, id: string): Promise<void> {
    const now = Date.now();
    const submissionId = (
      await env.DB.prepare(`SELECT submission_id FROM respondent_payments WHERE session_id = ?1 LIMIT 1`)
        .bind(s.sid)
        .first<{ submission_id: string }>()
    )?.submission_id;
    await env.DB.prepare(
      `INSERT INTO respondent_payments (id, organization_id, form_id, form_version_id, session_id, submission_id, block_ref,
                                        payment_account_id, provider, environment, provider_order_id, amount_minor, currency,
                                        status, settled_to_session, created_at, updated_at, paid_at, expires_at)
       VALUES (?1, ?2, ?3, 'ver_gwmain', 'chs_gwelsewhere', ?4, 'q_pay', ?5, 'razorpay', 'test', ?6, 49900, 'INR',
               'paid', 1, ?7, ?7, ?7, ?8)`,
    )
      .bind(id, t.orgId, main.formId, submissionId, ACCOUNT, `ord_${id}`, now, now + 1_800_000)
      .run();
  }

  it("is dropped when Pay finds the question already paid", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    await settledElsewhere(s, "rpay_gwelsewhere001");

    const again = await startPay(s);
    expect(again.body.error.code).toBe("already_paid");
    const state = await stubFor(s.sid).getStatus();
    expect(state?.pendingPayment).toBeNull();
    expect(state?.answers.q_pay).toMatchObject({ paymentRecordId: "rpay_gwelsewhere001" });
    expect((await recordRow(body.recordId))?.status).toBe("superseded");
    expect(state?.currentRef).toBe("q_after");
  });

  it("is dropped, and the card told, when that checkout is paid as a duplicate", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    await settledElsewhere(s, "rpay_gwelsewhere002");

    gatewayPays(recordId);
    const seq = await latestSeq(s.sid);
    const res = await webhook("razorpay", [{ eventId: `evt_dup_open_${recordId}`, type: "paid", ourRecordId: recordId, raw: {} }]);
    expect(res.status).toBe(200);
    expect(await recordRow(recordId)).toMatchObject({ status: "paid", failure_reason: "duplicate" });

    expect((await stubFor(s.sid).getStatus())?.pendingPayment).toBeNull();
    const failed = (await eventsAfter(s.sid, seq)).find((e) => e.type === "payment_failed");
    expect(failed?.data).toMatchObject({ ref: "q_pay", recordId, code: "payment_duplicate" });
  });
});

describe("a payment that cannot be asked about", () => {
  it("is ignored rather than failed when the gateway has no such order, so it is not redelivered forever", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    gw.orders.delete(`ord_${recordId}`);

    const event = { eventId: `evt_no_order_${recordId}`, type: "paid", ourRecordId: recordId, raw: {} };
    const res = await webhook("razorpay", [event]);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 1, failed: 0 });
    expect((await recordRow(recordId))?.status).toBe("created");
  });

  it("writes a late sandbox payment as a test-mode one even when its form version cannot be read", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    const submissionId = (await recordRow(recordId))?.submission_id as string;
    await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "stop" });
    // The version row is gone, so the late path falls back to building the answer from the record.
    await env.DB.prepare(`UPDATE respondent_payments SET form_version_id = 'ver_gwgone' WHERE id = ?1`).bind(recordId).run();

    gatewayPays(recordId);
    const res = await webhook("razorpay", [{ eventId: `evt_late_test_${recordId}`, type: "paid", ourRecordId: recordId, raw: {} }]);
    expect(res.status).toBe(200);
    const answer = await env.DB.prepare(`SELECT value_json FROM submission_answers WHERE submission_id = ?1 AND block_ref = 'q_pay'`)
      .bind(submissionId)
      .first<{ value_json: string }>();
    expect(JSON.parse(answer!.value_json)).toMatchObject({ status: "paid", verified: true, testMode: true });
  });
});

describe("webhook retries", () => {
  it("fails a paid event the gateway has not confirmed yet on a superseded checkout, so it is delivered again", async () => {
    const s = await atPayment();
    const first = await startPay(s);
    const recordId = first.body.recordId as string;
    await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "retry_payment", ref: "q_pay" });
    expect((await recordRow(recordId))?.status).toBe("superseded");

    const event = { eventId: `evt_superseded_${recordId}`, type: "paid", ourRecordId: recordId, raw: {} };
    const early = await webhook("razorpay", [event]);
    expect(early.status).toBe(500);

    gatewayPays(recordId);
    const retried = await webhook("razorpay", [event]);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({ processed: 1, duplicates: 0 });
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toMatchObject({ paymentRecordId: recordId });
  });
});

describe("starting checkout, harder cases", () => {
  it("asks a Google-signed-in respondent for a phone number before a Cashfree checkout, without spending an attempt", async () => {
    const s = await atPayment(cashfreeForm.slug);
    const before = gw.creates;
    const asked = await startPay(s);
    expect(asked.status).toBe(422);
    expect(asked.body.error.code).toBe("phone_required");
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM respondent_payments WHERE session_id = ?1`).bind(s.sid).first<{ n: number }>();
    expect(rows?.n).toBe(0);

    const bad = await post(`/p/sessions/${s.sid}/payments`, s.token, { ref: "q_pay", phone: "98765" });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: { message: string } }).error.message).toContain("country code");

    for (let i = 0; i < 6; i += 1) await startPay(s);
    const given = await post(`/p/sessions/${s.sid}/payments`, s.token, { ref: "q_pay", phone: "+91 98765 43210" });
    expect(given.status).toBe(200);
    expect(gw.creates).toBe(before + 1);
    expect(gw.lastCustomer?.phone).toBe("+919876543210");
  });

  it("opens one checkout for two presses that arrive together", async () => {
    const s = await atPayment();
    const before = gw.creates;
    const [a, b] = await Promise.all([startPay(s), startPay(s)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.recordId).toBe(a.body.recordId);
    expect(gw.creates).toBe(before + 1);
  });

  it("does not count a checkout the gateway refused to open as an attempt", async () => {
    const s = await atPayment();
    gw.failCreate = true;
    for (let i = 0; i < 6; i += 1) expect((await startPay(s)).body.error.code).toBe("payment_unavailable");
    gw.failCreate = false;
    expect((await startPay(s)).status).toBe(200);
  });

  it("never charges a live account from a test-mode API key session, and marks a test session's payment as a test", async () => {
    const testKey = await seedKey(t, "gwtestmodekey", { type: "sk_test", scopes: { form: ["read"], session: ["create", "write", "read"] } });
    const api = (path: string, body?: unknown) =>
      fetchApi(path, {
        method: "POST",
        headers: { "x-api-key": testKey.raw, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const open = async (formId: string) => {
      const opened = await api(`/v1/forms/${formId}/sessions`, {});
      expect(opened.status, await opened.clone().text()).toBe(200);
      const { sessionId } = (await opened.json()) as { sessionId: string };
      await signIn(sessionId);
      await api(`/v1/sessions/${sessionId}/messages`, { type: "structured", ref: "q_name", value: "Byte Force" });
      return sessionId;
    };

    const onLive = await open(liveForm.formId);
    const refused = await api(`/v1/sessions/${onLive}/payments`, { ref: "q_pay" });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("live_account_in_test_mode");

    const onTest = await open(main.formId);
    const started = await api(`/v1/sessions/${onTest}/payments`, { ref: "q_pay" });
    expect(started.status).toBe(200);
    const { recordId } = (await started.json()) as { recordId: string };
    expect(await recordRow(recordId)).toMatchObject({ is_test: 1, environment: "test" });
  });

  it("writes a sandbox payment's answer as a test-mode payment", async () => {
    const s = await atPayment();
    await paidAndSettled(s);
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toMatchObject({ verified: true, testMode: true });
  });
});

async function expireCheckout(stub: DurableObjectStub<SessionDO>): Promise<void> {
  await runInDurableObject(stub, async (instance) => {
    const inner = instance as unknown as {
      meta: { pendingPayment: { expiresAt: number } | null };
      persistMeta(): Promise<void>;
    };
    inner.meta.pendingPayment!.expiresAt = Date.now() - 60 * 60 * 1000;
    await inner.persistMeta();
  });
}

// ───────────────────────────── preview ─────────────────────────────

describe("a builder preview", () => {
  async function preview(
    doc: unknown,
    opts: { identified?: boolean; form?: { formId: string; slug: string } } = {},
  ): Promise<string> {
    const sid = `chs_gwprev${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    /*
     * Which form the preview belongs to matters when the session is not signed
     * in: `refreshAuthGate` re-reads the gate from the form's *published*
     * settings, not from the document being previewed, so a preview of `main`
     * is gated whatever its own doc says.
     */
    const form = opts.form ?? main;
    const init = await stubFor(sid).init({
      sessionId: sid,
      formId: form.formId,
      formVersionId: "preview",
      organizationId: t.orgId,
      slug: form.slug,
      brandingHidden: true,
      docJson: doc,
      respondentToken: "preview-token",
      hiddenFields: {},
      ipHash: null,
      country: null,
      userAgent: "preview",
    });
    expect(init.ok).toBe(true);
    // An author previewing their own form has no identity unless they sign in;
    // most tests here are about what happens after the payment step, so they
    // take the short way to it.
    if (opts.identified !== false) await signIn(sid);
    await stubFor(sid).handleUserTurn({ type: "structured", ref: "q_name", value: "Byte Force" });
    return sid;
  }

  it("never opens a checkout on a live account", async () => {
    const { readFormDoc } = await import("@repo/form-schema");
    const sid = await preview(readFormDoc(paymentDoc({ account: LIVE_ACCOUNT })));
    const before = gw.creates;
    const started = await stubFor(sid).startPayment("q_pay");
    expect(started).toMatchObject({ ok: false, code: "preview_live_account" });
    expect(gw.creates).toBe(before);
  });

  it("tells the browser to offer Simulate when there is no account to pay with yet", async () => {
    const { readFormDoc } = await import("@repo/form-schema");
    const sid = await preview(readFormDoc(paymentDoc({ account: "pac_gwnotconnected" })));
    expect(await stubFor(sid).startPayment("q_pay")).toMatchObject({ ok: false, code: "payment_unavailable", preview: true });
    // A published form's refusal carries no such flag.
    const s = await atPayment(liveForm.slug);
    const live = await startPay(s);
    expect(live.status).toBe(200);
  });

  it("opens a real test checkout for an author who never signed into their own preview", async () => {
    // Nobody signs into their own preview, and nothing about paying asks them to.
    const { readFormDoc } = await import("@repo/form-schema");
    const sid = await preview(readFormDoc(paymentDoc({ requireAuth: false })), {
      identified: false,
      form: open,
    });
    expect(await stubFor(sid).startPayment("q_pay")).toMatchObject({ ok: true });
  });

  it("simulates a payment without touching the gateway or D1", async () => {
    const { readFormDoc } = await import("@repo/form-schema");
    const sid = await preview(readFormDoc(paymentDoc()));
    const before = gw.creates;
    const result = await stubFor(sid).action({ action: "simulate_payment", ref: "q_pay" });
    expect(result.accepted).toBe(true);

    const state = await stubFor(sid).getStatus();
    expect(state?.answers.q_pay).toMatchObject({ status: "paid", method: "gateway", verified: true, amount: 499 });
    expect((state?.answers.q_pay as { paymentRecordId: string }).paymentRecordId).toMatch(/^rpay_preview_/);
    expect(state?.currentRef).toBe("q_after");
    expect(gw.creates).toBe(before);
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM respondent_payments WHERE session_id = ?1`)
      .bind(sid)
      .first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("is the only place a payment can be simulated", async () => {
    const s = await atPayment();
    const res = await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "simulate_payment", ref: "q_pay" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_preview");
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toBeUndefined();
  });
});

// ───────────────────────── two devices, one response ─────────────────────────

/**
 * A response is shared between sessions — the same signed-in respondent's phone and laptop —
 * and each session has its own copy of the answers. The one thing that must never happen is a
 * session with old answers deciding that the payment the response actually stands on is the
 * stale one, which is how a valid payment ended up on the refund list with a cheaper one
 * written over the answer.
 */
describe("a payment from another session of the same response", () => {
  /** A settled payment made elsewhere on this response, and the answer it wrote. */
  async function standingPayment(submissionId: string, id: string, amountMinor: number): Promise<void> {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO respondent_payments (id, organization_id, form_id, form_version_id, session_id, submission_id, block_ref,
                                          payment_account_id, provider, environment, provider_order_id, amount_minor, currency,
                                          status, settled_to_session, created_at, updated_at, paid_at, expires_at)
         VALUES (?1, ?2, ?3, 'ver_gwtiered', 'chs_gwlaptop', ?4, 'q_pay', ?5, 'razorpay', 'test', ?6, ?7, 'INR',
                 'paid', 1, ?8, ?8, ?8, ?9)`,
      ).bind(id, t.orgId, tiered.formId, submissionId, ACCOUNT, `ord_${id}`, amountMinor, now, now + 1_800_000),
      env.DB.prepare(
        `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
         VALUES (?1, ?2, ?5, 'q_pay', 'payment', ?3, ?4)
         ON CONFLICT (submission_id, block_ref) DO UPDATE SET value_json = excluded.value_json`,
      ).bind(
        `sa_${id}`,
        submissionId,
        JSON.stringify({ status: "paid", method: "gateway", verified: true, amount: amountMinor / 100, currency: "INR", paymentRecordId: id }),
        now,
        tiered.formId,
      ),
    ]);
  }

  it("is left alone, and the old device's cheaper payment is the one flagged", async () => {
    // The phone: one ticket at ₹250, checkout open and not yet paid.
    const s = await atPricedPayment(tiered, "q_tickets", "1");
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    const submissionId = (await recordRow(recordId))?.submission_id as string;

    // The laptop adopted the same response, changed to four tickets and paid ₹1,000.
    await standingPayment(submissionId, "rpay_gwlaptop00001", 100_000);

    // Only now does the phone's ₹250 checkout go through.
    gatewayPays(recordId);
    const res = await webhook("razorpay", [{ eventId: `evt_two_devices_${recordId}`, type: "paid", ourRecordId: recordId, raw: {} }]);
    expect(res.status).toBe(200);

    // The payment the response stands on is untouched, and the late cheap one is the refund.
    expect(await recordRow("rpay_gwlaptop00001")).toMatchObject({ failure_reason: null, settled_to_session: 1 });
    expect(await recordRow(recordId)).toMatchObject({ status: "paid", failure_reason: "amount_changed", settled_to_session: 0 });
    const answer = await env.DB.prepare(`SELECT value_json FROM submission_answers WHERE submission_id = ?1 AND block_ref = 'q_pay'`)
      .bind(submissionId)
      .first<{ value_json: string }>();
    expect(JSON.parse(answer!.value_json).paymentRecordId).toBe("rpay_gwlaptop00001");
  });

  it("is not written over by a late payment at another price once the conversation is gone", async () => {
    const s = await atPricedPayment(tiered, "q_tickets", "1");
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    const submissionId = (await recordRow(recordId))?.submission_id as string;
    await standingPayment(submissionId, "rpay_gwlaptop00002", 100_000);
    // The phone is put down and the conversation ends.
    await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "stop" });

    gatewayPays(recordId);
    const res = await webhook("razorpay", [{ eventId: `evt_late_two_${recordId}`, type: "paid", ourRecordId: recordId, raw: {} }]);
    expect(res.status).toBe(200);

    const answer = await env.DB.prepare(`SELECT value_json FROM submission_answers WHERE submission_id = ?1 AND block_ref = 'q_pay'`)
      .bind(submissionId)
      .first<{ value_json: string }>();
    expect(JSON.parse(answer!.value_json).paymentRecordId).toBe("rpay_gwlaptop00002");
    expect(await recordRow(recordId)).toMatchObject({ failure_reason: "amount_changed", settled_to_session: 0 });
  });

  it("takes the one settlement slot in D1, so two that race cannot both become the answer", async () => {
    const { claimSettlement, releaseSettlementClaim } = await import("../src/lib/payments/service.js");
    const s = await atPayment();
    const { body } = await startPay(s);
    const first = body.recordId as string;
    const submissionId = (await recordRow(first))?.submission_id as string;
    gatewayPays(first);
    await env.DB.prepare(`UPDATE respondent_payments SET status = 'paid', paid_at = ?2 WHERE id = ?1`)
      .bind(first, Date.now())
      .run();

    const second = "rpay_gwrace000001";
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO respondent_payments (id, organization_id, form_id, form_version_id, session_id, submission_id, block_ref,
                                        payment_account_id, provider, environment, provider_order_id, amount_minor, currency,
                                        status, created_at, updated_at, paid_at, expires_at)
       VALUES (?1, ?2, ?3, 'ver_gwmain', 'chs_gwrace', ?4, 'q_pay', ?5, 'razorpay', 'test', ?6, 49900, 'INR', 'paid', ?7, ?7, ?7, ?8)`,
    )
      .bind(second, t.orgId, main.formId, submissionId, ACCOUNT, `ord_${second}`, now, now + 1_800_000)
      .run();

    const row = { sessionId: s.sid, blockRef: "q_pay" };
    expect(await claimSettlement(env as never, { id: first, ...row }, submissionId)).toBe(true);
    // The second settlement, running in another Durable Object at the same moment.
    expect(await claimSettlement(env as never, { id: second, sessionId: "chs_gwrace", blockRef: "q_pay" }, submissionId)).toBe(false);
    // And the slot comes back when the winner fails to write its answer.
    await releaseSettlementClaim(env as never, first);
    expect(await claimSettlement(env as never, { id: second, sessionId: "chs_gwrace", blockRef: "q_pay" }, submissionId)).toBe(true);
  });
});

// ───────────────────────── reusing a payment already made ─────────────────────────

describe("putting an earlier payment back as the answer", () => {
  /** Start over, answer the ticket count, and press Pay. */
  async function restartAndPay(s: Session, tickets: string): Promise<{ status: number; body: Record<string, any> }> {
    expect((await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "restart" })).status).toBe(202);
    await answerName(s);
    expect((await post(`/p/sessions/${s.sid}/messages`, s.token, { type: "structured", ref: "q_tickets", value: tickets })).status).toBe(202);
    return startPay(s);
  }

  it("flags every other payment the respondent made at a price the question no longer asks", async () => {
    const s = await atPricedPayment(tiered, "q_tickets", "1");
    const cheap = await paidAndSettled(s);

    // Start over at four tickets and pay the higher price. The ₹250 is the stale one now.
    const dear = (await restartAndPay(s, "4")).body.recordId as string;
    gatewayPays(dear);
    await age(dear);
    await post(`/p/sessions/${s.sid}/payments/${dear}/confirm`, s.token);
    expect(await recordRow(dear)).toMatchObject({ status: "paid", settled_to_session: 1, failure_reason: null });
    expect((await recordRow(cheap))?.failure_reason).toBe("amount_changed");

    // Start over again, back to one ticket: the ₹250 pays for it once more, and the ₹1,000
    // becomes the money the admin owes back.
    const again = await restartAndPay(s, "1");
    expect(again.body.error.code).toBe("already_paid");
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toMatchObject({ paymentRecordId: cheap });
    expect(await recordRow(cheap)).toMatchObject({ failure_reason: null, settled_to_session: 1 });
    expect((await recordRow(dear))?.failure_reason).toBe("amount_changed");
  });

  it("never puts back a payment the gateway has since refunded", async () => {
    const s = await atPayment();
    const recordId = await paidAndSettled(s);
    // Refunded at the gateway. No webhook has arrived, so D1 still reads `paid`.
    gw.orders.get(`ord_${recordId}`)!.status = "refunded";

    expect((await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "restart" })).status).toBe(202);
    await answerName(s);
    const before = gw.creates;
    const started = await startPay(s);

    expect(started.status).toBe(200);
    expect(started.body.recordId).not.toBe(recordId);
    expect(gw.creates).toBe(before + 1);
    expect((await recordRow(recordId))?.status).toBe("refunded");
  });

  it("never puts back a payment with a refund still in flight", async () => {
    const s = await atPayment();
    const recordId = await paidAndSettled(s);
    // Cashfree's refunds sit PENDING for days, and the record stays `paid` throughout.
    gw.orders.get(`ord_${recordId}`)!.refundPending = true;

    expect((await post(`/p/sessions/${s.sid}/actions`, s.token, { action: "restart" })).status).toBe(202);
    await answerName(s);
    const started = await startPay(s);

    expect(started.status).toBe(200);
    expect(started.body.recordId).not.toBe(recordId);
    expect((await recordRow(recordId))?.status).toBe("paid");
  });
});

// ───────────────────────── an account disconnected and reconnected ─────────────────────────

describe("a payment whose account was reconnected", () => {
  it("is still verified, by the live row for the same merchant", async () => {
    const oldAccount = "pac_gwrotate_old";
    const newAccount = "pac_gwrotate_new";
    await insertAccount(oldAccount, t.orgId, { providerAccountId: "acc_rotating_merchant" });
    const form = await publishForm(t, "gwrotate", paymentDoc({ account: oldAccount }));

    const s = await openHosted(form.slug);
    await signIn(s.sid);
    await answerName(s);
    const { body } = await startPay(s);
    const recordId = body.recordId as string;

    // The admin rotates the credential: disconnect, then connect the same merchant again. In
    // that order, which is what the unique index on a live connection requires.
    await env.DB.prepare(
      `UPDATE payment_accounts SET status = 'disconnected', credentials_enc = '' WHERE id = ?1`,
    )
      .bind(oldAccount)
      .run();
    await insertAccount(newAccount, t.orgId, { providerAccountId: "acc_rotating_merchant" });

    gatewayPays(recordId);
    const res = await webhook("razorpay", [{ eventId: `evt_rotated_${recordId}`, type: "paid", ourRecordId: recordId, raw: {} }]);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: 1, ignored: 0 });
    expect(await recordRow(recordId)).toMatchObject({ status: "paid", settled_to_session: 1 });
    expect((await stubFor(s.sid).getStatus())?.answers.q_pay).toMatchObject({ verified: true, paymentRecordId: recordId });
  });

  it("is written onto the record when there is no live row left to ask with", async () => {
    const goneAccount = "pac_gwgone_acct";
    await insertAccount(goneAccount, t.orgId, { providerAccountId: "acc_gone_merchant" });
    const form = await publishForm(t, "gwgoneacct", paymentDoc({ account: goneAccount }));

    const s = await openHosted(form.slug);
    await signIn(s.sid);
    await answerName(s);
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    await env.DB.prepare(`UPDATE payment_accounts SET status = 'disconnected', credentials_enc = '' WHERE id = ?1`)
      .bind(goneAccount)
      .run();

    gatewayPays(recordId);
    const res = await webhook("razorpay", [{ eventId: `evt_gone_${recordId}`, type: "paid", ourRecordId: recordId, raw: {} }]);
    expect(res.status).toBe(200);
    // Ignored rather than retried for days — but said on the record, which is the list an admin
    // reconciles from. A payment nobody can confirm must not read as "they never paid".
    expect(await res.json()).toMatchObject({ ignored: 1, failed: 0 });
    expect((await recordRow(recordId))?.failure_reason).toBe("unverifiable_account_disconnected");
  });
});

// ───────────────────────── after the money lands ─────────────────────────

describe("a settled payment", () => {
  it("restarts the idle clock, so the checkout's long alarm cannot abandon the conversation", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const stub = stubFor(s.sid);
    const armed = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    expect(armed).toBeGreaterThanOrEqual((body.expiresAt as number) + 15 * 60 * 1000);

    gatewayPays(body.recordId);
    await age(body.recordId);
    await post(`/p/sessions/${s.sid}/payments/${body.recordId}/confirm`, s.token);

    const after = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    expect(after).toBeLessThan(armed!);
    expect(after).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000);
  });
});

describe("a refund on the checkout still on screen", () => {
  it("takes the card down instead of leaving it waiting on a dead order", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const recordId = body.recordId as string;
    const seq = await latestSeq(s.sid);

    // Paid and given straight back — an auto-refunded late capture.
    gw.orders.get(`ord_${recordId}`)!.status = "refunded";
    gw.orders.get(`ord_${recordId}`)!.paymentId = `pay_${recordId.slice(-8)}`;
    const res = await webhook("razorpay", [{ eventId: `evt_refund_open_${recordId}`, type: "refunded", ourRecordId: recordId, raw: {} }]);
    expect(res.status).toBe(200);

    expect((await recordRow(recordId))?.status).toBe("refunded");
    expect((await stubFor(s.sid).getStatus())?.pendingPayment).toBeNull();
    const failed = (await eventsAfter(s.sid, seq)).find((e) => e.type === "payment_failed");
    expect(failed?.data).toMatchObject({ recordId, code: "payment_refunded" });
  });
});

// ───────────────────────── answers nothing verified ─────────────────────────

describe("a draft answered before the block took verified payments", () => {
  it("is not allowed to count as paid when the response is adopted", async () => {
    const subject = "google-sub-gw-switched";
    const identity = {
      provider: "google" as const,
      subject,
      email: "switcher@northwind.co",
      phone: null,
      name: "Maya",
      pictureUrl: null,
      verifiedAt: Date.now(),
    };

    const first = await openHosted(main.slug);
    expect((await stubFor(first.sid).attachIdentity(identity)).accepted).toBe(true);
    await answerName(first);
    const submissionId = (
      await env.DB.prepare(`SELECT id FROM submissions WHERE session_id = ?1`).bind(first.sid).first<{ id: string }>()
    )?.id as string;
    expect(submissionId).toBeTruthy();

    /*
     * The same person comes back on another device and signs in, and the route hands the
     * session the draft to adopt — answers and all, exactly as `findIdentityHistory` read them
     * out of D1. The payment answer among them is what "I've paid" wrote while the block
     * collected fees by UPI, and it is nothing but the respondent's own word.
     */
    const second = await openHosted(main.slug);
    const accepted = await stubFor(second.sid).attachIdentity(identity, {
      submissionId,
      answers: {
        q_name: "Byte Force",
        q_pay: { status: "paid", method: "upi", verified: false, amount: 499, currency: "INR" },
      },
    });
    expect(accepted.accepted).toBe(true);

    const state = await stubFor(second.sid).getStatus();
    expect(state?.answers.q_pay).toBeUndefined();
    expect(state?.currentRef).toBe("q_pay");
  });
});

// ───────────────────────── the world moving mid-request ─────────────────────────

describe("while the gateway is answering", () => {
  it("retires a checkout whose price moved before it reached the screen", async () => {
    const s = await atPricedPayment(tiered, "q_tickets", "1");
    // Another tab changes the ticket count while the order is being opened. The question itself
    // is still unanswered and still the one on screen, so only the price says anything.
    gw.onCreate = async () => {
      gw.onCreate = null;
      await changeTickets(s, "4");
    };

    const started = await startPay(s);
    expect(started.body.error?.code).toBe("stale_ref");
    const opened = await env.DB.prepare(
      `SELECT id, status, amount_minor FROM respondent_payments WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(s.sid)
      .first<{ id: string; status: string; amount_minor: number }>();
    expect(opened).toMatchObject({ status: "superseded", amount_minor: 25_000 });
    expect((await stubFor(s.sid).getStatus())?.pendingPayment).toBeNull();

    // And Pay again opens one for what the question asks now.
    const again = await startPay(s);
    expect(again.status).toBe(200);
    expect((await recordRow(again.body.recordId))?.amount_minor).toBe(100_000);
  });

  it("does not abandon a conversation the respondent came back to during the last look", async () => {
    const s = await atPayment();
    const { body } = await startPay(s);
    const stub = stubFor(s.sid);
    await expireCheckout(stub);
    // They tap Pay again exactly while the alarm is asking the gateway about the old checkout.
    gw.onFetch = async () => {
      gw.onFetch = null;
      await startPay(s);
    };

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const state = await stub.getStatus();
    expect(state?.status).toBe("active");
    expect(state?.pendingPayment?.recordId).not.toBe(body.recordId);
  });
});
