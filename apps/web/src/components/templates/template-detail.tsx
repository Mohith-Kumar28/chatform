"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  ChevronRight,
  Clock,
  CornerDownRight,
  Flag,
  GitBranch,
  Loader2,
  Maximize2,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import type { FormDoc } from "@repo/form-schema";
import { computeQuestionFlow } from "@/components/builder/branch-layout";
import { isGoto } from "@/components/builder/flow-graph";
import { blockMeta } from "@/components/builder/block-library";
import { TemplateFlow } from "@/components/templates/template-flow";
import { TemplateCard } from "@/components/templates/template-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getGetApiTemplatesBySlugQueryKey,
  useGetApiTemplatesBySlug,
  usePostApiTemplatesBySlugUse,
} from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { templateAccent } from "@/lib/category-accent";
import { invalidateForms } from "@/lib/query-keys";
import { useTemplates, type TemplateDetailPayload } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * One template, in full, before anybody commits to it.
 *
 * Clicking a template used to create a form — thirty seconds later you were in
 * the builder looking at eleven questions you had not asked for, and the way
 * out was to delete the form. A template is a decision, and a decision needs
 * something to decide on: what it asks, in what order, and — the part a list
 * of questions cannot show — where the answers take people.
 *
 * Hence two panes. The left is the conversation a respondent has. The right is
 * the same thing as a graph, drawn by the builder's own derivation, because
 * "this one screens people out and that one doesn't" is visible in a diagram
 * in a second and invisible in a list at any length.
 */
