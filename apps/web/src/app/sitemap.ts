import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://chatform.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/signin`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
