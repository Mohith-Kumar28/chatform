import { describe, expect, it } from "vitest";
import {
  paymentCells,
  paymentColumnTitles,
  paymentDashboardUrl,
  readPaymentAnswer,
} from "../src/index";

/**
 * The reconciliation columns a payment answer expands into.
 *
 * The point of verified payments is that a results table can tell a payment the
 * gateway confirmed from a button somebody pressed. These pin that the two never
 * share a label, and that nothing the respondent's browser could have written is
 * shown under a heading that claims it came from the gateway.
 */

const GATEWAY_PAID = {
  status: "paid",
  method: "gateway",
  verified: true,
  provider: "razorpay",
  paymentRecordId: "rpay_abc",
  paymentId: "pay_RZP123",
  amount: 499,
  currency: "INR",
  paidAt: 1_700_000_000_000,
};

describe("paymentCells", () => {
  it("splits a verified gateway payment into status, amount, currency and id", () => {
    expect(paymentCells(GATEWAY_PAID)).toEqual(["paid · verified", "499", "INR", "pay_RZP123"]);
  });

  it("labels a manual payment unverified and shows no gateway id", () => {
    // `paymentId` on a manual answer is whatever the browser sent.
    const manual = { status: "paid", method: "link", verified: false, reference: "CF-ABC123", amount: 20, paymentId: "forged" };
    expect(paymentCells(manual, "usd")).toEqual(["paid · unverified", "20", "USD", ""]);
  });

  it("never calls a forged verified flag on a manual method verified", () => {
    expect(paymentCells({ status: "paid", method: "upi", verified: true, amount: 5 })[0]).toBe("paid · unverified");
  });

  it("never calls a sandbox confirmation verified", () => {
    // A published form on a test-mode account accepts public test cards.
    expect(paymentCells({ ...GATEWAY_PAID, testMode: true })[0]).toBe("paid · test mode");
    expect(readPaymentAnswer({ ...GATEWAY_PAID, testMode: true })).toMatchObject({ verified: true, testMode: true });
    // Only the server writes `testMode`, and only on a gateway answer.
    expect(readPaymentAnswer({ status: "paid", method: "link", testMode: true })?.testMode).toBe(false);
  });

  it("marks a refund", () => {
    expect(paymentCells({ ...GATEWAY_PAID, refunded: true })[0]).toBe("refunded");
  });

  it("marks a pending payment", () => {
    expect(paymentCells({ status: "pending", method: "link" }, "INR")).toEqual(["pending", "", "INR", ""]);
  });

  it("is four empty cells for no answer, or for something that is not a payment", () => {
    for (const value of [undefined, null, "", "Paid", 12, ["paid"], { status: "weird" }]) {
      expect(paymentCells(value)).toEqual(["", "", "", ""]);
    }
  });

  it("keeps a minor-unit amount a plain number a spreadsheet can sum", () => {
    expect(paymentCells({ ...GATEWAY_PAID, amount: 19.99, currency: "usd", provider: "stripe" }).slice(1, 3)).toEqual([
      "19.99",
      "USD",
    ]);
  });
});

describe("readPaymentAnswer", () => {
  it("drops an unknown provider rather than passing it through", () => {
    expect(readPaymentAnswer({ ...GATEWAY_PAID, provider: "paypal" })?.provider).toBeUndefined();
  });
});

describe("paymentColumnTitles", () => {
  it("suffixes the payment column's own header", () => {
    expect(paymentColumnTitles("Pay (q_pay)")).toEqual([
      "Pay (q_pay) — Payment status",
      "Pay (q_pay) — Amount",
      "Pay (q_pay) — Currency",
      "Pay (q_pay) — Gateway payment ID",
    ]);
  });
});

describe("paymentDashboardUrl", () => {
  it("deep-links Stripe and Razorpay payments, and Stripe test payments under /test", () => {
    expect(paymentDashboardUrl("stripe", "pi_1")).toBe("https://dashboard.stripe.com/payments/pi_1");
    expect(paymentDashboardUrl("stripe", "pi_1", "test")).toBe("https://dashboard.stripe.com/test/payments/pi_1");
    expect(paymentDashboardUrl("razorpay", "pay_1")).toBe("https://dashboard.razorpay.com/app/payments/pay_1");
  });

  it("has nowhere to link a Stripe or Razorpay payment without an id", () => {
    expect(paymentDashboardUrl("stripe", null)).toBeNull();
    expect(paymentDashboardUrl("razorpay", undefined)).toBeNull();
  });

  it("opens Cashfree's transaction list, which has no per-payment address", () => {
    expect(paymentDashboardUrl("cashfree", "cf_1")).toMatch(/^https:\/\/merchant\.cashfree\.com\//);
  });
});
