import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Band } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { FaqList } from "@/components/templates/gallery/faq-list";
import { TemplateGrid } from "@/components/templates/gallery/template-grid";
import { TemplateHero, TemplatePanes } from "@/components/templates/template-detail";
import { TemplateTryLive } from "@/components/templates/template-try-live";
import { Button } from "@/components/ui/button";
import {
  TEMPLATES,
  categoryLabel,
  categoryPath,
  getTemplate,
  goalLabel,
  goalPath,
  guidesFor,
  kindLine,
  loadTemplate,
  relatedTo,
  roleLabel,
  rolePath,
  typeInfo,
  typePath,
} from "@/content/templates";
import { BLOCK_PRESENTATION, type BlockType } from "@repo/form-schema";
import { breadcrumbLd, canonical, faqPageLd, openGraphBase } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
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

/**
 * One template, public.
 *
 * The app's own template view (the same hero, conversation pane and flow
 * diagram), with the real chat beside it so a visitor can answer it as a
 * respondent before deciding. Then the guide written for this template: what
 * to consider, what to do with the answers, how to adapt it, and the questions
 * people search about this kind of form.
 *
 * "Use this template" leads to the app's copy; the auth guard sends a
 * signed-out visitor through sign-up and back to it.
 */
export default async function FormTemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const template = await loadTemplate((await params).slug);
  if (!template) notFound();

  const type = typeInfo(template.type);
  const guides = guidesFor(template.slug);
  const related = relatedTo(template, 6);
  const useHref = `/templates/${template.slug}`;
  const { guide, facts } = template;

  const useButton = (
    <Button asChild shape="pill" size="lg">
      <Link href={useHref}>
        Use this template
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  );

  const trail = [
    { name: "Form templates", path: "/form-templates" },
    { name: type.plural, path: typePath(template.type) },
    { name: `${categoryLabel(template.type, template.category)} ${type.plural.toLowerCase()}`, path: categoryPath(template.type, template.category) },
    { name: `${template.searchName} template`, path: template.path },
  ];

  const uses = [
    ...facts.blockTypes.map((t) => BLOCK_PRESENTATION[t as BlockType]?.label ?? t),
    ...(facts.branches > 0 ? [`${facts.branches} branch${facts.branches === 1 ? "" : "es"}`] : []),
    ...(facts.endings > 1 ? [`${facts.endings} endings`] : []),
    ...(facts.scored ? ["Scoring"] : []),
  ];

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([{ name: "chatform", path: "/" }, ...trail]),
          faqPageLd(guide.faqs.map((f) => ({ question: f.q, answer: f.a }))),
        ]}
      />

      <Band>
        <nav aria-label="Breadcrumb" className="text-muted-foreground text-caption flex flex-wrap items-center gap-1">
          {trail.map((c, i) => (
            <span key={c.path} className="inline-flex items-center gap-1">
              {i < trail.length - 1 ? (
                <Link href={c.path} className="hover:text-foreground transition-colors duration-[var(--duration-micro)]">
                  {c.name}
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground">
                  {c.name}
                </span>
              )}
              {i < trail.length - 1 && <ChevronRight className="size-3.5" />}
            </span>
          ))}
        </nav>

        <TemplateHero
          detail={{
            slug: template.slug,
            title: template.searchName,
            category: kindLine(template),
            description: template.description,
            blurb: template.blurb,
            tags: template.tags,
            icon: template.icon,
            accent: template.accent,
            blockCount: template.blockCount,
            estMinutes: template.estMinutes,
            doc: template.doc,
          }}
          doc={template.doc}
          heading={`${template.searchName} template`}
          action={useButton}
        />

        <section aria-labelledby="try-live" className="mt-10">
          <h2 id="try-live" className="font-display text-h2 font-semibold">
            Try it live
          </h2>
          <div className="mt-4">
            <TemplateTryLive slug={template.slug} doc={template.doc} useHref={useHref} />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-h2 font-semibold">Every question, and where it leads</h2>
          <TemplatePanes doc={template.doc} title={template.searchName} className="mt-4" />
        </section>

        <section className="mt-12">
          <h2 className="font-display text-h2 font-semibold">What this template uses</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {uses.map((u) => (
              <li key={u} className="bg-muted text-foreground/85 rounded-full px-3 py-1 text-sm">
                {u}
              </li>
            ))}
          </ul>
          <div className="text-muted-foreground mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {template.goals.map((g) => (
              <Link key={g} href={goalPath(g)} className="hover:text-foreground underline-offset-4 hover:underline">
                {goalLabel(g)}
              </Link>
            ))}
            {template.roles.map((r) => (
              <Link key={r} href={rolePath(r)} className="hover:text-foreground underline-offset-4 hover:underline">
                For {roleLabel(r)?.toLowerCase()}
              </Link>
            ))}
          </div>
        </section>

        <section id="template-guide" className="mt-16 grid scroll-mt-24 gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-h2 font-semibold">Questions to consider</h2>
            <ul className="text-body mt-4 flex list-disc flex-col gap-2 pl-5">
              {guide.questionsToConsider.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <h2 className="font-display text-h2 mt-10 font-semibold">How to use the responses</h2>
            <p className="text-body text-muted-foreground mt-4 leading-relaxed">{guide.howToUseResponses}</p>
          </div>
          <div>
            <h2 className="font-display text-h2 font-semibold">How to customize and share it</h2>
            <ol className="mt-4 flex flex-col gap-3">
              {guide.customizeSteps.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="bg-primary/10 text-primary tabular grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-body leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8">{useButton}</div>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-h2 font-semibold">Frequently asked questions</h2>
          <div className="mt-4">
            <FaqList faqs={guide.faqs} />
          </div>
        </section>

        {guides.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display text-h2 font-semibold">The guide for this</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {guides.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={g.path}
                    className="border-border/70 bg-card group flex h-full flex-col rounded-xl border p-5 shadow-xs transition-shadow duration-[var(--duration-standard)] hover:shadow-md"
                  >
                    <span className="text-body font-display font-semibold">{g.title}</span>
                    <span className="text-caption text-muted-foreground mt-1.5 leading-relaxed">{g.navBlurb}</span>
                    <span className="text-caption text-primary mt-3 inline-flex items-center gap-1.5 font-medium">
                      Read the guide
                      <ArrowRight className="size-4 transition-transform duration-[var(--duration-micro)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-16">
            <div className="flex items-end justify-between gap-4">
              <h2 className="font-display text-h2 font-semibold">Related templates</h2>
              <Link href={categoryPath(template.type, template.category)} className="text-primary text-caption shrink-0 font-medium">
                All {categoryLabel(template.type, template.category).toLowerCase()} {type.plural.toLowerCase()}
              </Link>
            </div>
            <TemplateGrid templates={related} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" />
          </section>
        )}
      </Band>

      <CtaBand />
    </>
  );
}
