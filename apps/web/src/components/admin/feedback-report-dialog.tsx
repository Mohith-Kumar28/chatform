"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Link2, Mail, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FEEDBACK_NOTE_MAX, feedbackTopicLabel } from "@repo/form-schema";
import {
  getGetApiAdminFeedbackReportsByIdNearestQueryKey,
  postApiAdminFeedbackReportsByIdMove,
  useGetApiAdminFeedbackReportsByIdNearest,
  getGetApiAdminFeedbackReportsByIdQueryKey,
  getGetApiAdminFeedbackReportsByIdSnapshotQueryKey,
  patchApiAdminFeedbackReportsById,
  useGetApiAdminFeedbackReportsById,
  useGetApiAdminFeedbackReportsByIdSnapshot,
} from "@/lib/api/admin/admin";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TooltipHint } from "@/components/ui/kbd";
import { apiData } from "@/lib/api/payload";
import { relativeTime } from "@/components/forms/form-card";
import { ChatReplay } from "@/components/chat/chat-replay";
import type { ChatSnapshot } from "@/components/chat/chat-snapshot";
import { faceFor } from "./feedback-faces";
import { ResolveButton } from "./feedback-status";
import type { InboxReport } from "./feedback-inbox";

/**
 * One bug report, and everything it is attached to.
 *
 * Built on the responses dialog's frame on purpose, so the console has one way
 * of opening a record: a fixed-height panel, ← / → through the loaded page, the
 * open id in the URL, an icon to copy the link, and one switch between two
 * views — **Report** (what they said and everything it is attached to) and
 * **Conversation** (the real chat screen, replayed from the moment they pressed
 * the button).
 *
 * Nothing on the report view is an unlabelled pill. Every fact is a labelled
 * row, and the one thing you do — resolve it — is a button in the header that
 * says so.
 */

interface Detail extends InboxReport {
  organizationPlan: string | null;
  formVersionId: string | null;
  respondent: {
    id: string;
    label: string | null;
    email: string | null;
    phone: string | null;
    firstSeenAt: number | null;
    lastSeenAt: number | null;
    reportCount: number;
  } | null;
  session: {
    id: string;
    status: string;
    country: string | null;
    source: string;
    collectedCount: number;
    turnCount: number;
    isTest: boolean;
    createdAt: number;
    lastActivityAt: number;
    submissionId: string | null;
  } | null;
}

type View = "report" | "conversation";

