import { describe, expect, it } from "vitest";
import {
  Block as BlockSchema,
  FormDoc,
  leadFormFixture,
  lintFormDoc,
  buildUpiUri,
  detectSchedulingProvider,
  formatAmount,
  isMeetingRoom,
  isValidUpiId,
  paymentReference,
  toPublicBlock,
  schedulingLabel,
  validateAnswer,
} from "../src/index";

const paymentBlock = (over: Record<string, unknown> = {}) =>
  BlockSchema.parse({
    id: "blk_pay0001",
    ref: "pay",
    title: "Pay the deposit",
    type: "payment",
    ...over,
  });

describe("isValidUpiId", () => {
  it.each([
    "acme@okhdfcbank",
    "9876543210@ybl",
    "first.last@oksbi",
    "shop-1_2@paytm",
    "  padded@upi  ",
  ])("accepts %s", (vpa) => {
    expect(isValidUpiId(vpa)).toBe(true);
  });

  it.each([
    "",
    "no-at-sign",
    "@okhdfcbank",
    "acme@",
    "acme@123", // PSP handles never start with a digit
    "acme@bank@extra",
    "acme with space@upi",
  ])("rejects %s", (vpa) => {
    expect(isValidUpiId(vpa)).toBe(false);
  });
});

describe("buildUpiUri", () => {
  it("builds a scannable URI with amount, payee and note", () => {
    const uri = buildUpiUri({ upiId: "acme@okhdfcbank", payeeName: "Acme Co", amount: 500, note: "CF-AB23CD" });
    expect(uri).not.toBeNull();
    const params = new URLSearchParams(uri!.slice("upi://pay?".length));
    expect(params.get("pa")).toBe("acme@okhdfcbank");
    expect(params.get("pn")).toBe("Acme Co");
    expect(params.get("am")).toBe("500.00");
    expect(params.get("cu")).toBe("INR");
    expect(params.get("tn")).toBe("CF-AB23CD");
  });

  it("omits the amount so the payer can enter their own", () => {
    const uri = buildUpiUri({ upiId: "acme@okhdfcbank" });
    expect(uri).not.toContain("am=");
  });

  it("encodes spaces as %20, not +, which UPI apps take literally", () => {
    const uri = buildUpiUri({ upiId: "acme@okhdfcbank", payeeName: "Acme Design Co" });
    expect(uri).toContain("pn=Acme%20Design%20Co");
    expect(uri).not.toContain("+");
  });

  it("falls back to the handle when no payee name is set", () => {
    const uri = buildUpiUri({ upiId: "acme@okhdfcbank" });
    expect(uri).toContain("pn=acme");
  });

  it("returns null for an unusable VPA rather than a broken URI", () => {
    expect(buildUpiUri({ upiId: "not-a-vpa" })).toBeNull();
  });
});

describe("formatAmount", () => {
  it("uses the currency symbol and drops trailing zeros on whole amounts", () => {
    expect(formatAmount(500, "INR")).toBe("₹500");
    expect(formatAmount(19.5, "USD")).toBe("$19.50");
    expect(formatAmount(10, "XYZ")).toBe("XYZ 10");
  });
});

