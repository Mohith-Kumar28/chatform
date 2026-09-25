"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { RangePicker } from "./range-picker";
import { FeedbackStats } from "./feedback-stats";
import { FeedbackInbox } from "./feedback-inbox";
import { BUILDER_PARAMS, BuilderFeedbackInbox } from "./builder-feedback-inbox";
import { BuilderFeedbackStats } from "./builder-feedback-stats";

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
              for (const key of [...RESPONDENT_PARAMS, ...BUILDER_PARAMS]) q.delete(key);
              router.replace(`${pathname}${q.size ? `?${q.toString()}` : ""}`, { scroll: false });
            }}
            options={FEEDBACK_TABS.map((t) => ({ value: t.value, label: t.label }))}
            ariaLabel="Whose feedback"
          />
        </div>
        {/* It narrows the charts on both tabs; the inboxes ignore it. */}
        <RangePicker />
      </div>

      {tab === "respondents" ? (
        <>
          {/* The work first; the charts about it after. */}
          <FeedbackInbox />
          <FeedbackStats />
        </>
      ) : (
        <>
          <BuilderFeedbackInbox />
          <BuilderFeedbackStats />
        </>
      )}
    </div>
  );
}
