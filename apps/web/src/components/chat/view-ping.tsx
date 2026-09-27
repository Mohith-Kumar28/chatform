"use client";

import { useEffect } from "react";
import { whenEmbedOpened } from "./embed-bridge";

/** Fire-and-forget view counter (deduped per tab via sessionStorage). */
export function ViewPing({ slug, apiOrigin }: { slug: string; apiOrigin: string }) {
  useEffect(() => {
    // A popup preloaded behind its launcher is not a view until it is opened.
    void whenEmbedOpened().then(() => {
      const key = `cf_view_${slug}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      void fetch(`${apiOrigin}/p/forms/${slug}/view`, { method: "POST" }).catch(() => {});
    });
  }, [slug, apiOrigin]);
  return null;
}
