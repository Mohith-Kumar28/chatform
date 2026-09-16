import { describe, expect, it } from "vitest";
import {
  AnswerValue,
  Block as BlockSchema,
  FormDoc,
  currencyExponent,
  displayAnswer,
  fromMinorUnits,
  leadFormFixture,
  lintFormDoc,
  providerMinMinor,
  resolvePaymentAmount,
  toMinorUnits,
  toPublicBlock,
  validateAnswer,
  type SettledPayment,
} from "../src/index";

/**
 * Verified gateway payments, as far as the schema package can see them.
 *
 * The one property that matters most is tested first and from every angle: a
 * `gateway` block cannot be answered by anything the client sends. The gateway
 * itself, the webhook and the session all live in the API; what lives here is
 * the lock they all depend on.
 */

const gatewayBlock = (over: Record<string, unknown> = {}) =>
  BlockSchema.parse({
    id: "blk_gw000001",
    ref: "pay",
    title: "Pay the registration fee",
    type: "payment",
    required: true,
    method: "gateway",
    amountMode: "fixed",
    amount: 499,
    currency: "INR",
    paymentAccountId: "pac_test0001",
    ...over,
  });

const settled: SettledPayment = {
  recordId: "rpay_abc123",
  provider: "razorpay",
  providerPaymentId: "pay_Q1w2E3r4",
  amountMinor: 49900,
  currency: "INR",
  paidAt: 1_790_000_000_000,
};

describe("minor units", () => {
  it("converts two-decimal currencies without floating-point drift", () => {
    expect(toMinorUnits(19.99, "USD")).toBe(1999);
    expect(toMinorUnits(499, "INR")).toBe(49900);
    expect(toMinorUnits(0.29, "EUR")).toBe(29);
    // 1.005 is stored as 1.00499999…; the price someone typed is what rounds.
    expect(toMinorUnits(1.005, "USD")).toBe(101);
    expect(fromMinorUnits(1999, "USD")).toBe(19.99);
  });

  it("knows zero-decimal currencies", () => {
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("jpy")).toBe(0);
    expect(toMinorUnits(500, "JPY")).toBe(500);
    expect(fromMinorUnits(500, "JPY")).toBe(500);
  });

  it("knows three-decimal currencies", () => {
    expect(currencyExponent("KWD")).toBe(3);
    expect(toMinorUnits(1.5, "KWD")).toBe(1500);
    expect(toMinorUnits(12.345, "KWD")).toBe(12345);
    expect(fromMinorUnits(12345, "KWD")).toBe(12.345);
  });

  it("states gateway minimums in minor units", () => {
    expect(providerMinMinor("INR")).toBe(100);
    expect(providerMinMinor("USD")).toBe(50);
    expect(providerMinMinor("GBP")).toBe(30);
    expect(providerMinMinor("SGD")).toBe(50);
    expect(providerMinMinor("JPY")).toBe(1);
  });
});

describe("resolvePaymentAmount", () => {
  it("uses the fixed amount", () => {
    expect(resolvePaymentAmount(gatewayBlock(), {})).toEqual({
      ok: true,
      amountMinor: 49900,
      amount: 499,
      currency: "INR",
    });
  });

  it("refuses a fixed block with no amount", () => {
    expect(resolvePaymentAmount(gatewayBlock({ amount: undefined }), {})).toEqual({ ok: false, code: "payment_no_amount" });
    expect(resolvePaymentAmount(gatewayBlock({ amount: 0 }), {})).toEqual({ ok: false, code: "payment_bad_amount" });
  });

  it("reads a variable amount from the session's variables", () => {
    const block = gatewayBlock({ amountMode: "variable", amount: undefined, amountVariable: "total" });
    expect(resolvePaymentAmount(block, { total: 1250 })).toMatchObject({ ok: true, amountMinor: 125000, amount: 1250 });
  });

  it("coerces a numeric string, because variables set from text arrive as text", () => {
    const block = gatewayBlock({ amountMode: "variable", amount: undefined, amountVariable: "total" });
    expect(resolvePaymentAmount(block, { total: " 1,250.50 " })).toMatchObject({ ok: true, amountMinor: 125050 });
  });

  it("refuses a missing, empty or non-numeric variable rather than charging nothing", () => {
    const block = gatewayBlock({ amountMode: "variable", amount: undefined, amountVariable: "total" });
    expect(resolvePaymentAmount(block, {})).toEqual({ ok: false, code: "payment_no_amount" });
    expect(resolvePaymentAmount(block, { total: "" })).toEqual({ ok: false, code: "payment_no_amount" });
    expect(resolvePaymentAmount(block, { total: "lots" })).toEqual({ ok: false, code: "payment_bad_amount" });
    expect(resolvePaymentAmount(block, { total: -5 })).toEqual({ ok: false, code: "payment_bad_amount" });
    expect(resolvePaymentAmount(block, { total: Number.POSITIVE_INFINITY })).toEqual({ ok: false, code: "payment_bad_amount" });
    expect(resolvePaymentAmount(gatewayBlock({ amountMode: "variable", amount: undefined }), { total: 5 })).toEqual({
      ok: false,
      code: "payment_no_amount",
    });
  });

  it("enforces minAmount and maxAmount", () => {
    const block = gatewayBlock({
      amountMode: "variable",
      amount: undefined,
      amountVariable: "total",
      minAmount: 100,
      maxAmount: 5000,
    });
    expect(resolvePaymentAmount(block, { total: 99 })).toEqual({ ok: false, code: "payment_amount_out_of_range" });
    expect(resolvePaymentAmount(block, { total: 5001 })).toEqual({ ok: false, code: "payment_amount_out_of_range" });
    expect(resolvePaymentAmount(block, { total: 100 })).toMatchObject({ ok: true });
    expect(resolvePaymentAmount(block, { total: 5000 })).toMatchObject({ ok: true });
  });

  it("refuses an amount below what a gateway will charge", () => {
    expect(resolvePaymentAmount(gatewayBlock({ amount: 0.5 }), {})).toEqual({ ok: false, code: "payment_bad_amount" });
    expect(resolvePaymentAmount(gatewayBlock({ amount: 0.001, currency: "USD" }), {})).toEqual({
      ok: false,
      code: "payment_bad_amount",
    });
  });
});

