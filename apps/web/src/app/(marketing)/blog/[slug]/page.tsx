import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Band } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { Prose } from "@/components/marketing/prose";
import { mdxComponents } from "@/components/docs/mdx-components";
import { JsonLd } from "@/components/seo/json-ld";
import { getPost, posts } from "@/lib/blog-source";
import { articleLd, breadcrumbLd, canonical, faqPageLd, openGraphBase } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    ...canonical(post.url),
    openGraph: {
      ...openGraphBase(post.url),
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  if (!post) notFound();

  const MDX = post.entry.body;

  return (
    <>
      <JsonLd
        nodes={[
          articleLd({
            headline: post.title,
            description: post.description,
            path: post.url,
            datePublished: post.date,
            author: post.author,
          }),
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Writing", path: "/blog" },
            { name: post.title, path: post.url },
          ]),
          ...(post.faq.length > 0 ? [faqPageLd(post.faq)] : []),
        ]}
      />

      <Band size="tall">
        <Link
          href="/blog"
          className="text-caption text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors duration-[var(--duration-micro)]"
        >
          <ArrowLeft className="size-4" />
          Writing
        </Link>

        <article className="mt-8">
          <header className="max-w-3xl">
            <time
              dateTime={post.date}
              className="text-micro text-muted-foreground tabular tracking-wide uppercase"
            >
              {new Date(`${post.date}T00:00:00Z`).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </time>
            <h1 className="font-display text-display-lg sm:text-display-xl mt-3 font-bold tracking-[-0.03em] text-balance">
              {post.title}
            </h1>
            <p className="text-body-lg text-muted-foreground mt-4 max-w-2xl leading-relaxed">
              {post.description}
            </p>
            {/* A person, when there is one. Somebody deciding whether to trust
                a comparison wants to know who wrote it, and so does Google. */}
            {post.author !== "chatform" && (
              <p className="text-caption text-muted-foreground mt-5">
                By <span className="text-foreground font-medium">{post.author}</span>
                {post.authorTitle ? `, ${post.authorTitle}` : ""}
              </p>
            )}
          </header>

          <Prose className="mt-12">
            <MDX components={mdxComponents} />
            {post.faq.length > 0 && (
              <>
                <h2>Questions people ask</h2>
                {post.faq.map((item) => (
                  <div key={item.question}>
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                  </div>
                ))}
              </>
            )}
          </Prose>
        </article>
      </Band>

      <CtaBand />
    </>
  );
}
