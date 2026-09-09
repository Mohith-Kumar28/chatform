import { Suspense } from "react";
import { HealthClient } from "@/components/admin/health-client";

export default function AdminHealthPage() {
  return (
    <Suspense fallback={null}>
      <HealthClient />
    </Suspense>
  );
}
