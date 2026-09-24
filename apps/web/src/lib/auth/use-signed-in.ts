"use client";

import { useEffect, useState } from "react";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://api.chatform.in";

/**
 * One cached probe, shared by every marketing page in the tab.
 *
 * Module-level so moving between marketing pages does not re-ask, and so two
 * navs (the bar and the mobile sheet) share one request rather than two.
 */
let probe: Promise<boolean> | null = null;

function askOnce(): Promise<boolean> {
  probe ??= fetch(`${API_ORIGIN}/api/auth/get-session`, { credentials: "include" })
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => Boolean(s))
    .catch(() => false);
  return probe;
}

/**
 * Is there a session? `null` until we know.
 *
 * This exists instead of better-auth's `useSession` because the marketing bar
 * is the only thing on a public page that wanted it, and importing it dragged
 * better-auth, better-auth-ui and TanStack Query onto every marketing route —
 * roughly 220 KB over the wire to decide between two words in one button.
 *
 * The endpoint is the same one better-auth's client calls; it answers `null`
 * for an anonymous visitor and the session object otherwise, and it is
 * `no-store`, so nothing here needs a cache policy of its own.
 *
 * Callers must keep treating `null` as "not yet". The bar draws a placeholder
 * for it rather than the signed-out CTA: rendering "Start free" first and
 * swapping it for "Dashboard" a moment later is what made a signed-in user
 * think every refresh had logged them out.
 */
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    askOnce().then((v) => {
      if (live) setSignedIn(v);
    });
    return () => {
      live = false;
    };
  }, []);

  return signedIn;
}
