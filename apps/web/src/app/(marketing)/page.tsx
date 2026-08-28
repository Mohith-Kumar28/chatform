import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { SpectrumStrip } from "@/components/marketing/spectrum-strip";
import { TheMoment } from "@/components/marketing/the-moment";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { WhatItDoes } from "@/components/marketing/what-it-does";
import { Developers } from "@/components/marketing/developers";
import { PricingSection } from "@/components/marketing/pricing-section";
import { CtaBand } from "@/components/marketing/cta-band";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";

export const metadata: Metadata = {
  title: "chatform — the first form that answers back",
  description:
    "An AI interviewer that asks your questions one at a time, understands what people actually type, and answers their questions from a knowledge base you write.",
  openGraph: {
    title: "chatform — the first form that answers back",
    description: "An AI interviewer that asks your questions — and answers theirs.",
    type: "website",
  },
};

/**
 * Six bands, down from thirteen sections.
 *
 * What left this page, and where it went:
 *
 *  - `MetricBand` — four big numbers over four small labels. Deleted. The
 *    count of question types is now the spectrum strip, which shows the range
 *    instead of stating it; the three infrastructure numbers moved into the
 *    developer band, where they mean something.
 *  - The 26-tile question-type grid — a full screen to say "there are a lot,
 *    and each has a colour". The strip says it in a fifth of the height; the
 *    full list moved to `/pricing#question-types`.
 *  - `ActBuild` / `ActConverse` / `ActCollect` — three consecutive grids of
 *    fourteen identical cards. Merged into one mosaic where no two tiles are
 *    the same shape.
 *  - `ComparisonTable` — seven vendors and sixteen rows, with footnotes.
 *    Moved to `/pricing`. Somebody reading a competitive matrix is comparing,
 *    and comparing happens on the pricing page.
 *  - The eight-item FAQ — every answer a paragraph. Moved to `/pricing`.
 *
 * The scroll is now a progression through the block-family palette: cream,
 * the full spectrum, violet, cream, sand with coloured tiles, ink, cream,
 * orange. The same colours a respondent moves through, in the same order.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <SpectrumStrip />
      <TheMoment />
      <HowItWorks />
      <WhatItDoes />
      <Developers />

      <Band id="pricing" size="tall">
        <div className="max-w-2xl">
          <BandTitle>Free until you outgrow it.</BandTitle>
          <BandLede>Build, publish and collect for free, forever.</BandLede>
        </div>
        <div className="mt-12">
          <PricingSection showAllLink />
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
