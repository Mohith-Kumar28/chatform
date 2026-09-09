"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, Clock, MailCheck, MousePointerClick, Undo2 } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { ChartCard, Empty, Legend } from "@/components/charts/chart-kit";
import { TOOLTIP_STYLE, longDate, shortDate } from "./results-analytics";

/**
 * What the reminders brought back.
 *
 * The hard part of this screen is not drawing it — it is refusing to draw the
 * flattering version. "We mailed 400 people and 60 finished" is a sentence this
 * data can support and it means almost nothing, because some share of those 60
 * were coming back regardless and the mail merely arrived first. So the funnel
 * across the top is stated in the narrowest terms the data actually licenses
 * (a click is a click; a recovery is a completion that *followed* a click), and
 * the lift figure — the only number here that claims a causal effect — is shown
 * only when there is a control arm big enough to carry it.
 *
 * The two charts answer the two questions an author asks in order: *which
 * reminder is doing the work*, so they can cut the ones that are not, and *is
 * this still working*, because a sequence that recovered well in March can be
 * training people to ignore the sender by June.
 */

export interface FollowUpPayload {
  everScheduled: boolean;
  sent: number;
  pending: number;
  clicked: number;
  recovered: number;
  clickRate: number;
  recoveryRate: number;
  byStep: { step: number; sent: number; clicked: number; recovered: number }[];
  daily: { date: string; sent: number; recovered: number }[];
  holdout: { people: number; recovered: number; rate: number } | null;
  liftPoints: number | null;
}

/** Which reminder in the sequence, in words rather than an index. */
const ORDINALS = ["First reminder", "Second reminder", "Third reminder"];

function stepName(step: number): string {
  return ORDINALS[step - 1] ?? `Reminder ${step}`;
}

