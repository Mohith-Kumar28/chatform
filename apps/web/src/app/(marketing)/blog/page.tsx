import type { Metadata } from "next";
import Link from "next/link";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { posts } from "@/lib/blog-source";
import { breadcrumbLd, canonical, itemListLd, openGraphBase } from "@/lib/seo";

const TITLE = "Writing — chatform";
const DESCRIPTION =
  "Notes on building a conversational form engine: the branching model, the constrained model behind the chat, and what we learned about asking people questions.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  ...canonical("/blog"),
  openGraph: { ...openGraphBase("/blog"), title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

/** The date, written the way a person reads it rather than the way it sorts. */
function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogIndexPage() {
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Writing", path: "/blog" },
          ]),
          itemListLd(posts.map((post) => ({ name: post.title, path: post.url }))),
        ]}
      />

      <Band size="tall">
        <div className="max-w-3xl">
          <BandTitle as="h1">Writing.</BandTitle>
          <BandLede className="max-w-2xl">
            How the thing is built, mostly — and the occasional argument about asking people
            questions.
          </BandLede>
        </div>

        <ul className="divide-border/60 mt-14 flex flex-col divide-y border-t border-b border-border/60">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link href={post.url} className="group flex flex-col gap-2 py-7">
                <time
                  dateTime={post.date}
                  className="text-micro text-muted-foreground tabular uppercase tracking-wide"
                >
                  {formatDate(post.date)}
                </time>
                <h2 className="text-display font-display group-hover:text-primary max-w-3xl font-bold tracking-[-0.02em] text-balance transition-colors duration-[var(--duration-micro)]">
                  {post.title}
                </h2>
                <p className="text-body text-muted-foreground max-w-2xl leading-relaxed">
                  {post.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Band>

      <CtaBand />
    </>
  );
}
