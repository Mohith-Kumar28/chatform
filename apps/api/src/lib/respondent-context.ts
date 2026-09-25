import { z } from "zod";

/**
 * Where a respondent filled the form from, and on what.
 *
 * Captured once, when the session opens, and stamped onto the response's
 * `meta.context`. From there it reaches the response detail view, the webhook
 * payload (`metadata`), `/v1/responses` and the analytics map.
 *
 * Two sources, never mixed up:
 *   - the edge (`request.cf`, the user agent): geo, network, device. The
 *     respondent cannot fake these short of a VPN.
 *   - the browser (`ClientContextInput`): channel, host page, referrer, UTMs,
 *     language, screen. Self-reported and treated as such: every value is
 *     bounded, and nothing here is ever used to grant anything.
 *
 * The raw IP is never stored. The session keeps the hash it always has.
 */

export const CHANNELS = ["link", "inline", "popup", "side_tab", "fullpage", "embed", "api"] as const;
export type Channel = (typeof CHANNELS)[number];

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

/** What the browser says about itself. Every field optional: old clients send none. */
export const ClientContextInput = z.object({
  channel: z.enum(CHANNELS).optional(),
  /** The page the form sits on (embeds) or the form link as opened (direct). */
  pageUrl: z.string().max(2000).optional(),
  referrer: z.string().max(2000).optional(),
  utm: z.record(z.string().max(20), z.string().max(300)).optional(),
  language: z.string().max(35).optional(),
  screen: z.string().max(20).optional(),
});
export type ClientContextInput = z.infer<typeof ClientContextInput>;

export interface RespondentContext {
  channel: Channel;
  pageUrl: string | null;
  referrer: string | null;
  referrerHost: string | null;
  utm: Partial<Record<(typeof UTM_KEYS)[number], string>>;
  language: string | null;
  screen: string | null;
  timezone: string | null;
  device: {
    type: "mobile" | "tablet" | "desktop" | "bot" | null;
    browser: string | null;
    browserVersion: string | null;
    os: string | null;
    osVersion: string | null;
  };
  geo: {
    country: string | null;
    region: string | null;
    regionCode: string | null;
    city: string | null;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
    continent: string | null;
    timezone: string | null;
  };
  network: { asn: number | null; organization: string | null };
}

/** The subset of Cloudflare's `request.cf` this reads. Every field may be missing (local dev, tests). */
export interface EdgeInfo {
  country?: string;
  region?: string;
  regionCode?: string;
  city?: string;
  postalCode?: string;
  latitude?: string | number;
  longitude?: string | number;
  continent?: string;
  timezone?: string;
  asn?: number;
  asOrganization?: string;
}

function text(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  // Control and invisible characters out: these values land in exports and emails.
  const clean = value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\ufeff]/g, "").trim();
  return clean ? clean.slice(0, max) : null;
}

function coord(value: unknown, limit: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  // Four decimals is ~11m, already finer than IP geo is accurate to.
  return Math.round(n * 10000) / 10000;
}

