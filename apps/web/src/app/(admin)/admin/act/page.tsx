import { Suspense } from "react";
import { ActClient } from "@/components/admin/act-client";

/**
 * `/admin/act` — the tab that turns into a customer.
 *
 * Inside the admin route group because it is an admin page and the API answers
 * 404 to anyone else, and behind `Suspense` because `useSearchParams` opts the
 * tree into client rendering and Next requires the boundary to be explicit.
 */
export default function AdminActPage() {
  return (
    <Suspense fallback={null}>
      <ActClient />
    </Suspense>
  );
}
