import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Band, BandLede, BandTitle } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { CollectionsNav } from "@/components/templates/gallery/collections-nav";
import { FaqList } from "@/components/templates/gallery/faq-list";
import { TemplateBrowser, type BrowsableTemplate } from "@/components/templates/gallery/template-browser";
import { TemplateGrid } from "@/components/templates/gallery/template-grid";
import { Button } from "@/components/ui/button";
import {
  TEMPLATES,
  TEMPLATE_COUNT,
  byGoal,
  categoryLabel,
  goalLabel,
  goalPath,
  summaryOf,
} from "@/content/templates";
import { hubCopy } from "@/content/templates/hubs";
import { hubMetadata } from "@/content/templates/hub-metadata";
import { breadcrumbLd, faqPageLd, itemListLd } from "@/lib/seo";

const PATH = "/form-templates";

export const metadata: Metadata = hubMetadata(PATH, hubCopy("gallery"));

/** The goals the gallery opens with, each as a short row of its templates. */
const FEATURED_GOALS = ["collect-feedback", "generate-leads", "run-events", "onboard-clients"] as const;

/**
 * The public template gallery.
 *
 * The same catalogue the app's `/templates` shows, rendered on the server so a
 * visitor who has never signed in, and a crawler, can reach every template.
 * Organised three ways (goal, role, form type), each a hub page of its own,
 * linked from the sidebar here and on every hub.
 *
 * "All templates" is a search island over the full list, and the full list is
 * in the server HTML: filtering only hides cards.
 */
export default function FormTemplatesPage() {
  const copy = hubCopy("gallery");
  const browsable: BrowsableTemplate[] = TEMPLATES.map((t) => ({
    // The card never shows the blurb, and 291 of them are most of this payload.
    summary: { ...summaryOf(t), blurb: undefined, tags: t.tags.slice(0, 3) },
    path: t.path,
    type: t.type,
    haystack: [t.searchName, t.title, t.description, categoryLabel(t.type, t.category), t.type, ...t.tags]
      .join(" ")
      .toLowerCase(),
  }));

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Form templates", path: PATH },
          ]),
          itemListLd(TEMPLATES.map((t) => ({ name: `${t.searchName} template`, path: t.path }))),
          faqPageLd(copy.faqs.map((f) => ({ question: f.q, answer: f.a }))),
        ]}
      />

      <Band size="tall">
        <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="order-2 lg:order-1">
            <div className="lg:sticky lg:top-24">
              <CollectionsNav current={PATH} />
              <Button asChild variant="outline" shape="pill" className="mt-7 w-full">
                <Link href="/ai-form-builder">
                  <Sparkles className="size-4" />
                  Build it with AI
                </Link>
              </Button>
            </div>
          </aside>

          <div className="order-1 min-w-0 lg:order-2">
            <BandTitle as="h1">{TEMPLATE_COUNT} free form, survey and quiz templates</BandTitle>
            <BandLede className="max-w-2xl">{copy.intro}</BandLede>
            <a
              href="#template-guide"
              className="text-primary text-caption mt-4 inline-flex items-center gap-1.5 font-medium"
            >
              How to choose and use a template
              <ArrowRight className="size-4" />
            </a>

            {FEATURED_GOALS.map((goal) => {
              const all = byGoal(goal);
              if (all.length === 0) return null;
              return (
                <section key={goal} className="mt-14">
                  <div className="border-border/60 flex items-end justify-between gap-4 border-b pb-3">
                    <h2 className="font-display text-h2 font-semibold">{goalLabel(goal)}</h2>
                    <Link href={goalPath(goal)} className="text-primary text-caption shrink-0 font-medium">
                      View all {all.length}
                    </Link>
                  </div>
                  <TemplateGrid templates={all.slice(0, 6)} className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" />
                </section>
              );
            })}

            <section id="all" className="mt-16 scroll-mt-24">
              <h2 className="font-display text-h2 border-border/60 mb-6 border-b pb-3 font-semibold">All templates</h2>
              <TemplateBrowser templates={browsable} />
            </section>

            <section id="template-guide" className="mt-20 scroll-mt-24">
              <h2 className="font-display text-h2 font-semibold">How to choose and use a template</h2>
              <ol className="mt-6 grid gap-4 sm:grid-cols-3">
                {GUIDE_STEPS.map((step, i) => (
                  <li key={step.title} className="border-border/70 bg-card rounded-2xl border p-5">
                    <span className="text-muted-foreground tabular text-xs font-medium">Step {i + 1}</span>
                    <h3 className="font-display mt-1 text-base font-semibold">{step.title}</h3>
                    <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{step.body}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-12">
                <h2 className="font-display text-h2 font-semibold">Frequently asked questions</h2>
                <div className="mt-4">
                  <FaqList faqs={copy.faqs} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </Band>

      <CtaBand />
    </>
  );
}

const GUIDE_STEPS = [
  {
    title: "Start from the decision",
    body: "Pick the template whose answers lead to what you will do next: a quote, a follow-up call, a change to the product. Browse by goal if you know the outcome, by role if you know the audience.",
  },
  {
    title: "Try it as a respondent",
    body: "Every template page runs the real conversation. Answer it the way your respondents would, and watch where the branches take you and which ending you land on.",
  },
  {
    title: "Make it yours",
    body: "Use this template copies it into your account. Change any question, route or ending, then share the link or embed it on your site.",
  },
];
