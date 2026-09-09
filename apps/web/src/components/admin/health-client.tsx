"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { useGetApiAdminHealth, postApiAdminBillingEventsByIdReprocess } from "@/lib/api/admin/admin";
import { BarList, ChartCard } from "@/components/charts/chart-kit";
import { RadialGauge } from "@/components/charts/radial-gauge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiData } from "@/lib/api/payload";
import { DataTable } from "./data-table";
import { KpiTile } from "./kpi-tile";
import { RangePicker, useRange } from "./range-picker";
import { compact, relativeDay } from "./format";

/**
 * Whether the machinery around the product is keeping its promises.
 *
 * Each panel is a promise made to somebody outside the product: a webhook it
 * said it would deliver, an email it said it would send, a feed it said it would
 * keep filled, a billing event it said it processed. All four already had a
 * status column and none of them had a reader — a webhook endpoint failing for a
 * week is invisible to us and extremely visible to the customer whose CRM
 * stopped filling up.
 *
 * Deliverability leads because it is the one failure that damages *other*
 * customers: bounces and complaints burn the sending domain, and the first
 * symptom is somebody else's password reset landing in spam.
 */

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));
const num = (r: Row, k: string) => Number(r[k] ?? 0);

interface Health {
  webhooks: {
    delivered: number;
    failed: number;
    pending: number;
    successRate: number;
    endpointsFailing: number;
    byStatusCode: { key: string; value: number }[];
    worst: Row[];
  };
  billing: { byStatus: { key: string; value: number }[]; stuck: Row[] };
  integrations: { byStatus: Row[]; failing: Row[] };
  email: {
    followupsByStatus: { key: string; value: number }[];
    suppressionsByReason: { key: string; value: number }[];
    sent: number;
    complaintRate: number;
  };
  exports: { key: string; value: number }[];
  sessions: { byStatus: { key: string; value: number }[]; stale: number };
  storage: { files: number; bytes: number; rejected: number };
}

const gb = (bytes: number) => `${(bytes / 1_073_741_824).toFixed(2)} GB`;

/**
 * The denominator for every breakdown on this page.
 *
 * `BarList` defaults its percentage to share-of-largest, which is the right
 * reading for a ranked list and the wrong one for a partition: one bounce beside
 * one complaint both rendered as "100%". Passing the real total makes the
 * percentage mean what a reader assumes it means.
 */
const sum = (list: { value: number }[] | undefined) => (list ?? []).reduce((n, r) => n + r.value, 0);

