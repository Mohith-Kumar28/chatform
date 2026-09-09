"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";

/**
 * The periods, their labels, and how many days each is — one object, because
 * these three used to live in three places and the pages built `?since=` links
 * from a fourth copy.
 *
 * "Today" is a single day-bucket. Every count, list and funnel on the page
 * scopes to it; the time-series charts notice they have one point and draw a
 * bar rather than an area, which is the difference between "one quiet day" and
 * a chart that looks broken.
 */
export const RANGES = ["1d", "7d", "30d", "90d", "365d"] as const;
export type Range = (typeof RANGES)[number];

const LABELS: Record<Range, string> = {
  "1d": "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "365d": "12 months",
};

export const RANGE_DAYS: Record<Range, number> = { "1d": 1, "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

/** What a tile's `previous` figure is, said in words. */
export const COMPARED_TO: Record<Range, string> = {
  "1d": "yesterday",
  "7d": "prev 7 days",
  "30d": "prev 30 days",
  "90d": "prev 90 days",
  "365d": "prev 12 months",
};

/** The range in the URL, defaulted and validated. Never trust a hand-typed param. */
export function useRange(): Range {
  const value = useSearchParams().get("range");
  return (RANGES as readonly string[]).includes(value ?? "") ? (value as Range) : "30d";
}

/**
 * One range control for the whole page.
 *
 * In the URL rather than in state, for two reasons that both come up daily: a
 * view worth looking at is worth sending to somebody, and a page where each
 * chart carries its own period is a page where two charts get compared that
 * cannot be. One parameter, every chart on the page reads it.
 */
export function RangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const range = useRange();

  return (
    <SegmentedControl
      size="sm"
      value={range}
      onChange={(next) => {
        const q = new URLSearchParams(params.toString());
        q.set("range", next);
        // `scroll: false` — changing the period is not navigating somewhere new,
        // and being thrown back to the top of the page to re-find the chart you
        // were reading is the fastest way to make a control feel broken.
        router.replace(`${pathname}?${q.toString()}`, { scroll: false });
      }}
      options={RANGES.map((r) => ({ value: r, label: LABELS[r] }))}
      ariaLabel="Date range"
    />
  );
}
