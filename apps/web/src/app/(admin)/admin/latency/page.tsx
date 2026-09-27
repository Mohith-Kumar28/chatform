import { Suspense } from "react";
import { LatencyClient } from "@/components/admin/latency-client";

export default function AdminLatencyPage() {
  return (
    <Suspense fallback={null}>
      <LatencyClient />
    </Suspense>
  );
}
