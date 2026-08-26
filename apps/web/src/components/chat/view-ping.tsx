"use client";

import { useEffect } from "react";

/** Fire-and-forget view counter (deduped per tab via sessionStorage). */
export function ViewPing({ slug, apiOrigin }: { slug: string; apiOrigin: string }) {
  useEffect(() => {
    const key = `cf_view_${slug}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void fetch(`${apiOrigin}/p/forms/${slug}/view`, { method: "POST" }).catch(() => {});
  }, [slug, apiOrigin]);
  return null;
}
