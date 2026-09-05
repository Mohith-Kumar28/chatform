"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  Copy,
  ExternalLink,
  LayoutGrid,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  Rows3,
  Search,
  Sparkles,
  Trash2,
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface FormRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  responses: number;
  updatedAt: number;
}

type Sort = "newest" | "oldest" | "responses" | "alpha";

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
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  // ?new=1 lets the command palette open the create dialog.
  const [createOpen, setCreateOpen] = useState(searchParams.get("new") === "1");
  const [pendingDelete, setPendingDelete] = useState<FormRow | null>(null);

  const forms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allForms
      .filter((f) => !q || f.title.toLowerCase().includes(q) || f.slug.includes(q))
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
  }, [allForms, query, sort]);

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
        description="Conversations that collect what you need."
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
              placeholder="Search forms…"
              className="h-9 rounded-full pl-8"
            />
          </div>

          {/* Both of these were declared as state and never rendered, so the
              imported Search and ArrowUpDown icons sat unused. */}
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
              <div key={i} className="shimmer h-44 rounded-xl" />
            ))}
          </div>
        ) : allForms.length === 0 ? (
          <EmptyState
            icon={MessageSquarePlus}
            title="No forms yet"
            description="Create your first conversational form. Describe it in a sentence and the AI will draft it for you."
            action={
              <Button shape="pill" onClick={() => setCreateOpen(true)}>
                <Sparkles className="size-4" />
                Create your first form
              </Button>
            }
            hint="Or start from a template."
          />
        ) : forms.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title={`Nothing matches “${query}”`}
            description="Try a different search."
            action={
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <ul className={cn(layout === "grid" ? GRID : "space-y-2")} data-tour="form-list">
            {forms.map((form) => (
              <li key={form.id}>
                <FormCard
                  form={form}
                  layout={layout}
                  onDelete={() => setPendingDelete(form)}
                />
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

const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

function FormCard({
  form,
  layout,
  onDelete,
}: {
  form: FormRow;
  layout: "grid" | "list";
  onDelete: () => void;
}) {
  const published = form.status === "published";
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/f/${form.slug}` : "";

  const meta = (
    <>
      <Badge variant={published ? "secondary" : "outline"} className={cn(published && "text-[var(--success)]")}>
        {published ? "Live" : "Draft"}
      </Badge>
      <span className="text-muted-foreground tabular text-xs">
        {form.responses} response{form.responses === 1 ? "" : "s"}
      </span>
      <span className="text-muted-foreground text-xs">{relativeTime(form.updatedAt)}</span>
    </>
  );

  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${form.title}`}
          onClick={(e) => e.preventDefault()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={`/forms/${form.id}/results`}>Results</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/forms/${form.id}/share`}>Share</Link>
        </DropdownMenuItem>
        {published && (
          <>
            <DropdownMenuItem
              onSelect={async () => {
                await navigator.clipboard.writeText(publicUrl);
                toast.success("Link copied");
              }}
            >
              <Copy className="size-3.5" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Open live form
              </a>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (layout === "list") {
    return (
      <div className="bg-card hover:bg-muted/40 flex items-center gap-3 rounded-xl px-4 py-3 transition-colors">
        <Link href={`/forms/${form.id}/build`} className="min-w-0 flex-1">
          <p className="truncate font-medium">{form.title}</p>
          <div className="mt-0.5 flex items-center gap-2">{meta}</div>
        </Link>
        {actions}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card group relative overflow-hidden rounded-2xl",
        "shadow-xs hover:shadow-md transition-[box-shadow,border-color] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        ""
      )}
    >
      {/* The whole card is the target — it used to be a plain div with a tiny
          hover-revealed icon as the only way in. */}
      <Link href={`/forms/${form.id}/build`} className="block">
        <div className="from-primary-soft to-accent/40 relative h-24 bg-gradient-to-br">
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-display text-primary/40 text-2xl">{form.title.charAt(0).toUpperCase()}</span>
          </div>
        </div>
        <div className="space-y-2 p-4">
          <p className="truncate font-medium">{form.title}</p>
          <div className="flex flex-wrap items-center gap-2">{meta}</div>
        </div>
      </Link>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {actions}
      </div>
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
