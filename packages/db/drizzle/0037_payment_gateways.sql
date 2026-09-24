-- Verified payments: the form admin's own gateway account, and every checkout a respondent opens on it.
--
-- Until now a payment block sent the respondent to a link or a UPI QR and recorded "I've paid" as
-- `verified: false`. Anyone could press that button. These tables let the chat move on only after
-- the admin's gateway itself confirms the money arrived.
--
-- ── Whose money, and why that shapes the schema ──
--
-- Chatform is never in the flow of funds. A merchant of record forbids collecting on behalf of
-- others, and taking the money and paying it out again is unlicensed aggregation in India. So the
-- admin connects *their own* Cashfree, Razorpay or Stripe account and every checkout is created on
-- it. `payment_accounts` is therefore a credential store, not a balance: it holds what we need to
-- act as the admin against their gateway, sealed with `lib/secret-box.ts`, and nothing about money.
--
-- The existing `payments` and `dodo_*` tables are chatform's own subscription billing and are not
-- touched or reused. A respondent paying a form's admin is a different relationship with a different
-- counterparty, and one table serving both would let a join confuse the two.
--
-- ── payment_accounts ──
--
-- One row per connected account, owned by the organization (the billing boundary) rather than a
-- workspace or a form, so one Razorpay account can serve every form the org runs. Credentials are
-- ciphertext bound to the row id: a sealed blob copied onto another row does not open.
--
-- A disconnect keeps the row with `status = 'disconnected'` and wiped credentials rather than
-- deleting it, because `respondent_payments` points at it and the admin still needs to see which
-- account an old payment went to. The unique index ignores disconnected rows so the same account can
-- be connected again later.
--
-- ── respondent_payments ──
--
-- One row per checkout attempt, not per answer. A respondent can open checkout, close it, change a
-- variable amount and try again; each attempt is its own gateway order, and the ones that did not
-- complete are `superseded` or `expired` rather than overwritten, so a payment that lands on an
-- attempt everyone thought was abandoned still has a row to land on. `id` (rpay_…) doubles as our
-- order id, the Stripe `client_reference_id` and the Razorpay receipt, which is how a webhook finds
-- its row without trusting anything else in the payload.
--
-- `organization_id` is a plain column rather than a foreign key: the form's cascade already removes
-- these rows with the organization, and a second path to the same delete buys nothing.
--
-- Webhooks are only a trigger. Nothing here is set to `paid` from a payload alone — the gateway's
-- own status API is asked with the merchant's credential and the amount, currency and merchant id
-- are checked against this row first. See `lib/payments/service.ts`.
--
-- ── payment_webhook_events ──
--
-- Delivery dedupe, the same shape and rules as `dodo_events`. Gateways retry; a retried delivery of
-- an event already processed must be a no-op rather than a second settlement.
--
-- Hand-written, as 0021 onward are.
CREATE TABLE IF NOT EXISTS payment_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  -- cashfree | razorpay | stripe
  provider TEXT NOT NULL,
  -- oauth | restricted_key | connect. `connect` is reserved for Stripe Connect; only the credential
  -- type changes when it arrives.
  credential_kind TEXT NOT NULL,
  -- test | live
  environment TEXT NOT NULL,
  -- The gateway's own merchant id — Razorpay `acc_…`, Stripe `acct_…`, Cashfree merchant id. Checked
  -- against every webhook and status response, so a payment on some other merchant never settles.
  provider_account_id TEXT,
  display_label TEXT NOT NULL,
  -- secret-box sealed JSON, bound to `id`. Never returned by any route.
  credentials_enc TEXT NOT NULL,
  access_expires_at INTEGER,
  refresh_expires_at INTEGER,
  -- A lease, so only one request refreshes an OAuth token at a time.
  refresh_lock_until INTEGER,
  -- A per-account signing secret where the gateway issues one (Stripe); sealed like the credentials.
  webhook_secret_enc TEXT,
  provider_webhook_id TEXT,
  -- active | needs_reconnect | revoked | disconnected
  status TEXT NOT NULL DEFAULT 'active',
  last_error TEXT,
  -- JSON string[] of ISO currency codes this account can charge in.
  currencies_json TEXT NOT NULL DEFAULT '[]',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  -- Reserved. Chatform takes nothing per transaction today.
  platform_fee_bps INTEGER NOT NULL DEFAULT 0,
  connected_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_org_status ON payment_accounts (organization_id, status);
-- One live connection per gateway account. Disconnected rows are history, not connections.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_accounts_provider_account
  ON payment_accounts (provider, environment, provider_account_id)
  WHERE status != 'disconnected';

CREATE TABLE IF NOT EXISTS respondent_payments (
  -- rpay_<id>; also our order id, client_reference_id and receipt.
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  form_version_id TEXT,
  session_id TEXT NOT NULL,
  submission_id TEXT,
  block_ref TEXT NOT NULL,
  payment_account_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  environment TEXT NOT NULL,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  -- Minor units in `currency`'s own exponent: paise, cents, yen.
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  -- created | paid | failed | expired | refunded | superseded
  status TEXT NOT NULL,
  -- Why it failed, as the gateway put it — or 'duplicate' for a second successful payment on a ref
  -- that was already paid, which the admin refunds by hand.
  failure_reason TEXT,
  -- Reserved.
  platform_fee_minor INTEGER,
  provider_fee_minor INTEGER,
  -- Whether the answer has been written from this record, live or late.
  settled_to_session INTEGER NOT NULL DEFAULT 0,
  is_test INTEGER NOT NULL DEFAULT 0,
  raw_last_event TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER,
  expires_at INTEGER,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON UPDATE no action ON DELETE cascade,
  -- No cascade: accounts are disconnected, never deleted, while payments point at them.
  FOREIGN KEY (payment_account_id) REFERENCES payment_accounts(id) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_respondent_payments_provider_order
  ON respondent_payments (provider, provider_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_respondent_payments_provider_payment
  ON respondent_payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
-- The session's own attempts at one question: idempotent start, supersede, resync.
CREATE INDEX IF NOT EXISTS idx_respondent_payments_session_ref ON respondent_payments (session_id, block_ref);
CREATE INDEX IF NOT EXISTS idx_respondent_payments_submission ON respondent_payments (submission_id);
-- The reconciliation list, newest first.
CREATE INDEX IF NOT EXISTS idx_respondent_payments_form_created ON respondent_payments (form_id, created_at);
-- The sweep that expires unpaid checkouts.
CREATE INDEX IF NOT EXISTS idx_respondent_payments_status_expires ON respondent_payments (status, expires_at);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  type TEXT,
  payload TEXT NOT NULL,
  -- received | processed | failed | ignored
  status TEXT NOT NULL DEFAULT 'received',
  error TEXT,
  created_at INTEGER NOT NULL,
  processed_at INTEGER,
  UNIQUE (provider, event_id)
);
