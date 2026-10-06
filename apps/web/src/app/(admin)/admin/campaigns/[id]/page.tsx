import { Suspense } from "react";
import { CampaignDetail } from "@/components/admin/campaigns/campaign-detail";

export default async function AdminCampaignPage({ params }: PageProps<"/admin/campaigns/[id]">) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <CampaignDetail id={id} />
    </Suspense>
  );
}
