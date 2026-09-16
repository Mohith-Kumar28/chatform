import type { Metadata } from "next";
import { Suspense } from "react";
import { PayReturn } from "./pay-return";

export const metadata: Metadata = {
  title: "Payment",
  // A landing strip for one respondent's checkout, never a page anyone searches for.
  robots: { index: false, follow: false },
};

/** `useSearchParams` needs a boundary, or the route opts out of prerendering. */
export default function PayReturnPage() {
  return (
    <Suspense>
      <PayReturn />
    </Suspense>
  );
}
