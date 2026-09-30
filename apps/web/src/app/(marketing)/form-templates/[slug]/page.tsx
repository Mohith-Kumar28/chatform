import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Clock, Flag, GitBranch, ListChecks } from "lucide-react";
import { BLOCK_PRESENTATION, type BlockType } from "@repo/form-schema";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { FaqList } from "@/components/templates/gallery/faq-list";
import { TemplateTile } from "@/components/templates/gallery/template-tile";
import { TemplatePanes } from "@/components/templates/template-detail";
import { toneOf } from "@/lib/block-tone";
import { TemplateTryLive } from "@/components/templates/template-try-live";
import { BackLink } from "@/components/templates/back-link";
import {
  TEMPLATES,
  categoryLabel,
  categoryPath,
  getTemplate,
  goalLabel,
  goalPath,
  guidesFor,
  loadTemplate,
  relatedTo,
  roleLabel,
  rolePath,
  tileOf,
  typeInfo,
  typePath,
} from "@/content/templates";
import { breadcrumbLd, canonical, faqPageLd, openGraphBase } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const dynamicParams = false;

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const template = getTemplate((await params).slug);
  if (!template) return {};
  const title = `${template.searchName} template (free)`;
  return {
    title,
    description: template.metaDescription,
    ...canonical(template.path),
    openGraph: { ...openGraphBase(template.path), title, description: template.metaDescription },
    twitter: { card: "summary_large_image" },
  };
}

const EYEBROW = { form: "A ready-to-use conversational form", survey: "A ready-to-use conversational survey", quiz: "A ready-to-play quiz" };

/**
 * One template, public: what it is and the button to take it, the template
 * itself running live, every question and route, then the guide written for
 * it. The same order Youform's pages use, because it is the order a visitor's
 * questions come in: what is this, does it work, what exactly does it ask,
 * how do I make it mine.
 */
