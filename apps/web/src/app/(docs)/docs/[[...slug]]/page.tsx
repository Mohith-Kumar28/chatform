import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from "fumadocs-ui/page";
import { source } from "@/lib/source";
import { mdxComponents } from "@/components/docs/mdx-components";
import { CopyMarkdown } from "@/components/docs/copy-markdown";
import { BlockBadges } from "@/components/docs/block-badges";

/**
 * Every docs page is prerendered.
 *
 * They change on deploy and never per request, so rendering them in the worker
 * would be work done thousands of times for one answer.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) return {};
  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: { title: page.data.title, description: page.data.description },
  };
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();

  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc} full={page.data.full} tableOfContent={{ style: "clerk" }}>
      <div className="flex items-start justify-between gap-4">
        <DocsTitle>{page.data.title}</DocsTitle>
        {/* Developers feed docs to their own assistants; making that one click
            rather than a selection drag is close to free. */}
        <CopyMarkdown slug={page.slugs} />
      </div>
      {page.data.description ? <DocsDescription>{page.data.description}</DocsDescription> : null}
      {page.data.family ? <BlockBadges family={page.data.family} type={page.slugs.at(-1) ?? ""} /> : null}
      <DocsBody>
        <MDX components={mdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}
