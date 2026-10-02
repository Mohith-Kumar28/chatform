import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { Body, Res } from "../types/spec.js";
import type { PaymentAccount, PaymentAccounts } from "../types/index.js";

/**
 * The organization's own payment gateways: Stripe, Razorpay or Cashfree.
 *
 * Payments go straight to the account connected here; Chatform never holds the
 * money. Razorpay and Cashfree connect through the provider's own consent page,
 * so `startOAuth()` returns a URL to send a person to, not a finished account.
 */
export class PaymentAccountsResource {
  constructor(private readonly http: HttpClient) {}

  /** Connected accounts, whether payments are switched on, and which providers are available. */
  list(request?: RequestOptions) {
    return this.http.get<PaymentAccounts>("/v1/payment-accounts", undefined, request);
  }

  /** Connect Stripe with a restricted key. The key is stored encrypted and never returned. */
  connectStripe(input: Body<"/v1/payment-accounts/stripe", "post">, request?: RequestOptions) {
    return this.http.post<Res<"/v1/payment-accounts/stripe", "post">>("/v1/payment-accounts/stripe", input, request);
  }

  /** The provider's consent page, for a person to open. The account appears once they approve. */
  startOAuth(
    provider: "razorpay" | "cashfree",
    input: Body<"/v1/payment-accounts/oauth/{provider}/start", "post">,
    request?: RequestOptions,
  ) {
    return this.http.post<Res<"/v1/payment-accounts/oauth/{provider}/start", "post">>(
      `/v1/payment-accounts/oauth/${provider}/start`,
      input,
      request,
    );
  }

  /** Start Cashfree's merchant onboarding. Answers `useOAuth` when the merchant already exists. */
  onboardCashfree(input: Body<"/v1/payment-accounts/cashfree/onboard", "post">, request?: RequestOptions) {
    return this.http.post<Res<"/v1/payment-accounts/cashfree/onboard", "post">>(
      "/v1/payment-accounts/cashfree/onboard",
      input,
      request,
    );
  }

  /** Rename an account, or make it the default for new payment questions. */
  update(id: string, input: Body<"/v1/payment-accounts/{id}", "patch">, request?: RequestOptions) {
    return this.http.patch<Res<"/v1/payment-accounts/{id}", "patch">>(`/v1/payment-accounts/${id}`, input, request);
  }

  disconnect(id: string, request?: RequestOptions) {
    return this.http.delete<Res<"/v1/payment-accounts/{id}", "delete">>(`/v1/payment-accounts/${id}`, request);
  }
}

export type { PaymentAccount, PaymentAccounts };
