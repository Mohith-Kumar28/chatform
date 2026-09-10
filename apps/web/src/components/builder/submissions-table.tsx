"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Link2,
  Maximize2,
  Minimize2,
  MailCheck,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { displayAnswer, type Block } from "@repo/form-schema";
import {
  getGetApiFormsByIdAnalyticsQueryKey,
  getGetApiFormsByIdSubmissionsQueryKey,
  useDeleteApiFormsByIdSubmissions,
} from "@/lib/api/dashboard/dashboard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime, formatDuration, formatRelative, formatShortDateTime, isPast } from "@/lib/format";
import { useClientValue } from "@/hooks/use-client-value";
import { useEntitlements } from "@/hooks/use-entitlements";
import { blockMeta, TONE_CLASSES } from "./block-library";
import { cn } from "@/lib/utils";

/**
 * The responses table.
 *
 * Rewritten from an expanding row. Clicking a response used to unfold a panel
 * *inside* the table — a `colSpan` cell holding a two-column grid of transcript
 * and fields — which meant the detail view inherited the table's horizontal
 * scroll and its column widths. On a form with nine questions the panel opened
 * somewhere off to the right of the viewport, the conversation was pinched into
 * whatever was left, and the row that was clicked disappeared under it. What
 * you want to read is one whole response; what a table is good at is comparing
 * many. Those are two surfaces, so they are now two: the table stays a table,
 * and a response opens in a dialog with room for it.
 *
 * The rest follows from the same idea — the table earns its width back. The
 * timestamp moved from the first column (where it pushed the answers, the
 * reason anyone is here, off screen) to a sticky one on the right, so it stays
 * readable however far sideways the answers scroll. Selection with checkboxes
 * makes "delete these three" and "download just these" possible, and full
 * screen exists because a nine-question form does not fit in a builder pane.
 */

export interface SubmissionRecord {
  id: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  answers: { blockRef: string; blockType: string; value: unknown }[];
  transcript: { role: string; content: string; createdAt: number }[];
  /** Only for forms that required sign-in. */
  respondent: { provider: string; label: string; name: string | null } | null;
  /** Null when this response was never in a follow-up sequence. */
  followUp?: {
    sent: number;
    scheduled: number;
    queued: number;
    holdout: boolean;
    recovered: boolean;
    /** Epoch ms of the next step still waiting to go out. */
    nextScheduledAt: number | null;
    lastSentAt: number | null;
    stoppedStatus: string | null;
    stoppedReason: string | null;
  } | null;
  /** Why no sequence was ever scheduled — set when `followUp` is null for a reason. */
  followUpSkip?: string | null;
}

/**
 * Why this response is not getting a reminder, in the author's words.
 *
 * These are the silent branches of `scheduleFollowUps` and the sweep. An author
 * whose postal address is missing, or whose change is saved but unpublished,
 * gets no row in `followups` to look at and no error anywhere — the feature
 * simply does nothing. Naming the cause on the response it happened to is the
 * cheapest place to put it, because that is where they are already looking.
 */
const SKIP_COPY: Record<string, string> = {
  unpublished: "form not published",
  unreadable: "form could not be read",
  disabled: "reminders off when they left",
  not_entitled: "not on this plan",
  no_postal_address: "no postal address set",
  opted_out: "they opted out",
  no_answers: "nothing answered yet",
  no_address: "no email to send to",
  suppressed: "unsubscribed",
  closed: "form closes first",
  response_settled: "they finished first",
  step_removed: "step was removed",
  email_quota: "email quota spent",
  shared_domain_cap: "sending cap reached",
  unsubscribed: "unsubscribed",
  completed: "they finished",
  disqualified: "screened out",
};

function skipCopy(reason: string): string {
  return SKIP_COPY[reason] ?? reason.replace(/_/g, " ");
}

