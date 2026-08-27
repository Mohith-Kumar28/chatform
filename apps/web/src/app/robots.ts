import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://chatform.dev";

/**
 * The app and the hosted forms stay out of the index: `/f/*` pages honour
 * their own `noIndex` meta per form, and nothing behind the session guard
 * should be crawled at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/forms/", "/preview/", "/api/", "/team", "/usage", "/api-keys", "/billing"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
