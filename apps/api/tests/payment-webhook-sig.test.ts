import { describe, it, expect } from "vitest";
import {
  verifyStripeWebhook,
  verifyCashfreeWebhook,
  verifyRazorpayWebhook,
  parseRazorpayEvent,
  hmacHex,
} from "../src/lib/payments/webhook-sig.js";

/**
 * Gateway webhook signatures.
 *
 * Every expected signature in this file is computed with WebCrypto directly, not with the helpers
 * under test — the Dodo verifier once signed the wrong bytes and its tests agreed with it because
 * both sides used the same function. Razorpay's vector is copied verbatim from the official
 * `razorpay-node` SDK's own test suite, so at least one scheme is pinned to bytes the vendor
 * published rather than bytes we produced.
 */

const enc = new TextEncoder();

async function rawHmac(key: string, message: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

const headers = (h: Record<string, string>) => new Headers(h);

describe("Razorpay", () => {
  // https://github.com/razorpay/razorpay-node/blob/master/test/utils/razorpay-utils.spec.js
  const SDK_BODY = '{"a":1,"b":2,"c":{"d":3}}';
  const SDK_SECRET = "123456";
  const SDK_SIGNATURE = "2fe04e22977002e6c7cb553adab8b460cb9e2a4970d5953cb27a8472752e3bbc";

  it("matches the vector published in Razorpay's own SDK tests", async () => {
    expect(hex(await rawHmac(SDK_SECRET, SDK_BODY))).toBe(SDK_SIGNATURE);
    expect(await hmacHex(SDK_SECRET, SDK_BODY)).toBe(SDK_SIGNATURE);
    const result = await verifyRazorpayWebhook(
      { RAZORPAY_WEBHOOK_SECRET: SDK_SECRET },
      headers({ "x-razorpay-signature": SDK_SIGNATURE, "x-razorpay-event-id": "evt_sdk" }),
      SDK_BODY,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a tampered body, a wrong signature and a missing header without throwing", async () => {
    const env = { RAZORPAY_WEBHOOK_SECRET: SDK_SECRET };
    const tampered = await verifyRazorpayWebhook(env, headers({ "x-razorpay-signature": SDK_SIGNATURE }), SDK_BODY.replace("1", "9"));
    expect(tampered).toEqual({ ok: false, reason: "signature_mismatch", status: 401 });
    expect((await verifyRazorpayWebhook(env, headers({ "x-razorpay-signature": "sdfafds" }), SDK_BODY)).ok).toBe(false);
    expect(await verifyRazorpayWebhook(env, headers({}), SDK_BODY)).toMatchObject({ ok: false, status: 400 });
    expect(await verifyRazorpayWebhook({}, headers({ "x-razorpay-signature": SDK_SIGNATURE }), SDK_BODY)).toMatchObject({ ok: false });
  });

  it("answers 400 for a correctly signed body that is not JSON", async () => {
    const body = "not json {";
    const sig = hex(await rawHmac("s3cret", body));
    expect(await verifyRazorpayWebhook({ RAZORPAY_WEBHOOK_SECRET: "s3cret" }, headers({ "x-razorpay-signature": sig }), body)).toEqual({
      ok: false,
      reason: "malformed_body",
      status: 400,
    });
  });

  it("reads a captured payment and a revoked app", async () => {
    const captured = JSON.stringify({
      entity: "event",
      account_id: "acc_merchant1",
      event: "payment.captured",
      payload: {
        payment: { entity: { id: "pay_1", order_id: "order_1", amount: 49900, currency: "INR", status: "captured", notes: { record_id: "rpay_abc" } } },
      },
      created_at: 1700000000,
    });
    const sig = hex(await rawHmac("whsec", captured));
    const result = await verifyRazorpayWebhook(
      { RAZORPAY_WEBHOOK_SECRET: "whsec" },
      headers({ "x-razorpay-signature": sig, "x-razorpay-event-id": "evt_42" }),
      captured,
    );
    expect(result.ok && result.events[0]).toMatchObject({
      eventId: "evt_42",
      type: "paid",
      providerAccountId: "acc_merchant1",
      providerOrderId: "order_1",
      ourRecordId: "rpay_abc",
      providerPaymentId: "pay_1",
      amountMinor: 49900,
      currency: "INR",
    });

    const revoked = parseRazorpayEvent({ event: "account.app.authorization_revoked", account_id: "acc_gone", created_at: 1 }, "evt_r");
    expect(revoked).toMatchObject({ type: "revoked", providerAccountId: "acc_gone", eventId: "evt_r" });

    // No delivery id: derived from the bytes, so a retry of the same delivery dedupes.
    const a = parseRazorpayEvent({ event: "payment.failed" }, null, '{"event":"payment.failed"}');
    const b = parseRazorpayEvent({ event: "payment.failed" }, null, '{"event":"payment.failed"}');
    expect(a.eventId).toBe(b.eventId);
    expect(a.type).toBe("failed");
  });
});

describe("Stripe", () => {
  const secret = "whsec_test_stripe_endpoint_secret";
  const now = 1_760_000_000;
  const session = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          client_reference_id: "rpay_rec1",
          payment_status: "paid",
          payment_intent: "pi_1",
          amount_total: 1999,
          currency: "usd",
          ...over,
        },
      },
    });

  async function signed(body: string, t = now) {
    return `t=${t},v1=${hex(await rawHmac(secret, `${t}.${body}`))}`;
  }

  it("accepts a genuine delivery and reads the session", async () => {
    const body = session();
    const result = await verifyStripeWebhook(secret, headers({ "stripe-signature": await signed(body) }), body, now);
    expect(result.ok).toBe(true);
    expect(result.ok && result.events[0]).toMatchObject({
      eventId: "evt_1",
      type: "paid",
      providerOrderId: "cs_test_1",
      ourRecordId: "rpay_rec1",
      providerPaymentId: "pi_1",
      amountMinor: 1999,
      currency: "USD",
    });
  });

  it("accepts any of several v1 signatures, as during a secret roll", async () => {
    const body = session();
    const good = hex(await rawHmac(secret, `${now}.${body}`));
    const header = `t=${now},v1=${"0".repeat(64)},v0=${"f".repeat(64)},v1=${good}`;
    expect((await verifyStripeWebhook(secret, headers({ "stripe-signature": header }), body, now)).ok).toBe(true);
  });

  it("refuses stale, future, tampered and malformed deliveries", async () => {
    const body = session();
    const header = await signed(body);
    expect(await verifyStripeWebhook(secret, headers({ "stripe-signature": header }), body, now + 301)).toMatchObject({
      ok: false,
      reason: "stale_timestamp",
      status: 401,
    });
    expect(await verifyStripeWebhook(secret, headers({ "stripe-signature": header }), body, now - 301)).toMatchObject({
      reason: "stale_timestamp",
    });
    expect(await verifyStripeWebhook(secret, headers({ "stripe-signature": header }), body.replace("1999", "1"), now)).toMatchObject({
      reason: "signature_mismatch",
      status: 401,
    });
    expect(await verifyStripeWebhook("whsec_other", headers({ "stripe-signature": header }), body, now)).toMatchObject({
      reason: "signature_mismatch",
    });
    for (const bad of ["garbage", "t=abc,v1=00", `t=${now}`, "=,=,,", ""]) {
      const r = await verifyStripeWebhook(secret, headers(bad ? { "stripe-signature": bad } : {}), body, now);
      expect(r.ok, bad).toBe(false);
    }
    expect(await verifyStripeWebhook(null, headers({ "stripe-signature": header }), body, now)).toMatchObject({ ok: false });
  });

  it("maps the session events and only full refunds", async () => {
    const check = async (body: string) => {
      const r = await verifyStripeWebhook(secret, headers({ "stripe-signature": await signed(body) }), body, now);
      if (!r.ok) throw new Error(r.reason);
      return r.events[0]!;
    };
    expect((await check(session({ payment_status: "unpaid" }))).type).toBe("ignored");
    expect((await check(session().replace("checkout.session.completed", "checkout.session.expired"))).type).toBe("expired");
    expect((await check(session().replace("checkout.session.completed", "checkout.session.async_payment_failed"))).type).toBe("failed");

    const refund = (refunded: boolean) =>
      JSON.stringify({
        id: "evt_r",
        type: "charge.refunded",
        data: { object: { id: "ch_1", payment_intent: "pi_1", refunded, amount: 1999, currency: "usd", metadata: { record_id: "rpay_rec1" } } },
      });
    expect(await check(refund(true))).toMatchObject({ type: "refunded", providerPaymentId: "pi_1", ourRecordId: "rpay_rec1" });
    expect((await check(refund(false))).type).toBe("ignored");
  });
});

