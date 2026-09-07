"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Inbox,
  MessageSquare,
  FileText,
  Lock,
  Sheet,
  TrendingDown,
  Users,
} from "lucide-react";
import { type FormDoc } from "@repo/form-schema";
import {
  useGetApiFormsById,
  useGetApiFormsByIdAnalytics,
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
import { SubmissionsTable, type SubmissionRecord } from "./submissions-table";
import { useEntitlements } from "@/hooks/use-entitlements";
import { LockedOverlay, LockChip, SkeletonRows, SkeletonChart, useUpgrade } from "@/components/billing/gate";
import { FirstPartialToast } from "@/components/billing/first-partial-toast";
import { API_ORIGIN } from "@/lib/api/mutator";


interface ResultsClientProps {
  formId: string;
}

interface Analytics {
  views: number;
  starts: number;
  completed: number;
  abandoned: number;
  completionRate: number;
  avgDurationMs: number | null;
  perBlock: { blockRef: string; title: string; answered: number; answerRate: number }[];
  distributions?: {
    blockRef: string;
    title: string;
    type: string;
    counts?: { label: string; count: number }[];
    avg?: number;
    min?: number;
    max?: number;
  }[];
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

  const analytics = rawAnalytics as Analytics | undefined;
  const subs = (Array.isArray(rawSubs) ? rawSubs : []) as SubmissionRecord[];
  const doc = (rawForm as { workingSchema?: FormDoc } | undefined)?.workingSchema;
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
            <SubmissionsTable formId={formId} rows={rows} columns={columns} filters={statusSwitcher} />
          )}
        </div>
      )}

      {tab === "summary" && <SummaryTab analytics={analytics} entitled={canAnalytics} />}
      {tab === "analytics" && <AnalyticsTab analytics={analytics} entitled={canAnalytics} />}
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
                onSelect={() => upgrade("export_partials", { count: partials, noun: "partial responses" })}
              >
                <Lock />
                <span className="flex-1">Unfinished responses</span>
                <LockChip feature="export_partials" context={{ count: partials }} />
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SummaryTab({ analytics, entitled }: { analytics?: Analytics; entitled: boolean }) {
  const dists = analytics?.distributions ?? [];

  /**
   * Charted answers are advanced analytics.
   *
   * The real response count sits above the blur, because a number the user already knows
   * is true is what makes the locked chart worth unlocking. An empty form gets the
   * ordinary empty state instead — the rule is never to gate before there is data.
   */
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

  if (dists.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Nothing to summarise yet"
        description="Once responses come in, you'll see how people answered each question."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {dists.map((d) => (
        <div key={d.blockRef} className="bg-card rounded-xl p-4">
          <p className="text-h3 mb-3">{d.title}</p>
          {d.counts && d.counts.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(140, d.counts.length * 34)}>
              <BarChart data={d.counts} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <ReTooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    fontSize: "0.8125rem",
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {d.counts.map((_, i) => (
                    <Cell key={i} fill={`var(--chart-${(i % 6) + 1})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Average" value={d.avg?.toFixed(1) ?? "—"} />
              <Metric label="Lowest" value={d.min ?? "—"} />
              <Metric label="Highest" value={d.max ?? "—"} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AnalyticsTab({ analytics, entitled }: { analytics?: Analytics; entitled: boolean }) {
  // Before the early return: a hook after one is called on some renders and not others,
  // which changes hook order and breaks every hook below it.
  const upgrade = useUpgrade();
  const upgradeAnalytics = () => upgrade("advanced_analytics", { surface: "results.analytics" });

  if (!analytics) return <div className="shimmer h-64 rounded-xl" />;

  const funnel = analytics.perBlock ?? [];
  const locked = analytics.lockedContext;

  return (
    <div className="space-y-6">
      {/* 3x2 rather than the wrapping 6-across that broke at every width. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Views" value={analytics.views} icon={Eye} />
        <StatCard label="Started" value={analytics.starts} icon={Users} />
        <StatCard label="Completed" value={analytics.completed} icon={CheckCircle2} tone="success" />
        <StatCard
          label="Completion rate"
          value={`${Math.round((analytics.completionRate ?? 0) * 100)}%`}
          icon={TrendingDown}
          tone="primary"
        />
        <StatCard label="Abandoned" value={analytics.abandoned} icon={Inbox} tone="warning" />
        {/* Views, starts, completions, rate and abandoned stay real and unblurred on every
            plan — those are the numbers that make someone curious. Average time is part of
            the detail that answers the curiosity, so it goes behind the gate with the rest. */}
        {entitled ? (
          <StatCard
            label="Average time"
            value={analytics.avgDurationMs ? `${Math.round(analytics.avgDurationMs / 1000)}s` : "—"}
            icon={Clock}
          />
        ) : (
          <button
            type="button"
            onClick={() => upgradeAnalytics()}
            className="bg-card hover:bg-muted/40 flex items-center justify-between gap-2 rounded-xl p-4 text-left transition-colors"
          >
            <div>
              <p className="text-muted-foreground text-caption">Average time</p>
              <p className="text-h3 blur-[5px] select-none" aria-hidden>
                48s
              </p>
            </div>
            <LockChip feature="advanced_analytics" />
          </button>
        )}
      </div>

      {!entitled ? (
        /**
         * The drop-off funnel, named but withheld.
         *
         * The server sends `worstBlockTitle` and `worstBlockIndex` without the numbers
         * behind them, so this can truthfully say *where* people leave while the *why*
         * stays locked. That one sentence is the entire upsell for this surface.
         */
        <LockedOverlay
          feature="advanced_analytics"
          headline={
            locked?.worstBlockIndex
              ? `Most people drop off at question ${locked.worstBlockIndex} — “${locked.worstBlockTitle}”. Unlock to see why.`
              : "See exactly which question people leave on."
          }
          className="bg-card"
        >
          <div className="p-4">
            <p className="text-h3 mb-4">Where people drop off</p>
            <SkeletonChart bars={Math.min(9, Math.max(4, locked?.questionCount ?? 5))} />
          </div>
        </LockedOverlay>
      ) : (
      <div className="bg-card rounded-xl p-4">
        <p className="text-h3 mb-1">Where people drop off</p>
        <p className="text-muted-foreground text-caption mb-4">
          The share of respondents who answered each question.
        </p>
        {funnel.length === 0 ? (
          <p className="text-muted-foreground text-sm">No responses yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, funnel.length * 38)}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 32 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" domain={[0, 1]} hide />
              <YAxis
                type="category"
                dataKey="title"
                width={140}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <ReTooltip
                cursor={{ fill: "var(--muted)" }}
                formatter={(v) => [`${Math.round(Number(v ?? 0) * 100)}%`, "Answered"]}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  fontSize: "0.8125rem",
                }}
              />
              <Bar dataKey="answerRate" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-muted/40 rounded-lg p-2.5 text-center">
      <p className="text-muted-foreground text-micro">{label}</p>
      <p className="tabular text-h2">{value}</p>
    </div>
  );
}
