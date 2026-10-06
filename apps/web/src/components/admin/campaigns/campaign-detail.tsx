"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { getGetApiAdminCampaignsByIdQueryKey, patchApiAdminCampaignsById, useGetApiAdminCampaignsById } from "@/lib/api/admin/admin";
import type {
  GetApiAdminCampaignsById200,
  GetApiAdminCampaignsById200LinksItem,
  GetApiAdminCampaignsById200PeopleItem,
} from "@/lib/api/generated.schemas";
import { apiData } from "@/lib/api/payload";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RANGE_DAYS, useRange } from "../range-picker";
import { TRAFFIC_RANGES } from "../traffic-client";
import { Funnel } from "../analytics/charts/grids";
import { TrendChart } from "../analytics/charts/trend";
import { AnalyticsFrame, RangePills } from "../analytics/controls";
import { DataTable, type Column } from "../analytics/kit/data-table";
import { ago, countryName, flag, fmt, rangeLabel, useMounted } from "../analytics/kit/format";
import { Degraded, EmptyState, PageHeader, PageSkeleton, Panel, RankedList, StatStrip, type StatProps } from "../analytics/kit/ui";
import { CampaignDialog, useRefreshCampaigns } from "./campaign-dialog";
import { LinkDialog } from "./link-dialog";
import { LinkRowActions } from "./link-row-actions";
import { STATUS_LABEL, cash, rate, revenueLabel, shortUrl } from "./presets";

/**
 * One campaign: what it brought over time, how far those accounts got, each of
 * its links with numbers of its own, and the people who signed up.
 *
 * A link's row is the short address to post. Whoever follows it lands on the
 * site with the link's id in the address, which is what lets two links of the
 * same campaign be told apart here.
 */

type Detail = GetApiAdminCampaignsById200;
type LinkRow = GetApiAdminCampaignsById200LinksItem;
type Person = GetApiAdminCampaignsById200PeopleItem;

const SERIES = [
  { key: "visitors", label: "Visitors", color: "var(--chart-1)" },
  { key: "signups", label: "Sign-ups", color: "var(--chart-2)" },
];

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function CampaignDetail({ id }: { id: string }) {
  const range = useRange(TRAFFIC_RANGES, "30d") as (typeof TRAFFIC_RANGES)[number];
  const params = { range } as const;
  const { data, isPending, isError, refetch } = useGetApiAdminCampaignsById(id, params, {
    query: { queryKey: getGetApiAdminCampaignsByIdQueryKey(id, params), placeholderData: keepPreviousData, staleTime: 30_000, retry: false },
  });
  const body = apiData<Detail | undefined>(data);

  return (
    <AnalyticsFrame>
      <Link href={`/admin/campaigns?range=${range}`} className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Campaigns
      </Link>
      {isError ? (
        <Degraded what="This campaign" onRetry={refetch} />
      ) : isPending || !body ? (
        <PageSkeleton />
      ) : (
        <Body d={body} range={range} />
      )}
    </AnalyticsFrame>
  );
}

