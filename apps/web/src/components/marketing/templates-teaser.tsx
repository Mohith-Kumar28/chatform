import { TemplateTile } from "@/components/templates/gallery/template-tile";
import { TEMPLATE_COUNT, getTemplate, tileOf } from "@/content/templates";
import { Band } from "./band";
import { SectionTitle, TextLink } from "./kit";

/**
 * Three templates, drawn with the gallery's own tile (their real opening, in
 * their real theme), and the way into all of them. Server-only: the catalogue
 * import stays out of the client bundle and only the three tiles cross over.
 */
const PICKS = ["client-intake", "nps-survey", "event-rsvp"] as const;

export function TemplatesTeaser() {
  const tiles = PICKS.map(getTemplate).filter((t) => t !== undefined).map(tileOf);

  return (
    <Band id="templates" tone="sand">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionTitle eyebrow="Skip the blank page" accent="for your next big thing.">
            A head start
          </SectionTitle>
          <p className="text-muted-foreground mt-4">A few of the {TEMPLATE_COUNT} ready-made forms, surveys and quizzes.</p>
        </div>
        <TextLink href="/form-templates">Explore all templates</TextLink>
      </div>

      <ul className="mt-12 grid gap-8 md:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.slug} className="transition-transform duration-200 hover:-translate-y-1 motion-reduce:transform-none">
            <TemplateTile tile={tile} />
          </li>
        ))}
      </ul>
    </Band>
  );
}
