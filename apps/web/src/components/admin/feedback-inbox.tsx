"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, Check, ChevronDown, MessageSquareText, Monitor, Tag, X } from "lucide-react";
import { feedbackTopicLabel } from "@repo/form-schema";
import { getGetApiAdminFeedbackReportsQueryOptions, useGetApiAdminFeedbackReports } from "@/lib/api/admin/admin";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InfoHint } from "@/components/ui/info-hint";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiData } from "@/lib/api/payload";
import { relativeTime } from "@/components/forms/form-card";
import { cn } from "@/lib/utils";
import { FACES, faceFor } from "./feedback-faces";
import { StatusLabel } from "./feedback-status";
import { FeedbackReportDialog, type Detail } from "./feedback-report-dialog";
import { FEEDBACK_PAGE, FeedbackPager, useFeedbackPages } from "./feedback-pager";
import { IssueHeader, IssuesTable, UngroupedNotice, useIssues } from "./feedback-issues-table";

/**
 * The queue of reports.
 *
 * Laid out like the responses table, because it is the same job: a count
 * switcher on the left (Unresolved / Resolved / All, as Completed / Partial is
 * there), rating, topic and sort on the right as one compact group, and a table
 * whose rows open the record. The filters describe the work, not the calendar —
 * the date range above narrows the charts only, since an unresolved report from
 * forty days ago is still unresolved.
 */

export interface InboxReport {
  id: string;
  rating: number;
  message: string | null;
  createdAt: number;
  status: string;
  statusAt: number | null;
  statusBy: string | null;
  internalNote: string | null;
  topic: string | null;
  sentiment: number | null;
  source: string;
  userAgent: string | null;
  sessionId: string | null;
  hasSnapshot: boolean;
  formId: string | null;
  formTitle: string | null;
  formSlug: string | null;
  organizationId: string | null;
  organizationName: string | null;
  respondentId: string | null;
  respondentLabel: string | null;
  issueId: string | null;
  issueTitle: string | null;
}

interface ReportsBody {
  reports: Detail[];
  total: number;
  counts: { new: number; resolved: number };
  ratingCounts: { rating: number; count: number }[];
  topicCounts: { topic: string; count: number }[];
}

type StatusFilter = "new" | "resolved" | "all";
type Sort = "newest" | "oldest" | "worst";

const SORT_LABEL: Record<Sort, string> = { newest: "Newest first", oldest: "Oldest first", worst: "Lowest rating first" };

type IssueSort = "priority" | "recent" | "reports";
const ISSUE_SORT_LABEL: Record<IssueSort, string> = { priority: "Priority", recent: "Recently seen", reports: "Most reports" };