describe("validateAnswer on a gateway block", () => {
  it("refuses a forged paid answer, however convincing", () => {
    const block = gatewayBlock();
    const forgeries: unknown[] = [
      { status: "paid", verified: true },
      { status: "paid", method: "gateway", verified: true, provider: "razorpay", paymentId: "pay_x", amount: 499 },
      { status: "paid", method: "gateway", verified: true, paymentRecordId: "rpay_abc123" },
      { status: "pending" },
      "paid",
      true,
    ];
    for (const raw of forgeries) {
      const res = validateAnswer(block, raw);
      expect(res.ok, JSON.stringify(raw)).toBe(false);
      expect(res.code).toBe("payment_unverified");
      expect(res.hint).toBe("Use the Pay button to complete payment.");
    }
  });

  it("sends a required block's empty answer to the Pay button too", () => {
    expect(validateAnswer(gatewayBlock(), null)).toMatchObject({ ok: false, code: "payment_unverified" });
    expect(validateAnswer(gatewayBlock(), undefined)).toMatchObject({ ok: false, code: "payment_unverified" });
  });

  it("still lets an optional payment be skipped, which claims nothing", () => {
    expect(validateAnswer(gatewayBlock({ required: false }), null)).toEqual({ ok: true, value: undefined });
    // But not answered.
    expect(validateAnswer(gatewayBlock({ required: false }), { status: "paid" }).code).toBe("payment_unverified");
  });

  it("builds the canonical value from the settled payment alone", () => {
    const res = validateAnswer(gatewayBlock(), null, { settledPayment: settled });
    expect(res.ok).toBe(true);
    expect(res.value).toEqual({
      status: "paid",
      method: "gateway",
      verified: true,
      provider: "razorpay",
      paymentRecordId: "rpay_abc123",
      paymentId: "pay_Q1w2E3r4",
      amount: 499,
      currency: "INR",
      paidAt: 1_790_000_000_000,
    });
    // It is a value the answer schema accepts, so it survives storage.
    expect(AnswerValue.safeParse(res.value).success).toBe(true);
  });

  it("ignores whatever the client sent alongside a settled payment", () => {
    const res = validateAnswer(
      gatewayBlock(),
      { status: "paid", amount: 1, paymentId: "pay_forged", provider: "stripe" },
      { settledPayment: { ...settled, providerPaymentId: null, currency: "usd", amountMinor: 1999 } },
    );
    expect(res.value).toMatchObject({ amount: 19.99, currency: "USD", provider: "razorpay", paymentId: undefined });
  });
});

describe("validateAnswer on manual payment blocks is unchanged", () => {
  it("still records a link payment as unverified, and ignores a settled payment it has no use for", () => {
    const block = BlockSchema.parse({
      id: "blk_link0001", ref: "pay", title: "Pay", type: "payment", method: "link", url: "https://rzp.io/l/x",
    });
    const raw = { status: "paid", method: "gateway", verified: true, reference: "CF-AB23CD" };
    const res = validateAnswer(block, raw, { settledPayment: settled });
    expect(res.ok).toBe(true);
    expect(res.value).toEqual({
      status: "paid",
      method: undefined,
      verified: false,
      reference: "CF-AB23CD",
      paymentId: undefined,
      amount: undefined,
      currency: "USD",
    });
  });
});