/**
 * "in 3h", not "in 3 hours".
 *
 * `formatRelative` writes prose, and the follow-up column is not prose: it is a
 * strip a few characters wide between the answers and the timestamp. The unit
 * is a single letter here; the sentence version is on the `title` and, spelled
 * out with an absolute clock, in the dialog.
 */
function shortIn(at: number): string {
  const diff = Math.max(0, at - Date.now());
  if (diff >= 86_400_000) return `in ${Math.round(diff / 86_400_000)}d`;
  if (diff >= 3_600_000) return `in ${Math.round(diff / 3_600_000)}h`;
  return `in ${Math.max(1, Math.round(diff / 60_000))}m`;
}

/**
 * What happened after they left, in a word.
 *
 * This used to spell the reason out in the cell — "Not sent — nothing answered
 * yet", "Not sent — reminders off when they left" — and no width could hold it:
 * every cell ended in an ellipsis, and the half that got cut was the half that
 * carried the meaning. A column that has to truncate to fit is a column saying
 * the wrong thing. So the cell now says only *which* of the five things
 * happened, in one word; the reason rides on the `title`, and the dialog below
 * still gives it in full with real times on it.
 */
function followUpLabel(
  row: SubmissionRecord,
): { text: string; detail: string; tone: "good" | "muted" | "warn" } | null {
  const f = row.followUp;
  if (!f) {
    if (row.followUpSkip) {
      return { text: "Not sent", detail: `Not sent — ${skipCopy(row.followUpSkip)}`, tone: "warn" };
    }
    /*
     * The decision has not been made yet, which is not the same as "nothing
     * will happen" — and an em-dash said the second. A conversation stays
     * `in_progress` for half an hour after its last message (`IDLE_ALARM_MS`
     * in the session object); only when that alarm fires is the response
     * finalised as abandoned, and only then does `scheduleFollowUps` run. So
     * the newest rows in the Partial list — the ones an author is most likely
     * to be staring at — correctly have no sequence and no skip reason, and the
     * honest label is that the clock is still running.
     */
    return row.status === "in_progress"
      ? {
          text: "Still open",
          detail:
            "No reminder decided yet — they may still be answering. Reminders are arranged 30 minutes after their last message.",
          tone: "muted",
        }
      : null;
  }
  if (f.recovered) {
    return { text: "Recovered", detail: "They came back and finished after a reminder", tone: "good" };
  }
  if (f.holdout) {
    return {
      text: "Held back",
      detail: "Held back from the reminder sequence, to keep the recovery figure honest",
      tone: "muted",
    };
  }
  // In flight beats the count: "sending" is the more useful thing to know while
  // it is true, and it is true for seconds.
  if (f.queued > 0) return { text: "Sending", detail: "A reminder is with the mail queue now", tone: "muted" };
  if (f.scheduled > 0 && f.nextScheduledAt) {
    /*
     * A due time in the past is normal, not late: the sweep runs every five
     * minutes, and a step configured for less than the idle window is overdue
     * the moment it is written. Saying "3 minutes ago" would read as a message
     * that has already gone, which is the opposite of what it means.
     */
    return isPast(f.nextScheduledAt)
      ? {
          text: "Due",
          detail: `Reminder was due ${formatDateTime(f.nextScheduledAt)} and goes out on the next sweep`,
          tone: "muted",
        }
      : {
          text: shortIn(f.nextScheduledAt),
          detail: `Reminder sends ${formatDateTime(f.nextScheduledAt)}`,
          tone: "muted",
        };
  }
  if (f.scheduled > 0) return { text: "Queued", detail: "A reminder is scheduled", tone: "muted" };
  if (f.sent > 0) {
    return {
      text: f.sent === 1 ? "Sent" : `Sent ×${f.sent}`,
      detail: f.lastSentAt
        ? `${f.sent === 1 ? "Reminder sent" : `Last of ${f.sent} reminders sent`} ${formatRelative(f.lastSentAt)}`
        : "Reminder sent",
      tone: "muted",
    };
  }
  if (f.stoppedReason) {
    return { text: "Not sent", detail: `Not sent — ${skipCopy(f.stoppedReason)}`, tone: "warn" };
  }
  return null;
}

