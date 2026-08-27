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
  TrendingDown,
  Users,
  ShieldCheck,} from "lucide-react";
import type { FormDoc } from "@repo/form-schema";
import {
  useGetApiFormsById,
  useGetApiFormsByIdAnalytics,
  useGetApiFormsByIdSubmissions,
} from "@/lib/api/dashboard/dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatCard } from "@/components/ui/stat-card";
import { blockMeta, TONE_CLASSES } from "./block-library";
import { cn } from "@/lib/utils";
import { useEntitlements } from "@/hooks/use-entitlements";
import { LockedOverlay, LockChip, SkeletonRows, SkeletonChart, useUpgrade } from "@/components/billing/gate";
import { FirstPartialToast } from "@/components/billing/first-partial-toast";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787";

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

interface SubRow {
  id: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  answers: { blockRef: string; blockType: string; value: unknown }[];
  transcript: { role: string; content: string; createdAt: number }[];
  /** Only for forms that required sign-in. */
  respondent: { provider: string; label: string; name: string | null } | null;
}

export function ResultsClient({ formId }: ResultsClientProps) {
  const [tab, setTab] = useState<"submissions" | "summary" | "analytics">("submissions");
  const [statusFilter, setStatusFilter] = useState<"completed" | "abandoned">("completed");
  const [openRow, setOpenRow] = useState<string | null>(null);

  const { data: rawAnalytics } = useGetApiFormsByIdAnalytics(formId as never);
  const { data: rawSubs, isLoading } = useGetApiFormsByIdSubmissions(formId as never);
  const { data: rawForm } = useGetApiFormsById(formId as never);

  const analytics = rawAnalytics as Analytics | undefined;
  const subs = (Array.isArray(rawSubs) ? rawSubs : []) as SubRow[];
  const doc = (rawForm as { workingSchema?: FormDoc } | undefined)?.workingSchema;
  const ent = useEntitlements();
  const upgrade = useUpgrade();

  const canPartials = ent.can("partial_responses");
  const canAnalytics = ent.can("advanced_analytics");

  const columns = useMemo(
    () => (doc?.blocks ?? []).filter((b) => !["welcome", "statement"].includes(b.type)),
    [doc],
  );

  const hasRespondents = subs.some((s) => s.respondent);
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" shape="pill" asChild>
            {/* Goes through the browser so the session cookie rides along. Exporting what
                you finished collecting is free — taking your own data out is never the
                thing behind the paywall. */}
            <a href={`${API_ORIGIN}/api/forms/${formId}/submissions/export`} download>
              <Download className="size-3.5" />
              Export {completedCount > 0 ? `${completedCount} ` : ""}responses
            </a>
          </Button>
          {/* The same slice that is gated everywhere else, offered here by name and count
              rather than hidden. */}
          {!canPartials && partialCount > 0 && (
            <button
              type="button"
              onClick={() => upgrade("export_partials", { count: partialCount, noun: "partial responses" })}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
            >
              + {partialCount} partial
              <LockChip feature="export_partials" context={{ count: partialCount }} />
            </button>
          )}
          {canPartials && partialCount > 0 && (
            <Button variant="ghost" size="sm" shape="pill" asChild>
              <a href={`${API_ORIGIN}/api/forms/${formId}/submissions/export?includePartials=true`} download>
                + {partialCount} partial
              </a>
            </Button>
          )}
        </div>
      </div>

      {tab === "submissions" && (
        <div className="space-y-3">
          <SegmentedControl
            size="sm"
            options={[
              { value: "completed", label: "Completed", badge: completedCount },
              {
                value: "abandoned",
                label: "Partial",
                badge: partialCount,
              },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Submission status"
          />

          {/*
            The gate that pays for everything.
            The tab is visible with its real count, and opening it shows a blurred
            *synthetic* table — never the withheld rows, which the server does not send.
            The number and the sentence are what convert; the blur only says "there is
            something here".
          */}
          {statusFilter === "abandoned" && !canPartials ? (
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
          ) : isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="shimmer h-12 rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={statusFilter === "completed" ? "No responses yet" : "No partial responses"}
              description={
                statusFilter === "completed"
                  ? "Share your form and answers will appear here — with the whole conversation, not just the fields."
                  : "Partial responses are conversations someone started but didn't finish."
              }
            />
          ) : (
            <div className="bg-card overflow-hidden rounded-xl">
              {/* Wide tables scroll inside their own container so the page
                  itself never scrolls sideways. */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-muted-foreground px-3 py-2.5 text-left text-xs font-medium">
                        Submitted
                      </th>
                      {/* Only present when the form asked people to sign in;
                          an always-empty column is worse than no column. */}
                      {hasRespondents && (
                        <th className="text-muted-foreground px-3 py-2.5 text-left text-xs font-medium">
                          Respondent
                        </th>
                      )}
                      {columns.map((b) => {
                        const meta = blockMeta(b.type);
                        return (
                          <th
                            key={b.ref}
                            className="text-muted-foreground max-w-[14rem] px-3 py-2.5 text-left text-xs font-medium"
                          >
                            <span className="flex items-center gap-1.5">
                              {/* lucide, consistent with the rest of the app —
                                  this column header used emoji glyphs. */}
                              <span className={cn("grid size-4 shrink-0 place-items-center rounded", TONE_CLASSES[meta.tone])}>
                                <meta.icon className="size-2.5" strokeWidth={2} />
                              </span>
                              <span className="truncate">{b.title}</span>
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <SubmissionRow
                        key={row.id}
                        row={row}
                        columns={columns}
                        showRespondent={hasRespondents}
                        open={openRow === row.id}
                        onToggle={() => setOpenRow(openRow === row.id ? null : row.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "summary" && <SummaryTab analytics={analytics} entitled={canAnalytics} />}
      {tab === "analytics" && <AnalyticsTab analytics={analytics} entitled={canAnalytics} />}
    </div>
  );
}

/**
 * A submission row, expanding into a transcript-first detail view.
 *
 * DESIGN.md north star #3: "Every response is stored and displayed as a
 * transcript first, fields second." The conversation is the thing a normal
 * form platform structurally cannot show.
 */
function SubmissionRow({
  row,
  columns,
  showRespondent,
  open,
  onToggle,
}: {
  row: SubRow;
  columns: { ref: string; title: string; type: string }[];
  showRespondent: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const byRef = new Map(row.answers.map((a) => [a.blockRef, a.value]));

  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "hover:bg-muted/40 cursor-pointer transition-colors",
          open && "bg-muted/50",
        )}
      >
        <td className="text-muted-foreground px-3 py-2.5 whitespace-nowrap">
          {new Date(row.completedAt ?? row.startedAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </td>
        {showRespondent && (
          <td className="px-3 py-2.5 whitespace-nowrap">
            {row.respondent ? (
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 shrink-0 text-[var(--success)]" />
                <span className="truncate">{row.respondent.label}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </td>
        )}
        {columns.map((b) => (
          <td key={b.ref} className="max-w-[14rem] truncate px-3 py-2.5">
            {formatAnswer(byRef.get(b.ref))}
          </td>
        ))}
      </tr>
      {open && (
        <tr>
          <td colSpan={columns.length + (showRespondent ? 2 : 1)} className="bg-muted/20 p-4">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-2">
                <p className="text-muted-foreground text-micro font-medium tracking-wide uppercase">
                  The conversation
                </p>
                <div className="bg-card max-h-80 space-y-2 overflow-y-auto rounded-xl p-3">
                  {row.transcript.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No transcript recorded.</p>
                  ) : (
                    row.transcript.map((m, i) => (
                      <div
                        key={i}
                        className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                      >
                        <p
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap",
                            m.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted",
                          )}
                        >
                          {m.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-muted-foreground text-micro font-medium tracking-wide uppercase">
                  What we extracted
                </p>
                <dl className="bg-card space-y-2 rounded-xl p-3">
                  {columns.map((b) => (
                    <div key={b.ref}>
                      <dt className="text-muted-foreground text-xs">{b.title}</dt>
                      <dd className="text-sm">{formatAnswer(byRef.get(b.ref)) || "—"}</dd>
                    </div>
                  ))}
                </dl>
                {row.durationMs !== null && (
                  <p className="text-muted-foreground text-micro">
                    Took {Math.round(row.durationMs / 1000)}s
                  </p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
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

function formatAnswer(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map((v) => formatAnswer(v)).join(", ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("filename" in record) return String(record.filename);
    if ("accepted" in record) return record.accepted ? "Accepted" : "Declined";
    return Object.values(record).map(String).join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
