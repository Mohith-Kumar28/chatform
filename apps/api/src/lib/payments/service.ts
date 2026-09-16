import { fromMinorUnits, readFormDoc, sha256Hex, validateAnswer, type Block, type SettledPayment } from "@repo/form-schema";
import type { Bindings } from "../../env.js";
import type { SessionDO } from "../../do/session-do.js";
import { recordAnswerRow, type ResponseOwner } from "../submissions.js";
import { AccountUnavailableError, activeSiblingAccount, loadAccountById, withAdapter } from "./accounts.js";
import {
  ProviderError,
  type CheckoutLaunch,
  type CheckoutRequest,
  type PaymentAccountRow,
  type PaymentEnvironment,
  type PaymentProvider,
  type PaymentProviderAdapter,
  type ProviderPaymentStatus,
  type RecordStatus,
  type RespondentPaymentRow,
  type WebhookEvent,
} from "./types.js";

/**
 * The respondent side of verified payments: one checkout attempt, from the
 * moment somebody presses Pay to the moment their answer is written.
 *
 * Three things can say a payment happened — the respondent's own confirm call
 * when the gateway's modal closes, the gateway's webhook, and the session's
 * alarm checking one last time before it gives up — and they race. None of
 * them is believed. Each one only *asks*: `confirmPaymentRecord` fetches the
 * order from the admin's gateway with the admin's credential, checks the
 * amount and currency against the record written before checkout opened, and
 * moves the record with a conditional UPDATE whose `WHERE` is the state
 * machine. Whichever caller wins that UPDATE, the others read a row that is
 * already `paid` and do nothing but route it.
 *
 * Routing is the second half. A paid record belongs to a question in a
 * conversation, and the conversation is the Durable Object's to advance — so
 * settlement goes to `SessionDO.settlePayment` while the session is live, and
 * only when it is not (the respondent paid and closed the tab, and the idle
 * alarm has since abandoned the response) does this module write the answer
 * row itself. See `settleLate`.
 *
 * Nothing here holds money or trusts a browser. The answer value is built by
 * `validateAnswer` from the record, through `opts.settledPayment` — the one
 * input to validation that the respondent cannot supply.
 */

/** How long a checkout stays payable. Stripe's own minimum session life is 30 minutes. */
export const CHECKOUT_TTL_MS = 30 * 60 * 1000;

/**
 * How long past a checkout's expiry the session keeps waiting for it.
 *
 * A gateway can confirm a payment some minutes after its checkout window
 * closed — a UPI collect request approved late, a bank redirect that took its
 * time — and abandoning the conversation the instant the window shuts would
 * send that payment down the late path for no reason.
 */
export const PAYMENT_GRACE_MS = 15 * 60 * 1000;

/** Checkouts one respondent may open for one question before the form stops offering more. */
export const MAX_PAYMENT_ATTEMPTS = 5;

export type StartPaymentErrorCode =
  | "sign_in_required"
  | "plan_required"
  | "payment_unavailable"
  | "stale_ref"
  | "too_many_attempts"
  | "preview_live_account"
  | "session_not_found"
  | "session_closed"
  /** The question already holds a verified payment; the answer was put back instead. */
  | "already_paid"
  /**
   * The gateway needs a phone number for the receipt (Cashfree) and the session has none — the
   * sign-in was Google and no earlier answer gave one. Send `phone` with the next start.
   */
  | "phone_required"
  /** A test-mode session (a `*_test_` API key) never charges a live account. */
  | "live_account_in_test_mode";

export type StartPaymentResult =
  | { ok: true; recordId: string; launch: CheckoutLaunch; expiresAt: number; reused: boolean }
  | {
      ok: false;
      code: StartPaymentErrorCode;
      message: string;
      /**
       * A builder preview that cannot take this payment for real. The card offers Simulate
       * instead, so an author with no account connected yet can still walk the rest of the form.
       */
      preview?: boolean;
    };

/** What `SessionDO.settlePayment` reports, so the caller knows whether to settle late. */
export interface SettleResult {
  accepted: boolean;
  reason?:
    | "settled"
    | "already_settled"
    | "recorded_off_cursor"
    | "session_not_found"
    | "session_not_active"
    | "not_paid"
    | "wrong_session"
    | "no_block"
    | "duplicate"
    /** Paid at a price the question no longer asks — see `settleFromRecord`. Flagged, never an answer. */
    | "amount_changed"
    | "failed";
}

/**
 * An Error, flattened for Workers Logs, which serialise `{ err }` as `{}`.
 * Same shape as the session object's own; see the note on `errorInfo` there.
 */
export function errorInfo(err: unknown): { errName: string; errMessage: string; errStack?: string } {
  if (err instanceof Error) {
    return { errName: err.name, errMessage: err.message, errStack: err.stack?.slice(0, 2000) };
  }
  return { errName: typeof err, errMessage: String(err) };
}

/**
 * Checkout could not be opened, and the respondent needs to be told so.
 *
 * `reason` is for logs and `failure_reason` only; the browser sees
 * `payment_unavailable`, because nothing a respondent can do differs between
 * "the admin's token expired" and "the gateway is down".
 */
export class CheckoutUnavailableError extends Error {
  readonly code = "payment_unavailable" as const;
  constructor(
    public reason: string,
    public recordId: string | null,
  ) {
    super(`checkout_unavailable: ${reason}`);
    this.name = "CheckoutUnavailableError";
  }
}

// ───────────────────────────── rows ─────────────────────────────

interface RecordDbRow {
  id: string;
  organization_id: string;
  form_id: string;
  form_version_id: string | null;
  session_id: string;
  submission_id: string | null;
  block_ref: string;
  payment_account_id: string;
  provider: string;
  environment: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  failure_reason: string | null;
  platform_fee_minor: number | null;
  provider_fee_minor: number | null;
  settled_to_session: number;
  is_test: number;
  raw_last_event: string | null;
  created_at: number;
  updated_at: number;
  paid_at: number | null;
  expires_at: number | null;
}

function toRecord(r: RecordDbRow): RespondentPaymentRow {
  return {
    id: r.id,
    organizationId: r.organization_id,
    formId: r.form_id,
    formVersionId: r.form_version_id,
    sessionId: r.session_id,
    submissionId: r.submission_id,
    blockRef: r.block_ref,
    paymentAccountId: r.payment_account_id,
    provider: r.provider as PaymentProvider,
    environment: r.environment as PaymentEnvironment,
    providerOrderId: r.provider_order_id,
    providerPaymentId: r.provider_payment_id,
    amountMinor: r.amount_minor,
    currency: r.currency,
    status: r.status as RecordStatus,
    failureReason: r.failure_reason,
    platformFeeMinor: r.platform_fee_minor,
    providerFeeMinor: r.provider_fee_minor,
    settledToSession: r.settled_to_session === 1,
    isTest: r.is_test === 1,
    rawLastEvent: r.raw_last_event,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    paidAt: r.paid_at,
    expiresAt: r.expires_at,
  };
}