/**
 * A floor for the Submitted column, not its width.
 *
 * It was `w-[9.5rem]`, paired with a hardcoded `right-[9.5rem]` on the column
 * pinned beside it. Under `table-layout: auto` a cell width is a suggestion the
 * browser is free to exceed, and it does — so the second pinned column stopped
 * short of the first and the answers scrolled through the gap between them. The
 * offset is measured now; this only stops the column collapsing.
 */
const SUBMITTED_MIN_W = "min-w-[9.5rem]";

/**
 * The lift under a pinned column, cast onto whatever is sliding beneath it.
 *
 * Deliberately one-sided: the spread is trimmed to nothing on three edges with
 * a negative blur radius, so nothing bleeds onto the row above, below, or the
 * far side. Without it the pinned columns and the scrolling ones sit on exactly
 * the same plane, and the moment a long answer slides under one the table reads
 * as broken rather than as layered.
 */
const PIN_SHADOW_LEFT = "shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.45)]";
const PIN_SHADOW_RIGHT = "shadow-[10px_0_10px_-10px_rgba(0,0,0,0.45)]";

/**
 * One phrase about the follow-up sequence, shared by the column and the dialog.
 *
 * `empty` differs between the two on purpose: a table column has to hold its
 * shape, so it shows an em-dash; a row of badges in the dialog should simply
 * not carry one.
 */
function FollowUpCell({ row, empty = "dash" }: { row: SubmissionRecord; empty?: "dash" | "none" }) {
  const label = followUpLabel(row);
  if (!label) {
    return empty === "dash" ? <span className="text-muted-foreground/60">—</span> : null;
  }
  return (
    <span
      title={label.detail}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
        // `--warning-soft` pairs with `--warning-soft-foreground`, never with
        // `--warning` — that pairing is the one that reads in both themes.
        label.tone === "good"
          ? "bg-[var(--success-soft,var(--primary-soft))] text-[var(--success)]"
          : label.tone === "warn"
            ? "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]"
            : "bg-muted text-muted-foreground",
      )}
    >
      <MailCheck className="size-3 shrink-0" />
      <span className="whitespace-nowrap">{label.text}</span>
    </span>
  );
}

/**
 * The reminder sequence for one response, with real times on it.
 *
 * The badge says "in 1h", which is the right density for a table and the wrong
 * one for somebody who has opened a response to work out what the product did. Here the times are absolute — a relative time is unfalsifiable,
 * and "why has this not gone" is exactly the question you cannot answer without
 * a clock you can compare against your own.
 *
 * Step numbers are derived rather than fetched: the counts already say how many
 * steps this response's sequence has and how many have gone, which is the whole
 * of "2 of 3" without a second query.
 */
