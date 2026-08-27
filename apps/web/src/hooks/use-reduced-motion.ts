"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the visitor asked for less motion.
 *
 * Deliberately not `useReducedMotion()` from `motion`: that hook is wired to
 * motion's own automatic degradation, which strips transform values from the
 * client render while the server has already written them into the HTML. The
 * result is a hydration mismatch on every reduced-motion visit. The marketing
 * tree turns that degradation off (see `MarketingMotionConfig`) and decides for
 * itself, which is what this hook is for.
 *
 * `useSyncExternalStore` with a `false` server snapshot means the server and
 * the first client render always agree; the real value arrives immediately
 * after hydration. Only ever use it for things that are NOT in the server HTML
 * — a transition duration, a decision to skip a typewriter.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
