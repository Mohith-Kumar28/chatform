"use client";

import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { blockMeta, TONE_CLASSES } from "./block-library";
import { BarList, ChartCard, ColumnChart, Donut, Hero, Heatmap, Legend, seriesColor } from "./chart-kit";
import { cn } from "@/lib/utils";
import type { Block } from "@repo/form-schema";

/**
 * How people answered each question.
 *
 * The old Summary tab drew one chart — a horizontal bar — for every question
 * type it had counts for, and a three-number strip for everything numeric. So a
 * yes/no question and a 0–10 NPS came out as the same picture, a rating's shape
 * was invisible behind its average, a ranking was a list of every order anyone
 * chose, and free text had nothing at all: the questions people actually write
 * in a conversational form were the ones the summary could not summarise.
 *
 * Each question type now gets the form its answers have. That is not variety
 * for its own sake — the form is chosen by the job the data does. Share of a
 * whole is a ring; comparison between categories is a bar; an ordered scale is
 * a column chart in scale order, because the *shape* of a rating (bimodal? a
 * long tail of ones?) is the thing an average hides; two categorical axes are a
 * heat map; and free text is not a chart at all, it is the most recent answers,
 * read.
 */

export interface Distribution {
  blockRef: string;
  title: string;
  type: string;
  answered: number;
  options: { label: string; count: number }[];
  multi: boolean;
  values: { value: number; count: number }[];
  numericSummary: { avg: number; min: number; max: number; median: number } | null;
  samples: string[];
  ranking: { label: string; avgRank: number }[];
  matrix: { rows: string[]; cols: string[]; counts: number[][] } | null;
  timeline: { label: string; count: number }[];
}

export function ResultsSummary({
  distributions,
  starts,
  blocks,
}: {
  distributions: Distribution[];
  starts: number;
  blocks: Pick<Block, "ref" | "type">[];
}) {
  if (distributions.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Nothing to summarise yet"
        description="Once responses come in, you'll see how people answered each question — the shape of every rating, the split of every choice, and the words people wrote."
      />
    );
  }

  const byRef = new Map(blocks.map((b) => [b.ref, b]));

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {distributions.map((d, i) => (
        <QuestionCard key={d.blockRef} dist={d} index={i + 1} starts={starts} block={byRef.get(d.blockRef)} />
      ))}
    </div>
  );
}

function QuestionCard({
  dist,
  index,
  starts,
  block,
}: {
  dist: Distribution;
  index: number;
  starts: number;
  block?: Pick<Block, "ref" | "type">;
}) {
  const meta = blockMeta(dist.type as Block["type"]);
  const rate = starts > 0 ? Math.round((dist.answered / starts) * 100) : 0;

  return (
    <ChartCard
      className={cn(wide(dist) && "xl:col-span-2")}
      title={
        <span className="flex items-start gap-2">
          <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded", TONE_CLASSES[meta.tone])}>
            <meta.icon className="size-3" strokeWidth={2} />
          </span>
          <span className="min-w-0">
            <span className="text-muted-foreground mr-1.5 text-xs font-normal">{index}</span>
            {dist.title}
          </span>
        </span>
      }
      aside={
        dist.answered > 0 ? (
          <>
            <span className="tabular text-foreground font-medium">{dist.answered}</span> answered · {rate}%
          </>
        ) : null
      }
    >
      {dist.answered === 0 ? (
        <p className="text-muted-foreground text-sm">Nobody has answered this one yet.</p>
      ) : (
        <QuestionChart dist={dist} block={block} />
      )}
    </ChartCard>
  );
}

/** Questions whose answers need the full width of the grid. */
function wide(d: Distribution): boolean {
  if (d.matrix) return true;
  if (d.type === "nps") return true;
  return d.options.length > 8 || d.timeline.length > 10;
}

