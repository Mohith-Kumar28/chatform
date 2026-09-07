import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://chatform.in";

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
        disallow: [
          "/dashboard",
          "/forms/",
          "/preview/",
          "/api/",
          "/settings",
          "/usage",
          // Still listed: they resolve as redirects into /settings, and a
          // crawler that already knows them should not follow one to find out.
          "/team",
          "/api-keys",
          "/account",
          "/organization",
          "/billing",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