/** An http(s) URL with its fragment dropped, or null. Anything else is not a page. */
function cleanUrl(value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

function utmFrom(url: string | null): RespondentContext["utm"] {
  if (!url) return {};
  const out: RespondentContext["utm"] = {};
  try {
    const params = new URL(url).searchParams;
    for (const key of UTM_KEYS) {
      const value = text(params.get(`utm_${key}`), 300);
      if (value) out[key] = value;
    }
  } catch {
    // Not a URL: no UTMs.
  }
  return out;
}

/**
 * Browser, OS and device class from a user agent.
 *
 * Hand-rolled rather than a dependency: the Worker bundle is size-limited and
 * this only has to name the handful of browsers that account for nearly every
 * visit. Order matters, because every Chromium browser also says "Chrome" and
 * every browser says "Safari".
 */
export function parseUserAgent(ua: string | null | undefined): RespondentContext["device"] {
  const empty = { type: null, browser: null, browserVersion: null, os: null, osVersion: null };
  if (!ua) return empty;

  const match = (re: RegExp) => ua.match(re)?.[1] ?? null;

  let browser: string | null = null;
  let browserVersion: string | null = null;
  const browsers: Array<[string, RegExp]> = [
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ["Opera", /(?:OPR|Opera)\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
    ["UC Browser", /UCBrowser\/([\d.]+)/],
    ["Brave", /Brave\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of browsers) {
    const version = match(re);
    if (version) {
      browser = name;
      browserVersion = version.split(".")[0] ?? version;
      break;
    }
  }
  // In-app webviews say so; they matter for "where did they click the link".
  if (/FBAN|FBAV|FB_IAB/.test(ua)) browser = "Facebook app";
  else if (/Instagram/.test(ua)) browser = "Instagram app";
  else if (/LinkedInApp/.test(ua)) browser = "LinkedIn app";
  else if (/WhatsApp/.test(ua)) browser = "WhatsApp";

  let os: string | null = null;
  let osVersion: string | null = null;
  if (/iPhone|iPad|iPod/.test(ua)) {
    os = /iPad/.test(ua) ? "iPadOS" : "iOS";
    osVersion = match(/OS (\d+(?:_\d+)?)/)?.replace("_", ".") ?? null;
  } else if (/Android/.test(ua)) {
    os = "Android";
    osVersion = match(/Android ([\d.]+)/);
  } else if (/Windows NT/.test(ua)) {
    os = "Windows";
    const nt = match(/Windows NT ([\d.]+)/);
    // NT 10.0 covers both 10 and 11; the UA no longer tells them apart.
    osVersion = nt === "10.0" ? "10/11" : nt === "6.3" ? "8.1" : nt === "6.1" ? "7" : nt;
  } else if (/CrOS/.test(ua)) {
    os = "ChromeOS";
  } else if (/Mac OS X/.test(ua)) {
    os = "macOS";
    osVersion = match(/Mac OS X (\d+(?:[._]\d+)?)/)?.replace("_", ".") ?? null;
  } else if (/Linux/.test(ua)) {
    os = "Linux";
  }

  let type: RespondentContext["device"]["type"];
  if (/bot|crawler|spider|curl|wget|python-requests|headless/i.test(ua)) type = "bot";
  else if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) type = "tablet";
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) type = "mobile";
  else type = "desktop";

  return { type, browser, browserVersion, os, osVersion };
}

export function buildRespondentContext(input: {
  client?: ClientContextInput | null;
  edge?: EdgeInfo | null;
  userAgent?: string | null;
  /** The browser's IANA zone, already canonicalised by the caller. */
  timezone?: string | null;
  /** The `cf-ipcountry` header, used when `cf` itself is absent. */
  countryHeader?: string | null;
  fallbackChannel: Channel;
}): RespondentContext {
  const client = input.client ?? {};
  const edge = input.edge ?? {};
  const pageUrl = cleanUrl(client.pageUrl);
  const referrer = cleanUrl(client.referrer);

  // The browser's own UTMs first (it read them off the address it was opened
  // at), then whatever the host page's URL carries.
  const utm: RespondentContext["utm"] = { ...utmFrom(pageUrl) };
  for (const key of UTM_KEYS) {
    const value = text(client.utm?.[key], 300);
    if (value) utm[key] = value;
  }

  let referrerHost: string | null = null;
  if (referrer) {
    try {
      referrerHost = new URL(referrer).hostname.replace(/^www\./, "");
    } catch {
      referrerHost = null;
    }
  }

  // XX is Cloudflare's "unknown", T1 is Tor. Neither is a place.
  const rawCountry = text(edge.country ?? input.countryHeader, 2)?.toUpperCase() ?? null;
  const country = rawCountry && rawCountry !== "XX" && rawCountry !== "T1" ? rawCountry : null;

  return {
    channel: client.channel ?? input.fallbackChannel,
    pageUrl,
    referrer,
    referrerHost,
    utm,
    language: text(client.language, 35),
    screen: text(client.screen, 20)?.match(/^\d{2,5}x\d{2,5}$/) ? text(client.screen, 20) : null,
    timezone: input.timezone ?? null,
    device: parseUserAgent(input.userAgent),
    geo: {
      country,
      region: text(edge.region, 100),
      regionCode: text(edge.regionCode, 10),
      city: text(edge.city, 100),
      postalCode: text(edge.postalCode, 20),
      latitude: coord(edge.latitude, 90),
      longitude: coord(edge.longitude, 180),
      continent: text(edge.continent, 4),
      timezone: text(edge.timezone, 64),
    },
    network: {
      asn: typeof edge.asn === "number" && Number.isFinite(edge.asn) ? edge.asn : null,
      organization: text(edge.asOrganization, 120),
    },
  };
}

/**
 * The stored context, read back defensively.
 *
 * `meta` is free-form JSON that older rows do not have this key in at all, so
 * a response from before this shipped yields a context built from the two
 * things it did record (country, user agent) rather than nothing.
 */
export function readRespondentContext(meta: unknown, source?: string | null): RespondentContext | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as { context?: unknown; country?: unknown; userAgent?: unknown };
  if (m.context && typeof m.context === "object") return m.context as RespondentContext;
  if (!m.country && !m.userAgent) return null;
  return buildRespondentContext({
    userAgent: typeof m.userAgent === "string" ? m.userAgent : null,
    countryHeader: typeof m.country === "string" ? m.country : null,
    fallbackChannel: source === "api" ? "api" : source === "embed" ? "embed" : "link",
  });
}

export function parseMeta(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
