/**
 * Where a respondent is sent to pay, and where they are sent to book.
 *
 * Both the payment and scheduling blocks hand off to something the builder
 * already owns. Nothing here talks to a gateway or a calendar API — it only
 * builds the URI and reads enough of a URL to label the button honestly.
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
