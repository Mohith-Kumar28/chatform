import { z } from "zod";
import type { Bindings } from "../env.js";
import { captureRequestContext, ClientContextInput, type RespondentContext } from "./respondent-context.js";
import { classifySource } from "./traffic-source.js";
import { canonicalZone } from "./quiet-hours.js";

/**
 * Where a customer signed up from, and every sign-in since.
 *
 * The same record a respondent's response carries (geo, network, device), built
 * by the same `captureRequestContext`, so the admin console reads a customer
 * exactly the way an author reads a respondent.
 *
 * The browser adds what the edge cannot see through the `x-chatform-client`
 * header (`apps/web/src/lib/auth/client-context.ts`): screen, zone, and the
 * first page and referrer this browser arrived on, and the visit it is on now.
 * A Google sign-up is created on the OAuth callback, a redirect that carries no
 * custom header, so the browser also leaves the same payload in a short-lived
 * `cf_client` cookie on the parent domain, which that redirect does carry.
 */

export const CLIENT_CONTEXT_HEADER = "x-chatform-client";
const CLIENT_CONTEXT_COOKIE = "cf_client";

const Touch = z.object({
  referrer: z.string().max(1000).optional(),
  utm: z.record(z.string().max(20), z.string().max(300)).optional(),
  ad: z.string().max(20).optional(),
});
type Touch = z.infer<typeof Touch>;

const HeaderPayload = ClientContextInput.extend({
  timezone: z.string().max(64).optional(),
  /** The web tracker's visitor id (`lib/analytics/track.ts`), to join a sign-up to its visits. */
  visitorId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  /** Where the visit that signed up came from, when that was somewhere. */
  lastTouch: Touch.optional(),
});

function cookieValue(headers: Headers | undefined, name: string): string | null {
  const raw = headers?.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** The header, URI-encoded JSON, else the cookie. Anything malformed is simply not there. */
function readClientHeader(headers: Headers | undefined): z.infer<typeof HeaderPayload> | null {
  const raw = headers?.get(CLIENT_CONTEXT_HEADER) ?? cookieValue(headers, CLIENT_CONTEXT_COOKIE);
  if (!raw || raw.length > 6000) return null;
  try {
    const parsed = HeaderPayload.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** "/sign-up/email" as "email", "/callback/google" as "google". */
function methodOf(path: string | undefined, params: Record<string, string | undefined> | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/callback/") || path.startsWith("/oauth2/callback/")) return params?.id ?? path.split("/").pop() ?? null;
  if (path.includes("email-otp")) return "email-otp";
  if (path.includes("/email")) return "email";
  return path.replace(/^\//, "").slice(0, 40) || null;
}

export interface SignupAttribution {
  channel: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  landingPath: string | null;
}

function utmOf(url: string | null | undefined): Record<string, string> {
  try {
    const params = new URL(url ?? "").searchParams;
    const out: Record<string, string> = {};
    for (const key of ["source", "medium", "campaign"]) {
      const value = params.get(`utm_${key}`);
      if (value) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Which touch gets the sign-up: the visit that signed up if it came from
 * somewhere (a campaign link, a search, another site), else the first page this
 * browser ever landed on. Last non-direct touch, the usual default, because a
 * campaign that brings back somebody who first came months ago did the work.
 */
export function attributionOf(context: Pick<RespondentContext, "referrer" | "pageUrl" | "utm">, last?: Touch | null): SignupAttribution {
  const lastCounts = !!(last && (last.referrer || last.ad || (last.utm && Object.keys(last.utm).length)));
  const utm = lastCounts ? (last!.utm ?? {}) : { ...utmOf(context.pageUrl), ...context.utm };
  const referrer = lastCounts ? (last!.referrer ?? null) : context.referrer;
  const src = classifySource(referrer, { source: utm.source, medium: utm.medium, ad: lastCounts ? last!.ad : undefined });
  let landingPath: string | null = null;
  try {
    landingPath = context.pageUrl ? new URL(context.pageUrl).pathname.slice(0, 200) : null;
  } catch {
    landingPath = null;
  }
  return {
    channel: src.channel,
    source: src.source.slice(0, 80),
    medium: utm.medium?.toLowerCase().slice(0, 80) ?? null,
    campaign: utm.campaign?.toLowerCase().slice(0, 150) ?? null,
    landingPath,
  };
}

interface HookContext {
  request?: Request;
  headers?: Headers;
  path?: string;
  params?: Record<string, string | undefined>;
}

/**
 * Stamps one sign-up or sign-in. Never throws: a missing row is a gap in a
 * report, a thrown error here is somebody who cannot get into their account.
 *
 * Only for a request a person sent. A session minted server-side
 * (`auth.api.*` with no request) says nothing about anybody's device.
 */
export async function recordUserContext(
  env: Bindings,
  userId: string,
  kind: "sign_up" | "sign_in",
  ctx: HookContext | null | undefined,
): Promise<void> {
  const request = ctx?.request;
  if (!request) return;
  try {
    const client = readClientHeader(ctx.headers ?? request.headers);
    const context = captureRequestContext(request, {
      client,
      timezone:
        canonicalZone(client?.timezone) ?? canonicalZone((request as { cf?: { timezone?: string } }).cf?.timezone),
      fallbackChannel: "link",
    });
    const attribution = kind === "sign_up" ? attributionOf(context, client?.lastTouch) : null;
    await env.DB.prepare(
      `INSERT INTO user_sign_ins (id, user_id, kind, method, context_json, created_at,
         visitor_id, channel, source, medium, campaign, landing_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `usi_${crypto.randomUUID().replace(/-/g, "")}`,
        userId,
        kind,
        methodOf(ctx.path, ctx.params),
        JSON.stringify(context),
        Date.now(),
        client?.visitorId ?? null,
        // A sign-in is never attributed; "none" keeps it out of the backfill.
        attribution?.channel ?? "none",
        attribution?.source ?? null,
        attribution?.medium ?? null,
        attribution?.campaign ?? null,
        attribution?.landingPath ?? null,
      )
      .run();
  } catch (err) {
    console.error("user_context_failed", userId, kind, err instanceof Error ? err.message : String(err));
  }
}