describe("toPublicBlock for a gateway block", () => {
  it("never publishes the account id, a url or a UPI ID", () => {
    const pub = toPublicBlock(gatewayBlock({ url: "https://rzp.io/l/x", upiId: "acme@okhdfcbank" }));
    expect(pub.paymentMethod).toBe("gateway");
    expect(pub.amount).toBe(499);
    expect(pub.currency).toBe("INR");
    expect("paymentAccountId" in pub).toBe(false);
    expect(JSON.stringify(pub)).not.toContain("pac_test0001");
    expect(pub.url).toBeUndefined();
    expect(pub.upiId).toBeUndefined();
    expect(pub.upiUri).toBeUndefined();
    // The document cannot know which gateway an account is; the API fills it in.
    expect(pub.paymentProvider).toBeUndefined();
  });

  it("publishes no amount for a variable block", () => {
    const pub = toPublicBlock(gatewayBlock({ amountMode: "variable", amount: undefined, amountVariable: "total" }));
    expect(pub.amount).toBeUndefined();
  });
});

describe("displayAnswer tells verified and unverified payments apart", () => {
  const block = gatewayBlock();

  it("says a gateway payment is verified", () => {
    const value = validateAnswer(block, null, { settledPayment: settled }).value;
    expect(displayAnswer(block, value)).toBe("Paid ₹499 · verified");
  });

  it("never calls a sandbox confirmation verified", () => {
    const value = validateAnswer(block, null, { settledPayment: { ...settled, testMode: true } }).value;
    expect(value).toMatchObject({ verified: true, testMode: true });
    expect(AnswerValue.safeParse(value).success).toBe(true);
    expect(displayAnswer(block, value)).toBe("Paid ₹499 · test mode");
  });

  it("says a refunded gateway payment was refunded", () => {
    const value = { ...(validateAnswer(block, null, { settledPayment: settled }).value as object), refunded: true };
    expect(displayAnswer(block, value)).toBe("Refunded ₹499");
  });

  it("does not call a client-shaped 'verified' answer verified on a manual block", () => {
    const link = BlockSchema.parse({
      id: "blk_link0002", ref: "pay", title: "Pay", type: "payment", method: "link", currency: "INR",
    });
    expect(displayAnswer(link, { status: "paid", verified: false, amount: 499, reference: "CF-XY" })).toBe(
      "Paid ₹499 · unverified · ref CF-XY",
    );
  });
});

describe("lint for gateway payment blocks", () => {
  const docWith = (over: Record<string, unknown> = {}, signIn = true) => {
    const doc = FormDoc.parse({
      ...leadFormFixture,
      variables: [{ name: "total", type: "number", initial: 0 }],
      settings: { requireAuth: { enabled: signIn, method: "google" } },
    });
    doc.blocks.push(gatewayBlock(over) as never);
    return doc;
  };
  const errors = (doc: ReturnType<typeof docWith>) =>
    lintFormDoc(doc).filter((i) => i.level === "error").map((i) => i.code);

  it("passes a fully configured block", () => {
    expect(errors(docWith())).toEqual([]);
  });

  it("does not ask a gateway block for a payment link or a UPI ID", () => {
    const codes = errors(docWith());
    expect(codes).not.toContain("payment_no_link");
    expect(codes).not.toContain("payment_no_upi_id");
  });

  it("does not ask for sign-in", () => {
    /*
     * Taking a payment and knowing who paid are separate decisions: a form that
     * sells a named seat should turn sign-in on, a tip jar should not, and lint
     * has no way to tell which this is. It used to refuse to publish without
     * it, which made every donation form a sign-in form.
     */
    expect(errors(docWith({}, false))).toEqual([]);
    expect(lintFormDoc(docWith({}, false)).map((i) => i.code)).not.toContain("payment_requires_sign_in");
  });

  it("requires a connected account", () => {
    expect(errors(docWith({ paymentAccountId: undefined }))).toContain("payment_gateway_no_account");
  });

  it("requires a positive fixed amount the gateways will accept", () => {
    expect(errors(docWith({ amount: undefined }))).toContain("payment_bad_amount");
    expect(errors(docWith({ amount: 0 }))).toContain("payment_bad_amount");
    expect(errors(docWith({ amount: 0.5 }))).toContain("payment_bad_amount");
  });

  it("requires a variable amount to name a variable that exists", () => {
    expect(errors(docWith({ amountMode: "variable", amount: undefined }))).toContain("payment_no_amount_variable");
    expect(errors(docWith({ amountMode: "variable", amount: undefined, amountVariable: "nope" }))).toContain(
      "payment_no_amount_variable",
    );
    expect(errors(docWith({ amountMode: "variable", amount: undefined, amountVariable: "total" }))).toEqual([]);
  });

  it("refuses bounds that exclude every amount", () => {
    expect(
      errors(docWith({ amountMode: "variable", amount: undefined, amountVariable: "total", minAmount: 10, maxAmount: 5 })),
    ).toContain("payment_bad_amount");
  });
});
