"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * What the AI needs to know before it builds, one question at a time.
 *
 * Shared by the New form dialog (before a first draft) and the builder's chat
 * (before an edit), so asking back looks and works the same in both. The
 * model returns nothing far more often than something (see `CLARIFY_SYSTEM`),
 * so this is only on the path of a request with a real hole in it: the plans
 * that get their own branch, what makes a team eligible, a booking link.
 *
 * One question per step, because the builder's chat is a small box and three
 * questions stacked in it is a wall. Every step can be skipped, answered from
 * the offered choices, or answered in the author's own words, and "Just build
 * it" is on screen the whole time: nothing here is a gate.
 */

export interface ClarifyQuestion {
  question: string;
  why: string;
  kind: "choice" | "text";
  options: string[];
  /** Still sent by the model; ignored here, since every choice is multi-select. */
  multiple?: boolean;
}

export interface ClarifyAnswer {
  question: string;
  answer: string;
}

export function ClarifyPanel({
  prompt,
  questions,
  onSubmit,
  onSkip,
  busy,
  intent = "draft",
}: {
  /** What the author wrote, echoed as the thread's first bubble. Omit where the thread already shows it. */
  prompt?: string;
  questions: ClarifyQuestion[];
  onSubmit: (answers: ClarifyAnswer[]) => void;
  onSkip: () => void;
  busy: boolean;
  /** `draft` for a new form, `edit` for a change to one: only the words differ. */
  intent?: "draft" | "edit";
}) {
  const [step, setStep] = useState(0);
  // Every choice is multi-select: the model's `multiple` flag guessed wrong
  // too often, and an author who means one simply picks one.
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  // The author's own words, beside the offered options or instead of them.
  const [typed, setTyped] = useState<Record<number, string>>({});

  const total = questions.length;
  const q = questions[step]!;
  const last = step === total - 1;
  const verb = intent === "draft" ? "build" : "change";

  const answerFor = (i: number) =>
    [...(picks[i] ?? []), (typed[i] ?? "").trim()].filter(Boolean).join(", ");
  const answers = () => questions.map((question, i) => ({ question: question.question, answer: answerFor(i) }));
  const answered = questions.filter((_, i) => answerFor(i)).length;

  const next = () => {
    if (busy) return;
    if (last) onSubmit(answers());
    else setStep((s) => s + 1);
  };
  const skipOne = () => {
    if (busy) return;
    setPicks((p) => ({ ...p, [step]: [] }));
    setTyped((t) => ({ ...t, [step]: "" }));
    if (last) onSubmit(questions.map((question, i) => ({ question: question.question, answer: i === step ? "" : answerFor(i) })));
    else setStep((s) => s + 1);
  };
  const toggle = (option: string) =>
    setPicks((prev) => {
      const had = prev[step] ?? [];
      return { ...prev, [step]: had.includes(option) ? had.filter((o) => o !== option) : [...had, option] };
    });

  // Enter moves on from the panel's empty space; a control that takes typing
  // or activation keeps its own Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (["TEXTAREA", "INPUT", "BUTTON"].includes(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hasAnswer = Boolean(answerFor(step));

  return (
    <div className="space-y-4">
      {prompt ? (
        <div className="flex justify-end">
          <p className="bg-muted text-foreground max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">{prompt}</p>
        </div>
      ) : null}

      <div className="flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-full">
          <Sparkles className="size-3.5" strokeWidth={1.75} />
        </span>
        <p className="text-muted-foreground flex-1 text-sm">
          {total === 1 ? `One thing before I ${verb} this` : `${total} quick things before I ${verb} this`}
        </p>
        {total > 1 ? (
          <span className="flex items-center gap-1" aria-label={`Question ${step + 1} of ${total}`}>
            {questions.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === step ? "bg-primary w-4" : answerFor(i) ? "bg-primary/50 w-1.5" : "bg-border w-1.5",
                )}
              />
            ))}
          </span>
        ) : null}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-3 pl-9"
        >
          <div>
            <p className="text-foreground text-sm font-medium">{q.question}</p>
            {q.why.trim() ? <p className="text-muted-foreground mt-0.5 text-xs">{q.why}</p> : null}
          </div>

          {q.kind === "choice" ? (
            <div className="flex flex-wrap gap-2">
              {q.options.map((option) => {
                const picked = (picks[step] ?? []).includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(option)}
                    aria-pressed={picked}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                      picked
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:border-foreground/30 hover:bg-muted text-foreground",
                    )}
                  >
                    {picked && <Check className="text-primary size-3.5" strokeWidth={2.5} />}
                    {option}
                  </button>
                );
              })}
              {/* Always last, dashed: the author's own answer, one click from typing. */}
              <input
                value={typed[step] ?? ""}
                onChange={(e) => setTyped((prev) => ({ ...prev, [step]: e.target.value }))}
                placeholder="Type your own…"
                aria-label={`Your own answer to: ${q.question}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    next();
                  }
                }}
                className={cn(
                  "field-sizing-content min-w-36 max-w-full rounded-full border border-dashed bg-transparent px-3 py-1.5 text-sm transition-colors",
                  "placeholder:text-muted-foreground text-foreground focus-visible:outline-none",
                  (typed[step] ?? "").trim()
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-foreground/30 focus:border-foreground/40",
                )}
              />
            </div>
          ) : (
            <Textarea
              // A text question is answered by typing, so its box takes focus
              // as it arrives (after the previous step has animated out).
              autoFocus
              value={typed[step] ?? ""}
              onChange={(e) => setTyped((prev) => ({ ...prev, [step]: e.target.value }))}
              placeholder="Type your answer"
              rows={2}
              className="resize-none text-sm"
              // Enter moves on; Shift+Enter is a new line.
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  next();
                }
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center gap-1.5 pl-9">
        {step > 0 ? (
          <Button variant="ghost" size="sm" shape="pill" onClick={() => setStep((s) => s - 1)} disabled={busy} aria-label="Previous question">
            <ArrowLeft className="size-3.5" />
          </Button>
        ) : null}
        <Button onClick={next} disabled={busy} size="sm" shape="pill">
          {busy ? "Starting…" : last ? (answered > 0 ? `${verb === "build" ? "Build" : "Make"} it` : `${verb === "build" ? "Build" : "Make"} it anyway`) : "Next"}
          {last ? <Kbd tone="inverse" className="w-auto px-1.5">↵</Kbd> : <ArrowRight className="size-3.5" />}
        </Button>
        {!hasAnswer ? (
          <Button variant="ghost" size="sm" shape="pill" onClick={skipOne} disabled={busy}>
            Skip
          </Button>
        ) : null}
        {/* Always there: an author who wants the result more than the questions gets it. */}
        {!last ? (
          <Button variant="ghost" size="sm" shape="pill" onClick={onSkip} disabled={busy} className="text-muted-foreground ml-auto">
            Just {verb} it
          </Button>
        ) : null}
      </div>
    </div>
  );
}
