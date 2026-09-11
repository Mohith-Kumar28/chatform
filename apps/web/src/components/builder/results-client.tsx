"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Gauge,
  Inbox,
  Lock,
  MessageSquare,
  RefreshCw,
  Sheet,
  TrendingDown,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { type Block, type FormDoc } from "@repo/form-schema";
import {
  getGetApiFormsByIdAnalyticsQueryKey,
  getGetApiFormsByIdFollowupAnalyticsQueryKey,
  getGetApiFormsByIdQueryKey,
  getGetApiFormsByIdSubmissionsQueryKey,
  useGetApiFormsById,
  useGetApiFormsByIdAnalytics,
  useGetApiFormsByIdFollowupAnalytics,
  useGetApiFormsByIdSubmissions,
} from "@/lib/api/dashboard/dashboard";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatCard } from "@/components/ui/stat-card";
import { ResultsAnalytics, type AnalyticsPayload } from "./results-analytics";
import { ResultsSummary, type Distribution } from "./results-summary";
import { SubmissionsTable, type SubmissionRecord } from "./submissions-table";
import { useEntitlements } from "@/hooks/use-entitlements";
import { LockedOverlay, LockChip, SkeletonRows, SkeletonChart, useUpgrade } from "@/components/billing/gate";
import { FirstPartialToast } from "@/components/billing/first-partial-toast";
import { FollowUpNudge } from "./followup-nudge";
import { FollowUpAnalytics, type FollowUpPayload } from "./followup-analytics";
import { API_ORIGIN } from "@/lib/api/mutator";
import { cn } from "@/lib/utils";


interface ResultsClientProps {
  formId: string;
}

/**
 * What `GET /forms/:id/analytics` sends.
 *
 * The shape is the server's `AnalyticsAggregate` plus what the gate does to it:
 * the paid halves arrive empty rather than absent, and `locked` names them.
 */
interface Analytics extends AnalyticsPayload {
  distributions: Distribution[];
  /** Field names the server withheld because the plan does not include them. */
  locked?: string[];
  /**
   * Enough truth to make the upsell honest: the question count and where the worst
   * drop-off is, without the numbers behind it.
   */
  lockedContext?: {
    feature: string;
    requiredPlan: string;
    questionCount: number;
    worstBlockTitle: string | null;
    worstBlockIndex: number | null;
  } | null;
}

/** One turn of the refresh icon. The floor on how long a refresh looks busy. */
const SPIN_MS = 600;

