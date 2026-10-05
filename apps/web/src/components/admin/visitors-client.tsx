"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { countryFlag, countryName, DEVICE_LABELS } from "@repo/form-schema";
import {
  getGetApiAdminVisitorsByIdQueryKey,
  getGetApiAdminVisitorsQueryKey,
  useGetApiAdminVisitors,
  useGetApiAdminVisitorsById,
} from "@/lib/api/admin/admin";
import type {
  GetApiAdminVisitors200,
  GetApiAdminVisitorsById200,
  GetApiAdminVisitorsParams,
} from "@/lib/api/generated.schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { apiData } from "@/lib/api/payload";
import { RANGE_DAYS, useRange } from "./range-picker";
import { Audience } from "./analytics/audience";
import { AnalyticsFrame, AudiencePills, RangePills, useAudience } from "./analytics/controls";
import { DataTable, type Column } from "./analytics/kit/data-table";
import { fmt, rangeLabel, useMounted } from "./analytics/kit/format";
import { Degraded, PageHeader, PageSkeleton, Panel, Segmented } from "./analytics/kit/ui";
import { AREA_LABEL, duration, useTrafficReport } from "./traffic-client";
import { relativeDay } from "./format";

/**
 * Every browser that has opened a page: when it came, how often, how long it
 * stayed, what brought it, and whose account it is once it has signed in.
 *
 * shipwithmuse's Visitors page: the visitor log, and on its own tab who they
 * are. A row opens the visitor's visits, each with its pages in the order they
 * were opened. Like Traffic, it shows one audience at a time.
 */

type Visitor = GetApiAdminVisitors200["rows"][number];
type Detail = GetApiAdminVisitorsById200;
type Sort = NonNullable<GetApiAdminVisitorsParams["sort"]>;

type Tab = "log" | "audience";

const SORTS = [
  ["recent", "Most recent"],
  ["views", "Most views"],
  ["visits", "Most visits"],
  ["days", "Most days"],
  ["time", "Most time"],
] as const satisfies readonly (readonly [Sort, string])[];

