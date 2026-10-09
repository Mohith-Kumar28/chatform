"use client";

import { useMemo, useState } from "react";
import { CornerDownRight, Flag, GitBranch, Maximize2, ShieldAlert } from "lucide-react";
import type { FormDoc } from "@repo/form-schema";
import { toneOf } from "@/lib/block-tone";
import { computeQuestionFlow } from "@/components/builder/branch-layout";
import { isGoto } from "@/components/builder/flow-graph";
import { blockMeta } from "@/components/builder/block-library";
import { PannableFlow, TemplateFlow } from "@/components/templates/template-flow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The two panes — the conversation and the flow — with the full-screen flow
 * dialog behind "Expand".
 *
 * Shared by the template pages and the use-case guides, so "what this
 * template asks" is drawn once.
 */
export function TemplatePanes({
  doc,
  title,
  className,
}: {
  doc: FormDoc;
  title: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* An explicit `minmax(0,1fr)` below `lg` too: an implicit grid column
          sizes to its widest child, and on a phone that was a condition chip,
          which pushed the conversation pane off the right edge of the screen. */}
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]",
          className,
        )}
      >
        <Conversation doc={doc} />

        <Panel
          title="The flow"
          description="Where each answer leads. Every route here is editable once the form is yours."
          action={
            <Button variant="ghost" size="sm" shape="pill" onClick={() => setExpanded(true)}>
              <Maximize2 className="size-3.5" />
              Expand
            </Button>
          }
        >
          <div className="bg-muted/30 border-border min-h-0 flex-1 rounded-xl border p-2">
            <TemplateFlow doc={doc} height="100%" className="h-full" />
          </div>
          <FlowLegend doc={doc} />
        </Panel>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        {/* A set height, not just the panel's max: the viewport inside fills
            its parent, and a parent sized by its content has nothing to fill. */}
        <DialogContent size="full" layout="panel" className="h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)]">
          <DialogHeader className="border-border border-b p-4">
            <DialogTitle className="font-display text-base">{title}: flow</DialogTitle>
          </DialogHeader>
          <div className="bg-muted/30 relative min-h-0 flex-1">
            <PannableFlow doc={doc} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The questions, as the conversation they are.
 *
 * Bubbles rather than a table, because that is what a respondent sees and the
 * whole claim of the product is that a form can be a conversation. Each one
 * carries what the builder's own question list carries — its type, whether it
 * is required, whether it is asked of everyone, and whether it splits the flow
 * — so nothing here is a second opinion about the document.
 */
function Conversation({ doc }: { doc: FormDoc }) {
  const flow = useMemo(() => computeQuestionFlow(doc), [doc]);
  const greeting = doc.blocks.find((b) => b.type === "welcome" || b.type === "statement");
  const questions = doc.blocks.filter((b) => b.type !== "welcome" && b.type !== "statement");

  return (
    <Panel
      title="The conversation"
      description="What a respondent is asked, in order."
      scroll
    >
      <div className="space-y-3">
        {greeting?.title && (
          <p className="bg-muted text-foreground w-fit max-w-[90%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm">
            {greeting.title}
          </p>
        )}

        {questions.map((q, i) => {
          const meta = blockMeta(q.type);
          const step = flow.get(q.ref);
          const tone = toneOf(q.type);
          return (
            <div key={q.ref} className="flex items-start gap-2.5">
              <span className={cn("tabular mt-1.5 grid size-6 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold", tone.chip)}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="bg-muted text-foreground w-fit max-w-full rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm">
                  {q.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-1">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium", tone.chip)}>
                    <meta.icon className="size-3" strokeWidth={2} />
                    {meta.label}
                  </span>
                  <span className="text-foreground/60 text-[0.6875rem]">{q.required ? "required" : "optional"}</span>

                  {/* The same chip the builder's question list uses: an
                      expression in another typeface, so it cannot be misread as
                      more question. */}
                  {step?.conditional && (
                    <span className="text-foreground/70 inline-flex max-w-full items-center gap-1 rounded bg-[color-mix(in_oklch,currentColor_14%,transparent)] px-1 py-0.5 font-mono text-[0.625rem] leading-none">
                      <CornerDownRight className="size-2.5 shrink-0 opacity-60" strokeWidth={2.5} />
                      <span className="truncate opacity-85">{step.condition ?? "sometimes asked"}</span>
                    </span>
                  )}

                  {step?.branches && (
                    <span className="text-primary inline-flex items-center gap-1 text-[0.6875rem] font-medium">
                      <GitBranch className="size-3" strokeWidth={2} />
                      splits the flow
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/*
        Every ending, not just the first.

        A template that can turn someone away is a different template from one
        that cannot, and showing only the sign-off hid exactly that difference.
      */}
      <div className="border-border mt-5 space-y-2 border-t pt-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {doc.endings.length === 1 ? "Ends with" : "Endings"}
        </p>
        {doc.endings.map((ending) => {
          const screenOut = ending.kind === "screen_out";
          const Icon = screenOut ? ShieldAlert : Flag;
          return (
            <div key={ending.ref} className="flex items-start gap-2">
              <Icon
                className={cn("mt-0.5 size-3.5 shrink-0", screenOut ? "text-muted-foreground" : "text-primary")}
                strokeWidth={1.75}
              />
              <p className="text-foreground min-w-0 text-sm">
                {ending.title}
                {screenOut && (
                  <span className="text-muted-foreground ml-1.5 text-[0.6875rem]">· can&apos;t submit</span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/**
 * What the shapes on the diagram mean.
 *
 * Only for the marks that are not self-evident. A legend that names the
 * question box as "a question" is furniture; the one thing a reader genuinely
 * cannot infer is that two endings can differ in kind.
 */
function FlowLegend({ doc }: { doc: FormDoc }) {
  const screensOut = doc.endings.some((e) => e.kind === "screen_out");
  const branches = doc.logic.filter(isGoto).some((r) => (r.when?.conditions.length ?? 0) > 0);
  if (!screensOut && !branches) return null;
  return (
    <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {branches && (
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="size-3.5" strokeWidth={1.75} />A labelled route is taken only by
          answers matching the label
        </span>
      )}
      {screensOut && (
        <span className="inline-flex items-center gap-1.5">
          <ShieldAlert className="size-3.5" strokeWidth={1.75} />
          Grey endings turn a respondent away
        </span>
      )}
    </div>
  );
}

/**
 * The pane wrapper both columns share, so the two read as one screen.
 *
 * Both are 80% of the screen tall, whatever the template: the content scrolls
 * inside, so a twelve-question list never outgrows the flow beside it.
 */
function Panel({
  title,
  description,
  action,
  scroll,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  /** Scroll the body as one column; the flow scrolls its own frame instead. */
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border-border flex h-[80svh] flex-col rounded-2xl border p-5 shadow-xs">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="text-foreground/65 mt-0.5 text-xs">{description}</p>
        </div>
        {action}
      </div>
      {scroll ? <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">{children}</div> : children}
    </section>
  );
}
