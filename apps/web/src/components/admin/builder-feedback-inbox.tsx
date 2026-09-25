"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, ChevronDown, MessageSquareText, Paperclip, Search, Tag, X } from "lucide-react";
import { PLAN_IDS } from "@repo/entitlements";
import {
  builderAreaLabel,
  builderSeverityLabel,
  type BuilderFeedbackArea,
  type BuilderFeedbackKind,
} from "@repo/form-schema";
import {
  getGetApiAdminFeedbackBuilderReportsQueryOptions,
  useGetApiAdminFeedbackBuilderReports,
} from "@/lib/api/admin/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InfoHint } from "@/components/ui/info-hint";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiData } from "@/lib/api/payload";
import { relativeTime } from "@/components/forms/form-card";
import { cn } from "@/lib/utils";
import { faceFor } from "./feedback-faces";
import { StatusLabel } from "./feedback-status";
import { FEEDBACK_PAGE, FeedbackPager, useFeedbackPages } from "./feedback-pager";
import { BuilderFeedbackDialog, capitalise, headlineOf, type BuilderReport } from "./builder-feedback-dialog";
import {
  BuilderIssueHeader,
  BuilderIssuesTable,
  BuilderUngroupedNotice,
  KindIcon,
  kindLabel,
  useBuilderIssues,
} from "./builder-feedback-issues";

/**
 * What the people who build forms sent from the "?" button.
 *
 * The respondent inbox's layout, so the console reads one way: Issues or
 * Reports, a status switch with counts, filters as one compact group on the
 * right, rows that open the record. The filters that matter here are different:
 * what kind of report, which part of the product, and whether the account pays.
 */

interface ReportsBody {
  reports: BuilderReport[];
  total: number;
  counts: { new: number; resolved: number };
  kindCounts: { kind: string; count: number }[];
  areaCounts: { area: string; count: number }[];
}

type StatusFilter = "new" | "resolved" | "all";
type IssueSort = "priority" | "recent" | "reports";
const ISSUE_SORT_LABEL: Record<IssueSort, string> = { priority: "Priority", recent: "Recently seen", reports: "Most reports" };

const KINDS: BuilderFeedbackKind[] = ["bug", "feature", "feedback"];

/**
 * Every key this tab keeps in the URL. Cleared when the tab changes, so a filter
 * set on one half of the page never silently narrows the other.
 */
export const BUILDER_PARAMS = ["status", "kind", "area", "plan", "q", "orgId", "userId", "issue", "list", "sort", "offset", "report"];

