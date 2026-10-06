"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { Megaphone, Plus, Search } from "lucide-react";
import { getGetApiAdminCampaignsQueryKey, useGetApiAdminCampaigns } from "@/lib/api/admin/admin";
import type {
  GetApiAdminCampaigns200,
  GetApiAdminCampaigns200CampaignsItem,
  GetApiAdminCampaigns200InsightsItem,
  GetApiAdminCampaigns200UntrackedItem,
} from "@/lib/api/generated.schemas";
import { apiData } from "@/lib/api/payload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RANGE_DAYS, useRange } from "../range-picker";
import { TRAFFIC_RANGES } from "../traffic-client";
import { Spark } from "../analytics/charts/spark";
import { AnalyticsFrame, RangePills } from "../analytics/controls";
import { DataTable, type Column } from "../analytics/kit/data-table";
import { fmt, rangeLabel } from "../analytics/kit/format";
import { Degraded, EmptyState, PageHeader, PageSkeleton, Panel, Segmented, StatStrip, StatusPill, type StatProps } from "../analytics/kit/ui";
import { CampaignDialog } from "./campaign-dialog";
import { STATUS_LABEL, cash, rate, revenueLabel } from "./presets";

/**
 * Every campaign and what it brought.
 *
 * A campaign is one marketing effort and holds the links made for it. This page
 * is the comparison: who brought visitors, who brought sign-ups, who brought
 * money. Opening a row is where the links are made and where the people are.
 *
 * Visitors are people who landed on chatform from a campaign's link, not clicks.
 * Sign-ups are the accounts made in the period; paid and revenue are what those
 * accounts have done since.
 */

type Row = GetApiAdminCampaigns200CampaignsItem;
type Show = "live" | "archived" | "all";

function sentence(i: GetApiAdminCampaigns200InsightsItem): string {
  const n = (key: string) => Number(i.values[key] ?? 0);
  switch (i.kind) {
    case "best_signups":
      return `${i.name} brought the most sign-ups: ${fmt(n("signups"))} from ${fmt(n("visitors"))} visitors.`;
    case "best_rate":
      return `${i.name} converts best: ${rate(n("signups"), n("visitors"))} of its visitors signed up.`;
    case "no_signups":
      return `${i.name} had ${fmt(n("visitors"))} visitors and no sign-ups.`;
    case "cost_per_signup":
      return `${i.name} has the lowest cost per sign-up: ${cash(n("cents"), String(i.values.currency ?? "USD"))}.`;
    case "quiet_links":
      return `${fmt(n("links"))} ${n("links") === 1 ? "link has" : "links have"} had no visitors in ${n("days")} days.`;
    default:
      return "";
  }
}

