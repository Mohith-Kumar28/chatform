"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Camera } from "lucide-react";
import { feedbackTopicLabel } from "@repo/form-schema";
import { useGetApiAdminFeedbackReports } from "@/lib/api/admin/admin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { apiData } from "@/lib/api/payload";
import { relativeTime } from "@/components/forms/form-card";
import { DataTable } from "./data-table";
import { FACES, faceFor } from "./feedback-faces";
import { FeedbackReportDialog } from "./feedback-report-dialog";

/**
 * The queue — every report, newest unresolved first.
 *
 * The filters describe the work, not the calendar: which status, which face,
 * whether they said anything, which form or account. The date range above the
 * charts does not narrow this list, and the bar says "All time" so that is a
 * visible choice rather than a surprise — an unresolved report from forty days
 * ago is still unresolved, and a list that empties itself when somebody clicks
 * "7 days" is a list that loses things.
 */

export interface InboxReport {
  id: string;
  rating: number;
  message: string | null;
  createdAt: number;
  status: string;
  statusAt: number | null;
  statusBy: string | null;
  internalNote: string | null;
  topic: string | null;
  sentiment: number | null;
  source: string;
  userAgent: string | null;
  sessionId: string | null;
  hasSnapshot: boolean;
  formId: string | null;
  formTitle: string | null;
  formSlug: string | null;
  organizationId: string | null;
  organizationName: string | null;
  respondentId: string | null;
  respondentLabel: string | null;
}

interface ReportsBody {
  reports: InboxReport[];
  total: number;
  counts: { new: number; resolved: number; spam: number };
}

const STATUSES = ["new", "resolved", "spam", "all"] as const;
type StatusFilter = (typeof STATUSES)[number];

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "worst", label: "Worst first" },
] as const;

const PAGE = 50;

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  new: { label: "new", className: "bg-muted text-muted-foreground" },
  resolved: { label: "resolved", className: "bg-[var(--success-soft)] text-[var(--success)]" },
  spam: { label: "spam", className: "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]" },
};

