import { source } from "@/lib/source";

/**
 * The whole corpus in one file.
 *
 * Curated rather than complete: the generated per-operation reference pages are
 * excluded, because /openapi.json already says all of that in one machine-
 * readable file and inlining seventy of them would bury the guides in
 * boilerplate.
 */
export const dynamic = "force-static";

export function GET() {
  /**
   * Titles, descriptions and links rather than full bodies.
   *
   * The compiled MDX does not carry its own source, and re-reading every file at
   * request time is exactly the filesystem access the rest of this pipeline
   * avoids. Each entry points at the page's own `.md`, which serves the source.
   */
  const body = source
    .getPages()
    .filter((page) => !page.data.llmsExclude)
    .map((page) =>
      [
        `# ${page.data.title}`,
        page.data.description ?? "",
        "",
        `Source: https://chatform.in${page.url}.md`,
      ].join("\n"),
    )
    .join("\n\n---\n\n");

  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
