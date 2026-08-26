"use client";

import Link from "next/link";
import {
  ArrowLeft, BarChart3, Blocks, Check, Copy, Check as CheckIcon, ExternalLink,
  GitBranch, Loader2, Palette, Settings as SettingsIcon, Share2, Webhook, CircleHelp,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startTour } from "@/components/tour/product-tour";

export type BuilderView = "build" | "workflow" | "design" | "integrate" | "settings" | "share" | "results";

const TABS: { view: BuilderView; label: string; icon: typeof Blocks }[] = [
  { view: "build", label: "Build", icon: Blocks },
  { view: "workflow", label: "Workflow", icon: GitBranch },
  { view: "design", label: "Design", icon: Palette },
  { view: "integrate", label: "Integrate", icon: Webhook },
  { view: "settings", label: "Settings", icon: SettingsIcon },
  { view: "share", label: "Share", icon: Share2 },
  { view: "results", label: "Results", icon: BarChart3 },
];

export function BuilderHeader({
  title,
  formId,
  slug,
  status,
  activeVersion,
  view,
  onViewChange,
  saveState,
  saveError,
  onPublish,
  publishPending,
  dirty,
}: {
  title: string;
  formId: string;
  slug: string | null;
  status: string | undefined;
  activeVersion: number | null;
  view: BuilderView;
  onViewChange: (v: BuilderView) => void;
  saveState: "saving" | "dirty" | "saved";
  saveError: string | null;
  onPublish: () => void;
  publishPending: boolean;
  dirty: boolean;
}) {
  const published = status === "published";
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!slug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/f/${slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <header className="bg-background flex items-center justify-between gap-4 border-b px-4 py-2.5">
      {/* left: back + identity */}
      <div className="flex min-w-0 items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="size-8 shrink-0">
          <Link href="/dashboard" aria-label="Back to dashboard">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <span className="font-display truncate font-semibold">{title}</span>
        <Badge variant={published ? "default" : "secondary"}>
          {published ? `✓ v${activeVersion ?? 1}` : "draft"}
        </Badge>
        {saveState === "saving" ? (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Loader2 className="size-3 animate-spin" /> saving…
          </span>
        ) : saveState === "dirty" ? (
          <span className="text-muted-foreground text-xs">unsaved</span>
        ) : (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Check className="size-3" /> saved
          </span>
        )}
        {saveError && <span className="text-destructive truncate text-xs">{saveError}</span>}
      </div>

      {/* center: view tabs */}
      <nav data-tour="builder-tabs" className="bg-card hidden items-center gap-1 rounded-xl border p-1 shadow-sm lg:flex">
        {TABS.map((t) => (
          <button
            key={t.view}
            onClick={() => onViewChange(t.view)}
            data-tour={t.view === "workflow" ? "builder-workflow-tab" : undefined}
            className={`flex w-16 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
              view === t.view
                ? "bg-background text-foreground border shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent"
            }`}
            aria-current={view === t.view ? "page" : undefined}
          >
            <t.icon className={`size-4 ${view === t.view ? "text-primary" : ""}`} />
            {t.label}
          </button>
        ))}
      </nav>

      {/* right: actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <select
          value={view}
          onChange={(e) => onViewChange(e.target.value as BuilderView)}
          className="rounded-md border px-2 py-1.5 text-xs lg:hidden"
          aria-label="Switch view"
        >
          {TABS.map((t) => (
            <option key={t.view} value={t.view}>{t.label}</option>
          ))}
        </select>
        {slug && (
          <Button asChild variant="ghost" size="icon" className="size-8" aria-label="Open live form">
            <a href={`/f/${slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
            </a>
          </Button>
        )}
        {slug && (
          <Button variant="ghost" size="icon" className="size-8" aria-label="Copy form link" onClick={() => void copyLink()}>
            {copied ? <CheckIcon className="size-4 text-green-600" /> : <Copy className="size-4" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full"
          aria-label="Replay product tour"
          onClick={() => startTour("builder")}
        >
          <CircleHelp className="size-4" />
        </Button>
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" data-form-id={formId} />
        {published && !dirty ? (
          <Badge variant="default" className="h-8 rounded-lg px-3">✓ Published</Badge>
        ) : (
          <Button size="sm" className="rounded-lg" disabled={publishPending || dirty} onClick={onPublish}>
            {publishPending ? "Publishing…" : published ? "Publish changes" : "Publish"}
          </Button>
        )}
      </div>
    </header>
  );
}
