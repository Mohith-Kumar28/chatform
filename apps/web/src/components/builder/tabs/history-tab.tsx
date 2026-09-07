"use client";

import { HistoryClient } from "../history-client";
import { useBuilderStore } from "@/stores/builder-store";

export function HistoryTab() {
  const formId = useBuilderStore((s) => s.formId);
  if (!formId) return null;
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <HistoryClient formId={formId} />
    </div>
  );
}
