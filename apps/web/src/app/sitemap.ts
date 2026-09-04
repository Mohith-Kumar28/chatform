import type { MetadataRoute } from "next";
import { source } from "@/lib/source";

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://chatform.in";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/signin`, changeFrequency: "yearly", priority: 0.3 },
    /**
     * Every documentation page, enumerated from the same tree that renders them
     * — a hand-maintained list here would be wrong the first time a page was
     * added, and silently.
     */
    ...source.getPages().map((page) => ({
      url: `${SITE}${page.url}`,
      changeFrequency: "weekly" as const,
      priority: page.url === "/docs" ? 0.9 : 0.6,
    })),
  ];
}
