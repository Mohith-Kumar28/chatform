"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, GitMerge, Pencil } from "lucide-react";
import { feedbackTopicLabel } from "@repo/form-schema";
import {
  getGetApiAdminFeedbackIssuesByIdQueryKey,
  patchApiAdminFeedbackIssuesById,
  postApiAdminFeedbackIssuesByIdMerge,
  useGetApiAdminFeedbackIssues,
  useGetApiAdminFeedbackIssuesById,
} from "@/lib/api/admin/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiData } from "@/lib/api/payload";
import { relativeTime } from "@/components/forms/form-card";
import { cn } from "@/lib/utils";
import { faceFor } from "./feedback-faces";
import { ResolveButton, StatusLabel } from "./feedback-status";

/**
 * Reports grouped into the problems they describe — the inbox's default view.
 *
 * The same table as the reports view, one row per issue: what it is, how many
 * reports and people and forms it touches, when it was last seen, and whether it
 * is dealt with. Every number is derived from the reports on the server, so a
 * merge or a move changes it the moment it happens.
 *
 * Opening an issue does not open a dialog. It narrows the reports view to that
 * issue, under a header that renames, resolves and merges it — so the report
 * dialog's ← → keep walking a list, and no dialog ever opens on top of another.
 */

export interface IssueRow {
  id: string;
  title: string;
  topic: string | null;
  reports: number;
  people: number;
  forms: number;
  lastSeenAt: number;
  status: "new" | "resolved";
  reopened: boolean;
  worstRating: number;
}

interface IssuesBody {
  issues: IssueRow[];
  total: number;
  counts: { new: number; resolved: number };
}

const PAGE = 50;

export function useIssues(params: {
  status: "new" | "resolved" | "all";
  rating?: number;
  topic?: string;
  sort: "recent" | "reports";
  offset: number;
  enabled: boolean;
}) {
  const { data, isPending, isFetching, refetch } = useGetApiAdminFeedbackIssues(
    {
      status: params.status,
      sort: params.sort,
      limit: PAGE,
      offset: params.offset,
      ...(params.rating ? { rating: params.rating } : {}),
      ...(params.topic ? { topic: params.topic } : {}),
    },
    { query: { enabled: params.enabled } as never },
  );
  const body = apiData<IssuesBody>(data);
  return {
    issues: body?.issues ?? [],
    total: body?.total ?? 0,
    counts: body?.counts ?? { new: 0, resolved: 0 },
    isPending,
    isFetching,
    refetch,
  };
}

/** Reopened, said in words beside the status — never a separate unlabelled marker. */
function IssueStatus({ issue }: { issue: Pick<IssueRow, "status" | "reopened"> }) {
  return (
    <span className="inline-flex items-center gap-2">
      <StatusLabel status={issue.status} />
      {issue.reopened && <span className="text-xs font-medium text-[var(--warning-soft-foreground)]">Reopened</span>}
    </span>
  );
}