export function FollowUpAnalytics({ stats }: { stats: FollowUpPayload }) {
  /**
   * Nothing scheduled, ever. Say what would appear here rather than drawing a
   * row of zeros, which reads as a feature that is broken rather than one that
   * is off.
   */
  if (!stats.everScheduled) return null;

  const hasSends = stats.sent > 0;
  const hasActivity = stats.daily.some((d) => d.sent > 0 || d.recovered > 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Follow-ups</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          People who left part-way through, and what the reminders did about it.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Reminders sent"
          value={stats.sent}
          icon={MailCheck}
          {...(stats.pending > 0 ? { hint: `${stats.pending} still queued` } : {})}
        />
        <StatCard
          label="Came back"
          value={stats.clicked}
          hint={hasSends ? `${stats.clickRate}% of reminders` : undefined}
          icon={MousePointerClick}
          tone="primary"
        />
        <StatCard
          label="Finished after a reminder"
          value={stats.recovered}
          hint={hasSends ? `${stats.recoveryRate}% of reminders` : undefined}
          icon={CheckCircle2}
          tone="success"
        />
        {/*
          The fourth card is the honest one, and it is deliberately allowed to
          be empty. Without a holdout there is no number here that means
          "because of the reminders", so it says what it would take to get one
          rather than putting the recovery rate in the slot and letting it be
          read as an effect.
        */}
        <StatCard
          label="Lift over doing nothing"
          value={stats.liftPoints === null ? "—" : `${stats.liftPoints > 0 ? "+" : ""}${stats.liftPoints} pts`}
          hint={
            stats.liftPoints === null
              ? stats.holdout
                ? `${stats.holdout.people} held back so far — needs 20`
                : "Turn on a holdout to measure this"
              : `vs ${stats.holdout?.rate}% who came back with no reminder`
          }
          icon={Undo2}
          tone={stats.liftPoints !== null && stats.liftPoints > 0 ? "success" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Which reminder does the work"
          subtitle="Sent, opened, and finished — for each message in the sequence."
        >
          {!hasSends ? (
            <Empty>Nothing has gone out yet. The first reminders are still queued.</Empty>
          ) : (
            /*
              Grouped horizontal bars rather than a funnel graphic.

              The three measures are nested — every recovery is a click and
              every click is a send — so drawn against a shared baseline the
              bars *are* the funnel, and unlike a funnel shape they stay
              readable when the second step sends a tenth of what the first did.
              Each row carries its own numbers, so nothing depends on estimating
              a length.
            */
            <ol className="space-y-4">
              {stats.byStep.map((s) => {
                const max = Math.max(...stats.byStep.map((x) => x.sent), 1);
                const bar = (v: number) => `${Math.max(v > 0 ? 1.5 : 0, (v / max) * 100)}%`;
                return (
                  <li key={s.step}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-sm">{stepName(s.step)}</span>
                      <span className="tabular text-muted-foreground text-xs">
                        {s.recovered} of {s.sent} finished
                        {s.sent > 0 && (
                          <span className="ml-1.5 opacity-70">
                            ({Math.round((s.recovered / s.sent) * 1000) / 10}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {[
                        { label: "Sent", value: s.sent, color: "var(--muted-foreground)" },
                        { label: "Came back", value: s.clicked, color: "var(--chart-2)" },
                        { label: "Finished", value: s.recovered, color: "var(--chart-1)" },
                      ].map((m) => (
                        <div key={m.label} className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16 shrink-0 text-[0.6875rem]">
                            {m.label}
                          </span>
                          <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                            <div
                              className="h-full rounded-full transition-[width] duration-[var(--duration-standard)]"
                              style={{ width: bar(m.value), background: m.color }}
                            />
                          </div>
                          <span className="tabular text-muted-foreground w-8 shrink-0 text-right text-[0.6875rem]">
                            {m.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </ChartCard>

        <ChartCard
          title="Recovery over time"
          subtitle="Reminders sent, and responses finished because of one."
          aside={
            <Legend
              items={[
                { label: "Sent", color: "var(--muted-foreground)" },
                { label: "Recovered", color: "var(--chart-1)" },
              ]}
            />
          }
        >
          {!hasActivity ? (
            <Empty>No reminders in the last 30 days.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={stats.daily} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  interval="preserveStartEnd"
                  minTickGap={28}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                {/* One axis, because both series count messages-worth of people.
                    A second scale here would draw four recoveries against
                    four hundred sends as though they tracked each other. */}
                <YAxis
                  allowDecimals={false}
                  width={38}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <ReTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  labelFormatter={(v) => longDate(String(v))}
                  formatter={(value, name) => [value as number, String(name)]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Area
                  type="monotone"
                  dataKey="sent"
                  name="Sent"
                  stroke="var(--muted-foreground)"
                  strokeWidth={2}
                  fill="var(--muted)"
                  fillOpacity={0.5}
                  dot={false}
                />
                {/*
                  A line, not a second area. Recovery is the small number by
                  construction and stacking or filling it under the sends would
                  bury it; drawn on top it stays legible at one or two a day,
                  which is what this chart is for.
                */}
                <Line
                  type="monotone"
                  dataKey="recovered"
                  name="Recovered"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/*
        The control arm, spelled out.

        Kept as a sentence rather than a chart: it is two numbers and a caveat,
        and the caveat is the part that matters. An author reading "+8 points"
        should be able to see the arithmetic behind it in the same glance.
      */}
      {stats.holdout && (
        <div className="text-muted-foreground bg-muted/40 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <p>
            {stats.holdout.people} {stats.holdout.people === 1 ? "person was" : "people were"} held
            back on purpose and sent nothing. {stats.holdout.recovered} of them came back anyway
            {stats.holdout.people > 0 && ` (${stats.holdout.rate}%)`}
            {stats.liftPoints === null
              ? " — too few so far to tell that apart from the people who were reminded."
              : ", which is the baseline the lift above is measured against."}
          </p>
        </div>
      )}
    </div>
  );
}
