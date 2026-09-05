"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Search, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { FilterChips } from "@/components/ui/filter-chips";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormGenerationProgress, useFormGeneration } from "@/components/forms/form-generation";
import { TemplateCard, TemplateCardSkeleton } from "@/components/templates/template-card";
import { usePostApiForms, usePostApiTemplatesBySlugUse } from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { invalidateForms } from "@/lib/query-keys";
import { filterTemplates, templateCategories, useTemplates } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * Every way into a new form, on one screen.
 *
 * This used to be a `max-w-lg` dialog with a two-option toggle — describe it,
 * or start blank — and templates were a separate page you had to already know
 * about. Choosing between two things is not a decision worth a toggle, and
 * hiding the third option behind navigation meant the templates were, in
 * practice, unused.
 *
 * So all three are visible at once and ranked by how most forms actually get
 * made: describe it, start from something, start from nothing. No tabs — a
 * tab would put the gallery back behind a click, which is the problem.
 */

const EXAMPLES = [
  {
    label: "Customer feedback",
    prompt:
      "A customer satisfaction survey for our checkout flow — how easy it was, what got in the way, and whether they'd buy again.",
  },
  {
    label: "Lead qualification",
    prompt:
      "A lead form for our B2B SaaS — collect name, work email, company size and budget, and ask what problem they're trying to solve.",
  },
  {
    label: "Event RSVP",
    prompt:
      "An RSVP for our launch party on the 14th — who's coming, plus-ones, dietary requirements and whether they need parking.",
  },
  {
    label: "Job application",
    prompt:
      "An application form for a senior frontend role — experience, portfolio link, notice period, and why they want to join us.",
  },
  {
    label: "Bug report",
    prompt:
      "A bug report form for our support team — what broke, steps to reproduce, browser and OS, severity, and a screenshot upload.",
  },
];

const TONES = ["Friendly", "Professional", "Playful", "Direct"] as const;
const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Hindi", "Japanese"] as const;

/** The endpoint caps the prompt at 2000 characters; so does this. */
const PROMPT_MAX = 2000;

