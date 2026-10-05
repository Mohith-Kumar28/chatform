"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { Search } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiData } from "@/lib/api/payload";
import { RangePicker, useRange } from "./range-picker";
import { AREA_LABEL, duration } from "./traffic-client";
import { relativeDay } from "./format";

/**
 * Every browser that has opened a page: when it came, how often, how long it
 * stayed, what brought it, and whose account it is once it has signed in.
 *
 * The list is the Directory's shape (search, one sort, pages in the URL) so the
 * two read alike. A row opens the visitor's visits, each with its pages in the
 * order they were opened.
 */

type Visitor = GetApiAdminVisitors200["rows"][number];
type Detail = GetApiAdminVisitorsById200;
type Sort = NonNullable<GetApiAdminVisitorsParams["sort"]>;

const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Last seen" },
  { value: "views", label: "Most page views" },
  { value: "visits", label: "Most visits" },
  { value: "days", label: "Most days" },
  { value: "time", label: "Most time" },
];

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

  const sort = (SORTS.find((s) => s.value === params.get("sort"))?.value ?? "recent") satisfies Sort;
  const q = params.get("q") ?? "";
  const offset = Number(params.get("offset") ?? 0) || 0;
  const open = params.get("v");

  // Local so typing does not refetch on every keystroke; the URL moves on submit.
  const [draft, setDraft] = useState(q);

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

  const query: GetApiAdminVisitorsParams = { range, sort, offset, ...(q ? { q } : {}) };
  const { data, isPending } = useGetApiAdminVisitors(query, {
    query: { queryKey: getGetApiAdminVisitorsQueryKey(query), placeholderData: keepPreviousData, staleTime: 30_000 },
  });
  const body = apiData<GetApiAdminVisitors200 | undefined>(data);
  const rows = body?.rows ?? [];
  const total = body?.total ?? 0;
  const size = body?.pageSize ?? 50;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">Visitors</h1>
        <RangePicker />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <form
          className="relative min-w-56 flex-1 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            setParam({ q: draft.trim() });
          }}
        >
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            strokeWidth={2}
            aria-hidden
          />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Email, city, source, page…"
            className="pl-8"
            aria-label="Search visitors"
          />
        </form>
        <p className="text-muted-foreground text-caption tabular">{total.toLocaleString()} visitors</p>
        <Select value={sort} onValueChange={(v) => setParam({ sort: v === "recent" ? "" : v })}>
          <SelectTrigger size="sm" aria-label="Sort visitors" className="ml-auto w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={q ? "No visitors match" : "No visitors in this period"}
          description={q ? "Try a different search, or a longer period." : "Pick a longer period."}
          action={
            q || offset ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft("");
                  setParam({ q: "" });
                }}
              >
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-card shadow-xs overflow-x-auto rounded-xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visitor</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Page views</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Time on site</TableHead>
                <TableHead>First came from</TableHead>
                <TableHead>First page, last page</TableHead>
                <TableHead className="text-right">Last seen</TableHead>
                <TableHead className="text-right">First seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((v) => (
                <TableRow key={v.visitor} className="group cursor-pointer" onClick={() => setParam({ v: v.visitor })}>
                  <TableCell className="max-w-64">
                    <button type="button" className="block w-full min-w-0 text-left">
                      <span className="group-hover:text-primary block truncate font-medium transition-colors duration-[var(--duration-micro)]">
                        {who(v)}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {[place(v), device(v)].filter(Boolean).join(" · ") || "Unknown place and device"}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="tabular text-right">{v.visits.toLocaleString()}</TableCell>
                  <TableCell className="tabular text-right">{v.views.toLocaleString()}</TableCell>
                  <TableCell className="tabular text-right">{v.days.toLocaleString()}</TableCell>
                  <TableCell className="tabular text-right">{duration(v.engaged_ms)}</TableCell>
                  <TableCell className="max-w-44 truncate text-xs">{cameFrom(v)}</TableCell>
                  <TableCell className="max-w-72 text-xs">
                    <span className="block truncate">{page(v.landing_area, v.landing_path)}</span>
                    <span className="text-muted-foreground block truncate">{page(v.last_area, v.last_path)}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap" title={exact(v.last_seen)}>
                    {ago(v.last_seen)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap" title={exact(v.first_seen)}>
                    {relativeDay(v.first_seen)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {total > size && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-caption tabular">
            {offset + 1}&ndash;{Math.min(offset + size, total)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setParam({ offset: String(Math.max(0, offset - size)) })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={offset + size >= total}
              onClick={() => setParam({ offset: String(offset + size) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(next) => !next && setParam({ v: "" })}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
          {open && <VisitorBody id={open} />}
        </SheetContent>
      </Sheet>
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
        <SheetDescription className="truncate font-mono text-xs">{v.visitor}</SheetDescription>
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
