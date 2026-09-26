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
    };
    return encodeURIComponent(JSON.stringify(payload));
  } catch {
    return null;
  }
}
