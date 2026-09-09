"use client";

import { useState } from "react";
import { useGetApiAdminProduct } from "@/lib/api/admin/admin";
import { BarList, ChartCard, ColumnChart } from "@/components/charts/chart-kit";
import { PieChart } from "@/components/charts/pie-chart";
import { RadarChart, hasShape } from "@/components/charts/radar-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiData } from "@/lib/api/payload";
import { DataTable } from "./data-table";
import { KpiTile } from "./kpi-tile";
import { RangePicker, useRange } from "./range-picker";
import { compact } from "./format";

/**
 * What people build — the page that answers "what kind of forms are they
 * making".
 *
 * Everything here is aggregate. Block types, form shapes, logic depth, which
 * templates get picked, which capabilities get switched on, and the question
 * wording that recurs across accounts. There is no route from this page into a
 * response, and that is the design: what customers build is a product signal we
 * are entitled to read; what their respondents typed is not.
 */

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));
const num = (r: Row, k: string) => Number(r[k] ?? 0);

interface Product {
  blockTypes: { key: string; value: number }[];
  formSizes: { key: string; value: number }[];
  formLogic: { key: string; value: number }[];
  creationSource: { key: string; value: number }[];
  responseSource: { key: string; value: number }[];
  templates: Row[];
  adoption: { feature: string; orgs: number; share: number }[];
  topQuestions: Row[];
  totals: { orgs: number; forms: number; published: number; avgBlocks: number };
  statsAsOf: number | null;
}

const SOURCE_LABEL: Record<string, string> = {
  builder: "Built by hand",
  ai: "AI generated",
  template: "From a template",
  api: "Via the API",
  system: "System",
  chat: "Direct link",
  embed: "Embedded",
};

/** Every block type the schema defines, so "26 in use" has something to be out of. */
const BLOCK_TYPE_COUNT = 26;

/** `short_text` → `Short text`. The block enum is snake_case; people are not. */
const humanise = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replaceAll("_", " ");

