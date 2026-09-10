"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";
import { API_ORIGIN } from "@/lib/api/mutator";

/**
 * The query cache, written to disk so a reload is not a cold start.
 *
 * Everything else in the caching story survives navigation only: one
 * `QueryClient` lives for the life of the tab, so moving between builder tabs
 * costs nothing. A reload threw all of it away and re-fetched the plan, the
 * workspace list, the forms grid and the entitlements payload before the first
 * pixel of real content — every time, on a page whose contents had not changed
 * since the last render of it thirty seconds earlier.
 *
 * This restores a *deliberately narrow* slice of that cache from
 * `localStorage` on boot. Restored data is treated as stale, so every query
 * still revalidates in the background on mount; the difference is that the
 * first paint has real numbers in it instead of shimmer.
 */

/** Bump when a persisted payload's shape changes; old buckets are then discarded. */
const SCHEMA_VERSION = 1;

/**
 * Keyed by API origin as well as version: pointing a local web build at
 * `localhost:8787` must not read a bucket filled by production, or the forms
 * grid restores rows from a database this build cannot see.
 */
export const CACHE_KEY = `chatform.query-cache.v${SCHEMA_VERSION}.${API_ORIGIN}`;

/**
 * A day. Long enough that yesterday's tab reopens warm, short enough that a
 * bucket abandoned on a shared machine does not linger indefinitely.
 */
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

/**
 * The allowlist — paths whose responses may be written to disk.
 *
 * An allowlist rather than a blocklist, because the failure modes point in
 * opposite directions. Forgetting to add an entry costs one refetch after a
 * reload; forgetting to *exclude* one writes somebody's survey answers to the
 * disk of whatever machine their form was opened on. The cost of being wrong is
 * not symmetric, so the default is "no".
 *
 * What is here is organization-level configuration: names, counts, plan and
 * catalogue data. None of it is respondent data.
 */
const PERSISTED_PATHS = new Set([
  // The forms grid: titles, status, counts. The first thing rendered after sign-in.
  "/api/forms",
  // Workspace names and their form counts — the switcher, on every page.
  "/api/workspaces",
  // Plan, limits, usage, role. Read by nearly every gated control; the reason
  // a padlock used to flicker over paid controls on every single reload.
  "/api/billing/entitlements",
  // The public price list.
  "/api/billing/plans",
  // The public template catalogue.
  "/api/templates",
]);

/** Public, immutable-ish detail pages under an allowlisted collection. */
const PERSISTED_PREFIXES = ["/api/templates/"];

/**
 * Deliberately absent, and each for a reason worth writing down:
 *
 * - `/api/forms/{id}/submissions` — respondent answers and full chat
 *   transcripts. The obvious one.
 * - `/api/forms/{id}/analytics` — less obvious and the reason this is an
 *   allowlist. It looks like aggregate counts, but the per-question
 *   distributions carry `samples`: verbatim free-text answers, which is the
 *   same personal data as the submissions table with a different shape around
 *   it.
 * - `/api/forms/{id}/followup-analytics` — who was emailed and whether they
 *   came back.
 * - `/api/forms/{id}` — the builder document. Not sensitive, but restoring a
 *   stale draft under an editor that autosaves is asking for a conflict dialog
 *   nobody caused. `use-autosave` already reads this one straight from the
 *   server for exactly that reason.
 * - `/api/admin/*` — cross-tenant by definition.
 * - `/api/keys` — credentials, even in the masked form.
 */
export function shouldPersistQuery(query: Query): boolean {
  // A failed or still-loading query has nothing worth restoring.
  if (query.state.status !== "success") return false;
  const path = query.queryKey[0];
  if (typeof path !== "string") return false;
  return (
    PERSISTED_PATHS.has(path) || PERSISTED_PREFIXES.some((p) => path.startsWith(p))
  );
}

/**
 * `undefined` during SSR and prerender, where there is no `window` — the
 * provider treats that as "do not persist" and renders normally.
 */
export function createCachePersister() {
  if (typeof window === "undefined") return undefined;
  try {
    // Touch it once: Safari in private mode has the API and throws on write.
    window.localStorage.setItem(`${CACHE_KEY}.probe`, "1");
    window.localStorage.removeItem(`${CACHE_KEY}.probe`);
  } catch {
    return undefined;
  }
  /*
    The async persister over synchronous `localStorage`, which reads oddly and
    is correct: `createSyncStoragePersister` is deprecated in this version of
    the library in favour of this one, and it accepts a synchronous storage
    perfectly well — the writes simply resolve immediately.
  */
  return createAsyncStoragePersister({
    storage: window.localStorage,
    key: CACHE_KEY,
    throttleTime: 1_000,
  });
}

/**
 * Drop the persisted bucket.
 *
 * Called when the signed-in identity changes — see `AuthGuard`. Sign-out runs
 * through several different components in this codebase (the user menu, the
 * Better Auth UI's own control, re-authentication, an expired session), so
 * hooking each of them would have meant the one added next quietly leaking the
 * previous account's forms list to the next person to sign in on this browser.
 * Watching the identity catches all of them, including expiry, which is not a
 * call site at all.
 */
export function purgePersistedCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* nothing to clear if we cannot reach storage */
  }
}
