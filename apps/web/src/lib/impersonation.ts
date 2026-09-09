/**
 * The impersonation token, and who it is for.
 *
 * In `sessionStorage` rather than a cookie or `localStorage`, which is three
 * decisions:
 *
 *   - **Not a cookie**, because the API must never receive it by accident. It is
 *     attached deliberately by `customFetch`, so no request carries it unless
 *     the code meant it to.
 *   - **Session, not local**, so closing the tab ends it. Coming back tomorrow
 *     to find yourself still inside a customer's account is exactly the failure
 *     mode to design out.
 *   - **Per tab**, so the console can stay open in one tab while another acts as
 *     the customer.
 *
 * The token itself is a signed assertion the API re-verifies on every request —
 * including re-checking that the holder is still an allowlisted admin — so
 * nothing here is a security boundary. This is convenience storage.
 */

const KEY = "chatform.impersonation";

export interface Impersonation {
  token: string;
  expiresAt: number;
  user: { id: string; name: string; email: string };
}

/** Reads and expires in one step: a stale token is the same as no token. */
export function readImpersonation(): Impersonation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Impersonation;
    if (!value?.token || value.expiresAt < Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/**
 * Open a second tab that will become the customer, and leave this one alone.
 *
 * The console used to navigate itself into the customer's account, which meant
 * losing the account page you were reading — and the ticket, and the audit log,
 * and whatever you were about to compare against. Support work is two-tab work.
 *
 * The new tab mints its *own* token rather than being handed this one, and that
 * is the point of routing through a URL instead of through storage. The
 * alternative — write the token here, then rely on the browser cloning
 * `sessionStorage` into the opened tab — leaves a live customer token sitting in
 * the console's own tab, where the very next request would silently carry it.
 * The console must never hold one. Cookies are shared across tabs, so the new
 * tab can authenticate as the admin and ask for the token itself.
 *
 * Must be called straight from the click, with nothing awaited first, or the
 * popup blocker eats the tab.
 */
export function openImpersonationTab(params: {
  userId: string;
  orgId?: string;
  reason: string;
}): Window | null {
  const url = new URL("/admin/act", window.location.origin);
  url.searchParams.set("user", params.userId);
  if (params.orgId) url.searchParams.set("org", params.orgId);
  if (params.reason) url.searchParams.set("reason", params.reason);
  // No `noopener`: the opened tab keeps a handle on this one, which is what
  // lets "Stop" close itself and hand the admin back to the console.
  return window.open(url.toString(), "_blank");
}

/**
 * Store the token and hand the tab to the product.
 *
 * `replace`, not `assign`, so Back does not return to a page whose only job was
 * to redirect. A full page load rather than a router push, because every cached
 * react-query entry in the tab belongs to whoever it was before — reloading
 * throws the whole cache away, which is the only way the next paint is
 * unambiguously the customer's.
 */
export function beginImpersonation(value: Impersonation): void {
  sessionStorage.setItem(KEY, JSON.stringify(value));
  window.location.replace(new URL("/dashboard", window.location.origin));
}

/**
 * Stop being them.
 *
 * When this tab was opened by the console it is closed outright — the admin
 * still has the account page they started from, and returning them to a second
 * copy of the console is clutter. When it was not (the token was minted here
 * before impersonation moved to its own tab, or the tab was restored), it falls
 * back to a full load of the console, which is also what discards the
 * customer's cached data.
 */
export function stopImpersonation(): void {
  sessionStorage.removeItem(KEY);
  if (window.opener && !window.opener.closed) {
    window.close();
    // `close()` is ignored for tabs the script did not open. If we are still
    // here a moment later, take the long way instead of stranding the admin on
    // a customer's dashboard.
    setTimeout(() => window.location.assign(new URL("/admin", window.location.origin)), 250);
    return;
  }
  window.location.assign(new URL("/admin", window.location.origin));
}
