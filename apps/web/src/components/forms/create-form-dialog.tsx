"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Mic, Plus, Search, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { useDictation } from "@/hooks/use-dictation";
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
import { FormGenerationProgress, useFormGeneration } from "@/components/forms/form-generation";
import { TemplateCard, TemplateCardSkeleton } from "@/components/templates/template-card";
import { usePostApiForms, usePostApiTemplatesBySlugUse } from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { invalidateForms } from "@/lib/query-keys";
import { filterTemplates, templateCategories, useTemplates } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { seedAiBarThread } from "@/components/builder/ai-bar-thread";
import {
  AddKnowledgeButton,
  StagedKnowledgeDialog,
  flushStagedKnowledge,
  type StagedItem,
} from "@/components/knowledge/staged-knowledge";

/**
 * Every way into a new form, on one screen — but not three equal ways.
 *
 * The describe box is the primary path and now reads like it: full width, a
 * three-line well, text at reading size, and the only filled button on the
 * screen. Under it sits the quiet fallback (blank), and then, after real air
 * and a rule, the template gallery. All three used to be stacked at the same
 * weight in the same rounded boxes, three rows apart, which read as three
 * competing offers rather than one suggestion with alternatives.
 *
 * The composer also carries no brand wash of its own any more. A tinted
 * orange panel wrapping an orange button is the brand twice at two
 * strengths, and it muddies both; the card is neutral, and the button
 * carries the colour alone.
 */

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
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const generation = useFormGeneration();

  const [prompt, setPrompt] = useState("");
  /**
   * Knowledge chosen before the form exists.
   *
   * Held here rather than uploaded on selection because there is no form id to
   * upload against yet — `generate` flushes it the moment there is one.
   */
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  /**
   * The workspace the new form lands in — whichever one the dashboard behind
   * this dialog is showing.
   *
   * All three creation paths below have to carry it. They did not when
   * workspaces became selectable, and the failure is quiet in the worst way:
   * the form is created successfully, in a folder the user is not looking at,
   * so it reads as a form that was never made.
   *
   * A slug, not an id — `requireWorkspace` resolves either, inside the caller's
   * organization and nowhere else.
   */
  const ws = searchParams.get("ws") ?? undefined;

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

  const generate = () => {
    const brief = prompt.trim().slice(0, PROMPT_MAX);
    void generation.start(
      { prompt: brief, workspaceId: ws },
      (result) => {
        void invalidateForms(queryClient);
        // The brief starts the builder's AI thread, so the first message about
        // this form is the one that made it — and every follow-up amends it
        // instead of arriving out of nowhere.
        seedAiBarThread(result.formId, brief, {
          title: result.title,
          questions: result.questions,
          rules: result.rules,
        });
        // Fire-and-forget: ingestion is asynchronous anyway, and the Knowledge
        // tab is where its progress and any failure belong. Blocking the route
        // change on an upload would make creating a form feel slower than it is.
        if (staged.length > 0) {
          void flushStagedKnowledge(result.formId, staged);
          setStaged([]);
        }
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
      setSearch("");
      setCategory("all");
    }
    onOpenChange(next);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="3xl" layout="panel" className="gap-0">
        <DialogHeader className="border-border shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle className="font-display text-xl">
            {drafting ? "Building your form" : "Create a form"}
          </DialogTitle>
          {/* Idle, the screen explains itself — a box, a blank row, a
              gallery. The description stays for screen readers only. */}
          <DialogDescription className={cn(!drafting && "sr-only")}>
            {drafting
              ? "Reading what you gave me and drafting the conversation."
              : "Describe the form you need, start from a template, or start blank."}
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
            <div>
              <AiPanel
                knowledgeCount={staged.length}
                onOpenKnowledge={() => setKnowledgeOpen(true)}
                prompt={prompt}
                setPrompt={setPrompt}
                canGenerate={canGenerate}
                onGenerate={generate}
              />

              {/* The alternative, kept close to the composer so it reads as
                  part of the same decision rather than a separate offer. One
                  click, one form: naming it here asked for the one decision
                  the builder is better at collecting, on the screen you are
                  trying to leave. It lands as "Untitled form" and gets its
                  real name in the builder's title field. */}
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  shape="pill"
                  disabled={createBlank.isPending}
                  onClick={() =>
                    createBlank.mutate({ data: { title: "Untitled form", workspaceId: ws } })
                  }
                >
                  <Plus className="size-4" strokeWidth={1.75} />
                  {createBlank.isPending ? "Creating…" : "Start blank"}
                </Button>
              </div>

              {/* A rule and real air: the gallery is its own offer, not the
                  third box in a stack of boxes. */}
              <section className="border-border mt-9 space-y-4 border-t pt-7">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-display text-base font-semibold">Templates</h3>
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
                          useTemplate.mutate({ slug: t.slug, params: ws ? { ws } : undefined });
                        }}
                        // The card leads to the template's own page, so this
                        // dialog gets out of the way rather than sitting over
                        // the route it just sent you to.
                        onOpen={() => onOpenChange(false)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </DialogBody>

        {/* The ⌘↵ hint used to live down here, a full screen away from the box
            it applies to. It sits in the composer now, so this bar is left
            with the one thing that belongs on it. */}
        {!drafting && (
          <div className="border-border text-muted-foreground flex shrink-0 items-center justify-end gap-3 border-t px-6 py-3 text-xs">
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

    <StagedKnowledgeDialog
      open={knowledgeOpen}
      onOpenChange={setKnowledgeOpen}
      items={staged}
      onChange={setStaged}
    />
    </>
  );
}

/** The prompt box: the one thing on this screen asking to be used. */
function AiPanel({
  prompt,
  setPrompt,
  canGenerate,
  onGenerate,
  knowledgeCount,
  onOpenKnowledge,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  canGenerate: boolean;
  onGenerate: () => void;
  knowledgeCount: number;
  onOpenKnowledge: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Describing a form is a few sentences, which is easier said than typed.
  // Words land in the box to be read back, not straight off to the generator.
  const dictation = useDictation({
    text: prompt,
    onChange: setPrompt,
    onError: (message) => toast.error(message),
  });

  // A recogniser still writing into the box would keep changing a brief that
  // has already gone.
  const submit = () => {
    dictation.stop();
    onGenerate();
  };

  // Grow to fit, between a floor and a ceiling. The floor is three lines, so
  // the box reads as the main event before anything is typed; the ceiling
  // stops a pasted paragraph from pushing the gallery off the screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 88), 208)}px`;
  }, [prompt]);

  return (
    <section
      className={cn(
        "border-border bg-card rounded-2xl border shadow-xs",
        "transition-[border-color,box-shadow] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        // Focus darkens the edge rather than lighting up the brand ring. The
        // ring is orange, and a full orange outline around a box this size is
        // the wash this panel just lost, drawn one pixel thick instead.
        "focus-within:border-foreground/25 focus-within:shadow-md",
      )}
    >
      {/* Borderless inside its own container: two nested boxes around one
          sentence is a box too many. Held at text-base on every breakpoint —
          this is the field the screen is built around, not a settings input. */}
      <Textarea
        ref={ref}
        id="ai-prompt"
        rows={3}
        value={prompt}
        maxLength={PROMPT_MAX}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canGenerate) submit();
        }}
        aria-label="Describe the form you need"
        placeholder="Describe the form you need…"
        className={cn(
          "field-sizing-fixed min-h-0 resize-none border-0 bg-transparent shadow-none",
          "px-4 pt-4 pb-1 text-base leading-relaxed md:text-base",
          "placeholder:text-muted-foreground/60 focus-visible:border-0 focus-visible:ring-0",
          "dark:bg-transparent",
        )}
      />

      {/* The URL trick belongs on this line, not in the placeholder: a
          placeholder offering two options is an instruction, and it vanishes
          the moment anyone starts typing. */}
      <div className="flex items-center gap-3 px-4 pt-1 pb-3">
        {/* Knowledge sits with the brief because it is the same act: what the
            form should ask, and what it should already know. Quiet, because
            Generate is the thing on this row that has to be found. */}
        <AddKnowledgeButton count={knowledgeCount} onClick={onOpenKnowledge} />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </span>
          {/* Nothing at all where the browser has no recogniser — a mic that
              cannot listen is worse than no mic. */}
          {dictation.supported && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              shape="pill"
              onClick={() => {
                dictation.toggle();
                ref.current?.focus();
              }}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? "Stop dictating" : "Dictate"}
              className={cn(
                "text-muted-foreground shrink-0",
                dictation.listening && "text-destructive hover:text-destructive",
              )}
            >
              {dictation.listening ? (
                <span className="relative flex size-3.5 items-center justify-center">
                  <span className="bg-destructive/25 absolute inline-flex size-full animate-ping rounded-full" />
                  <Square className="size-2.5 fill-current" />
                </span>
              ) : (
                <Mic className="size-[1.125rem]" />
              )}
            </Button>
          )}
          <Button shape="pill" disabled={!canGenerate} onClick={submit}>
            <Sparkles className="size-4" />
            Generate
          </Button>
        </div>
      </div>
    </section>
  );
}
