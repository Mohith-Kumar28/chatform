import type { Bindings } from "../../env.js";
import { open, seal } from "../secret-box.js";
import type { OAuthTokens } from "./oauth-state.js";
import { adapterFor, refresherFor, revokeAtProvider, type StoredCredentials } from "./registry.js";
import {
  ProviderError,
  type AccountDescription,
  type CredentialKind,
  type PaymentAccountRow,
  type PaymentAccountStatus,
  type PaymentEnvironment,
  type PaymentProvider,
  type PaymentProviderAdapter,
} from "./types.js";

/**
 * Connected gateway accounts: storing them, reading them back for the right organization only,
 * and keeping their OAuth tokens alive.
 *
 * Two rules hold everywhere in this file.
 *
 * **The organization is always in the query.** `loadAccountForOrg` is what every route uses, and
 * it asks for the id AND the organization in one statement, so another tenant's account id is
 * indistinguishable from one that does not exist. `loadAccountById` exists only for the paths
 * that have no organization to check against yet — a Stripe webhook addressed to an account, the
 * token sweep — and each of those authenticates by other means first.
 *
 * **Credentials are opened here and nowhere else.** Sealed with `secret-box` using the row id as
 * the associated data, so a sealed blob copied onto another row does not open. The webhook secret
 * is sealed under `<id>#webhook`, so the two columns of one row cannot be swapped for each other
 * either. Nothing returned to a route carries either column in the clear, and nothing here logs
 * them.
 */

export const REFRESH_SKEW_MS = 5 * 60 * 1000;
/** Longer than a token call can take (10s timeout), so a live refresher never loses its lease. */
export const REFRESH_LEASE_MS = 30 * 1000;
const REFRESH_POLL_MS = 200;
const REFRESH_WAIT_MS = 8 * 1000;
/** The sweep renews anything expiring within the hour, so a quiet form's token never lapses between cron ticks. */
const SWEEP_WINDOW_MS = 60 * 60 * 1000;

interface AccountDbRow {
  id: string;
  organization_id: string;
  provider: string;
  credential_kind: string;
  environment: string;
  provider_account_id: string | null;
  display_label: string;
  credentials_enc: string;
  access_expires_at: number | null;
  refresh_expires_at: number | null;
  refresh_lock_until: number | null;
  webhook_secret_enc: string | null;
  provider_webhook_id: string | null;
  status: string;
  last_error: string | null;
  currencies_json: string;
  capabilities_json: string;
  platform_fee_bps: number;
  connected_by_user_id: string | null;
  is_default?: number;
  created_at: number;
  updated_at: number;
}

function parseJson<T>(text: string | null | undefined, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function rowToAccount(r: AccountDbRow): PaymentAccountRow {
  const currencies = parseJson<unknown>(r.currencies_json, []);
  const capabilities = parseJson<unknown>(r.capabilities_json, {});
  return {
    id: r.id,
    organizationId: r.organization_id,
    provider: r.provider as PaymentProvider,
    credentialKind: r.credential_kind as CredentialKind,
    environment: r.environment as PaymentEnvironment,
    providerAccountId: r.provider_account_id,
    displayLabel: r.display_label,
    credentialsEnc: r.credentials_enc,
    accessExpiresAt: r.access_expires_at,
    refreshExpiresAt: r.refresh_expires_at,
    refreshLockUntil: r.refresh_lock_until,
    webhookSecretEnc: r.webhook_secret_enc,
    providerWebhookId: r.provider_webhook_id,
    status: r.status as PaymentAccountStatus,
    lastError: r.last_error,
    currencies: Array.isArray(currencies) ? currencies.filter((c): c is string => typeof c === "string") : [],
    capabilities: capabilities && typeof capabilities === "object" && !Array.isArray(capabilities) ? (capabilities as Record<string, unknown>) : {},
    platformFeeBps: r.platform_fee_bps,
    connectedByUserId: r.connected_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** `{ errName, errMessage }` — Workers Logs serialise an `Error` as `{}`. */
function errorInfo(err: unknown): { errName: string; errMessage: string } {
  if (err instanceof Error) return { errName: err.name, errMessage: err.message.slice(0, 300) };
  return { errName: typeof err, errMessage: String(err).slice(0, 300) };
}

export function newPaymentAccountId(): string {
  return `pac_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

// ─────────────────────────────── reading ───────────────────────────────

/** The account, only if it belongs to `orgId`. Null for another tenant's id, exactly as for no id. */
export async function loadAccountForOrg(env: Bindings, orgId: string, accountId: string): Promise<PaymentAccountRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM payment_accounts WHERE id = ? AND organization_id = ?`)
    .bind(accountId, orgId)
    .first<AccountDbRow>();
  return row ? rowToAccount(row) : null;
}

/** Unscoped. Only for callers that authenticated some other way — see the note at the top. */
export async function loadAccountById(env: Bindings, accountId: string): Promise<PaymentAccountRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM payment_accounts WHERE id = ?`).bind(accountId).first<AccountDbRow>();
  return row ? rowToAccount(row) : null;
}

/** The live connection for one gateway account, in whichever organization holds it. */
export async function findConnectedByProviderAccount(
  env: Bindings,
  provider: PaymentProvider,
  environment: PaymentEnvironment,
  providerAccountId: string,
): Promise<PaymentAccountRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM payment_accounts
      WHERE provider = ? AND environment = ? AND provider_account_id = ? AND status != 'disconnected'
      LIMIT 1`,
  )
    .bind(provider, environment, providerAccountId)
    .first<AccountDbRow>();
  return row ? rowToAccount(row) : null;
}

