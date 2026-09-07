"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Link2,
  Maximize2,
  Minimize2,
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
}

export type ResultColumn = Pick<Block, "ref" | "title" | "type">;

export function SubmissionsTable({
  formId,
  rows,
  columns,
  /** The status switcher, rendered on the left of the table's own toolbar. */
  filters,
}: {
  formId: string;
  rows: SubmissionRecord[];
  columns: ResultColumn[];
  filters?: React.ReactNode;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /**
   * A response is addressable.
   *
   * "Look at this one" was previously a screenshot: the expanded row had no
   * URL, so the only way to point a colleague at a response was to describe it.
   * Read once, at mount — this component only ever renders after the rows have
   * arrived from the browser's own fetch, so there is no server render to
   * disagree with.
   */
  const [openId, setOpenId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("response"),
  );
  const [full, setFull] = useState(false);
  const [confirming, setConfirming] = useState<string[] | null>(null);

  const ent = useEntitlements();
  const queryClient = useQueryClient();
  const del = useDeleteApiFormsByIdSubmissions();
  const canDelete = ent.allows("submission", "delete");

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
      setOpenId((cur) => (cur && ids.includes(cur) ? null : cur));
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
                <th className="left-0 z-30! w-10 px-3 py-2.5">
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
                  Pinned, because it is the one column you look for after
                  scrolling right — and because a table that ends in whitespace
                  reads as truncated rather than as finished.
                */}
                <th className="right-0 z-30! border-l px-3 py-2.5 text-left">
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
                    <td className="w-10 bg-inherit px-3 py-2.5 sticky left-0 z-10">
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
                    <td className="text-muted-foreground bg-inherit sticky right-0 z-10 border-l px-3 py-2.5 whitespace-nowrap">
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
              {row.status === "completed" ? "Response" : "Partial response"}
            </DialogTitle>
            <p className="text-muted-foreground text-caption mt-0.5 truncate">
              {new Date(row.completedAt ?? row.startedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {" · "}
              {relativeTime(row.completedAt ?? row.startedAt)}
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
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                row.status === "completed"
                  ? "bg-[var(--success-soft,var(--primary-soft))] text-[var(--success)]"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {row.status === "completed" && <Check className="size-3" />}
              {row.status === "completed" ? "Completed" : "Didn't finish"}
            </span>
            <span className="text-muted-foreground">
              {answered} of {columns.length} answered
            </span>
            {row.durationMs !== null && (
              <span className="text-muted-foreground">· took {Math.round(row.durationMs / 1000)}s</span>
            )}
            {row.respondent && (
              <span className="flex items-center gap-1 text-[var(--success)]">
                <ShieldCheck className="size-3.5" />
                {row.respondent.label}
              </span>
            )}
          </div>

          <dl className="space-y-4">
            {columns.map((b) => {
              const meta = blockMeta(b.type);
              const value = displayCell(b, byRef.get(b.ref));
              return (
                <div key={b.ref} className="flex gap-3">
                  <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded", TONE_CLASSES[meta.tone])}>
                    <meta.icon className="size-3" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <dt className="text-sm font-medium">{b.title}</dt>
                    <dd className={cn("mt-0.5 text-sm break-words whitespace-pre-wrap", !value && "text-muted-foreground/60")}>
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
  return new Date(row.completedAt ?? row.startedAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

function relativeTime(at: number): string {
  const diff = at - Date.now();
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return fmt.format(Math.round(diff / ms), unit);
  }
  return fmt.format(0, "minute");
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
