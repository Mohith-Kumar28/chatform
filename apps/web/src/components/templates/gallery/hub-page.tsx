import { ArrowRight } from "lucide-react";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { categoryLabel, tileOf, type TemplateCardData } from "@/content/templates";
import type { HubCopy } from "@/content/templates/hubs";
import { breadcrumbLd, faqPageLd, itemListLd } from "@/lib/seo";
import { CollectionsNav } from "./collections-nav";
import { FaqList } from "./faq-list";
import { TemplateBrowser, type BrowsableTemplate, type BrowseSection } from "./template-browser";

export interface Crumb {
  name: string;
  path: string;
}

export function browsable(templates: readonly TemplateCardData[]): BrowsableTemplate[] {
  return templates.map((t) => ({
    tile: tileOf(t),
    type: t.type,
    haystack: [t.searchName, t.title, t.description, categoryLabel(t.type, t.category), t.type, ...t.tags].join(" ").toLowerCase(),
  }));
}

/**
 * The gallery and every hub (a type, a category, a goal or a role) share one
 * frame: the collections down the left, pinned as you scroll; a short heading;
 * then the search bar and the grid.
 */
export function HubPage({
  path,
  crumbs,
  copy,
  templates,
  eyebrow,
  heading,
  lede,
  sections,
  allTitle,
  typeFilter = true,
  guideHref,
  children,
}: {
  path: string;
  /** Trail after "Form templates", ending with this page. Empty on the gallery itself. */
  crumbs: Crumb[];
  copy: HubCopy;
  templates: readonly TemplateCardData[];
  eyebrow: string;
  heading?: string;
  lede?: string;
  sections?: BrowseSection[];
  allTitle?: string;
  /** Off on a type or category hub, where every template is already one type. */
  typeFilter?: boolean;
  /** An anchor to a guide further down the page. */
  guideHref?: string;
  children?: React.ReactNode;
}) {
  const trail = [{ name: "Templates", path: "/form-templates" }, ...crumbs];

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([{ name: "chatform", path: "/" }, ...trail]),
          itemListLd(templates.map((t) => ({ name: `${t.searchName} template`, path: t.path }))),
          faqPageLd(copy.faqs.map((f) => ({ question: f.q, answer: f.a }))),
        ]}
      />

      <div className="mx-auto w-full max-w-7xl px-4 pt-10 pb-20 sm:px-6 lg:pt-14">
        <div className="grid gap-10 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-14">
          <aside className="order-2 lg:order-1">
            <div className="lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto lg:pr-1 lg:pb-6">
              <CollectionsNav current={path} />
            </div>
          </aside>

          <div className="order-1 min-w-0 lg:order-2">
            <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">{eyebrow}</p>
            <h1 className="font-display text-foreground mt-3 text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl lg:text-[3.5rem]">
              {heading ?? copy.h1}
            </h1>
            <p className="text-foreground/75 mt-4 max-w-2xl text-lg leading-relaxed">{lede ?? copy.metaDescription}</p>
            {guideHref && (
              <a href={guideHref} className="text-foreground hover:text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline">
                How to choose and use a template
                <ArrowRight className="size-4" />
              </a>
            )}

            <div className="mt-8">
              <TemplateBrowser templates={browsable(templates)} sections={sections} crumbs={trail} allTitle={allTitle} typeFilter={typeFilter} />
            </div>

            {children}

            <section className="mt-20">
              {!lede && (
                <p className="text-foreground/80 mb-10 max-w-3xl text-[1.0625rem] leading-relaxed">{copy.intro}</p>
              )}
              <h2 className="font-display text-foreground text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                Frequently asked questions
              </h2>
              <div className="mt-5">
                <FaqList faqs={copy.faqs} />
              </div>
            </section>
          </div>
        </div>
      </div>

      <CtaBand />
    </>
  );
}
