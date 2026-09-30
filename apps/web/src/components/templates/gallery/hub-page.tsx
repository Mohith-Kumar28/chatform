import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Band, BandLede, BandTitle } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import type { TemplateCardData } from "@/content/templates";
import type { HubCopy } from "@/content/templates/hubs";
import { breadcrumbLd, faqPageLd, itemListLd } from "@/lib/seo";
import { CollectionsNav } from "./collections-nav";
import { FaqList } from "./faq-list";
import { TemplateGrid } from "./template-grid";

export interface Crumb {
  name: string;
  path: string;
}

/**
 * One hub: a type, a category, a goal or a role.
 *
 * The collections sidebar on every hub, so any template page is at most two
 * links from any other, and a crawler that lands on one hub finds them all.
 */
export function HubPage({
  path,
  crumbs,
  copy,
  templates,
  children,
}: {
  path: string;
  /** Trail after "Form templates", ending with this page. */
  crumbs: Crumb[];
  copy: HubCopy;
  templates: readonly TemplateCardData[];
  /** Extra sections under the grid, e.g. a type's category list. */
  children?: React.ReactNode;
}) {
  const trail = [{ name: "chatform", path: "/" }, { name: "Form templates", path: "/form-templates" }, ...crumbs];

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd(trail),
          itemListLd(templates.map((t) => ({ name: `${t.searchName} template`, path: t.path }))),
          faqPageLd(copy.faqs.map((f) => ({ question: f.q, answer: f.a }))),
        ]}
      />

      <Band>
        <nav aria-label="Breadcrumb" className="text-muted-foreground text-caption flex flex-wrap items-center gap-1">
          {trail.slice(1).map((c, i, all) => (
            <span key={c.path} className="inline-flex items-center gap-1">
              {i < all.length - 1 ? (
                <Link href={c.path} className="hover:text-foreground transition-colors duration-[var(--duration-micro)]">
                  {c.name}
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground">
                  {c.name}
                </span>
              )}
              {i < all.length - 1 && <ChevronRight className="size-3.5" />}
            </span>
          ))}
        </nav>

        <div className="mt-6 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="order-2 lg:order-1">
            <div className="lg:sticky lg:top-24">
              <CollectionsNav current={path} />
            </div>
          </aside>

          <div className="order-1 min-w-0 lg:order-2">
            <BandTitle as="h1">{copy.h1}</BandTitle>
            <BandLede className="max-w-2xl">{copy.intro}</BandLede>
            <p className="text-muted-foreground tabular mt-4 text-sm">
              {templates.length} {templates.length === 1 ? "template" : "templates"}
            </p>

            <TemplateGrid templates={templates} className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" />

            {children}

            <section className="mt-16">
              <h2 className="font-display text-h2 font-semibold">Frequently asked questions</h2>
              <div className="mt-4">
                <FaqList faqs={copy.faqs} />
              </div>
            </section>
          </div>
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