export function ResultsClient({ formId }: ResultsClientProps) {
  const [tab, setTab] = useState<"submissions" | "summary" | "analytics">("submissions");
  /*
    What the table below has ticked, held here because the Download button is
    up here. `setSelection` goes down as-is — a `useState` setter is stable,
    which is what keeps the table's reporting effect from firing every render.
  */
  const [selection, setSelection] = useState<{ count: number; download: () => void } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"completed" | "abandoned">("completed");
  /**
   * The page, and how big it is.
   *
   * Both live here rather than in the table because they are query parameters:
   * the rows come from the server one page at a time, and the request has to be
   * re-issued — under its own cache key — when either changes. The table gets
   * them back as props and reports clicks.
   */
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [offset, setOffset] = useState(0);

  /**
   * The one page that refetches when you come back to the window.
   *
   * `refetchOnWindowFocus` is off globally, which is right nearly everywhere:
   * a form document, a plan, a template list do not change because you alt-
   * tabbed. Results are the exception, because *waiting for responses to
   * arrive* is the entire reason this page is open. Leaving it on the global
   * default meant switching to your inbox to check whether anyone had replied
   * and coming back to the counts from whenever you first opened the tab —
   * the page most likely to be stale was the only one never asking.
   *
   * `staleTime` still applies, so a flurry of alt-tabs inside thirty seconds
   * costs nothing, and the refetch is a background one: the numbers are on
   * screen throughout, they just quietly become current.
   */
  const LIVE = { refetchOnWindowFocus: true } as const;

  const { data: rawAnalytics } = useGetApiFormsByIdAnalytics(formId as never, {
    query: { queryKey: getGetApiFormsByIdAnalyticsQueryKey(formId as never), ...LIVE },
  });
  /**
   * The filter is the server's now, not the array's.
   *
   * This page used to fetch every response and filter the array in the browser,
   * which only works while the array is the whole table — and the endpoint sends
   * one page. `partial` is the union the Partial tab shows: started and not
   * completed, whatever became of it. On a plan without partial responses the
   * tab renders the paywall instead of rows, so the request stays on `completed`
   * rather than asking for a 402.
   */
  const ent = useEntitlements();
  const canPartials = ent.can("partial_responses");
  const canAnalytics = ent.can("advanced_analytics");
  const subsParams = {
    status: statusFilter === "abandoned" && canPartials ? ("partial" as const) : ("completed" as const),
    limit: rowsPerPage,
    offset,
  };
  const { data: rawSubs, isLoading, isFetching } = useGetApiFormsByIdSubmissions(formId as never, subsParams, {
    query: { queryKey: getGetApiFormsByIdSubmissionsQueryKey(formId as never, subsParams), ...LIVE },
  });
  const { data: rawForm } = useGetApiFormsById(formId as never, {
    query: { queryKey: getGetApiFormsByIdQueryKey(formId as never), ...LIVE },
  });
  /**
   * The recovery report rides alongside rather than inside `/analytics`: it is
   * gated on `followup_email` rather than `advanced_analytics`, so somebody
   * paying to send the reminders can read what they did without also paying for
   * the funnel. Returns zeros for a form that has never scheduled one.
   */
  const { data: rawFollowUps } = useGetApiFormsByIdFollowupAnalytics(formId as never, {
    query: {
      queryKey: getGetApiFormsByIdFollowupAnalyticsQueryKey(formId as never),
      ...LIVE,
    },
  });

  const analytics = rawAnalytics as Analytics | undefined;
  /**
   * Rows, and the questions the current form cannot account for.
   *
   * `retiredColumns` carries whole blocks for questions that were deleted while
   * their answers stayed — see `apps/api/src/lib/retired-columns.ts`. Whole
   * blocks because `displayCell` resolves option ids against them; a retired
   * multiple-choice sent as a bare title would render `opt_founder001`.
   */
  const payload = rawSubs as
    | {
        submissions?: SubmissionRecord[];
        retiredColumns?: Block[];
        total?: number;
        counts?: { total: number; completed: number; partial: number };
      }
    | undefined;
  const subs = (payload?.submissions ?? []) as SubmissionRecord[];
  const retired = useMemo(() => payload?.retiredColumns ?? [], [payload]);
  const form = rawForm as
    | { workingSchema?: FormDoc; status?: string; hasUnpublishedChanges?: boolean }
    | undefined;
  const doc = form?.workingSchema;

  /**
   * The form's questions, then the ones it used to have.
   *
   * Retired columns sit at the far end rather than in the position the question
   * once held: the live form is what the author is reading the table against,
   * and a deleted question reappearing in the middle of it would read as a
   * question that is still being asked. They are last, and they are labelled.
   */
  const columns = useMemo(
    () => [
      ...(doc?.blocks ?? []).filter((b) => !["welcome", "statement"].includes(b.type)),
      ...retired.map((b) => ({ ...b, retired: true })),
    ],
    [doc, retired],
  );

  /**
   * Both badges, counted by the server over the whole table.
   *
   * They used to be counted from the array on screen, which the moment the list
   * became one page meant "Completed 50" on a form with three thousand. The
   * endpoint returns both counts on every read, whichever tab asked, so the tab
   * you are not looking at is still badged truthfully.
   *
   * The fallback is analytics — free on every plan, which is what lets the
   * paywall say "3 people started and didn't finish" while holding none of what
   * they said — and covers the first render, before any page has arrived.
   */
  const completedCount = payload?.counts?.completed ?? analytics?.completed ?? 0;
  const partialCount = payload?.counts?.partial ?? analytics?.abandoned ?? 0;
  /** The page. Filtered by the request, so every row on it belongs to the tab. */
  const rows = subs;
  const total = payload?.total ?? rows.length;

  /**
   * A filter or a page size change starts again at the top.
   *
   * Staying on offset 600 while switching to a tab with four rows in it would
   * show an empty table with a pager insisting there are hundreds — the classic
   * way a paginated list lies about being empty.
   */
  const goToFilter = (next: "completed" | "abandoned") => {
    setStatusFilter(next);
    setOffset(0);
  };
  const changeRowsPerPage = (n: number) => {
    setRowsPerPage(n);
    setOffset(0);
  };


  /**
   * Fetching this page again, because responses arrive while you are reading it.
   *
   * The list is a snapshot: React Query holds it until something invalidates
   * the key, and nothing on this screen does — a form that is live collects
   * answers whether or not the tab showing them is open, and a partial changes
   * state on its own half an hour after the respondent walks away (see the
   * follow-up column). Reloading the browser worked and cost the whole page.
   *
   * All four keys, not just the submissions one: the status chips count from
   * analytics, the nudge banner reads the form, and the recovery figures come
   * from their own endpoint. Refreshing the table alone would leave the numbers
   * beside it describing a moment that has passed.
   */
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    const started = Date.now();
    try {
      await Promise.all(
        [
          getGetApiFormsByIdSubmissionsQueryKey(formId as never),
          getGetApiFormsByIdAnalyticsQueryKey(formId as never),
          getGetApiFormsByIdFollowupAnalyticsQueryKey(formId as never),
          getGetApiFormsByIdQueryKey(formId as never),
        ].map((queryKey) => queryClient.refetchQueries({ queryKey })),
      );
    } finally {
      /*
       * One whole revolution, minimum.
       *
       * A cached round trip comes back in 80ms, and a spinner that stops before
       * it has been all the way round reads as a click that did nothing — worse
       * than no feedback, because the eye registers the flicker and not the
       * cause. `SPIN_MS` is one turn of the icon, so the animation always ends
       * where it started.
       */
      const spent = Date.now() - started;
      if (spent < SPIN_MS) await new Promise((r) => setTimeout(r, SPIN_MS - spent));
      setRefreshing(false);
    }
  }, [formId, queryClient, refreshing]);

  /**
   * Hoisted, because it belongs to the table rather than to the page: on the
   * table it sits in the same row as full screen and the selection actions, and
   * every other branch below still needs it above whatever it renders instead.
   *
   * Refresh travels with it for the same reason, and one better: the branch
   * where you most want to fetch again is the empty one, which renders no
   * table and therefore none of the table's own toolbar.
   */
  const statusSwitcher = (
    <div className="flex items-center gap-2">
      <SegmentedControl
        size="sm"
        options={[
          { value: "completed", label: "Completed", badge: completedCount },
          { value: "abandoned", label: "Partial", badge: partialCount },
        ]}
        value={statusFilter}
        onChange={goToFilter}
        ariaLabel="Submission status"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        shape="pill"
        className="group text-muted-foreground hover:text-foreground"
        aria-label="Refresh responses"
        title="Refresh responses"
        onClick={refresh}
        disabled={refreshing}
      >
        <RefreshCw
          className={cn(
            "size-3.5",
            refreshing
              ? // Faster than Tailwind's `animate-spin`, which is a full second
                // per turn and reads as loading-forever rather than as work.
                "[animation:spin_var(--spin-ms)_linear_infinite]"
              : // Idle, the icon leans into the cursor. It is the whole of the
                // affordance: an arrow that already moves says it will move.
                "transition-transform duration-300 ease-out group-hover:rotate-90",
          )}
          style={{ "--spin-ms": `${SPIN_MS}ms` } as React.CSSProperties}
        />
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Renders nothing; fires once per form, the first time there is both a response and
          an unfinished one to see. */}
      <FirstPartialToast formId={formId} completed={completedCount} partials={partialCount} />

      {/*
        Placed above the tabs rather than inside the Partial one.
        The author who needs to read this is the one looking at their completed
        responses and wondering where the rest went — putting it behind the tab
        they have not clicked shows it only to people who already found the
        problem.
      */}
      <FollowUpNudge
        formId={formId}
        doc={doc}
        partials={partialCount}
        published={form?.status === "published"}
        hasUnpublishedChanges={form?.hasUnpublishedChanges ?? false}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={[
            { value: "submissions", label: "Submissions", icon: Inbox },
            { value: "summary", label: "Summary", icon: MessageSquare },
            { value: "analytics", label: "Analytics", icon: TrendingDown },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="Results view"
        />
        <DownloadMenu
          formId={formId}
          completed={completedCount}
          partials={partialCount}
          canPartials={canPartials}
          selection={selection}
        />
      </div>

      {tab === "submissions" && (
        <div className="space-y-3">
          {/*
            The gate that pays for everything.
            The tab is visible with its real count, and opening it shows a blurred
            *synthetic* table — never the withheld rows, which the server does not send.
            The number and the sentence are what convert; the blur only says "there is
            something here".
          */}
          {statusFilter === "abandoned" && !canPartials ? (
            <>
              {statusSwitcher}
              <LockedOverlay
                feature="partial_responses"
                count={partialCount}
                noun={partialCount === 1 ? "person started" : "people started"}
                headline={
                  partialCount > 0
                    ? "…and didn't finish. See what they told you before they left."
                    : "When someone starts and doesn't finish, you'll see what they said here."
                }
                className="bg-card"
              >
                <SkeletonRows rows={Math.min(6, Math.max(3, partialCount))} />
              </LockedOverlay>
            </>
          ) : isLoading ? (
            <>
              {statusSwitcher}
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="shimmer h-12 rounded-lg" />
                ))}
              </div>
            </>
          ) : rows.length === 0 ? (
            <>
              {statusSwitcher}
              {/*
                An empty page is not the same as an empty table.

                Deleting the last rows of the final page, or a filter that
                shrank while it was being read, leaves an offset with nothing
                behind it — and the table, which is what carries the pager, is
                not rendered. Without this the only way back to the responses
                that are still there is a browser reload.
              */}
              {offset > 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="Nothing on this page"
                  description={`There ${total === 1 ? "is" : "are"} ${total.toLocaleString()} ${
                    total === 1 ? "response" : "responses"
                  } in this tab — this page is past the end of them.`}
                  action={
                    <Button variant="outline" size="sm" shape="pill" onClick={() => setOffset(0)}>
                      Back to the first page
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={Inbox}
                  title={statusFilter === "completed" ? "No responses yet" : "No partial responses"}
                  description={
                    statusFilter === "completed"
                      ? "Share your form and answers will appear here — with the whole conversation, not just the fields."
                      : "Partial responses are conversations someone started but didn't finish. They show up here once someone answers at least one question."
                  }
                />
              )}
            </>
          ) : (
            <SubmissionsTable
              formId={formId}
              rows={rows}
              columns={columns}
              filters={statusSwitcher}
              onSelection={setSelection}
              /*
                Partial only: on a finished response the follow-up story is
                always "they finished", which the status pill already says.

                And only when there is a story. With reminders switched off,
                every cell in the column reads "not sent" — a whole column,
                pinned next to the timestamp where the width is most expensive,
                to report that a feature the author never enabled did nothing.
                A sequence still in flight from before it was switched off does
                count, because that one is a thing the product is about to do.
              */
              showFollowUp={
                statusFilter === "abandoned" &&
                (Boolean(doc?.settings.followUp?.enabled) || rows.some((r) => r.followUp))
              }
              page={{
                offset,
                limit: rowsPerPage,
                total,
                // A page in flight disables the arrows rather than letting a
                // second click queue a jump the reader never sees land.
                loading: isFetching,
                onOffset: setOffset,
                onLimit: changeRowsPerPage,
              }}
            />
          )}
        </div>
      )}

      {tab === "summary" && <SummaryTab analytics={analytics} entitled={canAnalytics} blocks={columns} />}
      {tab === "analytics" && (
        <AnalyticsTab
          analytics={analytics}
          entitled={canAnalytics}
          followUps={rawFollowUps as FollowUpPayload | undefined}
        />
      )}
    </div>
  );
}

