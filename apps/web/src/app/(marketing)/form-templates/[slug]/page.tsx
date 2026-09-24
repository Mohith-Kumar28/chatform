import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Band } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { TemplateCard } from "@/components/templates/template-card";
import { TemplateHero, TemplatePanes } from "@/components/templates/template-detail";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { TEMPLATES, getTemplate, guidesFor, summaryOf } from "@/content/templates";
import { breadcrumbLd, canonical, openGraphBase } from "@/lib/seo";

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
  const description = `A free ${template.searchName.toLowerCase()} template: ${template.blockCount} questions, about ${template.estMinutes} minute${template.estMinutes === 1 ? "" : "s"} to answer. ${template.description} Asked as a conversation, and yours to edit.`;
  return {
    title,
    description,
    ...canonical(template.path),
    openGraph: { ...openGraphBase(template.path), title, description },
    twitter: { card: "summary_large_image" },
  };
}

/**
 * One template, public.
 *
 * The app's own template view — the same hero, the same conversation pane and
 * the same flow diagram — so the page somebody finds from a search for "client
 * intake form template" is the page they would see inside the product, not a
 * marketing drawing of it. Only the action differs: here it leads to the app's
 * copy of this template, and the auth guard sends a signed-out visitor through
 * sign-up and back to it.
 */
export default async function FormTemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const template = getTemplate((await params).slug);
  if (!template) notFound();

  const guides = guidesFor(template.slug);
  const related = TEMPLATES.filter(
    (t) => t.category === template.category && t.slug !== template.slug,
  ).slice(0, 3);
  const useHref = `/templates/${template.slug}`;

  const useButton = (
    <Button asChild shape="pill" size="lg">
      <Link href={useHref}>
        Use this template
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  );

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Form templates", path: "/form-templates" },
            { name: `${template.searchName} template`, path: template.path },
          ]),
        ]}
      />

      <Band>
        <Link
          href="/form-templates"
          className="text-caption text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors duration-[var(--duration-micro)]"
        >
          <ArrowLeft className="size-4" />
          All form templates
        </Link>

        <TemplateHero
          detail={template}
          doc={template.doc}
          heading={`${template.searchName} template`}
          action={useButton}
        />

        <TemplatePanes doc={template.doc} title={template.searchName} className="mt-8" />

        <div className="border-border mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <p className="text-muted-foreground text-body max-w-xl">
            Free, with unlimited responses. Start from this and change anything — questions,
            wording, routes, endings — or describe your own form and let chatform draft it.
          </p>
          {useButton}
        </div>

        {guides.length > 0 && (
          <div className="mt-12">
            <h2 className="font-display text-h2 font-semibold">The guide for this</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {guides.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={guide.path}
                    className="border-border/70 bg-card group flex h-full flex-col rounded-xl border p-5 shadow-xs transition-shadow duration-[var(--duration-standard)] hover:shadow-md"
                  >
                    <span className="text-body font-display font-semibold">{guide.title}</span>
                    <span className="text-caption text-muted-foreground mt-1.5 leading-relaxed">
                      {guide.navBlurb}
                    </span>
                    <span className="text-caption text-primary mt-3 inline-flex items-center gap-1.5 font-medium">
                      Read the guide
                      <ArrowRight className="size-4 transition-transform duration-[var(--duration-micro)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {related.length > 0 && (
          <div className="mt-12">
            <h2 className="font-display text-h2 font-semibold">More {template.category.toLowerCase()} templates</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((t) => (
                <li key={t.slug} className="flex">
                  <TemplateCard template={summaryOf(t)} href={t.path} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Band>

      <CtaBand />
    </>
  );
}
