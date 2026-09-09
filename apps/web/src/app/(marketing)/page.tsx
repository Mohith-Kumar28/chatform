import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { SpectrumStrip } from "@/components/marketing/spectrum-strip";
import { TheMoment } from "@/components/marketing/the-moment";
import { HowItConverts } from "@/components/marketing/how-it-converts";
import { WhatItDoes } from "@/components/marketing/what-it-does";
import { Developers } from "@/components/marketing/developers";
import { PricingSection } from "@/components/marketing/pricing-section";
import { CtaBand } from "@/components/marketing/cta-band";
import { TheDropOff } from "@/components/marketing/the-drop-off";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { InView } from "@/components/marketing/in-view";
import { ArrowMark, HandNote } from "@/components/marketing/annotate";
import { canonical, openGraphBase } from "@/lib/seo";

/**
 * Plain words in every position, page and metadata alike — and the outcome
 * rather than the mechanism.
 *
 * This has been through four versions. Two clever ones ("the first form that
 * answers back", "agentic forms that interview for you") lost the same bet:
 * that a visitor would decode a metaphor before deciding whether to stay.
 * "forms people actually finish" was plain, and it matched a hero that named
 * the problem — but "finish" is our word for the outcome, not the reader's.
 * Somebody who runs a form counts submissions.
 *
 * So the title says that, and the h1 says the same thing in the same words.
 * The category is in there too, in front, because a search result has to
 * answer "what is this" and "why would I care" in one line and there is no
 * room to be coy about either.
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
  title: { absolute: "chatform — AI forms that get more submissions" },
  description:
    "chatform turns your boring form into a conversation: it reads what people write, asks again when an answer is too thin to use, and follows up with the ones who leave. More of the people who start finish.",
  ...canonical("/"),
  openGraph: {
    ...openGraphBase("/"),
    title: "chatform — Agentic forms that get more responses",
    description:
      "It reads what people write, asks again when an answer is thin, and follows up with the ones who leave.",
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
 *  - `HowItWorks` — "Describe it. Shape it. Share it." in three cards.
 *    Deleted. Two of the three said what the mosaic directly beneath them
 *    already said at four times the size, in the same order, with better
 *    pictures; the heading was the same claim as `WhatItDoes`' heading. The
 *    third, sharing, is the one thing the mosaic did not cover, so it became a
 *    full-width tile inside it. A band whose job is to summarise the band
 *    below it is a band the reader has to read twice.
 *  - `ComparisonTable` — seven vendors and sixteen rows, with footnotes.
 *    Moved to `/pricing`. Somebody reading a competitive matrix is comparing,
 *    and comparing happens on the pricing page.
 *  - The eight-item FAQ — every answer a paragraph. Moved to `/pricing`.
 *
 * The scroll is now a progression through the block-family palette: cream,
 * the full spectrum, violet, cream, sand with coloured tiles, ink, cream,
 * orange. The same colours a respondent moves through, in the same order.
 *
 * `HowItConverts` is second, immediately under the hero, and it is the band
 * this page was missing. The hero promises an outcome; `TheDropOff` proves the
 * problem is real; `WhatItDoes` shows what you get. Between those there was
 * no answer to the only question a visitor actually has, which
 * is what the product does differently to get the outcome. It now sits in the
 * first scroll, in three tiles, in the order a respondent meets them: it asks
 * better, it chases the ones who left, and it can tell you whether the chasing
 * worked.
 *
 * It goes above `TheDropOff` rather than below. Both bands carry citations and
 * running them together would read as one long bibliography, but the ordering
 * argument is simpler than that: the pillars answer the headline, and the
 * drop-off band explains why the headline is true. Somebody who is already
 * sold does not need the second one, and somebody who is not will scroll one
 * band further to find it.
 *
 * `TheDropOff` is the page's evidence, and it matters more now that the hero
 * states an outcome instead of a problem. "More submissions" is a claim with
 * nothing under it until somebody explains why the current form gets fewer,
 * so this band carries three findings and three citations — that long forms
 * are abandoned for being long, and that the same questions asked as a
 * conversation come back better answered — and then gets out of the way. It
 * sits before `TheMoment` rather than after: the argument is "here is why you
 * are losing them" and then "here is the moment that stops", and that order
 * does not reverse.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItConverts />
      <SpectrumStrip />
      <TheDropOff />
      <TheMoment />
      <WhatItDoes />
      <Developers />

      <Band id="pricing" size="tall">
        <div className="max-w-2xl">
          <BandTitle>Free until you outgrow it.</BandTitle>
          <BandLede>Build, publish and collect for free, forever.</BandLede>
          {/* The pricing band's one mark. "Free" on a pricing page is the most
              distrusted word in software, and the sentence that answers the
              distrust is not another line of body copy — it is the thing
              somebody would have scribbled next to it. */}
          <InView className="mt-3 flex items-start gap-1">
            <ArrowMark
              dir="up-right"
              positioned={false}
              draw
              delay={200}
              className="size-10 shrink-0 opacity-50"
            />
            <HandNote tilt={-4} className="cf-a-rise mt-3" style={{ animationDelay: "620ms" }}>
              no card to start
            </HandNote>
          </InView>
        </div>
        <div className="mt-12">
          <PricingSection />
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
