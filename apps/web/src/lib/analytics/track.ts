/**
 * First-party page views, sent to the API's `/p/t` beacon and read back by the
 * platform console's Traffic and Campaigns pages. The server half is
 * `apps/api/src/lib/traffic.ts`, which names every field sent here.
 *
 * Three ids:
 *   - visitor: the device fingerprint (`lib/respondent-signal.ts`), the same
 *     one a respondent is known by, for "how many people". It survives cleared
 *     storage and private windows. Only a browser that refuses to be
 *     fingerprinted falls back to a random id in `localStorage`.
 *   - visit: random, in `sessionStorage`, rolled over after 30 idle minutes or
 *     when the tab arrives from somewhere new (another campaign link, another
 *     site). "How many visits", and what each one looked at.
 *   - user: only on the dashboard and builder, for "who is actually using it".
 *
 * Nothing here may break a page. Every storage read is wrapped, and a failed
 * send is dropped rather than retried.
 */

import { getRespondentSignal } from "@/lib/respondent-signal";

export type TrafficArea = "marketing" | "docs" | "auth" | "app" | "builder" | "form" | "embed";

export interface Beacon {
  e: "view" | "leave";
  v: string;
  /** The random id this browser was counted under before fingerprints, sent once so its history follows it. */
  pv?: string;
  s: string;
  a: TrafficArea;
  p: string;
  r?: string;
  u?: { source?: string; medium?: string; campaign?: string; content?: string };
  ad?: string;
  en?: 0 | 1;
  uid?: string;
  l?: string;
  w?: number;
  ms?: number;
  lcp?: number;
  inp?: number;
  ttfb?: number;
  cls?: number;
}

/** The fallback id, and where the id from before fingerprints may still be. */
const LEGACY_VISITOR_KEY = "cf_vid";
const VISIT_KEY = "cf_visit";
/** Set on a browser that has opened the platform console: its traffic is ours, not a visitor's. */
const INTERNAL_KEY = "cf_internal";
const IDLE_MS = 30 * 60 * 1000;

/** Click ids an ad network appends, and the name the server knows each by. */
const AD_CLICK_IDS: Record<string, string> = {
  gclid: "google",
  gbraid: "google",
  wbraid: "google",
  fbclid: "meta",
  msclkid: "microsoft",
  ttclid: "tiktok",
  li_fat_id: "linkedin",
  twclid: "x",
};

interface Visit {
  id: string;
  at: number;
  r?: string;
  u?: Beacon["u"];
  ad?: string;
  pages: number;
}

let userId: string | undefined;

/** The dashboard and builder report who is signed in; see `AuthGuard`. */
export function setTrackedUser(id: string | null | undefined): void {
  userId = id ?? undefined;
}

export function markInternalBrowser(): void {
  try {
    localStorage.setItem(INTERNAL_KEY, "1");
  } catch {
    // Storage blocked: this browser's visits keep counting.
  }
}