function QuestionChart({ dist, block }: { dist: Distribution; block?: Pick<Block, "ref" | "type"> }) {
  switch (dist.type) {
    case "nps":
      return <Nps dist={dist} />;

    case "rating":
    case "opinion_scale":
      return <Scale dist={dist} />;

    case "number":
      return <Numbers dist={dist} />;

    case "date":
      return <Timeline dist={dist} />;

    case "ranking":
      return <Ranking dist={dist} />;

    case "matrix":
      return dist.matrix ? (
        <Heatmap rows={dist.matrix.rows} cols={dist.matrix.cols} counts={dist.matrix.counts} />
      ) : (
        <p className="text-muted-foreground text-sm">No answers yet.</p>
      );

    case "multi_select":
      return (
        <div className="space-y-3">
          <BarList items={toBars(dist.options)} total={dist.answered} colorBy="series" />
          <p className="text-muted-foreground text-micro">
            People could pick more than one, so the shares are of the {dist.answered} who answered and add up
            past 100%.
          </p>
        </div>
      );

    case "yes_no":
    case "single_select":
    case "dropdown":
    case "picture_choice":
    case "legal_consent":
      /*
       * A ring only where the whole is the point and the parts are few enough
       * to tell apart at a glance. Past five options the arcs stop being
       * comparable and it becomes a bar chart, which is what a comparison
       * wants anyway.
       */
      return dist.options.length <= 5 ? (
        <Donut
          items={toBars(dist.options)}
          total={dist.answered}
          centerValue={dist.answered}
          centerLabel={dist.answered === 1 ? "answer" : "answers"}
        />
      ) : (
        <BarList items={toBars(dist.options)} total={dist.answered} colorBy="series" />
      );

    default:
      return <Samples dist={dist} block={block} />;
  }
}

/**
 * Net Promoter Score, in the terms it is actually reported in.
 *
 * The average of an NPS is a number nobody quotes: the score is promoters minus
 * detractors, and the split into three groups is the whole method. Those three
 * are a polarity, not three categories, so they take the good/neutral/bad
 * colours rather than three from the categorical ramp.
 */
