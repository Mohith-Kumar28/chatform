"use client";

import { IntegrateClient } from "../integrate-client";
import { useBuilderStore } from "@/stores/builder-store";

export function IntegrateTab() {
  const formId = useBuilderStore((s) => s.formId);
  if (!formId) return null;
  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <IntegrateClient formId={formId} />
    </div>
  );
}
