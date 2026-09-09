import { Suspense } from "react";
import { OverviewClient } from "@/components/admin/overview-client";

/**
 * `Suspense` because the page reads its date range from `useSearchParams`, which
 * opts the tree into client-side rendering and needs a boundary above it.
 */
export default function AdminOverviewPage() {
  return (
    <Suspense fallback={null}>
      <OverviewClient />
    </Suspense>
  );
}
