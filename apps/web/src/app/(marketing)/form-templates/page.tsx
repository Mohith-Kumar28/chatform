import type { Metadata } from "next";
import { HubPage } from "@/components/templates/gallery/hub-page";
import { GalleryGuide } from "@/components/templates/gallery/gallery-guide";
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
      guideHref="#template-guide"
      lede="Start with your goal, your role, or a search. Every template runs as a real conversation you can try here, then make your own."
      sections={FEATURED_GOALS.map((goal) => {
        const all = byGoal(goal);
        return { title: goalLabel(goal) ?? goal, href: goalPath(goal), count: all.length, slugs: all.slice(0, 3).map((t) => t.slug) };
      })}
    >
      <GalleryGuide />
    </HubPage>
  );
}
