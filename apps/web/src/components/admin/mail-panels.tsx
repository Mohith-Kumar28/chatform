"use client";

import { getGetApiAdminMailQueryKey, useGetApiAdminMail } from "@/lib/api/admin/admin";
import type { GetApiAdminMail200 } from "@/lib/api/generated.schemas";
import { apiData } from "@/lib/api/payload";
import { ChartCard } from "@/components/charts/chart-kit";
import { DataTable } from "./data-table";
import type { Range } from "./range-picker";

/**
 * Mail we send, and how much of it brought somebody back.
 *
 * These sat on the Campaigns page until campaigns became a thing of their own.
 * They are about the product's own mail (sign-in codes, receipts, reminders),
 * which is machinery rather than marketing, so they live with the rest of it.
 */

/** Mail kinds as the sender would name them. */
const MAIL_LABEL: Record<string, string> = {
  followup: "Follow-up to a respondent",
  submission: "New response, to the form owner",
  submission_receipt: "Receipt, to the respondent",
  invitation: "Team invitation",
  invitation_accepted: "Invitation accepted",
  access_granted: "Access granted",
  plan_upgraded: "Plan upgraded",
  plan_lapse: "Plan ending",
  password_reset: "Password reset",
  otp: "Sign-in code",
};

export function MailPanels({ range }: { range: Range }) {
  // Visits are kept for ninety days of page views; a longer period shows ninety.
  const params = { range: range === "365d" ? "90d" : range } as const;
  const { data } = useGetApiAdminMail(params, { query: { queryKey: getGetApiAdminMailQueryKey(params), staleTime: 300_000 } });
  const report = apiData<GetApiAdminMail200 | undefined>(data);
  if (!report) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <ChartCard
        className="min-w-0 lg:col-span-2"
        title="Mail that brought someone back"
        hint="Every link in our mail is tagged with the mail it came from. Visits are counted when the link is opened in a browser. Opens are not tracked: mail apps preload images, so an open count would be mostly machines."
      >
        <DataTable
          rows={report.email}
          minWidth="30rem"
          empty="No mail in this period."
          columns={[
            { key: "kind", header: "Mail", render: (r) => MAIL_LABEL[r.kind] ?? r.kind },
            { key: "sent", header: "Sent", numeric: true, width: "5.5rem", render: (r) => r.sent.toLocaleString() },
            { key: "visits", header: "Visits", numeric: true, width: "5.5rem", render: (r) => r.visits.toLocaleString() },
            {
              key: "rate",
              header: "Per mail",
              numeric: true,
              width: "5.5rem",
              render: (r) => (r.sent > 0 ? `${Math.round((r.visits / r.sent) * 100)}%` : "–"),
            },
          ]}
        />
      </ChartCard>
      <ChartCard title="Follow-ups" hint="Reminders sent to respondents who left a form unfinished.">
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["Sent", report.followups.sent],
              ["Clicked", report.followups.clicked],
              ["Finished", report.followups.recovered],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
              <div className="text-muted-foreground text-caption">
                {label}
                {label !== "Sent" && report.followups.sent > 0 ? ` · ${Math.round((value / report.followups.sent) * 100)}%` : ""}
              </div>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}