export async function loadRecord(env: Bindings, recordId: string): Promise<RespondentPaymentRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM respondent_payments WHERE id = ?1`)
    .bind(recordId)
    .first<RecordDbRow>();
  return row ? toRecord(row) : null;
}

async function loadRecordByOrder(
  env: Bindings,
  provider: PaymentProvider,
  providerOrderId: string,
): Promise<RespondentPaymentRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM respondent_payments WHERE provider = ?1 AND provider_order_id = ?2 LIMIT 1`,
  )
    .bind(provider, providerOrderId)
    .first<RecordDbRow>();
  return row ? toRecord(row) : null;
}

/** The server's record, in the one shape `validateAnswer` accepts as proof. */
export function settledPaymentOf(record: RespondentPaymentRow): SettledPayment {
  return {
    recordId: record.id,
    provider: record.provider,
    providerPaymentId: record.providerPaymentId,
    amountMinor: record.amountMinor,
    currency: record.currency,
    paidAt: record.paidAt ?? record.updatedAt,
    ...(record.environment === "test" ? { testMode: true } : {}),
  };
}

function newRecordId(): string {
  return `rpay_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/**
 * A stable, opaque customer id for the gateway.
 *
 * Gateways keep a customer record per id and some show it to the merchant, so
 * it must not be an email or a phone number, and it must be the same person
 * every time they pay — hence the identity's subject when there is one, and
 * the session only as a last resort. Short and alphanumeric, because Cashfree
 * refuses anything else in `customer_id`.
 */
export function customerIdFor(identity: { provider: string; subject: string } | null, sessionId: string): string {
  const basis = identity ? `${identity.provider}:${identity.subject}` : `session:${sessionId}`;
  return `cus_${sha256Hex(basis).slice(0, 24)}`;
}

// ─────────────────────────── opening a checkout ───────────────────────────

export interface CreateCheckoutInput {
  account: PaymentAccountRow;
  organizationId: string;
  formId: string;
  formVersionId: string;
  sessionId: string;
  submissionId: string | null;
  blockRef: string;
  amountMinor: number;
  currency: string;
  title: string;
  description?: string;
  customer: CheckoutRequest["customer"];
  /** Built from the record id, which is minted here, so the return page can name the attempt. */
  urls: (recordId: string) => { returnUrl: string; cancelUrl: string };
  /** A builder preview. Its records are test records, and settle onto no response. */
  preview: boolean;
  /**
   * The session was opened with a `*_test_` API key, so its response is a test response.
   *
   * This, not the account's environment, is what `is_test` means — the same flag the response
   * carries, which is what `pruneTestData` deletes by and what `/v1`'s `mode` reports. A real
   * respondent paying on a sandbox account is a live response with a test payment (the
   * `environment` column, and `testMode` on the answer); a test session paying on it is a test
   * response. Tying `is_test` to the account got both halves wrong: a real response lost its
   * payment rows to the 30-day prune, and a late answer was written as a test answer.
   */
  testSession: boolean;
}

/**
 * Write the attempt down, then ask the gateway for an order against it.
 *
 * In that order, deliberately. The row exists before the gateway knows the
 * order does, so there is no instant at which money could be taken against an
 * order we have no record of — a crash between the two leaves a `created` row
 * with no `provider_order_id`, which is a harmless orphan, rather than an
 * order at the gateway with nothing on our side to land on.
 *
 * The amount is whatever the caller resolved on the server. Nothing from the
 * browser reaches this function.
 */
export async function createCheckoutForSession(
  env: Bindings,
  input: CreateCheckoutInput,
): Promise<{ record: RespondentPaymentRow; launch: CheckoutLaunch }> {
  const id = newRecordId();
  const now = Date.now();
  const expiresAt = now + CHECKOUT_TTL_MS;
  const isTest = input.preview || input.testSession;

  await env.DB.prepare(
    `INSERT INTO respondent_payments
       (id, organization_id, form_id, form_version_id, session_id, submission_id, block_ref,
        payment_account_id, provider, environment, amount_minor, currency, status, is_test,
        created_at, updated_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'created', ?13, ?14, ?14, ?15)`,
  )
    .bind(
      id,
      input.organizationId,
      input.formId,
      input.formVersionId,
      input.sessionId,
      input.submissionId,
      input.blockRef,
      input.account.id,
      input.account.provider,
      input.account.environment,
      input.amountMinor,
      input.currency.toUpperCase(),
      isTest ? 1 : 0,
      now,
      expiresAt,
    )
    .run();

  let result: Awaited<ReturnType<PaymentProviderAdapter["createCheckout"]>>;
  try {
    result = await withAdapter(env, input.account, (adapter: PaymentProviderAdapter) =>
      adapter.createCheckout({
        recordId: id,
        amountMinor: input.amountMinor,
        currency: input.currency.toUpperCase(),
        title: input.title,
        description: input.description,
        customer: input.customer,
        ...input.urls(id),
        expiresAt,
        // The record id is already unique per attempt, so a retried create for
        // the same attempt is the same order rather than a second one.
        idempotencyKey: id,
      }),
    );
  } catch (err) {
    const reason = err instanceof ProviderError ? `provider_${err.code}` : "create_failed";
    console.error("payment_checkout_create_failed", {
      recordId: id,
      provider: input.account.provider,
      accountId: input.account.id,
      reason,
      ...errorInfo(err),
    });
    await env.DB.prepare(
      `UPDATE respondent_payments SET status = 'failed', failure_reason = ?2, updated_at = ?3
        WHERE id = ?1 AND status = 'created'`,
    )
      .bind(id, reason, Date.now())
      .run()
      .catch((e: unknown) => console.error("payment_mark_failed_failed", { recordId: id, ...errorInfo(e) }));
    throw new CheckoutUnavailableError(reason, id);
  }

  await env.DB.prepare(
    `UPDATE respondent_payments SET provider_order_id = ?2, updated_at = ?3 WHERE id = ?1`,
  )
    .bind(id, result.providerOrderId, Date.now())
    .run();

  const record = await loadRecord(env, id);
  if (!record) throw new CheckoutUnavailableError("record_vanished", id);
  return { record, launch: result.launch };
}

/**
 * Retire an attempt nobody is going to finish.
 *
 * `created` only. A record the gateway has already moved on is not ours to
 * overwrite, and a superseded record is still allowed to become `paid` — see
 * `confirmPaymentRecord` — because a respondent with the old checkout still
 * open in another tab can pay it, and that money has to land somewhere.
 */
export async function supersedeRecord(env: Bindings, recordId: string): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE respondent_payments SET status = 'superseded', updated_at = ?2 WHERE id = ?1 AND status = 'created'`,
    )
      .bind(recordId, Date.now())
      .run();
  } catch (err) {
    console.error("payment_supersede_failed", { recordId, ...errorInfo(err) });
  }
}

