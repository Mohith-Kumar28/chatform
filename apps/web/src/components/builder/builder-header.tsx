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
  MoreVertical,
  Pencil,
  Play,
  PowerOff,
  Redo2,
  Undo2,
} from "lucide-react";
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
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  unpublished,
  onPublish,
  onUnpublish,
  publishing,
  onPreview,
  onCopyLink,
  onRename,
  onRetrySave,
}: {
  formId: string;
  title: string;
  slug: string | null;
  status: string | undefined;
  activeVersion: number | null;
  /** When the live version went live. Null until the form is published once. */
  publishedAt: number | null;
  /**
   * Does the draft hold anything the live version does not?
   *
   * Passed in rather than read from the store, because the store only knows
   * about edits made in the builder — see the note at the call site. The header
   * had its own subscription and therefore its own, quieter answer.
   */
  unpublished: boolean;
  onPublish: () => void | Promise<void>;
  /**
   * Takes the live form off the air. The shell owns it so it can report the
   * outcome and refresh the row that decides whether this menu exists at all.
   */
  onUnpublish?: () => void | Promise<void>;
  publishing: boolean;
  /** Opens the full conversation preview. */
  onPreview: () => void;
  /** Copies the live link. Owned by the shell so ⇧⌘C runs the same code. */
  onCopyLink: () => void;
  /**
   * Renames the form. Absent until the document has loaded — the name lives in
   * the document, so there is nothing to write into before then.
   */
  onRename?: (title: string) => void;
  /** Try a failed save again now. Shown beside the failure state. */
  onRetrySave?: () => void;
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
  const saveState = useBuilderStore((s) => s.saveState);
  const settled = saveState === "saved";
  const stale = published && unpublished;

  /*
    Confirmed rather than immediate. Unpublishing is reversible — the version
    survives and Publish puts the same one back — but it is not *undoable* for
    the person who opens the link in the thirty seconds it is down, and on a
    form with a live audience that is the whole cost of the action.
  */
  const [confirmOffline, setConfirmOffline] = useState(false);

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
              <EditableTitle title={title} onRename={onRename} />
              <p className="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem]">
                <span className={cn(published && !stale && "text-[var(--success)]")}>
                  {published ? `Live · v${activeVersion ?? 1}` : "Draft"}
                </span>
                <span aria-hidden>·</span>
                {settled ? <PublishIndicator stale={stale} published={published} publishedAt={publishedAt} /> : <SaveIndicator onRetry={onRetrySave} />}
              </p>
            </div>
          </div>

          {/*
            center: tabs.

            `SegmentedControl`, not a hand-rolled strip. This was the same
            markup with a `bg-card` pill — a lighter grey on a grey track,
            which on the dark theme leaves the tab you are on barely different
            from the five you are not. The violet pill is the product's one
            selection colour and it now reaches here too, because there is one
            component drawing it rather than three copies.
          */}
          <SegmentedControl
            ariaLabel="Builder sections"
            size="sm"
            className="hidden lg:inline-flex"
            value={BUILDER_TABS.find((t) => tabMatches(t, pathname))?.segment ?? "build"}
            options={BUILDER_TABS.map((tab) => ({
              value: tab.segment,
              label: tab.label,
              icon: tab.icon,
              href: `/forms/${formId}/${tab.segment}`,
              // Six tabs is more than a header can spell out until it is wide.
              labelClassName: "hidden xl:inline",
              tooltip: <TooltipHint label={tab.label} hint={tab.hint} keys={KEY.tab(tab.segment)} />,
            }))}
          />

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

            {/*
              The overflow, last in the row and vertical.

              It used to be a horizontal ⋯ sitting *before* Publish, and only
              when the form was live — so the menu moved depending on the
              form's state, and the one control whose whole job is "everything
              else" was not where everything else lives. A kebab at the end of
              a toolbar is the convention because it is the only position that
              cannot be confused with an action: nothing comes after it.

              History moved in here from its own header slot. It is not a thing
              you reach for while working — it answers "what changed, and who
              published it", asked perhaps once a week — and a permanent slot
              beside Publish is expensive for a once-a-week question.

              Take offline stays destructive and stays behind this menu, not
              beside Publish: one is the thing you do all day and the other is
              the thing you do once, and a destructive sibling next to the
              button you press constantly is how it gets pressed by mistake.
            */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More form actions">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={showHistory}>
                  <FileClock className="size-3.5" />
                  Version history
                </DropdownMenuItem>
                {slug && published && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOffline(true)}>
                      <PowerOff className="size-3.5" />
                      Take offline
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mounted here because the header persists across tab navigation, so the
          panel outlives whichever tab you opened it from. */}
      <HistorySheet formId={formId} />

      <ConfirmDialog
        open={confirmOffline}
        onOpenChange={setConfirmOffline}
        title="Take this form offline?"
        description={
          <>
            The link stops working immediately and nobody new can start a response. Nothing is
            deleted — your responses stay, and v{activeVersion ?? 1} goes straight back up when
            you publish again.
            <br />
            <br />
            Anyone part-way through right now can still finish and submit.
          </>
        }
        confirmLabel="Take offline"
        onConfirm={() => onUnpublish?.()}
      />
    </TooltipProvider>
  );
}

