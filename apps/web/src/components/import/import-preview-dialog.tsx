"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Block } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { blockMeta, TONE_CLASSES } from "@/components/builder/block-library";
import { useSession } from "@/lib/auth/auth-client";
import { cn } from "@/lib/utils";
import { claimImport, handOffReport, importErrorOf, SOURCE_NAME, type ImportTrial } from "./import-client";
import { SourceLogo } from "./source-logo";

/**
 * The converted form, live, before anyone commits to it.
 *
 * Left: the real public form page, framed, talking to a real trial copy in
 * the same runtime a respondent gets. Right: exactly what came over, step by
 * step with the builder's own icons, what to check, and the one thing to do
 * next. The list is the proof the copy is complete, so it is the whole
 * column rather than a count.
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
  const outline = report?.outline ?? [];
  const questions = outline.filter((s) => s.type !== "statement");
  const required = questions.filter((s) => s.required).length;
  const notes = report ? [...(report.closed ? ["The original is closed to responses; your copy is open."] : []), ...report.notCopied] : [];

  return (
    <Dialog open={trial !== null} onOpenChange={onOpenChange}>
      <DialogContent size="full" layout="panel" className="gap-0 sm:max-w-[min(76rem,calc(100vw-3rem))]">
        <DialogHeader className="border-border shrink-0 border-b px-5 py-4 text-left sm:px-6">
          <div className="flex items-center gap-3">
            {report && (
              <span className="bg-muted flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-3 pl-1.5">
                <SourceLogo source={report.provider} className="text-foreground size-6" />
                <ArrowRight className="text-muted-foreground size-3.5" aria-hidden />
                <span className="text-xs font-semibold">chatform</span>
              </span>
            )}
            <div className="min-w-0">
              <DialogTitle className="font-display truncate text-lg sm:text-xl">
                {report ? `Your ${SOURCE_NAME[report.provider]} form, as a conversation` : "Preview"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs sm:text-sm">
                Answer it like a respondent would. Nothing is kept until you choose to use it.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {trial && report && (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_22rem]">
            <div className="bg-muted/50 min-h-0 p-3 sm:p-5">
              <iframe
                key={trial.slug}
                src={`/f/${trial.slug}?embed=1`}
                title="Converted form preview"
                className="border-border bg-background h-[min(34rem,58dvh)] w-full rounded-2xl border shadow-sm lg:h-full lg:min-h-[34rem]"
                allow="clipboard-write; microphone"
              />
            </div>

            <aside className="border-border flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
              <div className="grid grid-cols-3 gap-2 p-4 sm:p-5">
                <Stat value={questions.length} label={questions.length === 1 ? "Question" : "Questions"} />
                <Stat value={report.branches} label={report.branches === 1 ? "Branch" : "Branches"} />
                <Stat value={required} label="Required" />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
                <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">What came over</p>
                <ol className="space-y-1">
                  {outline.map((step, i) => {
                    const meta = blockMeta(step.type as Block["type"]);
                    const Icon = meta.icon;
                    return (
                      <li key={`${i}-${step.title}`} className="hover:bg-muted/60 flex items-start gap-2.5 rounded-lg px-1.5 py-1.5">
                        <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md", TONE_CLASSES[meta.tone])}>
                          <Icon className="size-3.5" strokeWidth={2} aria-hidden />
                        </span>
                        <span className={cn("min-w-0 flex-1 text-sm leading-snug", step.type === "statement" && "text-muted-foreground")}>
                          <span className="line-clamp-2">{step.title}</span>
                          <span className="text-muted-foreground text-[0.7rem]">
                            {meta.label}
                            {step.required ? " · Required" : ""}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>

                {notes.length > 0 && (
                  <div className="border-border mt-5 rounded-xl border p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold">
                      <CircleAlert className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
                      Worth a check
                    </p>
                    <ul className="text-muted-foreground mt-2 space-y-1.5 text-xs leading-relaxed">
                      {notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="border-border bg-background shrink-0 border-t p-4 sm:p-5">
                <Button shape="pill" size="lg" className="w-full" disabled={claiming} onClick={use}>
                  {claiming ? <Loader2 className="size-4 animate-spin" /> : null}
                  Use this form
                  {!claiming && <ArrowRight className="size-4" />}
                </Button>
                <p className="text-muted-foreground mt-2 text-center text-xs">
                  {trial.remaining === 0
                    ? "That was today's last free conversion. Free to keep, edit and publish."
                    : trial.remaining === 1
                      ? "1 free conversion left today. Free to keep, edit and publish."
                      : "Free to keep, edit and publish."}
                </p>
              </div>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-muted/60 rounded-xl px-3 py-2.5">
      <p className="font-display text-2xl leading-none font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-[0.7rem]">{label}</p>
    </div>
  );
}