/** Written once the answer exists — live or late — so no other path writes it again. */
export async function markSettled(env: Bindings, recordId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE respondent_payments SET settled_to_session = 1, updated_at = ?2 WHERE id = ?1`,
  )
    .bind(recordId, Date.now())
    .run();
}

// ─────────────────────────── confirming ───────────────────────────

export interface ConfirmResult {
  record: RespondentPaymentRow;
  /** The record moved because of this call. */
  changed: boolean;
  /** The gateway says paid, but not what the record says. Never settles. */
  mismatch: boolean;
  /**
   * Nothing can be asked, and nothing ever will be: the account was disconnected or is gone, or
   * the gateway has no such order. A webhook for such a record is ignored rather than failed —
   * see `processEvent`.
   */
  unverifiable?: "account_disconnected" | "no_account" | "order_not_found";
  /**
   * The gateway is giving some or all of this money back, and has not finished. The record is
   * still `paid` — a partial refund never becomes `refunded`, and a pending one has not happened
   * yet — but it is not a payment anything should count. See `ProviderPaymentStatus.refundPending`.
   */
  refundPending?: boolean;
}

/**
 * Ask the admin's gateway where this order stands, and move the record.
 *
 * The only function that sets a record `paid`, and it does so only from the
 * gateway's own status response, fetched with the merchant's credential.
 *
 * The amount and currency are compared against the record before anything
 * moves. A mismatch is never a settlement: it is logged, written to
 * `failure_reason`, and left for a person — whatever produced it, whether a
 * bug in an adapter's unit conversion or an order somebody reused, the
 * respondent's answer must not say "paid" for a price the form did not ask.
 *
 * Transitions, each a conditional UPDATE so two callers cannot both win:
 *   created | failed | expired | superseded → paid
 *   paid → refunded
 *   created → failed | expired
 *
 * `failed`, `expired` and `superseded` may still become `paid` — wider than a
 * pure state machine would allow — because each describes what *we* believed
 * about an order, and the gateway taking the money afterwards is a fact that
 * outranks the belief. A late UPI approval lands on an `expired` record; a
 * second tab's old checkout lands on a `superseded` one.
 *
 * Returns null when there is no such record. Throws on a gateway failure other
 * than "no such order", so a webhook caller can answer 5xx and be retried.
 */
export async function confirmPaymentRecord(env: Bindings, recordId: string): Promise<ConfirmResult | null> {
  const record = await loadRecord(env, recordId);
  if (!record) return null;
  if (!record.providerOrderId) return { record, changed: false, mismatch: false };
  if (record.status === "refunded") return { record, changed: false, mismatch: false };

  const account = await loadAccountById(env, record.paymentAccountId);
  if (!account) {
    console.warn("payment_confirm_no_account", { recordId, accountId: record.paymentAccountId });
    return { record, changed: false, mismatch: false, unverifiable: "no_account" };
  }

  let status: ProviderPaymentStatus;
  try {
    status = await fetchOrderStatus(env, account, record);
  } catch (err) {
    if (err instanceof ProviderError && err.code === "not_found") {
      console.warn("payment_confirm_order_not_found", { recordId, provider: record.provider });
      return { record, changed: false, mismatch: false, unverifiable: "order_not_found" };
    }
    /*
     * A disconnected account with nothing live behind it has no credential left to ask with, and
     * — `fetchOrderStatus` having already looked for the same merchant reconnected — nothing that
     * would ever get one. Failing would have a gateway redeliver this webhook for days to no end.
     * `needs_reconnect` and `revoked` still throw: the admin reconnecting brings that same row
     * back, and a redelivery after that settles the payment.
     */
    if (err instanceof AccountUnavailableError && err.status === "disconnected") {
      console.warn("payment_confirm_account_disconnected", { recordId, provider: record.provider });
      return { record, changed: false, mismatch: false, unverifiable: "account_disconnected" };
    }
    throw err;
  }

  const now = Date.now();
  let changed = false;
  let mismatch = false;

  if (status.status === "paid" || status.status === "refunded") {
    const sameAmount =
      status.amountMinor === record.amountMinor && status.currency.toUpperCase() === record.currency.toUpperCase();
    if (!sameAmount) {
      mismatch = true;
      console.warn("payment_amount_mismatch", {
        recordId,
        provider: record.provider,
        expectedMinor: record.amountMinor,
        expectedCurrency: record.currency,
        reportedMinor: status.amountMinor,
        reportedCurrency: status.currency,
      });
      await env.DB.prepare(
        `UPDATE respondent_payments SET failure_reason = 'amount_mismatch', updated_at = ?2
          WHERE id = ?1 AND status NOT IN ('paid', 'refunded')`,
      )
        .bind(recordId, now)
        .run();
    } else if (record.status !== "paid") {
      const res = await env.DB.prepare(
        `UPDATE respondent_payments
            SET status = 'paid', provider_payment_id = COALESCE(?2, provider_payment_id),
                paid_at = ?3, failure_reason = NULL, updated_at = ?4
          WHERE id = ?1 AND status IN ('created', 'failed', 'expired', 'superseded')`,
      )
        .bind(recordId, status.providerPaymentId ?? null, status.paidAt ?? now, now)
        .run();
      changed = (res.meta?.changes ?? 0) > 0;
    }
    // Paid and refunded in the same breath: the gateway only reports the
    // latest state, and the payment still happened first.
    if (!mismatch && status.status === "refunded") {
      const res = await env.DB.prepare(
        `UPDATE respondent_payments SET status = 'refunded', updated_at = ?2 WHERE id = ?1 AND status = 'paid'`,
      )
        .bind(recordId, now)
        .run();
      changed = changed || (res.meta?.changes ?? 0) > 0;
    }
  } else if (status.status === "failed" || status.status === "expired") {
    const res = await env.DB.prepare(
      `UPDATE respondent_payments SET status = ?2, failure_reason = COALESCE(?3, failure_reason), updated_at = ?4
        WHERE id = ?1 AND status = 'created'`,
    )
      .bind(recordId, status.status, status.failureReason?.slice(0, 200) ?? null, now)
      .run();
    changed = (res.meta?.changes ?? 0) > 0;
  }

  const fresh = (await loadRecord(env, recordId)) ?? record;
  return { record: fresh, changed, mismatch, ...(status.refundPending ? { refundPending: true } : {}) };
}

/**
 * Ask the gateway, with the credential of whoever holds that merchant account now.
 *
 * Normally that is the account the record was created on. It is not when the admin has
 * disconnected and reconnected the same gateway account in between — a rotated Stripe key, a
 * re-authorised Razorpay grant — because a reconnect writes a new row and the record still
 * points at the wiped one. The money is on the same merchant account either way, so the live
 * row's credential can ask about it; without this the payment was unverifiable for ever and the
 * respondent's answer was never written.
 */
async function fetchOrderStatus(
  env: Bindings,
  account: PaymentAccountRow,
  record: RespondentPaymentRow,
): Promise<ProviderPaymentStatus> {
  const ask = (acc: PaymentAccountRow) =>
    withAdapter(env, acc, (adapter: PaymentProviderAdapter) => adapter.fetchStatus(record.providerOrderId!));
  try {
    return await ask(account);
  } catch (err) {
    if (!(err instanceof AccountUnavailableError) || err.status !== "disconnected") throw err;
    const sibling = await activeSiblingAccount(env, account);
    if (!sibling) throw err;
    console.log("payment_confirm_via_reconnected_account", {
      recordId: record.id,
      provider: record.provider,
      fromAccountId: account.id,
      toAccountId: sibling.id,
    });
    return ask(sibling);
  }
}

// ─────────────────────────── settling ───────────────────────────

export type SettleOutcome =
  | "settled"
  | "already_settled"
  | "duplicate"
  | "amount_changed"
  | "late"
  | "late_unwritable"
  | "not_paid";

function sessionStub(env: Bindings, sessionId: string): DurableObjectStub<SessionDO> {
  return env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId)) as unknown as DurableObjectStub<SessionDO>;
}

export async function markDuplicate(env: Bindings, record: Pick<RespondentPaymentRow, "id" | "sessionId" | "blockRef" | "provider">): Promise<void> {
  /*
   * Flagged, never refunded. Two tabs, two checkouts, two payments: the
   * respondent is owed one back, and whether to refund it — or keep it as a
   * second seat — is the admin's decision, made in their own gateway dashboard.
   */
  console.warn("payment_duplicate", {
    recordId: record.id,
    sessionId: record.sessionId,
    blockRef: record.blockRef,
    provider: record.provider,
  });
  await env.DB.prepare(
    `UPDATE respondent_payments SET failure_reason = 'duplicate', updated_at = ?2 WHERE id = ?1`,
  )
    .bind(record.id, Date.now())
    .run();
}

/**
 * A paid record whose price the question has since stopped asking.
 *
 * The respondent paid ₹100 for one ticket, then changed the quantity to ten. The payment is real
 * and cannot be the answer — so, like a duplicate, it is marked for the admin to refund and left
 * out of every "is this question paid?" decision. `failure_reason` only moves on a record nobody
 * has flagged yet, so a later refund or duplicate note is not overwritten.
 */
export async function markAmountChanged(env: Bindings, recordId: string): Promise<void> {
  console.warn("payment_amount_changed", { recordId });
  await env.DB.prepare(
    `UPDATE respondent_payments SET failure_reason = 'amount_changed', updated_at = ?2
      WHERE id = ?1 AND status IN ('paid', 'refunded') AND failure_reason IS NULL`,
  )
    .bind(recordId, Date.now())
    .run();
}

/**
 * The payment that already answers this question, if one does.
 *
 * Scoped to the *response* as well as the session, because the response is what is shared: a
 * signed-in respondent's laptop session adopts the draft their phone session started, and Start
 * over keeps the same row. A duplicate check that looked only at the session let a payment
 * pending on the phone land over the one the laptop had already settled — two charges, no flag,
 * and only the later one visible.
 *
 * And scoped to what still counts: `paid`, settled, and not flagged. A refunded payment no longer
 * pays for the question, so the next one is not its duplicate; a payment flagged
 * `amount_changed` never did.
 */
export async function findSettledPayment(
  env: Bindings,
  where: {
    sessionId: string;
    submissionId: string | null;
    blockRef: string;
    excludeId?: string;
    /**
     * Only a payment of exactly this, for putting back as the answer — and then one flagged
     * `amount_changed` counts too. The flag says the price moved away from what was paid; a
     * respondent who moves it back (ten tickets, then one again) has paid for the question
     * after all, and charging them a second time would be the bug.
     *
     * Settled or not, for that flag. A payment refused *at settlement* because the price had
     * already moved — the one-ticket checkout paid in a tab left open after the edit to ten —
     * was flagged and never settled, and requiring `settled_to_session` here charged the
     * respondent a second time for one ticket once they went back to it. The caller marks it
     * settled when it becomes the answer.
     */
    reusableFor?: { amountMinor: number; currency: string };
  },
): Promise<RespondentPaymentRow | null> {
  const reuse = where.reusableFor;
  const row = await env.DB.prepare(
    `SELECT * FROM respondent_payments
      WHERE block_ref = ?1 AND id <> ?2
        AND status = 'paid'
        AND (session_id = ?3 OR (?4 IS NOT NULL AND submission_id = ?4))
        ${
          reuse
            ? `AND amount_minor = ?5 AND currency = ?6
               AND ((settled_to_session = 1 AND failure_reason IS NULL) OR failure_reason = 'amount_changed')`
            : `AND settled_to_session = 1 AND failure_reason IS NULL`
        }
      ORDER BY paid_at DESC
      LIMIT 1`,
  )
    .bind(
      where.blockRef,
      where.excludeId ?? "",
      where.sessionId,
      where.submissionId,
      ...(reuse ? [reuse.amountMinor, reuse.currency.toUpperCase()] : []),
    )
    .first<RecordDbRow>();
  return row ? toRecord(row) : null;
}

/**
 * Take the one settlement slot this question has, or find it taken.
 *
 * `findSettledPayment` reads `settled_to_session`, which used to be written *after* the answer —
 * after `record()`, which runs the rules and an AI turn of up to 45 seconds. Two payments made
 * seconds apart on the same response, in two different session objects, therefore both looked
 * up and both found nothing settled: two charges, two answers written over each other, and
 * neither flagged for the admin to refund. The chain inside one session object cannot help,
 * because the two sessions are two objects.
 *
 * So the slot is claimed in D1 first, in one conditional statement whose `NOT EXISTS` is the
 * duplicate check. Exactly one of two racing claims changes a row; the loser is the duplicate.
 * The caller must `releaseSettlementClaim` if it then fails to write the answer, or a redelivery
 * of the payment would be dismissed as already settled.
 */
export async function claimSettlement(
  env: Bindings,
  record: Pick<RespondentPaymentRow, "id" | "sessionId" | "blockRef">,
  submissionId: string | null,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE respondent_payments SET settled_to_session = 1, updated_at = ?5
      WHERE id = ?1 AND status = 'paid' AND failure_reason IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM respondent_payments o
           WHERE o.block_ref = ?2 AND o.id <> ?1
             AND o.status = 'paid' AND o.settled_to_session = 1 AND o.failure_reason IS NULL
             AND (o.session_id = ?3 OR (?4 IS NOT NULL AND o.submission_id = ?4))
        )`,
  )
    .bind(record.id, record.blockRef, record.sessionId, submissionId, Date.now())
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Give the slot back when the answer could not be written after all. See `claimSettlement`. */
export async function releaseSettlementClaim(env: Bindings, recordId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE respondent_payments SET settled_to_session = 0, updated_at = ?2 WHERE id = ?1 AND settled_to_session = 1`,
  )
    .bind(recordId, Date.now())
    .run()
    .catch((err: unknown) => console.error("payment_claim_release_failed", { recordId, ...errorInfo(err) }));
}

/**
 * Flag every *other* payment this session made for the question that is not for the price it
 * pays now.
 *
 * The one that becomes the answer is decided elsewhere; this is about the ones left over. Start
 * over, pay ₹1,000, start over again and go back to ₹100, and the ₹1,000 stayed `paid`,
 * settled and unflagged — money in with nothing pointing at it, and a later payment would have
 * been flagged as *its* duplicate.
 *
 * This session's own payments only. A payment made from another session of the same response was
 * priced from answers this session may not have, and flagging it from here is how a stale device
 * marks the payment that actually stands for refund; see `settleFromRecord`.
 */
export async function flagStaleSiblings(
  env: Bindings,
  where: { sessionId: string; blockRef: string; keepId: string; amountMinor: number; currency: string },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE respondent_payments SET failure_reason = 'amount_changed', updated_at = ?6
      WHERE session_id = ?1 AND block_ref = ?2 AND id <> ?3
        AND status = 'paid' AND failure_reason IS NULL
        AND (amount_minor <> ?4 OR currency <> ?5)`,
  )
    .bind(where.sessionId, where.blockRef, where.keepId, where.amountMinor, where.currency.toUpperCase(), Date.now())
    .run()
    .catch((err: unknown) => console.error("payment_flag_siblings_failed", { keepId: where.keepId, ...errorInfo(err) }));
}