export function FeedbackReportDialog({
  id,
  ids,
  onOpen,
  onClose,
  onChanged,
  onShowRespondent,
}: {
  id: string;
  /** The loaded page, in order — what ← and → walk. */
  ids: string[];
  onOpen: (id: string) => void;
  onClose: () => void;
  onChanged: () => void;
  onShowRespondent: (respondentId: string) => void;
}) {
  const [view, setView] = useState<View>("report");
  const [saving, setSaving] = useState(false);
  const index = ids.indexOf(id);

  const { data, isPending, isError, refetch } = useGetApiAdminFeedbackReportsById(id, {
    query: { queryKey: getGetApiAdminFeedbackReportsByIdQueryKey(id), retry: false },
  });
  const report = apiData<Detail>(data);

  const step = useCallback(
    (by: -1 | 1) => {
      const next = ids[index + by];
      if (next) onOpen(next);
    },
    [ids, index, onOpen],
  );

  // ← and →, never while typing: the note field is right there.
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
      await patchApiAdminFeedbackReportsById(report.id, body);
      toast.success(done);
      await refetch();
      onChanged();
    } catch {
      toast.error("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // A name only comes from a verified sign-in; without one, the reader has nobody to address.
  const who = report?.respondent?.label ?? "an anonymous respondent";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="4xl"
        layout="panel"
        showCloseButton={false}
        className="h-[min(48rem,calc(100dvh-4rem))]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-h3 truncate">{report ? `Report from ${who}` : "Bug report"}</DialogTitle>
            <p className="text-muted-foreground text-caption mt-0.5 truncate">
              {report ? (
                <>
                  {report.formTitle ?? "Form since deleted"} · {relativeTime(report.createdAt)}
                </>
              ) : (
                "Loading…"
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <TooltipProvider delayDuration={150}>
              {ids.length > 1 && index >= 0 && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Previous report" disabled={index <= 0} onClick={() => step(-1)}>
                        <ChevronLeft className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <TooltipHint label="Previous report" keys="←" />
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-muted-foreground text-caption tabular px-1">
                    {index + 1}/{ids.length}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Next report" disabled={index >= ids.length - 1} onClick={() => step(1)}>
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
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* The view switch on its own row; the status — a property, not a view — on the right of it. */}
        <div className="flex items-center gap-2 border-b px-5 py-2.5">
          <SegmentedControl
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "report", label: "Report" },
              { value: "conversation", label: "Conversation" },
            ]}
            ariaLabel="What to show"
          />
          {report && (
            <div className="ml-auto flex items-center gap-2">
              {report.respondent?.email && <ReplyButton report={report} />}
              <ResolveButton
                status={report.status}
                disabled={saving}
                onChange={(status) => void save({ status }, status === "resolved" ? "Marked resolved" : "Reopened")}
              />
            </div>
          )}
        </div>

        <DialogBody className="px-5 py-5">
          {isPending ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : isError || !report ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              This report is gone — it may have been deleted since the link was made.
            </p>
          ) : view === "report" ? (
            <ReportView
              report={report}
              saving={saving}
              onSave={save}
              onShowRespondent={onShowRespondent}
              onMoved={() => {
                void refetch();
                onChanged();
              }}
            />
          ) : (
            <ConversationView report={report} />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────── the report ───────────────────────────────

function ReportView({
  report,
  saving,
  onSave,
  onShowRespondent,
  onMoved,
}: {
  report: Detail;
  saving: boolean;
  onSave: (body: { internalNote?: string | null }, done: string) => Promise<void>;
  onShowRespondent: (respondentId: string) => void;
  onMoved: () => void;
}) {
  const face = faceFor(report.rating);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <section>
          <SectionTitle>What they said</SectionTitle>
          {report.message ? (
            <blockquote className="border-l-2 pl-4 text-base leading-relaxed whitespace-pre-wrap">{report.message}</blockquote>
          ) : (
            <p className="text-muted-foreground text-sm">Nothing — they only picked a rating.</p>
          )}
        </section>

        <NoteField report={report} saving={saving} onSave={onSave} />

        {!report.respondent?.email && (
          <p className="text-muted-foreground text-sm">
            No reply possible: they never signed in on a form, so there is no address for them.
          </p>
        )}
      </div>

      <dl className="space-y-3 text-sm lg:border-l lg:pl-6">
        <Prop label="Rating">
          <span className="inline-flex items-center gap-1.5">
            <face.Icon className="size-4" style={{ color: face.color }} aria-hidden />
            {face.label}
          </span>
        </Prop>
        <Prop label="Issue" hint="The problem this report was grouped into, with others describing the same thing.">
          <IssueField report={report} onChanged={onMoved} />
        </Prop>
        <Prop label="Topic" hint="Read from their note when it arrived, into a fixed list.">
          {feedbackTopicLabel(report.topic) ?? <Muted>{report.message ? "Not classified" : "No note to read"}</Muted>}
        </Prop>

        <Divider />

        <Prop label="Form">
          {report.formSlug ? (
            <a href={`/f/${report.formSlug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
              <span className="line-clamp-2">{report.formTitle ?? report.formSlug}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : (
            <Muted>Deleted</Muted>
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
          {report.organizationPlan && <Muted> · {capitalise(report.organizationPlan)}</Muted>}
        </Prop>

        <Divider />

        <Prop label="Respondent">
          {report.respondent ? (
            <span className="block min-w-0">
              <span className="block">{report.respondent.label ?? <Muted>No name</Muted>}</span>
              {report.respondent.email && (
                <a href={`mailto:${report.respondent.email}`} className="text-muted-foreground block truncate hover:underline">
                  {report.respondent.email}
                </a>
              )}
              {report.respondent.phone && <span className="text-muted-foreground block">{report.respondent.phone}</span>}
            </span>
          ) : (
            <Muted>Not recognised</Muted>
          )}
        </Prop>
        {report.respondent && (
          <Prop label="Reports">
            {report.respondent.reportCount > 1 ? (
              <button type="button" className="hover:underline" onClick={() => onShowRespondent(report.respondent!.id)}>
                {report.respondent.reportCount} from them
              </button>
            ) : (
              "Their first"
            )}
          </Prop>
        )}
        <Prop label="Answered">
          {report.session ? (
            report.session.collectedCount === 0 ? (
              <Muted>Not started</Muted>
            ) : (
              `${report.session.collectedCount} ${report.session.collectedCount === 1 ? "question" : "questions"}`
            )
          ) : (
            <Muted>Unknown</Muted>
          )}
        </Prop>
        <Prop label="Device">{deviceOf(report.userAgent)}</Prop>
        <Prop label="Filed">
          <span title={new Date(report.createdAt).toLocaleString()}>
            {relativeTime(report.createdAt)}
            {report.session?.country && <Muted> · {report.session.country}</Muted>}
            <Muted> · {report.source === "embed" ? "embed" : "hosted page"}</Muted>
          </span>
        </Prop>

        {/* The identifiers and the raw browser string: needed when debugging, noise the rest of the time. */}
        <details className="group pt-1">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs select-none">
            Technical details
          </summary>
          <div className="mt-2 space-y-2 text-xs">
            <Tech label="Report" value={report.id} />
            {report.respondent && <Tech label="Respondent" value={report.respondent.id} />}
            {report.sessionId && <Tech label="Session" value={report.sessionId} />}
            {report.formVersionId && <Tech label="Form version" value={report.formVersionId} />}
            {report.userAgent && <Tech label="User agent" value={report.userAgent} />}
          </div>
        </details>
      </dl>
    </div>
  );
}

/**
 * Which issue this report belongs to — and the way to say it belongs elsewhere.
 *
 * The title links to the issue's view of the inbox. The menu beside it moves the
 * report: to one of the five nearest issues (no search box — the nearest are
 * where a wrong grouping almost always belongs), or out to an issue of its own.
 * The nearest list is only fetched when the menu opens.
 */
function IssueField({ report, onChanged }: { report: Detail; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const { data, isPending } = useGetApiAdminFeedbackReportsByIdNearest(report.id, {
    query: { queryKey: getGetApiAdminFeedbackReportsByIdNearestQueryKey(report.id), enabled: open },
  });
  const nearest = apiData<{ issues: { id: string; title: string }[] } | null>(data)?.issues ?? [];

  const move = async (issueId: string, label: string) => {
    try {
      await postApiAdminFeedbackReportsByIdMove(report.id, { issueId });
      toast.success(label);
      onChanged();
    } catch {
      toast.error("That report could not be moved.");
    }
  };

  if (!report.message) return <Muted>Not grouped — no note to read</Muted>;
  if (!report.issueId) return <Muted>Not grouped yet</Muted>;

  return (
    <span className="flex min-w-0 items-start gap-1">
      <a href={`/admin/feedback?issue=${encodeURIComponent(report.issueId)}`} className="min-w-0 hover:underline">
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

/** Reply, prepared: their address, the form in the subject, their note quoted. */
function ReplyButton({ report }: { report: Detail }) {
  const email = report.respondent!.email!;
  const subject = `Re: your report about ${report.formTitle ?? "the form"}`;
  const body = report.message ? `\n\n> ${report.message.split(/\r?\n/).join("\n> ")}` : "";
  return (
    <Button asChild variant="outline" size="sm" shape="pill">
      <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
        <Mail className="size-3.5" />
        Reply
      </a>
    </Button>
  );
}

/**
 * A note for the next admin who opens this.
 *
 * Saved on an explicit press, never on blur — a triage note takes thought, and
 * blur is how thought gets lost to a stray click on the backdrop.
 */
function NoteField({
  report,
  saving,
  onSave,
}: {
  report: Detail;
  saving: boolean;
  onSave: (body: { internalNote?: string | null }, done: string) => Promise<void>;
}) {
  const [note, setNote] = useState(report.internalNote ?? "");
  const dirty = note.trim() !== (report.internalNote ?? "");
  return (
    <section>
      <SectionTitle>Internal note</SectionTitle>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={FEEDBACK_NOTE_MAX}
        placeholder="What it turned out to be. Only admins see this."
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-caption">
          {report.statusAt && report.status === "resolved"
            ? `Resolved by ${report.statusBy ?? "an admin"} · ${relativeTime(report.statusAt)}`
            : ""}
        </p>
        <Button size="sm" variant="secondary" shape="pill" disabled={!dirty || saving} onClick={() => void onSave({ internalNote: note.trim() || null }, "Note saved")}>
          Save note
        </Button>
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

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * "Chrome on macOS", from the browser string, for reading at a glance.
 *
 * Display only, and deliberately crude — the full string is one click away in
 * the technical details, and that is the one to trust.
 */
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

// ─────────────────────────────── the conversation ───────────────────────────────

/**
 * Fetched only when this view is opened: reading it is audited, and triaging
 * twenty reports by their words should not leave twenty reads of respondents'
 * conversations in the log.
 */
function ConversationView({ report }: { report: Detail }) {
  const { data, isPending, isError } = useGetApiAdminFeedbackReportsByIdSnapshot(report.id, {
    query: {
      queryKey: getGetApiAdminFeedbackReportsByIdSnapshotQueryKey(report.id),
      enabled: report.hasSnapshot,
      retry: false,
      staleTime: Infinity,
    },
  });

  if (!report.hasSnapshot) {
    return (
      <p className="text-muted-foreground mx-auto max-w-md py-16 text-center text-sm">
        No conversation was attached. The report was filed before this was captured, or their browser did not send it.
      </p>
    );
  }
  if (isPending) return <Skeleton className="h-[34rem] rounded-xl" />;

  const snapshot = apiData<ChatSnapshot | null>(data);
  if (isError || !snapshot || (snapshot.v !== 1 && snapshot.v !== 2)) {
    return <p className="text-muted-foreground py-16 text-center text-sm">The conversation could not be loaded.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-caption">
        Exactly as it was on their screen at {new Date(snapshot.capturedAt).toLocaleString()}
        {snapshot.viewport.width > 0 && ` · ${snapshot.viewport.width}×${snapshot.viewport.height}`}
      </p>
      {/* The dialog's height minus its header, switch row, padding and this caption — so the composer is in view. */}
      <ChatReplay snapshot={snapshot} height="calc(min(48rem, 100dvh - 4rem) - 13rem)" />
    </div>
  );
}
