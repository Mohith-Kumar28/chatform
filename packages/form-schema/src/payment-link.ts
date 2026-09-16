/**
 * Where a respondent is sent to pay, and where they are sent to book.
 *
 * Both the payment and scheduling blocks hand off to something the builder
 * already owns. Nothing here talks to a gateway or a calendar API — it only
 * builds the URI and reads enough of a URL to label the button honestly, and,
 * for verified payments, does the arithmetic every gateway call depends on:
 * minor units and the amount a block resolves to.
 */

/**
 * A UPI virtual payment address: `handle@psp`. Deliberately permissive on the
 * handle (banks allow dots, dashes and underscores) and strict on the shape,
 * because a malformed VPA produces a QR that scans fine and then fails inside
 * the payer's bank app — the worst place to discover a typo.
 */
const VPA_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,255})@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function isValidUpiId(vpa: string): boolean {
  return VPA_RE.test(vpa.trim());
}

/**
 * UPI carries amounts in rupees with two decimals, and only in INR — the `cu`
 * parameter exists in the spec but every Indian PSP rejects anything else. A
 * payment block set to another currency is caught by lint, not silently
 * converted here.
 */
export const UPI_CURRENCY = "INR";

export type UpiUriArgs = {
  upiId: string;
  payeeName?: string;
  /** Rupees. Omitted for variable amounts, which lets the payer type their own. */
  amount?: number;
  /** Shown in the payer's app and in their statement — how the builder reconciles. */
  note?: string;
};

/**
 * Build a `upi://pay` URI. Returns null rather than a broken URI when the VPA
 * is unusable, so callers render nothing instead of an unscannable QR.
 */
