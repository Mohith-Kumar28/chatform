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

/**
 * The scan positions carry the category; the page carries the claim.
 *
 * Both titles used to be "the first form that answers back", which is the
 * headline four inches below and the headline drawn into the share card
 * itself. An unfurl that repeats its own image in its own title has said one
 * thing twice and the other thing never — so the card keeps the claim, drawn,
 * and the title beside it names what the product is. See the note in
 * `app/layout.tsx` for why the split exists at all.
 */
export const metadata: Metadata = {
  /**
   * `absolute`, because the root layout's `template: "%s · chatform"` appends
   * the brand to every child title — and this title already opens with it. The
   * landing page has been shipping `"chatform — … · chatform"` in the tab and
   * in the Google result, which is the one page whose title anyone actually
   * sees. Every other route wants the template and keeps it; only the
   * home page names the brand itself.
   */
  title: { absolute: "chatform — agentic forms that interview for you" },
  description:
    "Agentic forms: an AI interviewer that asks your questions one at a time, understands what people actually type, and answers their questions from a knowledge base you write.",
  openGraph: {
    title: "chatform — agentic forms that interview for you",
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
