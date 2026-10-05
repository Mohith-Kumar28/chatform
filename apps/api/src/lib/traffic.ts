import { z } from "zod";
import type { Bindings } from "../env.js";
import { captureRequestContext } from "./respondent-context.js";
import { classifySource, hostOf } from "./traffic-source.js";
import { webOrigins } from "./origins.js";
import { SESSION_LOCATION } from "./session-location.js";
import type { TrafficDO, TrafficHit } from "../do/traffic-do.js";

/**
 * First-party traffic: every page view the site has, and one more beacon when
 * the page is left.
 *
 * Every surface reports here: the marketing pages, the docs, sign-in, the
 * dashboard, the builder, and a respondent filling a form. This file decides
 * what counts and fills in what only the edge knows (place, device, source);
 * `TrafficDO` stores it, and the super admin's Traffic, Visitors and Campaigns
 * pages read it back through `traffic-query.ts`.
 *
 * Our own store rather than D1 or Analytics Engine: a page view is a few local
 * writes inside one Durable Object, with no database round trip, and the rows
 * stay ours to join and keep. D1 keeps what the business is built on
 * (sign-ups, forms, responses, payments); this keeps who looked.
 */

export const TRAFFIC_AREAS = ["marketing", "docs", "auth", "app", "builder", "form", "embed"] as const;
export type TrafficArea = (typeof TRAFFIC_AREAS)[number];

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

/** The one object that holds all traffic, beside D1 like the worker itself. */
export function trafficStore(env: Bindings): DurableObjectStub<TrafficDO> {
  return env.TRAFFIC_DO.get(env.TRAFFIC_DO.idFromName("traffic"), SESSION_LOCATION) as unknown as DurableObjectStub<TrafficDO>;
}

/** A measurement that was taken: zero and absent both mean it was not. */
const measured = (value: number | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;

/** One beacon, enriched from the edge, or null when it is not traffic (a bot, an admin page). */
export function trafficHit(env: Bindings, request: Request, beacon: TrafficBeacon, at = Date.now()): TrafficHit | null {
  if (isBotAgent(request.headers.get("user-agent"))) return null;
  if (NEVER.test(beacon.p)) return null;

  const ctx = captureRequestContext(request, { fallbackChannel: "link", client: { language: beacon.l } });
  if (ctx.device.type === "bot") return null;

  const src = classifySource(externalReferrer(env, beacon.r), {
    source: beacon.u?.source,
    medium: beacon.u?.medium,
    ad: beacon.ad,
  });
  const coordinate = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    at,
    event: beacon.e,
    visitor: beacon.v,
    visit: beacon.s,
    area: beacon.a,
    path: clip(beacon.p.split("?")[0], 300),
    referrerHost: clip(src.host, 120),
    channel: src.channel,
    source: clip(src.source, 80),
    medium: clip(beacon.u?.medium?.toLowerCase(), 80),
    campaign: clip(beacon.u?.campaign?.toLowerCase(), 150),
    content: clip(beacon.u?.content, 150),
    country: clip(ctx.geo.country, 2),
    region: clip(ctx.geo.region, 100),
    city: clip(ctx.geo.city, 100),
    lat: coordinate(ctx.geo.latitude),
    lon: coordinate(ctx.geo.longitude),
    device: ctx.device.type ?? "",
    browser: clip(ctx.device.browser, 40),
    os: clip(ctx.device.os, 40),
    language: clip(ctx.language, 35),
    screenW: beacon.w || null,
    // Who is signed in is only recorded where being signed in is the point.
    userId: beacon.a === "app" || beacon.a === "builder" ? clip(beacon.uid, 64) : "",
    engagedMs: beacon.ms ?? 0,
    lcp: measured(beacon.lcp),
    inp: measured(beacon.inp),
    ttfb: measured(beacon.ttfb),
    cls: typeof beacon.cls === "number" ? Math.round(beacon.cls * 1000) / 1000 : null,
  };
}

/**
 * Enrich one beacon and store it. Resolves to whether it was stored.
 *
 * Never rejects: an analytics write is not allowed to fail anything. Callers
 * hand the promise to `waitUntil` and answer without it.
 */
export async function recordTraffic(env: Bindings, request: Request, beacon: TrafficBeacon): Promise<boolean> {
  try {
    const hit = trafficHit(env, request, beacon);
    if (!hit) return false;
    await trafficStore(env).record(hit);
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
