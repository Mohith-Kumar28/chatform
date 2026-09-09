import { Suspense } from "react";
import { RevenueClient } from "@/components/admin/revenue-client";

export default function AdminRevenuePage() {
  return (
    <Suspense fallback={null}>
      <RevenueClient />
    </Suspense>
  );
}