/**
 * Taking the data out, as one control.
 *
 * This was three: a button reading "Export 1 responses", a bare "+ 5 partial"
 * next to it, and — depending on the plan — either a second link or a lock
 * chip. Nobody could tell from looking whether "+ 5 partial" was a count, a
 * button, or something that would be added to the download, and the button
 * itself could not count ("1 responses").
 *
 * One button now, with the choice inside it where a choice belongs: what to
 * download, and in which format. The partial rows stay gated — same gate, same
 * count in the label — but as a menu item that says what it is instead of an
 * orphaned number beside an unrelated button.
 */
function DownloadMenu({
  formId,
  completed,
  partials,
  canPartials,
  selection,
}: {
  formId: string;
  completed: number;
  partials: number;
  canPartials: boolean;
  /** Set while rows are ticked in the table below — see `SubmissionsTable`. */
  selection?: { count: number; download: () => void } | null;
}) {
  const upgrade = useUpgrade();
  // Straight browser navigation, so the session cookie rides along.
  const href = (opts: { partials?: boolean; xlsx?: boolean }) =>
    `${API_ORIGIN}/api/forms/${formId}/submissions/export${opts.xlsx ? ".xlsx" : ""}${
      opts.partials ? "?includePartials=true" : ""
    }`;

  const total = completed + partials;

  /*
    Ticked rows retarget this button rather than growing a second one.

    There is no menu in this state, because there is no choice left to make:
    the rows are already on screen and already fetched, so the scope is settled
    and the format is the one the browser can write from here — CSV. Untick
    everything and the button goes back to being the whole form's download,
    every page of it, in either format.
  */
  if (selection) {
    return (
      <Button variant="outline" size="sm" shape="pill" onClick={selection.download}>
        <Download className="size-3.5" />
        Download {selection.count === 1 ? "1 response" : `${selection.count} responses`}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" shape="pill" disabled={total === 0}>
          <Download className="size-3.5" />
          Download
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-muted-foreground text-micro font-medium tracking-wide uppercase">
          {completed === 1 ? "1 completed response" : `${completed} completed responses`}
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={href({})} download>
            <FileText />
            CSV
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={href({ xlsx: true })} download>
            <Sheet />
            Excel workbook
          </a>
        </DropdownMenuItem>

        {partials > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-micro font-medium tracking-wide uppercase">
              Including {partials} unfinished
            </DropdownMenuLabel>
            {canPartials ? (
              <>
                <DropdownMenuItem asChild>
                  <a href={href({ partials: true })} download>
                    <FileText />
                    CSV
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={href({ partials: true, xlsx: true })} download>
                    <Sheet />
                    Excel workbook
                  </a>
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem
                onSelect={() => upgrade({ feature: "export_partials" }, { count: partials, noun: "partial responses" })}
              >
                <Lock />
                <span className="flex-1">Unfinished responses</span>
                <LockChip reason={{ feature: "export_partials" }} context={{ count: partials }} />
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The Summary tab: what people answered, gated.
 *
 * The gate wraps the charts and nothing else. The real response count sits
 * above the blur, because a number the user already knows is true is what makes
 * a locked chart worth unlocking, and an empty form gets the ordinary empty
 * state — the rule is never to gate before there is data.
 */
function SummaryTab({
  analytics,
  entitled,
  blocks,
}: {
  analytics?: Analytics;
  entitled: boolean;
  blocks: Block[];
}) {
  if (!entitled) {
    const answered = analytics?.completed ?? 0;
    if (answered === 0) {
      return (
        <EmptyState
          icon={MessageSquare}
          title="Nothing to summarise yet"
          description="Once responses come in, you'll see how people answered each question."
        />
      );
    }
    const questions = analytics?.lockedContext?.questionCount ?? 0;
    return (
      <LockedOverlay
        feature="advanced_analytics"
        count={answered}
        noun={answered === 1 ? "response" : "responses"}
        headline={
          questions > 0
            ? `See how people answered each of your ${questions} questions.`
            : "See how people answered each question."
        }
        className="bg-card"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart bars={5} />
        </div>
      </LockedOverlay>
    );
  }

  return (
    <ResultsSummary
      distributions={analytics?.distributions ?? []}
      starts={analytics?.starts ?? 0}
      blocks={blocks}
    />
  );
}

/**
 * The Analytics tab.
 *
 * Views, starts, completions, the rate and the abandoned count stay real and
 * unblurred on every plan — those are the numbers that make someone curious.
 * What is behind the gate is the detail that answers the curiosity, and the
 * server withholds it rather than the client hiding it: `worstBlockTitle`
 * arrives without the numbers behind it, so the locked panel can truthfully say
 * *where* people leave while the why stays locked.
 */
function AnalyticsTab({
  analytics,
  entitled,
  followUps,
}: {
  analytics?: Analytics;
  entitled: boolean;
  followUps?: FollowUpPayload;
}) {
  const upgrade = useUpgrade();

  if (!analytics) return <div className="shimmer h-64 rounded-xl" />;

  /**
   * Drawn under whichever half of this tab the plan allows, including the
   * locked one.
   *
   * A form only has this section once it has actually scheduled a reminder,
   * which means the author is already paying for follow-ups — withholding the
   * report on mail they are sending because they have not *also* bought
   * advanced analytics would be charging twice for one feature. It renders
   * nothing when there is nothing, so the common case costs a row of null.
   */
  const recovery = followUps?.everScheduled ? <FollowUpAnalytics stats={followUps} /> : null;

  if (!entitled) {
    const locked = analytics.lockedContext;
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Views" value={analytics.views} icon={Eye} />
          <StatCard label="Started" value={analytics.starts} icon={Users} />
          <StatCard label="Completed" value={analytics.completed} icon={CheckCircle2} tone="success" />
          <StatCard
            label="Completion rate"
            value={`${analytics.completionRate ?? 0}%`}
            icon={Gauge}
            tone="primary"
          />
          <StatCard label="Didn't finish" value={analytics.abandoned} icon={TrendingDown} tone="warning" />
          <button
            type="button"
            onClick={() => upgrade({ feature: "advanced_analytics" }, { surface: "results.analytics" })}
            className="bg-card hover:bg-muted/40 flex items-center justify-between gap-2 rounded-xl p-4 text-left transition-colors"
          >
            <div>
              <p className="text-muted-foreground text-caption">Median time</p>
              <p className="text-h3 blur-[5px] select-none" aria-hidden>
                48s
              </p>
            </div>
            <LockChip reason={{ feature: "advanced_analytics" }} />
          </button>
        </div>

        <LockedOverlay
          feature="advanced_analytics"
          headline={
            locked?.worstBlockIndex
              ? `Question ${locked.worstBlockIndex}, “${locked.worstBlockTitle}”, is where most people give up. See why.`
              : "See which question people leave on, when responses arrive, and where they come from."
          }
          className="bg-card"
        >
          <div className="p-4">
            <p className="text-h3 mb-4">Where people drop off</p>
            <SkeletonChart bars={Math.min(9, Math.max(4, locked?.questionCount ?? 5))} />
          </div>
        </LockedOverlay>
        {recovery}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ResultsAnalytics analytics={analytics} />
      {recovery}
    </div>
  );
}