export function CreateFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const generation = useFormGeneration();

  const [prompt, setPrompt] = useState("");
  const [questionCount, setQuestionCount] = useState("6");
  const [tone, setTone] = useState<string>(TONES[0]);
  const [language, setLanguage] = useState<string>(LANGUAGES[0]);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const [blankOpen, setBlankOpen] = useState(false);
  const [title, setTitle] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const { templates, isLoading: templatesLoading } = useTemplates();
  const categories = useMemo(() => templateCategories(templates), [templates]);
  const shown = useMemo(
    () => filterTemplates(templates, search, category),
    [templates, search, category],
  );

  const drafting = generation.running || generation.error !== null;

  const createBlank = usePostApiForms<Error>({
    mutation: {
      onSuccess: async (created) => {
        await invalidateForms(queryClient);
        onOpenChange(false);
        setTitle("");
        setBlankOpen(false);
        router.push(`/forms/${apiData<{ id: string }>(created).id}/build`);
      },
      onError: (e) =>
        toast.error("Couldn't create the form", { description: e.message }),
    },
  });

  const useTemplate = usePostApiTemplatesBySlugUse<Error>({
    mutation: {
      onSuccess: async (created) => {
        await invalidateForms(queryClient);
        onOpenChange(false);
        router.push(`/forms/${apiData<{ id: string }>(created).id}/build`);
      },
      onError: (e) =>
        toast.error("Couldn't start from this template", { description: e.message }),
      onSettled: () => setPendingSlug(null),
    },
  });

  const busy = generation.running || createBlank.isPending || useTemplate.isPending;
  const canGenerate = prompt.trim().length > 5 && !busy;

  /**
   * Tone and language are folded into the prompt rather than sent as fields.
   *
   * The endpoint's body is `{ prompt, questionCount }` and nothing else — so
   * a tone select wired to a parameter that does not exist would be a control
   * that visibly does nothing. Appended as a sentence they reach the model
   * the same way the rest of the description does, which is the only place
   * they were ever going to be read.
   */
  const composePrompt = () => {
    const extras: string[] = [];
    if (tone !== TONES[0]) extras.push(`Use a ${tone.toLowerCase()} tone.`);
    if (language !== LANGUAGES[0]) extras.push(`Write the questions in ${language}.`);
    const body = prompt.trim();
    if (extras.length === 0) return body.slice(0, PROMPT_MAX);
    return `${body}\n\n${extras.join(" ")}`.slice(0, PROMPT_MAX);
  };

  const generate = () => {
    void generation.start(
      { prompt: composePrompt(), questionCount: Number(questionCount) },
      (result) => {
        void invalidateForms(queryClient);
        setPrompt("");
        // A beat on the finished checklist, so the last step is seen landing
        // rather than replaced mid-animation by a route change.
        window.setTimeout(() => {
          onOpenChange(false);
          generation.reset();
          router.push(`/forms/${result.formId}/build`);
        }, 450);
      },
    );
  };

  /**
   * Closing mid-generation cancels it. The form is only written at the very
   * end of the stream, so nothing half-made is left behind.
   *
   * Everything but the prompt is also reset here, so reopening is a clean
   * sheet rather than someone else's half-finished search. Reset on close
   * rather than in an effect watching `open`: closing is the event, and an
   * effect would only re-derive it a render later.
   */
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      generation.cancel();
      generation.reset();
      setBlankOpen(false);
      setTitle("");
      setSearch("");
      setCategory("all");
      setOptionsOpen(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="3xl" layout="panel" className="gap-0">
        <DialogHeader className="border-border shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle className="font-display text-xl">
            {drafting ? "Building your form" : "Create a form"}
          </DialogTitle>
          <DialogDescription>
            {drafting
              ? "Reading what you gave me and drafting the conversation."
              : "Describe it, start from a template, or start with a blank page."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="px-6 py-5">
          {drafting ? (
            <FormGenerationProgress
              stages={generation.stages}
              questions={generation.questions}
              pages={generation.pages}
              notice={generation.notice}
              error={generation.error}
              onCancel={() => {
                generation.cancel();
                generation.reset();
              }}
              onRetry={generate}
            />
          ) : (
            <div className="space-y-6">
              <AiPanel
                prompt={prompt}
                setPrompt={setPrompt}
                questionCount={questionCount}
                setQuestionCount={setQuestionCount}
                tone={tone}
                setTone={setTone}
                language={language}
                setLanguage={setLanguage}
                optionsOpen={optionsOpen}
                setOptionsOpen={setOptionsOpen}
                canGenerate={canGenerate}
                onGenerate={generate}
              />

              <div className="flex items-center gap-3">
                <span className="bg-border h-px flex-1" />
                <span className="text-muted-foreground text-xs">or start from</span>
                <span className="bg-border h-px flex-1" />
              </div>

              <BlankRow
                open={blankOpen}
                setOpen={setBlankOpen}
                title={title}
                setTitle={setTitle}
                pending={createBlank.isPending}
                onCreate={() =>
                  createBlank.mutate({ data: { title: title.trim() || "Untitled form" } })
                }
              />

              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">Templates</h3>
                  <div className="relative ml-auto w-full sm:w-56">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search templates…"
                      aria-label="Search templates"
                      className="h-8 rounded-full pl-8 text-xs"
                    />
                  </div>
                </div>

                {categories.length > 1 && (
                  <FilterChips
                    ariaLabel="Template category"
                    value={category}
                    onChange={setCategory}
                    options={[
                      { value: "all", label: "All", count: templates.length },
                      ...categories.map((c) => ({
                        value: c,
                        label: c,
                        count: templates.filter((t) => t.category === c).length,
                      })),
                    ]}
                  />
                )}

                {templatesLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[0, 1, 2, 3].map((i) => (
                      <TemplateCardSkeleton key={i} variant="compact" />
                    ))}
                  </div>
                ) : shown.length === 0 ? (
                  <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
                    No template matches that. Describe what you need above instead.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {shown.map((t) => (
                      <TemplateCard
                        key={t.slug}
                        template={t}
                        variant="compact"
                        pending={pendingSlug === t.slug}
                        disabled={busy && pendingSlug !== t.slug}
                        onUse={() => {
                          setPendingSlug(t.slug);
                          useTemplate.mutate({ slug: t.slug });
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </DialogBody>

        {!drafting && (
          <div className="border-border text-muted-foreground flex shrink-0 items-center justify-between gap-3 border-t px-6 py-3 text-xs">
            <span className="flex items-center gap-1.5">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
              to generate
            </span>
            <Link
              href="/templates"
              onClick={() => onOpenChange(false)}
              className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              Browse all templates
              <ArrowRight className="size-3" />
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The prompt box, its examples, and the options that shape the draft. */
function AiPanel({
  prompt,
  setPrompt,
  questionCount,
  setQuestionCount,
  tone,
  setTone,
  language,
  setLanguage,
  optionsOpen,
  setOptionsOpen,
  canGenerate,
  onGenerate,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  questionCount: string;
  setQuestionCount: (v: string) => void;
  tone: string;
  setTone: (v: string) => void;
  language: string;
  setLanguage: (v: string) => void;
  optionsOpen: boolean;
  setOptionsOpen: (v: boolean) => void;
  canGenerate: boolean;
  onGenerate: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow to fit, up to a ceiling. A fixed four-row box either wastes half the
  // panel on one line or hides the end of a paragraph.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  return (
    <section className="border-primary/15 bg-primary-soft/50 rounded-2xl border p-4">
      <div className="flex items-center gap-2">
        <span className="bg-primary/10 text-primary grid size-7 place-items-center rounded-lg">
          <Sparkles className="size-4" strokeWidth={1.75} />
        </span>
        <h3 className="font-display text-sm font-semibold">Describe the form you need</h3>
      </div>

      <Textarea
        ref={ref}
        id="ai-prompt"
        rows={3}
        value={prompt}
        maxLength={PROMPT_MAX}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canGenerate) onGenerate();
        }}
        placeholder="A waitlist form for our launch at example.com — collect email, company size, and what problem they're hoping we solve."
        className="bg-card mt-3 resize-none text-sm"
      />

      <p className="text-muted-foreground mt-2 text-xs">
        Include your site&apos;s URL and it reads the page first, so the questions know your product.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            // Fills the box rather than submitting: an example is a starting
            // point to edit, not a form someone actually asked for.
            onClick={() => {
              setPrompt(ex.prompt);
              ref.current?.focus();
            }}
            className="border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground rounded-full border px-2.5 py-1 text-xs transition-colors duration-[var(--duration-micro)]"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOptionsOpen(!optionsOpen)}
          aria-expanded={optionsOpen}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <Settings2 className="size-3.5" strokeWidth={1.75} />
          {optionsOpen ? "Hide options" : `${questionCount} questions · ${tone} · ${language}`}
        </button>

        <Button
          shape="pill"
          disabled={!canGenerate}
          onClick={onGenerate}
          className="ml-auto"
        >
          <Sparkles className="size-4" />
          Generate form
        </Button>
      </div>

      {optionsOpen && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <LabelledSelect label="Questions" value={questionCount} onChange={setQuestionCount}>
            {["4", "6", "8", "10", "12", "15"].map((n) => (
              <SelectItem key={n} value={n}>
                {n} questions
              </SelectItem>
            ))}
          </LabelledSelect>
          <LabelledSelect label="Tone" value={tone} onChange={setTone}>
            {TONES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </LabelledSelect>
          <LabelledSelect label="Language" value={language} onChange={setLanguage}>
            {LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </LabelledSelect>
        </div>
      )}
    </section>
  );
}

function LabelledSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-card h-8 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </label>
  );
}

/** The blank option: a row until it is chosen, then a name field. */
function BlankRow({
  open,
  setOpen,
  title,
  setTitle,
  pending,
  onCreate,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  title: string;
  setTitle: (v: string) => void;
  pending: boolean;
  onCreate: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "border-border bg-card group flex w-full items-center gap-3 rounded-2xl border p-4 text-left",
          "shadow-xs transition-[box-shadow,transform,border-color] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
          "hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0",
          "focus-visible:ring-ring/40 focus-visible:ring-2 focus-visible:outline-none",
        )}
      >
        <span className="bg-muted text-foreground grid size-10 shrink-0 place-items-center rounded-xl">
          <Plus className="size-5" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display block text-sm font-semibold">Blank form</span>
          <span className="text-muted-foreground block text-xs">
            A greeting and one question — build the rest yourself.
          </span>
        </span>
        <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors" />
      </button>
    );
  }

  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <label htmlFor="form-title" className="text-sm font-medium">
        Name your form
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input
          ref={ref}
          id="form-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Customer feedback"
          className="min-w-0 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !pending) onCreate();
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <Button shape="pill" disabled={pending} onClick={onCreate}>
          {pending ? "Creating…" : "Create"}
        </Button>
        <Button shape="pill" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Leave it blank and it will be called “Untitled form”.
      </p>
    </div>
  );
}