function Body({ d, range }: { d: Detail; range: (typeof TRAFFIC_RANGES)[number] }) {
  const router = useRouter();
  const refresh = useRefreshCampaigns();
  const mounted = useMounted();
  const days = RANGE_DAYS[range];
  const c = d.campaign;
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState<{ link?: LinkRow } | null>(null);
  const [archivedShown, setArchivedShown] = useState(false);

  async function setStatus(status: string) {
    try {
      await patchApiAdminCampaignsById(c.id, { status: status as "active" | "paused" | "archived" });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the campaign");
    }
  }

  const t = d.totals;
  const stats: StatProps[] = [
    {
      label: "Visitors",
      value: fmt(t.visitors.value),
      delta: { now: t.visitors.value, prev: t.visitors.previous },
      to: "/admin/visitors",
      search: { campaign: c.key },
      info: "People who landed on chatform from this campaign. Each person counts once.",
    },
    { label: "Sign-ups", value: fmt(t.signups.value), delta: { now: t.signups.value, prev: t.signups.previous } },
    {
      label: "Sign-up rate",
      value: rate(t.signups.value, t.visitors.value),
      delta: t.visitors.value && t.visitors.previous ? { now: t.signups.value / t.visitors.value, prev: t.signups.previous / t.visitors.previous } : undefined,
    },
    { label: "Paid", value: fmt(t.paid.value), delta: { now: t.paid.value, prev: t.paid.previous }, info: "Accounts that signed up in this period and are paying now." },
    { label: "Revenue", value: revenueLabel(t.revenue), info: "Everything paid so far by accounts that signed up in this period." },
    ...(c.spendCents != null
      ? [
          {
            label: "Cost per sign-up",
            value: d.costPerSignupCents != null ? cash(d.costPerSignupCents, c.spendCurrency) : "–",
            sub: `${cash(c.spendCents, c.spendCurrency)} spent`,
            info: "The campaign's spend divided by every sign-up it has ever brought, not only this period's.",
          } satisfies StatProps,
        ]
      : []),
  ];

  const trend = useMemo(() => d.series.map((s) => ({ key: utcDay(s.at), visitors: s.visitors, signups: s.signups })), [d.series]);
  const shownLinks = d.links.filter((l) => archivedShown || !l.archived);
  const archived = d.links.filter((l) => l.archived).length;
  const labelOf = new Map(d.links.map((l) => [l.id, l.label]));
  const channelOf = new Map(d.channels.map((ch) => [ch.key, ch.label]));
  const stageOf = new Map(d.stages.map((s) => [s.key, s.label]));
  const dates = [c.startsAt, c.endsAt].some((x) => x != null)
    ? `${c.startsAt != null ? new Date(c.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "…"} to ${
        c.endsAt != null ? new Date(c.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "…"
      }`
    : null;

  const linkColumns: Column<LinkRow>[] = [
    {
      id: "label",
      header: "Link",
      sort: (r) => r.label.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {channelOf.get(r.channel) ?? r.channel} · {r.destination}
            {r.archived && " · Archived"}
          </p>
        </div>
      ),
    },
    {
      id: "short",
      header: "Short link",
      cell: (r) => (
        <span className="inline-flex items-center gap-1">
          <code className="text-xs">{shortUrl(r.code).replace(/^https?:\/\//, "")}</code>
          <CopyButton value={shortUrl(r.code)} toastMessage="Link copied" size="icon-xs" />
        </span>
      ),
    },
    { id: "visitors", header: "Visitors", num: true, sort: (r) => r.visitors, cell: (r) => fmt(r.visitors) },
    { id: "signups", header: "Sign-ups", num: true, sort: (r) => r.signups, cell: (r) => fmt(r.signups) },
    { id: "rate", header: "Rate", num: true, sort: (r) => (r.visitors ? r.signups / r.visitors : 0), cell: (r) => rate(r.signups, r.visitors) },
    { id: "paid", header: "Paid", num: true, sort: (r) => r.paid, cell: (r) => fmt(r.paid) },
    {
      id: "last",
      header: "Last visitor",
      num: true,
      sort: (r) => r.lastVisitAt ?? 0,
      cell: (r) => (r.lastVisitAt && mounted ? ago(r.lastVisitAt) : "–"),
    },
    { id: "actions", header: "", num: true, cell: (r) => <LinkRowActions link={r} onEdit={() => setLinking({ link: r })} /> },
  ];

  const peopleColumns: Column<Person>[] = [
    {
      id: "who",
      header: "Person",
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.name || p.email}</p>
          {p.name && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
        </div>
      ),
    },
    { id: "link", header: "Link", cell: (p) => (p.linkId && labelOf.get(p.linkId)) || <span className="text-muted-foreground">–</span> },
    { id: "at", header: "Signed up", sort: (p) => p.at, cell: (p) => (mounted ? ago(p.at) : "") },
    { id: "stage", header: "Got as far as", cell: (p) => stageOf.get(p.stage) ?? p.stage },
    { id: "plan", header: "Plan", cell: (p) => p.plan ?? <span className="text-muted-foreground">Free</span> },
  ];

  return (
    <>
      <PageHeader
        title={c.name}
        description={[rangeLabel(days), dates].filter(Boolean).join(" · ")}
        actions={
          <>
            <Select value={c.status} onValueChange={setStatus}>
              <SelectTrigger size="sm" aria-label="Status" className="h-[30px] bg-background px-2.5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {Object.entries(STATUS_LABEL).map(([value, text]) => (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RangePills ranges={TRAFFIC_RANGES} fallback="30d" />
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/traffic?campaign=${encodeURIComponent(c.key)}&range=${range}`}>
                <BarChart3 /> View in Traffic
              </Link>
            </Button>
          </>
        }
      >
        {c.notes && <p className="mt-1.5 max-w-2xl text-[13px] whitespace-pre-line text-muted-foreground">{c.notes}</p>}
      </PageHeader>

      <div className="space-y-4">
        <StatStrip items={stats} />

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2" title="Visitors and sign-ups" description="Per day">
            <TrendChart data={trend} series={SERIES} kind="line" range={Math.max(days, 2)} height={240} empty="Nobody has come from this campaign in this period." />
          </Panel>
          <Panel title="How far sign-ups got" info="Accounts that signed up from this campaign in the period, and what they have done since.">
            <Funnel steps={d.stages.map((s) => ({ label: s.label, n: s.value }))} />
          </Panel>
        </div>

        <Panel
          title="Links"
          flush
          actions={
            <>
              {archived > 0 && (
                <button type="button" onClick={() => setArchivedShown((s) => !s)} className="text-xs text-muted-foreground hover:text-foreground">
                  {archivedShown ? "Hide archived" : `Show archived (${archived})`}
                </button>
              )}
              <Button size="sm" onClick={() => setLinking({})}>
                <Plus /> New link
              </Button>
            </>
          }
        >
          {d.links.length === 0 ? (
            <EmptyState>
              <p className="mb-3">Make a link for each place this campaign is posted.</p>
              <Button size="sm" onClick={() => setLinking({})}>
                <Plus /> New link
              </Button>
            </EmptyState>
          ) : (
            <DataTable columns={linkColumns} data={shownLinks} getRowId={(r) => r.id} rowClassName={(r) => (r.archived ? "opacity-60" : undefined)} />
          )}
          {(d.unlinked.visitors > 0 || d.unlinked.signups > 0) && (
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
              {fmt(d.unlinked.visitors)} more {d.unlinked.visitors === 1 ? "visitor" : "visitors"} and {fmt(d.unlinked.signups)}{" "}
              {d.unlinked.signups === 1 ? "sign-up" : "sign-ups"} came from addresses with this campaign&rsquo;s name and no link from here.
            </p>
          )}
        </Panel>

        <Panel title="People who signed up" flush>
          <DataTable
            columns={peopleColumns}
            data={d.people}
            getRowId={(p) => p.userId}
            onRowClick={(p) => p.orgId && router.push(`/admin/accounts/${p.orgId}`)}
            empty="Nobody has signed up from this campaign in this period."
            maxHeight={420}
          />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Sources">
            <RankedList rows={d.breakdowns.sources.map((r) => ({ key: r.key || "Unknown", n: r.visitors }))} valueLabel="Visitors" empty="No visitors yet." limit={6} />
          </Panel>
          <Panel title="Countries">
            <RankedList
              rows={d.breakdowns.countries.map((r) => ({ key: r.key, n: r.visitors, label: countryName(r.key), icon: <span>{flag(r.key)}</span> }))}
              valueLabel="Visitors"
              empty="No visitors yet."
              limit={6}
            />
          </Panel>
          <Panel title="Landing pages">
            <RankedList rows={d.breakdowns.landings.map((r) => ({ key: r.key || "/", n: r.visitors }))} valueLabel="Visitors" empty="No visitors yet." limit={6} />
          </Panel>
        </div>
      </div>

      <CampaignDialog open={editing} onOpenChange={setEditing} campaign={c} />
      <LinkDialog open={!!linking} onOpenChange={(next) => !next && setLinking(null)} campaignId={c.id} channels={d.channels} link={linking?.link} />
    </>
  );
}
