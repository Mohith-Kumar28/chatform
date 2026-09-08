import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { ChatDemo } from "@/components/marketing/chat-demo";
import { CtaBand } from "@/components/marketing/cta-band";
import { UseCaseFigure } from "@/components/marketing/use-case-figure";
import { HandNote } from "@/components/marketing/annotate";
import { JsonLd } from "@/components/seo/json-ld";
import { USE_CASES, getUseCase } from "@/content/use-cases";
import { breadcrumbLd, canonical, faqPageLd, howToLd, openGraphBase } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return USE_CASES.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const entry = getUseCase((await params).slug);
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

/**
 * One guide, for one job somebody is trying to do.
 *
 * The order of this page is the whole argument, and it is not the order a
 * product team would choose. It opens on the reader's problem, in their words,
 * before chatform is mentioned. Then it shows them the thing their customer
 * would see — the demo, playing — because that is the moment people decide.
 * Only then does it explain what to do, and even that is written as a recipe
 * rather than as a feature tour.
 *
 * What is deliberately not on this page: how any of it works. No state
 * machines, no question-type counts, no infrastructure. Somebody who wants
 * that is a developer and there is a whole documentation site for them.
 */
export default async function UseCasePage({ params }: { params: Promise<{ slug: string }> }) {
  const entry = getUseCase((await params).slug);
  if (!entry) notFound();

  const related = entry.related
    .map((slug) => getUseCase(slug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Use cases", path: "/use-cases" },
            { name: entry.name, path: entry.path },
          ]),
          howToLd({
            name: entry.h1,
            description: entry.description,
            steps: entry.steps.map((step) => ({ name: step.title, text: step.body })),
          }),
          faqPageLd(entry.faq),
        ]}
      />

      <Band size="tall">
        <div className="max-w-3xl">
          {/*
            Yes, this is an eyebrow, and the house rule says no eyebrows.
            `band.tsx` removed the prop on the grounds that an eyebrow is a
            heading admitting it cannot carry itself, and that is right for a
            band on the landing page, where the reader already knows what site
            they are on.

            It is wrong here. Somebody arriving on this page came from a search
            for "appointment booking form" and has never heard of us; the first
            question they are asking is not "what is this" but "is this for
            people like me". "Salons, clinics, tutors, coaches, garages" answers
            that in the half second before they decide to scroll, and no
            headline can do that job without becoming a worse headline.
          */}
          <p className="text-caption text-muted-foreground">{entry.audience}</p>
          <BandTitle as="h1" className="mt-3">
            {entry.h1}
          </BandTitle>
          <BandLede className="max-w-2xl">{entry.lede}</BandLede>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" shape="pill" className="h-12 px-8">
              <Link href="/signin">
                Build one free
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" shape="pill" variant="outline" className="h-12 px-8">
              <Link href="#how">Show me how</Link>
            </Button>
          </div>
          <p className="text-caption text-muted-foreground mt-5">
            Free forever · Unlimited responses · No card
          </p>
        </div>
      </Band>

      {/* Their problem, before us. */}
      <Band tone="sand">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <div>
            <BandTitle>{entry.problem.headline}</BandTitle>
            <BandLede tone="sand">{entry.problem.body}</BandLede>
          </div>
          <ul className="flex flex-col gap-4 lg:pt-4">
            {entry.problem.symptoms.map((symptom) => (
              <li key={symptom} className="text-body-lg flex gap-3 leading-relaxed">
                <span aria-hidden className="text-muted-foreground/60 mt-0.5 shrink-0">
                  —
                </span>
                <span>{symptom}</span>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      {/* The demo. The most persuasive thing on the page, so it gets a band. */}
      <Band tone="brand" size="tall">
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <BandTitle>This is what they see.</BandTitle>
            <BandLede tone="brand">{entry.demoCaption}</BandLede>
          </div>
          <ChatDemo script={entry.demo} variant="hero" label="Playing" />
        </div>
      </Band>

      {/* What it changes for them. */}
      <Band>
        <div className="max-w-2xl">
          <BandTitle>What changes.</BandTitle>
          <BandLede>Not for us. For the thing you are actually trying to get done.</BandLede>
        </div>
        <dl className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2">
          {entry.outcomes.map((outcome) => (
            <div key={outcome.title}>
              <dt className="text-h2 font-semibold">{outcome.title}</dt>
              <dd className="text-body text-muted-foreground mt-2 leading-relaxed">{outcome.body}</dd>
            </div>
          ))}
        </dl>
      </Band>

      {/* The recipe. */}
      <Band id="how" tone="sand" size="tall">
        <div className="max-w-2xl">
          <BandTitle>How to set it up.</BandTitle>
          <BandLede tone="sand">
            About ten minutes, and you do not have to be technical for any of it.
          </BandLede>
        </div>

        <ol className="mt-14 flex flex-col gap-14">
          {entry.steps.map((step, index) => (
            <li key={step.title} className="grid items-start gap-8 lg:grid-cols-[1fr_1fr] lg:gap-16">
              <div className="relative">
                <div className="flex items-baseline gap-4">
                  <span className="font-display text-display text-primary font-bold tabular">
                    {index + 1}
                  </span>
                  <h3 className="text-h1 font-display font-bold">{step.title}</h3>
                </div>
                <p className="text-body-lg mt-3 max-w-lg leading-relaxed">{step.body}</p>

                {/* The one pen mark this page is allowed. */}
                {step.note && (
                  <div className="pointer-events-none mt-4 hidden lg:block" aria-hidden>
                    <HandNote className="text-primary" tilt={-3}>
                      {step.note}
                    </HandNote>
                  </div>
                )}

                {/* The prompt lives with the step that says to paste it. */}
                {step.figure === "prompt" && (
                  <div className="border-border/70 bg-background mt-6 rounded-xl border p-4 shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-micro text-muted-foreground font-semibold tracking-[0.1em] uppercase">
                        Copy this in
                      </p>
                      <CopyButton
                        value={entry.samplePrompt}
                        label="Copy prompt"
                        toastMessage="Prompt copied — paste it into chatform"
                        variant="soft"
                        size="sm"
                      />
                    </div>
                    <p className="text-body mt-3 leading-relaxed whitespace-pre-line">
                      {entry.samplePrompt}
                    </p>
                  </div>
                )}

                {step.figure === "share" && entry.template && (
                  <p className="text-caption text-muted-foreground mt-5">
                    In a hurry? Start from the{" "}
                    <span className="text-foreground font-medium">{entry.template.name}</span>{" "}
                    template instead and skip straight to publishing.
                  </p>
                )}
              </div>

              {step.figure && step.figure !== "chat" && (
                <div className="lg:pt-2">
                  <UseCaseFigure figure={step.figure} useCase={entry} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </Band>

      {/* What lands afterwards. */}
      <Band tone="number">
        <div className="max-w-2xl">
          <BandTitle>Then you just read the answers.</BandTitle>
          <BandLede tone="number">
            Every reply is a conversation you can read back, not a row you have to decode.
          </BandLede>
        </div>
        <div className="mt-12 grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <ul className="flex flex-col gap-7">
            {entry.whatYouGet.map((item) => (
              <li key={item.title}>
                <h3 className="text-h2 flex items-start gap-2.5 font-semibold">
                  <Check className="mt-1 size-4 shrink-0" strokeWidth={2.5} aria-hidden />
                  {item.title}
                </h3>
                <p
                  className="text-body mt-1.5 pl-6.5 leading-relaxed"
                  style={{ color: "var(--on-band-vivid-muted)" }}
                >
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
          <UseCaseFigure figure="results" useCase={entry} />
        </div>
      </Band>

      <Band tone="content">
        <div className="max-w-2xl">
          <BandTitle>Before you start.</BandTitle>
          <BandLede tone="content">The things people ask us about this one.</BandLede>
        </div>
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

      {related.length > 0 && (
        <Band size="tight">
          <h2 className="text-h1 font-display font-bold">People who read this also set up</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {related.map((item) => (
              <li key={item.slug}>
                <Link
                  href={item.path}
                  className="border-border/70 bg-card group flex h-full flex-col rounded-xl border p-5 shadow-xs transition-[box-shadow,transform] duration-[var(--duration-standard)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0"
                >
                  <span className="text-h2 font-display font-bold">{item.name}</span>
                  <span className="text-body text-muted-foreground mt-1.5 leading-relaxed">
                    {item.navBlurb}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Band>
      )}

      <CtaBand />
    </>
  );
}
