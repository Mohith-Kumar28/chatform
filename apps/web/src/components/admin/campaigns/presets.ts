import type { GetApiAdminCampaigns200ChannelsItem } from "@/lib/api/generated.schemas";
import { SITE_ORIGIN } from "@/lib/seo";

/**
 * What the Campaigns pages share: where a link can point, how its addresses are
 * written out, and how money and rates are shown.
 *
 * The channels themselves (Google Ads, X post, Partner…) are not listed here.
 * The API owns that list (`apps/api/src/lib/campaign-presets.ts`) and sends it
 * with every campaigns response, so the tags a channel writes are decided in
 * one place.
 */

export type Channel = GetApiAdminCampaigns200ChannelsItem;

/** The pages a link usually points at. Anything else on the site is typed as a path. */
export const DESTINATIONS = [
  ["/", "Home page"],
  ["/pricing", "Pricing"],
  ["/form-templates", "Templates"],
  ["/signin?mode=signup", "Sign up"],
] as const;

export const CURRENCIES = ["USD", "INR", "EUR", "GBP"] as const;

/** The short address: what gets posted. Answered by the edge worker. */
export const shortUrl = (code: string) => `${SITE_ORIGIN}/r/${code}`;
/** The long address the short one leads to, tags and all. */
export const longUrl = (target: string) => `${SITE_ORIGIN}${target}`;

/** Cents in their own currency, whole units: `$1,240`, `₹18,000`. */
export function cash(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100).toLocaleString("en-US")} ${currency}`;
  }
}

/** Revenue can arrive in more than one currency, and is never added across them. */
export const revenueLabel = (rows: { currency: string; cents: number }[]) =>
  rows.filter((r) => r.cents > 0).map((r) => cash(r.cents, r.currency)).join(" + ") || "–";

/** Sign-ups per visitor, one decimal while it is small enough to need it. */
export function rate(signups: number, visitors: number): string {
  if (!visitors) return "–";
  const p = (signups / visitors) * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
}

export const STATUS_LABEL: Record<string, string> = { active: "Active", paused: "Paused", archived: "Archived" };

/** `2026-10-06` for a date input, in the reader's own zone; "" for no date. */
export const toDateInput = (ms: number | null | undefined) => {
  if (ms == null) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fromDateInput = (value: string) => (value ? new Date(`${value}T00:00:00`).getTime() : null);