/**
 * The live row for the same gateway account as a dead one.
 *
 * Disconnect wipes the credentials and leaves the row behind for old payments to point at, and
 * a reconnect of the same merchant makes a *new* row (`findConnectedByProviderAccount` skips
 * disconnected ones). So a payment made on the old row had nothing left to verify it with, for
 * good: the respondent was charged, the webhook was ignored, and no answer was ever written.
 *
 * The merchant is the same merchant, though, and their new credential can ask the gateway about
 * an order made under the old one. Matched on organization as well as provider, environment and
 * merchant id, so this can only ever reach across rows one tenant owns.
 */
export async function activeSiblingAccount(
  env: Bindings,
  account: PaymentAccountRow,
): Promise<PaymentAccountRow | null> {
  if (!account.providerAccountId) return null;
  const row = await env.DB.prepare(
    `SELECT * FROM payment_accounts
      WHERE organization_id = ?1 AND provider = ?2 AND environment = ?3 AND provider_account_id = ?4
        AND id <> ?5 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1`,
  )
    .bind(account.organizationId, account.provider, account.environment, account.providerAccountId, account.id)
    .first<AccountDbRow>();
  return row ? rowToAccount(row) : null;
}

/** What a route may say about an account. No credential, sealed or otherwise. */
export interface PublicAccount {
  id: string;
  provider: PaymentProvider;
  credentialKind: CredentialKind;
  environment: PaymentEnvironment;
  label: string;
  /** The gateway's own id for the account (`acc_…`, `acct_…`): what its dashboard shows. Not a secret. */
  providerAccountId: string | null;
  status: PaymentAccountStatus;
  lastError: string | null;
  currencies: string[];
  createdAt: number;
  formsUsing?: number;
  /** New verified-checkout questions start on this one. Exactly one active account per organization reads true. */
  isDefault?: boolean;
  /** Who in the organization connected it, so two accounts can be told apart by more than an id. */
  connectedBy?: { name: string | null; email: string | null } | null;
}

export function toPublicAccount(
  account: PaymentAccountRow,
  formsUsing?: number,
  connectedBy?: PublicAccount["connectedBy"],
): PublicAccount {
  return {
    id: account.id,
    provider: account.provider,
    credentialKind: account.credentialKind,
    environment: account.environment,
    label: account.displayLabel,
    providerAccountId: account.providerAccountId,
    status: account.status,
    lastError: account.lastError,
    currencies: account.currencies,
    createdAt: account.createdAt,
    ...(formsUsing !== undefined ? { formsUsing } : {}),
    ...(connectedBy !== undefined ? { connectedBy } : {}),
  };
}

/**
 * Every account an organization can see, newest first, with how many of its forms point at each.
 *
 * Disconnected rows are history kept for old payments to point at, not connections, so they are
 * left out. `formsUsing` counts working documents that name the id: account ids are random, so a
 * substring match on `"pac_…"` cannot collide with anything else a document contains, and it
 * costs one statement however many accounts there are.
 */
