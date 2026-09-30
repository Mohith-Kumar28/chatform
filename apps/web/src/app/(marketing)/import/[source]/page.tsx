import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, CircleAlert } from "lucide-react";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { ImportWidget } from "@/components/import/import-widget";
import { JsonLd } from "@/components/seo/json-ld";
import { IMPORT_PAGES, importPage } from "@/content/import-sources";
import { breadcrumbLd, canonical, faqPageLd, openGraphBase } from "@/lib/seo";

/**
 * One page per builder we import from: `/import/typeform`, `/import/google-forms`,
 * `/import/tally`. The converter is the page; the lists under it are what the
 * importer really keeps and really drops (see `content/import-sources.ts`).
 */
export function generateStaticParams() {
  return IMPORT_PAGES.map((p) => ({ source: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ source: string }> }): Promise<Metadata> {
  const page = importPage((await params).source);
  if (!page) return {};
  const path = `/import/${page.slug}`;
  return {
    title: { absolute: page.title },
    description: page.description,
    ...canonical(path),
    openGraph: { ...openGraphBase(path), title: page.title, description: page.description },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ImportSourcePage({ params }: { params: Promise<{ source: string }> }) {
  const page = importPage((await params).source);
  if (!page) notFound();
  const path = `/import/${page.slug}`;

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: `${page.name} to chatform`, path },
          ]),
          faqPageLd(page.faq),
        ]}
      />

      <Band size="tall">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <div className="max-w-xl">
            <p className="text-caption text-muted-foreground">{page.name} to chatform</p>
            <BandTitle as="h1" className="mt-3">
              {page.h1}
            </BandTitle>
            <BandLede>{page.lede}</BandLede>
          </div>
          <ImportWidget initial={page.source} />
        </div>
      </Band>

      <Band tone="sand">
        <div className="grid gap-10 md:grid-cols-2 md:gap-14">
          <div>
            <h2 className="font-display text-xl font-semibold">What comes with you</h2>
            <ul className="mt-5 space-y-3">
              {page.comesWith.map((line) => (
                <li key={line} className="flex gap-3 text-sm">
                  <Check className="text-foreground mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">Worth a check</h2>
            <ul className="mt-5 space-y-3">
              {page.check.map((line) => (
                <li key={line} className="text-muted-foreground flex gap-3 text-sm">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Band>

      <Band>
        <div className="max-w-2xl">
          <BandTitle>Questions</BandTitle>
          <dl className="mt-8 space-y-7">
            {page.faq.map((f) => (
              <div key={f.question}>
                <dt className="font-medium">{f.question}</dt>
                <dd className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
