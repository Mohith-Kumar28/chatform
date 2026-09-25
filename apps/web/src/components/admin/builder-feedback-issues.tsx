"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bug, GitMerge, Layers, Lightbulb, MessageSquare, Pencil, type LucideIcon } from "lucide-react";
import { builderAreaLabel, BUILDER_FEEDBACK_KINDS, type BuilderFeedbackKind } from "@repo/form-schema";
import {
  patchApiAdminFeedbackBuilderIssuesById,
  postApiAdminFeedbackBuilderIssuesByIdMerge,
  postApiAdminFeedbackBuilderIssuesRebuild,
  useGetApiAdminFeedbackBuilderIssues,
  useGetApiAdminFeedbackBuilderIssuesById,
} from "@/lib/api/admin/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiData } from "@/lib/api/payload";
import { relativeTime } from "@/components/forms/form-card";
import { FEEDBACK_PAGE, FeedbackPager, useFeedbackPages } from "./feedback-pager";
import { ResolveButton, StatusLabel } from "./feedback-status";

/**
 * Builders' reports grouped into the work they describe: one bug, or one thing
 * being asked for.
 *
 * The respondent issues table's shape, with the numbers that matter for a
 * customer's request instead of a respondent's bug: how many accounts asked and
 * how many of those pay. Opening an issue narrows the reports view to it, under
 * a header that renames, resolves and merges it.
 */

/** The kind's icon, as a component so a render never creates one. */
export function KindIcon({ kind, ...props }: { kind: string } & React.ComponentProps<LucideIcon>) {
  if (kind === "bug") return <Bug {...props} />;
  if (kind === "feature") return <Lightbulb {...props} />;
  return <MessageSquare {...props} />;
}

export function kindLabel(kind: string): string {
  return BUILDER_FEEDBACK_KINDS[kind as BuilderFeedbackKind] ?? kind;
}

export interface BuilderIssueRow {
  id: string;
  title: string;
  kind: string;
  area: string | null;
  reports: number;
  people: number;
  accounts: number;
  paid: number;
  lastSeenAt: number;
  status: "new" | "resolved";
  reopened: boolean;
}

interface IssuesBody {
  issues: BuilderIssueRow[];
  total: number;
  counts: { new: number; resolved: number };
  ungrouped: number;
}

export function useBuilderIssues(params: {
  status: "new" | "resolved" | "all";
  kind?: BuilderFeedbackKind;
  sort: "priority" | "recent" | "reports";
  offset: number;
  limit?: number;
  enabled: boolean;
}) {
  const { data, isPending, isFetching } = useGetApiAdminFeedbackBuilderIssues(
    {
      status: params.status,
      sort: params.sort,
      limit: params.limit ?? FEEDBACK_PAGE,
      offset: params.offset,
      ...(params.kind ? { kind: params.kind } : {}),
    },
    { query: { enabled: params.enabled } as never },
  );
  const body = apiData<IssuesBody>(data);
  return {
    issues: body?.issues ?? [],
    total: body?.total ?? 0,
    counts: body?.counts ?? { new: 0, resolved: 0 },
    ungrouped: body?.ungrouped ?? 0,
    isPending,
    isFetching,
  };
}

/** "7 reports · 5 accounts · 3 paid", the line every issue is read by. */
export function issueReach(issue: Pick<BuilderIssueRow, "reports" | "accounts" | "paid">): string {
  return [
    `${issue.reports} ${issue.reports === 1 ? "report" : "reports"}`,
    `${issue.accounts} ${issue.accounts === 1 ? "account" : "accounts"}`,
    `${issue.paid} paid`,
  ].join(" · ");
}

function IssueStatus({ issue }: { issue: Pick<BuilderIssueRow, "status" | "reopened"> }) {
  return (
    <span className="inline-flex items-center gap-2">
      <StatusLabel status={issue.status} />
      {issue.reopened && <span className="text-xs font-medium text-[var(--warning-soft-foreground)]">Reopened</span>}
    </span>
  );
}

