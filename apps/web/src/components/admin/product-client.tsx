"use client";

import { useState } from "react";
import { useGetApiAdminProduct } from "@/lib/api/admin/admin";
import { BarList, ChartCard, ColumnChart, Donut } from "@/components/charts/chart-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiData } from "@/lib/api/payload";
import { DataTable } from "./data-table";
import { RangePicker, useRange } from "./range-picker";
import { compact, relativeDay } from "./format";
import { Blocks, FileStack, Layers, Send } from "lucide-react";

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
        <div>
          <h1 className="text-h1">Product</h1>
          <p className="text-muted-foreground text-caption mt-0.5">
            What people build, which questions they ask, and which capabilities they switch on.
          </p>
        </div>
        <RangePicker />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Forms built" value={totals.forms.toLocaleString()} icon={FileStack} />
        <StatCard label="Ever published" value={totals.published.toLocaleString()} icon={Send} tone="success" />
        <StatCard label="Questions per form" value={totals.avgBlocks} icon={Blocks} tone="primary" />
        <StatCard label="Block types in use" value={blockTypes.length} icon={Layers} />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Which questions they use"
          subtitle="Every block across every live form, by how often it appears."
        >
          <BarList
            items={blockTypes.slice(0, 16).map((b) => ({ label: humanise(b.key), value: b.value }))}
            // Share of every block placed anywhere, so "12%" means "one block in
            // eight is an email question" rather than "as common as the leader".
            total={blockTypes.reduce((n, b) => n + b.value, 0)}
            colorBy="series"
            emptyLabel="The nightly rollup has not run yet."
          />
        </ChartCard>

        <div className="grid gap-3">
          <ChartCard title="How a form gets made" subtitle="Where the first version came from.">
            <Donut
              items={creation.map((s) => ({ label: SOURCE_LABEL[s.key] ?? humanise(s.key), value: s.value }))}
              total={creationTotal}
              centerValue={creationTotal.toLocaleString()}
              centerLabel="created"
            />
          </ChartCard>

          <ChartCard title="How long they are" subtitle="Questions per form.">
            <ColumnChart bars={(p.formSizes ?? []).map((s) => ({ label: s.key, value: s.value }))} height={100} />
          </ChartCard>
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {/*
          Adoption as a share of accounts, not a raw count — "42 accounts use
          webhooks" means nothing without knowing whether there are 50 accounts
          or 5,000.
        */}
        <ChartCard
          title="What they switch on"
          subtitle={`Share of all ${totals.orgs.toLocaleString()} accounts using each capability.`}
        >
          <BarList
            items={(p.adoption ?? []).map((a) => ({
              label: a.feature,
              value: a.orgs,
              display: `${a.orgs} · ${a.share}%`,
            }))}
            total={totals.orgs}
            colorBy="series"
          />
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

      <ChartCard
        title="Templates"
        subtitle="How often each is picked, and how often the form it produced went on to collect something."
      >
        <DataTable
          rows={p.templates ?? []}
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
            { key: "category", header: "Category", render: (t) => str(t, "category") },
            { key: "blocks", header: "Questions", numeric: true, render: (t) => num(t, "block_count") },
            { key: "usage", header: "Times used", numeric: true, render: (t) => num(t, "usage_count") },
            {
              key: "collecting",
              header: "Went on to collect",
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

      {/*
        The literal answer to "what are the form questions". Aggregated across
        accounts, with the account count beside each — a question thirty
        organizations ask is a pattern worth building for; one that appears once
        is somebody's form.
      */}
      <ChartCard
        title="What they actually ask"
        subtitle="The most common question wording across every live form."
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
            { key: "text", header: "Question", render: (q) => <span className="truncate">{str(q, "sample_text")}</span> },
            { key: "type", header: "Answer type", render: (q) => humanise(str(q, "block_type")) },
            { key: "orgs", header: "Accounts asking", numeric: true, render: (q) => num(q, "org_count") },
            { key: "forms", header: "Forms", numeric: true, render: (q) => num(q, "form_count") },
          ]}
        />
        {p.statsAsOf && (
          <p className="text-muted-foreground text-micro mt-3">Rebuilt {relativeDay(p.statsAsOf)}.</p>
        )}
      </ChartCard>

      <ChartCard title="Where responses come from" subtitle="The surface each response was collected through.">
        <BarList
          items={(p.responseSource ?? []).map((s) => ({
            label: SOURCE_LABEL[s.key] ?? humanise(s.key),
            value: s.value,
            display: compact(s.value),
          }))}
          total={(p.responseSource ?? []).reduce((n, s) => n + s.value, 0)}
          colorBy="series"
          emptyLabel="No responses in this period."
        />
      </ChartCard>
    </div>
  );
}