/**
 * How many checkouts this respondent has already opened for this question, counted in D1.
 *
 * `MAX_PAYMENT_ATTEMPTS` lives in the session's own memory, and a session is cheap to replace: a
 * new tab under the same sign-in adopts the same response and starts counting from zero, so a
 * script could keep opening orders on the admin's gateway account for ever. The rows are the
 * thing that outlives the session, so they are what the cap is really counted from.
 */
export async function countPaymentAttempts(
  env: Bindings,
  where: { sessionId: string; submissionId: string | null; blockRef: string },
): Promise<number> {
  const row = await env.DB.prepare(
    // Orders the gateway actually opened. A row with no `provider_order_id` is a checkout the
    // gateway refused, which `startPayment` deliberately does not count against the respondent.
    `SELECT COUNT(*) AS n FROM respondent_payments
      WHERE block_ref = ?1 AND provider_order_id IS NOT NULL
        AND (session_id = ?2 OR (?3 IS NOT NULL AND submission_id = ?3))`,
  )
    .bind(where.blockRef, where.sessionId, where.submissionId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Take back an `amount_changed` flag: the price is what was paid again. See `findSettledPayment`. */
export async function clearAmountChanged(env: Bindings, recordId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE respondent_payments SET failure_reason = NULL, updated_at = ?2 WHERE id = ?1 AND failure_reason = 'amount_changed'`,
  )
    .bind(recordId, Date.now())
    .run();
}

/**
 * Put a paid record into the conversation it belongs to.
 *
 * Live first: the session object is the one writer of a live conversation's
 * answers, and it also moves the chat on. Only when it says the conversation
 * is over does this write the answer row itself.
 */
export async function settleRecord(env: Bindings, record: RespondentPaymentRow): Promise<SettleOutcome> {
  if (record.status !== "paid") return "not_paid";
  if (record.settledToSession) return "already_settled";
  if (record.failureReason === "duplicate") return "duplicate";
  if (record.failureReason === "amount_changed") return "amount_changed";

  const earlier = await findSettledPayment(env, {
    sessionId: record.sessionId,
    submissionId: record.submissionId,
    blockRef: record.blockRef,
    excludeId: record.id,
  });
  /*
   * The same price twice is a second payment for one question. A different price is not a
   * duplicate but a stale one — the respondent changed an answer and paid the new amount — and
   * which of the two is stale only the session knows, from the variables it holds. So that case
   * goes through to it; see `settleFromRecord`.
   */
  if (earlier && earlier.amountMinor === record.amountMinor && earlier.currency === record.currency) {
    await markDuplicate(env, record);
    /*
     * The session may still have this very checkout on its card — the phone's, while the laptop
     * paid for the same response — and nothing else would tell it the checkout is finished.
     * `paymentFailed` acts only when it is the attempt on screen.
     */
    try {
      await sessionStub(env, record.sessionId).paymentFailed(record.id, "payment_duplicate");
    } catch (err) {
      console.error("payment_duplicate_notify_failed", { recordId: record.id, ...errorInfo(err) });
    }
    return "duplicate";
  }

  let live: SettleResult;
  try {
    live = await sessionStub(env, record.sessionId).settlePayment(record.id);
  } catch (err) {
    console.error("payment_settle_rpc_failed", { recordId: record.id, sessionId: record.sessionId, ...errorInfo(err) });
    throw err;
  }
  if (live.accepted) return live.reason === "already_settled" ? "already_settled" : "settled";
  // Both flagged by the session itself, which is also where the alarm's own settlement goes.
  if (live.reason === "duplicate") return "duplicate";
  if (live.reason === "amount_changed") return "amount_changed";
  if (live.reason === "session_not_active" || live.reason === "session_not_found" || live.reason === "no_block") {
    return settleLate(env, record);
  }
  // `failed`: the session threw while recording. It has already put the
  // question back in front of the respondent; a retry of this delivery, or
  // their own confirm, will try again.
  if (live.reason === "failed") throw new Error("session_settle_failed");
  return "not_paid";
}

/**
 * Write the answer for a payment whose conversation has already ended.
 *
 * The respondent paid and closed the tab; half an hour later the idle alarm
 * abandoned the response, and only then did the gateway's webhook arrive. The
 * money is real, so the answer is written onto the response the session left
 * behind — which `startPayment` guarantees exists, because it opens the
 * response row before it opens a checkout.
 *
 * The response is not reopened or finalised again. An abandoned response that
 * holds a verified payment is exactly what the admin needs to see and chase,
 * and `meta.latePayment` says why the answer arrived after the response ended.
 */
export async function settleLate(env: Bindings, record: RespondentPaymentRow): Promise<SettleOutcome> {
  if (record.formVersionId === "preview") {
    // A preview writes no responses, so there is nothing to write this onto.
    await markSettled(env, record.id);
    return "late";
  }

  const submissionId =
    record.submissionId ??
    (
      await env.DB.prepare(
        `SELECT id FROM submissions WHERE session_id = ?1 ORDER BY started_at DESC LIMIT 1`,
      )
        .bind(record.sessionId)
        .first<{ id: string }>()
    )?.id ??
    null;
  if (!submissionId) {
    console.warn("payment_late_no_response", { recordId: record.id, sessionId: record.sessionId });
    return "late_unwritable";
  }

  /*
   * Never over an answer a payment that still stands wrote.
   *
   * `recordAnswerRow` upserts on (submission, block), so a late payment landing on a response
   * that already holds one silently replaced it — and the replaced payment was left `paid` and
   * unflagged, so the money that *was* counted became the money nobody could see. It happens to
   * a shared response: one device's old checkout, paid long after another device settled a
   * different amount and finished.
   *
   * There is no live session here to say which of the two the response should hold, so the one
   * already on it stands: a payment that the price moved away from is released by the session
   * that moved it (`releaseStalePayments` deletes the answer and flags the record), so an answer
   * still naming a paid, unflagged record is an answer nothing has released. The late one is
   * flagged for the admin instead.
   */
  const rivalId = await answerPaymentRecordId(env, submissionId, record.blockRef);
  if (rivalId && rivalId !== record.id) {
    const rival = await loadRecord(env, rivalId);
    if (rival && rival.status === "paid" && !rival.failureReason) {
      const samePrice = rival.amountMinor === record.amountMinor && rival.currency === record.currency;
      console.warn("payment_late_answer_held", { recordId: record.id, rivalId: rival.id, samePrice });
      if (samePrice) {
        await markDuplicate(env, record);
        return "duplicate";
      }
      await markAmountChanged(env, record.id);
      return "amount_changed";
    }
  }

  const block = await blockForRecord(env, record);
  const value = block
    ? validateAnswer(block, null, { settledPayment: settledPaymentOf(record) })
    : null;
  if (block && (!value || !value.ok || value.value === undefined)) {
    console.error("payment_late_value_refused", { recordId: record.id, blockRef: record.blockRef });
    return "late_unwritable";
  }

  // The same slot a live session takes, taken here before the answer is written — two late
  // deliveries for one question race exactly as a live one and a late one do. See `claimSettlement`.
  if (!(await claimSettlement(env, record, submissionId))) {
    await markDuplicate(env, record);
    return "duplicate";
  }

  const owner: ResponseOwner = {
    env,
    formId: record.formId,
    formVersionId: record.formVersionId ?? "",
    organizationId: record.organizationId,
    sessionId: record.sessionId,
    source: "chat",
    isTest: record.isTest,
  };
  try {
    await recordAnswerRow(owner, {
      responseId: submissionId,
      block: { ref: record.blockRef, type: "payment" },
      // A block edited out of the version since is still a payment that
      // happened; the value is the same one `validateAnswer` would have built.
      value: value?.ok ? value.value : fallbackPaidValue(record),
    });
  } catch (err) {
    // The claim would otherwise make every redelivery read as already settled.
    await releaseSettlementClaim(env, record.id);
    throw err;
  }
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE submissions
          SET meta = json_set(COALESCE(meta, '{}'), '$.latePayment',
                              json_object('ref', ?2, 'recordId', ?3, 'at', ?4))
        WHERE id = ?1`,
    ).bind(submissionId, record.blockRef, record.id, Date.now()),
    env.DB.prepare(
      `UPDATE respondent_payments SET settled_to_session = 1, submission_id = COALESCE(submission_id, ?2), updated_at = ?3
        WHERE id = ?1`,
    ).bind(record.id, submissionId, Date.now()),
  ]);
  console.log("payment_settled_late", { recordId: record.id, submissionId, blockRef: record.blockRef });
  return "late";
}