export function BuilderIssuesTable({
  issues,
  total,
  offset,
  isPending,
  isFetching,
  emptyText,
  onOpen,
  onOffset,
}: {
  issues: BuilderIssueRow[];
  total: number;
  offset: number;
  isPending: boolean;
  isFetching: boolean;
  emptyText: string;
  onOpen: (issueId: string) => void;
  onOffset: (offset: number) => void;
}) {
  const pages = useFeedbackPages({ total, offset, onOffset });
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
                <th className="hidden w-20 px-3 py-2.5 text-right font-medium md:table-cell">Accounts</th>
                <th className="hidden w-20 px-3 py-2.5 text-right font-medium lg:table-cell">Paid</th>
                <th className="w-44 px-3 py-2.5 font-medium">Status</th>
                <th className="w-24 px-4 py-2.5 text-right font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => {
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
                        <KindIcon kind={issue.kind} className="text-muted-foreground size-4 shrink-0" aria-label={kindLabel(issue.kind)} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{issue.title}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {kindLabel(issue.kind)}
                            {issue.area && ` · ${builderAreaLabel(issue.area)}`}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="tabular px-3 py-3 text-right">{issue.reports}</td>
                    <td className="tabular text-muted-foreground hidden px-3 py-3 text-right md:table-cell">{issue.accounts}</td>
                    <td className="tabular text-muted-foreground hidden px-3 py-3 text-right lg:table-cell">{issue.paid}</td>
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
      <FeedbackPager pages={pages} total={total} offset={offset} isFetching={isFetching} />
    </>
  );
}

/**
 * Reports in no issue yet, and the button that groups them. The respondent tab's
 * notice, pointed at the builder pool: it rebuilds only builder issues.
 */
export function BuilderUngroupedNotice({ count, onDone }: { count: number; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [grouping, setGrouping] = useState(false);

  const active = grouping && count > 0;
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > 5 * 60_000) clearInterval(id);
      else onDone();
    }, 4000);
    return () => clearInterval(id);
  }, [active, onDone]);

  if (count === 0) return null;
  if (active) {
    return (
      <div className="bg-muted/40 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm">
        <Layers className="text-muted-foreground size-4 animate-pulse" aria-hidden />
        Grouping reports into issues, {count} still to go.
      </div>
    );
  }
  return (
    <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm">
      <span className="flex items-center gap-2">
        <Layers className="text-muted-foreground size-4" aria-hidden />
        {count} {count === 1 ? "report isn't" : "reports aren't"} grouped into an issue yet.
      </span>
      <Button variant="outline" size="sm" shape="pill" onClick={() => setConfirming(true)}>
        Group them
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Group every builder report into issues?"
        description="Every builder report is matched again from scratch, so titles you renamed and issues you merged here are recomputed too. Respondent issues are not touched. It runs in the background and takes a moment."
        confirmLabel="Group them"
        destructive={false}
        onConfirm={async () => {
          try {
            const res = (await postApiAdminFeedbackBuilderIssuesRebuild()) as unknown as { queued?: number };
            toast.success(`Grouping ${res?.queued ?? count} reports. This takes a moment.`);
            setGrouping(true);
            onDone();
          } catch {
            toast.error("Grouping could not start. Try again.");
          }
        }}
      />
    </div>
  );
}

/**
 * One issue, above its reports: rename, resolve, or merge into another.
 *
 * Read on its own, so a link to any issue opens it, and a merged-away one lands
 * on its survivor. The list is only for the merge menu's candidates.
 */
export function BuilderIssueHeader({
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
  const one = useGetApiAdminFeedbackBuilderIssuesById(issueId);
  const issue = apiData<BuilderIssueRow>(one.data) ?? null;
  const all = useBuilderIssues({ status: "new", sort: "recent", offset: 0, limit: 100, enabled: true });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (body: { status?: "new" | "resolved"; title?: string }, done: string) => {
    setSaving(true);
    try {
      await patchApiAdminFeedbackBuilderIssuesById(issueId, body);
      toast.success(done);
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
      await postApiAdminFeedbackBuilderIssuesByIdMerge(issueId, { into: intoId });
      toast.success(`Merged into "${intoTitle}"`);
      onMerged(intoId);
    } catch {
      toast.error("Those two could not be merged.");
    } finally {
      setSaving(false);
    }
  };

  if (one.isPending) return <Skeleton className="h-16 rounded-xl" />;
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

  // Only open issues of the same kind: a bug is never the same work as a request.
  const mergeTargets = all.issues
    .filter((i) => i.id !== issue.id && i.status === "new" && i.kind === issue.kind)
    .slice(0, 12);

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
            {kindLabel(issue.kind)} · {issueReach(issue)} · {issue.people} {issue.people === 1 ? "person" : "people"} · last
            seen {relativeTime(issue.lastSeenAt)}
            {issue.area && ` · ${builderAreaLabel(issue.area)}`}
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
                Same thing as
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
              void save(
                { status },
                status === "resolved" ? `Resolved, ${issue.reports} ${issue.reports === 1 ? "report" : "reports"}` : "Reopened",
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
