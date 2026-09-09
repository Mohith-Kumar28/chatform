"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { useGetApiAdminHealth, postApiAdminBillingEventsByIdReprocess } from "@/lib/api/admin/admin";
import { BarList, ChartCard } from "@/components/charts/chart-kit";
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
        <div>
          <h1 className="text-h1">Health</h1>
          <p className="text-muted-foreground text-caption mt-0.5">
            Webhooks, billing events, integrations, mail and storage — the promises made outside the product.
          </p>
        </div>
        <RangePicker />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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
          hint="3+ consecutive failures"
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
          hint="active but idle 2+ days"
        />
        <KpiTile
          label="Stored files"
          value={h.storage?.files ?? 0}
          previous={h.storage?.files ?? 0}
          format={compact}
          hint={gb(h.storage?.bytes ?? 0)}
        />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
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
              { key: "fails", header: "In a row", numeric: true, render: (row) => num(row, "consecutive_failures") },
            ]}
          />
        </ChartCard>

        <ChartCard title="What endpoints answer" subtitle="HTTP status of every delivery in this period.">
          <BarList
            items={(wh.byStatusCode ?? []).map((s) => ({
              label: s.key,
              value: s.value,
              display: compact(s.value),
              // 2xx is fine; everything else is the customer's server saying no.
              color: s.key.startsWith("2") ? "var(--chart-1)" : "var(--chart-2)",
            }))}
            total={sum(wh.byStatusCode)}
            emptyLabel="No deliveries attempted in this period."
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Billing events that did not process"
        subtitle="The payload was stored when it arrived, so these can be replayed once the cause is fixed."
      >
        <DataTable
          rows={h.billing?.stuck ?? []}
          empty="Every Dodo event has been processed. "
          columns={[
            { key: "type", header: "Event", render: (row) => str(row, "type") },
            {
              key: "status",
              header: "Status",
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
            { key: "when", header: "Arrived", muted: true, render: (row) => relativeDay(num(row, "created_at")) },
            {
              key: "action",
              header: "",
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

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <ChartCard title="Follow-up mail" subtitle="What happened to each scheduled nudge.">
          <BarList
            items={(email.followupsByStatus ?? []).map((s) => ({ label: s.key, value: s.value }))}
            total={sum(email.followupsByStatus)}
            colorBy="series"
            emptyLabel="No follow-ups scheduled in this period."
          />
        </ChartCard>

        <ChartCard title="Suppressed addresses" subtitle="Why we stopped mailing them.">
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
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <ChartCard title="Integrations" subtitle="Connected feeds, by provider and state.">
          <DataTable
            rows={h.integrations?.byStatus ?? []}
            empty="No integrations connected."
            columns={[
              { key: "provider", header: "Provider", render: (row) => str(row, "provider") },
              {
                key: "status",
                header: "State",
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
              { key: "n", header: "Count", numeric: true, render: (row) => num(row, "n") },
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

        <ChartCard title="Exports" subtitle="Queued response downloads, by state.">
          <BarList
            items={(h.exports ?? []).map((s) => ({ label: s.key, value: s.value }))}
            total={sum(h.exports)}
            colorBy="series"
            emptyLabel="No exports requested."
          />
          {(h.storage?.rejected ?? 0) > 0 && (
            <p className="text-muted-foreground text-micro mt-3">
              {h.storage.rejected} uploaded file{h.storage.rejected === 1 ? " was" : "s were"} rejected — worth a look
              if that number is climbing.
            </p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
