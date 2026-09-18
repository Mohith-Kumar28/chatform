import type { Metadata } from "next";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { TemplateCard } from "@/components/templates/template-card";
import { JsonLd } from "@/components/seo/json-ld";
import { TEMPLATES, summaryOf, templatesByCategory } from "@/content/templates";
import { breadcrumbLd, canonical, itemListLd, openGraphBase } from "@/lib/seo";

const PATH = "/form-templates";
const TITLE = "Free form templates — conversational, with the logic built in";
const DESCRIPTION = `${TEMPLATES.length} free form and survey templates: client intake, contact, job application, NPS, event RSVP and more. See every question and branch before you start, then edit anything. Unlimited responses.`;

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · chatform` },
  description: DESCRIPTION,
  ...canonical(PATH),
  openGraph: { ...openGraphBase(PATH), title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

/**
 * The public template gallery.
 *
 * The same catalogue the app's `/templates` shows, rendered on the server so a
 * visitor who has never signed in — and a crawler — can read every template:
 * what it asks, in what order, and where the answers lead. The app's gallery
 * stays where it is; it has search, filters and a create shortcut that mean
 * nothing to somebody without an account.
 *
 * Grouped by category rather than filtered: without an account there is
 * nothing to personalise, and a page that shows everything at once is also the
 * page that links to everything at once.
 */
export default function FormTemplatesPage() {
  const groups = templatesByCategory();

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Form templates", path: PATH },
          ]),
          itemListLd(TEMPLATES.map((t) => ({ name: `${t.searchName} template`, path: t.path }))),
        ]}
      />

      <Band size="tall">
        <div className="max-w-3xl">
          <BandTitle as="h1">Free form templates, already written as conversations.</BandTitle>
          <BandLede className="max-w-2xl">
            {TEMPLATES.length} templates with the questions, the follow-ups and the branching
            already in place. Open one to read every question and see where each answer leads —
            then start from it and change anything.
          </BandLede>
        </div>

        <nav aria-label="Template categories" className="mt-10 flex flex-wrap gap-2">
          {groups.map((group) => (
            <a
              key={group.category}
              href={`#${group.category.toLowerCase()}`}
              className="border-border/70 bg-card hover:bg-accent/60 text-caption rounded-full border px-3.5 py-1.5 font-medium transition-colors duration-[var(--duration-micro)]"
            >
              {group.category}
              <span className="text-muted-foreground tabular ml-1.5">{group.items.length}</span>
            </a>
          ))}
        </nav>

        <div className="mt-14 flex flex-col gap-14">
          {groups.map((group) => (
            <section key={group.category} id={group.category.toLowerCase()} className="scroll-mt-24">
              <h2 className="text-h1 font-display border-border/60 border-b pb-3 font-bold">
                {group.category} templates
              </h2>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((template) => (
                  <li key={template.slug} className="flex">
                    <TemplateCard template={summaryOf(template)} href={template.path} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
