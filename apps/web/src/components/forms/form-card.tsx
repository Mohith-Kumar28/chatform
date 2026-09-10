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
  PowerOff,
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { isDarkColor, readableInk } from "@/lib/chat-theme";

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
  onUnpublish,
  workspaces = [],
  currentWorkspaceId,
  onMove,
  selected = false,
  onSelectedChange,
  anySelected = false,
}: {
  form: FormRow;
  onDelete: () => void;
  /**
   * Takes a live form off the air. Absent on grids that cannot do it, which is
   * what keeps the item out of the menu rather than showing one that fails.
   */
  onUnpublish?: () => void;
  /** Ticked. Only meaningful when `onSelectedChange` is supplied. */
  selected?: boolean;
  /**
   * Omitted entirely on a grid that does not do bulk actions, which is what
   * keeps the checkbox from appearing where nothing could consume it.
   */
  onSelectedChange?: (next: boolean) => void;
  /**
   * Whether anything in the grid is ticked. Once something is, every card
   * shows its box — hunting for a hover target you cannot see is not a way to
   * build a selection.
   */
  anySelected?: boolean;
  /**
   * Where this form could go. Empty — the common case, one workspace — hides
   * the move submenu entirely rather than showing a menu with nothing in it.
   */
  workspaces?: { id: string; name: string }[];
  currentWorkspaceId?: string;
  onMove?: (workspaceId: string) => void;
}) {
  const published = form.status === "published";
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/f/${form.slug}`
      : "";
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
      <span
        className={cn(
          "text-xs",
          published ? "text-[var(--success)]" : "text-muted-foreground",
        )}
      >
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
      <span className="text-muted-foreground text-xs">
        {relativeTime(form.updatedAt)}
      </span>
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
            {/*
              Stopping a form from the list, without opening it.

              The builder has the same action, and this is not a duplicate of
              it: a form that has to come down is usually one you are looking at
              from the outside — a registration that filled up, a link that got
              shared further than intended — and making somebody open the
              builder to stop it adds a step to the one action nobody wants to
              be slow.

              Above the separator with the other live-form actions rather than
              beside Delete: it is reversible and Delete is not, and putting
              them together is how the wrong one gets clicked.
            */}
            {onUnpublish && (
              <DropdownMenuItem onSelect={onUnpublish}>
                <PowerOff className="size-3.5" />
                Take offline
              </DropdownMenuItem>
            )}
          </>
        )}
        {/* A form is created in whichever workspace you were looking at, so
            this is how one ends up somewhere else. Without it a second
            workspace is a place new forms can be made and nothing can be moved
            into, which is a fork rather than a folder. */}
        {onMove &&
          workspaces.filter((w) => w.id !== currentWorkspaceId).length > 0 && (
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
                      <DropdownMenuItem
                        key={w.id}
                        onSelect={() => onMove(w.id)}
                      >
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

  const selectable = Boolean(onSelectedChange);

  /**
   * Controls that sit on the thumbnail take their surface from the thumbnail.
   *
   * They used to use `bg-card`, which is the *app's* surface — so in dark mode
   * a near-black pill sat on a form whose own background is cream, and the
   * corner of every card grew a grey blob. The card's chrome and the form's
   * artwork are two different surfaces, and only one of them is under these
   * buttons.
   *
   * `null` means the form has no colours of its own and the thumbnail is the
   * brand band, which is mixed toward `--background` and so already follows the
   * app theme — there the app tokens are the right answer.
   */
  const thumbIsDark = form.theme ? isDarkColor(form.theme.background) : null;
  const onThumb =
    thumbIsDark === null
      ? "bg-card/80 text-foreground"
      : thumbIsDark
        ? "bg-black/45 text-white"
        : "bg-white/85 text-stone-900";

  /*
   * Nothing on this card moves, and nothing on it changes size.
   *
   * It used to lift 2px on hover (DESIGN.md §4.4). That put the lift on the
   * element that owned `:hover`, so the bottom 2px of every grid cell
   * oscillated — pointer enters, card lifts away from it, un-hovers, drops back
   * under it, hovers again. Splitting the card into a static hover target and a
   * moving inner one fixed the oscillation but kept the movement, and the
   * movement was the complaint: a card that jumps when the cursor crosses it
   * reads as the page reflowing, whatever is actually causing it.
   *
   * So hover is an `outline` and a shadow. An outline is painted outside the
   * border box and takes part in no layout at all — which a border cannot
   * claim, since growing one by a pixel reflows everything inside it. Selection
   * is the same outline in the accent colour, so ticking a card changes what
   * colour its edge is and nothing else.
   *
   * That also collapses this back to one element: the static wrapper existed
   * only to hold still while something inside it moved.
   */
  return (
    <div
      className={cn(
        "bg-card border-border group relative flex h-full flex-col overflow-hidden rounded-2xl border",
        "shadow-xs transition-[box-shadow,outline-color] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        // Always present, transparent until it has something to say, so the
        // only thing that ever animates is its colour. Inset, because an
        // outline outside a rounded border sits proud of the corner radius.
        "outline-2 -outline-offset-2 outline-transparent",
        "hover:shadow-md hover:outline-border",
        // Scoped to the link rather than `focus-within`, which the checkbox
        // satisfies too — ticking a box lit the whole card up as if focused.
        "has-[a:focus-visible]:outline-ring/60",
        selected && "outline-primary hover:outline-primary shadow-md",
      )}
    >
      {/*
        The tick box.

        Top-left, opposite the quick actions, and outside the `<Link>` so
        choosing a form is never one mis-aimed pixel from opening it. It fades
        in on hover like the actions do — but the moment anything in the grid is
        ticked, every box is visible, because a selection you extend by
        remembering where invisible targets are is not a selection you can use.

        The padding here is the touch target and nothing else. It used to carry
        a `bg-card/80` blur tile to lift the box off the thumbnail, which in
        dark mode read as a grey blob stuck to the corner. The box carries its
        own surface instead, so what you see is a checkbox rather than a
        checkbox inside a container.
      */}
      {selectable && (
        <div
          className={cn(
            "absolute top-2 left-2 z-10 p-1.5",
            "transition-opacity duration-[var(--duration-micro)]",
            selected || anySelected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100",
          )}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={(next) => onSelectedChange?.(next === true)}
            aria-label={`Select ${form.title}`}
            className={cn(
              /*
               * Bigger, outlined in the accent, and filled *against* the
               * artwork rather than with it.
               *
               * At 18px with a hairline border it disappeared into whatever was
               * behind it. Going up to 22px with an accent edge helped, but the
               * fill was still white — and a form's own background is pale on
               * most themes, so a white box on a near-white thumbnail was a
               * bright shape on a bright ground with only the border doing any
               * work.
               *
               * The fill now opposes the thumbnail: dark on light artwork,
               * light on dark. That is the one rule that cannot fail, because
               * it is derived from the surface rather than guessed. Checked, it
               * becomes the accent with `--primary-foreground` ink, which is
               * dark and clears AA on the orange — so the tick reads on the one
               * fill this does not choose.
               *
               * The `dark:` halves are not redundant: `Checkbox` ships
               * `dark:bg-input/30`, and a dark variant beats a plain utility of
               * the same specificity on source order, so a fill set here comes
               * out as that instead the moment the app is in dark mode.
               */
              "size-[22px] border-2 shadow-md",
              "border-primary data-[state=checked]:border-primary",
              thumbIsDark === null
                ? // The brand band follows `--background`, so oppose the app.
                  "bg-stone-800 dark:bg-stone-100"
                : thumbIsDark
                  ? "bg-stone-100 dark:bg-stone-100"
                  : "bg-stone-800 dark:bg-stone-800",
            )}
          />
        </div>
      )}

      <Link
        href={`/forms/${form.id}/build`}
        className="flex min-w-0 flex-1 flex-col"
      >
        <ChatThumb
          opener={opener}
          answer={asks[0]}
          theme={form.theme}
          logoAlt={form.title}
        />

        {/*
          Title and status, and nothing else.
          The questions used to run underneath as a dot-joined subtitle — but
          the thumbnail above is already the form's own opening line, so the
          subtitle repeated what the picture said, in worse form and at two
          lines a card. A grid is for recognising, not reading.
        */}
        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-display truncate font-semibold">{form.title}</h3>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">
            {meta}
          </div>
        </div>
      </Link>

      {/* Quick actions sit above the card link. Revealed on hover, but always
          present for keyboard focus and on touch, where there is no hover. */}
      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-0.5 rounded-full",
          "p-0.5 backdrop-blur-sm",
          onThumb,
          "opacity-0 transition-opacity duration-[var(--duration-micro)]",
          "group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100",
        )}
      >
        {published && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy public link"
            onClick={copyLink}
          >
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
              style={{
                backgroundColor: theme.accent,
                color: readableInk(theme.accent),
              }}
            >
              <MessageSquare className="size-2.5" strokeWidth={2} />
            </span>
          )
        }
        botStyle={{
          backgroundColor: theme.botBubble,
          color: readableInk(theme.botBubble),
        }}
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

function ThumbFrame({
  style,
  children,
}: {
  style: CSSProperties;
  children: React.ReactNode;
}) {
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
  /*
   * The clamp is on an inner span, and it has to be.
   *
   * `line-clamp` was on the bubble itself, which also carries `py-1.5`. Those
   * two clip to different boxes: the clamp ends the text after N lines at the
   * *content* edge, while `overflow: hidden` cuts at the *padding* edge — so
   * the line after the last one rendered into the bubble's bottom padding and
   * was sliced through the middle of its letters. Every long question showed an
   * ellipsis and then half a line of the words the ellipsis was standing in
   * for.
   *
   * Padding stays on the bubble, clamping moves inside it, and the two now
   * agree on where the text stops.
   */
  return (
    <>
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 shrink-0">{avatar}</span>
        <p
          className={cn(
            "max-w-[85%] rounded-xl rounded-bl-sm px-2.5 py-1.5 text-[0.6875rem] leading-snug",
            botClassName,
          )}
          style={botStyle}
        >
          <span className="line-clamp-2">{opener}</span>
        </p>
      </div>
      {answer && (
        <p
          className={cn(
            "mt-2 ml-auto w-fit max-w-[75%] rounded-xl rounded-br-sm px-2.5 py-1.5 text-[0.6875rem] leading-snug",
            answerClassName,
          )}
          style={answerStyle}
        >
          {/* One line, and `truncate` rather than a clamp: with nothing to wrap
              to there is no second line to leak, and it ellipses on the same
              line it cuts. */}
          <span className="block truncate">{answer}</span>
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
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