/** The payment record a response's answer for this question was written from, if it was. */
async function answerPaymentRecordId(env: Bindings, submissionId: string, blockRef: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT json_extract(value_json, '$.paymentRecordId') AS record_id
       FROM submission_answers WHERE submission_id = ?1 AND block_ref = ?2`,
  )
    .bind(submissionId, blockRef)
    .first<{ record_id: string | null }>();
  return row?.record_id ?? null;
}

function fallbackPaidValue(record: RespondentPaymentRow): Record<string, unknown> {
  const s = settledPaymentOf(record);
  return {
    status: "paid",
    method: "gateway",
    verified: true,
    provider: s.provider,
    paymentRecordId: s.recordId,
    ...(s.providerPaymentId ? { paymentId: s.providerPaymentId } : {}),
    amount: fromMinorUnits(s.amountMinor, s.currency),
    currency: s.currency,
    paidAt: s.paidAt,
    // As `validateAnswer` writes it. Without this a sandbox payment read "Paid · verified".
    ...(s.testMode ? { testMode: true } : {}),
  };
}

async function blockForRecord(env: Bindings, record: RespondentPaymentRow): Promise<Block | null> {
  /*
   * Outside the `try`. A read that failed says nothing about the block, and falling back on it
   * wrote the answer and marked the record settled on a transient error, so no retry ever
   * corrected it. Thrown, the webhook answers 5xx and is delivered again.
   */
  const row = record.formVersionId
    ? await env.DB.prepare(`SELECT schema_json FROM form_versions WHERE id = ?1`)
        .bind(record.formVersionId)
        .first<{ schema_json: string }>()
    : null;
  if (!row?.schema_json) return null;
  try {
    const doc = readFormDoc(JSON.parse(row.schema_json));
    const block = doc.blocks.find((b) => b.ref === record.blockRef);
    return block && block.type === "payment" && block.method === "gateway" ? block : null;
  } catch (err) {
    console.error("payment_late_doc_unreadable", { recordId: record.id, ...errorInfo(err) });
    return null;
  }
}

/**
 * The gateway reported a refund. The answer stays — they did pay, once — and
 * gains `refunded: true`, which is what `displayAnswer` renders as "Refunded".
 */
async function markAnswerRefunded(env: Bindings, record: RespondentPaymentRow): Promise<void> {
  const submissionId =
    record.submissionId ??
    (
      await env.DB.prepare(`SELECT id FROM submissions WHERE session_id = ?1 ORDER BY started_at DESC LIMIT 1`)
        .bind(record.sessionId)
        .first<{ id: string }>()
    )?.id;
  if (!submissionId) return;
  await env.DB.prepare(
    `UPDATE submission_answers
        SET value_json = json_set(value_json, '$.refunded', json('true')), updated_at = ?3
      WHERE submission_id = ?1 AND block_ref = ?2
        AND json_extract(value_json, '$.paymentRecordId') = ?4`,
  )
    .bind(submissionId, record.blockRef, Date.now(), record.id)
    .run();
}

/**
 * Tell the session its answer was refunded, so its own copy says so too.
 *
 * `markAnswerRefunded` only reaches the D1 row. The session keeps the answer in its state, and
 * anything that re-records from that copy — the respondent pressing Pay on the question again —
 * would write "paid" back over the refund. Best-effort: a session long gone has no copy to fix.
 */
async function notifyRefunded(env: Bindings, record: RespondentPaymentRow): Promise<void> {
  try {
    await sessionStub(env, record.sessionId).paymentRefunded(record.id);
  } catch (err) {
    console.error("payment_refund_notify_failed", { recordId: record.id, ...errorInfo(err) });
  }
}

/**
 * Whether two account rows are the same gateway account in the same organization — one
 * disconnected and reconnected, rather than two different merchants.
 */
async function sameMerchantAccount(env: Bindings, recordAccountId: string, routeAccountId: string): Promise<boolean> {
  const [mine, theirs] = await Promise.all([
    loadAccountById(env, recordAccountId),
    loadAccountById(env, routeAccountId),
  ]);
  return Boolean(
    mine &&
      theirs &&
      mine.providerAccountId &&
      mine.organizationId === theirs.organizationId &&
      mine.provider === theirs.provider &&
      mine.environment === theirs.environment &&
      mine.providerAccountId === theirs.providerAccountId,
  );
}

/** Tell a live session its attempt failed, so the card offers a retry. Best-effort. */
async function notifyFailed(env: Bindings, record: RespondentPaymentRow, code?: string): Promise<void> {
  try {
    await sessionStub(env, record.sessionId).paymentFailed(
      record.id,
      code ?? (record.status === "expired" ? "payment_expired" : "payment_failed"),
    );
  } catch (err) {
    console.error("payment_failed_notify_failed", { recordId: record.id, ...errorInfo(err) });
  }
}

// ─────────────────────────── the respondent's routes ───────────────────────────

const START_STATUS: Record<StartPaymentErrorCode, 400 | 402 | 403 | 404 | 409 | 422 | 429> = {
  sign_in_required: 403,
  plan_required: 402,
  payment_unavailable: 409,
  stale_ref: 409,
  too_many_attempts: 429,
  preview_live_account: 409,
  session_not_found: 404,
  session_closed: 409,
  already_paid: 409,
  phone_required: 422,
  live_account_in_test_mode: 409,
};

/**
 * `POST …/payments`, shared by `/p` and `/v1`, which differ only in how they
 * decided the caller may drive this session.
 */
export async function startPaymentForSession(
  env: Bindings,
  sessionId: string,
  ref: string,
  opts: { phone?: string } = {},
): Promise<{ status: 200 | 400 | 402 | 403 | 404 | 409 | 422 | 429; body: unknown }> {
  const result = await sessionStub(env, sessionId).startPayment(ref, opts);
  if (result.ok) {
    return { status: 200, body: { recordId: result.recordId, launch: result.launch, expiresAt: result.expiresAt } };
  }
  return {
    status: START_STATUS[result.code] ?? 400,
    body: { error: { code: result.code, message: result.message, ...(result.preview ? { preview: true } : {}) } },
  };
}

/**
 * `POST …/payments/:recordId/confirm`: the respondent's browser saying the
 * gateway's window closed.
 *
 * A nudge, never a verdict. It makes the server ask the gateway now rather
 * than wait for the webhook, and whatever the gateway says is what happens;
 * the outcome reaches the respondent over the stream, as `payment_settled` or
 * `payment_failed`, exactly as it would have from a webhook. The status in
 * the response is for a caller with no stream.
 *
 * A record checked in the last two seconds is not checked again. A page
 * polling this from a Stripe tab it cannot see into would otherwise turn
 * every poll into a gateway call on the admin's rate limit.
 */
export async function confirmPaymentForSession(
  env: Bindings,
  sessionId: string,
  recordId: string,
): Promise<{ status: 200 | 404 | 502; body: unknown }> {
  const record = await loadRecord(env, recordId);
  if (!record || record.sessionId !== sessionId) {
    return { status: 404, body: { error: { code: "not_found", message: "Payment not found" } } };
  }

  let current = record;
  let changed = false;
  const open = record.status !== "paid" && record.status !== "refunded";
  if (open && Date.now() - record.updatedAt >= 2000) {
    try {
      const confirmed = await confirmPaymentRecord(env, recordId);
      if (confirmed) {
        current = confirmed.record;
        changed = confirmed.changed;
        // A look that changed nothing still counts as a look. Without this
        // `updated_at` only moves when the status does, and the two-second
        // window above would never close on a checkout sitting unpaid.
        if (!changed && (current.status === "created" || current.status === "superseded")) {
          await env.DB.prepare(`UPDATE respondent_payments SET updated_at = ?2 WHERE id = ?1`)
            .bind(recordId, Date.now())
            .run()
            .catch((e: unknown) => console.error("payment_confirm_touch_failed", { recordId, ...errorInfo(e) }));
        }
      }
    } catch (err) {
      console.error("payment_confirm_failed", { recordId, provider: record.provider, ...errorInfo(err) });
      return { status: 502, body: { error: { code: "payment_unavailable", message: "Couldn't reach the payment gateway." } } };
    }
  }

  if (current.status === "paid" && !current.settledToSession) {
    try {
      await settleRecord(env, current);
    } catch (err) {
      console.error("payment_confirm_settle_failed", { recordId, ...errorInfo(err) });
    }
  } else if (changed && (current.status === "failed" || current.status === "expired")) {
    await notifyFailed(env, current);
  }

  const final = (await loadRecord(env, recordId)) ?? current;
  return {
    status: 200,
    body: { recordId, status: final.status, settled: final.settledToSession },
  };
}

// ─────────────────────────── webhooks ───────────────────────────

export interface WebhookContext {
  /** Set by the Stripe per-account route: an event must belong to this account. */
  accountId?: string;
}

export interface WebhookSummary {
  processed: number;
  duplicates: number;
  ignored: number;
  /** Events that failed in a way a redelivery might fix. Non-zero answers 5xx. */
  failed: number;
}

/**
 * Act on a verified delivery's events, each at most once.
 *
 * The dedupe is `dodo_events`' rule, for the same reason it exists there: a
 * repeat of an event is a duplicate only if the first attempt was processed.
 * A repeat of one that failed is the gateway's retry doing its job, and
 * dismissing it would strand the payment.
 *
 * Every event past the dedupe is a trigger to go and look, never the thing
 * looked at: a `paid` event runs `confirmPaymentRecord`, which asks the
 * gateway. The payload's amount and status are not read for the decision.
 */
export async function applyWebhookEvents(
  env: Bindings,
  provider: PaymentProvider,
  events: WebhookEvent[],
  ctx: WebhookContext = {},
): Promise<WebhookSummary> {
  const summary: WebhookSummary = { processed: 0, duplicates: 0, ignored: 0, failed: 0 };

  for (const event of events) {
    const payload = safeJson(event.raw);
    const eventId = event.eventId || `anon_${sha256Hex(payload).slice(0, 32)}`;

    const inserted = await env.DB.prepare(
      `INSERT INTO payment_webhook_events (id, provider, event_id, type, payload, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'received', ?6)
       ON CONFLICT (provider, event_id) DO NOTHING`,
    )
      .bind(`pwe_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, provider, eventId, event.type, payload, Date.now())
      .run();
    if ((inserted.meta?.changes ?? 0) === 0) {
      const prior = await env.DB.prepare(
        `SELECT status FROM payment_webhook_events WHERE provider = ?1 AND event_id = ?2`,
      )
        .bind(provider, eventId)
        .first<{ status: string }>();
      if (prior?.status === "processed" || prior?.status === "ignored") {
        summary.duplicates += 1;
        continue;
      }
      console.log("payment_webhook_retry", { provider, eventId, previous: prior?.status ?? "unknown" });
    }

    try {
      const outcome = await processEvent(env, provider, event, ctx);
      const ignored = outcome.startsWith("ignored");
      await markWebhookEvent(env, provider, eventId, ignored ? "ignored" : "processed", outcome);
      if (ignored) summary.ignored += 1;
      else summary.processed += 1;
    } catch (err) {
      summary.failed += 1;
      console.error("payment_webhook_event_failed", { provider, eventId, type: event.type, ...errorInfo(err) });
      await markWebhookEvent(env, provider, eventId, "failed", err instanceof Error ? err.message : String(err)).catch(
        (e: unknown) => console.error("payment_webhook_mark_failed", { provider, eventId, ...errorInfo(e) }),
      );
    }
  }
  return summary;
}

