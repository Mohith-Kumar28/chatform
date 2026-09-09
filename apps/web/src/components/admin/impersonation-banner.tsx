"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Eye, X } from "lucide-react";
import { readImpersonation, stopImpersonation, type Impersonation } from "@/lib/impersonation";

/**
 * The bar that says you are not yourself.
 *
 * Rendered inside the *product* shell, not the console — the whole risk of
 * impersonation is forgetting you are in it and mistaking a customer's account
 * for your own, and the moment that matters is while you are looking at their
 * dashboard.
 *
 * So it is fixed to the top of the viewport, in the warning colour, above
 * everything, and it does not dismiss. An impersonation banner you can close is
 * an impersonation banner you will close.
 */

/**
 * `sessionStorage` is an external store, so it is read through the hook React
 * provides for external stores rather than copied into state from an effect.
 *
 * The snapshot has to be *referentially stable* or `useSyncExternalStore` will
 * re-render forever, so the parsed object is cached against the raw string it
 * came from and only rebuilt when that string actually changes.
 */
let cachedRaw: string | null = null;
let cachedValue: Impersonation | null = null;

function getSnapshot(): Impersonation | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem("chatform.impersonation");
  } catch {
    // A browser blocking site data is a browser with no impersonation, not a crash.
    return null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = readImpersonation();
  }
  return cachedValue;
}

/** Nothing on the server: `sessionStorage` does not exist there. */
function getServerSnapshot(): Impersonation | null {
  return null;
}

function subscribe(onChange: () => void): () => void {
  // Storage events only fire for *other* tabs, and the token can also simply
  // expire, so this polls as well. A token has an hour on it; ten seconds is
  // more than precise enough and costs one `getItem`.
  const timer = setInterval(onChange, 10_000);
  window.addEventListener("storage", onChange);
  return () => {
    clearInterval(timer);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Whether this tab is currently acting as somebody else.
 *
 * Shared with the app shell, which uses it to hide the identity chrome that
 * would otherwise show the admin's own organization over the customer's data.
 */
export function useImpersonation(): Impersonation | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Minutes remaining, recomputed on a timer rather than read from the clock during render. */
function useMinutesLeft(expiresAt: number | undefined): number {
  const [minutes, setMinutes] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setMinutes(Math.max(0, Math.round((expiresAt - Date.now()) / 60_000)));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return minutes;
}

export function ImpersonationBanner() {
  const acting = useImpersonation();
  const minutesLeft = useMinutesLeft(acting?.expiresAt);

  if (!acting) return null;

  return (
    <div className="sticky top-0 z-50 bg-[var(--warning)] text-[color:var(--warning-foreground,#1a1205)]">
      <div className="mx-auto flex w-full max-w-[110rem] items-center gap-3 px-4 py-2 text-sm sm:px-6">
        <Eye className="size-4 shrink-0" strokeWidth={2} aria-hidden />
        <p className="min-w-0 flex-1 truncate">
          You are acting as <strong>{acting.user.name || acting.user.email}</strong> ({acting.user.email}). Everything
          you do here is recorded against your own account.
        </p>
        <span className="hidden shrink-0 tabular-nums opacity-80 sm:inline">{minutesLeft}m left</span>
        <button
          type="button"
          onClick={stopImpersonation}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-black/15 px-2 py-1 text-xs font-medium transition-colors duration-[var(--duration-micro)] hover:bg-black/25"
        >
          <X className="size-3.5" strokeWidth={2.25} aria-hidden />
          Stop
        </button>
      </div>
    </div>
  );
}
