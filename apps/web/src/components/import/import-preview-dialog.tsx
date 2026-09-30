"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoHint } from "@/components/ui/info-hint";
import { useSession } from "@/lib/auth/auth-client";
import { claimImport, handOffReport, importErrorOf, reportSummary, SOURCE_NAME, type ImportTrial } from "./import-client";

/**
 * The converted form, live, before anyone commits to it.
 *
 * The left side is the real public form page, framed: the same runtime a
 * respondent gets, talking to a real trial copy, not a mock-up of one. The
 * right side is what came over and the one thing to do next.
 */
export function ImportPreviewDialog({
  trial,
  onOpenChange,
}: {
  trial: ImportTrial | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [claiming, setClaiming] = useState(false);

  const use = async () => {
    if (!trial) return;
    const claimPath = `/import/claim?t=${encodeURIComponent(trial.token)}`;
    if (!session) {
      // Sign-up first; the claim page picks the token up on the way back in.
      router.push(`/signin?mode=signup&next=${encodeURIComponent(claimPath)}`);
      return;
    }
    setClaiming(true);
    try {
      const { formId, report } = await claimImport(trial.token);
      handOffReport(formId, report);
      router.push(`/forms/${formId}/build`);
    } catch (err) {
      setClaiming(false);
      toast.error("Couldn't add the form", { description: importErrorOf(err).message });
    }
  };

  const report = trial?.report;
  const notes = report
    ? [...(report.closed ? ["The original is closed to responses; your copy is open."] : []), ...report.notCopied]
    : [];

  return (
    <Dialog open={trial !== null} onOpenChange={onOpenChange}>
      <DialogContent size="full" layout="panel" className="gap-0">
        <DialogHeader className="border-border shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle className="font-display text-xl">{report ? `Your ${SOURCE_NAME[report.provider]} form, as a conversation` : "Preview"}</DialogTitle>
          <DialogDescription className="sr-only">Try the converted form, then add it to your account.</DialogDescription>
        </DialogHeader>

        {trial && report && (
          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1fr_18rem]">
            <div className="bg-muted/40 min-h-0 p-3 sm:p-4">
              <iframe
                key={trial.slug}
                src={`/f/${trial.slug}?embed=1`}
                title="Converted form preview"
                className="border-border bg-background h-[min(36rem,60dvh)] w-full rounded-xl border lg:h-full lg:min-h-[32rem]"
                allow="clipboard-write; microphone"
              />
            </div>

            <aside className="border-border flex flex-col gap-4 border-t p-5 lg:border-t-0 lg:border-l">
              <div>
                <p className="text-muted-foreground text-xs">Copied from {SOURCE_NAME[report.provider]}</p>
                <p className="mt-1 font-medium">{reportSummary(report)}</p>
              </div>

              {notes.length > 0 && (
                <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <span>
                    {notes.length} {notes.length === 1 ? "thing to check" : "things to check"}
                  </span>
                  <InfoHint label="What to check" align="start">
                    <ul className="list-disc space-y-1 pl-4">
                      {notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </InfoHint>
                </div>
              )}

              <div className="mt-auto space-y-2">
                <Button shape="pill" className="w-full" disabled={claiming} onClick={use}>
                  {claiming ? <Loader2 className="size-4 animate-spin" /> : null}
                  Use this form
                  {!claiming && <ArrowRight className="size-4" />}
                </Button>
                {trial.remaining !== null && trial.remaining <= 1 && (
                  <p className="text-muted-foreground text-center text-xs">
                    {trial.remaining === 0 ? "That was today's last free conversion." : "1 free conversion left today."}
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
