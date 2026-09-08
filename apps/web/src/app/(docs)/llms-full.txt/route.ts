import { source } from "@/lib/source";
import { SITE_ORIGIN } from "@/lib/seo";

/**
 * The whole corpus in one file.
 *
 * Curated rather than complete: the generated per-operation reference pages are
 * excluded, because /openapi.json already says all of that in one machine-
 * readable file and inlining seventy of them would bury the guides in
 * boilerplate.
 *
 * It now contains the documents rather than a list of links to them, which is
 * what the name has always claimed. The previous version emitted a title, a
 * description and a `Source:` line per page — a table of contents wearing the
 * name of a corpus, and useless to the one caller it exists for, which is a
 * model that wanted the text in a single fetch.
 *
 * `getText("raw")` is fumadocs-mdx's own accessor for the original file. It
 * reads from disk, which is why this route stays `force-static`: the reads
 * happen during `next build`.
 */
export const dynamic = "force-static";

export async function GET() {
  const pages = source.getPages().filter((page) => !page.data.llmsExclude);

  const sections = await Promise.all(
    pages.map(async (page) => {
      const raw = await page.data.getText("raw");
      return [`# ${page.data.title}`, "", `Source: ${SITE_ORIGIN}${page.url}`, "", raw].join("\n");
    }),
  );

  return new Response(sections.join("\n\n---\n\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
