import { Suspense } from "react";
import { AccountsClient } from "@/components/admin/accounts-client";

export default function AdminAccountsPage() {
  return (
    <Suspense fallback={null}>
      <AccountsClient />
    </Suspense>
  );
}
