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
import { LogoMark } from "@/components/brand/logo";

/**
 * The converted form, live, before anyone commits to it.
 *
 * Left: the real public form page, framed, talking to a real trial copy in
 * the same runtime a respondent gets, given most of the room. Right: exactly
 * what came over, step by step with the builder's own icons, what to check,
 * and the one thing to do next. The list is the proof the copy is complete,
 * so it is the whole column, with no counts above it.
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
  const notes = report ? [...(report.closed ? ["The original is closed to responses; your copy is open."] : []), ...report.notCopied] : [];

  return (
    <Dialog open={trial !== null} onOpenChange={onOpenChange}>
      <DialogContent size="full" layout="panel" className="gap-0 sm:max-w-[min(76rem,calc(100vw-3rem))]">
        <DialogHeader className="border-border shrink-0 border-b py-2.5 pr-14 pl-4 text-left sm:pl-5">
          <div className="flex items-center gap-3">
            {report && (
              <span className="bg-muted flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-3 pl-1.5">
                <SourceLogo source={report.provider} className="text-foreground size-6" />
                <ArrowRight className="text-muted-foreground size-3.5" aria-hidden />
                <LogoMark className="size-5" />
                <span className="text-xs font-semibold">chatform</span>
              </span>
            )}
            <div className="min-w-0">
              <DialogTitle className="font-display truncate text-base sm:text-lg">
                {!report ? "Preview" : report.provider === "website" ? "Your form, as a conversation" : `Your ${SOURCE_NAME[report.provider]} form, as a conversation`}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Answer it like a respondent would. Nothing is kept until you choose to use it.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {trial && report && (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_22rem]">
            <div className="bg-muted/50 min-h-0 p-2 sm:p-3">
              <iframe
                key={trial.slug}
                src={`/f/${trial.slug}?embed=1`}
                title="Converted form preview"
                className="border-border bg-background h-[min(40rem,64dvh)] w-full rounded-2xl border shadow-sm lg:h-full lg:min-h-[38rem]"
                allow="clipboard-write; microphone"
              />
            </div>

            <aside className="border-border flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
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
                <Button shape="pill" size="lg" className="w-full rounded-full" disabled={claiming} onClick={use}>
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