export default async function FormTemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const template = await loadTemplate((await params).slug);
  if (!template) notFound();

  const type = typeInfo(template.type);
  const guides = guidesFor(template.slug);
  const related = relatedTo(template, 3);
  const useHref = `/templates/${template.slug}/use`;
  const { guide, facts } = template;
  const catLabel = categoryLabel(template.type, template.category);

  const trail = [
    { name: "Templates", path: "/form-templates" },
    { name: type.plural, path: typePath(template.type) },
    { name: catLabel, path: categoryPath(template.type, template.category) },
    { name: `${template.searchName} template`, path: template.path },
  ];
  const explore = [
    { label: `${catLabel} ${type.plural.toLowerCase()}`, href: categoryPath(template.type, template.category) },
    ...template.goals.map((g) => ({ label: goalLabel(g) ?? g, href: goalPath(g) })),
    ...template.roles.map((r) => ({ label: roleLabel(r) ?? r, href: rolePath(r) })),
  ].slice(0, 5);

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([{ name: "chatform", path: "/" }, ...trail]),
          faqPageLd(guide.faqs.map((f) => ({ question: f.q, answer: f.a }))),
        ]}
      />

      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 lg:pt-12">
        <div className="flex flex-wrap items-center gap-4">
        <BackLink />
        <nav aria-label="Breadcrumb" className="text-foreground/65 flex flex-wrap items-center gap-1 text-sm">
          {trail.map((c, i) => (
            <span key={c.path} className="inline-flex items-center gap-1">
              {i < trail.length - 1 ? (
                <Link prefetch={false} href={c.path} className="hover:text-foreground transition-colors duration-[var(--duration-micro)]">
                  {c.name}
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground font-medium">
                  {c.name}
                </span>
              )}
              {i < trail.length - 1 && <ChevronRight className="size-3.5" />}
            </span>
          ))}
        </nav>
        </div>

        <header className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">{EYEBROW[template.type]}</p>
            <h1 className="font-display text-foreground mt-3 text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl lg:text-[3.5rem]">
              {template.searchName} template
            </h1>
            <p className="text-foreground/75 mt-4 max-w-2xl text-lg leading-relaxed">{template.metaDescription}</p>
            <div className="text-foreground/70 mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <ListChecks className="size-4" />
                {template.blockCount} questions
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" />
                About {template.estMinutes} min
              </span>
              {facts.branches > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <GitBranch className="size-4" />
                  {facts.branches} {facts.branches === 1 ? "branch" : "branches"}
                </span>
              )}
              {facts.endings > 1 && (
                <span className="inline-flex items-center gap-1.5">
                  <Flag className="size-4" />
                  {facts.endings} endings
                </span>
              )}
              <a href="#template-guide" className="text-foreground hover:text-primary inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
                Read the template guide
                <ArrowRight className="size-3.5" />
              </a>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2.5 lg:items-end">
            <Link prefetch={false}
              href={useHref}
              className="bg-brand-drift text-on-primary inline-flex h-12 items-center gap-2 rounded-md px-6 text-base font-semibold shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_8px_20px_-8px_color-mix(in_oklab,var(--brand-violet)_60%,transparent)] transition-[transform,box-shadow] duration-200 hover:-translate-y-px active:translate-y-0 motion-reduce:hover:translate-y-0"
            >
              Use this template
              <ArrowRight className="size-4" />
            </Link>
            <p className="text-foreground/70 inline-flex items-center gap-1.5 text-sm">
              <Check className="size-4 text-emerald-600" />
              Free to customize. No code needed.
            </p>
          </div>
        </header>

        <div className="text-foreground/70 mt-8 flex flex-wrap items-center gap-2 text-sm">
          <span>Explore more:</span>
          {explore.map((e) => (
            <Link prefetch={false} key={e.href} href={e.href} className="border-border/80 hover:border-foreground/40 text-foreground rounded-full border px-3 py-1 transition-colors">
              {e.label}
            </Link>
          ))}
        </div>

        <section aria-label="Try it live" className="mt-8">
          <TemplateTryLive slug={template.slug} doc={template.doc} useHref={useHref} />
        </section>

        <section className="mt-20">
          <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">What&apos;s inside</p>
          <h2 className="font-display text-foreground mt-2 text-3xl font-semibold tracking-tight">Every question, and where it leads</h2>
          <ul className="mt-5 flex flex-wrap gap-2">
            {facts.blockTypes.map((t) => (
              <li key={t} className={cn("rounded-full px-3 py-1 text-sm font-medium", toneOf(t).chip)}>
                {BLOCK_PRESENTATION[t as BlockType]?.label ?? t}
              </li>
            ))}
            {facts.scored && <li className="bg-brand-gradient rounded-full px-3 py-1 text-sm font-medium text-white">Scored</li>}
          </ul>
          <TemplatePanes doc={template.doc} title={template.searchName} className="mt-8" />
        </section>

        <section id="template-guide" className="mt-24 grid scroll-mt-24 gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-16">
          <div>
            <div className="lg:sticky lg:top-8">
              <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">A little guidance</p>
              <p className="font-display text-foreground mt-2 text-2xl leading-snug font-semibold">Make the most of your next ask.</p>
            </div>
          </div>
          <div className="max-w-2xl space-y-14">
            <div>
              <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight">
                Questions to consider for your {template.searchName.toLowerCase()}
              </h2>
              <ul className="text-foreground/85 mt-5 space-y-3 text-[1.0625rem] leading-relaxed">
                {guide.questionsToConsider.map((q) => (
                  <li key={q} className="flex gap-3">
                    <span className="bg-primary mt-2.5 size-1.5 shrink-0 rounded-full" />
                    {q}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight">How to use the responses</h2>
              <p className="text-foreground/85 mt-5 text-[1.0625rem] leading-relaxed">{guide.howToUseResponses}</p>
            </div>
            <div>
              <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight">How to customize and share this template</h2>
              <ol className="mt-5 space-y-4">
                {guide.customizeSteps.map((step, i) => (
                  <li key={step} className="flex gap-4">
                    <span className="bg-brand-gradient grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white">{i + 1}</span>
                    <span className="text-foreground/85 pt-1 text-[1.0625rem] leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
              <div className="mt-5">
                <FaqList faqs={guide.faqs} />
              </div>
            </div>
            {guides.length > 0 && (
              <div>
                <h2 className="font-display text-foreground text-2xl font-semibold tracking-tight">The long-form guide</h2>
                <ul className="mt-4 space-y-2">
                  {guides.map((g) => (
                    <li key={g.slug}>
                      <Link prefetch={false} href={g.path} className="text-foreground hover:text-primary inline-flex items-center gap-1.5 font-semibold">
                        {g.title}
                        <ArrowRight className="size-4" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {related.length > 0 && (
          <section className="mt-24 pb-20">
            <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">A few more possibilities</p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight">Keep the ideas coming.</h2>
              <Link prefetch={false} href={typePath(template.type)} className="text-foreground hover:text-primary inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold">
                Explore all {type.plural.toLowerCase()}
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((t) => (
                <li key={t.slug} className="flex">
                  <TemplateTile tile={tileOf(t)} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <CtaBand />
    </>
  );
}
