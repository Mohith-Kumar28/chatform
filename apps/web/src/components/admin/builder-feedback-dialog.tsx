"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, ImageOff, Link2, Mail, Pencil, Plus, Trash2, X } from "lucide-react";
import { FEEDBACK_NOTE_MAX, builderAreaLabel, builderSeverityLabel } from "@repo/form-schema";
import {
  deleteApiAdminFeedbackBuilderReportsById,
  getGetApiAdminFeedbackBuilderReportsByIdNearestQueryKey,
  getGetApiAdminFeedbackBuilderReportsByIdQueryKey,
  patchApiAdminFeedbackBuilderReportsById,
  postApiAdminFeedbackBuilderReportsByIdMove,
  useGetApiAdminFeedbackBuilderReportsById,
  useGetApiAdminFeedbackBuilderReportsByIdNearest,
} from "@/lib/api/admin/admin";
import { API_ORIGIN, apiHeaders } from "@/lib/api/mutator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TooltipHint } from "@/components/ui/kbd";
import { apiData } from "@/lib/api/payload";
import { relativeTime } from "@/components/forms/form-card";
import { faceFor } from "./feedback-faces";
import { ResolveButton } from "./feedback-status";
import { KindIcon, kindLabel } from "./builder-feedback-issues";

/**
 * One report from somebody who builds forms, and everything it came with.
 *
 * The respondent report dialog's frame, so the console still has one way of
 * opening a record: a fixed-height panel, ← / → through the loaded page, the
 * open id in the URL, copy link, resolve in the header. What differs is the
 * content: their words by field, the screenshots, and the page they were on,
 * where the respondent dialog replays a conversation.
 */

export interface BuilderReport {
  id: string;
  kind: string;
  area: string | null;
  areaPicked: string | null;
  rating: number | null;
  severity: string | null;
  title: string | null;
  message: string;
  steps: string | null;
  expected: string | null;
  why: string | null;
  url: string | null;
  formId: string | null;
  formTitle: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userReportCount: number;
  role: string | null;
  planId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  workspaceName: string | null;
  impersonatorEmail: string | null;
  context: Record<string, unknown> | null;
  userAgent: string | null;
  attachments: { n: number; type: string; bytes: number; auto: boolean }[];
  status: string;
  statusAt: number | null;
  statusBy: string | null;
  internalNote: string | null;
  tags: string[];
  sentiment: number | null;
  issueId: string | null;
  issueTitle: string | null;
  createdAt: number;
}

