"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  Check,
  CircleDot,
  FileClock,
  GitCommitVertical,
  Minus,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Signpost,
  Sparkles,
  Type,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormDoc, migrateFormDoc } from "@repo/form-schema";
import {
  getGetApiFormsByIdHistoryQueryKey,
  getGetApiFormsByIdQueryKey,
  getGetApiFormsByIdVersionsQueryKey,
  useGetApiFormsByIdHistory,
  useGetApiFormsByIdVersions,
  usePostApiFormsByIdVersionsByVersionRestore,
} from "@/lib/api/dashboard/dashboard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/components/forms/form-card";
import { useBuilderStore } from "@/stores/builder-store";
import { cn } from "@/lib/utils";

/**
 * A form's history.
 *
 * Two things people actually ask a screen like this, and the answer to both is the same
 * list read at different depths: *what is live right now, and does my draft differ from
 * it?* — the top of the list — and *when did this question change, and can I have the
 * old one back?* — further down.
 *
 * So it is one timeline, not a log tab beside a versions tab. Versions are the headings
 * and edits are the lines beneath them, because a version with no changelog is a row of
 * numbers and a changelog with no versions is a wall of noise.
 */

interface DocChange {
  op: string;
  target: string;
  label: string;
  from?: string;
  to?: string;
}

interface Entry {
  id: string;
  kind: string;
  summary: string;
  changes: DocChange[];
  changeCount: number;
  actorLabel: string | null;
  source: string;
  createdAt: number;
}

interface Group {
  version: number | null;
  versionId: string | null;
  publishedAt: number | null;
  note: string | null;
  isActive: boolean;
  entries: Entry[];
}

interface VersionMeta {
  version: number;
  versionId: string;
  authorLabel: string | null;
  responses: number;
}

/**
 * How each kind of change is drawn.
 *
 * Additions read green and removals red because those two are the ones people scan for;
 * everything else stays neutral on purpose. A timeline where every line is coloured is a
 * timeline where the colour means nothing.
 */
function changeStyle(op: string): { icon: typeof Plus; tone: string } {
  if (op.endsWith(".added")) return { icon: Plus, tone: "text-[var(--success-soft-foreground)] bg-[var(--success-soft)]" };
  if (op.endsWith(".removed")) return { icon: Minus, tone: "text-destructive bg-destructive/10" };
  if (op === "question.moved") return { icon: ArrowDownUp, tone: "text-muted-foreground bg-muted" };
  if (op.startsWith("logic.")) return { icon: Signpost, tone: "text-muted-foreground bg-muted" };
  if (op === "theme.changed") return { icon: Palette, tone: "text-muted-foreground bg-muted" };
  if (op.startsWith("settings.")) return { icon: Settings2, tone: "text-muted-foreground bg-muted" };
  if (op === "title.changed" || op === "description.changed") return { icon: Type, tone: "text-muted-foreground bg-muted" };
  return { icon: Pencil, tone: "text-muted-foreground bg-muted" };
}

function entryIcon(kind: string): typeof Pencil {
  if (kind === "published") return GitCommitVertical;
  if (kind === "restored") return RotateCcw;
  if (kind === "created") return Sparkles;
  return Pencil;
}

/** "you" beats your own name in your own history. */
function actorName(label: string | null, source: string): string {
  if (source === "api") return label ?? "API";
  return label ?? "Someone";
}

