"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, GitBranch, Globe, Loader2, Save, Search, Sparkles, X } from "lucide-react";
import type { Block } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { streamEvents } from "@/lib/api/stream";
import { blockMeta, TONE_CLASSES } from "@/components/builder/block-library";
import { cn } from "@/lib/utils";

/**
 * What the author watches while their form is being written.
 *
 * The whole of this screen exists because the previous one was a single button
 * reading "Drafting your form…" for anywhere up to ninety seconds. Nothing
 * about it distinguished working from hung, and it was measurably often
 * neither: three sequential requests, two model calls, and a stronger model
 * than the job needed. People assumed it had broken, because that is the
 * reasonable assumption.
 *
 * So the wait now reports itself, and every line of it is real. Each stage is
 * a step the server actually performs and announces; each question appears the
 * moment the model has finished writing it, not on a timer. Nothing here is
 * simulated progress — if a step is skipped, it says so, and if the page
 * couldn't be read, it says that too.
 */

type StageId = "reading" | "researching" | "drafting" | "logic" | "saving";
type StageStatus = "pending" | "active" | "done" | "skipped";

interface Stage {
  id: StageId;
  status: StageStatus;
  /** Extra detail from the server — a hostname, a rule count. */
  label?: string;
  startedAt?: number;
}

export interface DraftedQuestion {
  index: number;
  title: string;
  type: string;
}

export interface GenerationResult {
  formId: string;
  title: string;
  questions: number;
  rules: number;
}

const STAGE_ORDER: StageId[] = ["reading", "researching", "drafting", "logic", "saving"];

const STAGE_COPY: Record<StageId, { icon: typeof Globe; active: string; done: string; skipped: string }> = {
  reading: {
    icon: Globe,
    active: "Reading the page",
    done: "Read the page",
    skipped: "Couldn't read the page — drafting from your description alone",
  },
  researching: {
    icon: Search,
    active: "Looking up what this product does",
    done: "Learned what this product does",
    skipped: "Skipped the lookup — drafting from your description alone",
  },
  drafting: { icon: Sparkles, active: "Writing the questions", done: "Questions written", skipped: "Skipped" },
  logic: {
    icon: GitBranch,
    active: "Working out who gets asked what",
    done: "Branching set up",
    skipped: "No branching needed — everyone answers the same questions",
  },
  saving: { icon: Save, active: "Saving your form", done: "Saved", skipped: "Skipped" },
};

/** Live state for one generation run. */
export function useFormGeneration() {
  const [stages, setStages] = useState<Stage[]>(STAGE_ORDER.map((id) => ({ id, status: "pending" })));
  const [questions, setQuestions] = useState<DraftedQuestion[]>([]);
  const [pages, setPages] = useState<{ url: string; title: string | null }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStages(STAGE_ORDER.map((id) => ({ id, status: "pending" })));
    setQuestions([]);
    setPages([]);
    setNotice(null);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(
    async (
      body: { prompt: string; questionCount?: number },
      onDone: (result: GenerationResult) => void,
    ) => {
      reset();
      setRunning(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamEvents("/api/ai/generate-form/stream", {
          body,
          signal: controller.signal,
          onEvent: ({ event, data }) => {
            if (event === "stage") {
              const { id, status, label } = data as { id: StageId; status: "start" | "done" | "skip"; label?: string };
              setStages((prev) =>
                prev.map((s) =>
                  s.id !== id
                    ? s
                    : {
                        ...s,
                        label: label ?? s.label,
                        status: status === "start" ? "active" : status === "done" ? "done" : "skipped",
                        startedAt: status === "start" ? Date.now() : s.startedAt,
                      },
                ),
              );
              return;
            }
            if (event === "question") {
              const q = data as DraftedQuestion;
              // Ordered by the model's own index, so a question is never
              // inserted above one already on screen.
              setQuestions((prev) =>
                prev.some((p) => p.index === q.index) ? prev : [...prev, q].sort((a, b) => a.index - b.index),
              );
              return;
            }
            if (event === "sources") {
              const { pages: read } = data as { pages?: { url: string; title: string | null }[] };
              if (read?.length) setPages((prev) => [...prev, ...read]);
              return;
            }
            if (event === "retry") {
              setNotice((data as { reason: string }).reason);
              return;
            }
            if (event === "error") {
              setError((data as { message: string }).message);
              return;
            }
            if (event === "done") {
              onDone(data as GenerationResult);
            }
          },
        });
      } catch (err) {
        // An abort is the author pressing cancel, not a failure to report.
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setRunning(false);
      }
    },
    [reset],
  );

  return { stages, questions, pages, notice, error, running, start, cancel, reset };
}