export function CampaignsList() {
  const router = useRouter();
  const range = useRange(TRAFFIC_RANGES, "30d") as (typeof TRAFFIC_RANGES)[number];
  const params = { range } as const;
  const { data, isPending, isError, refetch } = useGetApiAdminCampaigns(params, {
    query: { queryKey: getGetApiAdminCampaignsQueryKey(params), placeholderData: keepPreviousData, staleTime: 30_000 },
  });
  const body = apiData<GetApiAdminCampaigns200 | undefined>(data);
  const [creating, setCreating] = useState<{ adopt?: string } | null>(null);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("live");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (body?.campaigns ?? [])
      .filter((c) => (show === "all" ? true : show === "archived" ? c.status === "archived" : c.status !== "archived"))
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.key.includes(needle) || c.channels.some((x) => x.toLowerCase().includes(needle)))
      .sort((a, b) => b.visitors.value - a.visitors.value || b.createdAt - a.createdAt);
  }, [body?.campaigns, q, show]);

  const open = (id: string) => router.push(`/admin/campaigns/${id}?range=${range}`);

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: "Campaign",
      sort: (r) => r.name.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/admin/campaigns/${r.id}?range=${range}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
            {r.name}
          </Link>
          {r.channels.length > 0 && <p className="truncate text-xs text-muted-foreground">{r.channels.join(", ")}</p>}
        </div>
      ),
    },
    { id: "status", header: "Status", cell: (r) => <StatusPill status={r.status} label={STATUS_LABEL[r.status]} /> },
    { id: "links", header: "Links", num: true, sort: (r) => r.links, cell: (r) => fmt(r.links) },
    { id: "visitors", header: "Visitors", num: true, sort: (r) => r.visitors.value, cell: (r) => fmt(r.visitors.value) },
    { id: "signups", header: "Sign-ups", num: true, sort: (r) => r.signups.value, cell: (r) => fmt(r.signups.value) },
    {
      id: "rate",
      header: "Rate",
      num: true,
      info: "Sign-ups for every 100 visitors.",
      sort: (r) => (r.visitors.value ? r.signups.value / r.visitors.value : 0),
      cell: (r) => rate(r.signups.value, r.visitors.value),
    },
    { id: "paid", header: "Paid", num: true, sort: (r) => r.paid, cell: (r) => fmt(r.paid) },
    {
      id: "revenue",
      header: "Revenue",
      num: true,
      sort: (r) => r.revenue.reduce((n, m) => n + m.cents, 0),
      cell: (r) => revenueLabel(r.revenue),
    },
    {
      id: "cost",
      header: "Cost per sign-up",
      num: true,
      info: "The campaign's spend divided by every sign-up it has ever brought.",
      sort: (r) => r.costPerSignupCents ?? Number.MAX_SAFE_INTEGER,
      cell: (r) => (r.costPerSignupCents != null ? cash(r.costPerSignupCents, r.spendCurrency) : "–"),
    },
    {
      id: "trend",
      header: "Visitors a day",
      headClassName: "w-28",
      cell: (r) => (r.series.some((v) => v > 0) ? <div className="w-24"><Spark values={r.series} height={22} /></div> : null),
    },
  ];

  const t = body?.totals;
  const stats: StatProps[] = t
    ? [
        { label: "Visitors", value: fmt(t.visitors.value), delta: { now: t.visitors.value, prev: t.visitors.previous }, info: "People who landed on chatform from a campaign link. Each person counts once, however many pages they opened." },
        { label: "Sign-ups", value: fmt(t.signups.value), delta: { now: t.signups.value, prev: t.signups.previous } },
        {
          label: "Sign-up rate",
          value: rate(t.signups.value, t.visitors.value),
          delta: t.visitors.value && t.visitors.previous ? { now: t.signups.value / t.visitors.value, prev: t.signups.previous / t.visitors.previous } : undefined,
        },
        { label: "Paid", value: fmt(t.paid.value), delta: { now: t.paid.value, prev: t.paid.previous }, info: "Accounts that signed up in this period and are paying now." },
        {
          label: "Revenue",
          value: revenueLabel(t.revenue),
          delta: t.revenue.length === 1 ? { now: t.revenue[0]!.cents, prev: t.revenue[0]!.previous } : undefined,
          info: "Everything paid so far by accounts that signed up in this period. Each account counts for the campaign its first member came from.",
        },
      ]
    : [];

  return (
    <AnalyticsFrame>
      <PageHeader
        title="Campaigns"
        description={rangeLabel(RANGE_DAYS[range])}
        actions={
          <>
            <RangePills ranges={TRAFFIC_RANGES} fallback="30d" />
            <Button size="sm" onClick={() => setCreating({})}>
              <Plus /> New campaign
            </Button>
          </>
        }
      />
      {isError ? (
        <Degraded what="Campaigns" onRetry={refetch} />
      ) : isPending || !body ? (
        <PageSkeleton />
      ) : body.campaigns.length === 0 && body.untracked.length === 0 ? (
        <Panel>
          <EmptyState icon={Megaphone}>
            <p className="mb-3">No campaigns yet.</p>
            <Button size="sm" onClick={() => setCreating({})}>
              <Plus /> New campaign
            </Button>
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-4">
          <StatStrip items={stats} />

          {body.insights.length > 0 && (
            <Panel title="Worth knowing">
              <ul className="divide-y">
                {body.insights.map((i) => (
                  <li key={`${i.kind}:${i.campaignId ?? ""}`} className="py-2 text-[13px] first:pt-0 last:pb-0">
                    {i.campaignId ? (
                      <Link href={`/admin/campaigns/${i.campaignId}?range=${range}`} className="hover:underline">
                        {sentence(i)}
                      </Link>
                    ) : (
                      sentence(i)
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title="All campaigns"
            flush
            actions={
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="Search campaigns" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-7 w-44 pl-7 text-xs" />
                </div>
                <Segmented<Show>
                  label="Show"
                  value={show}
                  onChange={setShow}
                  options={[
                    ["live", "Current"],
                    ["archived", "Archived"],
                    ["all", "All"],
                  ]}
                />
              </>
            }
          >
            <DataTable columns={columns} data={rows} getRowId={(r) => r.id} onRowClick={(r) => open(r.id)} empty="No campaigns match." />
          </Panel>

          {body.untracked.length > 0 && <Untracked rows={body.untracked} onSave={(key) => setCreating({ adopt: key })} />}
        </div>
      )}

      <CampaignDialog
        open={!!creating}
        onOpenChange={(next) => !next && setCreating(null)}
        adopt={creating?.adopt}
        onSaved={(c) => open(c.id)}
      />
    </AnalyticsFrame>
  );
}

/** Campaign names that arrived on links nobody made here: hand-typed tags, somebody else's link. */
function Untracked({ rows, onSave }: { rows: GetApiAdminCampaigns200UntrackedItem[]; onSave: (key: string) => void }) {
  const columns: Column<GetApiAdminCampaigns200UntrackedItem>[] = [
    { id: "key", header: "Name on the link", cell: (r) => <span className="font-medium">{r.key}</span> },
    { id: "visitors", header: "Visitors", num: true, sort: (r) => r.visitors, cell: (r) => fmt(r.visitors) },
    { id: "signups", header: "Sign-ups", num: true, sort: (r) => r.signups, cell: (r) => fmt(r.signups) },
    {
      id: "save",
      header: "",
      num: true,
      cell: (r) => (
        <Button variant="outline" size="xs" onClick={() => onSave(r.key)}>
          Save as campaign
        </Button>
      ),
    },
  ];
  return (
    <Panel title="Not saved yet" info="Campaign names seen on links that were not made here. Saving one keeps everything it has already brought." flush>
      <DataTable columns={columns} data={rows} getRowId={(r) => r.key} />
    </Panel>
  );
}
