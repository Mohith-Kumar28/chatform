import type { Metadata } from "next";
import Link from "next/link";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { STUDIES } from "@/content/research";
import { TRACED_STATISTICS, ZUKO_BENCHMARK, type Verdict } from "@/content/form-statistics";
import { articleLd, breadcrumbLd, canonical, faqPageLd, openGraphBase } from "@/lib/seo";
import { cn } from "@/lib/utils";

/**
 * The linkable asset: form statistics, traced.
 *
 * Every "form statistics" page ranks by listing sixty numbers with a link to
 * whichever blog it copied them from. This one lists nine and follows each to
 * where it started — which is the page a writer needs when they are about to
 * quote one, and so the page they link to. The content lives in
 * `content/form-statistics.ts`; this file only lays it out.
 */

const PATH = "/form-statistics";
const TITLE = "Form statistics, traced to their sources (2026)";
const DESCRIPTION =
  "The form completion and abandonment statistics everyone repeats — 40% higher completion, 86% better multi-step, $12M from one field — followed back to the original study, with what each one actually measured.";
const PUBLISHED = "2026-09-18";
const AUTHOR = "Mohith Kumar";

const VERDICT_STYLE: Record<Verdict, string> = {
  "holds up": "bg-[color-mix(in_oklch,var(--family-choice)_18%,transparent)]",
  "real, but narrower": "bg-[color-mix(in_oklch,var(--family-number)_20%,transparent)]",
  outdated: "bg-[color-mix(in_oklch,var(--family-scale)_18%,transparent)]",
  "no source found": "bg-[color-mix(in_oklch,var(--family-contact)_20%,transparent)]",
};

