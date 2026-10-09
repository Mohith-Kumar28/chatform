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
  getGetApiArchiveFormsQueryKey,
  getGetApiFormsQueryKey,
  useDeleteApiFormsById,
  useGetApiArchiveForms,
  usePostApiArchiveFormsByIdRestore,
  usePostApiFormsByIdUnpublish,
  usePostApiFormsByIdPublish,
  useGetApiForms,
  useGetApiWorkspaces,
  usePatchApiFormsByIdWorkspace,
} from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { ApiError } from "@/lib/api/mutator";
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
import { ALL_WORKSPACES, WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { NoWorkspaceState } from "@/components/dashboard/no-workspace-state";
import { OverviewTiles } from "@/components/dashboard/overview-tiles";
import { ExpandingSearch } from "@/components/dashboard/expanding-search";
import { FormCard, FormCardSkeleton, type FormRow } from "@/components/forms/form-card";
import { useDuplicateForm } from "@/components/forms/use-duplicate-form";
import { ArchiveView, type ArchivedFormRow } from "@/components/forms/archive-view";

type Sort = "newest" | "oldest" | "responses" | "alpha";
type StatusFilter = "all" | "live" | "draft" | "archive";

/**
 * The last workspace, status and sort, remembered per browser.
 *
 * Read once, synchronously, in the first render's state, so the forms request
 * that goes out is already the right one. Loading defaults, fetching, then
 * correcting from storage would be two requests and a visible swap. Nothing
 * that renders on the server depends on it (the grid is a shimmer until the
 * forms arrive), so the server's empty read cannot cause a hydration mismatch.
 */
const PREFS_KEY = "chatform:dashboard";
type Prefs = { ws?: string; status?: StatusFilter; sort?: Sort };
const SORTS: Sort[] = ["newest", "oldest", "responses", "alpha"];
const STATUSES: StatusFilter[] = ["all", "live", "draft"];

function readPrefs(): Prefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs;
    return {
      ws: typeof raw.ws === "string" && raw.ws ? raw.ws : undefined,
      status: STATUSES.includes(raw.status as StatusFilter) ? raw.status : undefined,
      sort: SORTS.includes(raw.sort as Sort) ? raw.sort : undefined,
    };
  } catch {
    return {};
  }
}

function writePrefs(patch: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // Private mode or blocked storage: the dashboard just starts from defaults.
  }
}

