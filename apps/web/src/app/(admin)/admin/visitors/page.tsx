import { Suspense } from "react";
import { VisitorsClient } from "@/components/admin/visitors-client";

export default function AdminVisitorsPage() {
  return (
    <Suspense fallback={null}>
      <VisitorsClient />
    </Suspense>
  );
}
