import { defineDocs, defineConfig, frontmatterSchema } from "fumadocs-mdx/config";
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

export default defineConfig();
