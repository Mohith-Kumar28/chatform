import { Suspense } from "react";
import { TrafficClient } from "@/components/admin/traffic-client";

export default function AdminTrafficPage() {
  return (
    <Suspense fallback={null}>
      <TrafficClient />
    </Suspense>
  );
}
