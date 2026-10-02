"use client";

import { useGetApiAnalyticsOverview, getGetApiAnalyticsOverviewQueryKey } from "@/lib/api/dashboard/dashboard";
import type { GetApiAnalyticsOverview200 } from "@/lib/api/generated.schemas";
import { apiData } from "@/lib/api/payload";
import { KpiTile } from "@/components/admin/kpi-tile";
import { useUpgrade } from "@/components/billing/gate";
import { formatDuration } from "@/lib/format";

const COMPARED_TO = "prev 7 days";
const percent = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Every form in the workspace being viewed, added up: the row above the grid.
 *
 * The same tile the platform console uses, so a number, its sparkline and its
 * movement read the same way in both places. Seven days against the seven
 * before, fixed: this is a glance on the way to a form, not a report.
 */
export function OverviewTiles({ ws, tz }: { ws: string; tz: number }) {
  const params = { ws, tz };
  const { data, isLoading } = useGetApiAnalyticsOverview(params, {
    query: { queryKey: getGetApiAnalyticsOverviewQueryKey(params) },
  });
  const o = apiData<GetApiAnalyticsOverview200>(data);
  const upgrade = useUpgrade();

  return (
    <section aria-label="Last 7 days">
      <p className="text-muted-foreground text-caption mb-2">Last 7 days</p>
      {isLoading || !o ? (
        <div className={ROW}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="shimmer h-[5.25rem] rounded-xl" />
          ))}
        </div>
      ) : (
        <Tiles o={o} onUpgrade={() => upgrade({ feature: "advanced_analytics" }, { surface: "dashboard-overview" })} />
      )}
    </section>
  );
}

function Tiles({ o, onUpgrade }: { o: GetApiAnalyticsOverview200; onUpgrade: () => void }) {
  const { kpis, series } = o;
  const rate = kpis.completionRate;
  const median = kpis.medianMs;

  return (
    <div className={ROW}>
      <KpiTile
        label="Responses"
        value={kpis.responses.value}
        previous={kpis.responses.previous}
        comparedTo={COMPARED_TO}
        series={series.responses}
        hint={`${o.today.toLocaleString()} today`}
        about="Completed responses in the last 7 days, test runs excluded"
      />
      <KpiTile
        label="Views"
        value={kpis.views.value}
        previous={kpis.views.previous}
        comparedTo={COMPARED_TO}
        series={series.views}
        about="Times your forms were opened in the last 7 days"
      />
      <KpiTile
        label="Completion rate"
        value={rate.value ?? 0}
        previous={rate.value === null || rate.previous === null ? undefined : rate.previous}
        comparedTo={COMPARED_TO}
        format={rate.value === null ? () => "—" : percent}
        series={series.completionRate}
        about="Of the people who started in the last 7 days, the share who finished"
      />
      <KpiTile
        label="Partial"
        value={kpis.partial.value}
        previous={kpis.partial.previous}
        comparedTo={COMPARED_TO}
        series={series.partial}
        lowerIsBetter
        about="Started in the last 7 days and not finished"
      />
      {o.locked.includes("medianMs") ? (
        <button
          type="button"
          onClick={onUpgrade}
          className="bg-card shadow-xs hover:bg-accent/40 rounded-xl px-3.5 py-3 text-left transition-colors"
        >
          <p className="text-muted-foreground text-caption truncate">Median time</p>
          <p className="text-muted-foreground mt-1 text-[1.75rem] leading-none font-semibold">Pro</p>
          <p className="text-muted-foreground mt-1.5 text-[0.6875rem] leading-[1.45]">Upgrade to see</p>
        </button>
      ) : (
        <KpiTile
          label="Median time"
          value={median.value ?? 0}
          previous={median.value === null || median.previous === null ? undefined : median.previous}
          comparedTo={COMPARED_TO}
          format={formatDuration}
          lowerIsBetter
          about="How long a typical response took to finish, last 7 days"
        />
      )}
    </div>
  );
}

// Five tiles in a two-column phone grid leave one alone on the last row, so
// the headline one takes the full width there instead.
const ROW = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1";
