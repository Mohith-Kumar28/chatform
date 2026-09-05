"use client";

import { ShareClient } from "../share-client";
import { useBuilderStore } from "@/stores/builder-store";
import { useGetApiFormsById } from "@/lib/api/dashboard/dashboard";
import { useClientValue } from "@/hooks/use-client-value";

export function ShareTab() {
  const formId = useBuilderStore((s) => s.formId);
  const { data } = useGetApiFormsById(formId as never);
  const row = data as { slug: string; status: string } | undefined;

  // window.location is not available during SSR; "" is what the server renders.
  const origin = useClientValue(() => window.location.origin, "");

  if (!formId || !row) return null;
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <ShareClient formId={formId} slug={row.slug} appOrigin={origin} status={row.status} />
    </div>
  );
}
