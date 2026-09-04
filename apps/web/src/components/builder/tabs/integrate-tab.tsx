"use client";

import { IntegrateClient } from "../integrate-client";
import { useBuilderStore } from "@/stores/builder-store";
import { useGetApiFormsById } from "@/lib/api/dashboard/dashboard";

export function IntegrateTab() {
  const formId = useBuilderStore((s) => s.formId);
  // The embed snippet addresses a form by slug, not by id — the same way the
  // Share tab does, from the same source.
  const { data } = useGetApiFormsById(formId as never);
  const row = data as { slug: string } | undefined;

  if (!formId || !row) return null;
  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <IntegrateClient formId={formId} slug={row.slug} />
    </div>
  );
}