export function FeedbackInbox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  /*
    Issues by default: the problems, not the rows. Reports is the view to fall
    back to, and the one an issue opens into — narrowed by `?issue=`.
  */
  const issue = params.get("issue") ?? undefined;
  const view: "issues" | "reports" = issue || params.get("list") === "reports" ? "reports" : "issues";
  const statusParam = params.get("status");
  // Inside one issue every report shows by default — resolving it must not empty the list you are reading.
  const status: StatusFilter =
    statusParam === "resolved" || statusParam === "all" || statusParam === "new" ? statusParam : issue ? "all" : "new";
  const rating = Number(params.get("rating") ?? 0) || undefined;
  const sortParam = params.get("sort");
  const sort: Sort = sortParam === "oldest" || sortParam === "worst" ? sortParam : "newest";
  const issueSort: IssueSort = sortParam === "reports" || sortParam === "recent" ? sortParam : "priority";
  const formId = params.get("formId") ?? undefined;
  const orgId = params.get("orgId") ?? undefined;
  const topic = params.get("topic") ?? undefined;
  const respondentId = params.get("respondentId") ?? undefined;
  const offset = Number(params.get("offset") ?? 0);

  const setParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // A new filter is a new list; page three of the old one means nothing.
    if (!("offset" in patch)) next.delete("offset");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const pageParams = (at: number) => ({
    status,
    sort,
    limit: FEEDBACK_PAGE,
    offset: at,
    ...(rating ? { rating } : {}),
    ...(formId ? { formId } : {}),
    ...(orgId ? { orgId } : {}),
    ...(topic ? { topic } : {}),
    ...(respondentId ? { respondentId } : {}),
    ...(issue ? { issue } : {}),
  });
  const { data, isPending, isFetching } = useGetApiAdminFeedbackReports(pageParams(offset));
  const body = apiData<ReportsBody>(data);
  /*
    Any change — resolve, rename, move, merge — can move numbers in every list on
    this page: an issue's counts, the reports under it, the status badges, the
    charts. Refreshing only the list that made the change is how the issues
    table kept showing two issues after a move had made three.
  */
  const queryClient = useQueryClient();
  // Stable, so the grouping notice's polling interval is not restarted on every render.
  const refreshAll = useCallback(
    () =>
      void queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/admin/feedback"),
      }),
    [queryClient],
  );
  const issuesQuery = useIssues({ status, rating, topic, sort: issueSort, offset, enabled: view === "issues" });
  const reports = useMemo(() => body?.reports ?? [], [body?.reports]);
  const total = body?.total ?? 0;
  const counts = view === "issues" ? issuesQuery.counts : (body?.counts ?? { new: 0, resolved: 0 });
  const ratingCounts = body?.ratingCounts ?? [];
  const topicCounts = body?.topicCounts ?? [];

  // The open report lives in the URL, so a refresh — or the founders' mail — lands on it.
  const [openId, setOpenId] = useState<string | null>(() => params.get("report"));
  /**
   * The page a step just loaded, held until the URL's offset catches up — so the
   * window reads the report it opened from rows it already has, not the server.
   */
  const [carried, setCarried] = useState<{ offset: number; rows: Detail[] } | null>(null);

  // What the list is narrowed to, each with a way out.
  const first = reports[0];
  const chips = [
    formId && { key: "formId", label: first?.formId === formId ? (first.formTitle ?? "This form") : "One form" },
    orgId && { key: "orgId", label: first?.organizationId === orgId ? (first.organizationName ?? "This account") : "One account" },
    respondentId && { key: "respondentId", label: first?.respondentId === respondentId ? (first.respondentLabel ?? "One respondent") : "One respondent" },
  ].filter(Boolean) as { key: string; label: string }[];

  const pages = useFeedbackPages({ total, offset, onOffset: (next) => setParam({ offset: String(next) }) });

  /** A page of reports, from the cache when it is there — so the report window can walk off the end of this one. */
  const loadPage = async (at: number, fresh = false) =>
    apiData<ReportsBody>(
      await queryClient.fetchQuery({ ...getGetApiAdminFeedbackReportsQueryOptions(pageParams(at)), ...(fresh ? { staleTime: 0 } : {}) }),
    )?.reports ?? [];

  const live =
    carried && carried.rows.some((r) => r.id === openId) && (carried.offset !== offset || !reports.some((r) => r.id === openId))
      ? carried
      : { offset, rows: reports };
  const openIndex = openId ? live.rows.findIndex((r) => r.id === openId) : -1;
  const position = openIndex >= 0 ? live.offset + openIndex : -1;

  /**
   * Open a report, and put it in the URL so a refresh — or the founders' mail —
   * lands on it. A report on another page moves the page in the same URL write;
   * two writes raced, and the second put the old page back.
   */
  const openReport = (id: string | null, page?: { offset: number; rows: Detail[] }) => {
    setOpenId(id);
    if (page) setCarried(page);
    if (page && page.offset !== offset) {
      setParam({ offset: String(page.offset), report: id ?? undefined });
      return;
    }
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("report", id);
    else url.searchParams.delete("report");
    window.history.replaceState(window.history.state, "", url);
  };

  /** ← and → through every report, not just this page: past either end, the neighbouring page opens with it. */
  const stepReport = async (by: -1 | 1) => {
    if (openIndex < 0) return;
    const onPage = live.rows[openIndex + by];
    if (onPage) return openReport(onPage.id);
    const at = live.offset + by * FEEDBACK_PAGE;
    if (at < 0 || at >= total) return;
    const rows = await loadPage(at);
    const target = by === 1 ? rows[0] : rows[rows.length - 1];
    if (target) openReport(target.id, { offset: at, rows });
  };

  /**
   * After a resolve, the next report. Where the list hides resolved reports the
   * resolved one has gone and the next has slid into its place — so read the
   * page again and take the same slot; otherwise it is simply the one after.
   */
  const advance = async (gone: boolean) => {
    if (openIndex < 0) return;
    if (!gone) return stepReport(1);
    const rows = await loadPage(live.offset, true);
    const target = rows[openIndex] ?? rows[rows.length - 1];
    if (target) return openReport(target.id, { offset: live.offset, rows });
    // The page emptied: step back to the one before, if there is one.
    if (live.offset === 0) return openReport(null);
    const before = await loadPage(live.offset - FEEDBACK_PAGE, true);
    const last = before[before.length - 1];
    openReport(last?.id ?? null, { offset: live.offset - FEEDBACK_PAGE, rows: before });
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-h3">Inbox</h2>
          <InfoHint label="About the inbox">
            Every report, whatever the period picked above — that narrows the charts, not this list. Issues group reports that
            describe the same problem; an issue is resolved when every report in it is. Priority ranks issues by how many people
            hit them, how badly they rated them and how recently.
          </InfoHint>
        </div>
        {/* The one view switch: the same reports, grouped or one per row. */}
        <SegmentedControl
          size="sm"
          value={view}
          onChange={(next) =>
            setParam({ list: next === "reports" ? "reports" : undefined, issue: undefined, sort: undefined, report: undefined })
          }
          options={[
            { value: "issues", label: "Issues" },
            { value: "reports", label: "Reports" },
          ]}
          ariaLabel="Group reports into issues or list every report"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          size="sm"
          value={status}
          onChange={(next) => setParam({ status: next === (issue ? "all" : "new") ? undefined : next })}
          options={[
            { value: "new", label: "Unresolved", badge: counts.new },
            { value: "resolved", label: "Resolved", badge: counts.resolved },
            { value: "all", label: "All" },
          ]}
          ariaLabel={view === "issues" ? "Which issues" : "Which reports"}
        />

        <div className="flex flex-wrap items-center gap-2">
          <RatingMenu value={rating} counts={ratingCounts} onChange={(r) => setParam({ rating: r ? String(r) : undefined })} />
          <TopicMenu value={topic} counts={topicCounts} onChange={(t) => setParam({ topic: t })} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                shape="pill"
                aria-label={`Sort: ${view === "issues" ? ISSUE_SORT_LABEL[issueSort] : SORT_LABEL[sort]}`}
              >
                <ArrowUpDown className="size-3.5" />
                {view === "issues" ? ISSUE_SORT_LABEL[issueSort] : SORT_LABEL[sort]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {view === "issues" ? (
                <DropdownMenuRadioGroup value={issueSort} onValueChange={(v) => setParam({ sort: v === "priority" ? undefined : v })}>
                  {(Object.keys(ISSUE_SORT_LABEL) as IssueSort[]).map((key) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {ISSUE_SORT_LABEL[key]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              ) : (
                <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setParam({ sort: v === "newest" ? undefined : v })}>
                  {(Object.keys(SORT_LABEL) as Sort[]).map((key) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {SORT_LABEL[key]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {view === "issues" && <UngroupedNotice count={issuesQuery.ungrouped} onDone={refreshAll} />}

      {view === "issues" ? (
        <IssuesTable
          issues={issuesQuery.issues}
          total={issuesQuery.total}
          offset={offset}
          isPending={issuesQuery.isPending}
          isFetching={issuesQuery.isFetching}
          emptyText={
            status === "new" && !rating && !topic
              ? "Nothing unresolved. Every issue has been dealt with."
              : "No issues match."
          }
          onOpen={(issueId) => setParam({ issue: issueId, list: undefined, sort: undefined })}
          onOffset={(next) => setParam({ offset: String(next) })}
        />
      ) : (
        <>
          {issue && (
            <IssueHeader
              issueId={issue}
              onBack={() => setParam({ issue: undefined })}
              onChanged={refreshAll}
              onMerged={(intoId) => {
                // The survivor's counts changed; its cached header must not show the old ones.
                refreshAll();
                setParam({ issue: intoId });
              }}
            />
          )}
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <span key={c.key} className="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs">
                  {c.label}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground grid size-4 place-items-center rounded-full"
                    aria-label={`Remove filter: ${c.label}`}
                    onClick={() => setParam({ [c.key]: undefined })}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground ml-1 text-xs"
                onClick={() => setParam(Object.fromEntries(chips.map((c) => [c.key, undefined])))}
              >
                Clear all
              </button>
            </div>
          )}

          <div className="bg-card overflow-hidden rounded-xl border">
            {isPending ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-md" />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <p className="text-muted-foreground px-4 py-12 text-center text-sm">
                {status === "new" && chips.length === 0 && !rating && !topic ? "Nothing unresolved. Every report has been dealt with." : "No reports match."}
              </p>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="px-4 py-2.5 font-medium">Report</th>
                    <th className="hidden w-[22%] px-3 py-2.5 font-medium lg:table-cell">Form</th>
                    <th className="hidden w-[14%] px-3 py-2.5 font-medium md:table-cell">From</th>
                    <th className="w-28 px-3 py-2.5 font-medium">Status</th>
                    <th className="w-24 px-4 py-2.5 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const face = faceFor(r.rating);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => openReport(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openReport(r.id);
                          }
                        }}
                        tabIndex={0}
                        className={cn(
                          "hover:bg-muted/50 focus-visible:bg-muted/50 cursor-pointer border-b outline-none last:border-b-0",
                          openId === r.id && "bg-muted/50",
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <face.Icon className="size-4 shrink-0" style={{ color: face.color }} aria-label={face.label} />
                            <span className="min-w-0 flex-1">
                              <span className={cn("block truncate", !r.message && "text-muted-foreground")}>
                                {r.message ?? `${face.label}, no note`}
                              </span>
                              {r.topic && <span className="text-muted-foreground block truncate text-xs">{feedbackTopicLabel(r.topic)}</span>}
                            </span>
                            {r.hasSnapshot && (
                              <Monitor className="text-muted-foreground size-3.5 shrink-0" aria-label="Conversation attached" />
                            )}
                            {r.internalNote && (
                              <MessageSquareText className="text-muted-foreground size-3.5 shrink-0" aria-label="Has an internal note" />
                            )}
                          </div>
                        </td>
                        <td className="hidden px-3 py-3 lg:table-cell">
                          <span className="block truncate">{r.formTitle ?? "Deleted form"}</span>
                          <span className="text-muted-foreground block truncate text-xs">{r.organizationName ?? "—"}</span>
                        </td>
                        <td className="text-muted-foreground hidden truncate px-3 py-3 md:table-cell">
                          {r.respondentLabel ?? "Anonymous"}
                        </td>
                        <td className="px-3 py-3">
                          <StatusLabel status={r.status} />
                        </td>
                        <td className="text-muted-foreground px-4 py-3 text-right whitespace-nowrap" title={new Date(r.createdAt).toLocaleString()}>
                          {relativeTime(r.createdAt)}
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
      )}

      {openId && (
        <FeedbackReportDialog
          id={openId}
          rows={live.rows}
          position={position}
          total={total}
          onStep={(by) => void stepReport(by)}
          onResolved={() => void advance(status === "new")}
          onRemoved={() => void advance(true)}
          onClose={() => openReport(null)}
          onChanged={refreshAll}
          onShowRespondent={(rid) => {
            setOpenId(null);
            setParam({ respondentId: rid, status: "all", report: undefined });
          }}
        />
      )}
    </section>
  );
}

/**
 * Which face, with how many reports each would give.
 *
 * The counts are the point. A row of five bare faces asked the reader to try
 * each one to find out whether anyone had rated anything "Terrible"; here the
 * menu says so before anything is picked — and the counts respect every other
 * filter, so they always add up to the list beside them.
 */
function RatingMenu({
  value,
  counts,
  onChange,
}: {
  value: number | undefined;
  counts: { rating: number; count: number }[];
  onChange: (rating: number | undefined) => void;
}) {
  const picked = value ? FACES[value as 1] : null;
  const AnyFace = FACES[3].Icon;
  const total = counts.reduce((n, c) => n + c.count, 0);
  const peak = Math.max(1, ...counts.map((c) => c.count));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" shape="pill" className={cn(picked && "border-foreground/30")}>
          {picked ? (
            <picked.Icon className="size-3.5" style={{ color: picked.color }} aria-hidden />
          ) : (
            <AnyFace className="text-muted-foreground size-3.5" aria-hidden />
          )}
          {picked ? picked.label : "Any rating"}
          <ChevronDown className="text-muted-foreground size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuItem onSelect={() => onChange(undefined)} className="justify-between">
          <span>Any rating</span>
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground tabular text-xs">{total}</span>
            <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} />
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {[5, 4, 3, 2, 1].map((r) => {
          const face = FACES[r as 1];
          const n = counts.find((c) => c.rating === r)?.count ?? 0;
          return (
            <DropdownMenuItem key={r} onSelect={() => onChange(r)} disabled={n === 0 && value !== r} className="gap-2.5">
              <face.Icon className="size-4 shrink-0" style={{ color: face.color }} aria-hidden />
              <span className="w-16 shrink-0">{face.label}</span>
              {/* A bar per face, so the shape of the queue is visible in the menu itself. */}
              <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                <span className="block h-full rounded-full" style={{ width: `${(n / peak) * 100}%`, background: face.color }} />
              </span>
              <span className="text-muted-foreground tabular w-6 text-right text-xs">{n}</span>
              <Check className={cn("size-4 shrink-0", value === r ? "opacity-100" : "opacity-0")} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What it is about — only the topics that actually occur, largest first, with their counts. */
function TopicMenu({
  value,
  counts,
  onChange,
}: {
  value: string | undefined;
  counts: { topic: string; count: number }[];
  onChange: (topic: string | undefined) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" shape="pill" className={cn(value && "border-foreground/30")}>
          <Tag className="text-muted-foreground size-3.5" aria-hidden />
          <span className="max-w-40 truncate">{value ? (feedbackTopicLabel(value) ?? value) : "Any topic"}</span>
          <ChevronDown className="text-muted-foreground size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
          <DropdownMenuRadioItem value="">Any topic</DropdownMenuRadioItem>
          {counts.length > 0 && <DropdownMenuSeparator />}
          {counts.map((c) => (
            <DropdownMenuRadioItem key={c.topic} value={c.topic} className="justify-between">
              <span className="truncate">{feedbackTopicLabel(c.topic)}</span>
              <span className="text-muted-foreground tabular ml-3 text-xs">{c.count}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {counts.length === 0 && (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">No report in this list has a topic yet.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
