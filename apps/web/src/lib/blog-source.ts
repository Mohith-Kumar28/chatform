import { blog } from "../../.source/server";

/**
 * The blog collection, sorted and given URLs.
 *
 * Deliberately not run through fumadocs' `loader()` the way `source.ts` does
 * for the docs. `loader()` builds a page tree — folders, `meta.json` ordering,
 * a sidebar — and a blog has none of that. What it has is a date, and the only
 * ordering question is which post is newest.
 */

export interface BlogPost {
  slug: string;
  /** `/blog/<slug>`, computed once so nothing downstream reassembles it. */
  url: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: readonly string[];
  /** The compiled MDX body, and the raw source for the markdown mirror. */
  entry: (typeof blog)[number];
}

function toPost(entry: (typeof blog)[number]): BlogPost {
  /* `info.path` is the virtualised path inside content/blog — `foo.mdx`. */
  const slug = entry.info.path.replace(/\.mdx?$/, "");
  return {
    slug,
    url: `/blog/${slug}`,
    title: entry.title,
    description: entry.description ?? "",
    date: entry.date,
    author: entry.author,
    tags: entry.tags,
    entry,
  };
}

/** Newest first. Ties broken by title so the order is stable across builds. */
export const posts: readonly BlogPost[] = blog
  .map(toPost)
  .sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : b.date.localeCompare(a.date)));

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((post) => post.slug === slug);
}
