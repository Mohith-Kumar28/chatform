import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { HubPage } from "@/components/templates/gallery/hub-page";
import { TYPES, byCategory, byType, categoryPath, typeByPath, typePath } from "@/content/templates";
import { hubCopy } from "@/content/templates/hubs";
import { hubMetadata } from "@/content/templates/hub-metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return TYPES.map((t) => ({ type: t.path }));
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const info = typeByPath((await params).type);
  if (!info) return {};
  return hubMetadata(typePath(info.type), hubCopy(`type:${info.type}`));
}

/** Every form, every survey or every quiz, with its categories one click down. */
export default async function TemplateTypePage({ params }: { params: Promise<{ type: string }> }) {
  const info = typeByPath((await params).type);
  if (!info) notFound();
  const path = typePath(info.type);
  const categories = info.categories
    .map((c) => ({ ...c, count: byCategory(info.type, c.slug).length }))
    .filter((c) => c.count > 0);

  return (
    <HubPage
      path={path}
      crumbs={[{ name: `${info.plural}`, path }]}
      copy={hubCopy(`type:${info.type}`)}
      templates={byType(info.type)}
    >
      <section className="mt-16">
        <h2 className="font-display text-h2 font-semibold">{info.label} categories</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={categoryPath(info.type, c.slug)}
                className="border-border/70 bg-card hover:bg-accent/60 text-caption inline-flex rounded-full border px-3.5 py-1.5 font-medium transition-colors duration-[var(--duration-micro)]"
              >
                {c.label}
                <span className="text-muted-foreground tabular ml-1.5">{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </HubPage>
  );
}
