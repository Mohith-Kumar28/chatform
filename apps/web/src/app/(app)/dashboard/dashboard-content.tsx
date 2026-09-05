"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  LayoutGrid,
  MessageSquarePlus,
  Plus,
  Rows3,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  getGetApiFormsQueryKey,
  useDeleteApiFormsById,
  useGetApiForms,
} from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { invalidateForms } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { TooltipHint } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NEW_FORM_EVENT } from "@/components/dashboard/use-app-shortcuts";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AiCapBanner } from "@/components/billing/ai-cap-banner";
import { CreateFormDialog } from "@/components/forms/create-form-dialog";
import { FormCard, type FormRow } from "@/components/forms/form-card";

type Sort = "newest" | "oldest" | "responses" | "alpha";
type StatusFilter = "all" | "live" | "draft";

export function DashboardContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data, isLoading } = useGetApiForms({
    query: { queryKey: getGetApiFormsQueryKey() },
  });
  // Memoised so it is not a fresh array on every render — the sort below
  // depends on it, and an unstable dependency re-sorts the whole grid whenever
  // anything else in this component changes.
  const allForms = useMemo(() => apiData<FormRow[]>(data) ?? [], [data]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  // ?new=1 lets the command palette open the create dialog.
  const [createOpen, setCreateOpen] = useState(searchParams.get("new") === "1");
  const [pendingDelete, setPendingDelete] = useState<FormRow | null>(null);

  const liveCount = useMemo(
    () => allForms.filter((f) => f.status === "published").length,
    [allForms],
  );
  const totalResponses = useMemo(
    () => allForms.reduce((sum, f) => sum + f.responses, 0),
    [allForms],
  );

  const forms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allForms
      .filter((f) => {
        if (status === "live" && f.status !== "published") return false;
        if (status === "draft" && f.status === "published") return false;
        if (!q) return true;
        // Search the questions too: someone looking for "the NPS one" is
        // searching for a question they remember, not a title they chose.
        return (
          f.title.toLowerCase().includes(q) ||
          f.slug.includes(q) ||
          (f.preview ?? []).some((line) => line.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        switch (sort) {
          case "responses":
            return b.responses - a.responses;
          case "alpha":
            return a.title.localeCompare(b.title);
          case "oldest":
            // Sort on the real timestamp. This used to compare ids as a proxy
            // for recency, which is only accidentally correct.
            return a.updatedAt - b.updatedAt;
          default:
            return b.updatedAt - a.updatedAt;
        }
      });
  }, [allForms, query, sort, status]);

  /**
   * `N` opens the dialog. The key is registered in the shell, which owns the
   * keyboard layer for every page here, but the dialog is state in this
   * component — so the shell announces the intent and this answers it.
   */
  useEffect(() => {
    const open = () => setCreateOpen(true);
    window.addEventListener(NEW_FORM_EVENT, open);
    return () => window.removeEventListener(NEW_FORM_EVENT, open);
  }, []);

  const remove = useDeleteApiFormsById<Error>({
    mutation: {
      onSuccess: () => {
        void invalidateForms(queryClient);
        toast.success("Form deleted");
      },
      onError: (e) => toast.error("Couldn't delete", { description: e.message }),
    },
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Forms"
        description={
          allForms.length > 0
            ? `${allForms.length} form${allForms.length === 1 ? "" : "s"} · ${liveCount} live · ${totalResponses.toLocaleString()} response${totalResponses === 1 ? "" : "s"}`
            : "Conversations that collect what you need."
        }
        actions={
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button shape="pill" onClick={() => setCreateOpen(true)} data-tour="new-form">
                  <Plus className="size-4" />
                  New form
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <TooltipHint label="New form" keys="N" />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        }
      />

      {/* Only renders past 80% of the AI cap, and only for someone with forms — the rule is
          never to sell before there is data. */}
      {allForms.length > 0 && (
        <div className="mt-6">
          <AiCapBanner />
        </div>
      )}

      {allForms.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search forms and questions…"
              className="h-9 rounded-full pl-8"
            />
          </div>

          <FilterChips
            ariaLabel="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All", count: allForms.length },
              { value: "live", label: "Live", count: liveCount },
              { value: "draft", label: "Drafts", count: allForms.length - liveCount },
            ]}
            className="pb-0"
          />

          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-9 w-auto gap-1.5 rounded-full">
              <ArrowUpDown className="size-3.5 opacity-60" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Recently updated</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="responses">Most responses</SelectItem>
              <SelectItem value="alpha">Name A–Z</SelectItem>
            </SelectContent>
          </Select>

          <SegmentedControl
            size="sm"
            ariaLabel="Layout"
            options={[
              { value: "grid", label: "", icon: LayoutGrid },
              { value: "list", label: "", icon: Rows3 },
            ]}
            value={layout}
            onChange={setLayout}
            className="ml-auto hidden sm:inline-flex"
          />
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className={cn(layout === "grid" ? GRID : "space-y-2")}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-64 rounded-2xl" />
            ))}
          </div>
        ) : allForms.length === 0 ? (
          <EmptyState
            icon={MessageSquarePlus}
            title="No forms yet"
            description="Describe what you want to find out and the AI drafts the conversation — or start from one of the templates."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button shape="pill" onClick={() => setCreateOpen(true)}>
                  <Sparkles className="size-4" />
                  Create your first form
                </Button>
                <Button shape="pill" variant="outline" onClick={() => router.push("/templates")}>
                  Browse templates
                </Button>
              </div>
            }
          />
        ) : forms.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title={query ? `Nothing matches “${query}”` : "Nothing with that status"}
            description={query ? "Try a different search." : "Switch back to All to see the rest."}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <ul className={cn(layout === "grid" ? GRID : "space-y-2")} data-tour="form-grid">
            {forms.map((form) => (
              <li key={form.id}>
                <FormCard form={form} layout={layout} onDelete={() => setPendingDelete(form)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateFormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open && searchParams.get("new")) router.replace("/dashboard");
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete “${pendingDelete?.title}”?`}
        description="Responses already collected stay in your account, but the form stops accepting new ones and disappears from this list."
        confirmLabel="Delete form"
        /*
          `mutate`, not `mutateAsync`. Both report through the same `onError`
          toast, but the async form also rejects — and nothing awaits it here,
          so a refused delete surfaced correctly to the user and as an
          unhandled rejection in the console at the same time.
        */
        onConfirm={() => {
          if (pendingDelete) remove.mutate({ id: pendingDelete.id });
        }}
      />
    </div>
  );
}

/**
 * Two up, three at the very widest. The old grid reached three columns at
 * `lg`, which left every card too narrow to carry a description — so it
 * didn't have one.
 */
const GRID = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";