export async function listAccounts(env: Bindings, orgId: string): Promise<PublicAccount[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.*,
            (SELECT COUNT(*) FROM forms f
              WHERE f.organization_id = a.organization_id
                AND f.deleted_at IS NULL
                AND instr(f.working_schema, '"' || a.id || '"') > 0) AS forms_using,
            u.name AS connected_by_name,
            u.email AS connected_by_email
       FROM payment_accounts a
       LEFT JOIN users u ON u.id = a.connected_by_user_id
      WHERE a.organization_id = ? AND a.status != 'disconnected'
      ORDER BY a.created_at DESC`,
  )
    .bind(orgId)
    .all<AccountDbRow & { forms_using: number; connected_by_name: string | null; connected_by_email: string | null }>();
  const rows = results ?? [];
  // The flagged one, or, with none flagged, the first connected that still works.
  const active = rows.filter((r) => r.status === "active");
  const defaultId = (active.find((r) => r.is_default === 1) ?? active[active.length - 1])?.id ?? null;
  return rows.map((r) => ({
    ...toPublicAccount(
      rowToAccount(r),
      r.forms_using,
      r.connected_by_name || r.connected_by_email ? { name: r.connected_by_name, email: r.connected_by_email } : null,
    ),
    isDefault: r.id === defaultId,
  }));
}

/** Make one account the organization's default, and every other one not. */
export async function setDefaultAccount(env: Bindings, orgId: string, accountId: string): Promise<boolean> {
  const target = await env.DB.prepare(
    `SELECT id FROM payment_accounts WHERE id = ? AND organization_id = ? AND status = 'active'`,
  )
    .bind(accountId, orgId)
    .first<{ id: string }>();
  if (!target) return false;
  await env.DB.prepare(`UPDATE payment_accounts SET is_default = (id = ?), updated_at = ? WHERE organization_id = ?`)
    .bind(accountId, Date.now(), orgId)
    .run();
  return true;
}

/**
 * The author's own name for an account. The gateway only hands back an id, and "Razorpay
 * acc_SXSV…" does not say which of two accounts is the event one; this does.
 */
export async function renameAccount(env: Bindings, orgId: string, accountId: string, label: string): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE payment_accounts SET display_label = ?, updated_at = ?
      WHERE id = ? AND organization_id = ? AND status != 'disconnected'`,
  )
    .bind(label.slice(0, 200), Date.now(), accountId, orgId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function openCredentials(env: Bindings, account: PaymentAccountRow): Promise<StoredCredentials> {
  if (!account.credentialsEnc) throw new AccountUnavailableError(account.status === "active" ? "disconnected" : account.status);
  return JSON.parse(await open(env, account.credentialsEnc, account.id)) as StoredCredentials;
}

/** The per-account webhook signing secret (Stripe), or null where the gateway signs with a platform secret. */
export async function openWebhookSecret(env: Bindings, account: PaymentAccountRow): Promise<string | null> {
  if (!account.webhookSecretEnc) return null;
  return open(env, account.webhookSecretEnc, `${account.id}#webhook`);
}

// ─────────────────────────────── errors ───────────────────────────────

/** The account cannot be used until someone reconnects it, or at all. */
export class AccountUnavailableError extends Error {
  constructor(public status: PaymentAccountStatus) {
    super(`payment_account_${status}`);
    this.name = "AccountUnavailableError";
  }
}

/**
 * This gateway account is already connected to a different organization.
 *
 * Refused rather than moved. One merchant account serving two organizations would mean either
 * one can disconnect the other's payments, and a webhook for it could be claimed by both.
 */
export class AccountConflictError extends Error {
  constructor() {
    super("account_connected_elsewhere");
    this.name = "AccountConflictError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

// ─────────────────────────────── writing ───────────────────────────────

const RECONNECT_MESSAGE: Record<PaymentProvider, string> = {
  cashfree: "Cashfree no longer accepts chatform's access. Reconnect the account.",
  razorpay: "Razorpay no longer accepts chatform's access. Reconnect the account.",
  stripe: "Stripe no longer accepts this key. It may have been deleted or rolled — paste a new one.",
};

export async function markAccountStatus(
  env: Bindings,
  accountId: string,
  status: PaymentAccountStatus,
  lastError: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE payment_accounts SET status = ?, last_error = ?, refresh_lock_until = NULL, updated_at = ?
      WHERE id = ? AND status != 'disconnected'`,
  )
    .bind(status, lastError ? lastError.slice(0, 500) : null, Date.now(), accountId)
    .run();
}

export interface SaveOAuthAccountInput {
  orgId: string;
  userId: string | null;
  provider: "cashfree" | "razorpay";
  tokens: OAuthTokens;
  description: AccountDescription;
  capabilities?: Record<string, unknown>;
}

/**
 * Store a completed OAuth connection.
 *
 * Connecting an account this organization already holds — after a revoke, or from a
 * `needs_reconnect` banner — updates that row in place and keeps its id, because forms and past
 * payments point at it. The same account held by another organization is refused.
 */
export async function saveOAuthAccount(env: Bindings, input: SaveOAuthAccountInput): Promise<PaymentAccountRow> {
  const { description, tokens } = input;
  const creds: StoredCredentials = {
    kind: "oauth",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    ...(tokens.publicToken ? { publicToken: tokens.publicToken } : {}),
  };
  return upsertAccount(env, {
    orgId: input.orgId,
    userId: input.userId,
    provider: input.provider,
    credentialKind: "oauth",
    description,
    creds,
    accessExpiresAt: tokens.accessExpiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt,
    webhookSecret: null,
    providerWebhookId: null,
    capabilities: input.capabilities ?? {},
  });
}

export interface SaveStripeKeyAccountInput {
  /** Chosen before the webhook endpoint was created, because its URL carries it. */
  id: string;
  orgId: string;
  userId: string | null;
  key: string;
  description: AccountDescription;
  webhookId: string;
  webhookSecret: string;
}

export async function saveStripeKeyAccount(env: Bindings, input: SaveStripeKeyAccountInput): Promise<PaymentAccountRow> {
  return upsertAccount(env, {
    id: input.id,
    orgId: input.orgId,
    userId: input.userId,
    provider: "stripe",
    credentialKind: "restricted_key",
    description: input.description,
    creds: { kind: "restricted_key", key: input.key },
    accessExpiresAt: null,
    refreshExpiresAt: null,
    webhookSecret: input.webhookSecret,
    providerWebhookId: input.webhookId,
    capabilities: { anyCurrency: true },
  });
}

interface UpsertInput {
  id?: string;
  orgId: string;
  userId: string | null;
  provider: PaymentProvider;
  credentialKind: CredentialKind;
  description: AccountDescription;
  creds: StoredCredentials;
  accessExpiresAt: number | null;
  refreshExpiresAt: number | null;
  webhookSecret: string | null;
  providerWebhookId: string | null;
  capabilities: Record<string, unknown>;
}

async function upsertAccount(env: Bindings, input: UpsertInput, attempt = 0): Promise<PaymentAccountRow> {
  const { description } = input;
  const existing = await findConnectedByProviderAccount(env, input.provider, description.environment, description.providerAccountId);
  if (existing && existing.organizationId !== input.orgId) throw new AccountConflictError();

  const id = existing?.id ?? input.id ?? newPaymentAccountId();
  const now = Date.now();
  const credentialsEnc = await seal(env, JSON.stringify(input.creds), id);
  const webhookSecretEnc = input.webhookSecret ? await seal(env, input.webhookSecret, `${id}#webhook`) : null;
  const currencies = JSON.stringify(description.currencies.map((c) => c.toUpperCase()));
  const capabilities = JSON.stringify(input.capabilities);
  const label = description.label.slice(0, 200);

  if (existing) {
    await env.DB.prepare(
      `UPDATE payment_accounts
          SET credential_kind = ?, credentials_enc = ?, access_expires_at = ?, refresh_expires_at = ?,
              refresh_lock_until = NULL, webhook_secret_enc = ?, provider_webhook_id = ?, status = 'active', last_error = NULL,
              currencies_json = ?, capabilities_json = ?, connected_by_user_id = ?, updated_at = ?
        WHERE id = ? AND organization_id = ?`,
    )
      // `display_label` is left alone: a reconnect must not wipe the name the author gave it.
      .bind(
        input.credentialKind,
        credentialsEnc,
        input.accessExpiresAt,
        input.refreshExpiresAt,
        webhookSecretEnc,
        input.providerWebhookId,
        currencies,
        capabilities,
        input.userId,
        now,
        id,
        input.orgId,
      )
      .run();
  } else {
    try {
      await env.DB.prepare(
        `INSERT INTO payment_accounts
           (id, organization_id, provider, credential_kind, environment, provider_account_id, display_label,
            credentials_enc, access_expires_at, refresh_expires_at, webhook_secret_enc, provider_webhook_id,
            status, currencies_json, capabilities_json, connected_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          input.orgId,
          input.provider,
          input.credentialKind,
          description.environment,
          description.providerAccountId,
          label,
          credentialsEnc,
          input.accessExpiresAt,
          input.refreshExpiresAt,
          webhookSecretEnc,
          input.providerWebhookId,
          currencies,
          capabilities,
          input.userId,
          now,
          now,
        )
        .run();
    } catch (err) {
      // Two connects of the same account raced and the other insert won. Once more, as an update
      // or a conflict — whichever the winner's organization makes it.
      if (isUniqueViolation(err) && attempt === 0) return upsertAccount(env, input, 1);
      throw err;
    }
  }

  const saved = await loadAccountForOrg(env, input.orgId, id);
  if (!saved) throw new Error("payment_account_save_lost");
  return saved;
}

/**
 * Disconnect: undo the grant at the gateway, then wipe what we held.
 *
 * The row stays, `disconnected`, with its credentials and webhook secret emptied — past payments
 * point at it, and the foreign key forbids deleting it while they do. The gateway side is best
 * effort: an admin asking to disconnect must not be told no because Razorpay is slow, and once the
 * sealed token is gone we could not use it anyway.
 */
export async function disconnectAccount(env: Bindings, account: PaymentAccountRow): Promise<void> {
  if (account.status !== "disconnected" && account.credentialsEnc) {
    try {
      await revokeAtProvider(env, account, await openCredentials(env, account));
    } catch (err) {
      console.warn("payment_account_revoke_failed", { accountId: account.id, provider: account.provider, ...errorInfo(err) });
    }
  }
  await env.DB.prepare(
    `UPDATE payment_accounts
        SET status = 'disconnected', credentials_enc = '', webhook_secret_enc = NULL, access_expires_at = NULL,
            refresh_expires_at = NULL, refresh_lock_until = NULL, last_error = NULL, updated_at = ?
      WHERE id = ? AND organization_id = ?`,
  )
    .bind(Date.now(), account.id, account.organizationId)
    .run();
}

/**
 * Revoke every connection an organization holds, ahead of the organization being deleted.
 *
 * The rows themselves go with the organization's cascade; this is only the gateway side, so a
 * deleted workspace does not leave a live Razorpay grant or a Stripe endpoint behind. Best effort
 * for the same reason as `disconnectAccount`.
 */
export async function revokeOrganizationPaymentAccounts(env: Bindings, orgId: string): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM payment_accounts WHERE organization_id = ? AND status != 'disconnected'`,
  )
    .bind(orgId)
    .all<AccountDbRow>();
  for (const row of results ?? []) {
    const account = rowToAccount(row);
    try {
      await revokeAtProvider(env, account, await openCredentials(env, account));
    } catch (err) {
      console.warn("payment_account_revoke_failed", { accountId: account.id, provider: account.provider, ...errorInfo(err) });
    }
  }
}

// ─────────────────────────────── token freshness ───────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FreshOptions {
  /** Refresh even though the token has not expired — it was just refused. */
  force?: boolean;
  /**
   * With `force`: the sealed credentials that were refused. If the row no longer holds them,
   * someone else has already refreshed and their token is used instead of refreshing again.
   */
  staleCredentialsEnc?: string;
  skewMs?: number;
  waitMs?: number;
}

/**
 * The account's credentials, refreshed first if they are about to expire.
 *
 * Only one request refreshes at a time, and that matters more than it looks. Cashfree and
 * Razorpay both rotate the refresh token on every refresh, so two requests refreshing
 * concurrently do not merely waste a call — the loser presents a refresh token the winner has
 * just invalidated, gets `invalid_grant`, and marks a perfectly healthy account
 * `needs_reconnect`.
 *
 * The lease is a conditional `UPDATE` on `refresh_lock_until`, judged by `meta.changes`: it
 * succeeds for exactly one caller. The same statement also requires `credentials_enc` to be the
 * value this caller read, so a caller holding stale credentials can never refresh over a newer
 * token. Everyone else re-reads the row until the winner has written, or — when the token they
 * already hold is still valid — simply uses it.
 */
export async function freshCredentials(
  env: Bindings,
  account: PaymentAccountRow,
  opts: FreshOptions = {},
): Promise<{ account: PaymentAccountRow; creds: StoredCredentials }> {
  const skew = opts.skewMs ?? REFRESH_SKEW_MS;
  const deadline = Date.now() + (opts.waitMs ?? REFRESH_WAIT_MS);
  let current = account;

  for (;;) {
    if (current.status !== "active") throw new AccountUnavailableError(current.status);
    const creds = await openCredentials(env, current);
    const refresher = current.credentialKind === "oauth" ? refresherFor(current.provider) : null;
    if (!refresher || creds.kind !== "oauth") return { account: current, creds };

    const now = Date.now();
    const stale = opts.force
      ? current.credentialsEnc === (opts.staleCredentialsEnc ?? account.credentialsEnc)
      : current.accessExpiresAt !== null && current.accessExpiresAt - now < skew;
    if (!stale) return { account: current, creds };

    const leaseUntil = now + REFRESH_LEASE_MS;
    const claim = await env.DB.prepare(
      `UPDATE payment_accounts SET refresh_lock_until = ?1
        WHERE id = ?2 AND status = 'active' AND credentials_enc = ?3
          AND (refresh_lock_until IS NULL OR refresh_lock_until < ?4)`,
    )
      .bind(leaseUntil, current.id, current.credentialsEnc, now)
      .run();
    if ((claim.meta?.changes ?? 0) === 1) {
      return refreshUnderLease(env, current, creds, leaseUntil, refresher);
    }

    // Someone else is refreshing, or already has. A token that still works is good enough for
    // this request; only an expired or refused one is worth waiting for.
    const stillValid = !opts.force && current.accessExpiresAt !== null && current.accessExpiresAt > Date.now() + 5_000;
    if (stillValid) return { account: current, creds };
    if (Date.now() >= deadline) throw new ProviderError("upstream", "token_refresh_contended");

    await sleep(REFRESH_POLL_MS);
    const reread = await loadAccountById(env, current.id);
    if (!reread) throw new AccountUnavailableError("disconnected");
    current = reread;
  }
}

async function refreshUnderLease(
  env: Bindings,
  account: PaymentAccountRow,
  creds: Extract<StoredCredentials, { kind: "oauth" }>,
  leaseUntil: number,
  refresher: NonNullable<ReturnType<typeof refresherFor>>,
): Promise<{ account: PaymentAccountRow; creds: StoredCredentials }> {
  let tokens: OAuthTokens;
  try {
    tokens = await refresher(env, account, creds);
  } catch (err) {
    if (err instanceof ProviderError && err.code === "invalid_grant") {
      await markAccountStatus(env, account.id, "needs_reconnect", RECONNECT_MESSAGE[account.provider]);
    } else {
      // Released so the next caller can try, rather than waiting out the lease.
      await env.DB.prepare(`UPDATE payment_accounts SET refresh_lock_until = NULL WHERE id = ? AND refresh_lock_until = ?`)
        .bind(account.id, leaseUntil)
        .run();
    }
    throw err;
  }

  const next: StoredCredentials = {
    kind: "oauth",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    ...((tokens.publicToken ?? creds.publicToken) ? { publicToken: tokens.publicToken ?? creds.publicToken } : {}),
  };
  const credentialsEnc = await seal(env, JSON.stringify(next), account.id);
  const now = Date.now();
  const refreshExpiresAt = tokens.refreshExpiresAt ?? account.refreshExpiresAt;

  const written = await env.DB.prepare(
    `UPDATE payment_accounts
        SET credentials_enc = ?, access_expires_at = ?, refresh_expires_at = ?, refresh_lock_until = NULL,
            last_error = NULL, updated_at = ?
      WHERE id = ? AND refresh_lock_until = ?`,
  )
    .bind(credentialsEnc, tokens.accessExpiresAt, refreshExpiresAt, now, account.id, leaseUntil)
    .run();
  if ((written.meta?.changes ?? 0) === 0) {
    /**
     * The lease was lost — only possible if this refresh outlived it. The token pair in hand is
     * still the newest one the gateway issued (the old refresh token is dead now), so it is
     * written regardless; dropping it would strand the account on a refresh token that no longer
     * works.
     */
    console.warn("payment_token_lease_lost", { accountId: account.id, provider: account.provider });
    await env.DB.prepare(
      `UPDATE payment_accounts
          SET credentials_enc = ?, access_expires_at = ?, refresh_expires_at = ?, refresh_lock_until = NULL,
              status = 'active', last_error = NULL, updated_at = ?
        WHERE id = ? AND status != 'disconnected'`,
    )
      .bind(credentialsEnc, tokens.accessExpiresAt, refreshExpiresAt, now, account.id)
      .run();
  }

  return {
    account: {
      ...account,
      credentialsEnc,
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt,
      refreshLockUntil: null,
      lastError: null,
      updatedAt: now,
    },
    creds: next,
  };
}

/**
 * Run `fn` against a working adapter for this account.
 *
 * Refreshes a token about to expire first. If the gateway still answers `unauthorized` — a token
 * revoked early, a clock that disagrees about expiry — the token is refreshed once more and `fn`
 * runs one more time; a second refusal, or a refresh answered `invalid_grant`, marks the account
 * `needs_reconnect`, which is the banner the builder shows. A restricted key has nothing to
 * refresh, so a refusal there goes straight to `needs_reconnect`.
 *
 * `fn` may run twice. Everything it calls should be safe to repeat: order creation carries an
 * idempotency key, and status reads are reads.
 */
export async function withAdapter<T>(
  env: Bindings,
  account: PaymentAccountRow,
  fn: (adapter: PaymentProviderAdapter, account: PaymentAccountRow) => Promise<T>,
): Promise<T> {
  let { account: current, creds } = await freshCredentials(env, account);
  try {
    return await fn(adapterFor(env, current, creds), current);
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    if (err.code === "invalid_grant") {
      await markAccountStatus(env, current.id, "needs_reconnect", RECONNECT_MESSAGE[current.provider]);
      throw err;
    }
    if (err.code !== "unauthorized") throw err;
    if (current.credentialKind !== "oauth") {
      await markAccountStatus(env, current.id, "needs_reconnect", RECONNECT_MESSAGE[current.provider]);
      throw err;
    }

    ({ account: current, creds } = await freshCredentials(env, current, {
      force: true,
      staleCredentialsEnc: current.credentialsEnc,
    }));
    try {
      return await fn(adapterFor(env, current, creds), current);
    } catch (retryErr) {
      if (retryErr instanceof ProviderError && (retryErr.code === "unauthorized" || retryErr.code === "invalid_grant")) {
        await markAccountStatus(env, current.id, "needs_reconnect", RECONNECT_MESSAGE[current.provider]);
      }
      throw retryErr;
    }
  }
}

/**
 * Keep OAuth tokens alive on accounts nobody is using.
 *
 * Lazy refresh only happens when a respondent pays, and a Cashfree access token lasts a day — so
 * a form that takes one payment a week would find its token expired every time, and a refresh
 * token unused for ninety days is gone for good. From the five-minute cron.
 */
export async function sweepPaymentTokens(env: Bindings, limit = 25): Promise<number> {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT * FROM payment_accounts
      WHERE status = 'active' AND credential_kind = 'oauth'
        AND access_expires_at IS NOT NULL AND access_expires_at < ?
        AND (refresh_lock_until IS NULL OR refresh_lock_until < ?)
      ORDER BY access_expires_at ASC
      LIMIT ?`,
  )
    .bind(now + SWEEP_WINDOW_MS, now, limit)
    .all<AccountDbRow>();

  let refreshed = 0;
  for (const row of results ?? []) {
    const account = rowToAccount(row);
    try {
      const fresh = await freshCredentials(env, account, { skewMs: SWEEP_WINDOW_MS, waitMs: 0 });
      if (fresh.account.credentialsEnc !== account.credentialsEnc) refreshed++;
    } catch (err) {
      console.error("payment_token_sweep_failed", { accountId: account.id, provider: account.provider, ...errorInfo(err) });
    }
  }
  return refreshed;
}
