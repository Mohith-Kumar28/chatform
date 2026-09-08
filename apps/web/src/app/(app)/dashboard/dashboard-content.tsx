"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  FolderInput,
  MessageSquarePlus,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getGetApiFormsQueryKey,
  useDeleteApiFormsById,
  useGetApiForms,
  useGetApiWorkspaces,
  usePatchApiFormsByIdWorkspace,
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
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AiCapBanner } from "@/components/billing/ai-cap-banner";
import { CreateFormDialog } from "@/components/forms/create-form-dialog";
import { FormCard, type FormRow } from "@/components/forms/form-card";

type Sort = "newest" | "oldest" | "responses" | "alpha";
type StatusFilter = "all" | "live" | "draft";

export function DashboardContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * `?ws=` is the active workspace, and it is a query parameter rather than
   * session state so switching folders is a client-side push instead of the
   * page reload switching organizations needs. Absent means the organization's
   * first workspace, which is what every link written before workspaces were
   * selectable means.
   *
   * It belongs in the query key as well as the request: two workspaces are two
   * different lists, and sharing a cache entry between them shows the previous
   * folder's forms under the new folder's name until the refetch lands.
   */
  const ws = searchParams.get("ws");
  const formsParams = useMemo(() => (ws ? { ws } : undefined), [ws]);

  /**
   * The workspaces this form could be moved to, for the card menu.
   *
   * Fetched here rather than per card — a grid of thirty cards asking the same
   * question thirty times is thirty requests for one answer.
   */
  const { data: workspaceData } = useGetApiWorkspaces();
  const workspaces = useMemo(
    () =>
      apiData<{ id: string; name: string; slug: string }[]>(workspaceData) ??
      [],
    [workspaceData],
  );
  const currentWorkspaceId = (
    workspaces.find((w) => w.slug === ws) ?? workspaces[0]
  )?.id;

  const moveForm = usePatchApiFormsByIdWorkspace();

  const { data, isLoading } = useGetApiForms(formsParams, {
    query: { queryKey: getGetApiFormsQueryKey(formsParams) },
  });
  // Memoised so it is not a fresh array on every render — the sort below
  // depends on it, and an unstable dependency re-sorts the whole grid whenever
  // anything else in this component changes.
  const allForms = useMemo(() => apiData<FormRow[]>(data) ?? [], [data]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [status, setStatus] = useState<StatusFilter>("all");
  // ?new=1 lets the command palette open the create dialog.
  const [createOpen, setCreateOpen] = useState(searchParams.get("new") === "1");
  const [pendingDelete, setPendingDelete] = useState<FormRow | null>(null);
  /**
   * The ticked forms, by id.
   *
   * Ids rather than indices or rows: the list refetches under the selection
   * (a move, a delete, someone else publishing) and anything positional would
   * quietly re-point at a different form.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [movingBulk, setMovingBulk] = useState(false);

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
   * The selection, intersected with what is actually on screen.
   *
   * Everything downstream reads this rather than the raw id set, so a tick can
   * never act on a row the person cannot see: filter down to Drafts with three
   * live forms ticked and the bar reports what remains visible, not five.
   *
   * Derived rather than pruned in an effect. Pruning would delete those ticks
   * the moment they were filtered out, so returning to All would come back
   * empty; deriving narrows the selection while a filter is applied and hands
   * it back intact when the filter is lifted.
   */
  const selectedForms = useMemo(
    () => forms.filter((f) => selected.has(f.id)),
    [forms, selected],
  );
  const selectedCount = selectedForms.length;

  const toggleSelected = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /**
   * Moves the ticked forms one request at a time.
   *
   * `PATCH /forms/:id/workspace` takes a single form, and there is no bulk
   * endpoint yet. `allSettled` rather than `all` so one refusal — a form
   * someone else deleted, a workspace that has gone — does not abandon the
   * rest half-moved and unreported.
   */
  async function moveSelected(workspaceId: string) {
    const targets = selectedForms;
    if (targets.length === 0) return;
    setMovingBulk(true);
    try {
      const results = await Promise.allSettled(
        targets.map((f) =>
          moveForm.mutateAsync({ id: f.id, data: { workspaceId } }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      // Every workspace's list changed: these forms left one and joined
      // another. `invalidateForms` is prefix-keyed, so it covers both.
      await invalidateForms(queryClient);
      setSelected(new Set());
      const to = workspaces.find((w) => w.id === workspaceId);
      const moved = targets.length - failed;
      if (failed === 0) {
        toast.success(
          `Moved ${moved} form${moved === 1 ? "" : "s"} to ${to?.name ?? "workspace"}`,
        );
      } else if (moved === 0) {
        toast.error("Couldn't move those forms");
      } else {
        toast.warning(`Moved ${moved} of ${targets.length}`, {
          description: `${failed} couldn't be moved.`,
        });
      }
    } finally {
      setMovingBulk(false);
    }
  }

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
      onError: (e) =>
        toast.error("Couldn't delete", { description: e.message }),
    },
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {/*
        No page title.

        "Forms" sat above a grid of forms, in the one place the product only
        ever shows forms, under a logo that links here. It named what was
        already on screen. What replaced it is the workspace — the only label on
        this page that says something the grid does not, because the grid looks
        identical whichever folder you are in.

        One row, and it is the row: what you are looking at on the left, how you
        narrow it and what you make in the middle and right.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <WorkspaceSwitcher />

        {allForms.length > 0 && (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search forms…"
              className="h-9 rounded-full pl-8"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/*
            The bulk bar takes the filters' place rather than sitting above
            them.

            It occupies the same row at the same height, so ticking a card
            swaps the controls out without moving the grid underneath — and
            what it replaces is exactly what you do not want mid-selection,
            since re-filtering is what drops rows out from under a tick.
          */}
          {selectedCount > 0 ? (
            <>
              <span className="text-muted-foreground text-sm tabular-nums">
                {selectedCount} selected
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button shape="pill" variant="outline" disabled={movingBulk}>
                    <FolderInput className="size-4" />
                    Move to
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                    Move to workspace
                  </DropdownMenuLabel>
                  {workspaces.map((w) => (
                    <DropdownMenuItem
                      key={w.id}
                      disabled={w.id === currentWorkspaceId}
                      onSelect={() => void moveSelected(w.id)}
                    >
                      <span className="min-w-0 flex-1 truncate">{w.name}</span>
                      {w.id === currentWorkspaceId && (
                        <span className="text-muted-foreground shrink-0 text-xs">
                          Here
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Clear selection"
                onClick={() => setSelected(new Set())}
              >
                <X className="size-4" />
              </Button>
            </>
          ) : (
            <>
              {allForms.length > 0 && (
                <>
                  {/* Counts dropped from the labels. Three chips reading
                  "All 12 / Live 3 / Drafts 9" is six numbers to hold in your
                  head to choose between three buttons. */}
                  <FilterChips
                    ariaLabel="Status"
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: "all", label: "All" },
                      { value: "live", label: "Live" },
                      { value: "draft", label: "Drafts" },
                    ]}
                    className="hidden pb-0 sm:flex"
                  />

                  <Select
                    value={sort}
                    onValueChange={(v) => setSort(v as Sort)}
                  >
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
                </>
              )}

              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      shape="pill"
                      onClick={() => setCreateOpen(true)}
                      data-tour="new-form"
                    >
                      <Plus className="size-4" />
                      New form
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <TooltipHint label="New form" keys="N" />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>

      {/* Only renders past 80% of the AI cap, and only for someone with forms — the rule is
          never to sell before there is data. */}
      {allForms.length > 0 && (
        <div className="mt-6">
          <AiCapBanner />
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className={GRID}>
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
                <Button
                  shape="pill"
                  variant="outline"
                  onClick={() => router.push("/templates")}
                >
                  Browse templates
                </Button>
              </div>
            }
          />
        ) : forms.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title={
              query ? `Nothing matches “${query}”` : "Nothing with that status"
            }
            description={
              query
                ? "Try a different search."
                : "Switch back to All to see the rest."
            }
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
          <ul className={GRID} data-tour="form-grid">
            {forms.map((form) => (
              <li key={form.id}>
                <FormCard
                  form={form}
                  selected={selected.has(form.id)}
                  onSelectedChange={
                    workspaces.length > 1
                      ? (on) => toggleSelected(form.id, on)
                      : undefined
                  }
                  anySelected={selectedCount > 0}
                  onDelete={() => setPendingDelete(form)}
                  workspaces={workspaces}
                  currentWorkspaceId={currentWorkspaceId}
                  onMove={(workspaceId) => {
                    void (async () => {
                      try {
                        await moveForm.mutateAsync({
                          id: form.id,
                          data: { workspaceId },
                        });
                        // Both lists change: the form leaves this one and joins
                        // the other. `invalidateForms` is prefix-keyed, so it
                        // covers every workspace's cached list at once.
                        await invalidateForms(queryClient);
                        const to = workspaces.find((w) => w.id === workspaceId);
                        toast.success(`Moved to ${to?.name ?? "workspace"}`);
                      } catch {
                        toast.error("Couldn't move the form");
                      }
                    })();
                  }}
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

/**
 * Two up, three at the very widest. The old grid reached three columns at
 * `lg`, which left every card too narrow to carry a description — so it
 * didn't have one.
 */
const GRID = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";
