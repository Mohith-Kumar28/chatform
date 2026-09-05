"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Search, Sparkles } from "lucide-react";
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
 * Three ways in, ranked by how most forms actually get made: describe it,
 * start from a template, start from nothing. All visible at once — a tab
 * would put the gallery back behind a click, which is the problem.
 *
 * The describe box carries no chrome of its own. It had a heading, a hint
 * line, five example pills and a row of tone/length/language selects, which
 * is more instruction than the one sentence it is asking for — and the pills
 * duplicated the template gallery sitting directly beneath them. A box and a
 * button is the whole control now; length and tone are the model's call, and
 * anyone who wants a different one can say so in the sentence.
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
  const queryClient = useQueryClient();
  const generation = useFormGeneration();

  const [prompt, setPrompt] = useState("");

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

  const generate = () => {
    void generation.start(
      { prompt: prompt.trim().slice(0, PROMPT_MAX) },
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
            <div className="space-y-4">
              <AiPanel
                prompt={prompt}
                setPrompt={setPrompt}
                canGenerate={canGenerate}
                onGenerate={generate}
              />

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

/** The prompt box. A box and a button — nothing else. */
function AiPanel({
  prompt,
  setPrompt,
  canGenerate,
  onGenerate,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
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
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [prompt]);

  return (
    <section
      className={cn(
        "border-primary/20 bg-primary-soft/40 rounded-2xl border p-2",
        "focus-within:border-primary/45 transition-colors duration-[var(--duration-standard)]",
      )}
    >
      {/* Borderless inside its own container: two nested boxes around one
          sentence is a box too many. The placeholder is dimmed past the
          usual muted step so it cannot be mistaken for typed text. */}
      <Textarea
        ref={ref}
        id="ai-prompt"
        rows={2}
        value={prompt}
        maxLength={PROMPT_MAX}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canGenerate) onGenerate();
        }}
        aria-label="Describe the form you need"
        placeholder="Describe your form — or paste your site's URL"
        className={cn(
          "min-h-0 resize-none border-0 bg-transparent px-3 py-2 text-sm shadow-none",
          "placeholder:text-muted-foreground/55 focus-visible:border-0 focus-visible:ring-0",
          "dark:bg-transparent",
        )}
      />

      <div className="flex justify-end">
        <Button shape="pill" size="sm" disabled={!canGenerate} onClick={onGenerate}>
          <Sparkles className="size-4" />
          Generate
        </Button>
      </div>
    </section>
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
          "border-border bg-card group flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left",
          "shadow-xs transition-[box-shadow,transform,border-color] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
          "hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0",
          "focus-visible:ring-ring/40 focus-visible:ring-2 focus-visible:outline-none",
        )}
      >
        <span className="bg-muted text-foreground grid size-8 shrink-0 place-items-center rounded-lg">
          <Plus className="size-4" strokeWidth={1.75} />
        </span>
        <span className="font-display min-w-0 flex-1 text-sm font-semibold">Blank form</span>
        <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors" />
      </button>
    );
  }

  return (
    <div className="border-border bg-card rounded-2xl border p-3">
      <div className="flex flex-wrap gap-2">
        <Input
          ref={ref}
          id="form-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Form name"
          placeholder="Name your form"
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
    </div>
  );
}