export function DashboardContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * `?ws=` is the active workspace, and it is a query parameter rather than
   * session state so switching folders is a client-side push instead of the
   * page reload switching organizations needs.
   *
   * It belongs in the query key as well as the request: two workspaces are two
   * different lists, and sharing a cache entry between them shows the previous
   * folder's forms under the new folder's name until the refetch lands.
   */
  const [stored] = useState(readPrefs);
  // The URL wins, so a shared link opens what it names; then the last one
  // viewed here; then every workspace.
  const urlWs = searchParams.get("ws");
  const ws = urlWs ?? stored.ws ?? ALL_WORKSPACES;
  // The browser's offset from UTC, so "today" on the cards and the tiles is the reader's today.
  const [tz] = useState(() => -new Date().getTimezoneOffset());
  const formsParams = useMemo(() => ({ ws, tz }), [ws, tz]);

  /**
   * The workspaces this form could be moved to, for the card menu.
   *
   * Fetched here rather than per card — a grid of thirty cards asking the same
   * question thirty times is thirty requests for one answer.
   */
  const { data: workspaceData } = useGetApiWorkspaces();
  const workspaces = useMemo(
    () =>
      apiData<
        { id: string; name: string; slug: string; permissions?: Record<string, string[]> }[]
      >(workspaceData) ?? [],
    [workspaceData],
  );
  // Every workspace at once. Each card then answers for its own folder, and a
  // new form asks which one it goes in.
  const showingAll = ws === ALL_WORKSPACES && workspaces.length > 1;
  const currentWorkspace = showingAll ? undefined : (workspaces.find((w) => w.slug === ws) ?? workspaces[0]);
  const currentWorkspaceId = currentWorkspace?.id;
  const workspaceById = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces]);
  /*
    What the caller's role in a workspace lets them do. Optimistic until the
    list arrives, the same rule `allows` follows, so an editor's grid does not
    flash read-only on every load. The server refuses regardless.
  */
  const canEditIn = (w: (typeof workspaces)[number] | undefined) =>
    !w || (w.permissions?.form ?? []).includes("update");
  const canEditHere = showingAll
    ? workspaces.some((w) => (w.permissions?.form ?? []).includes("create"))
    : canEditIn(currentWorkspace);
  // Only workspaces this person may put forms into are places to move one.
  const moveTargets = useMemo(
    () => workspaces.filter((w) => (w.permissions?.form ?? []).includes("create")),
    [workspaces],
  );
  const noWorkspace = workspaceData !== undefined && workspaces.length === 0;

  const moveForm = usePatchApiFormsByIdWorkspace();

  const { data, isPending, error, refetch } = useGetApiForms(formsParams, {
    query: { queryKey: getGetApiFormsQueryKey(formsParams) },
  });
  /*
    A remembered workspace that has since been deleted, or belongs to the
    organization you were in last time, is a 404. Fall back to every workspace
    rather than an error.
  */
  useEffect(() => {
    if (ws === ALL_WORKSPACES || !(error instanceof ApiError) || error.status !== 404) return;
    const query = new URLSearchParams(window.location.search);
    query.set("ws", ALL_WORKSPACES);
    router.replace(`${window.location.pathname}?${query}`);
  }, [error, ws, router]);
  const redirecting =
    ws !== ALL_WORKSPACES && error instanceof ApiError && error.status === 404;
  // Memoised so it is not a fresh array on every render — the sort below
  // depends on it, and an unstable dependency re-sorts the whole grid whenever
  // anything else in this component changes.
  const allForms = useMemo(() => apiData<FormRow[]>(data) ?? [], [data]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(stored.sort ?? "newest");
  // `?view=archive` is where the purge warning email lands; `&form=` opens that form.
  const [status, setStatus] = useState<StatusFilter>(
    searchParams.get("view") === "archive" ? "archive" : (stored.status ?? "all"),
  );
  const [openArchived, setOpenArchived] = useState<string | null>(searchParams.get("form"));

  // The Archive is somewhere you visit, not a filter to come back to.
  useEffect(() => writePrefs({ ws, sort, ...(status === "archive" ? {} : { status }) }), [ws, sort, status]);

  const { data: archiveData } = useGetApiArchiveForms(formsParams, {
    query: { queryKey: getGetApiArchiveFormsQueryKey(formsParams) },
  });
  const archived = useMemo(() => apiData<ArchivedFormRow[]>(archiveData) ?? [], [archiveData]);
  /*
    The Archive pill exists only while there is something in it. Restoring or
    deleting the last archived form while looking at it drops back to All
    rather than leaving an empty tab behind its own pill.
  */
  const archiveEmpty = archiveData !== undefined && archived.length === 0;
  const activeStatus: StatusFilter = status === "archive" && archiveEmpty ? "all" : status;
  const showArchive = activeStatus === "archive";

  /*
    Put the remembered workspace into the URL, so everything else that reads
    `?ws=` (new form, invite) agrees with the grid. `history.replaceState`
    rather than the router: the value is unchanged, so the query key is too,
    and no second request goes out.
  */
  useEffect(() => {
    if (urlWs) return;
    const query = new URLSearchParams(window.location.search);
    query.set("ws", ws);
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [urlWs, ws]);
  // ?new=1 lets the command palette open the create dialog.
  const [createOpen, setCreateOpen] = useState(searchParams.get("new") === "1");
  // The workspace chosen for a new form started from the all-workspaces view.
  const [pickedWs, setPickedWs] = useState("");
  const targetWs = pickedWs || moveTargets[0]?.slug || "";
  /*
    Both delete dialogs read this one piece of state, and which of the two
    opens is decided by the form's own status rather than by a second flag: a
    live form gets the warning, a draft gets the confirm. One state means the
    menu item never has to know which it is about to open, and a form that goes
    live in another tab cannot leave the wrong dialog on screen.
  */
  const [pendingDelete, setPendingDelete] = useState<FormRow | null>(null);
  const deleteBlocked = pendingDelete?.status === "published";
  /*
    Confirmed like a delete, and worded so the two cannot be confused. Taking a
    form offline is reversible and deleting it is not, but both stop the link
    working, so the dialog's job is to say which of the two is about to happen.
  */
  const [pendingOffline, setPendingOffline] = useState<FormRow | null>(null);
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
    // A viewer cannot create here, so the shortcut does nothing rather than
    // opening a dialog whose submit is refused.
    const open = () => {
      if (canEditHere) setCreateOpen(true);
    };
    window.addEventListener(NEW_FORM_EVENT, open);
    return () => window.removeEventListener(NEW_FORM_EVENT, open);
  }, [canEditHere]);

  const duplicate = useDuplicateForm();

  const restore = usePostApiArchiveFormsByIdRestore<Error>({
    mutation: {
      onSuccess: () => {
        void invalidateForms(queryClient);
        toast.success("Form restored");
      },
      onError: (e) => toast.error("Couldn't restore it", { description: e.message }),
    },
  });

  const remove = useDeleteApiFormsById<Error>({
    mutation: {
      onSuccess: (_data, { id }) => {
        void invalidateForms(queryClient);
        toast.success("Moved to Archive", {
          action: { label: "Undo", onClick: () => restore.mutate({ id }) },
        });
      },
      onError: (e) =>
        toast.error("Couldn't delete", { description: e.message }),
    },
  });

  /*
   * Publishing from the grid, for the one case the grid can be sure about.
   *
   * The card only offers this on a form that is already live and has drifted,
   * which is what makes it safe to do without opening the builder: the
   * document has been published before, so it linted then, and what is being
   * sent is edits to a form whose shape somebody already approved.
   *
   * The refusals are still real, though, and both are worth their own message
   * rather than "Couldn't publish". A 422 is a lint error — something in the
   * draft is broken and only the builder can show you where. A 402 is a plan
   * limit. Either way the answer is "open it", so the toast says so instead of
   * leaving somebody pressing a menu item that keeps failing.
   */
  const publish = usePostApiFormsByIdPublish<Error>({
    mutation: {
      onSuccess: () => {
        void invalidateForms(queryClient);
        toast.success("Changes published", {
          description: "Respondents now see the version you last edited.",
        });
      },
      onError: (e) =>
        toast.error("Couldn't publish", {
          description: `${e.message} — open the form to fix it.`,
        }),
    },
  });

  const unpublish = usePostApiFormsByIdUnpublish<Error>({
    mutation: {
      onSuccess: () => {
        void invalidateForms(queryClient);
        toast.success("Form unpublished", {
          description: "The link no longer works. Publish again to put it back.",
        });
      },
      onError: (e) => toast.error("Couldn't unpublish it", { description: e.message }),
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
        <WorkspaceSwitcher value={ws} />

        {allForms.length > 0 && !showArchive && (
          <ExpandingSearch value={query} onChange={setQuery} />
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
                  {moveTargets.map((w) => (
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
              {(allForms.length > 0 || archived.length > 0 || showArchive) && (
                <>
                  {/* Counts dropped from the labels. Three chips reading
                  "All 12 / Live 3 / Drafts 9" is six numbers to hold in your
                  head to choose between three buttons. */}
                  <FilterChips
                    ariaLabel="Status"
                    value={activeStatus}
                    onChange={setStatus}
                    options={[
                      { value: "all", label: "All" },
                      { value: "live", label: "Live" },
                      { value: "draft", label: "Drafts" },
                      ...(archived.length > 0
                        ? [{ value: "archive" as const, label: "Archive" }]
                        : []),
                    ]}
                    className="pb-0"
                  />

                  {!showArchive && (
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
                  )}
                </>
              )}

              {canEditHere && !noWorkspace && (
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
              )}
            </>
          )}
        </div>
      </div>

      {/* Every form here, added up. Not on an empty workspace, where every tile
          would be zero, and not over the Archive, which it does not count. */}
      {allForms.length > 0 && !showArchive && (
        <div className="mt-6">
          <OverviewTiles ws={ws} tz={tz} />
        </div>
      )}

      {/* Only renders past 80% of the AI cap, and only for someone with forms — the rule is
          never to sell before there is data. */}
      {allForms.length > 0 && (
        <div className="mt-6">
          <AiCapBanner />
        </div>
      )}

      <div className="mt-6">
        {/*
          `isPending`, not `isLoading`. While the saved cache is read back from
          disk a query has no data and is not fetching yet, so `isLoading` is
          false and the grid fell through to "No forms yet" for a second before
          the real list arrived. Pending means "no answer yet", whatever the
          reason. A remembered workspace that 404s is about to be swapped for
          every workspace, so it stays a skeleton too instead of flashing an
          error.
        */}
        {isPending || redirecting ? (
          <div className={GRID} role="status" aria-label="Loading forms">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <FormCardSkeleton key={i} />
            ))}
          </div>
        ) : noWorkspace ? (
          <NoWorkspaceState />
        ) : showArchive ? (
          <ArchiveView
            forms={archived}
            workspaceName={showingAll ? (id) => workspaceById.get(id)?.name : undefined}
            canEdit={(id) =>
              showingAll
                ? (workspaceById.get(id)?.permissions?.form ?? []).includes("delete")
                : (currentWorkspace?.permissions?.form ?? ["delete"]).includes("delete")
            }
            openId={openArchived}
            onOpenChange={setOpenArchived}
          />
        ) : error && allForms.length === 0 ? (
          // A failed request is not an empty workspace; saying "No forms yet"
          // to someone with forms is the worst answer available.
          <EmptyState
            icon={MessageSquarePlus}
            title="Couldn't load your forms"
            description="Something went wrong on our side. Try again in a moment."
            action={
              <Button shape="pill" variant="outline" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : allForms.length === 0 && !canEditHere ? (
          <EmptyState
            icon={MessageSquarePlus}
            title="No forms here yet"
            description="You can view this workspace. Forms appear here once an editor creates them."
          />
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
                  onClick={() => router.push("/form-templates")}
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
            {forms.map((form) => {
              const home = workspaceById.get(form.workspaceId ?? "");
              const canEdit = showingAll ? canEditIn(home) : canEditHere;
              return (
              <li key={form.id}>
                <FormCard
                  form={form}
                  workspaceName={showingAll ? home?.name : undefined}
                  selected={selected.has(form.id)}
                  onSelectedChange={
                    canEdit && moveTargets.length > 1
                      ? (on) => toggleSelected(form.id, on)
                      : undefined
                  }
                  anySelected={selectedCount > 0}
                  readOnly={!canEdit}
                  onDelete={canEdit ? () => setPendingDelete(form) : undefined}
                  onDuplicate={canEdit ? () => void duplicate(form) : undefined}
                  onUnpublish={
                    canEdit && form.status === "published" ? () => setPendingOffline(form) : undefined
                  }
                  onPublish={canEdit ? () => publish.mutate({ id: form.id }) : undefined}
                  workspaces={canEdit ? moveTargets : []}
                  currentWorkspaceId={form.workspaceId ?? currentWorkspaceId}
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
              );
            })}
          </ul>
        )}
      </div>

      {/*
        "All workspaces" is a view, not a folder, so a new form from here asks
        where it goes first. Picking one switches the dashboard to it, and the
        ordinary dialog opens there.
      */}
      <Dialog
        open={createOpen && showingAll}
        onOpenChange={(open) => !open && setCreateOpen(false)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Which workspace?</DialogTitle>
          </DialogHeader>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (targetWs) router.push(`/dashboard?ws=${encodeURIComponent(targetWs)}`);
            }}
          >
            <Select value={targetWs} onValueChange={setPickedWs}>
              <SelectTrigger aria-label="Workspace" className="h-9 min-w-0 flex-1">
                <SelectValue placeholder="Choose a workspace" />
              </SelectTrigger>
              <SelectContent>
                {moveTargets.map((w) => (
                  <SelectItem key={w.id} value={w.slug}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" shape="pill" disabled={!targetWs}>
              Continue
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <CreateFormDialog
        open={createOpen && !showingAll}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open && searchParams.get("new")) router.replace(`/dashboard?ws=${encodeURIComponent(ws)}`);
        }}
      />

      {/*
        A live form cannot be deleted from here. Unpublish hands over to its
        own confirmation rather than acting, so it is still two decisions:
        unpublishing here, and coming back to delete afterwards.
      */}
      <Dialog
        open={deleteBlocked}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              “{pendingDelete?.title}” is live
            </DialogTitle>
            <DialogDescription>
              A published form can’t be deleted. Unpublish it first, then
              delete it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Got it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setPendingOffline(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Unpublish form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No typed name: deleting moves the form to the Archive, and the toast can undo it. */}
      <ConfirmDialog
        open={pendingDelete !== null && !deleteBlocked}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete “${pendingDelete?.title}”?`}
        description="It moves to the Archive and the link stops working. You can restore it for 30 days, then it's deleted for good with all its responses."
        confirmLabel="Delete form"
        confirmText={pendingDelete?.title.trim() || "delete"}
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

      <ConfirmDialog
        open={pendingOffline !== null}
        onOpenChange={(open) => !open && setPendingOffline(null)}
        title={`Unpublish “${pendingOffline?.title}”?`}
        description="From now on nobody can submit this form until you publish it again. The link stops working and nobody new can start a response. Nothing is deleted: your responses stay, and anyone part-way through right now can still finish."
        confirmLabel="Unpublish"
        onConfirm={() => {
          if (pendingOffline) unpublish.mutate({ id: pendingOffline.id });
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
