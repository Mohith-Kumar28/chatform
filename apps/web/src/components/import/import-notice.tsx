"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { reportSummary, SOURCE_NAME, takeReport } from "./import-client";

/**
 * Once, on the first open of an imported form: what came over, and what to
 * check. A toast rather than a banner because it is news about the import,
 * not a property of the form, and it has nothing to say a second time.
 */
export function ImportNotice({ formId }: { formId: string }) {
  useEffect(() => {
    const report = takeReport(formId);
    if (!report) return;
    const checks = [...(report.closed ? ["The original is closed to responses; your copy is open."] : []), ...report.notCopied];
    const title = `Imported from ${SOURCE_NAME[report.provider]}: ${reportSummary(report)}`;
    if (checks.length === 0) {
      toast.success(title);
      return;
    }
    toast.info(title, {
      duration: 20_000,
      closeButton: true,
      description: (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ),
    });
  }, [formId]);
  return null;
}
