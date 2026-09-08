"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  BarChart3,
  Copy,
  ExternalLink,
  Link2,
  MessageSquare,
  MoreHorizontal,
  FolderInput,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { readableInk } from "@/lib/chat-theme";

export interface FormRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  responses: number;
  updatedAt: number;
  questionCount?: number;
  preview?: string[];
  /**
   * The few theme values a thumbnail can show, or null when nobody has designed
   * this form — which is what keeps the brand band for those rather than
   * painting a whole grid in the same default cream.
   */
  theme?: {
    background: string;
    botBubble: string;
    userBubble: string;
    userBubbleText: string;
    accent: string;
    logoUrl: string | null;
  } | null;
}

/**
 * A form, as a card.
 *
 * The old card had a title, a badge and a large translucent first letter over
 * a gradient, because a title and a badge was all the list endpoint returned.
 * It looked the same for every form, which meant a grid of them was a grid of
 * one thing repeated — nothing to scan, nothing to recognise.
 *
 * Now the thumbnail is the form's own opening line in a chat bubble and the
 * subtitle is the questions it actually asks (DESIGN.md §2.1). Two forms are
 * told apart at a glance, which is the entire job of a card in a grid.
 */
export function FormCard({
  form,
  onDelete,
  workspaces = [],
  currentWorkspaceId,
  onMove,
}: {
  form: FormRow;
  onDelete: () => void;
  /**
   * Where this form could go. Empty — the common case, one workspace — hides
   * the move submenu entirely rather than showing a menu with nothing in it.
   */
  workspaces?: { id: string; name: string }[];
  currentWorkspaceId?: string;
  onMove?: (workspaceId: string) => void;
}) {
  const published = form.status === "published";
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/f/${form.slug}` : "";
  const preview = form.preview ?? [];
  // The greeting opens the card; the questions describe it. A form with no
  // greeting leads with its first question instead, which is what a
  // respondent would see anyway.
  const opener = preview[0] ?? form.title;
  const asks = preview.slice(1);

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
  };

  const status = (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          published ? "bg-[var(--success)]" : "bg-muted-foreground/40",
        )}
      />
      <span className={cn("text-xs", published ? "text-[var(--success)]" : "text-muted-foreground")}>
        {published ? "Live" : "Draft"}
      </span>
    </span>
  );

  const meta = (
    <>
      {status}
      {form.questionCount !== undefined && (
        <span className="text-muted-foreground tabular text-xs">
          {form.questionCount} question{form.questionCount === 1 ? "" : "s"}
        </span>
      )}
      <span className="text-muted-foreground tabular text-xs">
        {form.responses} response{form.responses === 1 ? "" : "s"}
      </span>
      <span className="text-muted-foreground text-xs">{relativeTime(form.updatedAt)}</span>
    </>
  );

  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${form.title}`}
          onClick={(e) => e.preventDefault()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={`/forms/${form.id}/results`}>Results</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/forms/${form.id}/share`}>Share</Link>
        </DropdownMenuItem>
        {published && (
          <>
            <DropdownMenuItem onSelect={copyLink}>
              <Copy className="size-3.5" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Open live form
              </a>
            </DropdownMenuItem>
          </>
        )}
        {/* A form is created in whichever workspace you were looking at, so
            this is how one ends up somewhere else. Without it a second
            workspace is a place new forms can be made and nothing can be moved
            into, which is a fork rather than a folder. */}
        {onMove && workspaces.filter((w) => w.id !== currentWorkspaceId).length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="size-3.5" />
                Move to
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {workspaces
                  .filter((w) => w.id !== currentWorkspaceId)
                  .map((w) => (
                    <DropdownMenuItem key={w.id} onSelect={() => onMove(w.id)}>
                      <span className="min-w-0 truncate">{w.name}</span>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /*
   * One card, not two.
   *
   * There used to be a `list` variant behind a grid/list toggle on the
   * dashboard toolbar. The toggle is gone — a row of controls should be the
   * ones that change *which* forms you see, not how tall they are — and a
   * second layout nobody could reach was a second layout to keep working.
   */
  return (
    <div
      className={cn(
        "bg-card border-border group relative flex h-full flex-col overflow-hidden rounded-2xl border",
        "shadow-xs transition-[box-shadow,transform] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        // Cards lift; buttons don't (DESIGN.md §4.4).
        "hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0",
        "focus-within:ring-ring/40 focus-within:ring-2",
      )}
    >
      <Link href={`/forms/${form.id}/build`} className="flex min-w-0 flex-1 flex-col">
        <ChatThumb opener={opener} answer={asks[0]} theme={form.theme} logoAlt={form.title} />

        {/*
          Title and status, and nothing else.
          The questions used to run underneath as a dot-joined subtitle — but
          the thumbnail above is already the form's own opening line, so the
          subtitle repeated what the picture said, in worse form and at two
          lines a card. A grid is for recognising, not reading.
        */}
        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-display truncate font-semibold">{form.title}</h3>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">{meta}</div>
        </div>
      </Link>

      {/* Quick actions sit above the card link. Revealed on hover, but always
          present for keyboard focus and on touch, where there is no hover. */}
      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-0.5 rounded-full",
          "bg-card/80 p-0.5 backdrop-blur-sm",
          "opacity-0 transition-opacity duration-[var(--duration-micro)]",
          "group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100",
        )}
      >
        {published && (
          <Button variant="ghost" size="icon-sm" aria-label="Copy public link" onClick={copyLink}>
            <Link2 className="size-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Results" asChild>
          <Link href={`/forms/${form.id}/results`}>
            <BarChart3 className="size-3.5" />
          </Link>
        </Button>
        {actions}
      </div>
    </div>
  );
}

/**
 * The form's own opening, drawn as two chat bubbles.
 *
 * Static and derived — no screenshot to capture, nothing to keep in sync. The
 * "answer" is the next question rather than a real reply, so the shape reads
 * as a conversation without inventing respondent data that does not exist.
 *
 * The band sweeps orange to violet, which is the one gesture that says
 * "chatform" without a logo in it. It was a peach-to-peach wash before —
 * `--primary-soft` into `--accent`, two hues close enough that a grid of these
 * read as one warm rectangle repeated.
 *
 * Band tokens rather than `--brand-gradient` itself, and that is not timidity:
 * DESIGN.md §4.1b reserves the full-strength gradient for the brand mark and
 * the upgrade ask, precisely so it keeps meaning something. A grid of twelve
 * cards each carrying it would spend that reserve in one screen. The hero
 * makes the same choice for the same reason — `--brand-orange-band-vivid` into
 * `--brand-violet-band-vivid`, a mix toward the page ground rather than the
 * hues at full strength — and 115deg is its angle, kept here so the two
 * surfaces read as the same sweep.
 *
 * At `--band-mix` the ground stays pale enough for a solid `--primary` bubble
 * to sit on it without the hard orange/violet seam §4.6 rules out, and the
 * mix follows `--background`, so dark mode is handled by the tokens.
 */
function ChatThumb({
  opener,
  answer,
  theme,
  logoAlt,
}: {
  opener: string;
  answer?: string;
  theme?: FormRow["theme"];
  logoAlt: string;
}) {
  /*
   * Unthemed forms keep the brand band.
   *
   * A form that has never been near the Design tab has no colours of its own to
   * show, and painting it in the defaults would say "this one is themed" about
   * a form that is not. The band is the honest answer for those, and it is also
   * what a brand-new account sees on every card, which is when the grid most
   * needs to look like something.
   */
  if (!theme) {
    return (
      <ThumbFrame
        style={{
          backgroundImage:
            "linear-gradient(115deg, var(--brand-orange-band) 0%, var(--brand-violet-band) 100%)",
        }}
      >
        <ThumbBubbles
          opener={opener}
          answer={answer}
          avatar={
            <span className="bg-card/80 text-primary grid size-5 place-items-center rounded-full">
              <MessageSquare className="size-2.5" strokeWidth={2} />
            </span>
          }
          botStyle={{}}
          botClassName="bg-card/90 text-foreground"
          answerStyle={{}}
          answerClassName="bg-primary/85 text-[var(--on-primary)]"
        />
      </ThumbFrame>
    );
  }

  /*
   * Ink is derived from the fill it sits on, never stored.
   *
   * `readableInk` is the same function `chatThemeVars` uses for the runtime and
   * the builder preview, so a bubble here resolves to the colour a respondent
   * would actually read — rather than a third answer that drifts the first time
   * somebody picks a pale accent.
   */
  return (
    <ThumbFrame style={{ backgroundColor: theme.background }}>
      <ThumbBubbles
        opener={opener}
        answer={answer}
        avatar={
          theme.logoUrl ? (
            // The form's own mark, where it has one — the single strongest
            // signal for telling two cards apart at this size.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme.logoUrl}
              alt={logoAlt}
              className="size-5 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: theme.accent, color: readableInk(theme.accent) }}
            >
              <MessageSquare className="size-2.5" strokeWidth={2} />
            </span>
          )
        }
        botStyle={{ backgroundColor: theme.botBubble, color: readableInk(theme.botBubble) }}
        botClassName="shadow-xs"
        answerStyle={{
          backgroundColor: theme.userBubble,
          color: readableInk(theme.userBubble),
        }}
        answerClassName=""
      />
    </ThumbFrame>
  );
}

function ThumbFrame({ style, children }: { style: CSSProperties; children: React.ReactNode }) {
  return (
    <div className="relative h-28 shrink-0 overflow-hidden p-3" style={style}>
      {children}
    </div>
  );
}

function ThumbBubbles({
  opener,
  answer,
  avatar,
  botStyle,
  botClassName,
  answerStyle,
  answerClassName,
}: {
  opener: string;
  answer?: string;
  avatar: React.ReactNode;
  botStyle: CSSProperties;
  botClassName: string;
  answerStyle: CSSProperties;
  answerClassName: string;
}) {
  return (
    <>
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 shrink-0">{avatar}</span>
        <p
          className={cn(
            "line-clamp-2 max-w-[85%] rounded-xl rounded-bl-sm px-2.5 py-1.5 text-[0.6875rem] leading-snug",
            botClassName,
          )}
          style={botStyle}
        >
          {opener}
        </p>
      </div>
      {answer && (
        <p
          className={cn(
            "mt-2 ml-auto line-clamp-1 w-fit max-w-[75%] rounded-xl rounded-br-sm px-2.5 py-1.5 text-[0.6875rem] leading-snug",
            answerClassName,
          )}
          style={answerStyle}
        >
          {answer}
        </p>
      )}
    </>
  );
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