export function FeedbackInbox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const status = (STATUSES as readonly string[]).includes(params.get("status") ?? "")
    ? (params.get("status") as StatusFilter)
    : "new";
  const rating = Number(params.get("rating") ?? 0) || undefined;
  const noted = params.get("noted") === "yes" ? "yes" : "any";
  const sort = (params.get("sort") ?? "newest") as "newest";
  const q = params.get("q") ?? "";
  const formId = params.get("formId") ?? undefined;
  const orgId = params.get("orgId") ?? undefined;
  const topic = params.get("topic") ?? undefined;
  const respondentId = params.get("respondentId") ?? undefined;
  const offset = Number(params.get("offset") ?? 0);
  const [draft, setDraft] = useState(q);

  const setParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // A new filter is a new list; page three of the old one means nothing.
    if (!("offset" in patch)) next.delete("offset");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const { data, isPending, refetch } = useGetApiAdminFeedbackReports({
    status,
    noted,
    sort,
    limit: PAGE,
    offset,
    ...(rating ? { rating } : {}),
    ...(q ? { q } : {}),
    ...(formId ? { formId } : {}),
    ...(orgId ? { orgId } : {}),
    ...(topic ? { topic } : {}),
    ...(respondentId ? { respondentId } : {}),
  });
  const body = apiData<ReportsBody>(data);
  const reports = useMemo(() => body?.reports ?? [], [body?.reports]);
  const total = body?.total ?? 0;
  const counts = body?.counts ?? { new: 0, resolved: 0, spam: 0 };

  /*
    The open report lives in the URL, so a refresh — or a link out of the
    founders' mail — lands on it. Written with `replaceState` rather than the
    router, as the responses dialog does, so opening one does not re-render the
    whole page underneath it.
  */
  const [openId, setOpenId] = useState<string | null>(() => params.get("report"));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set("report", openId);
    else url.searchParams.delete("report");
    window.history.replaceState(null, "", url);
  }, [openId]);

  // A narrowed view names what it is narrowed to, with a way out.
  const scope = [
    formId && { key: "formId", label: `Form: ${reports[0]?.formId === formId ? (reports[0]?.formTitle ?? formId) : formId}` },
    orgId && { key: "orgId", label: `Account: ${reports[0]?.organizationId === orgId ? (reports[0]?.organizationName ?? orgId) : orgId}` },
    topic && { key: "topic", label: `Topic: ${feedbackTopicLabel(topic)}` },
    respondentId && { key: "respondentId", label: `Respondent: ${respondentId}` },
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3 pt-2">
        <h2 className="text-h3">Inbox</h2>
        <p className="text-muted-foreground text-caption">All time — the period above narrows the charts, not this list.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          size="sm"
          value={status}
          onChange={(next) => setParam({ status: next === "new" ? undefined : next })}
          options={[
            { value: "new", label: "New", badge: counts.new },
            { value: "resolved", label: "Resolved", badge: counts.resolved },
            { value: "spam", label: "Spam", badge: counts.spam },
            { value: "all", label: "All" },
          ]}
          ariaLabel="Status"
        />

        <form
          className="relative min-w-56 flex-1 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            setParam({ q: draft.trim() || undefined });
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
            placeholder="Form, account or words…"
            className="pl-8"
            aria-label="Search reports"
          />
        </form>

        {/* The five faces as filters, in their own colours — the scale reads before the words do. */}
        <div className="flex items-center gap-0.5" role="group" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((r) => {
            const face = FACES[r as 1];
            const on = rating === r;
            return (
              <Button
                key={r}
                size="icon-sm"
                variant={on ? "secondary" : "ghost"}
                aria-label={face.label}
                aria-pressed={on}
                title={face.label}
                onClick={() => setParam({ rating: on ? undefined : String(r) })}
              >
                <face.Icon className="size-4" style={{ color: face.color }} />
              </Button>
            );
          })}
        </div>

        <Button
          size="sm"
          variant={noted === "yes" ? "secondary" : "ghost"}
          aria-pressed={noted === "yes"}
          onClick={() => setParam({ noted: noted === "yes" ? undefined : "yes" })}
        >
          With a note
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground text-caption mr-1">Sort</span>
          {SORTS.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={sort === s.value ? "secondary" : "ghost"}
              onClick={() => setParam({ sort: s.value === "newest" ? undefined : s.value })}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {scope.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {scope.map((s) => (
            <Badge key={s.key} variant="secondary" className="gap-1.5">
              {s.label}
              <button
                type="button"
                className="hover:text-foreground text-muted-foreground"
                aria-label={`Clear ${s.label}`}
                onClick={() => setParam({ [s.key]: undefined })}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      {isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="bg-card shadow-xs rounded-xl">
          <DataTable
            rows={reports}
            empty={status === "new" && scope.length === 0 && !rating && !q ? "Inbox zero. Nothing new has been reported." : "Nothing matches those filters."}
            columns={[
              {
                key: "report",
                header: "Report",
                render: (r) => {
                  const face = faceFor(r.rating);
                  return (
                    /*
                      A button, not `hrefFor`: that would make opening a report a
                      router navigation, which fights the `replaceState` writes
                      that keep the open report in the URL.
                    */
                    <button
                      type="button"
                      onClick={() => setOpenId(r.id)}
                      className="group flex w-full min-w-0 items-center gap-2 text-left"
                    >
                      <face.Icon className="size-4 shrink-0" style={{ color: face.color }} aria-label={face.label} />
                      {r.message ? (
                        <span className="group-hover:text-primary truncate">{r.message}</span>
                      ) : (
                        <span className="text-muted-foreground truncate italic">Rating only, no note.</span>
                      )}
                      {r.hasSnapshot && (
                        <Camera className="text-muted-foreground size-3.5 shrink-0" aria-label="Screen attached" />
                      )}
                    </button>
                  );
                },
              },
              {
                key: "topic",
                header: "Topic",
                width: "11rem",
                muted: true,
                render: (r) => feedbackTopicLabel(r.topic) ?? "—",
              },
              {
                key: "where",
                header: "Where",
                width: "22%",
                render: (r) => (
                  <span className="block min-w-0">
                    <span className="block truncate">{r.formTitle ?? "form since deleted"}</span>
                    <span className="text-muted-foreground block truncate text-xs">{r.organizationName ?? "—"}</span>
                  </span>
                ),
              },
              {
                key: "who",
                header: "Who",
                width: "12%",
                muted: true,
                render: (r) => r.respondentLabel ?? (r.respondentId ? "unnamed" : "unknown"),
              },
              {
                key: "status",
                header: "Status",
                width: "6.5rem",
                render: (r) => {
                  const b = STATUS_BADGE[r.status] ?? STATUS_BADGE.new!;
                  return <Badge className={b.className}>{b.label}</Badge>;
                },
              },
              {
                key: "when",
                header: "When",
                width: "6rem",
                muted: true,
                render: (r) => <span title={new Date(r.createdAt).toLocaleString()}>{relativeTime(r.createdAt)}</span>,
              },
            ]}
          />
        </div>
      )}

      {total > PAGE && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-caption tabular">
            {offset + 1}&ndash;{Math.min(offset + PAGE, total)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setParam({ offset: String(Math.max(0, offset - PAGE)) })}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={offset + PAGE >= total} onClick={() => setParam({ offset: String(offset + PAGE) })}>
              Next
            </Button>
          </div>
        </div>
      )}

      {openId && (
        <FeedbackReportDialog
          id={openId}
          ids={reports.map((r) => r.id)}
          onOpen={setOpenId}
          onClose={() => setOpenId(null)}
          onChanged={() => void refetch()}
          onShowRespondent={(rid) => {
            setOpenId(null);
            setParam({ respondentId: rid, status: "all" });
          }}
        />
      )}
    </div>
  );
}
