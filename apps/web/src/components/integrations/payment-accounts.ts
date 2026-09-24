"use client";

import { useQuery } from "@tanstack/react-query";
import { isGateError } from "@repo/entitlements";
import { PAYMENT_PROVIDERS, type PaymentProviderName } from "@repo/form-schema";
import { API_ORIGIN, apiHeaders } from "@/lib/api/mutator";
import { openPaywall } from "@/stores/paywall-store";

/**
 * The organization's connected gateway accounts, as the builder reads them.
 *
 * Shared by the Integrate tab (where accounts are connected), the payment
 * block's inspector (where one is picked) and the question preview (which
 * needs to know which gateway the picked account is). One query key, so
 * connecting an account in one place is visible in the others without a
 * reload.
 *
 * The shapes restate `GET /api/payment-accounts` from
 * `apps/api/src/routes/payment-accounts.ts`; the generated client does not
 * have it yet.
 */

export type PaymentAccountStatus = "active" | "needs_reconnect" | "revoked" | "disconnected";

export interface PaymentAccount {
  id: string;
  provider: PaymentProviderName;
  credentialKind: "oauth" | "restricted_key" | "connect";
  environment: "test" | "live";
  label: string;
  /** The gateway's own id for the account, as its dashboard shows it. */
  providerAccountId: string | null;
  status: PaymentAccountStatus;
  lastError: string | null;
  currencies: string[];
  createdAt: number;
  /** How many of the organization's forms point a payment block at this account. */
  formsUsing?: number;
  /** New verified-checkout questions start on this one. At most one per organization. */
  isDefault?: boolean;
  /** Who in the organization connected it. */
  connectedBy?: { name: string | null; email: string | null } | null;
}

export interface PaymentAccountsPayload {
  accounts: PaymentAccount[];
  /** The rollout flag for this organization. False hides every verified-payment control. */
  enabled: boolean;
  providers: Record<PaymentProviderName, { configured: boolean }>;
  /**
   * The read failed, so "no accounts" here means "we don't know", not "none connected".
   *
   * A transient 5xx used to be indistinguishable from an empty list, and the inspector drew the
   * difference in red: "The account this question used is no longer connected", on a question
   * whose account was connected and working. Anything that tells an author their setup is broken
   * has to be sure first.
   */
  unavailable?: boolean;
}

export const PAYMENT_ACCOUNTS_KEY = ["payment-accounts"] as const;

/** Nothing connected and nothing offered — what a failed read is treated as. */
const DISABLED: PaymentAccountsPayload = {
  accounts: [],
  enabled: false,
  providers: { cashfree: { configured: false }, razorpay: { configured: false }, stripe: { configured: false } },
};

/**
 * Gateways whose connected accounts charge in rupees only.
 *
 * Cashfree and Razorpay are connected through partner OAuth, and international
 * collection on a linked merchant is not confirmed for either — so the builder
 * pins these to INR the way it pins a UPI block, and the API's publish check
 * refuses anything else.
 */
export const INR_ONLY_PROVIDERS: ReadonlySet<PaymentProviderName> = new Set(["cashfree", "razorpay"]);

export class PaymentAccountError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    /** `missing_permission`: the Stripe permission the key lacks. */
    public readonly permission?: string,
  ) {
    super(message);
    this.name = "PaymentAccountError";
  }
}

/**
 * A call to the account routes that keeps the error code.
 *
 * Not `customFetch`, which flattens an error to its message: the Stripe form
 * turns `full_secret_key` / `invalid_key` / `missing_permission` into its own
 * sentences, and needs the code and the permission name to do it. It still
 * sends `apiHeaders()` — a raw fetch without them acts as the signed-in admin
 * rather than the customer being impersonated — and a plan denial still opens
 * the paywall, as every other request's does.
 */
export async function paymentAccountsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = apiHeaders(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`${API_ORIGIN}${path}`, { ...init, headers, credentials: "include" });
  const raw = await res.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (res.ok) return body as T;

  if (isGateError(body)) openPaywall(body.error);
  const err = (body as { error?: { code?: string; message?: string; permission?: string } } | null)?.error;
  throw new PaymentAccountError(
    err?.code ?? "request_failed",
    err?.message ?? `Request failed: ${res.status}`,
    res.status,
    err?.permission,
  );
}

/**
 * The accounts, or `DISABLED` when they cannot be read.
 *
 * Deliberately quiet on failure. This is read passively — on opening the
 * Integrate tab, on selecting a payment question — and a 402 there would throw
 * a paywall over a screen the author did not open to buy anything, while a
 * missing route or an error would put a red toast on every visit. The routes
 * that act (connect, disconnect) are the ones that speak up.
 */
async function readAccounts(): Promise<PaymentAccountsPayload> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/payment-accounts`, { headers: apiHeaders(), credentials: "include" });
    if (!res.ok) return { ...DISABLED, unavailable: true };
    const body = (await res.json()) as Partial<PaymentAccountsPayload>;
    const providers = { ...DISABLED.providers, ...(body.providers ?? {}) };
    return {
      enabled: body.enabled === true,
      providers,
      accounts: (Array.isArray(body.accounts) ? body.accounts : []).filter(
        (a): a is PaymentAccount =>
          typeof a?.id === "string" &&
          (PAYMENT_PROVIDERS as readonly string[]).includes(a.provider) &&
          // A disconnected row is history kept for old payments, not a connection.
          a.status !== "disconnected",
      ),
    };
  } catch {
    return { ...DISABLED, unavailable: true };
  }
}

export function usePaymentAccounts({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: PAYMENT_ACCOUNTS_KEY,
    queryFn: readAccounts,
    enabled,
    staleTime: 30_000,
    // Connecting happens in another tab; coming back to this one should show the new account.
    refetchOnWindowFocus: true,
  });
}

/**
 * How an account is named wherever one is picked: a name to read, and a quieter
 * line that tells two accounts apart.
 *
 * A freshly connected account is labelled "Razorpay acc_SXSV…" because the
 * gateway hands back nothing friendlier. That label is shown as "Razorpay
 * account", with the id moved to the second line, until the author names it.
 */
export function accountDisplay(account: PaymentAccount, providerLabel: string): { name: string; detail: string | null } {
  const id = account.providerAccountId;
  const auto = !!id && account.label === `${providerLabel} ${id}`;
  // The tail of the id is enough to tell two apart; the whole thing is on the account card.
  const tail = id ? `ending ${id.slice(-5)}` : null;
  if (auto) return { name: `${providerLabel} account`, detail: tail };
  return { name: account.label, detail: tail ? `${providerLabel} · ${tail}` : providerLabel };
}