describe("paymentReference", () => {
  it("is prefixed and avoids ambiguous characters", () => {
    const ref = paymentReference(() => 0.5);
    expect(ref).toMatch(/^CF-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(ref).not.toMatch(/[O0I1]/);
  });
});

describe("detectSchedulingProvider", () => {
  it.each([
    ["https://cal.com/mohith/30min", "cal"],
    ["https://calendly.com/acme/intro", "calendly"],
    ["https://calendar.google.com/calendar/appointments/x", "google"],
    ["https://meet.google.com/abc-defg-hij", "meet"],
    ["https://us02web.zoom.us/j/123", "zoom"],
    ["https://teams.microsoft.com/l/meetup-join/x", "teams"],
    ["https://booking.acme.dev/slot", "other"],
    ["not a url", "other"],
  ])("reads %s as %s", (url, expected) => {
    expect(detectSchedulingProvider(url)).toBe(expected);
  });

  it("does not match a lookalike host", () => {
    expect(detectSchedulingProvider("https://notcal.com/x")).toBe("other");
    expect(detectSchedulingProvider("https://cal.com.evil.tld/x")).toBe("other");
  });

  it("labels a meeting room differently from a booking page", () => {
    expect(isMeetingRoom("https://meet.google.com/abc")).toBe(true);
    expect(isMeetingRoom("https://cal.com/mohith")).toBe(false);
    expect(schedulingLabel("https://calendly.com/acme")).toBe("Open Calendly");
    expect(schedulingLabel("https://cal.com/acme", "Grab a slot")).toBe("Grab a slot");
  });
});

describe("publicBlock for payment", () => {
  it("hands the respondent a ready UPI URI", () => {
    const pub = toPublicBlock(
      paymentBlock({ method: "upi", upiId: "acme@okhdfcbank", upiPayeeName: "Acme", amount: 250, currency: "INR" }),
    );
    expect(pub.paymentMethod).toBe("upi");
    expect(pub.upiId).toBe("acme@okhdfcbank");
    expect(pub.upiUri).toContain("upi://pay?");
    expect(pub.upiUri).toContain("am=250.00");
  });

  it("leaves a variable amount unresolved rather than publishing a wrong price", () => {
    const pub = toPublicBlock(
      paymentBlock({ method: "upi", upiId: "acme@okhdfcbank", amountMode: "variable", amountVariable: "total" }),
    );
    expect(pub.amount).toBeUndefined();
    expect(pub.upiUri).not.toContain("am=");
  });

  it("passes the checkout page through in link mode and never leaks the UPI fields", () => {
    const pub = toPublicBlock(paymentBlock({ method: "link", url: "https://rzp.io/l/deposit", amount: 99 }));
    expect(pub.url).toBe("https://rzp.io/l/deposit");
    expect(pub.upiUri).toBeUndefined();
    expect(pub.upiId).toBeUndefined();
  });

  it("emits no URI for a misconfigured UPI ID instead of an unscannable one", () => {
    const pub = toPublicBlock(paymentBlock({ method: "upi", upiId: "oops" }));
    expect(pub.upiUri).toBeUndefined();
  });
});

describe("validateAnswer for payment", () => {
  const block = paymentBlock({ method: "upi", upiId: "acme@okhdfcbank", currency: "INR", amount: 250 });

  it("records a self-declared payment as unverified even if the client claims otherwise", () => {
    const res = validateAnswer(block, {
      status: "paid",
      method: "upi",
      verified: true,
      reference: "CF-AB23CD",
      amount: 250,
    });
    expect(res.ok).toBe(true);
    expect(res.ok && res.value).toMatchObject({
      status: "paid",
      method: "upi",
      verified: false,
      reference: "CF-AB23CD",
      currency: "INR",
    });
  });

  it("rejects anything that is not a payment claim", () => {
    expect(validateAnswer(block, "yes").ok).toBe(false);
    expect(validateAnswer(block, { status: "maybe" }).ok).toBe(false);
  });
});

describe("lint for external payment blocks", () => {
  const docWith = (over: Record<string, unknown>) => {
    const doc = FormDoc.parse(leadFormFixture);
    doc.blocks.push(paymentBlock(over) as never);
    return doc;
  };
  const codes = (doc: ReturnType<typeof docWith>) => lintFormDoc(doc).map((i) => i.code);

  it("blocks publishing a payment step with nowhere to pay", () => {
    expect(codes(docWith({ method: "link" }))).toContain("payment_no_link");
    expect(codes(docWith({ method: "upi" }))).toContain("payment_no_upi_id");
  });

  it("blocks publishing a malformed UPI ID rather than shipping a dead QR", () => {
    const issues = lintFormDoc(docWith({ method: "upi", upiId: "oops", currency: "INR" }));
    const bad = issues.find((i) => i.code === "payment_bad_upi_id");
    expect(bad?.level).toBe("error");
  });

  it("warns, but does not block, when UPI is paired with a non-INR price", () => {
    const issues = lintFormDoc(
      docWith({ method: "upi", upiId: "acme@okhdfcbank", currency: "USD" }),
    );
    const warn = issues.find((i) => i.code === "payment_upi_currency");
    expect(warn?.level).toBe("warning");
  });

  it("passes a fully configured block", () => {
    const linkDoc = docWith({ method: "link", url: "https://rzp.io/l/deposit" });
    expect(lintFormDoc(linkDoc).filter((i) => i.level === "error")).toEqual([]);

    const upiDoc = docWith({ method: "upi", upiId: "acme@okhdfcbank", currency: "INR" });
    expect(lintFormDoc(upiDoc).filter((i) => i.level === "error")).toEqual([]);
  });
});
