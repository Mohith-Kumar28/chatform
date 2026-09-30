import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
      crumbs={[{ name: info.plural, path }]}
      copy={hubCopy(`type:${info.type}`)}
      templates={byType(info.type)}
      typeFilter={false}
      eyebrow={`${byType(info.type).length} free ${info.label.toLowerCase()} templates`}
      sections={categories.map((c) => ({
        title: `${c.label} ${info.plural.toLowerCase()}`,
        href: categoryPath(info.type, c.slug),
        count: c.count,
        slugs: byCategory(info.type, c.slug).slice(0, 3).map((t) => t.slug),
      }))}
      allTitle={`All ${info.plural.toLowerCase()}`}
    />
  );
}