export function FormGenerationProgress({
  stages,
  questions,
  pages,
  notice,
  error,
  onCancel,
  onRetry,
}: {
  stages: Stage[];
  questions: DraftedQuestion[];
  pages: { url: string; title: string | null }[];
  notice: string | null;
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
}) {
  // A stage skipped before it ever started did not happen and is not worth a
  // row — no URL in the prompt means there was never a page to read.
  const visible = stages.filter((s) => !(s.status === "skipped" && !s.startedAt));
  const activeIndex = visible.findIndex((s) => s.status === "active");
  const asked = questions.filter((q) => q.type !== "welcome" && q.type !== "statement").length;

  if (error) {
    return (
      <div className="space-y-4 py-2">
        <div className="border-destructive/25 bg-destructive-soft/60 space-y-1 rounded-2xl border p-4">
          <p className="text-foreground text-sm font-medium">That didn&apos;t work</p>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
        <div className="flex gap-2">
          <Button shape="pill" onClick={onRetry}>
            Try again
          </Button>
          <Button shape="pill" variant="ghost" onClick={onCancel}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      <ol className="space-y-0.5">
        {visible.map((stage, i) => (
          <StageRow
            key={stage.id}
            stage={stage}
            pages={stage.id === "reading" ? pages : []}
            isLast={i === visible.length - 1}
            dimmed={activeIndex !== -1 && i > activeIndex}
          >
            {/* Questions belong under the step that writes them, so the list
                reads as the output of that step rather than a separate panel. */}
            {stage.id === "drafting" && questions.length > 0 && <QuestionList questions={questions} />}
          </StageRow>
        ))}
      </ol>

      {notice && (
        <p className="text-muted-foreground px-1 text-xs" role="status">
          {notice}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-muted-foreground text-xs">
          {/* The greeting is drafted like everything else and shown in the list,
              but it is not a question and must not be counted as one — the
              builder would then disagree with this number by exactly one. */}
          {asked > 0 ? `${asked} question${asked === 1 ? "" : "s"} so far` : "This usually takes about 15 seconds."}
        </p>
        <Button shape="pill" variant="ghost" size="sm" onClick={onCancel}>
          <X className="size-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

function StageRow({
  stage,
  pages,
  isLast,
  dimmed,
  children,
}: {
  stage: Stage;
  pages: { url: string; title: string | null }[];
  isLast: boolean;
  dimmed: boolean;
  children?: React.ReactNode;
}) {
  const copy = STAGE_COPY[stage.id];
  const Icon = copy.icon;
  const text =
    stage.status === "done"
      ? copy.done
      : stage.status === "skipped"
        ? copy.skipped
        : stage.id === "reading" && stage.label
          ? `Reading ${stage.label}`
          : copy.active;

  return (
    <li className="flex gap-3">
      {/* The rail: a marker per step, joined by a line so the list reads as one
          sequence rather than five unrelated rows. */}
      <div className="flex flex-col items-center pt-0.5">
        <Marker status={stage.status} Icon={Icon} />
        {!isLast && (
          <div
            className={cn(
              "w-px flex-1 transition-colors duration-500",
              stage.status === "done" || stage.status === "skipped" ? "bg-border" : "bg-border/40",
            )}
          />
        )}
      </div>

      <div className={cn("min-w-0 flex-1 pb-3 transition-opacity duration-300", dimmed && "opacity-35")}>
        <div className="flex items-baseline gap-2">
          <p
            className={cn(
              "text-sm transition-colors",
              stage.status === "active" ? "text-foreground font-medium" : "text-muted-foreground",
            )}
          >
            {text}
          </p>
          {stage.status === "active" && stage.startedAt && <Elapsed since={stage.startedAt} />}
          {stage.status === "done" && stage.id === "logic" && stage.label && (
            <span className="text-muted-foreground text-xs">
              {stage.label} rule{stage.label === "1" ? "" : "s"}
            </span>
          )}
        </div>

        {pages.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {pages.map((p) => (
              <li key={p.url} className="text-muted-foreground truncate text-xs">
                {p.title ?? p.url}
              </li>
            ))}
          </ul>
        )}

        {children}
      </div>
    </li>
  );
}

function Marker({ status, Icon }: { status: StageStatus; Icon: typeof Globe }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-300",
        status === "active" && "border-primary/40 bg-primary-soft text-primary",
        status === "done" && "border-success/30 bg-success-soft text-success",
        status === "skipped" && "border-border bg-muted text-muted-foreground",
        status === "pending" && "border-border bg-card text-muted-foreground/50",
      )}
    >
      {status === "active" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : status === "done" ? (
        <Check className="size-3" strokeWidth={2.5} />
      ) : (
        <Icon className="size-3" />
      )}
    </span>
  );
}

/**
 * Seconds on the step currently running.
 *
 * Deliberately only on the active step. A wait with a visible clock is a wait
 * someone can judge — "6s and still reading" tells you it is working; the same
 * six seconds with no number is when people start reaching for reload.
 */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  if (seconds < 2) return null;
  return <span className="text-muted-foreground/70 text-xs tabular-nums">{seconds}s</span>;
}

function QuestionList({ questions }: { questions: DraftedQuestion[] }) {
  return (
    <ul className="mt-2 space-y-1">
      <AnimatePresence initial={false}>
        {questions.map((q) => {
          const meta = blockMeta(q.type as Block["type"]);
          return (
            <motion.li
              key={q.index}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="bg-muted/50 flex items-center gap-2 rounded-xl px-2 py-1.5"
            >
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-md", TONE_CLASSES[meta.tone])}>
                <meta.icon className="size-2.5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{q.title}</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
