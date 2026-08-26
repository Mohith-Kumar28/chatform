"use client";

import { useMemo, useState } from "react";
import { useGetApiFormsById, useGetApiFormsByIdSubmissions, useGetApiFormsByIdAnalytics } from "@/lib/api/dashboard/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CircleDashed, Clock, Download, MessageSquare } from "lucide-react";
import type { Block, FormDoc, PublicFormConfig } from "@repo/form-schema";

interface ResultsClientProps {
  formId: string;
  config: Pick<PublicFormConfig, "title">;
}

type Dist = {
  blockRef: string;
  title: string;
  type: string;
  answered: number;
  numericSummary: { avg: number; min: number; max: number } | null;
  options: { label: string; count: number }[];
};

type MainTab = "submissions" | "summary" | "analytics";

const BLOCK_ICON: Partial<Record<Block["type"], string>> = {
  email: "✉", phone: "☎", short_text: "T", long_text: "≡", number: "#", date: "📅",
  yes_no: "☑", single_select: "◉", multi_select: "☰", rating: "★", nps: "◎",
  opinion_scale: "⇹", file_upload: "📎", payment: "$", legal_consent: "✓", statement: "¶",
  url: "🔗",
};

export function ResultsClient({ formId }: ResultsClientProps) {
  const [tab, setTab] = useState<MainTab>("submissions");
  const [statusFilter, setStatusFilter] = useState<"completed" | "abandoned">("completed");
  const { data: rawAnalytics } = useGetApiFormsByIdAnalytics(formId as never);
  const { data: rawSubs, isLoading } = useGetApiFormsByIdSubmissions(formId as never);
  const { data: rawForm } = useGetApiFormsById(formId as never);
  const formDoc = (rawForm as unknown as { workingSchema?: FormDoc } | undefined)?.workingSchema;

  const analytics = rawAnalytics as
    | { views: number; starts: number; completed: number; abandoned: number; completionRate: number; avgDurationMs: number | null; perBlock: { blockRef: string; title: string; answered: number; answerRate: number }[]; distributions?: Dist[] }
    | undefined;
  interface SubRow {
    id: string;
    status: string;
    startedAt: number;
    durationMs: number | null;
    answers: { blockRef: string; blockType: string; value: unknown }[];
    transcript: { role: string; content: string; createdAt: number }[];
  }
  const submissions = (Array.isArray(rawSubs) ? rawSubs : []) as unknown as SubRow[];
  const completedCount = submissions.filter((s) => s.status === "completed").length;
  const partialCount = submissions.length - completedCount;
  const filtered = submissions.filter((s) => s.status === statusFilter);

  const questionColumns = useMemo(
    () => (formDoc?.blocks ?? []).filter((b) => !["welcome", "statement"].includes(b.type)),
    [formDoc],
  );

  const blockTitle = (ref: string): string => formDoc?.blocks.find((b) => b.ref === ref)?.title ?? ref;
  const answerLabel = (a: { blockRef: string; value: unknown }): string => {
    const block = formDoc?.blocks.find((b) => b.ref === a.blockRef);
    const options = block && "options" in block ? block.options : undefined;
    const fmt = (v: unknown): string => {
      if (options) {
        const opt = options.find((o) => o.id === v);
        if (opt) return opt.label;
      }
      if (typeof v === "boolean") return v ? "Yes" : "No";
      return String(v);
    };
    if (a.value === null || a.value === undefined) return "(skipped)";
    if (Array.isArray(a.value)) return a.value.map(fmt).join(", ");
    if (typeof a.value === "object") return JSON.stringify(a.value).slice(0, 60);
    return fmt(a.value);
  };

  const fmtDuration = (ms: number | null) => {
    if (!ms) return "—";
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="space-y-4 p-6">
      {/* toolbar: main tabs + download */}
      <div className="flex items-center justify-between">
        <div className="bg-card flex items-center gap-1 rounded-xl border p-1">
          {(["submissions", "summary", "analytics"] as MainTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-background border shadow-sm" : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <a
          href={`${process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787"}/api/forms/${formId}/submissions/export`}
          download
          className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
        >
          <Download className="size-4" /> Download
        </a>
      </div>

      {/* ── submissions ── */}
      {tab === "submissions" && (
        <>
          <div className="bg-card flex w-fit items-center gap-1 rounded-xl border p-1">
            {(["completed", "abandoned"] as const).map((f) => {
              const n = f === "completed" ? completedCount : partialCount;
              return (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm transition-colors ${
                    statusFilter === f ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "completed" ? "Completed" : "Partial"}
                  <span className={`rounded-full px-1.5 text-[10px] ${statusFilter === f ? "bg-primary/20" : "bg-muted"}`}>{n}</span>
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="bg-card rounded-2xl border border-dashed p-12 text-center">
              <p className="font-medium">No {statusFilter} submissions yet</p>
              <p className="text-muted-foreground mt-1 text-sm">Share the form link to start collecting responses.</p>
            </div>
          ) : (
            <div className="bg-card overflow-hidden rounded-xl border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {questionColumns.map((b) => (
                        <th key={b.ref} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <span className="text-xs">{BLOCK_ICON[b.type] ?? "•"}</span>
                            <span className="max-w-44 truncate">{b.title}</span>
                          </span>
                        </th>
                      ))}
                      <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                        <span className="flex items-center gap-1.5"><Clock className="text-muted-foreground size-3.5" /> Submitted At</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <SubmissionRow key={s.id} s={s} questionColumns={questionColumns} answerLabel={answerLabel} blockTitle={blockTitle} fmtDuration={fmtDuration} />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground border-t px-4 py-2 text-xs">
                Click a row to see the full response and chat transcript.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── summary ── */}
      {tab === "summary" && (
        <div className="grid gap-3 md:grid-cols-2">
          {(analytics?.distributions ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm">No answers yet.</p>
          )}
          {(analytics?.distributions ?? []).map((d: Dist) => (
            <Card key={d.blockRef}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{d.title}</CardTitle>
                <p className="text-muted-foreground text-xs">{d.answered} answers · {d.type}</p>
              </CardHeader>
              <CardContent>
                {d.numericSummary ? (
                  <div className="flex gap-6">
                    <Stat label="Average" value={String(d.numericSummary.avg)} />
                    <Stat label="Min" value={String(d.numericSummary.min)} />
                    <Stat label="Max" value={String(d.numericSummary.max)} />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {d.options.length === 0 && <p className="text-muted-foreground text-xs">No answers yet.</p>}
                    {d.options.map((o) => {
                      const pct = d.answered > 0 ? Math.round((o.count / d.answered) * 100) : 0;
                      return (
                        <div key={o.label} className="flex items-center gap-3">
                          <span className="w-40 truncate text-xs">{o.label}</span>
                          <div className="bg-muted h-4 flex-1 overflow-hidden rounded">
                            <div className="bg-primary h-full rounded" style={{ width: `${Math.max(pct, 3)}%` }} />
                          </div>
                          <span className="text-muted-foreground w-16 text-right text-xs">{o.count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── analytics ── */}
      {tab === "analytics" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KPI label="Views" value={analytics?.views ?? 0} />
            <KPI label="Starts" value={analytics?.starts ?? 0} />
            <KPI label="Completed" value={analytics?.completed ?? 0} accent />
            <KPI label="Abandoned" value={analytics?.abandoned ?? 0} />
            <KPI label="Completion rate" value={`${analytics?.completionRate ?? 0}%`} />
            <KPI label="Avg time" value={fmtDuration(analytics?.avgDurationMs ?? null)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Drop-off by question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {(analytics?.perBlock ?? []).map((b) => (
                <div key={b.blockRef} className="flex items-center gap-3">
                  <span className="w-48 truncate text-sm">{b.title}</span>
                  <div className="bg-muted h-5 flex-1 overflow-hidden rounded-md">
                    <div
                      className="bg-primary flex h-full items-center justify-end rounded-md pr-2 text-[10px] font-medium text-white"
                      style={{ width: `${Math.max(b.answerRate, 8)}%` }}
                    >
                      {b.answerRate}%
                    </div>
                  </div>
                  <span className="text-muted-foreground w-10 text-right text-xs">{b.answered}</span>
                </div>
              ))}
              {(analytics?.perBlock ?? []).length === 0 && (
                <p className="text-muted-foreground text-sm">No answerable blocks.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SubmissionRow({
  s,
  questionColumns,
  answerLabel,
  blockTitle,
  fmtDuration,
}: {
  s: {
    id: string;
    status: string;
    startedAt: number;
    durationMs: number | null;
    answers: { blockRef: string; blockType: string; value: unknown }[];
    transcript: { role: string; content: string; createdAt: number }[];
  };
  questionColumns: Block[];
  answerLabel: (a: { blockRef: string; value: unknown }) => string;
  blockTitle: (ref: string) => string;
  fmtDuration: (ms: number | null) => string;
}) {
  const [open, setOpen] = useState(false);
  const answerFor = (ref: string): string => {
    const a = s.answers.find((x) => x.blockRef === ref);
    return a ? answerLabel(a) : "—";
  };

  return (
    <>
      <tr className="hover:bg-accent/40 cursor-pointer border-b transition-colors" onClick={() => setOpen(!open)}>
        {questionColumns.map((b) => (
          <td key={b.ref} className="max-w-52 truncate px-4 py-3">{answerFor(b.ref)}</td>
        ))}
        <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
          {new Date(s.startedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </td>
      </tr>
      {open && (
        <tr className="border-b bg-muted/30">
          <td colSpan={questionColumns.length + 1} className="p-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">Transcript</p>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border bg-[var(--card)] p-3">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                    <Badge variant={s.status === "completed" ? "default" : "secondary"}>
                      {s.status === "completed" ? <CheckCircle2 className="mr-1 size-3" /> : <CircleDashed className="mr-1 size-3" />}
                      {s.status}
                    </Badge>
                    <span className="flex items-center gap-1"><Clock className="size-3" /> {fmtDuration(s.durationMs)}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="size-3" /> {s.transcript.length} messages</span>
                  </div>
                  {s.transcript.map((t, i) => (
                    <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                      <span
                        className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs ${
                          t.role === "user" ? "bg-primary text-white" : "bg-[var(--card)] border"
                        }`}
                      >
                        {t.content}
                      </span>
                    </div>
                  ))}
                  {s.transcript.length === 0 && <p className="text-muted-foreground text-xs">No transcript (imported via API).</p>}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">Answers</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {s.answers.length === 0 && <p className="text-muted-foreground text-xs">No answers.</p>}
                  {s.answers.map((a) => (
                    <div key={a.blockRef} className="flex items-center gap-2 rounded-lg border bg-[var(--card)] px-3 py-1.5 text-xs">
                      <span className="font-medium">{blockTitle(a.blockRef)}</span>
                      <span className="text-muted-foreground truncate">{answerLabel(a)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-display text-xl font-semibold">{value}</p>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary/40" : undefined}>
      <CardHeader className="pb-1">
        <CardTitle className="text-muted-foreground text-xs font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`font-display text-2xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