describe("Cashfree", () => {
  const partnerKey = "cf_partner_api_key_test";
  const env = { CASHFREE_PARTNER_API_KEY: partnerKey };
  const nowMs = 1_760_000_000_000;
  const body = JSON.stringify({
    merchant: { merchant_id: "cf_merchant_1" },
    data: {
      order: { order_id: "rpay_cf1", order_amount: 499, order_currency: "INR" },
      payment: { cf_payment_id: 5114910270045, payment_status: "SUCCESS", payment_amount: 499, payment_currency: "INR" },
    },
    event_time: "2026-09-16T10:00:00+05:30",
    type: "PAYMENT_SUCCESS_WEBHOOK",
  });

  async function sign(ts: string, raw = body, key = partnerKey) {
    return b64(await rawHmac(key, `${ts}${raw}`));
  }

  it("accepts a genuine partner delivery, millisecond or second timestamps", async () => {
    for (const ts of [String(nowMs), String(Math.floor(nowMs / 1000))]) {
      const result = await verifyCashfreeWebhook(
        env,
        headers({ "x-webhook-signature": await sign(ts), "x-webhook-timestamp": ts, "x-idempotency-key": "idem_1" }),
        body,
        nowMs,
      );
      expect(result.ok, ts).toBe(true);
      expect(result.ok && result.events[0]).toMatchObject({
        eventId: "idem_1",
        type: "paid",
        providerAccountId: "cf_merchant_1",
        providerOrderId: "rpay_cf1",
        ourRecordId: "rpay_cf1",
        providerPaymentId: "5114910270045",
        amountMinor: 49900,
        currency: "INR",
      });
    }
  });

  it("refuses stale, tampered and wrongly keyed deliveries", async () => {
    const ts = String(nowMs);
    const sig = await sign(ts);
    const h = headers({ "x-webhook-signature": sig, "x-webhook-timestamp": ts });
    expect(await verifyCashfreeWebhook(env, h, body, nowMs + 5 * 60_000 + 1)).toMatchObject({ reason: "stale_timestamp", status: 401 });
    expect(await verifyCashfreeWebhook(env, h, body.replace("499", "1"), nowMs)).toMatchObject({ reason: "signature_mismatch" });
    expect(await verifyCashfreeWebhook({ CASHFREE_PARTNER_API_KEY: "other" }, h, body, nowMs)).toMatchObject({ ok: false });
    expect(await verifyCashfreeWebhook(env, headers({ "x-webhook-signature": sig, "x-webhook-timestamp": "yesterday" }), body, nowMs)).toMatchObject({
      reason: "bad_timestamp",
      status: 400,
    });
    expect(await verifyCashfreeWebhook(env, headers({ "x-webhook-timestamp": ts }), body, nowMs)).toMatchObject({ status: 400 });
  });

  it("derives the same event id for the same event when no delivery id is sent", async () => {
    const ts = String(nowMs);
    const run = async (t: string) =>
      verifyCashfreeWebhook(env, headers({ "x-webhook-signature": await sign(t), "x-webhook-timestamp": t }), body, nowMs);
    const first = await run(ts);
    const retry = await run(String(nowMs + 1000));
    expect(first.ok && retry.ok).toBe(true);
    if (first.ok && retry.ok) expect(first.events[0]!.eventId).toBe(retry.events[0]!.eventId);
  });

  it("reads failures and successful refunds", async () => {
    const refund = JSON.stringify({
      data: { refund: { order_id: "rpay_cf1", cf_payment_id: 1, cf_refund_id: "r1", refund_status: "SUCCESS", refund_amount: 499, refund_currency: "INR" } },
      type: "REFUND_STATUS_WEBHOOK",
    });
    const ts = String(nowMs);
    const r = await verifyCashfreeWebhook(
      env,
      headers({ "x-webhook-signature": await sign(ts, refund), "x-webhook-timestamp": ts }),
      refund,
      nowMs,
    );
    expect(r.ok && r.events[0]).toMatchObject({ type: "refunded", ourRecordId: "rpay_cf1", amountMinor: 49900 });
  });
});
