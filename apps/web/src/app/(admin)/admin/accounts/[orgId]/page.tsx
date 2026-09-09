import { AccountDetail } from "@/components/admin/account-detail";

export default async function AdminAccountPage({ params }: PageProps<"/admin/accounts/[orgId]">) {
  const { orgId } = await params;
  return <AccountDetail orgId={orgId} />;
}
