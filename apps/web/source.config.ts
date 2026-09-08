import { defineCollections, defineDocs, defineConfig, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

/**
 * The docs collection.
 *
 * Two frontmatter fields beyond the defaults, both there to keep generated and
 * handwritten pages honest about which they are: `generated` badges a page whose
 * source is a script, and `llmsExclude` keeps the generated operation pages out
 * of llms-full.txt, where they would be a great deal of boilerplate that
 * `/openapi.json` already says better and in one file.
 */
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema.extend({
      generated: z.boolean().default(false),
      /** Block reference pages only: drives the family pill. */
      family: z
        .enum(["content", "text", "contact", "number", "choice", "scale", "advanced"])
        .optional(),
      llmsExclude: z.boolean().default(false),
    }),
  },
});

/**
 * The blog, as a second collection rather than a second docs tree.
 *
 * It deliberately does not go through `defineDocs`: docs get a page tree, a
 * sidebar and `meta.json` ordering, and a blog has none of those — it is a
 * reverse-chronological list, and the ordering key is the `date` below. Sharing
 * the docs collection would also put marketing posts in the docs sidebar and in
 * `llms.txt`'s Documentation section, which are two places they do not belong.
 *
 * `date` is a string rather than a `z.date()` because MDX frontmatter is YAML
 * and a bare `2026-09-08` parses to a Date in one YAML dialect and a string in
 * another. Pinning it to an ISO string keeps the value the author typed, and
 * `Article`'s `datePublished` wants that string anyway.
 */
export const blog = defineCollections({
  type: "doc",
  dir: "content/blog",
  schema: frontmatterSchema.extend({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date: YYYY-MM-DD"),
    author: z.string().default("chatform"),
    tags: z.array(z.string()).default([]),
  }),
});

export default defineConfig();