export function HistoryClient({ formId }: { formId: string }) {
  const queryClient = useQueryClient();
  const { data: historyData, isLoading } = useGetApiFormsByIdHistory(formId as never);
  const { data: versionData } = useGetApiFormsByIdVersions(formId as never);
  const restore = usePostApiFormsByIdVersionsByVersionRestore();
  const hydrate = useBuilderStore((s) => s.hydrate);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Group | null>(null);

  const groups = (historyData as { groups?: Group[] } | undefined)?.groups ?? [];

  /**
   * Author and response count live on the versions endpoint, not the timeline. Joined
   * here rather than denormalised into both: the response count in particular is the
   * number that makes a rollback feel consequential, and it changes constantly.
   */
  const meta = useMemo(() => {
    const list = (versionData as VersionMeta[] | undefined) ?? [];
    return new Map(list.map((v) => [v.versionId, v]));
  }, [versionData]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onRestore(group: Group) {
    if (group.version === null) return;
    try {
      const result = (await restore.mutateAsync({
        id: formId as never,
        version: String(group.version) as never,
      })) as unknown as { summary: string; doc: unknown; changes: DocChange[] };

      /**
       * The editor is swapped over here rather than left to refetch.
       *
       * It is holding the document from before the restore, and its autosave is on a
       * timer — refetching would race it, and losing that race silently undoes the
       * restore the moment someone clicks back into Build.
       */
      const parsed = FormDoc.safeParse(migrateFormDoc(result.doc));
      if (parsed.success) hydrate(formId, parsed.data, null, result.changes.length > 0);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetApiFormsByIdQueryKey(formId as never) }),
        queryClient.invalidateQueries({ queryKey: getGetApiFormsByIdHistoryQueryKey(formId as never) }),
        queryClient.invalidateQueries({ queryKey: getGetApiFormsByIdVersionsQueryKey(formId as never) }),
      ]);

      toast.success(`Version ${group.version} restored to your draft`, {
        description: "Nothing has changed for respondents yet — publish when you're ready.",
      });
    } catch (err) {
      toast.error("Could not restore that version", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const draft = groups.find((g) => g.version === null);
  const versions = groups.filter((g) => g.version !== null);

  /**
   * A form nobody has published and nobody has edited yet. The other empty case — no
   * versions but plenty of draft edits — is not empty at all, and falls through.
   */
  if (versions.length === 0 && (draft?.entries.length ?? 0) === 0) {
    return (
      <EmptyState
        icon={FileClock}
        title="Nothing to look back on yet"
        description="Every edit you make from here is recorded, and publishing groups them into a version you can compare against or roll back to."
      />
    );
  }

  return (
    <div className="space-y-4">
      {draft && <DraftGroup group={draft} expanded={expanded} onToggle={toggle} />}

      {versions.map((group) => (
        <VersionGroup
          key={group.versionId}
          group={group}
          meta={group.versionId ? meta.get(group.versionId) : undefined}
          expanded={expanded}
          onToggle={toggle}
          onRestore={() => setPending(group)}
          restoring={restore.isPending}
        />
      ))}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={`Restore version ${pending?.version}?`}
        description={
          <>
            Your working draft will be replaced with version {pending?.version}. Your live form does
            not change — respondents keep seeing the current version until you publish again.
          </>
        }
        confirmLabel="Restore to draft"
        destructive={false}
        onConfirm={async () => {
          const group = pending;
          setPending(null);
          if (group) await onRestore(group);
        }}
      />
    </div>
  );
}

/**
 * Unpublished work, always at the top and always present.
 *
 * Shown even when empty, because "there is nothing here" is the answer to the question
 * that brings most people to this screen: is what I built what my respondents are
 * seeing?
 */
function DraftGroup({
  group,
  expanded,
  onToggle,
}: {
  group: Group;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const count = group.entries.length;

  if (count === 0) {
    return (
      <div className="bg-muted/30 flex items-center gap-2.5 rounded-2xl px-5 py-4">
        <Check className="text-[var(--success-soft-foreground)] size-4 shrink-0" strokeWidth={2} />
        <p className="text-caption text-muted-foreground">
          Your draft matches what&apos;s published. Nothing is waiting to go live.
        </p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning-soft)]/40">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4">
        <CircleDot className="size-4 shrink-0 text-[var(--warning-soft-foreground)]" strokeWidth={2} />
        <h2 className="text-h3 font-medium">Unpublished changes</h2>
        <span className="text-micro text-muted-foreground tabular">
          {count} {count === 1 ? "edit" : "edits"} since the last publish
        </span>
      </header>
      <EntryList entries={group.entries} expanded={expanded} onToggle={onToggle} />
    </section>
  );
}

function VersionGroup({
  group,
  meta,
  expanded,
  onToggle,
  onRestore,
  restoring,
}: {
  group: Group;
  meta?: VersionMeta;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onRestore: () => void;
  restoring: boolean;
}) {
  return (
    <section className="bg-card overflow-hidden rounded-2xl border shadow-xs">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-5 py-4">
        <span
          className={cn(
            "text-micro tabular rounded-full px-2.5 py-1 font-medium",
            group.isActive ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          Version {group.version}
        </span>
        {group.isActive && (
          <span className="text-micro text-[var(--success-soft-foreground)] bg-[var(--success-soft)] rounded-full px-2.5 py-1 font-medium">
            Live
          </span>
        )}
        {group.note && <p className="text-caption min-w-0 flex-1 truncate">{group.note}</p>}

        <div className="text-micro text-muted-foreground ml-auto flex items-center gap-2">
          <span>
            {group.publishedAt ? relativeTime(group.publishedAt) : "—"}
            {meta?.authorLabel ? ` · ${meta.authorLabel}` : ""}
          </span>
          {meta !== undefined && meta.responses > 0 && (
            <span className="tabular">
              · {meta.responses} {meta.responses === 1 ? "response" : "responses"}
            </span>
          )}
          {!group.isActive && (
            <Button variant="ghost" size="sm" onClick={onRestore} disabled={restoring} className="ml-1">
              <RotateCcw className="size-3.5" strokeWidth={1.75} />
              Restore
            </Button>
          )}
        </div>
      </header>

      {group.entries.length === 0 ? (
        <p className="text-caption text-muted-foreground px-5 py-4">
          Published before change tracking, so there is no changelog for this one — the document
          itself is still here and can be restored.
        </p>
      ) : (
        <EntryList entries={group.entries} expanded={expanded} onToggle={onToggle} />
      )}
    </section>
  );
}

function EntryList({
  entries,
  expanded,
  onToggle,
}: {
  entries: Entry[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="divide-y">
      {entries.map((entry) => {
        const Icon = entryIcon(entry.kind);
        const open = expanded.has(entry.id);
        const detailed = entry.changes.length > 0;

        return (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => detailed && onToggle(entry.id)}
              disabled={!detailed}
              aria-expanded={detailed ? open : undefined}
              className={cn(
                "flex w-full items-start gap-3 px-5 py-3 text-left transition-colors duration-[120ms]",
                detailed && "hover:bg-muted/50 cursor-pointer",
              )}
            >
              <span className="bg-muted text-muted-foreground mt-0.5 grid size-6 shrink-0 place-items-center rounded-full">
                <Icon className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-body block">{entry.summary}</span>
                <span className="text-micro text-muted-foreground mt-0.5 block">
                  {actorName(entry.actorLabel, entry.source)} · {relativeTime(entry.createdAt)}
                  {entry.source === "api" && " · via API"}
                </span>
              </span>
              {detailed && (
                <span className="text-micro text-muted-foreground tabular mt-1 shrink-0">
                  {open ? "Hide" : `${entry.changeCount}`}
                </span>
              )}
            </button>

            {open && (
              <ul className="space-y-1.5 px-5 pb-3 pl-14">
                {entry.changes.map((change, i) => {
                  const { icon: ChangeIcon, tone } = changeStyle(change.op);
                  return (
                    <li key={`${change.target}-${i}`} className="flex items-start gap-2">
                      <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded", tone)}>
                        <ChangeIcon className="size-2.5" strokeWidth={2.5} />
                      </span>
                      <span className="text-caption min-w-0">
                        <span className="text-foreground">{change.label}</span>
                        {change.from !== undefined && change.to !== undefined && (
                          <span className="text-muted-foreground">
                            {" — "}
                            <span className="line-through decoration-1">{change.from}</span>
                            {" → "}
                            <span className="text-foreground">{change.to}</span>
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
                {entry.changeCount > entry.changes.length && (
                  <li className="text-micro text-muted-foreground">
                    and {entry.changeCount - entry.changes.length} more
                  </li>
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
