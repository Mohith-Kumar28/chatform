import type { Metadata } from "next";
import { LaunchVideo } from "@/components/marketing/launch-video";
import { Hero } from "@/components/marketing/hero";
import { SpectrumStrip } from "@/components/marketing/spectrum-strip";
import { TheMoment } from "@/components/marketing/the-moment";
import { HowItConverts } from "@/components/marketing/how-it-converts";
import { WhatItDoes } from "@/components/marketing/what-it-does";
import { Developers } from "@/components/marketing/developers";
import { PricingSection } from "@/components/marketing/pricing-section";
import { CtaBand } from "@/components/marketing/cta-band";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { InView } from "@/components/marketing/in-view";
import { ArrowMark, HandNote } from "@/components/marketing/annotate";
import { JsonLd } from "@/components/seo/json-ld";
import { buildCatalogue, dollars } from "@/lib/pricing-catalogue";
import { canonical, openGraphBase, softwareApplicationLd } from "@/lib/seo";

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
  title: { absolute: "chatform — Conversational forms people actually finish" },
  description:
    "AI-powered conversational forms, free with unlimited submissions. chatform turns your form into a conversation that reads what people write, asks again when an answer is thin, and follows up with the ones who leave.",
  ...canonical("/"),
  openGraph: {
    ...openGraphBase("/"),
    // The h1 verbatim. A social card that promises something the page then
    // words differently is a card the reader has to reconcile — first "agentic"
    // was doing that, then "AI forms", which said prompt-to-form generator to
    // anyone who has shopped this category. The noun is the category's own now.
    // "AI-powered" is not missing from this object; it opens both descriptions,
    // which is where a keyword belongs once the headline has a job of its own.
    title: "chatform — Conversational forms people actually finish",
    description:
      "An AI-powered form that reads what people write, asks again when an answer is thin, and follows up with the ones who leave. Free, with unlimited submissions.",
    // A baked file, not an `opengraph-image.tsx`: nothing on this card changes,
    // and a route is served through the worker at ~2s where `public/` is
    // ~0.3s. Regenerate with `pnpm --filter @repo/web og:image`.
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "chatform — Conversational forms people actually finish",
      },
    ],
  },
  twitter: { card: "summary_large_image", images: ["/og.jpg"] },
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
 * `LaunchVideo` sits directly under the hero: the chat demo up there makes the
 * point in seconds, and the video gets the full width for the long version.
 *
 * `HowItConverts` follows, in three tiles: it talks like a person, it chases
 * the ones who left, and it answers the questions a form leaves unanswered.
 *
 * `TheDropOff` ("a long form is a list of reasons to leave") was removed on
 * 2026-09-27 at the owner's call; its citations still live in
 * `content/research.ts` and on /why-conversation-works.
 */
export default function LandingPage() {
  const catalogue = buildCatalogue();

  return (
    <>
      {/*
        The product, as a product, on the page most searches for it land on.
        It was only on `/pricing`, so the home page told a crawler that an
        organisation and a website existed and nothing about what they sell.
        Same offers as the pricing page, built from the same catalogue.
      */}
      <JsonLd
        nodes={[
          softwareApplicationLd(
            catalogue.plans.map((plan) => ({
              name: plan.name,
              price: dollars(plan.priceMonthlyCents),
              billingDuration: "P1M",
              url: "/pricing",
            })),
          ),
        ]}
      />
      <Hero />
      <LaunchVideo />
      <HowItConverts />
      <SpectrumStrip />
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