export function IssuesTable({
  issues,
  total,
  offset,
  isPending,
  isFetching,
  emptyText,
  onOpen,
  onOffset,
}: {
  issues: IssueRow[];
  total: number;
  offset: number;
  isPending: boolean;
  isFetching: boolean;
  emptyText: string;
  onOpen: (issueId: string) => void;
  onOffset: (offset: number) => void;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);
  return (
    <>
      <div className="bg-card overflow-hidden rounded-xl border">
        {isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : issues.length === 0 ? (
          <p className="text-muted-foreground px-4 py-12 text-center text-sm">{emptyText}</p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="px-4 py-2.5 font-medium">Issue</th>
                <th className="w-20 px-3 py-2.5 text-right font-medium">Reports</th>
                <th className="hidden w-20 px-3 py-2.5 text-right font-medium md:table-cell">People</th>
                <th className="hidden w-20 px-3 py-2.5 text-right font-medium lg:table-cell">Forms</th>
                <th className="w-44 px-3 py-2.5 font-medium">Status</th>
                <th className="w-24 px-4 py-2.5 text-right font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => {
                const face = faceFor(issue.worstRating);
                return (
                  <tr
                    key={issue.id}
                    tabIndex={0}
                    onClick={() => onOpen(issue.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen(issue.id);
                      }
                    }}
                    className="hover:bg-muted/50 focus-visible:bg-muted/50 cursor-pointer border-b outline-none last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {/* The most upset person it touched — a quick sense of how badly it hurts. */}
                        <face.Icon className="size-4 shrink-0" style={{ color: face.color }} aria-label={`Worst rating: ${face.label}`} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{issue.title}</span>
                          {issue.topic && <span className="text-muted-foreground block truncate text-xs">{feedbackTopicLabel(issue.topic)}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="tabular px-3 py-3 text-right">{issue.reports}</td>
                    <td className="tabular text-muted-foreground hidden px-3 py-3 text-right md:table-cell">{issue.people}</td>
                    <td className="tabular text-muted-foreground hidden px-3 py-3 text-right lg:table-cell">{issue.forms}</td>
                    <td className="px-3 py-3">
                      <IssueStatus issue={issue} />
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-right whitespace-nowrap" title={new Date(issue.lastSeenAt).toLocaleString()}>
                      {relativeTime(issue.lastSeenAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {total > 0 && (
        <div className="flex items-center justify-end gap-2">
          <span className={cn("text-muted-foreground text-caption tabular", isFetching && "opacity-60")}>
            {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
          </span>
          {total > PAGE && (
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" shape="pill" aria-label="Previous page" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - PAGE))}>
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" shape="pill" aria-label="Next page" disabled={offset + PAGE >= total} onClick={() => onOffset(offset + PAGE)}>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * One issue, above its reports: rename it, resolve it, or merge it into another.
 *
 * The title edits in place — click it, type, Enter — because renaming a
 * machine-written title is the most common thing done to an issue and should
 * not cost a dialog.
 */
export function IssueHeader({
  issueId,
  onBack,
  onChanged,
  onMerged,
}: {
  issueId: string;
  onBack: () => void;
  onChanged: () => void;
  onMerged: (intoId: string) => void;
}) {
  const { data, isPending, refetch } = useGetApiAdminFeedbackIssuesById(issueId, {
    query: { queryKey: getGetApiAdminFeedbackIssuesByIdQueryKey(issueId), retry: false },
  });
  const issue = apiData<IssueRow | null>(data);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // The other open issues this one could be merged into, most recent first.
  const others = useIssues({ status: "new", sort: "recent", offset: 0, enabled: true });

  const save = async (body: { status?: "new" | "resolved"; title?: string }, done: string) => {
    setSaving(true);
    try {
      await patchApiAdminFeedbackIssuesById(issueId, body);
      toast.success(done);
      await refetch();
      onChanged();
    } catch {
      toast.error("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const merge = async (intoId: string, intoTitle: string) => {
    setSaving(true);
    try {
      await postApiAdminFeedbackIssuesByIdMerge(issueId, { into: intoId });
      toast.success(`Merged into "${intoTitle}"`);
      onMerged(intoId);
    } catch {
      toast.error("Those two could not be merged.");
    } finally {
      setSaving(false);
    }
  };

  if (isPending) return <Skeleton className="h-16 rounded-xl" />;
  if (!issue) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" shape="pill" onClick={onBack}>
          <ArrowLeft className="size-3.5" /> All issues
        </Button>
        <span className="text-muted-foreground">That issue is gone.</span>
      </div>
    );
  }

  const mergeTargets = others.issues.filter((i) => i.id !== issue.id).slice(0, 12);

  return (
    <div className="bg-card space-y-2 rounded-xl border px-4 py-3">
      <Button variant="ghost" size="sm" shape="pill" className="-ml-2 h-7" onClick={onBack}>
        <ArrowLeft className="size-3.5" /> All issues
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const title = draft.trim();
                setEditing(false);
                if (title && title !== issue.title) void save({ title }, "Renamed");
              }}
            >
              <Input
                autoFocus
                value={draft}
                maxLength={120}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
                className="text-h3 h-9"
                aria-label="Issue title"
              />
            </form>
          ) : (
            <button
              type="button"
              className="group flex max-w-full items-center gap-2 text-left"
              onClick={() => {
                setDraft(issue.title);
                setEditing(true);
              }}
              title="Rename"
            >
              <h3 className="text-h3 truncate">{issue.title}</h3>
              <Pencil className="text-muted-foreground size-3.5 shrink-0 opacity-0 group-hover:opacity-100" aria-hidden />
            </button>
          )}
          <p className="text-muted-foreground text-caption mt-0.5">
            {issue.reports} {issue.reports === 1 ? "report" : "reports"} · {issue.people} {issue.people === 1 ? "person" : "people"} ·{" "}
            {issue.forms} {issue.forms === 1 ? "form" : "forms"} · last seen {relativeTime(issue.lastSeenAt)}
            {issue.topic && ` · ${feedbackTopicLabel(issue.topic)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {issue.reopened && <span className="text-xs font-medium text-[var(--warning-soft-foreground)]">Reopened</span>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" shape="pill" disabled={saving || mergeTargets.length === 0}>
                <GitMerge className="size-3.5" /> Merge into…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-muted-foreground text-micro font-medium tracking-wide uppercase">
                Same bug as
              </DropdownMenuLabel>
              {mergeTargets.map((target) => (
                <DropdownMenuItem key={target.id} onSelect={() => void merge(target.id, target.title)} className="justify-between gap-3">
                  <span className="truncate">{target.title}</span>
                  <span className="text-muted-foreground tabular text-xs">{target.reports}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <ResolveButton
            status={issue.status}
            disabled={saving}
            onChange={(status) =>
              void save({ status }, status === "resolved" ? `Resolved — ${issue.reports} ${issue.reports === 1 ? "report" : "reports"}` : "Reopened")
            }
          />
        </div>
      </div>
    </div>
  );
}
