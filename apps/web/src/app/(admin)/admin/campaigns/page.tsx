import { Suspense } from "react";
import { CampaignsList } from "@/components/admin/campaigns/campaigns-list";

export default function AdminCampaignsPage() {
  return (
    <Suspense fallback={null}>
      <CampaignsList />
    </Suspense>
  );
}
