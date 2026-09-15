"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ExternalLink, Mail, MessageSquare, Monitor, Phone, X } from "lucide-react";
import { feedbackTopicLabel } from "@repo/form-schema";
import {
  getGetApiAdminFeedbackReportsByIdQueryKey,
  getGetApiAdminFeedbackReportsByIdSnapshotQueryKey,
  patchApiAdminFeedbackReportsById,
  useGetApiAdminFeedbackReportsById,
  useGetApiAdminFeedbackReportsByIdSnapshot,
} from "@/lib/api/admin/admin";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/ui/copy-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { apiData } from "@/lib/api/payload";
import { relativeTime } from "@/components/forms/form-card";
import { ChatReplay } from "@/components/chat/chat-replay";
import type { ChatSnapshot } from "@/components/chat/chat-snapshot";
import { faceFor } from "./feedback-faces";
import { STATUS_BADGE, type InboxReport } from "./feedback-inbox";

/**
 * One bug report, and everything it is attached to.
 *
 * Modelled on the responses dialog, down to the parts that took it three
 * revisions: a fixed height so stepping does not resize the panel under the
 * cursor, the open id in the URL so a link lands on it, focus on the panel
 * rather than on a tooltip trigger, and ← / → to walk the loaded page.
 *
 * Two tabs, because the two halves are read at different moments. **Report** is
 * triage: what they said, who they are, whether they can be answered, and every
 * link out. **Screen** is reproduction: the conversation as it stood when they
 * pressed the button, drawn by the same components the respondent saw.
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

type View = "report" | "screen";

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
  /** Something about this report changed; refresh the list behind the dialog. */
  onChanged: () => void;
  onShowRespondent: (respondentId: string) => void;
}) {
  const [view, setView] = useState<View>("report");
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

  /*
    ← and →, and never while typing. This dialog holds a real note field, so a
    left arrow inside it must move the caret, not the report.
  */
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

  const shareUrl = typeof window === "undefined" ? "" : window.location.href;

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
            <DialogTitle className="text-h3">Bug report</DialogTitle>
            <p className="text-muted-foreground text-caption mt-0.5 truncate">
              {report ? (
                <>
                  {new Date(report.createdAt).toLocaleString()} · {relativeTime(report.createdAt)} ·{" "}
                  <span className="font-mono">{report.id}</span>
                </>
              ) : (
                <span className="font-mono">{id}</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {ids.length > 1 && index >= 0 && (
              <>
                <Button variant="ghost" size="icon-sm" aria-label="Previous report (←)" title="Previous report (←)" disabled={index <= 0} onClick={() => step(-1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-muted-foreground text-caption tabular px-1">
                  {index + 1}/{ids.length}
                </span>
                <Button variant="ghost" size="icon-sm" aria-label="Next report (→)" title="Next report (→)" disabled={index >= ids.length - 1} onClick={() => step(1)}>
                  <ChevronRight className="size-4" />
                </Button>
                <span className="bg-border mx-1 h-5 w-px" />
              </>
            )}
            <CopyButton value={shareUrl} label="Copy link to this report" toastMessage="Link copied" />
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="border-b px-5 py-2.5">
          <SegmentedControl
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "report", label: "Report", icon: MessageSquare },
              { value: "screen", label: "Screen", icon: Monitor, badge: report?.hasSnapshot ? "1" : undefined },
            ]}
            ariaLabel="What to show"
          />
        </div>

        <DialogBody className="px-5 py-4">
          {isPending ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : isError || !report ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              This report is gone — it may have been deleted since the link was made.
            </p>
          ) : view === "report" ? (
            <ReportView
              report={report}
              onChanged={() => {
                void refetch();
                onChanged();
              }}
              onShowRespondent={onShowRespondent}
            />
          ) : (
            <ScreenView report={report} />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────── the report ───────────────────────────────

function ReportView({
  report,
  onChanged,
  onShowRespondent,
}: {
  report: Detail;
  onChanged: () => void;
  onShowRespondent: (respondentId: string) => void;
}) {
  const face = faceFor(report.rating);
  const badge = STATUS_BADGE[report.status] ?? STATUS_BADGE.new!;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        {/* Their words first and largest — everything else on this panel is context for them. */}
        <div>
          <div className="text-caption mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: face.color }}>
              <face.Icon className="size-4" /> <span className="text-foreground">{face.label}</span>
            </span>
            <Badge className={badge.className}>{badge.label}</Badge>
            {report.topic && <Badge variant="secondary">{feedbackTopicLabel(report.topic)}</Badge>}
            {report.sentiment !== null && (
              <span className="text-muted-foreground" title="Tone of the words, −1 furious to 1 delighted">
                tone {report.sentiment > 0 ? "+" : ""}
                {report.sentiment.toFixed(2)}
              </span>
            )}
          </div>
          {report.message ? (
            <p className="bg-muted/40 rounded-xl border px-4 py-3 text-base leading-relaxed whitespace-pre-wrap">
              {report.message}
            </p>
          ) : (
            <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-3 text-sm italic">
              Rating only, no note.
            </p>
          )}
        </div>

        <Reply report={report} />
        <Triage report={report} onChanged={onChanged} />
      </div>

      <div className="space-y-5 lg:col-span-2">
        <Facts title="Where">
          <Fact label="Account">
            {report.organizationId ? (
              <Link href={`/admin/accounts/${report.organizationId}`} className="hover:underline">
                {report.organizationName ?? report.organizationId}
              </Link>
            ) : (
              "—"
            )}
            {report.organizationPlan && (
              <Badge variant="secondary" className="ml-2 capitalize">
                {report.organizationPlan}
              </Badge>
            )}
          </Fact>
          <Fact label="Form">
            {report.formSlug ? (
              <a href={`/f/${report.formSlug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                {report.formTitle ?? report.formSlug} <ExternalLink className="size-3" />
              </a>
            ) : (
              <span className="text-muted-foreground">form since deleted</span>
            )}
          </Fact>
          {report.formVersionId && (
            <Fact label="Version">
              <span className="font-mono text-xs">{report.formVersionId}</span>
            </Fact>
          )}
          <Fact label="From">{report.source === "embed" ? "an embed" : "the hosted page"}</Fact>
        </Facts>

        <Facts title="Who">
          {report.respondent ? (
            <>
              {report.respondent.label && <Fact label="Name">{report.respondent.label}</Fact>}
              <Fact label="Email">
                {report.respondent.email ? (
                  <a href={`mailto:${report.respondent.email}`} className="hover:underline">
                    {report.respondent.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground">never signed in</span>
                )}
              </Fact>
              {report.respondent.phone && (
                <Fact label="Phone">
                  <a href={`tel:${report.respondent.phone}`} className="hover:underline">
                    {report.respondent.phone}
                  </a>
                </Fact>
              )}
              <Fact label="Seen">
                {report.respondent.firstSeenAt ? `first ${relativeTime(report.respondent.firstSeenAt)}` : "—"}
                {report.respondent.lastSeenAt ? ` · last ${relativeTime(report.respondent.lastSeenAt)}` : ""}
              </Fact>
              <Fact label="Reports">
                {report.respondent.reportCount > 1 ? (
                  <button type="button" className="hover:underline" onClick={() => onShowRespondent(report.respondent!.id)}>
                    {report.respondent.reportCount} from them — see all
                  </button>
                ) : (
                  "their first"
                )}
              </Fact>
              <Fact label="Id">
                <span className="font-mono text-xs">{report.respondent.id}</span>
              </Fact>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Not recognised — their browser gave us nothing to know them by.
            </p>
          )}
        </Facts>

        <Facts title="Session">
          {report.session ? (
            <>
              <Fact label="Progress">
                {report.session.collectedCount === 0
                  ? "nothing answered yet"
                  : `${report.session.collectedCount} answered`}
                {` · ${report.session.turnCount} turns`}
              </Fact>
              <Fact label="State">
                {report.session.status}
                {report.session.isTest && " · test"}
                {report.session.country && ` · ${report.session.country}`}
              </Fact>
              <Fact label="Started">{relativeTime(report.session.createdAt)}</Fact>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">The session is no longer on record.</p>
          )}
          <Fact label="Browser">
            <span className="font-mono text-xs break-all">{report.userAgent ?? "not reported"}</span>
          </Fact>
        </Facts>
      </div>
    </div>
  );
}

/**
 * Write back, prepared.
 *
 * A mailto rather than a send box: the thread lives in the founder's own mailbox
 * like any other conversation, and there is no second sending path to build,
 * log or keep off a suppression list. The subject names the form and their note
 * is quoted, so the reply is typing the answer and nothing else.
 */
function Reply({ report }: { report: Detail }) {
  const email = report.respondent?.email ?? null;
  if (!email) {
    return (
      <p className="text-muted-foreground text-sm">
        No way to reply — they never signed in on a form, so we have no address for them.
      </p>
    );
  }
  const subject = `Re: your report about ${report.formTitle ?? "the form"}`;
  const body = report.message ? `\n\n> ${report.message.split(/\r?\n/).join("\n> ")}` : "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm">
        <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
          <Mail className="size-4" /> Reply to {report.respondent?.label ?? email}
        </a>
      </Button>
      {report.respondent?.phone && (
        <Button asChild size="sm" variant="secondary">
          <a href={`tel:${report.respondent.phone}`}>
            <Phone className="size-4" /> Call
          </a>
        </Button>
      )}
    </div>
  );
}

/**
 * Move it, and write down what it was.
 *
 * The note saves on an explicit press, never on blur: a triage note is the one
 * thing on this panel that takes thought to write, and blur is how thought gets
 * lost to a stray click on the backdrop.
 */
function Triage({ report, onChanged }: { report: Detail; onChanged: () => void }) {
  const [note, setNote] = useState(report.internalNote ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = note.trim() !== (report.internalNote ?? "");

  const patch = async (body: { status?: "new" | "resolved" | "spam"; internalNote?: string | null }, done: string) => {
    setSaving(true);
    try {
      await patchApiAdminFeedbackReportsById(report.id, body);
      toast.success(done);
      onChanged();
    } catch {
      toast.error("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="sm"
          value={report.status as "new"}
          onChange={(status) => void patch({ status }, status === "resolved" ? "Resolved" : status === "spam" ? "Marked as spam" : "Moved back to new")}
          options={[
            { value: "new", label: "New" },
            { value: "resolved", label: "Resolved" },
            { value: "spam", label: "Spam" },
          ]}
          ariaLabel="Status"
        />
        {report.statusAt && (
          <p className="text-muted-foreground text-caption">
            {report.status} by {report.statusBy ?? "someone"} · {relativeTime(report.statusAt)}
          </p>
        )}
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="What was it? Only other admins see this."
      />
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" disabled={!dirty || saving} onClick={() => void patch({ internalNote: note.trim() || null }, "Note saved")}>
          Save note
        </Button>
      </div>
    </div>
  );
}

function Facts({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{title}</h3>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// ─────────────────────────────── the screen ───────────────────────────────

/**
 * Fetched only when this tab is opened: reading it is audited, and a founder
 * triaging twenty reports by their words should not leave twenty reads of
 * respondents' conversations in the log.
 */
function ScreenView({ report }: { report: Detail }) {
  const { data, isPending, isError } = useGetApiAdminFeedbackReportsByIdSnapshot(report.id, {
    query: {
      queryKey: getGetApiAdminFeedbackReportsByIdSnapshotQueryKey(report.id),
      enabled: report.hasSnapshot,
      retry: false,
      // Evidence does not change; never refetch it behind the reader's back.
      staleTime: Infinity,
    },
  });

  if (!report.hasSnapshot) {
    return (
      <p className="text-muted-foreground mx-auto max-w-md py-16 text-center text-sm">
        No screen was attached. Either this report was filed before snapshots existed, or the respondent&apos;s browser
        did not send one — an extension, a dropped connection, or leaving the page straight away.
      </p>
    );
  }
  if (isPending) return <Skeleton className="h-[34rem] rounded-xl" />;

  const snapshot = apiData<ChatSnapshot | null>(data);
  if (isError || !snapshot || snapshot.v !== 1) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        The screen could not be loaded{snapshot && snapshot.v !== 1 ? " — it was captured in a newer format" : ""}.
      </p>
    );
  }
  return <ChatReplay snapshot={snapshot} height={520} />;
}