function safeJson(raw: unknown): string {
  try {
    const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? null);
    return text.slice(0, 64_000);
  } catch {
    return "null";
  }
}

async function markWebhookEvent(
  env: Bindings,
  provider: PaymentProvider,
  eventId: string,
  status: "processed" | "ignored" | "failed",
  note: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE payment_webhook_events SET status = ?3, processed_at = ?4, error = ?5 WHERE provider = ?1 AND event_id = ?2`,
  )
    .bind(provider, eventId, status, Date.now(), note.slice(0, 500))
    .run();
}

/** One event. Returns what was done, for `payment_webhook_events.error`; throws to be retried. */
async function processEvent(
  env: Bindings,
  provider: PaymentProvider,
  event: WebhookEvent,
  ctx: WebhookContext,
): Promise<string> {
  if (event.type === "ignored") return "ignored: event type";

  if (event.type === "revoked") {
    if (!event.providerAccountId) return "ignored: revoke without an account";
    const res = await env.DB.prepare(
      `UPDATE payment_accounts SET status = 'revoked', last_error = 'Access was revoked at the gateway.', updated_at = ?3
        WHERE provider = ?1 AND provider_account_id = ?2 AND status IN ('active', 'needs_reconnect')`,
    )
      .bind(provider, event.providerAccountId, Date.now())
      .run();
    return `revoked ${res.meta?.changes ?? 0} account(s)`;
  }

  /*
   * Our id first. It is the one field we minted ourselves and handed to the
   * gateway as the order id, client reference or receipt, so it cannot point
   * at somebody else's record by accident. The gateway's order id is the
   * fallback for events that do not echo it back.
   */
  let record: RespondentPaymentRow | null = null;
  if (event.ourRecordId) {
    const byId = await loadRecord(env, event.ourRecordId);
    if (byId && byId.provider === provider) record = byId;
  }
  if (!record && event.providerOrderId) record = await loadRecordByOrder(env, provider, event.providerOrderId);
  if (!record) return "ignored: no matching record";

  if (ctx.accountId && record.paymentAccountId !== ctx.accountId) {
    /*
     * Unless it is the same merchant, reconnected. A Stripe endpoint belongs to one account row,
     * and disconnecting and reconnecting the same Stripe account (rotating the restricted key)
     * makes a new row with a new endpoint — after which the gateway has only the new endpoint to
     * deliver an old checkout's event to. Refusing it there lost the payment for good. Both rows
     * must be the same merchant in the same organization, which is what makes them the same
     * account rather than merely two accounts one person connected.
     */
    if (!(await sameMerchantAccount(env, record.paymentAccountId, ctx.accountId))) {
      console.warn("payment_webhook_account_mismatch", { recordId: record.id, provider, route: ctx.accountId });
      return "ignored: record belongs to another account";
    }
    console.log("payment_webhook_reconnected_account", { recordId: record.id, provider, route: ctx.accountId });
  }

  /*
   * A partner- or app-level webhook carries every connected merchant's events
   * through one endpoint and one secret, so the signature proves the gateway
   * sent it and nothing about *which merchant* it concerns. The merchant id on
   * the event has to be the one on the account this record was created on.
   */
  if (event.providerAccountId) {
    const account = await loadAccountById(env, record.paymentAccountId);
    if (account?.providerAccountId && account.providerAccountId !== event.providerAccountId) {
      console.warn("payment_webhook_merchant_mismatch", { recordId: record.id, provider, accountId: account.id });
      return "ignored: merchant mismatch";
    }
  }

  // What arrived and when, not the payload: the payload is already on the
  // dedupe row, and it carries the payer's contact details.
  await env.DB.prepare(`UPDATE respondent_payments SET raw_last_event = ?2 WHERE id = ?1`)
    .bind(record.id, JSON.stringify({ eventId: event.eventId, type: event.type, at: Date.now() }))
    .run();

  const confirmed = await confirmPaymentRecord(env, record.id);
  if (!confirmed) return "ignored: record vanished";
  const current = confirmed.record;
  if (confirmed.mismatch) {
    /*
     * Held for a person to look at, and the checkout is over either way. Left alone, the session
     * kept this record as its open checkout: every typed answer went to "your checkout is still
     * open", and Pay handed back the same dead order until it expired half an hour later.
     */
    await notifyFailed(env, current, "payment_amount_mismatch");
    return "held: amount mismatch";
  }

  if (current.status === "paid") {
    const outcome = await settleRecord(env, current);
    return `paid → ${outcome}`;
  }
  if (current.status === "refunded") {
    await markAnswerRefunded(env, current);
    await notifyRefunded(env, current);
    return "refunded";
  }
  if ((current.status === "failed" || current.status === "expired") && confirmed.changed) {
    await notifyFailed(env, current);
    return current.status;
  }
  if (confirmed.unverifiable) {
    /*
     * Not a status that is not final yet, but a question nobody can ask. `confirmPaymentRecord`
     * already declined to fail for a disconnected account, so as not to have the gateway
     * redeliver for days; failing here instead did exactly that, on the shared app- and
     * partner-level endpoints every merchant's deliveries go through.
     *
     * A `paid` event that ends here is money we were told about and cannot confirm, so it is
     * written onto the record rather than only into a log: the reconciliation list is where an
     * admin looks for payments with no answer, and a row sitting at `created` with nothing
     * against it says only "they never paid".
     */
    if (event.type === "paid") {
      await env.DB.prepare(
        `UPDATE respondent_payments SET failure_reason = ?2, updated_at = ?3
          WHERE id = ?1 AND status NOT IN ('paid', 'refunded') AND failure_reason IS NULL`,
      )
        .bind(record.id, `unverifiable_${confirmed.unverifiable}`.slice(0, 60), Date.now())
        .run()
        .catch((err: unknown) => console.error("payment_unverifiable_mark_failed", { recordId: record.id, ...errorInfo(err) }));
    }
    return `ignored: ${confirmed.unverifiable}`;
  }
  if (event.type === "paid") {
    /*
     * The event says paid and the gateway's own status API does not agree yet.
     * Not settled, and not dismissed either: failing the delivery gets it
     * retried on the gateway's schedule, by which time the two usually agree.
     *
     * Whatever the record's own status. `superseded`, `failed` and `expired`
     * can all still become `paid` — an old tab, a second try inside the same
     * modal, a late UPI approval — and a delivery marked processed here is
     * discarded as a duplicate on every retry after it. A Razorpay capture that
     * failed transiently reports `created` on a `failed` record, and no second
     * event is coming to rescue it.
     */
    throw new Error("gateway_status_not_final");
  }
  return `no change (${current.status})`;
}

// ─────────────────────────── public doc ───────────────────────────

/**
 * Which gateway each account id is, for the accounts a form's gateway blocks
 * name — so a published block can say "Pay with Razorpay" before anyone
 * presses anything. Org-scoped: an account id copied into another org's form
 * resolves to nothing.
 */
export async function providersForAccounts(
  env: Bindings,
  organizationId: string,
  accountIds: string[],
): Promise<Map<string, PaymentProvider>> {
  const ids = [...new Set(accountIds.filter(Boolean))].slice(0, 20);
  const out = new Map<string, PaymentProvider>();
  if (ids.length === 0) return out;
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, provider FROM payment_accounts
        WHERE organization_id = ?1 AND status != 'disconnected' AND id IN (${ids.map((_, i) => `?${i + 2}`).join(", ")})`,
    )
      .bind(organizationId, ...ids)
      .all<{ id: string; provider: string }>();
    for (const r of results ?? []) out.set(r.id, r.provider as PaymentProvider);
  } catch (err) {
    console.error("payment_providers_lookup_failed", { organizationId, ...errorInfo(err) });
  }
  return out;
}
