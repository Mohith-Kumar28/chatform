import type { Metadata } from "next";
import { LaunchVideo } from "@/components/marketing/launch-video";
import { Hero } from "@/components/marketing/hero";
import { Developers } from "@/components/marketing/developers";
import { SwitchBand } from "@/components/marketing/switch-band";
import { CtaBand } from "@/components/marketing/cta-band";
import { ChatformEmbed } from "@/components/marketing/chatform-embed";
import { Band } from "@/components/marketing/band";
import { LogoMarquee, StatsRow, TestimonialQuote } from "@/components/marketing/social-proof";
import { AiBuilderSection } from "@/components/marketing/ai-builder-section";
import { BuilderRecording } from "@/components/marketing/builder-recording";
import { QuestionTypesSection } from "@/components/marketing/question-types-section";
import { CustomizeSection } from "@/components/marketing/theme-playground";
import { UnlimitedBand } from "@/components/marketing/unlimited-band";
import { Capabilities } from "@/components/marketing/capabilities";
import { AnalyticsSection } from "@/components/marketing/analytics-section";
import { AskYourData } from "@/components/marketing/ask-your-data";
import { PartialsSection } from "@/components/marketing/partials-section";
import { ShareTabs } from "@/components/marketing/share-tabs";
import { TrustSection } from "@/components/marketing/trust-section";
import { TemplatesTeaser } from "@/components/marketing/templates-teaser";
import { ReviewsCarousel } from "@/components/marketing/reviews-carousel";
import { HOME_FAQ, HomeFaq } from "@/components/marketing/home-faq";
import { AskAi } from "@/components/marketing/ask-ai";
import { SpectrumStrip } from "@/components/marketing/spectrum-strip";
import { HowItConverts } from "@/components/marketing/how-it-converts";
import { TheMoment } from "@/components/marketing/the-moment";
import { AgentBrief } from "@/components/marketing/agent-brief";
import { ResponsesSection } from "@/components/marketing/responses-section";
import { TESTIMONIALS } from "@/content/social-proof";
import { JsonLd } from "@/components/seo/json-ld";
import { buildCatalogue, dollars } from "@/lib/pricing-catalogue";
import { canonical, faqPageLd, openGraphBase, softwareApplicationLd } from "@/lib/seo";

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
 * The home page, rebuilt on 2026-10-03 on Youform's structure at the owner's
 * call: one feature per section, each an eyebrow, a two-line heading, a short
 * paragraph and one picture or live demo, separated by hairlines, with tinted
 * panels (unlimited, partials, ask-your-data) and full-bleed bands (templates,
 * the close) for contrast. Testimonials are woven between features, not
 * collected at the end.
 *
 * Our own sections came along, reshaped to the same pattern, because they are
 * what makes chatform different: the three pillars (talks like a person,
 * follows up, answers back), the knowledge-base demo, the agent brief, the
 * conversation-not-the-row results, the typed-answer reads, the dead-end
 * linter and the ordinary-things list (inside Capabilities), and the spectrum
 * strip. Only the pricing cards left; they live on /pricing.
 *
 * The social-proof slots (logos, stats, four testimonials, reviews) render
 * nothing until `content/social-proof.ts` has real entries.
 */
export default function LandingPage() {
  const catalogue = buildCatalogue();

  return (
    <>
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
          faqPageLd(HOME_FAQ.map((f) => ({ question: f.q, answer: f.a }))),
        ]}
      />
      <Hero />
      <SpectrumStrip />
      <LogoMarquee />
      <StatsRow />
      <LaunchVideo />
      <HowItConverts />
      <SwitchBand />
      <AiBuilderSection />
      <BuilderRecording />
      <TheMoment />
      <AgentBrief />
      <QuestionTypesSection />
      <CustomizeSection />
      <UnlimitedBand />
      <Capabilities />
      <ResponsesSection />
      <AnalyticsSection />
      <AskYourData />
      <PartialsSection />
      <ShareTabs />
      <TrustSection />
      <Developers />
      <TemplatesTeaser />
      {TESTIMONIALS.big && (
        <Band hairline>
          <TestimonialQuote testimonial={TESTIMONIALS.big} variant="big" />
        </Band>
      )}
      <ReviewsCarousel />
      <HomeFaq />
      <CtaBand />
      <AskAi />

      {/* The contact form as a corner button; the share band's "Try the popup" opens it too. */}
      <ChatformEmbed form="contact-us-673e52" />
    </>
  );
}
