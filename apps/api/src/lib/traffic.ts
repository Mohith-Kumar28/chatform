import { z } from "zod";
import type { Bindings } from "../env.js";
import { captureRequestContext } from "./respondent-context.js";
import { classifySource, hostOf } from "./traffic-source.js";
import { webOrigins } from "./origins.js";

/**
 * First-party traffic: one Analytics Engine row per page view, and one more when
 * the page is left.
 *
 * Every surface the site has reports here: the marketing pages, the docs, sign-in,
 * the dashboard, the builder, and a respondent filling a form. The super admin's
 * Traffic and Campaigns pages read it back through the SQL API (`traffic-query.ts`).
 *
 * Analytics Engine rather than D1 because a page view must cost nothing: the write
 * is fire-and-forget, has no round trip and no row to contend on, and a busy
 * campaign day is a few hundred thousand of them. D1 keeps what the business is
 * built on (sign-ups, forms, responses, payments); this keeps who looked.
 *
 * The dataset holds exactly one row shape, the one `writeTraffic` builds. The
 * SQL API has no schema, only positions, so a second writer with another layout
 * would make every query below it wrong without an error. The positions are
 * `TRAFFIC_BLOBS` / `TRAFFIC_DOUBLES`, which the query side reads by name.
 */

export const TRAFFIC_AREAS = ["marketing", "docs", "auth", "app", "builder", "form", "embed"] as const;
export type TrafficArea = (typeof TRAFFIC_AREAS)[number];

/** Blob positions, 1-based as the SQL API names them (`blob1`…`blob20`). */
export const TRAFFIC_BLOBS = {
  event: 1,
  area: 2,
  path: 3,
  visitId: 4,
  referrerHost: 5,
  channel: 6,
  source: 7,
  medium: 8,
  campaign: 9,
  content: 10,
  country: 11,
  region: 12,
  city: 13,
  device: 14,
  browser: 15,
  os: 16,
  language: 17,
  isNew: 18,
  signedIn: 19,
  userId: 20,
} as const;

/** Double positions (`double1`…). */
export const TRAFFIC_DOUBLES = {
  engagedMs: 1,
  lcp: 2,
  inp: 3,
  ttfb: 4,
  cls: 5,
  lat: 6,
  lon: 7,
  isEntry: 8,
  screenW: 9,
} as const;

const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const short = (max: number) => z.string().max(max).optional();
const metric = z.number().finite().min(0).max(600_000).optional();

/**
 * What the browser sends. Deliberately terse keys: this rides a `sendBeacon`
 * on every page, and the whole body is capped at 2 KB before it is parsed.
 */
export const TrafficBeacon = z.object({
  /** `view` when a page is shown, `leave` when it is hidden for good. */
  e: z.enum(["view", "leave"]),
  /** Visitor: a random id this browser keeps in `localStorage`. */
  v: id,
  /** Visit: a random id this tab keeps until 30 minutes of inactivity. */
  s: id,
  a: z.enum(TRAFFIC_AREAS),
  /** The path, already templated by the browser (`/forms/:id/build`). */
  p: z.string().max(300),
  /** The visit's external referrer, the same on every event of the visit. */
  r: short(1000),
  /** The visit's campaign tags, read off the address it started at. */
  u: z
    .object({
      source: short(100),
      medium: short(100),
      campaign: short(150),
      content: short(150),
    })
    .optional(),
  /** An ad network's click id was on the landing URL (`gclid` → `google`). */
  ad: short(20),
  /** 1 when this visit created the visitor id: a first visit. */
  n: z.union([z.literal(0), z.literal(1)]).optional(),
  /** 1 on the visit's first page. */
  en: z.union([z.literal(0), z.literal(1)]).optional(),
  /** The signed-in user, on the dashboard and builder only. */
  uid: short(64),
  l: short(35),
  w: z.number().int().min(0).max(20_000).optional(),
  /** On `leave`: visible time on the page, and the page's web vitals. */
  ms: z.number().finite().min(0).max(86_400_000).optional(),
  lcp: metric,
  inp: metric,
  ttfb: metric,
  cls: z.number().finite().min(0).max(100).optional(),
});
export type TrafficBeacon = z.infer<typeof TrafficBeacon>;

export const MAX_BEACON_BYTES = 2048;

