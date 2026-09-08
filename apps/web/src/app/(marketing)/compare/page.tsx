import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { COMPARISONS } from "@/content/compare";
import { breadcrumbLd, canonical, itemListLd, openGraphBase } from "@/lib/seo";

const TITLE = "Compare chatform — the honest version";
const DESCRIPTION =
  "chatform against Typeform, Google Forms, Jotform and Tally, including where each of them is still the better answer. Prices and capabilities read from each vendor's own pages, with the dates.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  ...canonical("/compare"),
  openGraph: { ...openGraphBase("/compare"), title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export default function ComparePage() {
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Compare", path: "/compare" },
          ]),
          itemListLd(
            COMPARISONS.map((entry) => ({ name: `chatform vs ${entry.competitor}`, path: entry.path })),
          ),
        ]}
      />

      <Band size="tall">
        <div className="max-w-3xl">
          <BandTitle as="h1">chatform vs the others.</BandTitle>
          <BandLede className="max-w-2xl">
            Every page below opens with the reasons to stay where you are, in full sentences.
          </BandLede>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2">
          {COMPARISONS.map((entry) => (
            <li key={entry.slug}>
              <Link
                href={entry.path}
                /* Interactive card: lifts on hover, 150ms, per DESIGN.md 4.4.
                   Nothing else on this page moves. */
                className="border-border/70 bg-card group flex h-full flex-col rounded-xl border p-6 shadow-xs transition-[box-shadow,transform] duration-[var(--duration-standard)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0"
              >
                <h2 className="text-h1 font-display font-bold">chatform vs {entry.competitor}</h2>
                <p className="text-body text-muted-foreground mt-2 leading-relaxed">{entry.lede}</p>
                <span className="text-caption text-primary mt-5 inline-flex items-center gap-1.5 font-medium">
                  Read the comparison
                  <ArrowRight className="size-4 transition-transform duration-[var(--duration-micro)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Band>

      <Band tone="sand">
        <div className="max-w-2xl">
          <BandTitle>And everyone else.</BandTitle>
          <BandLede tone="sand">
            The same table each page above reads from, with the rest of the field in it.
          </BandLede>
        </div>
        <div className="mt-12">
          <ComparisonTable />
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