function isInternal(): boolean {
  try {
    return localStorage.getItem(INTERNAL_KEY) === "1";
  } catch {
    return false;
  }
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

interface Visitor {
  id: string;
  previous?: string;
}

/** Resolved once per document; every page after the first has it at hand. */
let visitor: Visitor | null = null;
let visitorPending: Promise<Visitor> | null = null;

function resolveVisitor(): Promise<Visitor> {
  visitorPending ??= getRespondentSignal().then((signal) => {
    const legacy = stored(LEGACY_VISITOR_KEY);
    if (signal) {
      visitor = { id: signal, previous: legacy ?? undefined };
      return visitor;
    }
    // No fingerprint to be had. A random id is overcounted when storage is cleared, never lost.
    const id = legacy ?? randomId();
    try {
      localStorage.setItem(LEGACY_VISITOR_KEY, id);
    } catch {
      // No storage either: a fresh id per document.
    }
    visitor = { id };
    return visitor;
  });
  return visitorPending;
}

/** The visitor id sign-up attribution should carry: the one this browser's page views are under. */
export function knownVisitorId(): string | undefined {
  return visitor?.id ?? stored("chatform:device") ?? stored(LEGACY_VISITOR_KEY) ?? undefined;
}

/** The campaign tags and ad click id on the current address, if any. */
function landingTags(): { u?: Beacon["u"]; ad?: string } {
  const params = new URLSearchParams(window.location.search);
  const u: NonNullable<Beacon["u"]> = {};
  for (const key of ["source", "medium", "campaign", "content"] as const) {
    const value = params.get(`utm_${key}`) ?? (key === "source" ? params.get("ref") ?? params.get("via") : null);
    if (value) u[key] = value.slice(0, 150);
  }
  let ad: string | undefined;
  for (const [param, network] of Object.entries(AD_CLICK_IDS)) {
    if (params.has(param)) {
      ad = network;
      break;
    }
  }
  return { u: Object.keys(u).length ? u : undefined, ad };
}

function externalReferrer(): string | undefined {
  const ref = document.referrer;
  if (!ref) return undefined;
  try {
    const host = new URL(ref).hostname;
    const own = window.location.hostname.split(".").slice(-2).join(".");
    if (host === own || host.endsWith(`.${own}`)) return undefined;
  } catch {
    return undefined;
  }
  return ref.slice(0, 1000);
}

/**
 * The current visit, started or continued. `hardLoad` is true on the first page
 * of a document, the only moment the referrer and the address say anything
 * about where the tab came from.
 */
function currentVisit(hardLoad: boolean, referrerOverride?: string): Visit {
  const now = Date.now();
  let visit: Visit | null = null;
  try {
    visit = JSON.parse(sessionStorage.getItem(VISIT_KEY) ?? "null") as Visit | null;
  } catch {
    visit = null;
  }

  const tags = hardLoad ? landingTags() : {};
  const referrer = hardLoad ? referrerOverride ?? externalReferrer() : undefined;
  const arrivedFromSomewhere = !!(tags.u || tags.ad || referrer);
  const expired = !visit || now - visit.at > IDLE_MS;

  if (expired || arrivedFromSomewhere) {
    visit = {
      id: randomId(),
      at: now,
      r: referrer,
      u: tags.u,
      ad: tags.ad,
      pages: 0,
    };
  }
  visit = visit!;
  visit.at = now;
  visit.pages += 1;
  try {
    sessionStorage.setItem(VISIT_KEY, JSON.stringify(visit));
  } catch {
    // The next page starts a new visit; nothing else is lost.
  }
  return visit;
}

function send(url: string, beacon: Beacon): void {
  const body = JSON.stringify(beacon);
  try {
    // A string body is sent as text/plain, which needs no CORS preflight.
    if (navigator.sendBeacon?.(url, body)) return;
  } catch {
    // Fall through to fetch.
  }
  void fetch(url, { method: "POST", body, keepalive: true, mode: "cors", credentials: "omit" }).catch(() => {});
}

/** Web vitals for the document, collected once per hard load. */
interface Vitals {
  lcp?: number;
  inp?: number;
  ttfb?: number;
  cls?: number;
}
let vitals: Vitals | null = null;
let vitalsSent = false;

function observeVitals(): void {
  if (vitals || typeof PerformanceObserver === "undefined") return;
  const v: Vitals = {};
  vitals = v;
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav && nav.responseStart > 0) v.ttfb = Math.round(nav.responseStart);
  const observe = (type: string, cb: (entries: PerformanceEntryList) => void) => {
    try {
      const po = new PerformanceObserver((list) => cb(list.getEntries()));
      po.observe({ type, buffered: true } as PerformanceObserverInit);
    } catch {
      // Not supported by this browser (Safari has no LCP or INP); leave it out.
    }
  };
  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1];
    if (last) v.lcp = Math.round(last.startTime);
  });
  observe("layout-shift", (entries) => {
    for (const e of entries as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (!e.hadRecentInput) v.cls = Math.round(((v.cls ?? 0) + e.value) * 1000) / 1000;
    }
  });
  observe("event", (entries) => {
    for (const e of entries as (PerformanceEntry & { interactionId?: number })[]) {
      if (e.interactionId && e.duration > (v.inp ?? 0)) v.inp = Math.round(e.duration);
    }
  });
}

let documentLoaded = false;

