"use client";

import { ArrowRight, Blocks, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getGetApiTemplatesBySlugQueryKey, useGetApiTemplatesBySlug } from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { templateAccent } from "@/lib/category-accent";
import type { TemplateSummary } from "@/lib/templates";
import { cn } from "@/lib/utils";

interface PreviewDoc {
  doc?: {
    blocks?: { ref: string; type: string; title?: string; required?: boolean }[];
    endings?: { title?: string }[];
  };
}

/**
 * What a template actually asks, before you commit to it.
 *
 * Until now the only way to find out was to create a form from it and delete
 * the form if it wasn't right — which is a strange thing to make someone undo.
 * The questions are drawn as the conversation a respondent would have, because
 * that is what the template is.
 */
export function TemplatePreview({
  template,
  open,
  onOpenChange,
  onUse,
  pending,
}: {
  template: TemplateSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (slug: string) => void;
  pending: boolean;
}) {
  const slug = template?.slug ?? "";
  const { data, isLoading } = useGetApiTemplatesBySlug(slug, {
    query: {
      queryKey: getGetApiTemplatesBySlugQueryKey(slug),
      // Nothing to fetch until a card is opened, and the document does not
      // change between openings.
      enabled: open && slug.length > 0,
      staleTime: 5 * 60_000,
    },
  });

  const detail = apiData<PreviewDoc>(data);
  const blocks = detail?.doc?.blocks ?? [];
  const greeting = blocks.find((b) => b.type === "welcome" || b.type === "statement");
  const questions = blocks.filter((b) => b.type !== "welcome" && b.type !== "statement");
  const accent = template ? templateAccent(template.category, template.accent, template.icon) : null;
  const Icon = accent?.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {template && (
          <>
            <SheetHeader className="border-border border-b p-6 text-left">
              <div className="flex items-start gap-3">
                {Icon && accent && (
                  <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", accent.tile)}>
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                )}
                <div className="min-w-0">
                  <SheetTitle className="font-display text-lg">{template.title}</SheetTitle>
                  <SheetDescription>{template.category}</SheetDescription>
                </div>
              </div>

              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                {template.blurb || template.description}
              </p>

              <div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
                {template.blockCount !== undefined && (
                  <span className="tabular inline-flex items-center gap-1">
                    <Blocks className="size-3" strokeWidth={1.75} />
                    {template.blockCount} questions
                  </span>
                )}
                {template.estMinutes !== undefined && (
                  <span className="tabular inline-flex items-center gap-1">
                    <Clock className="size-3" strokeWidth={1.75} />~{template.estMinutes} min
                  </span>
                )}
              </div>

              {template.tags && template.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {template.tags.map((tag) => (
                    <span key={tag} className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[0.6875rem]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="shimmer h-10 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {greeting?.title && (
                    <p className="bg-muted text-foreground w-fit max-w-[90%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
                      {greeting.title}
                    </p>
                  )}
                  {questions.map((q, i) => (
                    <div key={q.ref} className="flex items-start gap-2.5">
                      <span className="text-muted-foreground tabular mt-2 w-4 shrink-0 text-right text-[0.6875rem]">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="bg-muted text-foreground w-fit max-w-full rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
                          {q.title}
                        </p>
                        <p className="text-muted-foreground mt-1 pl-1 text-[0.6875rem]">
                          {q.type.replace(/_/g, " ")}
                          {q.required ? " · required" : " · optional"}
                        </p>
                      </div>
                    </div>
                  ))}
                  {detail?.doc?.endings?.[0]?.title && (
                    <p className="text-muted-foreground border-border mt-4 border-t pt-4 text-xs">
                      Ends with: “{detail.doc.endings[0].title}”
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="border-border border-t p-4">
              <Button
                shape="pill"
                className="w-full"
                disabled={pending}
                onClick={() => onUse(template.slug)}
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    Use this template
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
              <p className="text-muted-foreground mt-2 text-center text-xs">
                Everything here is editable once it&apos;s yours.
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