/**
 * Headless browsers, crawlers and scripted clients. Link unfurlers are not listed:
 * they never run the page's script, so they never send a beacon, and their names
 * ("WhatsApp/2.x") are also what the in-app browser of a real person says.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|curl|wget|python|axios|node-fetch|go-http|java\/|uptime|pingdom/i;

export function isBotAgent(ua: string | null | undefined): boolean {
  return !ua || BOT_UA.test(ua);
}

/** Paths that are never traffic, whatever the browser says. */
const NEVER = /^\/(admin|preview|__|geo-preview|api)(\/|$)/;

function clip(value: string | null | undefined, max: number): string {
  return (value ?? "").slice(0, max);
}

/** Our own origins never count as a referrer: a visit that "came from" chatform came from nowhere new. */
function externalReferrer(env: Bindings, referrer: string | undefined): string | null {
  const host = hostOf(referrer);
  if (!host) return null;
  const own = new Set(
    webOrigins(env)
      .map((o) => hostOf(o))
      .filter((h): h is string => !!h),
  );
  own.add("chatform.in");
  for (const h of own) if (host === h || host.endsWith(`.${h}`)) return null;
  return referrer ?? null;
}

/**
 * Enrich one beacon from the edge and write it. Returns whether a row was written.
 *
 * Never throws: an analytics write is not allowed to fail anything, and every
 * caller discards the result anyway.
 */
export function writeTraffic(env: Bindings, request: Request, beacon: TrafficBeacon): boolean {
  try {
    if (!env.TRAFFIC) return false;
    if (isBotAgent(request.headers.get("user-agent"))) return false;
    if (NEVER.test(beacon.p)) return false;

    const ctx = captureRequestContext(request, { fallbackChannel: "link", client: { language: beacon.l } });
    if (ctx.device.type === "bot") return false;

    const referrer = externalReferrer(env, beacon.r);
    const src = classifySource(referrer, { source: beacon.u?.source, medium: beacon.u?.medium, ad: beacon.ad });
    const signedIn = !!beacon.uid;

    const blobs: string[] = [];
    const set = (key: keyof typeof TRAFFIC_BLOBS, value: string) => {
      blobs[TRAFFIC_BLOBS[key] - 1] = value;
    };
    set("event", beacon.e);
    set("area", beacon.a);
    set("path", clip(beacon.p.split("?")[0], 300));
    set("visitId", beacon.s);
    set("referrerHost", clip(src.host, 120));
    set("channel", src.channel);
    set("source", clip(src.source, 80));
    set("medium", clip(beacon.u?.medium?.toLowerCase(), 80));
    set("campaign", clip(beacon.u?.campaign?.toLowerCase(), 150));
    set("content", clip(beacon.u?.content, 150));
    set("country", clip(ctx.geo.country, 2));
    set("region", clip(ctx.geo.region, 100));
    set("city", clip(ctx.geo.city, 100));
    set("device", ctx.device.type ?? "");
    set("browser", clip(ctx.device.browser, 40));
    set("os", clip(ctx.device.os, 40));
    set("language", clip(ctx.language, 35));
    set("isNew", beacon.n === 1 ? "1" : "0");
    set("signedIn", signedIn ? "1" : "0");
    set("userId", beacon.a === "app" || beacon.a === "builder" ? clip(beacon.uid, 64) : "");

    const doubles: number[] = new Array(9).fill(0);
    const num = (key: keyof typeof TRAFFIC_DOUBLES, value: number | null | undefined) => {
      doubles[TRAFFIC_DOUBLES[key] - 1] = typeof value === "number" && Number.isFinite(value) ? value : 0;
    };
    num("engagedMs", beacon.ms);
    num("lcp", beacon.lcp);
    num("inp", beacon.inp);
    num("ttfb", beacon.ttfb);
    num("cls", beacon.cls === undefined ? undefined : Math.round(beacon.cls * 1000));
    num("lat", ctx.geo.latitude);
    num("lon", ctx.geo.longitude);
    num("isEntry", beacon.en);
    num("screenW", beacon.w);

    // The visitor is the index, which is also Analytics Engine's sampling key:
    // under sampling, a visitor is kept or dropped whole, so uniques and visits
    // stay consistent with each other.
    env.TRAFFIC.writeDataPoint({ indexes: [beacon.v], blobs, doubles });
    return true;
  } catch (err) {
    console.warn("traffic_write_failed", { message: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** Parse a beacon body without trusting its content type: `sendBeacon` posts `text/plain`. */
export async function readBeacon(request: Request): Promise<TrafficBeacon | null> {
  try {
    const text = await request.text();
    if (!text || text.length > MAX_BEACON_BYTES) return null;
    const parsed = TrafficBeacon.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