/**
 * Start tracking one page. Returns the function that ends it, which sends the
 * `leave` row with the time the page was actually visible.
 *
 * `sendView` replaces the default `/p/t` view: the form page posts its view to
 * the form's own counter, which writes the traffic row too, so a form view is
 * still one request.
 */
export function startPage(opts: {
  apiOrigin: string;
  area: TrafficArea;
  path: string;
  /** The embedding page's address, for a form inside someone else's site. */
  referrer?: string;
  sendView?: (beacon: Beacon) => void;
}): () => void {
  if (typeof window === "undefined" || isInternal() || navigator.webdriver) return () => {};

  const hardLoad = !documentLoaded;
  documentLoaded = true;
  if (hardLoad) observeVitals();

  const visit = currentVisit(hardLoad, opts.referrer);
  const base = (v: string): Beacon => ({
    e: "view",
    v,
    s: visit.id,
    a: opts.area,
    p: opts.path.slice(0, 300),
    r: visit.r,
    u: visit.u,
    ad: visit.ad,
    uid: opts.area === "app" || opts.area === "builder" ? userId : undefined,
  });
  const beaconUrl = `${opts.apiOrigin}/p/t`;
  const entry = visit.pages === 1 ? 1 : 0;

  // The view goes out once the fingerprint is known: at once on every page but a browser's very first.
  let viewSent = false;
  void resolveVisitor().then((who) => {
    const view: Beacon = {
      ...base(who.id),
      pv: who.previous,
      en: entry,
      l: navigator.language?.slice(0, 35),
      w: window.screen?.width || undefined,
    };
    if (opts.sendView) opts.sendView(view);
    else send(beaconUrl, view);
    viewSent = true;
    if (who.previous) {
      who.previous = undefined;
      try {
        localStorage.removeItem(LEGACY_VISITOR_KEY);
      } catch {
        // It is sent again next time, and the server has already moved the history.
      }
    }
  });

  let visibleSince: number | null = document.visibilityState === "visible" ? Date.now() : null;
  let engaged = 0;
  let ended = false;

  const flush = () => {
    if (visibleSince !== null) {
      engaged += Date.now() - visibleSince;
      visibleSince = null;
    }
    // A page left before its view could be sent has nothing to add time to.
    if (!viewSent || !visitor) return;
    if (engaged < 500 && vitalsSent) return;
    const leave: Beacon = { ...base(visitor.id), e: "leave", ms: Math.round(engaged) };
    // The user id may have arrived after the view (the session loads after the page).
    if (!vitalsSent && vitals) {
      Object.assign(leave, vitals);
      vitalsSent = true;
    }
    engaged = 0;
    send(beaconUrl, leave);
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
    else if (!ended) visibleSince = Date.now();
  };
  const onPageHide = () => flush();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    if (ended) return;
    ended = true;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    flush();
  };
}

/** Which part of the product a path belongs to. The route groups, spelled as prefixes. */
export function areaOf(pathname: string): TrafficArea | null {
  if (/^\/(admin|preview|f|pay|geo-preview|__studio-harness|og)(\/|$)/.test(pathname)) return null;
  if (/^\/docs(\/|$)|^\/llms/.test(pathname)) return "docs";
  if (/^\/(signin|signup|sign-in|sign-up|auth|forgot-password|reset-password|accept-invitation)(\/|$)/.test(pathname)) return "auth";
  if (/^\/forms\//.test(pathname)) return "builder";
  if (/^\/(dashboard|settings|billing|usage|team|templates|api-keys|account|organization)(\/|$)/.test(pathname)) return "app";
  return "marketing";
}

/**
 * Ids and tokens out of a path, so a thousand forms are one row: `/forms/abc123/build`
 * is `/forms/:id/build`. Readable slugs (a blog post, a template) stay.
 */
export function pathTemplate(pathname: string): string {
  return (
    pathname
      .split("/")
      .map((seg, i, all) => {
        if (!seg) return seg;
        if (all[i - 1] === "forms" || all[i - 1] === "accounts") return ":id";
        if (/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(seg) || (/\d/.test(seg) && /^[A-Za-z0-9_-]{16,}$/.test(seg))) return ":id";
        return seg;
      })
      .join("/")
      .slice(0, 300) || "/"
  );
}
