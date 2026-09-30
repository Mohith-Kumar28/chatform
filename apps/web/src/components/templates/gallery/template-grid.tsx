import { TemplateCard } from "@/components/templates/template-card";
import { summaryOf, type TemplateCardData } from "@/content/templates";

/** A grid of public template cards, each linking to its page. */
export function TemplateGrid({ templates, className }: { templates: readonly TemplateCardData[]; className?: string }) {
  return (
    <ul className={className ?? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"}>
      {templates.map((t) => (
        <li key={t.slug} className="flex">
          <TemplateCard template={summaryOf(t)} href={t.path} />
        </li>
      ))}
    </ul>
  );
}