/**
 * The form's name, renamed where it is read.
 *
 * A form was named once, at creation, and after that the only way to change it
 * was to build a new one — the name in the header was the one piece of the
 * document with no editor anywhere in the product. It is a document field like
 * any other, so it is edited like one: the rename goes through `edit()`, which
 * means it autosaves, it undoes, it shows up in history as "Form name", and it
 * marks the form as having unpublished changes — because it does. Respondents
 * see this string at the top of the chat.
 *
 * The pencil appears on hover rather than sitting there permanently: a header
 * that is mostly identity should not carry a control that looks like an action.
 */
function EditableTitle({ title, onRename }: { title: string; onRename?: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  /*
    While closed, the field tracks the document. The name can change under it —
    an undo, an AI edit, the Settings field — and reopening on a stale string
    would let a click quietly restore the old name. Derived during the render
    that sees the new name rather than in an effect afterwards, so the field is
    never briefly holding the previous one.
  */
  if (!editing && draft !== title) setDraft(title);

  function commit() {
    setEditing(false);
    // `min(1)` in the schema: an empty name is not a name, so an empty field
    // cancels rather than saving a document the server will refuse.
    const next = draft.trim().slice(0, 200);
    if (!next || next === title) {
      setDraft(title);
      return;
    }
    onRename?.(next);
  }

  // Before the document loads there is nothing to rename, so the title is text.
  if (!onRename) return <h1 className="truncate text-sm font-semibold">{title}</h1>;

  if (editing) {
    return (
      <h1 className="min-w-0">
        <input
          value={draft}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          maxLength={200}
          aria-label="Form name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(title);
              setEditing(false);
            }
          }}
          className="border-primary w-full min-w-0 border-0 border-b bg-transparent p-0 text-sm font-semibold outline-none"
        />
      </h1>
    );
  }

  return (
    <h1 className="min-w-0">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Rename"
        className="group hover:decoration-border/80 flex min-w-0 max-w-full items-center gap-1.5 rounded text-sm font-semibold underline-offset-4 hover:underline hover:decoration-dashed"
      >
        <span className="min-w-0 truncate">{title}</span>
        <Pencil
          className="text-muted-foreground size-3 shrink-0 opacity-0 transition-opacity duration-[var(--duration-micro)] group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
        <span className="sr-only">Rename form</span>
      </button>
    </h1>
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
function SaveIndicator({ onRetry }: { onRetry?: () => void }) {
  const saveState = useBuilderStore((s) => s.saveState);
  const saveError = useBuilderStore((s) => s.saveError);
  const docIssues = useBuilderStore((s) => s.docIssues);
  const lastSavedAt = useBuilderStore((s) => s.lastSavedAt);
  const [, force] = useState(0);

  /*
    A field the document cannot hold, which is not the same thing as a failure.

    It used to be one: a half-typed email address produced a red toast reading
    `settings.onComplete.notificationEmails.0: Invalid email address`, which said
    the save had gone wrong when what had actually happened was that a value was
    not finished. Nothing is retried here, because nothing will change until
    somebody edits the field — so this says which one.
  */
  if (saveState === "invalid") {
    const first = docIssues[0];
    return (
      <span
        className="flex shrink-0 items-center gap-1 text-[var(--warning)]"
        title={docIssues.map((i) => i.message).join("\n")}
      >
        <CircleAlert className="size-3" />
        {first ? first.message : "One field needs fixing"}
      </span>
    );
  }
  if (saveState === "error") {
    /*
      Kept in place until it is no longer true, rather than shown as a toast that
      leaves while the condition remains. A retry is already scheduled with a
      widening gap; this is for the author who would rather not wait for it.
    */
    return (
      <span className="text-destructive flex shrink-0 items-center gap-1" title={saveError ?? undefined}>
        <CircleAlert className="size-3" />
        Not saved
        {onRetry && (
          <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:no-underline">
            Retry
          </button>
        )}
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
        Saving…
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