const FAQ = [
  {
    question: "What is the average form completion rate?",
    answer: `There is no single honest number. The best-documented benchmark we found is Zuko's, which defines its stages: across its data, ${ZUKO_BENCHMARK.viewToCompletion.desktop} of desktop form views and ${ZUKO_BENCHMARK.viewToCompletion.mobile} of mobile views end in a submission, and ${ZUKO_BENCHMARK.starterToCompletion.desktop} (desktop) and ${ZUKO_BENCHMARK.starterToCompletion.mobile} (mobile) of people who start a form finish it. Your own form's per-question drop-off is more useful than any average.`,
  },
  {
    question: "Do conversational forms really have a 40% higher completion rate?",
    answer:
      "We could not find a study behind that number; the chains end at vendor blog posts. What peer-reviewed research does show is narrower: chat-style surveys produce more differentiated answers (Kim, Lee and Gweon, CHI 2019), and probing thin answers makes them more informative (Xiao et al., 2020).",
  },
  {
    question: "Does reducing form fields increase conversions?",
    answer:
      "Often, but the famous numbers overstate it. HubSpot's 40,000-page analysis found conversion falls only slightly as fields increase; the 120% case study rests on 16 extra submissions; and Expedia's $12M field was a confusing field, not an extra one. Remove fields whose answers change no decision, and test it on your own form.",
  },
  {
    question: "What percentage of people abandon checkout because it is too long?",
    answer:
      "Baymard Institute's current survey, last updated September 2025, finds 17% of US online shoppers have abandoned an order because the checkout was too long or complicated. The widely quoted 22% is from its previous survey round.",
  },
];

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · chatform` },
  description: DESCRIPTION,
  ...canonical(PATH),
  openGraph: { ...openGraphBase(PATH), type: "article", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export default function FormStatisticsPage() {
  const counts = TRACED_STATISTICS.reduce<Record<string, number>>((acc, s) => {
    acc[s.verdict] = (acc[s.verdict] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <JsonLd
        nodes={[
          articleLd({ headline: TITLE, description: DESCRIPTION, path: PATH, datePublished: PUBLISHED, author: AUTHOR }),
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Form statistics", path: PATH },
          ]),
          faqPageLd(FAQ),
        ]}
      />

      <Band size="tall">
        <div className="max-w-3xl">
          <BandTitle as="h1">The form statistics everyone quotes, and where they came from.</BandTitle>
          <BandLede className="max-w-2xl">
            {TRACED_STATISTICS.length} numbers that appear on nearly every form-builder blog,
            followed hop by hop to the original. {counts["no source found"] ?? 0} has no source we
            could find, {counts.outdated ?? 0} has been replaced by its own author, and{" "}
            {counts["real, but narrower"] ?? 0} are real sources that measured something smaller
            than the sentence now attached to them.
          </BandLede>
          <p className="text-caption text-muted-foreground mt-6">
            By {AUTHOR}, founder of chatform · Traced September 2026
          </p>
        </div>

        {/* The summary, as a table: the part people screenshot and cite. */}
        <div className="border-border/70 mt-14 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <caption className="sr-only">Popular form statistics and what their sources say</caption>
            <thead>
              <tr className="bg-muted/50">
                <th scope="col" className="text-caption w-[38%] px-5 py-3 font-semibold">The claim</th>
                <th scope="col" className="text-caption w-[16%] px-4 py-3 font-semibold">Verdict</th>
                <th scope="col" className="text-caption px-4 py-3 font-semibold">What the source shows</th>
              </tr>
            </thead>
            <tbody>
              {TRACED_STATISTICS.map((s) => (
                <tr key={s.id} className="border-border/50 border-t align-top">
                  <th scope="row" className="text-body px-5 py-3.5 font-medium">
                    <a href={`#${s.id}`} className="hover:text-primary transition-colors">
                      {s.claim}
                    </a>
                  </th>
                  <td className="px-4 py-3.5">
                    <span className={cn("text-micro rounded-full px-2 py-0.5 font-medium whitespace-nowrap", VERDICT_STYLE[s.verdict])}>
                      {s.verdict}
                    </span>
                  </td>
                  <td className="text-body text-muted-foreground px-4 py-3.5 leading-relaxed">{s.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Band>

      <Band tone="sand">
        <div className="max-w-2xl">
          <BandTitle>Each one, traced.</BandTitle>
          <BandLede tone="sand">The original source, what it says in its own words, and how it was measured.</BandLede>
        </div>

        <ol className="mt-12 flex flex-col gap-12">
          {TRACED_STATISTICS.map((s) => (
            <li key={s.id} id={s.id} className="max-w-3xl scroll-mt-24">
              <p className="text-micro text-muted-foreground">
                Verdict:{" "}
                <span className={cn("rounded-full px-2 py-0.5 font-medium text-foreground", VERDICT_STYLE[s.verdict])}>
                  {s.verdict}
                </span>
              </p>
              <h2 className="text-h1 font-display mt-3 font-bold text-balance">&ldquo;{s.claim}&rdquo;</h2>
              <p className="text-body-lg mt-3 leading-relaxed font-medium">{s.summary}</p>
              {s.quote && (
                <blockquote className="border-primary/40 text-body mt-4 border-l-2 pl-5 leading-relaxed">
                  &ldquo;{s.quote}&rdquo;
                </blockquote>
              )}
              {s.method && (
                <p className="text-body text-muted-foreground mt-3 leading-relaxed">
                  <span className="text-foreground font-medium">How it was measured: </span>
                  {s.method}
                </p>
              )}
              <p className="text-body text-muted-foreground mt-3 leading-relaxed">{s.note}</p>
              {s.source && (
                <p className="text-caption text-muted-foreground mt-3">
                  Source:{" "}
                  <a href={s.source.url} className="text-primary underline underline-offset-4" rel="noopener">
                    {s.source.publisher}, &ldquo;{s.source.title}&rdquo;, {s.source.year}
                  </a>
                </p>
              )}
            </li>
          ))}
        </ol>
      </Band>

      <Band>
        <div className="max-w-2xl">
          <BandTitle>The numbers that do hold up.</BandTitle>
          <BandLede>
            If you need a statistic for a form, use one of these: primary sources with a stated
            method.
          </BandLede>
        </div>
        <ul className="mt-12 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          <li>
            <p className="text-body leading-relaxed font-medium">
              Of people who start a form, {ZUKO_BENCHMARK.starterToCompletion.desktop} finish on
              desktop and {ZUKO_BENCHMARK.starterToCompletion.mobile} on mobile; of people who view
              one, {ZUKO_BENCHMARK.viewToCompletion.desktop} and{" "}
              {ZUKO_BENCHMARK.viewToCompletion.mobile} submit it.
            </p>
            <p className="text-micro text-muted-foreground mt-2">
              <a href={ZUKO_BENCHMARK.url} className="underline underline-offset-4" rel="noopener">
                Zuko form analytics benchmark
              </a>
              , read September 2026 — stages defined, broken implementations excluded.
            </p>
          </li>
          {STUDIES.map((study) => (
            <li key={study.id}>
              <p className="text-body leading-relaxed font-medium">{study.finding}</p>
              <p className="text-micro text-muted-foreground mt-2">
                <a href={study.url} className="underline underline-offset-4" rel="noopener">
                  {study.authors.split(",")[0]!.split(" and ")[0]}
                  {study.authors.includes(",") || study.authors.includes(" and ") ? " et al." : ""},{" "}
                  {study.venue}, {study.year}
                </a>
              </p>
            </li>
          ))}
        </ul>
        <p className="text-body text-muted-foreground mt-12 max-w-2xl leading-relaxed">
          What these mean for how a form should ask its questions is on{" "}
          <Link href="/why-conversation-works" className="text-primary underline underline-offset-4">
            why conversation works
          </Link>
          , and the practical version is{" "}
          <Link href="/blog/reduce-form-abandonment" className="text-primary underline underline-offset-4">
            how to reduce form abandonment
          </Link>
          .
        </p>
      </Band>

      <Band tone="content">
        <div className="max-w-2xl">
          <BandTitle>Questions about form statistics.</BandTitle>
        </div>
        <div className="mt-12 grid gap-x-12 gap-y-9 lg:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.question}>
              <h3 className="text-h2 font-semibold text-balance">{item.question}</h3>
              <p className="text-body mt-2.5 leading-relaxed" style={{ color: "var(--on-band-vivid-muted)" }}>
                {item.answer}
              </p>
            </div>
          ))}
        </div>
        <p className="text-caption mt-12 max-w-2xl" style={{ color: "var(--on-band-vivid-muted)" }}>
          Found a number we traced wrong, or an original we missed? The point of this page is to be
          correct — write to us and we will update it, with the date.
        </p>
      </Band>

      <CtaBand />
    </>
  );
}
