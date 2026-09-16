import { PAYMENT_PROVIDERS, type PaymentProviderName } from "./payment-link";

/**
 * A payment answer, taken apart into the columns a reconciliation needs.
 *
 * `displayAnswer` renders a payment as one sentence — "Paid ₹499 · verified" —
 * which is right for reading a response and wrong for reconciling a month of
 * them. Nobody can sort a spreadsheet by the word "verified" buried in a
 * sentence, total an amount that shares a cell with a currency symbol, or
 * VLOOKUP a gateway's payment id against its own export. So every surface that
 * lays responses out as a table adds these four cells after the payment's own
 * column: the server's CSV, XLSX and feed (`response-table.ts`), the `/v1`
 * export (`exports.ts`), and the builder's client-side CSV. One function, so
 * the file downloaded from the results screen and the file the API produces
 * cannot disagree about what a column holds.
 *
 * Only the answer is read — never the `respondent_payments` record. That keeps
 * the exports one query as they are, and it is also the honest source: the
 * answer is what the form recorded, and a verified one is only ever written by
 * the server from a record the gateway confirmed.
 */

/** Column suffixes, in the order the cells are produced. */
export const PAYMENT_COLUMN_SUFFIXES = ["Payment status", "Amount", "Currency", "Gateway payment ID"] as const;

/**
 * The states a results table distinguishes.
 *
 * "paid" alone is not one of them, deliberately. A gateway-confirmed payment
 * and a button somebody pressed must never share a label in a column someone
 * filters on — that is the reconciliation problem verified payments exist to
 * end. For the same reason a sandbox confirmation has its own: a published
 * form on a test-mode account accepts public test cards, and "paid · verified"
 * on one of those would be a seat nobody paid for.
 */
export type PaymentStatusLabel = "paid · verified" | "paid · test mode" | "paid · unverified" | "refunded" | "pending";

export interface PaymentDetails {
  status: PaymentStatusLabel;
  /** True only for `method: "gateway"` with `verified: true` — both written only by the server. */
  verified: boolean;
  /** Verified by an account in test mode: no real money moved. */
  testMode: boolean;
  amount?: number;
  currency?: string;
  provider?: PaymentProviderName;
  /** The gateway's own payment id. Absent for manual payments, whatever the client sent. */
  paymentId?: string;
  /** Our `respondent_payments` id, for a verified payment. */
  paymentRecordId?: string;
  paidAt?: number;
  /** A manual payment's `CF-…` note code. */
  reference?: string;
}

/**
 * Read a stored payment answer. Null when there is nothing there, or when the
 * value is not shaped like a payment at all — a retired column can hold
 * anything, and a malformed cell should read as empty rather than throw.
 */
export function readPaymentAnswer(value: unknown, fallbackCurrency?: string): PaymentDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as {
    status?: unknown;
    method?: unknown;
    verified?: unknown;
    refunded?: unknown;
    amount?: unknown;
    currency?: unknown;
    provider?: unknown;
    paymentId?: unknown;
    paymentRecordId?: unknown;
    paidAt?: unknown;
    reference?: unknown;
    testMode?: unknown;
  };
  if (p.status !== "paid" && p.status !== "pending") return null;

  const verified = p.method === "gateway" && p.verified === true;
  const testMode = verified && p.testMode === true;
  const status: PaymentStatusLabel =
    verified && p.refunded === true
      ? "refunded"
      : p.status === "paid"
        ? verified
          ? testMode
            ? "paid · test mode"
            : "paid · verified"
          : "paid · unverified"
        : "pending";

  const currency =
    typeof p.currency === "string" && p.currency ? p.currency.toUpperCase() : fallbackCurrency?.toUpperCase();
  const provider = PAYMENT_PROVIDERS.find((name) => name === p.provider);

  return {
    status,
    verified,
    testMode,
    ...(typeof p.amount === "number" && Number.isFinite(p.amount) ? { amount: p.amount } : {}),
    ...(currency ? { currency } : {}),
    ...(verified && provider ? { provider } : {}),
    /*
     * A manual answer may carry a `paymentId` too — the validator has always
     * accepted whatever the browser sent there. Under a heading that says
     * "Gateway payment ID" that would be an unverified string passed off as
     * the gateway's, so it is shown only when the gateway wrote it.
     */
    ...(verified && typeof p.paymentId === "string" && p.paymentId ? { paymentId: p.paymentId } : {}),
    ...(verified && typeof p.paymentRecordId === "string" ? { paymentRecordId: p.paymentRecordId } : {}),
    ...(typeof p.paidAt === "number" ? { paidAt: p.paidAt } : {}),
    ...(typeof p.reference === "string" && p.reference ? { reference: p.reference } : {}),
  };
}

/** The four derived headers for a payment column whose own header is `base`. */
export function paymentColumnTitles(base: string): string[] {
  return PAYMENT_COLUMN_SUFFIXES.map((suffix) => `${base} — ${suffix}`);
}

/**
 * The four derived cells, in `PAYMENT_COLUMN_SUFFIXES` order. All empty when
 * the question was not answered — the same "nothing is there" every other
 * empty cell in these tables uses.
 *
 * The amount is a bare number (`499`, `19.99`) so a spreadsheet can sum it;
 * the currency has its own cell for the same reason.
 */
export function paymentCells(value: unknown, fallbackCurrency?: string): string[] {
  const details = readPaymentAnswer(value, fallbackCurrency);
  if (!details) return ["", "", "", ""];
  return [
    details.status,
    details.amount !== undefined ? String(details.amount) : "",
    details.currency ?? "",
    details.paymentId ?? "",
  ];
}

/**
 * Where the admin opens this payment in their own gateway, or null when the
 * gateway has no per-payment address we can build.
 *
 * Stripe keeps test-mode objects under `/test/`, and a live link to a test
 * payment lands on "No such payment" — so the environment is passed where it
 * is known (the payment record carries it; the answer does not). Cashfree's
 * merchant dashboard has no stable per-payment deep link, so it opens the
 * transactions list, where the order id is searchable.
 */
export function paymentDashboardUrl(
  provider: PaymentProviderName,
  paymentId: string | null | undefined,
  environment?: "test" | "live",
): string | null {
  switch (provider) {
    case "stripe":
      return paymentId
        ? `https://dashboard.stripe.com/${environment === "test" ? "test/" : ""}payments/${encodeURIComponent(paymentId)}`
        : null;
    case "razorpay":
      return paymentId ? `https://dashboard.razorpay.com/app/payments/${encodeURIComponent(paymentId)}` : null;
    case "cashfree":
      return "https://merchant.cashfree.com/merchants/pg/transactions";
  }
}