export function TemplateDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, error } = useGetApiTemplatesBySlug(slug, {
    query: { queryKey: getGetApiTemplatesBySlugQueryKey(slug), staleTime: 5 * 60_000 },
  });
  const detail = apiData<TemplateDetailPayload | undefined>(data);

  const use = usePostApiTemplatesBySlugUse<Error>({
    mutation: {
      onSuccess: async (created) => {
        await invalidateForms(queryClient);
        router.push(`/forms/${apiData<{ id: string }>(created).id}/build`);
      },
      // Said out loud — a form-count limit or a role that cannot create used to
      // do nothing at all and explain nothing. (A plan denial still opens the
      // global paywall; this is for the rest.)
      onError: (err) => toast.error("Couldn't start from this template", { description: err.message }),
    },
  });

  if (isLoading) return <DetailSkeleton />;

  if (error || !detail) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={Blocks}
          title="This template isn't available"
          description="It may have been renamed or retired. The gallery has the current catalogue."
          action={
            <Button shape="pill" onClick={() => router.push("/templates")}>
              Browse templates
            </Button>
          }
        />
      </div>
    );
  }

  // The endpoint parses the stored document with `FormDoc` and 404s when it no
  // longer satisfies the schema, so what arrives here is already valid. Parsing
  // it a second time in the browser would buy nothing and cost every visitor
  // the schema.
  const doc = detail.doc as FormDoc;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/templates"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors duration-[var(--duration-micro)]"
      >
        <ArrowLeft className="size-3.5" />
        All templates
      </Link>

      <TemplateHero
        detail={detail}
        doc={doc}
        pending={use.isPending}
        onUse={() => use.mutate({ slug })}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Conversation doc={doc} />

        {/* Sticky, because the list beside it is the long column: scrolling to
            question nine should not scroll the flow off the screen. */}
        <div className="lg:sticky lg:top-6 lg:self-start">
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
            <div className="bg-muted/30 border-border rounded-xl border p-2">
              <TemplateFlow doc={doc} height={520} />
            </div>
            <FlowLegend doc={doc} />
          </Panel>
        </div>
      </div>

      <div className="border-border mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <p className="text-muted-foreground text-sm">
          Start from this and change anything — questions, wording, routes, endings.
        </p>
        <UseButton pending={use.isPending} onUse={() => use.mutate({ slug })} />
      </div>

      <Related category={detail.category} slug={slug} />

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent size="full" layout="panel">
          <DialogHeader className="border-border border-b p-4">
            <DialogTitle className="font-display text-base">{detail.title} — flow</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 p-4">
            <TemplateFlow doc={doc} height="fill" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateHero({
  detail,
  doc,
  pending,
  onUse,
}: {
  detail: TemplateDetailPayload;
  doc: FormDoc;
  pending: boolean;
  onUse: () => void;
}) {
  const accent = templateAccent(detail.category, detail.accent, detail.icon);
  const Icon = accent.icon;

  const branchPoints = new Set(
    doc.logic.filter(isGoto).filter((r) => (r.when?.conditions.length ?? 0) > 0).map((r) => r.from),
  ).size;

  const meta = [
    { icon: Blocks, label: `${detail.blockCount} questions` },
    { icon: Clock, label: `~${detail.estMinutes} min to answer` },
    branchPoints > 0
      ? { icon: GitBranch, label: `${branchPoints} branch${branchPoints === 1 ? "" : "es"}` }
      : null,
    doc.endings.length > 1 ? { icon: Flag, label: `${doc.endings.length} endings` } : null,
  ].filter(Boolean) as { icon: typeof Blocks; label: string }[];

  return (
    <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
      <div className="flex min-w-0 max-w-2xl items-start gap-4">
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl", accent.tile)}>
          <Icon className="size-6" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {detail.category}
          </p>
          <h1 className="text-h1 font-display mt-0.5">{detail.title}</h1>
          <p className="text-muted-foreground text-body mt-2 leading-relaxed">
            {detail.blurb || detail.description}
          </p>

          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            {meta.map((m) => (
              <span key={m.label} className="tabular inline-flex items-center gap-1">
                <m.icon className="size-3.5" strokeWidth={1.75} />
                {m.label}
              </span>
            ))}
          </div>

          {detail.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {detail.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[0.6875rem]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <UseButton pending={pending} onUse={onUse} />
    </div>
  );
}

function UseButton({ pending, onUse }: { pending: boolean; onUse: () => void }) {
  return (
    <Button shape="pill" size="lg" disabled={pending} onClick={onUse}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Creating your form…
        </>
      ) : (
        <>
          Use this template
          <ArrowRight className="size-4" />
        </>
      )}
    </Button>
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
          return (
            <div key={q.ref} className="flex items-start gap-2.5">
              <span className="text-muted-foreground tabular mt-2 w-5 shrink-0 text-right text-[0.6875rem]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="bg-muted text-foreground w-fit max-w-full rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm">
                  {q.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-1">
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-[0.6875rem]">
                    <meta.icon className="size-3" strokeWidth={2} />
                    {meta.label}
                    {q.required ? " · required" : " · optional"}
                  </span>

                  {/* The same chip the builder's question list uses: an
                      expression in another typeface, so it cannot be misread as
                      more question. */}
                  {step?.conditional && (
                    <span className="text-muted-foreground inline-flex max-w-full items-center gap-1 rounded bg-[color-mix(in_oklch,currentColor_14%,transparent)] px-1 py-0.5 font-mono text-[0.625rem] leading-none">
                      <CornerDownRight className="size-2.5 shrink-0 opacity-60" strokeWidth={2.5} />
                      <span className="truncate opacity-85">{step.condition ?? "sometimes asked"}</span>
                    </span>
                  )}

                  {step?.branches && (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-[0.6875rem]">
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

/** The pane wrapper both columns share, so the two read as one screen. */
function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border-border rounded-2xl border p-5 shadow-xs">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Other templates for the same job, for the reader who is still choosing. */
function Related({ category, slug }: { category: string; slug: string }) {
  const { templates } = useTemplates();
  const related = templates.filter((t) => t.category === category && t.slug !== slug).slice(0, 3);
  if (related.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-semibold">More in {category}</h2>
        <Link
          href="/templates"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-sm transition-colors duration-[var(--duration-micro)]"
        >
          All templates
          <ChevronRight className="size-3.5" />
        </Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((t) => (
          <li key={t.slug} className="flex">
            <TemplateCard template={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-start gap-4">
        <div className="shimmer size-12 rounded-xl" />
        <div className="flex-1 space-y-2.5 pt-1">
          <div className="shimmer h-3 w-24 rounded" />
          <div className="shimmer h-5 w-64 rounded" />
          <div className="shimmer h-3 w-full max-w-xl rounded" />
        </div>
        <div className="shimmer h-10 w-44 rounded-full" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="border-border h-96 rounded-2xl border p-5">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="shimmer h-9 rounded-2xl" style={{ width: `${88 - i * 7}%` }} />
            ))}
          </div>
        </div>
        <div className="border-border h-96 rounded-2xl border p-5">
          <div className="shimmer h-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