export function HealthClient() {
  const range = useRange();
  const { data, isPending, refetch } = useGetApiAdminHealth({ range });
  const [replaying, setReplaying] = useState<string | null>(null);

  if (isPending) return <Skeleton className="h-96 rounded-xl" />;
  const h = apiData<Health>(data) ?? ({} as Health);
  const wh = h.webhooks ?? ({} as Health["webhooks"]);
  const email = h.email ?? ({} as Health["email"]);

  async function replay(id: string) {
    setReplaying(id);
    try {
      const res = (await postApiAdminBillingEventsByIdReprocess(id)) as unknown as {
        ok?: boolean;
        outcome?: string;
      };
      if (res?.ok) toast.success(`Replayed: ${res.outcome ?? "done"}`);
      else toast.error(`Still failing: ${res?.outcome ?? "unknown error"}`);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not replay that event");
    } finally {
      setReplaying(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">Health</h1>
        <RangePicker />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Webhook success"
          value={wh.successRate ?? 100}
          previous={wh.successRate ?? 100}
          format={(n) => `${n}%`}
          hint={`${compact(wh.delivered ?? 0)} delivered`}
        />
        <KpiTile
          label="Endpoints failing"
          value={wh.endpointsFailing ?? 0}
          previous={wh.endpointsFailing ?? 0}
          lowerIsBetter
          hint="3+ fails in a row"
        />
        <KpiTile
          label="Billing events stuck"
          value={(h.billing?.stuck ?? []).length}
          previous={(h.billing?.stuck ?? []).length}
          lowerIsBetter
        />
        {/*
          The number that damages other customers. Above ~2% and the sending
          domain's reputation is going, which takes password resets with it.
        */}
        <KpiTile
          label="Bounce + complaint"
          value={email.complaintRate ?? 0}
          previous={email.complaintRate ?? 0}
          format={(n) => `${n}%`}
          lowerIsBetter
          hint={`of ${compact(email.sent ?? 0)} sent`}
        />
        <KpiTile
          label="Stale sessions"
          value={h.sessions?.stale ?? 0}
          previous={h.sessions?.stale ?? 0}
          lowerIsBetter
          hint="idle 2+ days"
        />
        <KpiTile
          label="Stored files"
          value={h.storage?.files ?? 0}
          previous={h.storage?.files ?? 0}
          format={compact}
          hint={gb(h.storage?.bytes ?? 0)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Endpoints that keep failing"
          subtitle="A customer's integration stopped working and they may not know yet."
        >
          <DataTable
            rows={wh.worst ?? []}
            hrefFor={(row) => `/admin/accounts/${str(row, "org_id")}`}
            empty="Every endpoint is accepting deliveries. "
            columns={[
              { key: "name", header: "Account", render: (row) => str(row, "name") },
              {
                key: "url",
                header: "Endpoint",
                render: (row) => (
                  <span className="text-muted-foreground truncate text-xs" title={str(row, "url")}>
                    {str(row, "url")}
                  </span>
                ),
              },
              {
                key: "status",
                header: "Last",
                render: (row) =>
                  num(row, "last_status") > 0 ? (
                    <Badge className="bg-[var(--destructive-soft)] text-destructive">{num(row, "last_status")}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs truncate">
                      {str(row, "last_error").slice(0, 40) || "—"}
                    </span>
                  ),
              },
              { key: "fails", header: "In a row", width: "6rem", numeric: true, render: (row) => num(row, "consecutive_failures") },
            ]}
          />
        </ChartCard>

        {/*
          The rate first, then what the failures were.

          This was three bar rows — a 200 count, a 404 count, a 500 count — which
          is a bar chart of a thing against itself; the number anyone actually
          wants out of it is the share that got through. The gauge carries that,
          and the codes stay underneath for the diagnosis.
        */}
        <ChartCard title="What endpoints answer" subtitle="HTTP status of every delivery attempted.">
          {sum(wh.byStatusCode) > 0 ? (
            <div className="flex flex-wrap items-center gap-6">
              <RadialGauge
                value={wh.successRate ?? 100}
                label="accepted"
                caption={`${compact(wh.delivered ?? 0)} delivered`}
                tone={(wh.successRate ?? 100) >= 99 ? "success" : (wh.successRate ?? 100) >= 90 ? "warning" : "danger"}
                size={116}
              />
              <div className="min-w-56 flex-1">
                <BarList
                  items={(wh.byStatusCode ?? []).map((s) => ({
                    label: s.key,
                    value: s.value,
                    display: compact(s.value),
                    // 2xx is fine; everything else is the customer's server
                    // saying no. The one place in the console where colour is a
                    // verdict rather than an identity — and the gauge beside it
                    // already reads that way.
                    color: s.key.startsWith("2") ? "var(--success)" : "var(--destructive)",
                  }))}
                  total={sum(wh.byStatusCode)}
                />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No deliveries attempted in this period.</p>
          )}
        </ChartCard>
      </div>

      {/*
        Paired with the integrations table rather than given a row of its own.

        Its usual state is one sentence saying every event processed, and a
        sentence does not need the width of the page — but when it does have
        rows they carry a raw provider error and a Replay button, so it keeps
        the larger two-thirds either way.
      */}
      <div className="grid gap-3 lg:grid-cols-3">
      <ChartCard
        className="lg:col-span-2"
        title="Billing events that did not process"
        hint="The payload was stored when it arrived, so these can be replayed once the cause is fixed — replaying is safe to repeat, the handler is idempotent."
      >
        <DataTable
          rows={h.billing?.stuck ?? []}
          empty="Every Dodo event has been processed."
          columns={[
            { key: "type", header: "Event", width: "16rem", render: (row) => str(row, "type") },
            {
              key: "status",
              header: "Status",
              width: "8rem",
              render: (row) => (
                <Badge className="bg-[var(--destructive-soft)] text-destructive">{str(row, "status")}</Badge>
              ),
            },
            {
              key: "error",
              header: "Why",
              render: (row) => (
                <span className="text-muted-foreground truncate text-xs">{str(row, "error") || "—"}</span>
              ),
            },
            { key: "when", header: "Arrived", width: "7rem", muted: true, render: (row) => relativeDay(num(row, "created_at")) },
            {
              key: "action",
              header: "",
              width: "7rem",
              render: (row) => (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={replaying === str(row, "dodo_event_id")}
                  onClick={() => replay(str(row, "dodo_event_id"))}
                >
                  <RefreshCw
                    className={replaying === str(row, "dodo_event_id") ? "size-3.5 animate-spin" : "size-3.5"}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Replay
                </Button>
              ),
            },
          ]}
        />
      </ChartCard>

        <ChartCard title="Integrations" subtitle="Connected feeds, by provider and state.">
          <DataTable
            rows={h.integrations?.byStatus ?? []}
            empty="No integrations connected."
            columns={[
              { key: "provider", header: "Provider", render: (row) => str(row, "provider") },
              {
                key: "status",
                header: "State",
                width: "9rem",
                render: (row) => (
                  <Badge
                    className={
                      str(row, "status") === "connected"
                        ? "bg-[var(--success-soft)] text-[var(--success)]"
                        : "bg-[var(--destructive-soft)] text-destructive"
                    }
                  >
                    {str(row, "status")}
                  </Badge>
                ),
              },
              { key: "n", header: "Count", width: "6rem", numeric: true, render: (row) => num(row, "n") },
            ]}
          />
          {(h.integrations?.failing ?? []).length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="text-caption mb-2 font-medium">Currently broken</p>
              <ul className="space-y-1">
                {(h.integrations?.failing ?? []).map((f, i) => (
                  <li key={i} className="text-muted-foreground truncate text-xs">
                    <span className="text-foreground">{str(f, "name")}</span> · {str(f, "provider")} —{" "}
                    {str(f, "last_error") || str(f, "status")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Four small breakdowns, one row: each is two or three rows of bars, and
          each used to get a third or a half of the page to say so. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Follow-up mail" subtitle="What happened to each scheduled nudge.">
          <BarList
            items={(email.followupsByStatus ?? []).map((s) => ({ label: s.key, value: s.value }))}
            total={sum(email.followupsByStatus)}
            colorBy="series"
            emptyLabel="No follow-ups scheduled in this period."
          />
        </ChartCard>

        <ChartCard
          title="Suppressed addresses"
          subtitle="Why we stopped mailing them."
          hint="Bounces and complaints are the two that cost us the sending domain's reputation; unsubscribes are the system working."
        >
          <BarList
            items={(email.suppressionsByReason ?? []).map((s) => ({
              label: s.key,
              value: s.value,
              color: s.key === "bounce" || s.key === "complaint" ? "var(--chart-2)" : "var(--chart-1)",
            }))}
            total={sum(email.suppressionsByReason)}
            emptyLabel="No suppressed addresses."
          />
        </ChartCard>

        <ChartCard title="Conversations" subtitle="How respondent sessions ended.">
          <BarList
            items={(h.sessions?.byStatus ?? []).map((s) => ({ label: s.key, value: s.value, display: compact(s.value) }))}
            total={sum(h.sessions?.byStatus)}
            colorBy="series"
            emptyLabel="No sessions in this period."
          />
        </ChartCard>

        <ChartCard
          title="Exports"
          subtitle="Queued response downloads, by state."
          aside={
            (h.storage?.rejected ?? 0) > 0
              ? `${h.storage.rejected} upload${h.storage.rejected === 1 ? "" : "s"} rejected`
              : undefined
          }
        >
          <BarList
            items={(h.exports ?? []).map((s) => ({ label: s.key, value: s.value }))}
            total={sum(h.exports)}
            colorBy="series"
            emptyLabel="No exports requested."
          />
        </ChartCard>
      </div>
    </div>
  );
}
