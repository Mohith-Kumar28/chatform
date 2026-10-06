/**
 * The places a campaign link gets posted, in the words a founder would use, and
 * the `utm_source` / `utm_medium` each one stands for.
 *
 * Nobody types a medium. Picking "Google Ads" writes `google` / `cpc`, which is
 * also what `classifySource` (`traffic-source.ts`) reads to file the visit under
 * Paid, so the Traffic page and the Campaigns page agree without anyone keeping
 * a naming convention in their head.
 *
 * `source` says where the source comes from: fixed by the channel, picked from a
 * short list, or taken from the link's label (a partner's or an event's name).
 */

export interface ChannelPreset {
  key: string;
  label: string;
  medium: string;
  source: "fixed" | "pick" | "label";
  /** The one source, or the ones to pick from, first is the default. Empty for `label`. */
  sources: string[];
}

export const CHANNEL_PRESETS: ChannelPreset[] = [
  { key: "google_ads", label: "Google Ads", medium: "cpc", source: "fixed", sources: ["google"] },
  { key: "paid_social", label: "Paid social", medium: "paid_social", source: "pick", sources: ["linkedin", "x", "instagram", "facebook", "reddit"] },
  { key: "x_post", label: "X post", medium: "social", source: "fixed", sources: ["x"] },
  { key: "linkedin_post", label: "LinkedIn post", medium: "social", source: "fixed", sources: ["linkedin"] },
  { key: "newsletter", label: "Newsletter", medium: "email", source: "fixed", sources: ["newsletter"] },
  { key: "cold_outreach", label: "Cold outreach", medium: "email", source: "fixed", sources: ["outbound"] },
  { key: "partner", label: "Partner or affiliate", medium: "affiliate", source: "label", sources: [] },
  { key: "creator", label: "Creator", medium: "influencer", source: "pick", sources: ["instagram", "youtube", "tiktok", "x", "linkedin"] },
  { key: "community", label: "Community", medium: "community", source: "pick", sources: ["reddit", "hackernews", "indiehackers", "discord", "slack", "whatsapp", "telegram"] },
  { key: "launch", label: "Launch site", medium: "referral", source: "pick", sources: ["producthunt", "hackernews", "indiehackers"] },
  { key: "video", label: "YouTube or video", medium: "video", source: "fixed", sources: ["youtube"] },
  { key: "qr", label: "QR or offline", medium: "qr", source: "label", sources: [] },
  { key: "other", label: "Other", medium: "referral", source: "label", sources: [] },
];

export const presetOf = (key: string | null | undefined): ChannelPreset =>
  CHANNEL_PRESETS.find((p) => p.key === key) ?? CHANNEL_PRESETS[CHANNEL_PRESETS.length - 1]!;

/** Lowercase, and only what survives a URL untouched. "" when nothing does. */
export function slugify(value: string, max: number): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_.\-+]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

export interface LinkTags {
  id: string;
  destination: string;
  source: string;
  medium: string;
  campaign: string;
  content: string | null;
}

/**
 * Where a link's short address sends people: its destination on the site, with
 * the tags and the link's own id. A path and query, never a host, so whatever
 * is stored can only ever lead back to chatform.
 */
export function linkTarget(link: LinkTags): string {
  const url = new URL(link.destination || "/", "https://chatform.in");
  url.searchParams.set("utm_source", link.source);
  url.searchParams.set("utm_medium", link.medium);
  url.searchParams.set("utm_campaign", link.campaign);
  if (link.content) url.searchParams.set("utm_content", link.content);
  url.searchParams.set("utm_id", link.id);
  return `${url.pathname}${url.search}`;
}

/** The key the edge worker reads a short code's target under. See `apps/web/edge/edge.ts`. */
export const linkKvKey = (code: string) => `link:${code}`;

// No 0/o, 1/l/i: a code is read off a slide or a sticker as often as it is clicked.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A short code nobody chose. Called inside a request, never at module scope. */
export function randomCode(length = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}