/** The inbox row's headline: the tagger's summary, or the first line of what they wrote. */
export function headlineOf(r: Pick<BuilderReport, "title" | "message">): string {
  return r.title ?? r.message.split(/\r?\n/).find((l) => l.trim())?.trim() ?? r.message;
}

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function BuilderFeedbackDialog({
  id,
  rows,
  position,
  total,
  onStep,
  onResolved,
  onRemoved,
  onClose,
  onChanged,
  onShowUser,
}: {
  id: string;
  rows: BuilderReport[];
  position: number;
  total: number;
  onStep: (by: -1 | 1) => void;
  onResolved: () => void;
  onRemoved: () => void;
  onClose: () => void;
  onChanged: () => void;
  onShowUser: (userId: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fromList = rows.find((r) => r.id === id);

  const fetched = useGetApiAdminFeedbackBuilderReportsById(id, {
    query: { queryKey: getGetApiAdminFeedbackBuilderReportsByIdQueryKey(id), retry: false, enabled: !fromList },
  });
  const report = fromList ?? apiData<BuilderReport>(fetched.data);
  const isPending = !fromList && fetched.isPending;
  const isError = !fromList && fetched.isError;
  const refetch = () => (fromList ? Promise.resolve() : fetched.refetch());

  const canPrev = position > 0;
  const canNext = position >= 0 && position < total - 1;
  const step = useCallback(
    (by: -1 | 1) => {
      if (by === -1 ? canPrev : canNext) onStep(by);
    },
    [canPrev, canNext, onStep],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const save = async (body: { status?: "new" | "resolved"; internalNote?: string | null }, done: string) => {
    if (!report) return;
    setSaving(true);
    try {
      await patchApiAdminFeedbackBuilderReportsById(report.id, body);
      toast.success(done);
      await refetch();
      onChanged();
      if (body.status === "resolved") onResolved();
    } catch {
      toast.error("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteApiAdminFeedbackBuilderReportsById(id);
      toast.success("Report deleted");
      onRemoved();
      onChanged();
    } catch {
      toast.error("That didn't delete. Try again.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="full"
        layout="panel"
        showCloseButton={false}
        className="h-[88dvh] max-h-[88dvh]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-h3 flex min-w-0 items-center gap-2">
              {report && <KindIcon kind={report.kind} className="text-muted-foreground size-4 shrink-0" aria-hidden />}
              <span className="truncate">{report ? headlineOf(report) : "Report"}</span>
            </DialogTitle>
            <p className="text-muted-foreground text-caption mt-0.5 truncate">
              {report ? (
                <>
                  {kindLabel(report.kind)} from {report.userName ?? report.userEmail ?? "a user"}
                  {report.organizationName && ` at ${report.organizationName}`} · {relativeTime(report.createdAt)}
                </>
              ) : (
                "Loading…"
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <TooltipProvider delayDuration={150}>
              {total > 1 && position >= 0 && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Previous report" disabled={!canPrev} onClick={() => step(-1)}>
                        <ChevronLeft className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <TooltipHint label="Previous report" keys="←" />
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-muted-foreground text-caption tabular px-1">
                    {(position + 1).toLocaleString()}/{total.toLocaleString()}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Next report" disabled={!canNext} onClick={() => step(1)}>
                        <ChevronRight className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <TooltipHint label="Next report" keys="→" />
                    </TooltipContent>
                  </Tooltip>
                  <span className="bg-border mx-1 h-5 w-px" />
                </>
              )}
            </TooltipProvider>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy link to this report"
              title="Copy link"
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href);
                toast.success("Link copied");
              }}
            >
              <Link2 className="size-4" />
            </Button>
            {report && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete this report"
                title="Delete"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {report && (
          <div className="flex items-center justify-end gap-2 border-b px-5 py-2.5">
            {report.userEmail && !report.impersonatorEmail && <ReplyButton report={report} />}
            <ResolveButton
              status={report.status}
              disabled={saving}
              onChange={(status) => void save({ status }, status === "resolved" ? "Marked resolved" : "Reopened")}
            />
          </div>
        )}

        <DialogBody className="px-5 py-5">
          {isPending ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : isError || !report ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              This report is gone. It may have been deleted since the link was made.
            </p>
          ) : (
            <ReportView
              key={report.id}
              report={report}
              saving={saving}
              onSave={save}
              onShowUser={onShowUser}
              onMoved={() => {
                void refetch();
                onChanged();
              }}
            />
          )}
        </DialogBody>
      </DialogContent>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this report?"
        description="Their words, the screenshots and its place in its issue go with it. An issue left with no reports is removed. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </Dialog>
  );
}

// ─────────────────────────────── the report ───────────────────────────────

const WORDS_TITLE: Record<string, string> = {
  bug: "What went wrong",
  feature: "What they want",
  feedback: "What they said",
};

function ReportView({
  report,
  saving,
  onSave,
  onShowUser,
  onMoved,
}: {
  report: BuilderReport;
  saving: boolean;
  onSave: (body: { internalNote?: string | null }, done: string) => Promise<void>;
  onShowUser: (userId: string) => void;
  onMoved: () => void;
}) {
  const face = report.rating ? faceFor(report.rating) : null;
  const inferred = (!report.areaPicked || report.areaPicked === "other") && report.area && report.area !== "other";
  const context = report.context ?? {};
  const errors = Array.isArray(context.errors) ? (context.errors as unknown[]) : [];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-6">
        <section>
          <SectionTitle>{WORDS_TITLE[report.kind] ?? "What they said"}</SectionTitle>
          <blockquote className="border-l-2 pl-4 text-base leading-relaxed whitespace-pre-wrap">{report.message}</blockquote>
        </section>
        {report.steps && (
          <section>
            <SectionTitle>Steps to reproduce</SectionTitle>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.steps}</p>
          </section>
        )}
        {report.expected && (
          <section>
            <SectionTitle>What they expected</SectionTitle>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.expected}</p>
          </section>
        )}
        {report.why && (
          <section>
            <SectionTitle>Why they need it</SectionTitle>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.why}</p>
          </section>
        )}

        {report.attachments.length > 0 && (
          <section>
            <SectionTitle>Screenshots</SectionTitle>
            <Gallery reportId={report.id} attachments={report.attachments} />
          </section>
        )}

        {errors.length > 0 && (
          <section>
            <SectionTitle>Console errors</SectionTitle>
            <ol className="bg-muted/40 max-h-60 space-y-1.5 overflow-auto rounded-lg border p-3 font-mono text-xs">
              {errors.map((e, i) => (
                <li key={i} className="break-all whitespace-pre-wrap">
                  {typeof e === "string" ? e : JSON.stringify(e)}
                </li>
              ))}
            </ol>
          </section>
        )}

        <NoteField report={report} saving={saving} onSave={onSave} />
      </div>

      <dl className="space-y-3 text-sm lg:border-l lg:pl-6">
        <Prop label="Kind">{kindLabel(report.kind)}</Prop>
        {report.severity && (
          <Prop label={report.kind === "bug" ? "Severity" : "Importance"}>{builderSeverityLabel(report.severity)}</Prop>
        )}
        {face && (
          <Prop label="Rating">
            <span className="inline-flex items-center gap-1.5">
              <face.Icon className="size-4" style={{ color: face.color }} aria-hidden />
              {face.label}
            </span>
          </Prop>
        )}
        <Prop label="Area">
          {report.area ? (
            <>
              {builderAreaLabel(report.area)}
              {inferred && <Muted> · guessed from their words</Muted>}
            </>
          ) : (
            <Muted>Not picked</Muted>
          )}
        </Prop>
        <Prop label="Issue" hint="The bug or request this report was grouped with.">
          <IssueField report={report} onChanged={onMoved} />
        </Prop>
        {report.tags.length > 0 && <Prop label="Tags">{report.tags.join(", ")}</Prop>}

        <Divider />

        <Prop label="From">
          <span className="block min-w-0">
            <span className="block">{report.userName ?? <Muted>No name</Muted>}</span>
            {report.userEmail && (
              <a href={`mailto:${report.userEmail}`} className="text-muted-foreground block truncate hover:underline">
                {report.userEmail}
              </a>
            )}
          </span>
        </Prop>
        <Prop label="Reports">
          {report.userReportCount > 1 && report.userId ? (
            <button type="button" className="hover:underline" onClick={() => onShowUser(report.userId!)}>
              {report.userReportCount} from them
            </button>
          ) : (
            "Their first"
          )}
        </Prop>
        <Prop label="Account">
          {report.organizationId ? (
            <Link href={`/admin/accounts/${report.organizationId}`} className="hover:underline">
              {report.organizationName ?? report.organizationId}
            </Link>
          ) : (
            <Muted>Unknown</Muted>
          )}
        </Prop>
        <Prop label="Plan">{report.planId ? capitalise(report.planId) : <Muted>Unknown</Muted>}</Prop>
        <Prop label="Role">{report.role ? capitalise(report.role.replace(/,/g, ", ")) : <Muted>Unknown</Muted>}</Prop>
        {report.workspaceName && <Prop label="Workspace">{report.workspaceName}</Prop>}
        {report.impersonatorEmail && (
          <Prop label="Filed by">
            <span className="text-[var(--warning-soft-foreground)]">{report.impersonatorEmail}, acting as this user</span>
          </Prop>
        )}

        <Divider />

        <Prop label="Page">
          {report.url ? (
            <a href={report.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 hover:underline">
              <span className="truncate">{pathOf(report.url)}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : (
            <Muted>Not reported</Muted>
          )}
        </Prop>
        {report.formTitle && <Prop label="Form">{report.formTitle}</Prop>}
        <Prop label="Device">{deviceOf(report.userAgent)}</Prop>
        {contextRows(context).map(([label, value]) => (
          <Prop key={label} label={label}>
            {value}
          </Prop>
        ))}
        <Prop label="Filed">
          <span title={new Date(report.createdAt).toLocaleString()}>{relativeTime(report.createdAt)}</span>
        </Prop>

        <details className="group pt-1">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs select-none">
            Technical details
          </summary>
          <div className="mt-2 space-y-2 text-xs">
            <Tech label="Report" value={report.id} />
            {report.userId && <Tech label="User" value={report.userId} />}
            {report.formId && <Tech label="Form" value={report.formId} />}
            {report.url && <Tech label="URL" value={report.url} />}
            {report.userAgent && <Tech label="User agent" value={report.userAgent} />}
          </div>
        </details>
      </dl>
    </div>
  );
}

/** Context keys printed as their own rows, in this order, with their labels. */
const CONTEXT_LABELS: Record<string, string> = {
  viewport: "Viewport",
  screen: "Screen",
  pixelRatio: "Pixel ratio",
  locale: "Language",
  timezone: "Time zone",
  theme: "Theme",
  route: "Route",
  build: "Build",
};

/** Everything the panel captured, labelled. Errors get their own section; unknown keys print under their own name. */
function contextRows(context: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  // `page` repeats the URL row above; `online` only matters when false.
  const seen = new Set(["errors", "url", "userAgent", "page", ...(context.online === false ? [] : ["online"])]);
  for (const [key, label] of Object.entries(CONTEXT_LABELS)) {
    seen.add(key);
    const v = context[key];
    if (v !== undefined && v !== null && v !== "") out.push([label, typeof v === "string" ? v : JSON.stringify(v)]);
  }
  for (const [key, v] of Object.entries(context)) {
    if (seen.has(key) || v === undefined || v === null || v === "") continue;
    out.push([capitalise(key.replace(/([A-Z])/g, " $1").toLowerCase()), typeof v === "string" ? v : JSON.stringify(v)]);
  }
  return out;
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * The images, fetched with the admin's credentials.
 *
 * An `<img src>` pointed at the API would go without the impersonation header
 * and, cross-origin, without a guarantee the cookie rides along; fetching each
 * one and showing it from a blob URL is the same request every other console
 * read makes. The URLs are revoked when the report closes.
 */
function Gallery({ reportId, attachments }: { reportId: string; attachments: BuilderReport["attachments"] }) {
  const [urls, setUrls] = useState<Record<number, string | null>>({});
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    for (const a of attachments) {
      void fetch(`${API_ORIGIN}/api/admin/feedback/builder/reports/${encodeURIComponent(reportId)}/attachments/${a.n}`, {
        credentials: "include",
        headers: apiHeaders(),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const url = URL.createObjectURL(await res.blob());
          made.push(url);
          if (!cancelled) setUrls((prev) => ({ ...prev, [a.n]: url }));
        })
        .catch(() => {
          if (!cancelled) setUrls((prev) => ({ ...prev, [a.n]: null }));
        });
    }
    return () => {
      cancelled = true;
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [reportId, attachments]);

  const shown = open === null ? null : urls[open];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {attachments.map((a) => {
          const url = urls[a.n];
          return (
            <figure key={a.n} className="min-w-0 space-y-1">
              <button
                type="button"
                className="bg-muted/40 block aspect-video w-full overflow-hidden rounded-lg border"
                onClick={() => url && setOpen(a.n)}
                disabled={!url}
                aria-label={`Open screenshot ${a.n + 1}`}
              >
                {url === undefined ? (
                  <Skeleton className="size-full" />
                ) : url === null ? (
                  <span className="text-muted-foreground grid size-full place-items-center">
                    <ImageOff className="size-5" aria-label="Could not load" />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- a blob URL, not an optimisable asset
                  <img src={url} alt={`Screenshot ${a.n + 1}`} className="size-full object-cover object-top" />
                )}
              </button>
              <figcaption className="text-muted-foreground text-caption truncate">
                {a.auto ? "Captured automatically" : "Added by them"} · {Math.max(1, Math.round(a.bytes / 1024))} KB
              </figcaption>
            </figure>
          );
        })}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent size="full" className="max-h-[92dvh] p-2">
          <DialogTitle className="sr-only">Screenshot</DialogTitle>
          {shown && (
            // eslint-disable-next-line @next/next/no-img-element -- a blob URL, not an optimisable asset
            <img src={shown} alt="Screenshot, full size" className="max-h-[88dvh] w-full rounded-md object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function IssueField({ report, onChanged }: { report: BuilderReport; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const { data, isPending } = useGetApiAdminFeedbackBuilderReportsByIdNearest(report.id, {
    query: { queryKey: getGetApiAdminFeedbackBuilderReportsByIdNearestQueryKey(report.id), enabled: open },
  });
  const nearest = apiData<{ issues: { id: string; title: string }[] } | null>(data)?.issues ?? [];

  const move = async (issueId: string, label: string) => {
    try {
      await postApiAdminFeedbackBuilderReportsByIdMove(report.id, { issueId });
      toast.success(label);
      onChanged();
    } catch {
      toast.error("That report could not be moved.");
    }
  };

  if (!report.issueId) return <Muted>Not grouped yet</Muted>;

  return (
    <span className="flex min-w-0 items-start gap-1">
      <a href={`/admin/feedback?view=admins&issue=${encodeURIComponent(report.issueId)}`} className="min-w-0 hover:underline">
        <span className="line-clamp-2">{report.issueTitle ?? "Untitled issue"}</span>
      </a>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="-mt-1 size-6 shrink-0" aria-label="Move to another issue">
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-muted-foreground text-micro font-medium tracking-wide uppercase">
            Move to
          </DropdownMenuLabel>
          {isPending ? (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">Finding the nearest issues…</p>
          ) : nearest.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">No other open issue is close.</p>
          ) : (
            nearest.map((issue) => (
              <DropdownMenuItem key={issue.id} onSelect={() => void move(issue.id, `Moved to "${issue.title}"`)}>
                <span className="truncate">{issue.title}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void move("new", "Moved to a new issue")}>A new issue of its own</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/** Reply, prepared: their address, the summary in the subject, their words quoted. */
function ReplyButton({ report }: { report: BuilderReport }) {
  const subject = `Re: ${headlineOf(report)}`;
  const body = `\n\n> ${report.message.split(/\r?\n/).join("\n> ")}`;
  return (
    <Button asChild variant="outline" size="sm" shape="pill">
      <a href={`mailto:${report.userEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
        <Mail className="size-3.5" />
        Reply
      </a>
    </Button>
  );
}

function NoteField({
  report,
  saving,
  onSave,
}: {
  report: BuilderReport;
  saving: boolean;
  onSave: (body: { internalNote?: string | null }, done: string) => Promise<void>;
}) {
  const saved = report.internalNote ?? "";
  const [note, setNote] = useState(saved);
  const [editing, setEditing] = useState(false);
  const dirty = note.trim() !== saved;
  const resolvedBy =
    report.statusAt && report.status === "resolved" ? `Resolved by ${report.statusBy ?? "an admin"} · ${relativeTime(report.statusAt)}` : "";

  if (!editing) {
    return (
      <section className="space-y-2">
        {saved ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Internal note</SectionTitle>
              <Button size="sm" variant="ghost" shape="pill" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />
                Edit
              </Button>
            </div>
            <p className="text-sm whitespace-pre-wrap">{saved}</p>
          </>
        ) : (
          <Button size="sm" variant="ghost" shape="pill" className="-ml-2.5" onClick={() => setEditing(true)}>
            <Plus className="size-3.5" />
            Add internal note
          </Button>
        )}
        {resolvedBy && <p className="text-muted-foreground text-caption">{resolvedBy}</p>}
      </section>
    );
  }

  return (
    <section>
      <SectionTitle>Internal note</SectionTitle>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        autoFocus
        maxLength={FEEDBACK_NOTE_MAX}
        placeholder="What it turned out to be, or when it ships. Only admins see this."
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-caption">{resolvedBy}</p>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            shape="pill"
            disabled={saving}
            onClick={() => {
              setNote(saved);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="secondary"
            shape="pill"
            disabled={!dirty || saving}
            onClick={async () => {
              await onSave({ internalNote: note.trim() || null }, "Note saved");
              setEditing(false);
            }}
          >
            Save note
          </Button>
        </div>
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">{children}</h3>;
}

function Prop({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-muted-foreground" title={hint}>
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Divider() {
  return <div className="border-t" role="separator" />;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function Tech({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-mono break-all">{value}</p>
    </div>
  );
}

/** "Chrome on macOS", read crudely from the browser string; the full string is in the technical details. */
function deviceOf(ua: string | null): React.ReactNode {
  if (!ua) return <Muted>Not reported</Muted>;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /CriOS|Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "A browser";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}
