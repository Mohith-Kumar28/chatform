/**
 * Load a third-party checkout script once, on demand.
 *
 * The gateway SDKs are only needed by the few respondents who reach a payment
 * question, so they are fetched when Pay is tapped rather than shipped in the
 * chat bundle or put in a `<script>` tag on every form. The site's CSP sets only
 * `frame-ancestors`, so nothing has to be allow-listed for this to work.
 *
 * Memoised per URL: a second tap, a retry or a second payment block on the same
 * form gets the promise the first one started instead of a second copy of the
 * SDK — two copies of Razorpay's checkout.js register two sets of listeners and
 * open two modals. A load that FAILED is forgotten, though, because the usual
 * cause is a flaky network or an ad blocker the respondent can turn off, and a
 * cached rejection would make "Try again" a button that can never work.
 *
 * A load that only TIMED OUT is a different thing, and is not forgotten the same
 * way. The waiter gives up, but the `<script>` tag is still in the page and still
 * loading, and on slow 3G it may yet arrive. Appending a second tag for the retry
 * then executed the SDK twice — the very thing memoising exists to prevent. So
 * the tag is tracked apart from whoever is waiting on it: a retry waits on the
 * tag already there, and a tag that lands after everyone gave up still counts as
 * loaded for the next tap.
 */

/** Long enough for a slow 3G fetch; short enough that a blocked script is not a silent hang. */
export const SCRIPT_TIMEOUT_MS = 20000;

/** What a caller is handed: settled, or waiting on a tag. */
const pending = new Map<string, Promise<void>>();

/** Tags in the page that have not finished, and who is waiting on each. */
const loading = new Map<string, Set<(ok: boolean) => void>>();

/** The slice of `document` this needs, so a test can hand it a fake one. */
export interface ScriptHost {
  createElement(tag: "script"): HTMLScriptElement;
  head: { appendChild(node: HTMLScriptElement): unknown };
}

export function loadScript(
  src: string,
  opts: { host?: ScriptHost; timeoutMs?: number } = {},
): Promise<void> {
  const existing = pending.get(src);
  if (existing) return existing;

  const host = opts.host ?? (typeof document === "undefined" ? null : (document as unknown as ScriptHost));
  if (!host) return Promise.reject(new Error("script_unavailable"));

  let waiters = loading.get(src);
  if (!waiters) {
    const tagWaiters = new Set<(ok: boolean) => void>();
    waiters = tagWaiters;
    loading.set(src, tagWaiters);
    const el = host.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => {
      loading.delete(src);
      // Nobody may be waiting any more; the next tap still finds it loaded.
      if (!pending.has(src)) pending.set(src, Promise.resolve());
      for (const settle of [...tagWaiters]) settle(true);
    };
    el.onerror = () => {
      loading.delete(src);
      for (const settle of [...tagWaiters]) settle(false);
    };
    host.head.appendChild(el);
  }

  const tagWaiters = waiters;
  const promise: Promise<void> = new Promise<void>((resolve, reject) => {
    const forget = () => {
      tagWaiters.delete(settle);
      if (pending.get(src) === promise) pending.delete(src);
    };
    const timer = setTimeout(() => {
      forget();
      reject(new Error("script_timeout"));
    }, opts.timeoutMs ?? SCRIPT_TIMEOUT_MS);
    const settle = (ok: boolean) => {
      clearTimeout(timer);
      tagWaiters.delete(settle);
      if (ok) {
        resolve();
        return;
      }
      forget();
      reject(new Error("script_failed"));
    };
    tagWaiters.add(settle);
  });
  pending.set(src, promise);
  return promise;
}

/** Tests only: forget every script, so each case starts from a cold page. */
export function resetLoadedScripts(): void {
  pending.clear();
  loading.clear();
}
