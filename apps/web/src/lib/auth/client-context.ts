import { knownVisitorId } from "@/lib/analytics/track";
/**
 * What this browser says about itself when its person signs up or in, sent as
 * the `x-chatform-client` header on those auth calls. The API adds geo, network
 * and device from the edge and keeps the lot on the account; see
 * `apps/api/src/lib/user-context.ts`.
 *
 * The page and referrer are this browser's first visit, not the sign-up page:
 * by the time anybody reaches `/sign-up` the ad click or the link that brought
 * them is two pages behind. Remembered once, in `localStorage`, by
 * `rememberFirstTouch`.
 *
 * Every read is wrapped: none of this is worth a sign-in failing.
 */

const KEY = "cf_first_touch";

interface FirstTouch {
  pageUrl: string;
  referrer?: string;
}

/** Only UTMs survive from the address: the rest of a query can be a token. */
function landingUrl(): string {
  const url = new URL(window.location.origin + window.location.pathname);
  for (const [key, value] of new URLSearchParams(window.location.search)) {
    if (key.startsWith("utm_")) url.searchParams.set(key, value.slice(0, 300));
  }
  return url.toString().slice(0, 1000);
}

export function rememberFirstTouch(): void {
  try {
    if (localStorage.getItem(KEY)) return;
    const touch: FirstTouch = { pageUrl: landingUrl() };
    const ref = document.referrer;
    if (ref && !ref.startsWith(window.location.origin)) touch.referrer = ref.slice(0, 1000);
    localStorage.setItem(KEY, JSON.stringify(touch));
  } catch {
    // Storage blocked: the sign-up is recorded without where they first landed.
  }
}

export function clientContextHeader(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let touch: Partial<FirstTouch> = {};
    try {
      touch = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<FirstTouch>;
    } catch {
      touch = {};
    }
    const payload = {
      pageUrl: touch.pageUrl ?? landingUrl(),
      referrer: touch.referrer,
      language: navigator.language?.slice(0, 35),
      screen: window.screen?.width ? `${window.screen.width}x${window.screen.height}` : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...trackedTouch(),
    };
    return encodeURIComponent(JSON.stringify(payload));
  } catch {
    return null;
  }
}

/**
 * The page-view tracker's ids and the visit's own source (`lib/analytics/track.ts`),
 * so a sign-up joins to the visits before it and is credited to the campaign
 * that brought this visit, not only to the first page ever seen.
 */
function trackedTouch(): { visitorId?: string; lastTouch?: { referrer?: string; utm?: Record<string, string>; ad?: string } } {
  try {
    const visitorId = knownVisitorId();
    const visit = JSON.parse(sessionStorage.getItem("cf_visit") ?? "null") as {
      r?: string;
      u?: Record<string, string>;
      ad?: string;
    } | null;
    const lastTouch = visit && (visit.r || visit.u || visit.ad) ? { referrer: visit.r, utm: visit.u, ad: visit.ad } : undefined;
    return { visitorId, lastTouch };
  } catch {
    return {};
  }
}

/**
 * The same payload as a cookie, for a Google sign-up.
 *
 * That account is created on the OAuth callback, a redirect from Google that
 * carries no custom header, so the header alone left every Google sign-up
 * without a source. Set on the parent domain so the API host receives it, for
 * fifteen minutes, which is longer than any consent screen.
 */
export function stashClientContextCookie(value: string): void {
  try {
    const host = window.location.hostname;
    const parent = /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(host) ? "" : `; domain=${host.split(".").slice(-2).join(".")}`;
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `cf_client=${value}; path=/; max-age=900; samesite=lax${parent}${secure}`;
  } catch {
    // The sign-up still happens, without a source.
  }
}
