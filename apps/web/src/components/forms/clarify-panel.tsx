"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The two or three things the generator needs before it can draft.
 *
 * A form generator that guesses is better than one that interrogates — which
 * is why `CLARIFY_SYSTEM` returns nothing far more often than it returns
 * something, and why this screen is not on the path of a clear request. But
 * there are answers it cannot invent and must not fake: the author's own UPI
 * id, their booking link, which plans get their own branch. Those used to be
 * guessed, and the author found out by opening a form with a dead end in it.
 *
 * So this exists for the minority of requests that genuinely have a hole in
 * them, and it is built to be left: every question is skippable, and "Just
 * build it" is on screen the whole time. Nothing here is a gate.
 *
 * The controls are typed rather than a free-text box per question. Asking
 * "which platforms?" and getting a paragraph back is the same parsing problem
 * the form runtime already solved with composers — a choice is chips, anything
 * else is a box, and both come back as a string the prompt can carry.
 */

export interface ClarifyQuestion {
  question: string;
  why: string;
  kind: "choice" | "text";
  options: string[];
  /** A choice where several options can apply. Absent on older responses. */
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
}: {
  /** What the author wrote, shown back so the thread reads as a conversation. */
  prompt: string;
  questions: ClarifyQuestion[];
  onSubmit: (answers: ClarifyAnswer[]) => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  // Picks for a multi-select choice, kept as a list and joined on submit.
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  const firstBox = useRef<HTMLTextAreaElement>(null);

  // The first text answer takes focus, so a keyboard-first author can answer
  // without reaching for the mouse. A choice question needs no focus — its
  // options are one tab away and reading them is the point.
  useEffect(() => {
    if (questions[0]?.kind === "text") firstBox.current?.focus();
  }, [questions]);

  const set = (i: number, v: string) => setAnswers((prev) => ({ ...prev, [i]: v }));
  const toggle = (i: number, option: string) =>
    setPicks((prev) => {
      const had = prev[i] ?? [];
      return { ...prev, [i]: had.includes(option) ? had.filter((o) => o !== option) : [...had, option] };
    });
  const answerFor = (q: ClarifyQuestion, i: number) =>
    q.kind === "choice" && q.multiple ? (picks[i] ?? []).join(", ") : (answers[i] ?? "");
  const answered = questions.filter((q, i) => answerFor(q, i).trim()).length;

  const submit = () => onSubmit(questions.map((q, i) => ({ question: q.question, answer: answerFor(q, i) })));

  // Enter builds, Shift+Enter skips — the two things this screen is for, on the
  // keys an author already has a finger on. Anywhere a key means something else
  // it is left alone: Enter in a box is a newline and Enter on a chip picks it,
  // so a control that takes typing or activation keeps its own behaviour and
  // only the panel's empty space answers for the buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "BUTTON" || el?.isContentEditable)
        return;
      e.preventDefault();
      if (e.shiftKey) onSkip();
      else submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-5">
      {/* Their own words, first. The thread starts where they started. */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex justify-end"
      >
        <p className="bg-muted text-foreground max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
          {prompt}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start gap-2.5"
      >
        <span className="bg-primary/10 text-primary mt-0.5 grid size-7 shrink-0 place-items-center rounded-full">
          <Sparkles className="size-3.5" strokeWidth={1.75} />
        </span>
        <p className="text-muted-foreground pt-1 text-sm">
          {questions.length === 1
            ? "One thing before I draft this —"
            : `A couple of things before I draft this —`}
        </p>
      </motion.div>

      <div className="space-y-5 pl-9">
        {questions.map((q, i) => (
          <motion.div
            key={q.question}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.14 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-2.5"
          >
            <div>
              <p className="text-foreground text-sm font-medium">{q.question}</p>
              {q.kind === "choice" && q.multiple ? (
                <p className="text-muted-foreground mt-0.5 text-xs">Pick any that apply.</p>
              ) : null}
              {q.why.trim() ? (
                <p className="text-muted-foreground mt-0.5 text-xs">{q.why}</p>
              ) : null}
            </div>

            {q.kind === "choice" ? (
              <div className="flex flex-wrap gap-2">
                {q.options.map((option) => {
                  const picked = q.multiple ? (picks[i] ?? []).includes(option) : answers[i] === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => (q.multiple ? toggle(i, option) : set(i, picked ? "" : option))}
                      aria-pressed={picked}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                        // Picked is an outline and a tint, not a fill: a filled
                        // chip read as a button that had been pressed to act,
                        // right beside "Build it", which is one.
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
              </div>
            ) : (
              <Textarea
                ref={i === 0 ? firstBox : undefined}
                value={answers[i] ?? ""}
                onChange={(e) => set(i, e.target.value)}
                placeholder="Type your answer, or leave it blank"
                rows={2}
                className="resize-none text-sm"
                // In a box Enter is still a newline — submitting a
                // half-written answer on a stray keypress is worse than
                // needing one more keystroke — so the panel's Enter gives way
                // here and ⌘↵ carries it instead.
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            )}
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.14 + questions.length * 0.07 }}
        className="flex items-center gap-2 pl-9"
      >
        <Button onClick={submit} disabled={busy} shape="pill">
          {busy ? "Starting…" : answered > 0 ? "Build it" : "Build it anyway"}
          {/* The key that fires it, on the control it fires — an arrow only
              ever said "forward", which the label already said. */}
          <Kbd tone="inverse" className="w-auto px-1.5">
            ↵
          </Kbd>
        </Button>
        {/* Always available, never a gate. An author who wants a draft more
            than they want to answer questions should get one. */}
        <Button variant="ghost" size="sm" shape="pill" onClick={onSkip} disabled={busy}>
          Skip these
          <Kbd className="w-auto px-1.5">⇧↵</Kbd>
        </Button>
        <span className="text-muted-foreground ml-auto text-xs">
          {answered === 0
            ? "All optional"
            : `${answered} of ${questions.length} answered`}
        </span>
      </motion.div>
    </div>
  );
}
