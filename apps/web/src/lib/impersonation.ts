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

export function startImpersonation(value: Impersonation): void {
  sessionStorage.setItem(KEY, JSON.stringify(value));
  /**
   * A hard reload rather than a router push.
   *
   * Every cached react-query entry in the tab belongs to the admin's own
   * account, and a soft navigation would show the customer's shell wrapped
   * around the admin's data until each query happened to refetch. Reloading
   * throws the whole cache away, which is the only way the next paint is
   * unambiguously the customer's.
   */
  window.location.assign(new URL("/dashboard", window.location.origin));
}

export function stopImpersonation(): void {
  sessionStorage.removeItem(KEY);
  window.location.assign(new URL("/admin", window.location.origin));
}
