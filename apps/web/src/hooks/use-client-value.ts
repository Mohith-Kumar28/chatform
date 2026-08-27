"use client";

import { useSyncExternalStore } from "react";

/**
 * Reading something only the browser knows, without a hydration mismatch.
 *
 * The usual shape for this is `useState` plus `useEffect(() => setX(...), [])`,
 * which works but renders once with the placeholder and then immediately
 * re-renders — a cascading render on every mount, and the thing React's
 * `set-state-in-effect` rule exists to stop.
 *
 * `useSyncExternalStore` expresses the same intent directly: it takes a server
 * snapshot and a client snapshot and uses whichever applies, so the server and
 * the first client render agree by construction and the real value is there
 * from the first browser render onward. `subscribe` is a no-op because none of
 * these values ever change after hydration.
 */
const noopSubscribe = () => () => {};

export function useClientValue<T>(getClientValue: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, getClientValue, () => serverValue);
}

/**
 * True once the browser has taken over.
 *
 * For the case where the value itself is not the point — an icon that cannot be
 * chosen until the resolved theme is known, say.
 */
export function useHydrated(): boolean {
  return useClientValue(() => true, false);
}
