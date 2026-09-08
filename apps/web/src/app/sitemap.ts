import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { posts } from "@/lib/blog-source";
import { COMPARISONS } from "@/content/compare";
import { USE_CASES } from "@/content/use-cases";
import { SITE_ORIGIN } from "@/lib/seo";

/**
 * Every public URL, composed from the same registries the pages render from.
 *
 * Nothing here is a hand-written list of the new routes, deliberately. The
 * comparison entries come from `content/compare`, the posts from the blog
 * collection, the docs from the Fumadocs tree — so a page that exists is in the
 * sitemap, and a page that is deleted leaves it, without anyone remembering to
 * come here.
 *
 * `lastModified` is set only where a real date exists. Blog posts have one in
 * their frontmatter. Everything else would have to use the build timestamp,
 * which would tell a crawler that all 145 pages changed every time anything
 * deployed — a signal that is worse than no signal, and the reason it was
 * probably right to have omitted the field entirely before.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_ORIGIN}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_ORIGIN}/why-conversation-works`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_ORIGIN}/compare`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_ORIGIN}/use-cases`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_ORIGIN}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_ORIGIN}/ai-info`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_ORIGIN}/signin`, changeFrequency: "yearly", priority: 0.3 },

    ...USE_CASES.map((entry) => ({
      url: `${SITE_ORIGIN}${entry.path}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),

    ...COMPARISONS.map((entry) => ({
      url: `${SITE_ORIGIN}${entry.path}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),

    ...posts.map((post) => ({
      url: `${SITE_ORIGIN}${post.url}`,
      lastModified: new Date(`${post.date}T00:00:00Z`),
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),

    /**
     * Every documentation page, enumerated from the same tree that renders them
     * — a hand-maintained list here would be wrong the first time a page was
     * added, and silently.
     */
    ...source.getPages().map((page) => ({
      url: `${SITE_ORIGIN}${page.url}`,
      changeFrequency: "weekly" as const,
      priority: page.url === "/docs" ? 0.9 : 0.6,
    })),
  ];
}
