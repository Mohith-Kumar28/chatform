import { useMemo } from "react";
import {
  getGetApiTemplatesQueryKey,
  useGetApiTemplates,
} from "@/lib/api/dashboard/dashboard";

/**
 * One shape for a template row, shared by the gallery page and the create
 * dialog.
 *
 * The generated type covers what the endpoint has always returned; the rest
 * are optional here so this file does not have to land in the same commit as
 * the API that starts sending them. A template with no blurb, icon or accent
 * still renders — it just falls back to its category for colour and to its
 * description for the long copy.
 */
export interface TemplateSummary {
  slug: string;
  title: string;
  category: string;
  description: string;
  /** Two or three sentences, for the preview panel. */
  blurb?: string;
  tags?: string[];
  /** A key into the icon registry in `lib/category-accent.ts`. */
  icon?: string;
  /** A `--family-*` key. */
  accent?: string;
  blockCount?: number;
  estMinutes?: number;
  usageCount?: number;
}

/** How many of the most-used templates the "Popular" filter shows. */
export const POPULAR_COUNT = 8;

function toTemplate(row: unknown): TemplateSummary | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.slug !== "string" || typeof r.title !== "string") return null;
  return {
    slug: r.slug,
    title: r.title,
    category: typeof r.category === "string" ? r.category : "Other",
    description: typeof r.description === "string" ? r.description : "",
    blurb: typeof r.blurb === "string" ? r.blurb : undefined,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : undefined,
    icon: typeof r.icon === "string" ? r.icon : undefined,
    accent: typeof r.accent === "string" ? r.accent : undefined,
    blockCount: typeof r.blockCount === "number" ? r.blockCount : undefined,
    estMinutes: typeof r.estMinutes === "number" ? r.estMinutes : undefined,
    usageCount: typeof r.usageCount === "number" ? r.usageCount : undefined,
  };
}

/**
 * The templates list, normalised. Cached for a good while — the catalogue is
 * official content that changes on deploys, not on the hour.
 */
export function useTemplates() {
  const query = useGetApiTemplates({
    query: { queryKey: getGetApiTemplatesQueryKey(), staleTime: 5 * 60_000 },
  });
  const templates = useMemo(() => {
    const raw = query.data as unknown;
    if (!Array.isArray(raw)) return [] as TemplateSummary[];
    return raw.map(toTemplate).filter((t): t is TemplateSummary => t !== null);
  }, [query.data]);
  return { templates, isLoading: query.isLoading, error: query.error };
}

/** Category names in the order they should appear, most-used first. */
export function templateCategories(templates: readonly TemplateSummary[]): string[] {
  const counts = new Map<string, number>();
  for (const t of templates) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

/**
 * Search across everything a person might type: the title, the summary, the
 * category, and the tags. Matching only the title means searching "feedback"
 * misses the template whose description is entirely about feedback.
 */
export function filterTemplates(
  templates: readonly TemplateSummary[],
  query: string,
  category: string,
): TemplateSummary[] {
  const q = query.trim().toLowerCase();
  let out = templates.filter((t) => category === "all" || t.category === category);
  if (category === "popular") {
    out = [...templates]
      .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
      .slice(0, POPULAR_COUNT);
  }
  if (!q) return out;
  return out.filter((t) =>
    [t.title, t.description, t.blurb, t.category, ...(t.tags ?? [])]
      .filter(Boolean)
      .some((field) => (field as string).toLowerCase().includes(q)),
  );
}
