"use client";

import { ResultsClient } from "../results-client";
import { useBuilderStore } from "@/stores/builder-store";

export function ResultsTab() {
  const formId = useBuilderStore((s) => s.formId);
  if (!formId) return null;
  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <ResultsClient formId={formId} />
    </div>
  );
}