function FollowUpDetail({ row }: { row: SubmissionRecord }) {
  const f = row.followUp;
  if (!f) {
    if (row.followUpSkip) {
      return (
        <p className="text-muted-foreground text-xs">
          No reminder scheduled — {skipCopy(row.followUpSkip)}.
        </p>
      );
    }
    // See `followUpLabel`: nothing is decided until the conversation goes idle.
    if (row.status === "in_progress") {
      return (
        <p className="text-muted-foreground text-xs">
          No reminder decided yet — this conversation is still open. Whether one is sent is worked
          out 30 minutes after their last message.
        </p>
      );
    }
    return null;
  }

  const total = f.sent + f.queued + f.scheduled;
  const done = f.sent + f.queued;
  const lines: string[] = [];

  if (f.holdout) {
    lines.push("Held back from the reminder sequence, to keep the recovery figure honest.");
  }
  if (f.lastSentAt) {
    const which = f.sent === 1 ? "Reminder sent" : `${f.sent} reminders sent, last`;
    lines.push(`${which} ${formatDateTime(f.lastSentAt)}.`);
  }
  if (f.queued > 0) {
    lines.push("A reminder is with the mail queue now.");
  }
  if (f.nextScheduledAt) {
    const step = total > 1 ? `Reminder ${Math.min(done + 1, total)} of ${total}` : "The reminder";
    // Due in the past means it is waiting on the next sweep, not that it went.
    lines.push(
      isPast(f.nextScheduledAt)
        ? `${step} was due ${formatDateTime(f.nextScheduledAt)} and goes out on the next sweep.`
        : `${step} sends ${formatDateTime(f.nextScheduledAt)}.`,
    );
  }
  if (f.stoppedReason) {
    lines.push(
      `${f.stoppedStatus === "failed" ? "Delivery failed" : "Sequence stopped"} — ${skipCopy(f.stoppedReason)}.`,
    );
  }
  if (lines.length === 0) return null;

  return (
    <div className="text-muted-foreground space-y-1 text-xs">
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  );
}

export type ResultColumn = Pick<Block, "ref" | "title" | "type">;

