"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { usePostApiTemplatesBySlugUse } from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { invalidateForms } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateCard, TemplateCardSkeleton } from "@/components/templates/template-card";
import { TemplatePreview } from "@/components/templates/template-preview";
import {
  filterTemplates,
  POPULAR_COUNT,
  templateCategories,
  useTemplates,
  type TemplateSummary,
} from "@/lib/templates";

/**
 * The template gallery.
 *
 * It used to be four cards grouped under two uppercase headings, with a
 * "Use template" button as the only thing you could do — no search, no way to
 * see what a template asked before creating a form from it, and nothing to
 * browse once you had read all four titles.
 *
 * With a real catalogue behind it the screen has a job: help someone find the
 * one that fits, and let them look before they commit.
 */
export default function TemplatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { templates, isLoading } = useTemplates();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [preview, setPreview] = useState<TemplateSummary | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  /**
   * `?t=nps-survey` opens that template's preview — the link the command
   * palette hands out, so picking a template there lands on the template
   * rather than on the gallery with the reader left to find it again.
   *
   * Derived rather than copied into state: the param is the source of truth
   * until someone opens a different card, and `preview` takes over from there.
   */
  const linked = searchParams.get("t");
  const shownPreview = preview ?? (linked ? (templates.find((t) => t.slug === linked) ?? null) : null);

  const closePreview = () => {
    setPreview(null);
    if (linked) router.replace("/templates");
  };

  const categories = useMemo(() => templateCategories(templates), [templates]);
  const shown = useMemo(
    () => filterTemplates(templates, search, category),
    [templates, search, category],
  );

  const use = usePostApiTemplatesBySlugUse<Error>({
    mutation: {
      onSuccess: async (created) => {
        await invalidateForms(queryClient);
        // `/build`, like every other create path. This landed on `/forms/{id}`
        // and left people on a route the builder redirects away from.
        router.push(`/forms/${apiData<{ id: string }>(created).id}/build`);
      },
      /**
       * Said out loud. A refused "Use template" — a form-count limit, a role
       * that cannot create — used to do nothing at all and explain nothing.
       * (A plan denial still opens the global paywall; this is for the rest.)
       */
      onError: (err) => {
        toast.error("Couldn't start from this template", { description: err.message });
        setPendingSlug(null);
      },
    },
  });

  const startFrom = (slug: string) => {
    setPendingSlug(slug);
    use.mutate({ slug });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Templates"
        description={
          templates.length > 0
            ? `${templates.length} ready-made conversations across ${categories.length} categories. Every one is fully editable.`
            : "Start from a proven structure — every template is fully editable."
        }
        actions={
          <Button variant="outline" shape="pill" onClick={() => router.push("/dashboard?new=1")}>
            <Sparkles className="size-4" />
            Describe your own
          </Button>
        }
      />

      <div className="mt-6 space-y-3">
        <div className="relative max-w-md">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, topic or tag…"
            aria-label="Search templates"
            className="h-10 rounded-full pl-9"
          />
        </div>

        {categories.length > 1 && (
          <FilterChips
            ariaLabel="Category"
            value={category}
            onChange={setCategory}
            options={[
              { value: "all", label: "All", count: templates.length },
              { value: "popular", label: "Popular", count: Math.min(POPULAR_COUNT, templates.length) },
              ...categories.map((c) => ({
                value: c,
                label: c,
                count: templates.filter((t) => t.category === c).length,
              })),
            ]}
          />
        )}
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className={GRID}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <TemplateCardSkeleton key={i} />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No templates available yet"
            description="Seed the catalogue with pnpm seed:templates, or describe the form you need and let the AI draft it."
            action={
              <Button shape="pill" onClick={() => router.push("/dashboard?new=1")}>
                <Sparkles className="size-4" />
                Describe your own
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title={`Nothing matches “${search}”`}
            description="Try a different word, or describe what you need and the AI will draft it."
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <ul className={GRID}>
            {shown.map((t) => (
              <li key={t.slug} className="flex">
                <TemplateCard
                  template={t}
                  pending={pendingSlug === t.slug}
                  disabled={use.isPending && pendingSlug !== t.slug}
                  onUse={() => startFrom(t.slug)}
                  onPreview={() => setPreview(t)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <TemplatePreview
        template={shownPreview}
        open={shownPreview !== null}
        onOpenChange={(open) => !open && closePreview()}
        onUse={startFrom}
        pending={pendingSlug === shownPreview?.slug}
      />
    </div>
  );
}

const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
