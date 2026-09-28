"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { areaOf, pathTemplate, startPage } from "@/lib/analytics/track";

/**
 * A page view on every route change, for the platform console's Traffic page.
 *
 * The respondent form page reports its own view through `ViewPing`, which
 * waits for an embed to actually open; this skips `/f/*` for that reason. See
 * `lib/analytics/track.ts`.
 */
export function Track({ apiOrigin }: { apiOrigin: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const area = areaOf(pathname);
    if (!area) return;
    return startPage({ apiOrigin, area, path: pathTemplate(pathname) });
  }, [apiOrigin, pathname]);
  return null;
}
