import type { Metadata } from "next";
import { HubPage } from "@/components/templates/gallery/hub-page";
import { TEMPLATES, TEMPLATE_COUNT, byGoal, goalLabel, goalPath } from "@/content/templates";
import { hubCopy } from "@/content/templates/hubs";
import { hubMetadata } from "@/content/templates/hub-metadata";

const PATH = "/form-templates";

export const metadata: Metadata = hubMetadata(PATH, hubCopy("gallery"));

/** The goals the gallery opens with, each as a short row of its templates. */
const FEATURED_GOALS = ["collect-feedback", "generate-leads", "run-events", "onboard-clients"] as const;

/**
 * The public template gallery.
 *
 * Organised three ways (goal, role, form type), each a hub page of its own and
 * all linked from the sidebar. The page opens on four goals, then everything,
 * with search and a type filter pinned above the grid.
 */
export default function FormTemplatesPage() {
  return (
    <HubPage
      path={PATH}
      crumbs={[]}
      copy={hubCopy("gallery")}
      templates={TEMPLATES}
      eyebrow={`${TEMPLATE_COUNT} free form, survey and quiz templates`}
      heading="Find your next form."
      lede="Start with your goal, your role, or a search. Every template runs as a real conversation you can try here, then make your own."
      sections={FEATURED_GOALS.map((goal) => {
        const all = byGoal(goal);
        return { title: goalLabel(goal) ?? goal, href: goalPath(goal), count: all.length, slugs: all.slice(0, 3).map((t) => t.slug) };
      })}
    >
      <section id="template-guide" className="mt-20 scroll-mt-24">
        <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">A little guidance</p>
        <h2 className="font-display text-foreground mt-2 text-3xl font-semibold tracking-tight">How to choose and use a template</h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {GUIDE_STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="bg-brand-gradient grid size-9 place-items-center rounded-full text-sm font-bold text-white">{i + 1}</span>
              <h3 className="font-display text-foreground mt-3 text-lg font-semibold">{step.title}</h3>
              <p className="text-foreground/75 mt-1.5 leading-relaxed">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </HubPage>
  );
}

const GUIDE_STEPS = [
  {
    title: "Start from the decision",
    body: "Pick the template whose answers lead to what you will do next: a quote, a follow-up call, a change to the product.",
  },
  {
    title: "Try it as a respondent",
    body: "Every template page runs the real conversation. Answer it like your respondents would and see where the branches go.",
  },
  {
    title: "Make it yours",
    body: "Use this template copies it into your account. Change any question, route or ending, then share a link or embed it.",
  },
];
