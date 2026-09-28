"use client";

import { useEffect } from "react";
import { whenEmbedOpened } from "./embed-bridge";
import { startPage, type Beacon } from "@/lib/analytics/track";

/**
 * Fire-and-forget view counter (deduped per tab via sessionStorage).
 *
 * The first view in a tab also carries the platform's traffic row
 * (`lib/analytics/track.ts`), so it is still one request. A reload in the same
 * tab is a page view to the platform but not a new view of the form, so it goes
 * to `/p/t` alone. The time spent on the page follows there when it is left.
 */
export function ViewPing({ slug, apiOrigin }: { slug: string; apiOrigin: string }) {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // A popup preloaded behind its launcher is not a view until it is opened.
    void whenEmbedOpened().then(() => {
      if (cancelled) return;
      const key = `cf_view_${slug}`;
      const counted = !!sessionStorage.getItem(key);
      sessionStorage.setItem(key, "1");
      const params = new URLSearchParams(window.location.search);
      const embedded = params.get("embed") === "1";
      stop = startPage({
        apiOrigin,
        area: embedded ? "embed" : "form",
        path: `/f/${slug}`,
        // Inside the frame `document.referrer` is only the host's origin; the
        // embed script passes the host page itself.
        referrer: embedded ? params.get("cf_page") || params.get("cf_ref") || undefined : undefined,
        sendView: counted
          ? undefined
          : (beacon: Beacon) => {
              void fetch(`${apiOrigin}/p/forms/${slug}/view`, {
                method: "POST",
                // A string body goes as text/plain: no CORS preflight.
                body: JSON.stringify(beacon),
                keepalive: true,
              }).catch(() => {});
            },
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [slug, apiOrigin]);
  return null;
}
