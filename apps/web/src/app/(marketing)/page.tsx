import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { SpectrumStrip } from "@/components/marketing/spectrum-strip";
import { TheMoment } from "@/components/marketing/the-moment";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { WhatItDoes } from "@/components/marketing/what-it-does";
import { Developers } from "@/components/marketing/developers";
import { PricingSection } from "@/components/marketing/pricing-section";
import { CtaBand } from "@/components/marketing/cta-band";
import { TheDropOff } from "@/components/marketing/the-drop-off";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { canonical, openGraphBase } from "@/lib/seo";

/**
 * Plain words in every position, page and metadata alike — and now the outcome
 * rather than the mechanism.
 *
 * This has been through three versions. Two clever ones ("the first form that
 * answers back", "agentic forms that interview for you") lost the same bet:
 * that a visitor would decode a metaphor before deciding whether to stay. The
 * third, "AI chat forms people actually finish", was plain but front-loaded the
 * category word — and "AI chat forms" is what we are, not what anyone wants.
 * What they want is for the form to stop losing people, so that is what the
 * title says now, with the category following behind it where a scanner still
 * catches it.
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
  title: { absolute: "chatform — forms people actually finish" },
  description:
    "Long forms lose people. chatform turns yours into a conversation that reads what people write, follows up when an answer is too thin to use, and answers their questions too — so the ones who start finish.",
  ...canonical("/"),
  openGraph: {
    ...openGraphBase("/"),
    title: "chatform — forms people actually finish",
    description:
      "It reads what people write, follows up when an answer is thin, and answers their questions back.",
  },
  twitter: { card: "summary_large_image" },
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
 *
 * `TheDropOff` was added after the hero moved from mechanism to outcome. A
 * headline that claims long forms lose people has to be answered on the same
 * screenful or it reads as the same unsupported assertion every competitor
 * opens with, so the band directly beneath it carries three findings and three
 * citations and then gets out of the way. It sits before `TheMoment` rather
 * than after: the argument is "this is the problem" and then "here is the
 * moment it stops happening", and that order does not reverse.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <SpectrumStrip />
      <TheDropOff />
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