export function ProductClient() {
  const range = useRange();
  const [questionFilter, setQuestionFilter] = useState("");
  const { data, isPending } = useGetApiAdminProduct({ range });

  if (isPending) return <Skeleton className="h-96 rounded-xl" />;
  const p = apiData<Product>(data) ?? ({} as Product);

  const totals = p.totals ?? { orgs: 0, forms: 0, published: 0, avgBlocks: 0 };
  const blockTypes = p.blockTypes ?? [];
  const questions = (p.topQuestions ?? []).filter((q) =>
    questionFilter ? str(q, "sample_text").toLowerCase().includes(questionFilter.toLowerCase()) : true,
  );
  const creation = p.creationSource ?? [];
  const creationTotal = creation.reduce((n, s) => n + s.value, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">Product</h1>
        <RangePicker />
      </div>

      {/* The same tile every other page opens with — these are standing totals,
          so they carry a hint where the others carry a delta. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Forms built" value={totals.forms} hint="live, not deleted" />
        <KpiTile label="Ever published" value={totals.published} hint="reached a real audience" />
        <KpiTile label="Questions per form" value={totals.avgBlocks} hint="on average" />
        <KpiTile label="Block types in use" value={blockTypes.length} hint={`of ${BLOCK_TYPE_COUNT} available`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Which questions they use"
          hint="Counted across every live form, so a block placed twice in one form counts twice."
        >
          <BarList
            /* Twelve, not sixteen: the tail below is a long flat run of ones,
               and four more rows of it made this card half again as tall as the
               column beside it for no information. */
            items={blockTypes.slice(0, 12).map((b) => ({ label: humanise(b.key), value: b.value }))}
            // Share of every block placed anywhere, so "12%" means "one block in
            // eight is an email question" rather than "as common as the leader".
            total={blockTypes.reduce((n, b) => n + b.value, 0)}
            colorBy="series"
            emptyLabel="The nightly rollup has not run yet."
          />
        </ChartCard>

        <div className="grid auto-rows-fr gap-3">
          <ChartCard title="How a form gets made" aside={`${creationTotal.toLocaleString()} created`}>
            <PieChart
              items={creation.map((s) => ({ label: SOURCE_LABEL[s.key] ?? humanise(s.key), value: s.value }))}
              total={creationTotal}
              height={190}
              emptyLabel="No forms created in this period."
            />
          </ChartCard>

          <ChartCard title="How long they are" aside="questions per form" dense>
            <ColumnChart bars={(p.formSizes ?? []).map((s) => ({ label: s.key, value: s.value }))} height={100} />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/*
          A radar once there is a shape to draw, a ranked list until then.

          The radar is the right chart for this question — ten capabilities all
          measured the same way, and a silhouette that is comparable week to
          week where a re-sorted ranking is not. But it needs vertices: with two
          features adopted and eight at zero it draws a spike, and a chart that
          looks broken is worse than the list it replaced. Either way the
          measure is the *share* of accounts, never a raw count — "42 accounts
          use webhooks" means nothing without knowing if there are 50 or 5,000.
        */}
        <ChartCard
          title="What they switch on"
          hint={`Each spoke is the share of all ${totals.orgs.toLocaleString()} accounts using that capability. The outer ring is the highest of them, not 100% — at single-digit adoption a fixed scale draws every capability as the same dot.`}
        >
          {hasShape((p.adoption ?? []).map((a) => ({ value: a.share }))) ? (
            <RadarChart axes={(p.adoption ?? []).map((a) => ({ label: a.feature, value: a.share }))} height={280} />
          ) : (
            <BarList
              // `display` is the count alone: the bar list already prints the
              // share against `total`, and spelling it out here too gave every
              // row two percentages that were the same number rounded twice.
              items={(p.adoption ?? []).map((a) => ({ label: a.feature, value: a.orgs }))}
              total={totals.orgs}
              colorBy="series"
            />
          )}
        </ChartCard>

        <ChartCard title="How much branching" subtitle="Logic rules per form — how many people use conditional flow.">
          <ColumnChart
            bars={(p.formLogic ?? []).map((s) => ({
              label: s.key === "none" ? "No logic" : `${s.key} rules`,
              value: s.value,
            }))}
            height={140}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
      <ChartCard
        className="lg:col-span-3"
        title="Templates"
        aside="ten most used"
        hint="“Went on to collect” counts the forms a template produced that have at least one real response — a template picked often and never collecting is a template that reads well and works badly."
      >
        <DataTable
          // The ten most-used. The full set is every template we ship, and
          // twenty-five rows of mostly zeros made this the tallest card on the
          // page to say that seventeen templates nobody picked are tied.
          rows={(p.templates ?? []).slice(0, 10)}
          empty="No templates have been used yet."
          columns={[
            {
              key: "title",
              header: "Template",
              render: (t) => (
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{str(t, "title")}</span>
                  {num(t, "official") === 1 && (
                    <Badge className="bg-muted text-muted-foreground shrink-0">official</Badge>
                  )}
                </span>
              ),
            },
            { key: "category", header: "Category", width: "9rem", render: (t) => str(t, "category") },
            { key: "blocks", header: "Questions", width: "7rem", numeric: true, render: (t) => num(t, "block_count") },
            { key: "usage", header: "Times used", width: "7.5rem", numeric: true, render: (t) => num(t, "usage_count") },
            {
              key: "collecting",
              header: "Went on to collect",
              width: "10rem",
              numeric: true,
              render: (t) =>
                num(t, "usage_count") > 0 ? (
                  `${num(t, "collecting")}`
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            },
          ]}
        />
      </ChartCard>

        {/* Two or three rows; it was a full-width card drawing metre-long bars. */}
        <ChartCard className="lg:col-span-2" title="Where responses come from">
          <PieChart
            items={(p.responseSource ?? []).map((s) => ({
              label: SOURCE_LABEL[s.key] ?? humanise(s.key),
              value: s.value,
              display: compact(s.value),
            }))}
            total={(p.responseSource ?? []).reduce((n, s) => n + s.value, 0)}
            height={220}
            emptyLabel="No responses in this period."
          />
        </ChartCard>
      </div>

      {/*
        The literal answer to "what are the form questions". Aggregated across
        accounts, with the account count beside each — a question thirty
        organizations ask is a pattern worth building for; one that appears once
        is somebody's form.
      */}
      <ChartCard
        title="What they actually ask"
        aside={
          <Input
            value={questionFilter}
            onChange={(e) => setQuestionFilter(e.target.value)}
            placeholder="Filter questions…"
            className="h-8 w-48"
            aria-label="Filter questions"
          />
        }
      >
        <DataTable
          rows={questions}
          empty={
            p.statsAsOf
              ? "No questions match that filter."
              : "The nightly form rollup has not completed yet — this fills in on its first pass."
          }
          columns={[
            // Only the question is given room to grow; the three columns after
            // it are a word and two integers and were holding the table's whole
            // width hostage.
            { key: "text", header: "Question", render: (q) => str(q, "sample_text") },
            { key: "type", header: "Answer type", width: "10rem", render: (q) => humanise(str(q, "block_type")) },
            { key: "orgs", header: "Accounts asking", width: "9rem", numeric: true, render: (q) => num(q, "org_count") },
            { key: "forms", header: "Forms", width: "7rem", numeric: true, render: (q) => num(q, "form_count") },
          ]}
        />
      </ChartCard>
    </div>
  );
}