export function BuilderFeedbackInbox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const issue = params.get("issue") ?? undefined;
  const view: "issues" | "reports" = issue || params.get("list") === "reports" ? "reports" : "issues";
  const statusParam = params.get("status");
  const status: StatusFilter =
    statusParam === "resolved" || statusParam === "all" || statusParam === "new" ? statusParam : issue ? "all" : "new";
  const kindParam = params.get("kind");
  const kind = KINDS.includes(kindParam as BuilderFeedbackKind) ? (kindParam as BuilderFeedbackKind) : undefined;
  const area = (params.get("area") ?? undefined) as BuilderFeedbackArea | undefined;
  const plan = params.get("plan") ?? undefined;
  const q = params.get("q") ?? undefined;
  const orgId = params.get("orgId") ?? undefined;
  const userId = params.get("userId") ?? undefined;
  const sortParam = params.get("sort");
  const sort: "newest" | "oldest" = sortParam === "oldest" ? "oldest" : "newest";
  const issueSort: IssueSort = sortParam === "reports" || sortParam === "recent" ? sortParam : "priority";
  const offset = Number(params.get("offset") ?? 0);

  const setParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("offset" in patch)) next.delete("offset");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const pageParams = (at: number) => ({
    status,
    sort,
    limit: FEEDBACK_PAGE,
    offset: at,
    ...(kind ? { kind } : {}),
    ...(area ? { area } : {}),
    ...(plan ? { plan } : {}),
    ...(q ? { q } : {}),
    ...(orgId ? { orgId } : {}),
    ...(userId ? { userId } : {}),
    ...(issue ? { issue } : {}),
  });
  const { data, isPending, isFetching } = useGetApiAdminFeedbackBuilderReports(pageParams(offset));
  const body = apiData<ReportsBody>(data);

  const queryClient = useQueryClient();
  const refreshAll = useCallback(
    () =>
      void queryClient.invalidateQueries({
        predicate: (qk) => typeof qk.queryKey[0] === "string" && (qk.queryKey[0] as string).startsWith("/api/admin/feedback/builder"),
      }),
    [queryClient],
  );
  const issuesQuery = useBuilderIssues({ status, kind, sort: issueSort, offset, enabled: view === "issues" });
  const reports = useMemo(() => body?.reports ?? [], [body?.reports]);
  const total = body?.total ?? 0;
  const counts = view === "issues" ? issuesQuery.counts : (body?.counts ?? { new: 0, resolved: 0 });
  const kindCounts = body?.kindCounts ?? [];
  const areaCounts = body?.areaCounts ?? [];

  const [openId, setOpenId] = useState<string | null>(() => params.get("report"));
  const [carried, setCarried] = useState<{ offset: number; rows: BuilderReport[] } | null>(null);

  const first = reports[0];
  const chips = [
    orgId && { key: "orgId", label: first?.organizationId === orgId ? (first.organizationName ?? "This account") : "One account" },
    userId && { key: "userId", label: first?.userId === userId ? (first.userEmail ?? "One person") : "One person" },
  ].filter(Boolean) as { key: string; label: string }[];

  const pages = useFeedbackPages({ total, offset, onOffset: (next) => setParam({ offset: String(next) }) });

  const loadPage = async (at: number, fresh = false) =>
    apiData<ReportsBody>(
      await queryClient.fetchQuery({
        ...getGetApiAdminFeedbackBuilderReportsQueryOptions(pageParams(at)),
        ...(fresh ? { staleTime: 0 } : {}),
      }),
    )?.reports ?? [];

  const live =
    carried && carried.rows.some((r) => r.id === openId) && (carried.offset !== offset || !reports.some((r) => r.id === openId))
      ? carried
      : { offset, rows: reports };
  const openIndex = openId ? live.rows.findIndex((r) => r.id === openId) : -1;
  const position = openIndex >= 0 ? live.offset + openIndex : -1;

  const openReport = (id: string | null, page?: { offset: number; rows: BuilderReport[] }) => {
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

  const advance = async (gone: boolean) => {
    if (openIndex < 0) return;
    if (!gone) return stepReport(1);
    const rows = await loadPage(live.offset, true);
    const target = rows[openIndex] ?? rows[rows.length - 1];
    if (target) return openReport(target.id, { offset: live.offset, rows });
    if (live.offset === 0) return openReport(null);
    const before = await loadPage(live.offset - FEEDBACK_PAGE, true);
    const last = before[before.length - 1];
    openReport(last?.id ?? null, { offset: live.offset - FEEDBACK_PAGE, rows: before });
  };

  const kindTotal = kindCounts.reduce((n, k) => n + k.count, 0);
  const countOf = (k: string) => kindCounts.find((c) => c.kind === k)?.count ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-h3">Inbox</h2>
          <InfoHint label="About the inbox">
            Bugs, feature requests and feedback sent from the ? button in the dashboard and the builder, whatever the period picked
            above. Issues group reports that describe the same bug or ask for the same thing; priority ranks them by how many
            accounts asked, paying ones counting double, and how recently.
          </InfoHint>
        </div>
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

      <SegmentedControl
        size="sm"
        value={kind ?? "all"}
        onChange={(next) => setParam({ kind: next === "all" ? undefined : next })}
        options={[
          { value: "all", label: "All", ...(view === "reports" ? { badge: kindTotal } : {}) },
          { value: "bug", label: "Bugs", ...(view === "reports" ? { badge: countOf("bug") } : {}) },
          { value: "feature", label: "Features", ...(view === "reports" ? { badge: countOf("feature") } : {}) },
          { value: "feedback", label: "Feedback", ...(view === "reports" ? { badge: countOf("feedback") } : {}) },
        ]}
        ariaLabel="Which kind"
      />

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
          {view === "reports" && (
            <>
              <SearchBox value={q} onChange={(next) => setParam({ q: next })} />
              <AreaMenu value={area} counts={areaCounts} onChange={(a) => setParam({ area: a })} />
              <PlanMenu value={plan} onChange={(p) => setParam({ plan: p })} />
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" shape="pill">
                <ArrowUpDown className="size-3.5" />
                {view === "issues" ? ISSUE_SORT_LABEL[issueSort] : sort === "oldest" ? "Oldest first" : "Newest first"}
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
                  <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {view === "issues" && <BuilderUngroupedNotice count={issuesQuery.ungrouped} onDone={refreshAll} />}

      {view === "issues" ? (
        <BuilderIssuesTable
          issues={issuesQuery.issues}
          total={issuesQuery.total}
          offset={offset}
          isPending={issuesQuery.isPending}
          isFetching={issuesQuery.isFetching}
          emptyText={status === "new" && !kind ? "Nothing unresolved. Every issue has been dealt with." : "No issues match."}
          onOpen={(issueId) => setParam({ issue: issueId, list: undefined, sort: undefined })}
          onOffset={(next) => setParam({ offset: String(next) })}
        />
      ) : (
        <>
          {issue && (
            <BuilderIssueHeader
              issueId={issue}
              onBack={() => setParam({ issue: undefined })}
              onChanged={refreshAll}
              onMerged={(intoId) => {
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
                {status === "new" && !kind && !area && !plan && !q && chips.length === 0
                  ? "Nothing unresolved. Every report has been dealt with."
                  : "No reports match."}
              </p>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="px-4 py-2.5 font-medium">Report</th>
                    <th className="hidden w-[24%] px-3 py-2.5 font-medium lg:table-cell">From</th>
                    <th className="hidden w-20 px-3 py-2.5 font-medium md:table-cell">Plan</th>
                    <th className="w-28 px-3 py-2.5 font-medium">Status</th>
                    <th className="w-24 px-4 py-2.5 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const face = r.rating ? faceFor(r.rating) : null;
                    const detail = [
                      kindLabel(r.kind),
                      builderAreaLabel(r.area),
                      r.severity ? builderSeverityLabel(r.severity) : face ? face.label : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
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
                            {face ? (
                              <face.Icon className="size-4 shrink-0" style={{ color: face.color }} aria-label={kindLabel(r.kind)} />
                            ) : (
                              <KindIcon kind={r.kind} className="text-muted-foreground size-4 shrink-0" aria-label={kindLabel(r.kind)} />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{headlineOf(r)}</span>
                              <span className="text-muted-foreground block truncate text-xs">{detail}</span>
                            </span>
                            {r.attachments.length > 0 && (
                              <span
                                className="text-muted-foreground inline-flex shrink-0 items-center gap-0.5 text-xs"
                                aria-label={`${r.attachments.length} ${r.attachments.length === 1 ? "image" : "images"}`}
                              >
                                <Paperclip className="size-3.5" aria-hidden />
                                {r.attachments.length}
                              </span>
                            )}
                            {r.internalNote && (
                              <MessageSquareText className="text-muted-foreground size-3.5 shrink-0" aria-label="Has an internal note" />
                            )}
                          </div>
                        </td>
                        <td className="hidden px-3 py-3 lg:table-cell">
                          <span className="block truncate">{r.organizationName ?? "Unknown account"}</span>
                          <span className="text-muted-foreground block truncate text-xs">{r.userEmail ?? "No address"}</span>
                        </td>
                        <td className="text-muted-foreground hidden px-3 py-3 md:table-cell">
                          {r.planId ? capitalise(r.planId) : "Unknown"}
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
        <BuilderFeedbackDialog
          id={openId}
          rows={live.rows}
          position={position}
          total={total}
          onStep={(by) => void stepReport(by)}
          onResolved={() => void advance(status === "new")}
          onRemoved={() => void advance(true)}
          onClose={() => openReport(null)}
          onChanged={refreshAll}
          onShowUser={(uid) => {
            setOpenId(null);
            setParam({ userId: uid, status: "all", list: "reports", issue: undefined, report: undefined });
          }}
        />
      )}
    </section>
  );
}

/** Search on Enter, or after a pause, so each keystroke is not a query. */
function SearchBox({ value, onChange }: { value: string | undefined; onChange: (next: string | undefined) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) return;
    const id = setTimeout(() => onChange(trimmed || undefined), 400);
    return () => clearTimeout(id);
  }, [draft, value, onChange]);
  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search words, people, accounts"
        aria-label="Search reports"
        className="h-8 w-56 rounded-full pl-8 text-sm"
      />
    </div>
  );
}

/** Which part of the product, only the areas that occur, largest first. */
function AreaMenu({
  value,
  counts,
  onChange,
}: {
  value: string | undefined;
  counts: { area: string; count: number }[];
  onChange: (area: string | undefined) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" shape="pill" className={cn(value && "border-foreground/30")}>
          <Tag className="text-muted-foreground size-3.5" aria-hidden />
          <span className="max-w-40 truncate">{value ? (builderAreaLabel(value) ?? value) : "Any area"}</span>
          <ChevronDown className="text-muted-foreground size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
          <DropdownMenuRadioItem value="">Any area</DropdownMenuRadioItem>
          {counts.length > 0 && <DropdownMenuSeparator />}
          {counts.map((c) => (
            <DropdownMenuRadioItem key={c.area} value={c.area} className="justify-between">
              <span className="truncate">{builderAreaLabel(c.area)}</span>
              <span className="text-muted-foreground tabular ml-3 text-xs">{c.count}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The plan the account was on when they wrote it. */
function PlanMenu({ value, onChange }: { value: string | undefined; onChange: (plan: string | undefined) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" shape="pill" className={cn(value && "border-foreground/30")}>
          {value ? capitalise(value) : "Any plan"}
          <ChevronDown className="text-muted-foreground size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 p-1.5">
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
          <DropdownMenuRadioItem value="">Any plan</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {PLAN_IDS.map((p) => (
            <DropdownMenuRadioItem key={p} value={p}>
              {capitalise(p)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
