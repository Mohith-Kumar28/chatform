"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Gauge,
  Inbox,
  Lock,
  MessageSquare,
  Sheet,
  TrendingDown,
  Users,
} from "lucide-react";
import { type Block, type FormDoc } from "@repo/form-schema";
import {
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

export function ResultsClient({ formId }: ResultsClientProps) {
  const [tab, setTab] = useState<"submissions" | "summary" | "analytics">("submissions");
  const [statusFilter, setStatusFilter] = useState<"completed" | "abandoned">("completed");

  const { data: rawAnalytics } = useGetApiFormsByIdAnalytics(formId as never);
  const { data: rawSubs, isLoading } = useGetApiFormsByIdSubmissions(formId as never);
  const { data: rawForm } = useGetApiFormsById(formId as never);
  /**
   * The recovery report rides alongside rather than inside `/analytics`: it is
   * gated on `followup_email` rather than `advanced_analytics`, so somebody
   * paying to send the reminders can read what they did without also paying for
   * the funnel. Returns zeros for a form that has never scheduled one.
   */
  const { data: rawFollowUps } = useGetApiFormsByIdFollowupAnalytics(formId as never);

  const analytics = rawAnalytics as Analytics | undefined;
  const subs = (Array.isArray(rawSubs) ? rawSubs : []) as SubmissionRecord[];
  const form = rawForm as
    | { workingSchema?: FormDoc; status?: string; hasUnpublishedChanges?: boolean }
    | undefined;
  const doc = form?.workingSchema;
  const ent = useEntitlements();

  const canPartials = ent.can("partial_responses");
  const canAnalytics = ent.can("advanced_analytics");

  const columns = useMemo(
    () => (doc?.blocks ?? []).filter((b) => !["welcome", "statement"].includes(b.type)),
    [doc],
  );

  const completedCount = subs.filter((s) => s.status === "completed").length;
  /**
   * The real number of unfinished responses, even when the rows themselves are locked.
   *
   * Read from analytics rather than counted from `subs`, because on Free the server sends
   * completed rows only — so counting the array would say zero and the badge would lie.
   * `abandoned` is basic analytics and free on every plan, which is what lets the gate say
   * "3 people started and didn't finish" truthfully while holding none of what they said.
   */
  const partialCount = canPartials ? subs.length - completedCount : (analytics?.abandoned ?? 0);
  const rows = subs.filter((s) =>
    statusFilter === "completed" ? s.status === "completed" : s.status !== "completed",
  );

  /**
   * Hoisted, because it belongs to the table rather than to the page: on the
   * table it sits in the same row as full screen and the selection actions, and
   * every other branch below still needs it above whatever it renders instead.
   */
  const statusSwitcher = (
    <SegmentedControl
      size="sm"
      options={[
        { value: "completed", label: "Completed", badge: completedCount },
        { value: "abandoned", label: "Partial", badge: partialCount },
      ]}
      value={statusFilter}
      onChange={setStatusFilter}
      ariaLabel="Submission status"
    />
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
              <EmptyState
                icon={Inbox}
                title={statusFilter === "completed" ? "No responses yet" : "No partial responses"}
                description={
                  statusFilter === "completed"
                    ? "Share your form and answers will appear here — with the whole conversation, not just the fields."
                    : "Partial responses are conversations someone started but didn't finish. They show up here once someone answers at least one question."
                }
              />
            </>
          ) : (
            <SubmissionsTable
              formId={formId}
              rows={rows}
              columns={columns}
              filters={statusSwitcher}
              // Partial only: on a finished response the follow-up story is
              // always "they finished", which the status pill already says.
              showFollowUp={statusFilter === "abandoned"}
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
}: {
  formId: string;
  completed: number;
  partials: number;
  canPartials: boolean;
}) {
  const upgrade = useUpgrade();
  // Straight browser navigation, so the session cookie rides along.
  const href = (opts: { partials?: boolean; xlsx?: boolean }) =>
    `${API_ORIGIN}/api/forms/${formId}/submissions/export${opts.xlsx ? ".xlsx" : ""}${
      opts.partials ? "?includePartials=true" : ""
    }`;

  const total = completed + partials;

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
