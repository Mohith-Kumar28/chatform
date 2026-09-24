import { describe, expect, it } from "vitest";
import { Block as BlockSchema, FormDoc, lintFormDoc, resolvePaymentAmount } from "../src/index";

/**
 * A payment priced by an earlier answer: Basic 499, Pro 999, Team 1999.
 *
 * What matters is that the price follows the option, not its label, that only
 * a listed option can be charged for, and that a half-priced list cannot be
 * published.
 */

const plan = BlockSchema.parse({
  id: "blk_plan0001",
  ref: "q_plan",
  type: "single_select",
  title: "Which plan?",
  options: [
    { id: "opt_basic", label: "Basic" },
    { id: "opt_pro", label: "Pro" },
    { id: "opt_team", label: "Team" },
  ],
});

const member = BlockSchema.parse({ id: "blk_member01", ref: "q_member", type: "yes_no", title: "Are you a member?" });

const pay = (over: Record<string, unknown> = {}) =>
  BlockSchema.parse({
    id: "blk_pay00001",
    ref: "pay",
    type: "payment",
    title: "Pay",
    required: true,
    method: "gateway",
    paymentAccountId: "pac_test0001",
    currency: "INR",
    amountMode: "answer",
    priceFrom: { ref: "q_plan", prices: { opt_basic: 499, opt_pro: 999, opt_team: 1999 } },
    ...over,
  });

const docOf = (...blocks: unknown[]) =>
  FormDoc.parse({
    schemaVersion: 1,
    title: "Plans",
    blocks,
    endings: [{ id: "end_thanks01", ref: "end", title: "Thanks", kind: "success" }],
  });

describe("resolvePaymentAmount, priced by an answer", () => {
  it("charges the price of the option they picked", () => {
    const r = resolvePaymentAmount(pay() as never, {}, { q_plan: "opt_pro" });
    expect(r).toMatchObject({ ok: true, amount: 999, amountMinor: 99900, currency: "INR" });
  });

  it("prices a yes/no answer by yes and no", () => {
    const b = pay({ priceFrom: { ref: "q_member", prices: { yes: 299, no: 499 } } });
    expect(resolvePaymentAmount(b as never, {}, { q_member: true })).toMatchObject({ ok: true, amount: 299 });
    expect(resolvePaymentAmount(b as never, {}, { q_member: false })).toMatchObject({ ok: true, amount: 499 });
  });

  it("charges nothing for an answer with no price, or no answer", () => {
    expect(resolvePaymentAmount(pay() as never, {}, { q_plan: "something typed under Other" }).ok).toBe(false);
    expect(resolvePaymentAmount(pay() as never, {}, {}).ok).toBe(false);
  });

  it("reads an unknown amount mode as a fixed price rather than failing to load", () => {
    expect(pay({ amountMode: "from_the_future", amount: 10 }).amountMode).toBe("fixed");
  });
});

describe("lint, priced by an answer", () => {
  const codes = (doc: FormDoc) => lintFormDoc(doc).map((i) => i.code);

  it("passes a fully priced list asked before the payment", () => {
    expect(codes(docOf(plan, pay()))).not.toContain("payment_bad_amount");
    expect(codes(docOf(plan, pay()))).not.toContain("payment_no_price_source");
  });

  it("names the option that has no price", () => {
    const doc = docOf(plan, pay({ priceFrom: { ref: "q_plan", prices: { opt_basic: 499, opt_pro: 999 } } }));
    const issue = lintFormDoc(doc).find((i) => i.code === "payment_bad_amount");
    expect(issue?.message).toContain('"Team"');
  });

  it("refuses a question asked after the payment, or one that is not a single choice", () => {
    expect(codes(docOf(pay(), plan))).toContain("payment_no_price_source");
    const text = BlockSchema.parse({ id: "blk_text0001", ref: "q_plan", type: "short_text", title: "Plan?" });
    expect(codes(docOf(text, pay()))).toContain("payment_no_price_source");
  });

  it("accepts a yes/no question", () => {
    const b = pay({ priceFrom: { ref: "q_member", prices: { yes: 299, no: 499 } } });
    expect(codes(docOf(member, b))).not.toContain("payment_no_price_source");
  });
});

describe("price per person or item", () => {
  const party = BlockSchema.parse({ id: "blk_party001", ref: "q_party", type: "number", title: "How many?", min: 1, max: 20 });
  const perHead = (over: Record<string, unknown> = {}) =>
    pay({ amountMode: "fixed", amount: 1000, priceFrom: undefined, quantityFrom: { ref: "q_party" }, ...over });

  it("multiplies the price by the count", () => {
    expect(resolvePaymentAmount(perHead() as never, {}, { q_party: 3 })).toMatchObject({ ok: true, amount: 3000 });
  });

  it("multiplies a price chosen by an answer too", () => {
    const b = pay({ quantityFrom: { ref: "q_party" } });
    expect(resolvePaymentAmount(b as never, {}, { q_plan: "opt_pro", q_party: 2 })).toMatchObject({ ok: true, amount: 1998 });
  });

  it("charges nothing for a missing, fractional or absurd count", () => {
    for (const q of [undefined, 0, 2.5, -1, 5000, "three"]) {
      expect(resolvePaymentAmount(perHead() as never, {}, { q_party: q }).ok).toBe(false);
    }
  });

  it("wants the counting question to be a number question asked first", () => {
    const codes = (doc: FormDoc) => lintFormDoc(doc).map((i) => i.code);
    expect(codes(docOf(party, perHead()))).not.toContain("payment_no_quantity_source");
    expect(codes(docOf(perHead(), party))).toContain("payment_no_quantity_source");
    expect(codes(docOf(plan, perHead({ quantityFrom: { ref: "q_plan" } })))).toContain("payment_no_quantity_source");
  });
});

describe("branching on a payment", () => {
  it("is refused, because a payment only moves on once it's paid", () => {
    const doc = FormDoc.parse({
      schemaVersion: 1,
      title: "Plans",
      blocks: [plan, pay(), BlockSchema.parse({ id: "blk_notes001", ref: "q_notes", type: "long_text", title: "Notes" })],
      endings: [{ id: "end_thanks01", ref: "end", title: "Thanks", kind: "success" }],
      logic: [
        {
          id: "rl_paybranch",
          action_kind: "goto",
          from: "pay",
          target: "end",
          targetKind: "ending",
          when: { op: "and", conditions: [{ left: { kind: "ref", ref: "pay" }, op: "gte", value: "0" }], groups: [] },
        },
      ],
    });
    expect(lintFormDoc(doc).map((i) => i.code)).toContain("payment_branch_condition");
  });
});
