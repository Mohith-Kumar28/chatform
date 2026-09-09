"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CloudOff,
  ExternalLink,
  FileClock,
  Link2,
  Loader2,
  Play,
  Redo2,
  Undo2,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TooltipHint } from "@/components/ui/kbd";
import { formatDateTime, formatTime } from "@/lib/format";
import { BUILDER_TABS, tabMatches } from "./builder-tabs";
import { HistorySheet, showHistory } from "./history-sheet";
import { KEY } from "./use-builder-shortcuts";
import { useBuilderStore, useCanRedo, useCanUndo } from "@/stores/builder-store";
import { cn } from "@/lib/utils";

/**
 * The single builder header, mounted in the layout so it persists across tab
 * navigation. Tabs are real links now, so each has a URL, the back button
 * works, and only the active tab's code is loaded.
 */
export function BuilderHeader({
  formId,
  title,
  slug,
  status,
  activeVersion,
  publishedAt,
  onPublish,
  publishing,
  onPreview,
  onCopyLink,
}: {
  formId: string;
  title: string;
  slug: string | null;
  status: string | undefined;
  activeVersion: number | null;
  /** When the live version went live. Null until the form is published once. */
  publishedAt: number | null;
  onPublish: () => void | Promise<void>;
  publishing: boolean;
  /** Opens the full conversation preview. */
  onPreview: () => void;
  /** Copies the live link. Owned by the shell so ⇧⌘C runs the same code. */
  onCopyLink: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const published = status === "published";
  /**
   * Autosave gives this product two clocks, and the header used to show one.
   *
   * "Saved 05:09" answers whether the work is safe. It says nothing about whether
   * respondents are seeing it, and on a live form those answers differ constantly — every
   * edit after a publish is saved and not live. Someone who published five minutes ago and
   * kept working had no way to tell which of their changes were out there.
   *
   * So: the save clock is shown only while it has something to say (saving, unsaved,
   * failed, offline), and the rest of the time the line reports the publish clock instead.
   * Two indicators competing for the same six words is what made it unreadable.
   */
  const editedSincePublish = useBuilderStore((s) => s.editedSincePublish);
  const saveState = useBuilderStore((s) => s.saveState);
  const settled = saveState === "saved";
  const stale = published && editedSincePublish;

  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  return (
    <TooltipProvider delayDuration={300}>
      <header className="bg-card/95 sticky top-0 z-[var(--z-sticky)] backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
          {/* left: back + identity */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Button variant="ghost" size="icon-sm" asChild aria-label="Back to forms">
              <Link href="/dashboard">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            {/* Title over one quiet status line, rather than a title flanked
                by two competing chips. */}
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-sm font-semibold">{title}</h1>
              <p className="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem]">
                <span className={cn(published && !stale && "text-[var(--success)]")}>
                  {published ? `Live · v${activeVersion ?? 1}` : "Draft"}
                </span>
                <span aria-hidden>·</span>
                {settled ? <PublishIndicator stale={stale} published={published} publishedAt={publishedAt} /> : <SaveIndicator />}
              </p>
            </div>
          </div>

          {/* center: tabs */}
          <nav
            aria-label="Builder sections"
            className="bg-muted/60 hidden items-center gap-0.5 rounded-full p-1 lg:flex"
          >
            {BUILDER_TABS.map((tab) => {
              const href = `/forms/${formId}/${tab.segment}`;
              const active = tabMatches(tab, pathname);
              return (
                <Tooltip key={tab.segment}>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      // Six tabs over one form: prefetch them all, so the tab
                      // strip behaves like a tab strip and not like six pages.
                      prefetch
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative isolate flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                        "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="builder-tab-pill"
                          className="bg-card shadow-xs absolute inset-0 -z-10 rounded-full"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <tab.icon className="size-3.5" strokeWidth={1.75} />
                      <span className="hidden xl:inline">{tab.label}</span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <TooltipHint label={tab.label} hint={tab.hint} keys={KEY.tab(tab.segment)} />
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>

          {/* Below lg the tab strip collapses. A select is a poor nav control,
              but it beats a horizontally scrolling icon row on a phone. */}
          <Select
            value={BUILDER_TABS.find((t) => pathname.endsWith(`/${t.segment}`))?.segment ?? "build"}
            onValueChange={(v) => router.push(`/forms/${formId}/${v}`)}
          >
            <SelectTrigger size="sm" aria-label="Builder section" className="w-36 lg:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUILDER_TABS.map((t) => (
                <SelectItem key={t.segment} value={t.segment}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* right: the three things you actually reach for — preview, share,
              open — then publish. Each is a tinted target rather than a grey
              icon, so they read as actions and not decoration. */}
          <div className="flex flex-1 items-center justify-end gap-1.5">
            {/*
              Undo and redo only. The Keyboard button that used to sit beside them was a
              permanent slot spent on a list you read once and never again — it is in the
              ⌘K palette now, and still on ?, which is where a header button would have
              taught you to look anyway.
            */}
            <div className="mr-0.5 hidden items-center rounded-full md:flex">
              <IconAction label="Undo" shortcut={KEY.undo()} icon={Undo2} disabled={!canUndo} onClick={undo} />
              <IconAction label="Redo" shortcut={KEY.redo()} icon={Redo2} disabled={!canRedo} onClick={redo} />
            </div>

            {/*
              History, beside undo and redo because that is what it is: the same
              timeline, at a longer range. It opens a sheet over the builder
              rather than navigating to a page — you ask history a question
              about the form in front of you, so taking the form away to answer
              it was the wrong trade.

              Outside the `md` group above on purpose — undo and redo are hidden
              on a phone because you rarely reach for them there, but "what
              changed, and who published it" is exactly the question you get on
              a phone, and hiding it would leave no way to answer it.
            */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={showHistory}
                  aria-label="Version history"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted mr-0.5 grid size-8 place-items-center rounded-lg transition-colors"
                >
                  <FileClock className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">History</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onPreview}
                  aria-label="Preview the conversation"
                  className="grid size-8 place-items-center rounded-lg bg-[var(--success-soft)] text-[var(--success)] transition-transform duration-[var(--duration-micro)] active:scale-95 motion-reduce:active:scale-100"
                >
                  <Play className="size-3.5 fill-current" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <TooltipHint label="Preview" keys={KEY.preview()} />
              </TooltipContent>
            </Tooltip>

            {slug && published && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Copy public link"
                      onClick={onCopyLink}
                      className="grid size-8 place-items-center rounded-lg bg-[var(--info-soft)] text-[var(--info)] transition-transform duration-[var(--duration-micro)] active:scale-95 motion-reduce:active:scale-100"
                    >
                      <Link2 className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <TooltipHint label="Copy link" keys={KEY.copyLink()} />
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={`/f/${slug}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open the live form"
                      className="bg-muted text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg transition-colors"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open live</TooltipContent>
                </Tooltip>
              </>
            )}


            {/*
              Three states, because the button had one and it lied in two of them.

              A live form with nothing to ship says so and does nothing — republishing an
              identical document just mints a version nobody asked for, and a permanently
              enabled primary button is what makes "did that go out?" unanswerable at a
              glance. A live form with edits is the loud one, carrying a dot so it reads
              from across the screen. A draft has never been anywhere, so it is simply
              Publish.

              The button stays mounted and only changes appearance: swapping elements here
              costs the tooltip and the focus ring mid-interaction.
            */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  shape="pill"
                  variant={published && !stale ? "soft" : "default"}
                  // The shell reports the outcome — publishing has more than one
                  // call site now, and only this one was saying it had worked.
                  onClick={() => void onPublish()}
                  disabled={publishing || (published && !stale && settled)}
                >
                  {publishing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : published && !stale ? (
                    <Check className="size-3.5" />
                  ) : stale ? (
                    <span
                      className="size-1.5 rounded-full bg-current"
                      aria-hidden
                    />
                  ) : null}
                  {publishing
                    ? "Publishing"
                    : !published
                      ? "Publish"
                      : stale
                        ? "Publish changes"
                        : "Published"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {published && !stale ? (
                  /* The one state with no action attached still owes an explanation, and
                     the useful one is when it last went out — that is the question the
                     disabled button is answering. */
                  <span className="text-xs">
                    v{activeVersion ?? 1} is live
                    {publishedAt ? ` · published ${formatWhen(publishedAt)}` : ""}. No changes to
                    publish.
                  </span>
                ) : (
                  <TooltipHint label={stale ? "Publish changes" : "Publish"} keys={KEY.publish()} />
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* Mounted here because the header persists across tab navigation, so the
          panel outlives whichever tab you opened it from. */}
      <HistorySheet formId={formId} />
    </TooltipProvider>
  );
}

function IconAction({
  label,
  shortcut,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className="rounded-full"
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <TooltipHint label={label} keys={shortcut} />
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The publish clock, shown once the save clock has nothing left to say.
 *
 * "Unpublished changes" rather than the older "Edited since publishing": both
 * name the same condition, but one names it from the reader's side. What
 * someone needs to know is that there is something of theirs the world has not
 * got yet — a state with an obvious next action — not that an event happened in
 * the past tense.
 */
function PublishIndicator({
  stale,
  published,
  publishedAt,
}: {
  stale: boolean;
  published: boolean;
  publishedAt: number | null;
}) {
  if (!published) return <span className="shrink-0">Not published</span>;
  if (stale) {
    /*
      `--warning-soft-foreground`, not `--warning-foreground`: the latter is ink for the
      saturated fill and sits at L≈0.22 in BOTH themes, so on this card it would be
      dark-on-dark. See the status-colour note in globals.css.
    */
    return (
      <span className="flex shrink-0 items-center gap-1 text-[var(--warning-soft-foreground)]">
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
        Unpublished changes
      </span>
    );
  }
  return (
    <span className="shrink-0" title={publishedAt ? formatDateTime(publishedAt) : undefined}>
      {publishedAt ? `Published ${formatWhen(publishedAt)}` : "Published"}
    </span>
  );
}

/**
 * Relative for the first day, absolute after.
 *
 * "3 days ago" is a worse answer than a date once it is a few days old — the reader has to
 * do the arithmetic to get back to the thing they actually remember. Within a day the
 * relative form is the one that needs no arithmetic at all.
 */
function formatWhen(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Save status. Every state is nameable — the old header showed three bare
 * strings ("saving…", "unsaved", "saved") and nothing at all when a save failed.
 */
function SaveIndicator() {
  const saveState = useBuilderStore((s) => s.saveState);
  const saveError = useBuilderStore((s) => s.saveError);
  const lastSavedAt = useBuilderStore((s) => s.lastSavedAt);
  const [, force] = useState(0);

  if (saveState === "error") {
    return (
      <span className="text-destructive flex shrink-0 items-center gap-1" title={saveError ?? undefined}>
        <CircleAlert className="size-3" />
        Not saved
      </span>
    );
  }
  if (saveState === "offline") {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <CloudOff className="size-3" />
        Offline
      </span>
    );
  }
  if (saveState === "saving") {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <Loader2 className="size-3 animate-spin" />
        Saving
      </span>
    );
  }
  if (saveState === "dirty") {
    return <span className="shrink-0">Unsaved</span>;
  }
  /*
    Settled. The header renders `PublishIndicator` instead of this in the settled state —
    "Saved 05:09" next to "Live · v2" was two clocks in six words, and the one it left out
    was the one being asked about. Kept as a fallback so this component is still correct
    on its own, and it is what the timestamp is for.
  */
  return (
    <span className="shrink-0" onMouseEnter={() => force((n) => n + 1)}>
      {lastSavedAt
        ? `Saved ${formatTime(lastSavedAt)}`
        : "Saved"}
    </span>
  );
}