export function SubmissionsTable({
  formId,
  rows,
  columns,
  /** The status switcher, rendered on the left of the table's own toolbar. */
  filters,
  /**
   * Whether there is a follow-up story to tell at all — see the caller. The
   * column is Partial-only (on a completed response the answer is always "they
   * finished", which the row already says) and it is also off whenever nobody
   * has turned reminders on, because a column of "not sent" is a column's worth
   * of width spent saying that a feature is switched off.
   */
  showFollowUp = false,
}: {
  formId: string;
  rows: SubmissionRecord[];
  columns: ResultColumn[];
  filters?: React.ReactNode;
  showFollowUp?: boolean;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /**
   * A response is addressable.
   *
   * "Look at this one" was previously a screenshot: the expanded row had no
   * URL, so the only way to point a colleague at a response was to describe it.
   *
   * The URL is read through `useClientValue`, which gives the server render a
   * `null` and the first browser render the real value — reading
   * `window.location` in a `useState` initialiser instead throws on the server,
   * and an effect that sets state after mount renders the table twice on every
   * visit. Once anything has been opened or closed by hand, that choice wins
   * and the URL is only written to.
   */
  const urlResponse = useClientValue(
    () => new URLSearchParams(window.location.search).get("response"),
    null as string | null,
  );
  const [chosen, setChosen] = useState<{ id: string | null } | null>(null);
  const openId = chosen ? chosen.id : urlResponse;
  const setOpenId = useCallback((id: string | null) => setChosen({ id }), []);
  const [full, setFull] = useState(false);
  const [confirming, setConfirming] = useState<string[] | null>(null);

  const ent = useEntitlements();
  const queryClient = useQueryClient();
  const del = useDeleteApiFormsByIdSubmissions();
  const canDelete = ent.allows("submission", "delete");

  /**
   * How far in the Follow-up column has to sit, measured rather than assumed.
   *
   * The Submitted column's width is decided by the browser — its content, the
   * table's own width, and whatever `table-layout: auto` does with the leftover
   * space — so no class can state it in advance. A `ResizeObserver` on the
   * header cell keeps the two columns flush through a window resize, a switch
   * to full screen, and a form whose questions change the table's width.
   *
   * The initial value matches `SUBMITTED_MIN_W`, so the first paint is already
   * close and the correction is never a visible jump.
   */
  const submittedRef = useRef<HTMLTableCellElement>(null);
  const [submittedW, setSubmittedW] = useState(152);
  useEffect(() => {
    const el = submittedRef.current;
    if (!el) return;
    const measure = () => setSubmittedW(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [full, columns.length, rows.length]);

  const hasRespondents = rows.some((r) => r.respondent);
  const openIndex = openId ? rows.findIndex((r) => r.id === openId) : -1;
  const open = openIndex >= 0 ? rows[openIndex]! : null;

  // Written back while a response is open, so a refresh — or a pasted link —
  // lands on the same one.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set("response", openId);
    else url.searchParams.delete("response");
    window.history.replaceState(null, "", url);
  }, [openId]);

  /**
   * The selection is derived, not synchronised.
   *
   * Rows change under it — the status filter flips, a delete lands — and a
   * selection still holding ids that are no longer on screen would let
   * "delete 3 selected" remove something the person cannot see. Intersecting
   * with what is rendered says that in one line, and without the effect that
   * would re-render every list change to say the same thing.
   */
  const selected = useMemo(
    () => new Set(rows.filter((r) => picked.has(r.id)).map((r) => r.id)),
    [rows, picked],
  );

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      // Only when nothing else owns the key: the dialog closes itself first.
      if (e.key === "Escape" && !openId) setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, openId]);

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  async function runDelete(ids: string[]) {
    try {
      await del.mutateAsync({ id: formId as never, data: { ids } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetApiFormsByIdSubmissionsQueryKey(formId as never) }),
        queryClient.invalidateQueries({ queryKey: getGetApiFormsByIdAnalyticsQueryKey(formId as never) }),
      ]);
      setPicked(new Set());
      if (openId && ids.includes(openId)) setOpenId(null);
      toast.success(ids.length === 1 ? "Response deleted" : `${ids.length} responses deleted`);
    } catch {
      toast.error("Could not delete", { description: "Nothing was removed — try again." });
    }
  }

  const table = (
    <div className={cn("flex min-h-0 flex-col gap-3", full && "h-full")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">{filters}</div>
        <div className="flex items-center gap-1.5">
          {selected.size > 0 && (
            <>
              <span className="text-muted-foreground text-caption tabular mr-1">
                {selected.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                shape="pill"
                onClick={() => downloadCsv(rows.filter((r) => selected.has(r.id)), columns, hasRespondents)}
              >
                <Download className="size-3.5" />
                Download
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  shape="pill"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirming([...selected])}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={() => setPicked(new Set())}>
                <X className="size-3.5" />
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            shape="pill"
            aria-label={full ? "Exit full screen" : "Full screen"}
            title={full ? "Exit full screen (Esc)" : "Full screen"}
            onClick={() => setFull((f) => !f)}
          >
            {full ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </div>

      <div className={cn("bg-card min-h-0 overflow-hidden rounded-xl border", full && "flex-1")}>
        {/* The table scrolls inside its own box, so the page never does. */}
        <div className={cn("overflow-auto", full ? "h-full" : "max-h-[32rem]")}>
          <table className="w-full border-separate border-spacing-0 text-sm">
            {/* Sticky lives on the cells, not on `thead`: a sticky `thead` is
                the one browsers disagree about, and the corner cells need to
                out-rank their neighbours anyway. */}
            <thead>
              <tr className="bg-muted [&>th]:sticky [&>th]:top-0 [&>th]:z-20 [&>th]:border-b [&>th]:bg-muted">
                <th className={cn("left-0 z-30! w-10 px-3 py-2.5", PIN_SHADOW_RIGHT)}>
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--primary)] align-middle"
                    aria-label={allSelected ? "Deselect all" : "Select all"}
                    checked={allSelected}
                    onChange={() => setPicked(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </th>
                {hasRespondents && <HeadCell icon={ShieldCheck}>Respondent</HeadCell>}
                {columns.map((b) => {
                  const meta = blockMeta(b.type);
                  return (
                    <th key={b.ref} className="px-3 py-2.5 text-left">
                      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                        <span className={cn("grid size-4 shrink-0 place-items-center rounded", TONE_CLASSES[meta.tone])}>
                          <meta.icon className="size-2.5" strokeWidth={2} />
                        </span>
                        <span className="block max-w-[13rem] truncate">{b.title}</span>
                      </span>
                    </th>
                  );
                })}
                {/*
                  Pinned beside Submitted rather than left to scroll, because
                  "when is the next reminder" is read against "when did they
                  leave" — the two numbers only mean something together.

                  Its offset is the Submitted column's measured width — see
                  `submittedW`. A pinned column has to know exactly how wide its
                  neighbour ended up, and no class can say that in advance.
                */}
                {showFollowUp && (
                  <th
                    className={cn("sticky z-30! border-l px-3 py-2.5 text-left", PIN_SHADOW_LEFT)}
                    style={{ right: submittedW }}
                  >
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
                      <MailCheck className="size-3.5" />
                      Follow-up
                    </span>
                  </th>
                )}
                {/*
                  Pinned, because it is the one column you look for after
                  scrolling right — and because a table that ends in whitespace
                  reads as truncated rather than as finished.
                */}
                <th
                  ref={submittedRef}
                  className={cn(
                    "right-0 z-30! border-l px-3 py-2.5 text-left",
                    SUBMITTED_MIN_W,
                    // Only the column that leads the pinned group casts a
                    // shadow. On both, the second would draw over the first.
                    !showFollowUp && PIN_SHADOW_LEFT,
                  )}
                >
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
                    <Clock className="size-3.5" />
                    Submitted
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const byRef = new Map(row.answers.map((a) => [a.blockRef, a.value]));
                const picked = selected.has(row.id);
                return (
                  <tr
                    key={row.id}
                    onClick={() => setOpenId(row.id)}
                    // `bg-inherit` on the pinned cells is what keeps the row's
                    // own colour under them while everything else slides past.
                    className={cn(
                      "cursor-pointer transition-colors [&>td]:border-b",
                      picked ? "bg-primary-soft" : "bg-card hover:bg-muted",
                    )}
                  >
                    <td className={cn("w-10 bg-inherit px-3 py-2.5 sticky left-0 z-10", PIN_SHADOW_RIGHT)}>
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[var(--primary)] align-middle"
                        aria-label={`Select response from ${formatWhen(row)}`}
                        checked={picked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    {hasRespondents && (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {row.respondent ? (
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="size-3.5 shrink-0 text-[var(--success)]" />
                            <span className="block max-w-[13rem] truncate">{row.respondent.label}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    {columns.map((b) => (
                      <td key={b.ref} className="px-3 py-2.5">
                        <span className="block max-w-[16rem] truncate">
                          {displayCell(b, byRef.get(b.ref)) || <span className="text-muted-foreground/60">—</span>}
                        </span>
                      </td>
                    ))}
                    {showFollowUp && (
                      <td
                        className={cn(
                          "text-muted-foreground bg-inherit sticky z-10 border-l px-3 py-2.5 whitespace-nowrap",
                          PIN_SHADOW_LEFT,
                        )}
                        style={{ right: submittedW }}
                      >
                        <FollowUpCell row={row} />
                      </td>
                    )}
                    <td
                      className={cn(
                        "text-muted-foreground bg-inherit sticky right-0 z-10 border-l px-3 py-2.5 whitespace-nowrap",
                        SUBMITTED_MIN_W,
                        !showFollowUp && PIN_SHADOW_LEFT,
                      )}
                    >
                      {formatWhen(row)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-muted-foreground text-micro px-0.5">
        Scroll sideways for the rest of the columns. Click a row to read the whole response.
      </p>
    </div>
  );

  return (
    <>
      {full ? (
        // Above the page chrome but below dialogs, so the response detail still
        // opens over it.
        <div className="bg-background fixed inset-0 z-[var(--z-overlay)] flex flex-col gap-3 p-4 sm:p-6">
          {table}
        </div>
      ) : (
        table
      )}

      <SubmissionDialog
        row={open}
        columns={columns}
        index={openIndex}
        total={rows.length}
        canDelete={canDelete}
        onClose={() => setOpenId(null)}
        onStep={(delta) => {
          const next = rows[openIndex + delta];
          if (next) setOpenId(next.id);
        }}
        onDelete={() => open && setConfirming([open.id])}
        onDownload={() => open && downloadCsv([open], columns, hasRespondents)}
      />

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={
          confirming?.length === 1 ? "Delete this response?" : `Delete ${confirming?.length ?? 0} responses?`
        }
        description="The answers and the conversation go with it. This cannot be undone — download them first if you might want them."
        confirmLabel="Delete"
        onConfirm={async () => {
          const ids = confirming ?? [];
          setConfirming(null);
          await runDelete(ids);
        }}
      />
    </>
  );
}

function HeadCell({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <th className="px-3 py-2.5 text-left">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
        <Icon className="size-3.5" />
        {children}
      </span>
    </th>
  );
}

/**
 * One whole response, with the conversation that produced it.
 *
 * DESIGN.md north star #3 — "every response is stored and displayed as a
 * transcript first, fields second" — is why the transcript is here at full
 * width rather than in a column beside the answers. The answers come first
 * because that is what someone opening a response is checking; the conversation
 * is underneath, in full, because it is the thing a form platform cannot show.
 */
function SubmissionDialog({
  row,
  columns,
  index,
  total,
  canDelete,
  onClose,
  onStep,
  onDelete,
  onDownload,
}: {
  row: SubmissionRecord | null;
  columns: ResultColumn[];
  index: number;
  total: number;
  canDelete: boolean;
  onClose: () => void;
  onStep: (delta: number) => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const byRef = useMemo(
    () => new Map((row?.answers ?? []).map((a) => [a.blockRef, a.value])),
    [row],
  );
  if (!row) return null;

  const answered = columns.filter((b) => displayCell(b, byRef.get(b.ref)) !== "").length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="3xl" layout="panel" showCloseButton={false}>
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-h3">
              {row.status === "completed"
                ? "Response"
                : row.status === "disqualified"
                  ? "Screened out"
                  : "Partial response"}
            </DialogTitle>
            <p className="text-muted-foreground text-caption mt-0.5 truncate">
              {formatDateTime(row.completedAt ?? row.startedAt)}
              {" · "}
              {formatRelative(row.completedAt ?? row.startedAt)}
              {" · "}
              <span className="font-mono">{row.id}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {total > 1 && (
              <>
                <Button variant="ghost" size="icon-sm" aria-label="Previous response" disabled={index <= 0} onClick={() => onStep(-1)}>
                  <ChevronUp className="size-4" />
                </Button>
                <span className="text-muted-foreground tabular px-1 text-xs">
                  {index + 1}/{total}
                </span>
                <Button variant="ghost" size="icon-sm" aria-label="Next response" disabled={index >= total - 1} onClick={() => onStep(1)}>
                  <ChevronDown className="size-4" />
                </Button>
                <span className="bg-border mx-1 h-5 w-px" />
              </>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy link to this response"
              title="Copy link"
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href);
                toast.success("Link copied");
              }}
            >
              <Link2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Download this response" title="Download CSV" onClick={onDownload}>
              <Download className="size-4" />
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete this response"
                title="Delete"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <DialogBody className="space-y-6 px-5 py-4">
          <div className="text-caption flex flex-wrap items-center gap-2">
            {/*
              Three states, not two.
              A screened-out response is terminal — the form reached an ending
              and refused it — so reading it as "Didn't finish" tells the author
              the opposite of what happened: these people answered everything
              asked of them and were turned away on purpose.
            */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                row.status === "completed"
                  ? "bg-[var(--success-soft,var(--primary-soft))] text-[var(--success)]"
                  : row.status === "disqualified"
                    ? // `soft` paired with `soft-foreground`, which is the pairing
                      // that reads in both themes — see the status tokens in
                      // globals.css for what pairing it with `--warning` does.
                      "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {row.status === "completed" && <Check className="size-3" />}
              {row.status === "disqualified" && <ShieldAlert className="size-3" />}
              {row.status === "completed"
                ? "Completed"
                : row.status === "disqualified"
                  ? "Screened out"
                  : "Didn't finish"}
            </span>
            <FollowUpCell row={row} empty="none" />
            <span className="text-muted-foreground">
              {answered} of {columns.length} answered
            </span>
            {row.durationMs !== null && (
              <span className="text-muted-foreground">· took {formatDuration(row.durationMs)}</span>
            )}
            {row.respondent && (
              <span className="flex items-center gap-1 text-[var(--success)]">
                <ShieldCheck className="size-3.5" />
                {row.respondent.label}
              </span>
            )}
          </div>

          <FollowUpDetail row={row} />

          {/*
            The answer is the thing; the question is its label.
            
            Both were `text-sm` and both were ink, one merely a weight apart, so
            eleven questions and eleven answers came out as twenty-two lines of
            the same grey and you had to count to work out which was which. The
            question is now a small muted label and the answer sits under it at
            reading size in full-strength ink — the same relationship a field
            has to its value everywhere else in the product — and a hairline
            between rows says where one answer stops.
          */}
          <dl className="divide-border/60 divide-y">
            {columns.map((b) => {
              const meta = blockMeta(b.type);
              const value = displayCell(b, byRef.get(b.ref));
              return (
                <div key={b.ref} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded", TONE_CLASSES[meta.tone])}>
                    <meta.icon className="size-3" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <dt className="text-muted-foreground text-caption leading-snug">{b.title}</dt>
                    <dd
                      className={cn(
                        "mt-1 break-words whitespace-pre-wrap",
                        value
                          ? "text-[0.9375rem] leading-snug font-medium"
                          : "text-muted-foreground/60 text-sm italic",
                      )}
                    >
                      {value || "Not answered"}
                    </dd>
                  </div>
                </div>
              );
            })}
          </dl>

          {row.transcript.length > 0 && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-micro font-medium tracking-wide uppercase">
                The conversation
              </p>
              <div className="bg-muted/30 space-y-2 rounded-xl p-3">
                {row.transcript.map((m, i) => (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <p
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap",
                        m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border",
                      )}
                    >
                      {m.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function formatWhen(row: SubmissionRecord): string {
  return formatShortDateTime(row.completedAt ?? row.startedAt);
}

/**
 * One answer, resolved against its block.
 *
 * `displayAnswer` is the same function the respondent's own review card uses,
 * so what the builder reads here is exactly what the person answering saw —
 * option labels rather than `opt_founder001`, readable pairs rather than
 * `{"row_ui000001":"col_bad00001"}`.
 */
function displayCell(block: ResultColumn, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return displayAnswer(block as Block, value);
}

/** Selected rows, as the spreadsheet the export endpoint would have given. */
function downloadCsv(rows: SubmissionRecord[], columns: ResultColumn[], withRespondent: boolean) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = [
    "Submitted",
    "Status",
    ...(withRespondent ? ["Respondent"] : []),
    ...columns.map((c) => c.title),
  ];
  const lines = [header.map(esc).join(",")];
  for (const row of rows) {
    const byRef = new Map(row.answers.map((a) => [a.blockRef, a.value]));
    lines.push(
      [
        new Date(row.completedAt ?? row.startedAt).toISOString(),
        row.status,
        ...(withRespondent ? [row.respondent?.label ?? ""] : []),
        ...columns.map((b) => displayCell(b, byRef.get(b.ref))),
      ]
        .map((v) => esc(String(v)))
        .join(","),
    );
  }

  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = rows.length === 1 ? `response-${rows[0]!.id}.csv` : `responses-${rows.length}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
