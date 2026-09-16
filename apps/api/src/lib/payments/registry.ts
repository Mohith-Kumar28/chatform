import type { Bindings } from "../../env.js";
import { cashfreeConfigured, cashfreeRefresh, cashfreeRevoke, createCashfreeAdapter } from "./cashfree.js";
import type { OAuthTokens } from "./oauth-state.js";
import { createRazorpayAdapter, razorpayConfigured, razorpayRefresh, razorpayRevoke } from "./razorpay.js";
import { createStripeAdapter, deleteStripeWebhook, type StripeAuth } from "./stripe.js";
import { ProviderError, type PaymentAccountRow, type PaymentProvider, type PaymentProviderAdapter } from "./types.js";

/**
 * From a stored account to something that can charge on it.
 *
 * The one place that knows which credential shape belongs to which gateway. Everything above
 * `accounts.ts` holds a `PaymentAccountRow` and an adapter, and never the decrypted credential
 * itself.
 */

/**
 * What `credentials_enc` opens to. Discriminated by `kind` so a row whose `credential_kind`
 * column and sealed JSON disagree is caught rather than half-used.
 */
export type StoredCredentials =
  | {
      kind: "oauth";
      accessToken: string;
      refreshToken: string;
      /** Razorpay only: Checkout's publishable key. */
      publicToken?: string | null;
    }
  | { kind: "restricted_key"; key: string }
  /** Reserved for Stripe Connect: the platform key is a worker secret, only the account id is stored. */
  | { kind: "connect"; accountId: string };

export function adapterFor(env: Bindings, account: PaymentAccountRow, creds: StoredCredentials): PaymentProviderAdapter {
  switch (account.provider) {
    case "stripe":
      return createStripeAdapter(stripeAuthFor(env, creds), account.environment);
    case "cashfree": {
      if (creds.kind !== "oauth") throw new ProviderError("bad_request", "credential_kind_mismatch");
      return createCashfreeAdapter(env, {
        accessToken: creds.accessToken,
        refreshToken: creds.refreshToken,
        merchantId: account.providerAccountId ?? "",
      });
    }
    case "razorpay": {
      if (creds.kind !== "oauth" || !creds.publicToken) throw new ProviderError("bad_request", "credential_kind_mismatch");
      return createRazorpayAdapter(env, {
        accessToken: creds.accessToken,
        refreshToken: creds.refreshToken,
        publicToken: creds.publicToken,
        accountId: account.providerAccountId ?? "",
      });
    }
  }
}

export function stripeAuthFor(env: Bindings, creds: StoredCredentials): StripeAuth {
  if (creds.kind === "restricted_key") return { kind: "restricted_key", key: creds.key };
  if (creds.kind === "connect") {
    if (!env.STRIPE_PLATFORM_SECRET_KEY) throw new ProviderError("bad_request", "stripe_connect_not_configured");
    return { kind: "connect", platformKey: env.STRIPE_PLATFORM_SECRET_KEY, accountId: creds.accountId };
  }
  throw new ProviderError("bad_request", "credential_kind_mismatch");
}

/** How to renew an OAuth token for this gateway, or null where tokens do not expire. */
export function refresherFor(
  provider: PaymentProvider,
): ((env: Bindings, account: PaymentAccountRow, creds: Extract<StoredCredentials, { kind: "oauth" }>) => Promise<OAuthTokens>) | null {
  switch (provider) {
    case "cashfree":
      return (env, account, creds) => cashfreeRefresh(env, creds.refreshToken, account.providerAccountId);
    case "razorpay":
      return (env, account, creds) =>
        razorpayRefresh(env, creds.refreshToken, { accountId: account.providerAccountId, publicToken: creds.publicToken });
    case "stripe":
      return null;
  }
}

/**
 * Undo the connection at the gateway: revoke the grant, or delete the webhook endpoint we made.
 * Throws on failure; callers that must not be blocked by a gateway outage catch it.
 */
export async function revokeAtProvider(env: Bindings, account: PaymentAccountRow, creds: StoredCredentials): Promise<void> {
  switch (account.provider) {
    case "cashfree":
      if (account.providerAccountId) await cashfreeRevoke(env, account.providerAccountId);
      return;
    case "razorpay":
      if (creds.kind === "oauth") {
        await razorpayRevoke(env, creds.refreshToken, "refresh_token").catch(() => undefined);
        await razorpayRevoke(env, creds.accessToken, "access_token");
      }
      return;
    case "stripe":
      if (account.providerWebhookId) await deleteStripeWebhook(stripeAuthFor(env, creds), account.providerWebhookId);
      return;
  }
}

/** Whether the worker holds what it needs to connect this gateway at all. */
export function providerConfigured(env: Bindings, provider: PaymentProvider): boolean {
  switch (provider) {
    case "cashfree":
      return cashfreeConfigured(env);
    case "razorpay":
      return razorpayConfigured(env);
    case "stripe":
      // Nothing platform-side: the admin brings the key.
      return true;
  }
}
