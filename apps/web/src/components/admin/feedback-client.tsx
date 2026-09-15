"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Inbox } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { RangePicker } from "./range-picker";
import { FeedbackStats } from "./feedback-stats";
import { FeedbackInbox } from "./feedback-inbox";

/**
 * Feedback — what the people using the product say about it.
 *
 * Overview says how the business is doing and Product what customers build;
 * this is the one page made of other people's words. It has two halves, and they
 * are deliberately two tabs rather than one list with a type filter: a
 * respondent reporting that a picker is broken and an account owner asking for a
 * feature are read by the same people for different reasons, and a mixed feed
 * makes every row a small act of sorting.
 *
 * The tab is in the URL, like every other mode in the console, so a filtered view
 * of the inbox can be sent to somebody.
 */

export const FEEDBACK_TABS = [
  { value: "respondents", label: "Respondent feedback" },
  { value: "admins", label: "Admin feedback" },
] as const;

export type FeedbackTab = (typeof FEEDBACK_TABS)[number]["value"];

export function useFeedbackTab(): FeedbackTab {
  const value = useSearchParams().get("view");
  return value === "admins" ? "admins" : "respondents";
}

/** Everything the respondent tab keeps in the URL — cleared when the tab changes. */
const RESPONDENT_PARAMS = [
  "status",
  "rating",
  "noted",
  "source",
  "topic",
  "q",
  "formId",
  "orgId",
  "respondentId",
  "sort",
  "offset",
  "report",
];

export function FeedbackClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = useFeedbackTab();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1">Feedback</h1>
          <SegmentedControl
            size="sm"
            value={tab}
            onChange={(next) => {
              const q = new URLSearchParams(params.toString());
              if (next === "respondents") q.delete("view");
              else q.set("view", next);
              for (const key of RESPONDENT_PARAMS) q.delete(key);
              router.replace(`${pathname}${q.size ? `?${q.toString()}` : ""}`, { scroll: false });
            }}
            options={FEEDBACK_TABS.map((t) => ({ value: t.value, label: t.label }))}
            ariaLabel="Whose feedback"
          />
        </div>
        {/*
          Only where it governs something. An empty tab under a live date filter
          invites the reader to conclude that the filter is why it is empty.
        */}
        {tab === "respondents" && <RangePicker />}
      </div>

      {tab === "respondents" ? (
        <>
          {/* The work first; the charts about it after. */}
          <FeedbackInbox />
          <FeedbackStats />
        </>
      ) : (
        <AdminFeedbackEmpty />
      )}
    </div>
  );
}

/**
 * A tab that exists before its data does, and says so.
 *
 * The route and the nav are here now so that the first account-owner report has
 * somewhere to land without moving anything. Until then this is not "no results"
 * — nothing collects it yet — and the copy has to say that rather than look like
 * a quiet week.
 */
function AdminFeedbackEmpty() {
  return (
    <EmptyState
      icon={Inbox}
      title="Nothing from account owners yet"
      description="Feedback and feature requests from the people who build forms will land here — filed from inside the dashboard, and carrying their plan and account, so a request from a paying Business account reads differently from one on a free trial."
      hint="No collection surface ships yet. This tab is here so the page already has the right shape when the first one arrives."
    />
  );
}