function Nps({ dist }: { dist: Distribution }) {
  const at = (lo: number, hi: number) =>
    dist.values.filter((v) => v.value >= lo && v.value <= hi).reduce((n, v) => n + v.count, 0);
  const detractors = at(0, 6);
  const passives = at(7, 8);
  const promoters = at(9, 10);
  const total = detractors + passives + promoters;
  const score = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

  const groups = [
    { label: "Detractors (0–6)", value: detractors, color: "var(--destructive)" },
    { label: "Passives (7–8)", value: passives, color: "var(--muted-foreground)" },
    { label: "Promoters (9–10)", value: promoters, color: "var(--success)" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-6">
        <Hero
          value={score > 0 ? `+${score}` : score}
          label="NPS — promoters minus detractors"
          tone={score >= 50 ? "success" : score >= 0 ? "default" : "danger"}
        />
        <div className="flex gap-6">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="tabular text-h3" style={{ color: g.color }}>
                {total > 0 ? Math.round((g.value / total) * 100) : 0}%
              </p>
              <p className="text-muted-foreground text-micro">{g.label.split(" ")[0]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* The split, at a glance: one bar, three segments, 2px of surface
          between them so they read as three marks. */}
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {groups.map((g) => (
          <div
            key={g.label}
            style={{ width: `${total > 0 ? (g.value / total) * 100 : 0}%`, background: g.color }}
            title={`${g.label}: ${g.value}`}
          />
        ))}
      </div>
      <Legend items={groups.map((g) => ({ label: g.label, color: g.color }))} />

      <ColumnChart
        bars={Array.from({ length: 11 }, (_, n) => ({
          label: String(n),
          value: dist.values.find((v) => v.value === n)?.count ?? 0,
          hint: `${n}: ${dist.values.find((v) => v.value === n)?.count ?? 0} answers`,
        }))}
        colorFor={(label) => {
          const n = Number(label);
          return n <= 6 ? "var(--destructive)" : n <= 8 ? "var(--muted-foreground)" : "var(--success)";
        }}
      />
    </div>
  );
}

function Scale({ dist }: { dist: Distribution }) {
  const s = dist.numericSummary;
  const min = Math.min(1, ...dist.values.map((v) => v.value));
  const max = Math.max(5, ...dist.values.map((v) => v.value));
  const bars = Array.from({ length: max - min + 1 }, (_, i) => {
    const n = min + i;
    const value = dist.values.find((v) => v.value === n)?.count ?? 0;
    return { label: String(n), value, hint: `${n}: ${value}` };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-8">
        <Hero value={s?.avg ?? "—"} label="Average" />
        <Hero value={s?.median ?? "—"} label="Median" />
        <Hero value={`${s?.min ?? "—"}–${s?.max ?? "—"}`} label="Range" />
      </div>
      <ColumnChart bars={bars} />
    </div>
  );
}

/**
 * Numbers, as a histogram.
 *
 * Every distinct value would be a chart with one bar per respondent for
 * anything like a budget or a headcount, so the range is split into at most
 * eight equal buckets — the shape survives, the axis stays readable.
 */
function Numbers({ dist }: { dist: Distribution }) {
  const s = dist.numericSummary;
  const distinct = dist.values.length;
  const bars =
    distinct <= 8
      ? dist.values.map((v) => ({ label: fmtNumber(v.value), value: v.count, hint: `${v.value}: ${v.count}` }))
      : bucketize(dist.values, 8);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-8">
        <Hero value={fmtNumber(s?.avg ?? 0)} label="Average" />
        <Hero value={fmtNumber(s?.median ?? 0)} label="Median" />
        <Hero value={`${fmtNumber(s?.min ?? 0)}–${fmtNumber(s?.max ?? 0)}`} label="Range" />
      </div>
      <ColumnChart bars={bars} />
    </div>
  );
}

function Timeline({ dist }: { dist: Distribution }) {
  const recent = dist.timeline.slice(-30);
  return (
    <ColumnChart
      bars={recent.map((t) => ({
        label: shortDate(t.label),
        value: t.count,
        hint: `${t.label}: ${t.count}`,
      }))}
    />
  );
}

function Ranking({ dist }: { dist: Distribution }) {
  const worst = Math.max(...dist.ranking.map((r) => r.avgRank), 1);
  return (
    <div className="space-y-3">
      <BarList
        // Inverted, so the bar everyone reads as "most" is the item ranked
        // first. The number beside it is the real average position.
        items={dist.ranking.map((r, i) => ({
          label: r.label,
          value: Math.round((worst + 1 - r.avgRank) * 10) / 10,
          display: `avg ${r.avgRank}`,
          color: seriesColor(i),
        }))}
      />
      <p className="text-muted-foreground text-micro">
        Ordered by average position — longer is higher-ranked. 1.0 would mean everyone put it first.
      </p>
    </div>
  );
}

/**
 * Free text does not get a chart.
 *
 * A word cloud of "the", "and" and "really" is the classic answer here and it
 * tells you nothing. What someone wants from an open question is to read the
 * answers, so this is the most recent ones, in full, with the rest a click away
 * in the responses table.
 */
function Samples({ dist, block }: { dist: Distribution; block?: Pick<Block, "ref" | "type"> }) {
  if (dist.samples.length === 0) {
    return <p className="text-muted-foreground text-sm">No answers yet.</p>;
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {dist.samples.map((text, i) => (
          <li key={i} className="bg-muted/40 rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap">
            {text}
          </li>
        ))}
      </ul>
      {dist.answered > dist.samples.length && (
        <p className="text-muted-foreground text-micro">
          The {dist.samples.length} most recent of {dist.answered}
          {block ? "" : ""} — the rest are in Submissions.
        </p>
      )}
    </div>
  );
}

/** Server tallies are `{label, count}`; the chart kit speaks `{label, value}`. */
function toBars(options: { label: string; count: number }[]) {
  return options.map((o) => ({ label: o.label, value: o.count }));
}

function bucketize(values: { value: number; count: number }[], bins: number) {
  const min = values[0]!.value;
  const max = values[values.length - 1]!.value;
  const span = max - min || 1;
  const width = span / bins;
  return Array.from({ length: bins }, (_, i) => {
    const lo = min + i * width;
    const hi = i === bins - 1 ? max : lo + width;
    const count = values
      .filter((v) => v.value >= lo && (i === bins - 1 ? v.value <= hi : v.value < hi))
      .reduce((n, v) => n + v.count, 0);
    return { label: fmtNumber(lo), value: count, hint: `${fmtNumber(lo)}–${fmtNumber(hi)}: ${count}` };
  });
}

function fmtNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n * 10) / 10);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
