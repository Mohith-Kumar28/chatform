import { notFound } from "next/navigation";
import { source } from "@/lib/source";

/**
 * Every documentation page, again, as its own markdown source.
 *
 * `llms.txt` has been telling assistants for months that "every page below is
 * also available as markdown by appending `.md` to its URL", and the "Copy as
 * markdown" button in the docs header fetches exactly that URL. Neither was
 * true: `/docs/quickstart.md` fell through the docs catch-all as a slug of
 * `["quickstart.md"]`, missed, and 404'd in production.
 *
 * This is the route that makes the promise true. The public URL stays
 * `/docs/<path>.md` — a rewrite in `next.config.ts` maps it here, because a
 * Next segment cannot itself carry a file extension and `route.ts` cannot sit
 * beside the `page.tsx` that already owns `/docs/[[...slug]]`.
 *
 * `getText("raw")` is fumadocs-mdx's own accessor and reads the original file
 * from disk. That is a filesystem read, which is why this route is
 * `force-static` with every path pre-generated: the reads all happen during
 * `next build`, and the worker only ever serves the strings they produced.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return source.generateParams();
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const raw = await page.data.getText("raw");

  return new Response(raw, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      /**
       * Same shape as the OG route: cheap for a browser, long-lived at the
       * edge, and it only changes on deploy anyway.
       */
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