export function buildUpiUri({ upiId, payeeName, amount, note }: UpiUriArgs): string | null {
  const vpa = upiId.trim();
  if (!isValidUpiId(vpa)) return null;

  const params = new URLSearchParams();
  params.set("pa", vpa);
  // Most UPI apps show "Unknown" without a payee name, which reads like a scam
  // to anyone about to send money.
  params.set("pn", (payeeName?.trim() || vpa.split("@")[0] || vpa).slice(0, 99));
  if (typeof amount === "number" && amount > 0) params.set("am", amount.toFixed(2));
  params.set("cu", UPI_CURRENCY);
  if (note) params.set("tn", note.slice(0, 99));

  // URLSearchParams encodes spaces as "+", which some UPI apps take literally
  // in the payee name and the note.
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

/** Currency shown next to an amount. Falls back to the code itself. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  AED: "AED ",
};

export function formatAmount(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] ?? `${code} `;
  const shown = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${symbol}${shown}`;
}

// ───────────────────────── Verified gateway payments ─────────────────────────

/**
 * The gateways a `gateway` payment block can be checked against — each one the
 * form admin's OWN account, connected in the builder. Listed here rather than
 * in the API because the answer records which one confirmed it.
 */
export const PAYMENT_PROVIDERS = ["cashfree", "razorpay", "stripe"] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProviderName, string> = {
  cashfree: "Cashfree",
  razorpay: "Razorpay",
  stripe: "Stripe",
};

/**
 * Currencies whose smallest unit is the major unit, and the handful with three
 * decimals. Everything else has two.
 *
 * This is ISO 4217's exponent, which is what Stripe, Razorpay and Cashfree all
 * mean by "the smallest currency unit". Getting it wrong is not a rounding
 * error: ¥500 sent as 50000 charges a hundred times the price.
 */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

export function currencyExponent(currency: string): 0 | 2 | 3 {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

/**
 * Major units to the integer a gateway wants: 19.99 USD → 1999, ₹499 → 49900,
 * ¥500 → 500, 1.5 KWD → 1500.
 *
 * Through `toPrecision(15)` before rounding, because binary floating point
 * stores 1.005 as 1.00499999…, and `Math.round(1.005 * 100)` is 100. Fifteen
 * significant digits is below where doubles start to lie, so the representation
 * error is shed and the value a person typed is the value that rounds.
 */
export function toMinorUnits(amount: number, currency: string): number {
  const factor = 10 ** currencyExponent(currency);
  return Math.round(Number((amount * factor).toPrecision(15)));
}

/** The inverse of `toMinorUnits`: 1999 USD → 19.99. */
export function fromMinorUnits(minor: number, currency: string): number {
  const exp = currencyExponent(currency);
  return Number((minor / 10 ** exp).toFixed(exp));
}

/**
 * The smallest charge the gateways accept, in minor units.
 *
 * Razorpay and Cashfree refuse under ₹1; Stripe under roughly 50 cents in the
 * major currencies. Checked before an order is created, because a refusal from
 * the gateway arrives after the respondent has already pressed Pay.
 */
export const PROVIDER_MIN_MINOR: Readonly<Record<string, number>> = { INR: 100, USD: 50, EUR: 50, GBP: 30 };

export function providerMinMinor(currency: string): number {
  const code = currency.toUpperCase();
  return PROVIDER_MIN_MINOR[code] ?? (currencyExponent(code) === 2 ? 50 : 1);
}

/** The fields of a payment block that decide what it charges. */
export interface PaymentAmountSource {
  amountMode: "fixed" | "variable";
  amount?: number;
  amountVariable?: string;
  minAmount?: number;
  maxAmount?: number;
  currency: string;
}

export type ResolvedPaymentAmount =
  | { ok: true; amountMinor: number; amount: number; currency: string }
  | { ok: false; code: "payment_no_amount" | "payment_bad_amount" | "payment_amount_out_of_range" };

/**
 * What this payment block charges, right now, decided on the server.
 *
 * `amountVariable` was stored and never read: a variable-amount block published
 * no amount at all and left the checkout page to state a price. A verified
 * payment cannot work that way — the record the gateway is checked against has
 * to hold the amount before checkout opens — so the variable is resolved here,
 * against the session's variables, and nowhere in the browser.
 *
 * A numeric string is accepted because variables set from a text answer arrive
 * as text. Anything that is not a finite positive number is refused rather than
 * coerced to zero: a checkout for nothing is a form that silently gives away
 * whatever it was selling.
 */
export function resolvePaymentAmount(
  block: PaymentAmountSource,
  variables: Record<string, unknown>,
): ResolvedPaymentAmount {
  let raw: unknown;
  if (block.amountMode === "variable") {
    if (!block.amountVariable) return { ok: false, code: "payment_no_amount" };
    raw = variables[block.amountVariable];
  } else {
    raw = block.amount;
  }
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return { ok: false, code: "payment_no_amount" };
  }
  const n = typeof raw === "string" ? Number(raw.trim().replace(/,/g, "")) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return { ok: false, code: "payment_bad_amount" };

  if (block.minAmount !== undefined && n < block.minAmount) return { ok: false, code: "payment_amount_out_of_range" };
  if (block.maxAmount !== undefined && n > block.maxAmount) return { ok: false, code: "payment_amount_out_of_range" };

  const currency = block.currency.toUpperCase();
  const amountMinor = toMinorUnits(n, currency);
  // After conversion, so 0.001 USD — positive, and zero cents — is refused too.
  if (amountMinor < providerMinMinor(currency)) return { ok: false, code: "payment_bad_amount" };
  return { ok: true, amountMinor, amount: fromMinorUnits(amountMinor, currency), currency };
}

/**
 * A short code the respondent puts in the payment note and we store on the
 * answer, so a builder staring at a UPI credit can tell which response paid it.
 * Unambiguous alphabet: no O/0, no I/1.
 */
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function paymentReference(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[Math.floor(random() * REF_ALPHABET.length)];
  return `CF-${out}`;
}

/**
 * What the booking link actually is, used only to label the button. Unknown
 * hosts get generic copy rather than a guess — "Open the calendar" is right
 * for a self-hosted Cal instance and for a Notion page alike.
 */
export type SchedulingProvider =
  | "cal"
  | "calendly"
  | "google"
  | "zoom"
  | "meet"
  | "teams"
  | "hubspot"
  | "savvycal"
  | "tidycal"
  | "other";

const PROVIDER_HOSTS: [SchedulingProvider, RegExp][] = [
  ["cal", /(^|\.)cal\.com$/],
  ["calendly", /(^|\.)calendly\.com$/],
  ["google", /(^|\.)calendar\.google\.com$/],
  ["meet", /(^|\.)meet\.google\.com$/],
  ["zoom", /(^|\.)zoom\.(us|com)$/],
  ["teams", /(^|\.)teams\.(microsoft|live)\.com$/],
  ["hubspot", /(^|\.)meetings\.hubspot\.com$/],
  ["savvycal", /(^|\.)savvycal\.com$/],
  ["tidycal", /(^|\.)tidycal\.com$/],
];

export function detectSchedulingProvider(url: string): SchedulingProvider {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  for (const [provider, re] of PROVIDER_HOSTS) if (re.test(host)) return provider;
  return "other";
}

const PROVIDER_LABELS: Record<SchedulingProvider, string> = {
  cal: "Open the booking page",
  calendly: "Open Calendly",
  google: "Open the calendar",
  meet: "Join on Google Meet",
  zoom: "Join the Zoom meeting",
  teams: "Join on Teams",
  hubspot: "Book a meeting",
  savvycal: "Open the booking page",
  tidycal: "Open the booking page",
  other: "Open the booking link",
};

/** Button copy for a booking link. `custom` (the block's buttonLabel) always wins. */
export function schedulingLabel(url: string, custom?: string): string {
  if (custom?.trim()) return custom.trim();
  return PROVIDER_LABELS[detectSchedulingProvider(url)];
}

/**
 * A meeting room is not a booking page: there is no slot to pick, so asking
 * "have you booked?" afterwards makes no sense. Used to switch the confirm copy.
 */
export function isMeetingRoom(url: string): boolean {
  const provider = detectSchedulingProvider(url);
  return provider === "meet" || provider === "zoom" || provider === "teams";
}
