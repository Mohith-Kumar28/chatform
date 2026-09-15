"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { functionalUpdate, rowPaginationFeature, tableFeatures, useTable, type PaginationState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Fifty rows a page — the issues table, the reports table, and what ← and → in a report walk. */
export const FEEDBACK_PAGE = 50;

const features = tableFeatures({ rowPaginationFeature });
const NO_ROWS: never[] = [];

/**
 * Server-paged table state from TanStack Table: the page lives in the URL as an
 * offset, the server does the slicing, and the table answers "is there a next
 * page" and moves between them.
 */
export function useFeedbackPages({
  total,
  offset,
  onOffset,
}: {
  total: number;
  offset: number;
  onOffset: (offset: number) => void;
}) {
  const pagination: PaginationState = { pageIndex: Math.floor(offset / FEEDBACK_PAGE), pageSize: FEEDBACK_PAGE };
  return useTable({
    features,
    columns: [],
    // The server already sliced the page; the table only keeps count of where it is.
    data: NO_ROWS,
    manualPagination: true,
    rowCount: total,
    state: { pagination },
    onPaginationChange: (updater) => onOffset(functionalUpdate(updater, pagination).pageIndex * FEEDBACK_PAGE),
  });
}

export type FeedbackPages = ReturnType<typeof useFeedbackPages>;

/** "51–100 of 240", and the arrows once there is more than one page. */
export function FeedbackPager({ pages, total, offset, isFetching }: { pages: FeedbackPages; total: number; offset: number; isFetching: boolean }) {
  if (total === 0) return null;
  const from = offset + 1;
  const to = Math.min(offset + FEEDBACK_PAGE, total);
  return (
    <div className="flex items-center justify-end gap-2">
      <span className={cn("text-muted-foreground text-caption tabular", isFetching && "opacity-60")}>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      {pages.getPageCount() > 1 && (
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" shape="pill" aria-label="Previous page" disabled={!pages.getCanPreviousPage()} onClick={() => pages.previousPage()}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" shape="pill" aria-label="Next page" disabled={!pages.getCanNextPage()} onClick={() => pages.nextPage()}>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
