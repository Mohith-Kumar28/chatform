import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HubPage } from "@/components/templates/gallery/hub-page";
import { TYPES, byCategory, categoryPath, typeByPath, typePath } from "@/content/templates";
import { hubCopy } from "@/content/templates/hubs";
import { hubMetadata } from "@/content/templates/hub-metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return TYPES.flatMap((t) =>
    t.categories.filter((c) => byCategory(t.type, c.slug).length > 0).map((c) => ({ type: t.path, category: c.slug })),
  );
}

function resolve(type: string, category: string) {
  const info = typeByPath(type);
  const cat = info?.categories.find((c) => c.slug === category);
  return info && cat ? { info, cat } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string; category: string }>;
}): Promise<Metadata> {
  const { type, category } = await params;
  const hit = resolve(type, category);
  if (!hit) return {};
  return hubMetadata(categoryPath(hit.info.type, hit.cat.slug), hubCopy(`category:${hit.info.type}/${hit.cat.slug}`));
}

/** One category inside a type, e.g. feedback surveys. */
export default async function TemplateCategoryPage({ params }: { params: Promise<{ type: string; category: string }> }) {
  const { type, category } = await params;
  const hit = resolve(type, category);
  if (!hit) notFound();
  const { info, cat } = hit;
  const path = categoryPath(info.type, cat.slug);

  return (
    <HubPage
      path={path}
      crumbs={[
        { name: info.plural, path: typePath(info.type) },
        { name: `${cat.label} ${info.plural.toLowerCase()}`, path },
      ]}
      copy={hubCopy(`category:${info.type}/${cat.slug}`)}
      templates={byCategory(info.type, cat.slug)}
      typeFilter={false}
      eyebrow={`${byCategory(info.type, cat.slug).length} free ${cat.label.toLowerCase()} ${info.plural.toLowerCase()}`}
    />
  );
}