/** A recent moment as a distance; anything older than a day as `relativeDay` writes it. */
function ago(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h ago`;
  return relativeDay(ms);
}

const exact = (ms: number) => new Date(ms).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });

function place(v: { country: string; city: string }): string {
  const where = [v.city, countryName(v.country)].filter(Boolean).join(", ");
  const flag = countryFlag(v.country);
  return flag && where ? `${flag} ${where}` : where;
}

function device(v: { device: string; browser: string; os: string }): string {
  return [DEVICE_LABELS[v.device] ?? v.device, v.browser, v.os].filter(Boolean).join(" · ");
}

/** "Instagram · oct-ugc", or the site that linked, or Direct. */
function cameFrom(v: { source: string; campaign: string; referrer_host: string }): string {
  const source = v.source || v.referrer_host || "Direct";
  return v.campaign ? `${source} · ${v.campaign}` : source;
}

const page = (area: string, path: string) => `${AREA_LABEL[area] ?? area} · ${path}`;
const who = (v: Visitor) => v.user_name || v.user_email || `Visitor ${v.visitor.slice(0, 8)}`;

export function VisitorsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const range = useRange(undefined, "30d");
  const audience = useAudience();
  const tab: Tab = params.get("tab") === "audience" ? "audience" : "log";
  const open = params.get("v");

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // A new search or sort starts from its first page; opening a visitor does not.
    if (!("offset" in patch) && !("v" in patch)) next.delete("offset");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <AnalyticsFrame>
      <PageHeader
        title="Visitors"
        description={`${audience === "site" ? "People on chatform" : "People filling in forms"} · ${rangeLabel(RANGE_DAYS[range])}`}
        actions={
          <>
            <Segmented<Tab>
              label="View"
              value={tab}
              onChange={(t) => setParam({ tab: t === "log" ? "" : t })}
              options={[
                ["log", "Visitor log"],
                ["audience", "Audience"],
              ]}
            />
            <AudiencePills />
            <RangePills fallback="30d" />
          </>
        }
      />
      {tab === "audience" ? <AudienceTab /> : <VisitorLog setParam={setParam} />}

      <Sheet open={!!open} onOpenChange={(next) => !next && setParam({ v: "" })}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
          {open && <VisitorBody id={open} />}
        </SheetContent>
      </Sheet>
    </AnalyticsFrame>
  );
}

/** Who they are, from the same report the Traffic page reads (ninety days at most). */
function AudienceTab() {
  const range = useRange(undefined, "30d");
  const audience = useAudience();
  const { analytics, days, isError, refetch } = useTrafficReport(range, audience);
  if (isError) return <Degraded what="Audience stats" onRetry={refetch} />;
  if (!analytics) return <PageSkeleton />;
  return <Audience a={analytics} days={days} />;
}

function VisitorLog({ setParam }: { setParam: (patch: Record<string, string>) => void }) {
  const params = useSearchParams();
  const range = useRange(undefined, "30d");
  const audience = useAudience();
  const mounted = useMounted();
  const sort: Sort = SORTS.find(([value]) => value === params.get("sort"))?.[0] ?? "recent";
  const q = params.get("q") ?? "";
  const offset = Number(params.get("offset") ?? 0) || 0;
  const [draft, setDraft] = useState(q);

  // Debounced search into the URL, so a filtered view can be refreshed or shared.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft.trim() !== q) setParam({ q: draft.trim() });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const query: GetApiAdminVisitorsParams = { range, audience, sort, offset, ...(q ? { q } : {}) };
  const { data, isPending, isError, refetch } = useGetApiAdminVisitors(query, {
    query: { queryKey: getGetApiAdminVisitorsQueryKey(query), placeholderData: keepPreviousData, staleTime: 30_000 },
  });
  const body = apiData<GetApiAdminVisitors200 | undefined>(data);
  const rows = body?.rows ?? [];
  const total = body?.total ?? 0;
  const per = body?.pageSize ?? 50;
  const page = Math.floor(offset / per) + 1;
  const pages = Math.max(1, Math.ceil(total / per));

  const columns = useMemo<Column<Visitor>[]>(
    () => [
      { id: "rank", header: "#", cell: (_, i) => <span className="num text-xs text-muted-foreground">{offset + i + 1}</span>, className: "w-10" },
      {
        id: "visitor",
        header: "Visitor",
        info: "The account, once this browser has signed in. Until then, its device fingerprint.",
        cell: (v) =>
          v.user_email ? (
            <span className="block max-w-56 truncate">
              <span className="font-medium">{v.user_name || v.user_email}</span>
              {v.user_name && <span className="text-muted-foreground"> · {v.user_email}</span>}
            </span>
          ) : (
            <span className="font-mono text-xs" title={v.visitor}>
              {v.visitor.slice(0, 14)}…
            </span>
          ),
      },
      { id: "views", header: "Views", num: true, info: "Pages opened, counting repeats", cell: (v) => fmt(v.views) },
      { id: "visits", header: "Visits", num: true, info: "Separate sittings, 30 idle minutes apart", cell: (v) => fmt(v.visits) },
      { id: "days", header: "Days", num: true, info: "Distinct days they came", cell: (v) => fmt(v.days) },
      { id: "time", header: "Time", num: true, info: "Time with a page actually on screen", cell: (v) => duration(v.engaged_ms) },
      {
        id: "last",
        header: "Last seen",
        cell: (v) => <span title={exact(v.last_seen)}>{mounted ? ago(v.last_seen) : ""}</span>,
        className: "whitespace-nowrap text-xs",
      },
      {
        id: "first",
        header: "First seen",
        cell: (v) => <span title={exact(v.first_seen)}>{mounted ? relativeDay(v.first_seen) : ""}</span>,
        className: "num whitespace-nowrap text-xs text-muted-foreground",
      },
      {
        id: "location",
        header: "Location",
        info: "Approximate, from Cloudflare's IP geolocation. IP addresses are not stored.",
        cell: (v) => place(v) || <span className="text-muted-foreground">Unknown</span>,
        className: "whitespace-nowrap text-xs",
      },
      { id: "device", header: "Device", cell: (v) => device(v) || <span className="text-muted-foreground">Unknown</span>, className: "whitespace-nowrap text-xs" },
      {
        id: "from",
        header: "Came from",
        info: "What brought them the first time",
        cell: (v) => (
          <span className="block max-w-44 truncate" title={cameFrom(v)}>
            {v.source && v.source !== "Direct" ? cameFrom(v) : <span className="text-muted-foreground">direct</span>}
          </span>
        ),
        className: "text-xs",
      },
      {
        id: "path",
        header: "Landing → last page",
        cell: (v) => (
          <span className="block max-w-72 truncate" title={`${v.landing_path} → ${v.last_path}`}>
            {v.landing_path || "/"}
            {v.last_path && v.last_path !== v.landing_path && <span className="text-muted-foreground"> → {v.last_path}</span>}
          </span>
        ),
        className: "font-mono text-xs",
      },
    ],
    [offset, mounted],
  );

  const go = (p: number) => setParam({ offset: p > 1 ? String((p - 1) * per) : "" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search email, fingerprint, country, city, source…"
            aria-label="Search visitors"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <span className="num text-xs text-muted-foreground">
          {fmt(total)} {q ? (total === 1 ? "visitor matches" : "visitors match") : total === 1 ? "visitor" : "visitors"}
        </span>
        <div className="max-w-full overflow-x-auto sm:ml-auto">
          <Segmented<Sort> label="Sort visitors" value={sort} onChange={(k) => setParam({ sort: k === "recent" ? "" : k })} options={SORTS} />
        </div>
      </div>

      {isError ? (
        <Degraded what="The visitor list" onRetry={refetch} />
      ) : isPending ? (
        <PageSkeleton />
      ) : (
        <Panel flush>
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(v) => v.visitor}
            onRowClick={(v) => setParam({ v: v.visitor })}
            empty={q ? "No visitors match." : "No visitors in this range yet."}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
            <span className="num">{total ? `Rows ${fmt(offset + 1)} to ${fmt(Math.min(offset + rows.length, total))} of ${fmt(total)}` : "No rows"}</span>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => go(page - 1)}>
                  <ChevronLeft className="size-3.5" /> Previous
                </Button>
                <span className="num">
                  {page} / {pages}
                </span>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => go(page + 1)}>
                  Next <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </Panel>
      )}

      <p className="text-xs text-muted-foreground">
        Each row is one visitor: a signed-in account, or a device fingerprint. Click a row for their visits and the pages of each. Views are pages
        opened, counting repeats. Days are distinct days they came. Location is approximate (Cloudflare IP geolocation; IPs are not stored).
      </p>
    </div>
  );
}

function VisitorBody({ id }: { id: string }) {
  const { data, isPending } = useGetApiAdminVisitorsById(id, {
    query: { queryKey: getGetApiAdminVisitorsByIdQueryKey(id), retry: false },
  });
  const detail = apiData<Detail | undefined>(data);

  if (isPending) {
    return (
      <div className="space-y-3 p-4">
        <SheetTitle className="sr-only">Visitor</SheetTitle>
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (!detail?.visitor) {
    return (
      <SheetHeader className="px-4 py-3.5 pr-12">
        <SheetTitle className="text-sm">Visitor not found</SheetTitle>
        <SheetDescription className="text-xs">Visitors are kept for 400 days after their last visit.</SheetDescription>
      </SheetHeader>
    );
  }

  const v = detail.visitor;
  const summary: Array<[string, string]> = [
    ["Account", [v.user_name, v.user_email].filter(Boolean).join(" · ")],
    ["First seen", exact(v.first_seen)],
    ["Last seen", exact(v.last_seen)],
    ["Visits", v.visits.toLocaleString()],
    ["Page views", v.views.toLocaleString()],
    ["Days visited", v.days.toLocaleString()],
    ["Time on site", duration(v.engaged_ms)],
    ["Place", place(v)],
    ["Device", device(v)],
    ["Language", v.language],
    ["First came from", cameFrom(v)],
    ["First page", page(v.landing_area, v.landing_path)],
  ];

  return (
    <>
      <SheetHeader className="border-b px-4 py-3.5 pr-12">
        <SheetTitle className="truncate text-sm">{who(v)}</SheetTitle>
        <SheetDescription className="truncate text-xs">
          Fingerprint <span className="font-mono">{v.visitor}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-8 px-4 py-4">
        <dl className="divide-y">
          {summary
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="flex gap-4 py-2 first:pt-0">
                <dt className="text-muted-foreground text-caption w-32 shrink-0 pt-0.5">{label}</dt>
                <dd className="min-w-0 flex-1 text-sm font-medium break-words">{value}</dd>
              </div>
            ))}
        </dl>

        <section>
          <h3 className="mb-3 text-sm font-medium">Visits</h3>
          <ol className="space-y-5">
            {detail.visits.map((visit) => (
              <li key={visit.visit}>
                <p className="text-sm font-medium">{exact(visit.started_at)}</p>
                <p className="text-muted-foreground text-xs">
                  {[
                    `From ${cameFrom(visit)}`,
                    `${visit.views} ${visit.views === 1 ? "page" : "pages"}`,
                    `left ${clock(visit.last_at)}`,
                    `${duration(visit.engaged_ms)} on screen`,
                  ].join(" · ")}
                </p>
                <ol className="mt-2 space-y-1 border-l pl-3">
                  {detail.views
                    .filter((view) => view.visit === visit.visit)
                    .map((view, i) => (
                      <li key={`${view.at}-${i}`} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate">
                          <span className="text-muted-foreground tabular mr-2">{clock(view.at)}</span>
                          {page(view.area, view.path)}
                        </span>
                        <span className="text-muted-foreground tabular shrink-0">{duration(view.engaged_ms)}</span>
                      </li>
                    ))}
                </ol>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
