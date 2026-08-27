import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/marketing/hero";
import { MetricBand } from "@/components/marketing/metric-band";
import { TheMoment } from "@/components/marketing/the-moment";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { ActBuild, ActConverse, ActCollect } from "@/components/marketing/feature-acts";
import { BlockTypeGrid } from "@/components/marketing/block-type-grid";
import { Developers } from "@/components/marketing/developers";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { PricingSection } from "@/components/marketing/pricing-section";
import { Faq } from "@/components/marketing/faq";
import { CtaBand } from "@/components/marketing/cta-band";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "chatform — the first form that answers back",
  description:
    "Forms answered as a conversation. An AI interviewer asks your questions one at a time, understands what people actually type, and answers their questions from a knowledge base you write.",
  openGraph: {
    title: "chatform — the first form that answers back",
    description:
      "Forms answered as a conversation. An AI interviewer that asks, listens, and answers questions back.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <MetricBand />
      <TheMoment />
      <HowItWorks />

      <ActBuild />

      <Section
        id="question-types"
        tone="muted"
        eyebrow="Question types"
        title="Twenty-six ways to ask."
        lede="Each one renders its own control in the conversation — and still accepts a typed answer, because people do not always want to tap."
      >
        <BlockTypeGrid />
      </Section>

      <ActConverse />
      <ActCollect />
      <Developers />

      <Section
        id="compare"
        eyebrow="How we compare"
        title="Most of these render a field and wait."
        lede="A few render one field at a time and call it conversational. Here is where everyone actually stands — including where someone else already does what we do."
      >
        <ComparisonTable />
      </Section>

      <Section
        tone="muted"
        align="center"
        eyebrow="Pricing"
        title="Generous where it costs us nothing."
        lede="Build, publish and collect for free, forever. Pay when you want the data working for you."
      >
        <PricingSection compact />
        <p className="text-body text-muted-foreground mt-8 text-center">
          <Link href="/pricing" className="text-primary underline underline-offset-4">
            Compare every feature and limit →
          </Link>
        </p>
      </Section>

      <Section
        eyebrow="Questions"
        title="The things people ask before they trust this."
        align="center"
      >
        <Faq />
      </Section>

      <CtaBand />
    </>
  );
}
