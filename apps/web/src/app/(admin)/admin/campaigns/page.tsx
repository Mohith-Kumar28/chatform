import { Suspense } from "react";
import { CampaignsClient } from "@/components/admin/campaigns-client";

export default function AdminCampaignsPage() {
  return (
    <Suspense fallback={null}>
      <CampaignsClient />
    </Suspense>
  );
}
