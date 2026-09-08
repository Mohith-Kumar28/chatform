import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { HeadToHead } from "@/components/marketing/head-to-head";
import { JsonLd } from "@/components/seo/json-ld";
import { COMPARISONS, getComparison } from "@/content/compare";
import { breadcrumbLd, canonical, faqPageLd, openGraphBase } from "@/lib/seo";

/**
 * Every comparison page, from one template.
 *
 * The slug is the search phrase and it sits at the root — `/typeform-alternative`,
 * not `/alternatives/typeform`. That is not a stylistic preference: every page
 * that actually ranks for these terms does it this way, and the two candidate
 * shapes would otherwise split the same intent across two URL families.
 *
 * `dynamicParams = false` is what makes a root-level dynamic segment safe. It
 * catches every unmatched path at the top of the site, so without this an
 * unknown URL would render an empty comparison instead of a 404. Static
 * segments still win — `/pricing` and `/compare` are matched before this ever
 * runs.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPARISONS.map((entry) => ({ comparison: entry.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ comparison: string }>;
}): Promise<Metadata> {
  const { comparison } = await params;
  const entry = getComparison(comparison);
  if (!entry) return {};

  return {
    title: { absolute: entry.title },
    description: entry.description,
    ...canonical(entry.path),
    openGraph: {
      ...openGraphBase(entry.path),
      title: entry.title,
      description: entry.description,
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ comparison: string }>;
}) {
  const { comparison } = await params;
  const entry = getComparison(comparison);
  if (!entry) notFound();

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Compare", path: "/compare" },
            { name: `${entry.competitor} alternative`, path: entry.path },
          ]),
          faqPageLd(entry.faq),
        ]}
      />

      <Band size="tall">
        <div className="max-w-3xl">
          <BandTitle as="h1">{entry.h1}</BandTitle>
          <BandLede className="max-w-2xl">{entry.lede}</BandLede>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" shape="pill" className="h-12 px-8">
              <Link href="/signin">
                Start free
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" shape="pill" variant="outline" className="h-12 px-8">
              <Link href="#compare">See the table</Link>
            </Button>
          </div>
          <p className="text-caption text-muted-foreground mt-5">
            Unlimited forms and responses on the free plan · No card
          </p>
        </div>
      </Band>

      {/*
        The concession, and it runs before the table on purpose.

        A comparison page that opens by winning is read as an advertisement and
        discounted entirely, including the parts that are true. Naming where the
        competitor is genuinely the better answer — first, in full sentences, at
        the top — is what buys the rest of the page. The readers it sends away
        were never going to stay.
      */}
      <Band tone="sand">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <BandTitle>When {entry.competitor} is still the right answer.</BandTitle>
            <BandLede tone="sand">We would rather you found this out here than after switching.</BandLede>
          </div>
          <div className="flex flex-col gap-6">
            <p className="text-body-lg leading-relaxed">{entry.whoShouldStay}</p>
            <ul className="flex flex-col gap-3">
              {entry.theirStrengths.map((strength) => (
                <li key={strength} className="text-body flex gap-3 leading-relaxed">
                  <Check className="text-muted-foreground mt-1 size-4 shrink-0" strokeWidth={2} aria-hidden />
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Band>

      <Band id="compare">
        <div className="max-w-2xl">
          <BandTitle>chatform and {entry.competitor}, line by line.</BandTitle>
          <BandLede>Read from the same table the pricing page uses, so it can only be wrong once.</BandLede>
        </div>
        <div className="mt-12">
          <HeadToHead
            competitor={entry.competitor}
            vendorIndex={entry.vendorIndex}
            extra={entry.extraRows}
          />
        </div>
      </Band>

      <Band tone="brand" size="tall">
        <div className="max-w-2xl">
          <BandTitle>What you get here instead.</BandTitle>
          <BandLede tone="brand">Four differences that are worth switching a form for — and only four.</BandLede>
        </div>
        <ul className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {entry.ourStrengths.map((strength) => (
            <li key={strength.title}>
              <h3 className="text-h2 font-semibold">{strength.title}</h3>
              <p
                className="text-body mt-2.5 leading-relaxed"
                style={{ color: "var(--on-band-vivid-muted)" }}
              >
                {strength.body}
              </p>
            </li>
          ))}
        </ul>
      </Band>

      <Band tone="sand">
        <div className="max-w-2xl">
          <BandTitle>What each one costs.</BandTitle>
          <BandLede tone="sand">
            Annual figures where both vendors print one, read on the dates listed below.
          </BandLede>
        </div>
        <dl className="border-border/70 mt-12 divide-border/50 divide-y overflow-hidden rounded-2xl border bg-background">
          {entry.pricing.map((row) => (
            <div key={row.label} className="grid gap-2 px-5 py-5 sm:grid-cols-[1fr_1fr_1fr] sm:gap-6">
              <dt className="text-body font-medium">{row.label}</dt>
              <dd className="text-body">
                <span className="text-micro text-muted-foreground block sm:hidden">chatform</span>
                <span className="text-primary font-semibold">{row.us}</span>
              </dd>
              <dd className="text-body">
                <span className="text-micro text-muted-foreground block sm:hidden">{entry.competitor}</span>
                {row.them}
                {row.note && (
                  <span className="text-micro text-muted-foreground mt-1 block leading-snug">{row.note}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Band>

      <Band tone="content">
        <div className="max-w-2xl">
          <BandTitle>The questions people actually type.</BandTitle>
          <BandLede tone="content">Answered in full, rather than folded behind a click.</BandLede>
        </div>
        {/*
          Not an accordion. These answers are the reason the page exists, for a
          reader and for anything summarising the page on someone's behalf, and
          a collapsed answer is one more thing between them and it.
        */}
        <div className="mt-12 grid gap-x-12 gap-y-9 lg:grid-cols-2">
          {entry.faq.map((item) => (
            <div key={item.question}>
              <h3 className="text-h2 font-semibold text-balance">{item.question}</h3>
              <p
                className="text-body mt-2.5 leading-relaxed"
                style={{ color: "var(--on-band-vivid-muted)" }}
              >
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </Band>

      {/*
        Sources and Updates.

        A comparison page is the easiest kind to write and the easiest kind to
        be quietly wrong about six months later, when somebody changes a price
        and nobody here notices. Printing the pages the numbers came from, and
        the date each was last read, is what makes that drift findable by a
        reader rather than only by us.
      */}
      <Band size="tight">
        <div className="grid gap-10 sm:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-h1 font-display font-bold">Sources</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {entry.sources.map((source) => (
                <li key={source.url} className="text-body">
                  <a
                    href={source.url}
                    className="text-primary underline underline-offset-4"
                    rel="nofollow noopener"
                  >
                    {source.label}
                  </a>
                  <span className="text-muted-foreground"> — read {source.checkedOn}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-h1 font-display font-bold">Updates</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {entry.updates.map((update) => (
                <li key={update.date} className="text-body leading-relaxed">
                  <span className="font-medium">{update.date}</span>
                  <span className="text-muted-foreground"> — {update.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-caption text-muted-foreground mt-10">
          Comparing something else?{" "}
          <Link href="/compare" className="text-primary underline underline-offset-4">
            Every comparison we have written
          </Link>
          , or read{" "}
          <Link href="/why-conversation-works" className="text-primary underline underline-offset-4">
            the research behind the format
          </Link>
          .
        </p>
      </Band>

      <CtaBand />
    </>
  );
}
