"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  BarChart3,
  Check as CheckIcon,
  Copy,
  ExternalLink,
  Link2,
  MessageSquare,
  MoreHorizontal,
  FolderInput,
  PowerOff,
  Trash2,
  UploadCloud,
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { isDarkColor, readableInk } from "@/lib/chat-theme";

/**
 * The pieces of a menu, so one list of items can be rendered by two of them.
 *
 * Deliberately structural rather than a union of the two component sets: what
 * the item list needs is "something with an `Item` that takes `asChild`,
 * `onSelect` and a destructive variant", and both Radix menus are that. Typing
 * it as the intersection of the concrete components instead would make every
 * prop the two disagree about — `align` on the content, which only the
 * dropdown has — a compile error at the call site rather than a thing neither
 * menu is asked for.
 */
type MenuParts = {
  Item: React.ComponentType<{
    children?: React.ReactNode;
    asChild?: boolean;
    onSelect?: (event: Event) => void;
    variant?: "default" | "destructive";
    className?: string;
  }>;
  Separator: React.ComponentType<{ className?: string }>;
  Sub: React.ComponentType<{ children?: React.ReactNode }>;
  SubTrigger: React.ComponentType<{
    children?: React.ReactNode;
    className?: string;
  }>;
  SubContent: React.ComponentType<{
    children?: React.ReactNode;
    className?: string;
  }>;
};

const DROPDOWN_PARTS: MenuParts = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};

const CONTEXT_PARTS: MenuParts = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

export interface FormRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  responses: number;
  /**
   * Responses somebody started and never finished. Absent on grids whose
   * source does not count them, which is what keeps the card from claiming
   * "+0 partial" about a number it was never told.
   */
  partials?: number;
  updatedAt: number;
  /** True when the draft has moved on from what respondents are answering. */
  hasUnpublishedChanges?: boolean;
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
  onPublish,
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
  /**
   * Pushes the draft live. Only ever offered on a form that has drifted — a
   * card cannot show you what you would be publishing, so offering it on a
   * form that is already up to date is an action whose only outcome is a
   * version number.
   */
  onPublish?: () => void;
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

  /*
   * What the footer keeps.
   *
   * Status and question count moved up onto the thumbnail (see `thumbPills`),
   * because they are what you scan a grid *for* — is this one live, how long is
   * it — and the footer had them fourth and second in a run of four grey spans
   * that all looked alike. What is left is the pair that only matters once you
   * have already found the form: how much has come in, and when it last moved.
   */
  /*
   * Partials ride along with the completed count rather than getting a line.
   *
   * "1 response" was the whole footer on a form thirty-seven people had opened
   * and left, which is not a small omission — it is the difference between a
   * form nobody found and a form that is losing everybody at question four.
   * Written as "+37 partial", joined to the number it qualifies, because it is
   * a footnote on that number and not a second statistic: a card that reads
   * "1 response · 37 partial" invites the two to be added up, and they are not
   * the same kind of thing.
   *
   * Zero says nothing. A form with no partials has no drop-off to report, and
   * a "+0" on every healthy card would spend the reader's attention on the
   * cards that least need it.
   */
  const partials = form.partials ?? 0;
  const meta = (
    <>
      <span className="text-muted-foreground tabular text-xs">
        {form.responses} response{form.responses === 1 ? "" : "s"}
        {partials > 0 && (
          <span className="text-muted-foreground/70"> +{partials} partial</span>
        )}
      </span>
      <span className="text-muted-foreground text-xs">
        {relativeTime(form.updatedAt)}
      </span>
    </>
  );

  /*
   * One menu, two triggers.
   *
   * The kebab and the right-click menu are the same menu — a card that offers
   * Take offline on hover and not on right-click is a card whose menu you have
   * to guess at, and two copies of this list is how that happens on the next
   * item somebody adds. So the items are written once against whichever set of
   * menu parts is rendering them: Radix's dropdown and context menus have the
   * same item API, which is what makes the substitution safe rather than a
   * lookalike.
   */
  const menuItems = (M: MenuParts) => (
    <>
      <M.Item asChild>
        <Link href={`/forms/${form.id}/results`}>Results</Link>
      </M.Item>
      <M.Item asChild>
        <Link href={`/forms/${form.id}/share`}>Share</Link>
      </M.Item>
      {/*
        Publishing from the grid, when the grid is where you found out.

        The card now says a form has edits nobody can see, and saying that
        without offering the one action that fixes it sends somebody into the
        builder to press a button they already decided to press. It sits above
        the live-form actions because it is what you came here for.

        Only on a form that has actually drifted: `onPublish` is offered by the
        grid, `hasUnpublishedChanges` says whether there is anything to send.
      */}
      {published && onPublish && form.hasUnpublishedChanges && (
        <M.Item onSelect={onPublish}>
          <UploadCloud className="size-3.5" />
          Publish changes
        </M.Item>
      )}
      {published && (
        <>
          <M.Item onSelect={copyLink}>
            <Copy className="size-3.5" />
            Copy link
          </M.Item>
          <M.Item asChild>
            <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              Open live form
            </a>
          </M.Item>
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
            <M.Item onSelect={onUnpublish}>
              <PowerOff className="size-3.5" />
              Take offline
            </M.Item>
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
            <M.Separator />
            <M.Sub>
              <M.SubTrigger>
                <FolderInput className="size-3.5" />
                Move to
              </M.SubTrigger>
              <M.SubContent>
                {workspaces
                  .filter((w) => w.id !== currentWorkspaceId)
                  .map((w) => (
                    <M.Item key={w.id} onSelect={() => onMove(w.id)}>
                      <span className="min-w-0 truncate">{w.name}</span>
                    </M.Item>
                  ))}
              </M.SubContent>
            </M.Sub>
          </>
        )}
      <M.Separator />
      <M.Item variant="destructive" onSelect={onDelete}>
        <Trash2 className="size-3.5" />
        Delete
      </M.Item>
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
        {menuItems(DROPDOWN_PARTS)}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const selectable = Boolean(onSelectedChange);

  /**
   * Controls that sit on the thumbnail *oppose* the thumbnail.
   *
   * Two wrong answers came before this one. `bg-card` was the app's surface, so
   * in dark mode a near-black pill sat on a form whose own background is cream
   * and every card grew a grey blob in the corner. Deriving the pill from the
   * artwork fixed the theme mismatch and introduced a worse one: a white pill
   * on a pale lavender form is a white shape on a white shape, and the icons
   * inside it went with it. Matching the surface is camouflage.
   *
   * So the plate is the artwork's opposite — dark on a light form, light on a
   * dark one — which is the rule the tick box below already follows, and the
   * only one that cannot fail, because it is derived from the surface rather
   * than guessed at. Ink follows the plate, not the app.
   *
   * As custom properties rather than classes because three consumers need
   * them: this pill, the status strip along the bottom of the thumbnail, and
   * the hover wash on the buttons inside the pill — whose `ghost` variant
   * otherwise flips to `--accent-foreground` on hover and lands app-theme ink
   * on a plate that has nothing to do with the app theme.
   *
   * `null` — no theme of its own, so the thumbnail is the brand band, which is
   * mixed toward `--background` and follows the app. There the app's own
   * foreground/background pair *is* the opposition, and it stays theme-aware
   * without a `dark:` twin for every value.
   */
  /*
   * `--thumb-live` and `--thumb-drift` are on the plate, not the app.
   *
   * The live dot used to be `--success` straight from the theme, and it worked
   * because a 6px dot only has to be *seen*. Saying "Live" in green is a
   * different job: the word has to be read off a plate whose lightness the app
   * theme did not choose — a light form in a dark app gets a dark plate — so
   * one green cannot serve both. `--success` in dark mode is L 0.7, which is
   * legible on the dark plate and mud on the light one.
   *
   * So each plate names its own pair, chosen against that plate rather than
   * against the page. The band case is the one that cannot hardcode them: its
   * plate follows `--foreground`, so the colour has to flip with the app. It
   * mixes toward `--background` — which is what that plate's *ink* already is,
   * so the mix always runs away from the plate and toward the readable end,
   * in either theme, with no `dark:` twin.
   */
  const thumbIsDark = form.theme ? isDarkColor(form.theme.background) : null;
  const thumbPlate: Record<string, string> =
    thumbIsDark === null
      ? {
          "--thumb-plate":
            "color-mix(in oklab, var(--foreground) 88%, transparent)",
          "--thumb-plate-ink": "var(--background)",
          "--thumb-plate-wash":
            "color-mix(in oklab, var(--background) 20%, transparent)",
          "--thumb-live":
            "color-mix(in oklab, oklch(0.72 0.17 152) 72%, var(--background))",
          "--thumb-drift":
            "color-mix(in oklab, oklch(0.75 0.16 75) 72%, var(--background))",
        }
      : thumbIsDark
        ? {
            "--thumb-plate": "rgb(255 255 255 / 0.92)",
            "--thumb-plate-ink": "oklch(0.216 0.006 56.043)",
            "--thumb-plate-wash": "rgb(0 0 0 / 0.10)",
            "--thumb-live": "oklch(0.5 0.14 152)",
            "--thumb-drift": "oklch(0.52 0.13 62)",
          }
        : {
            "--thumb-plate": "oklch(0.216 0.006 56.043 / 0.85)",
            "--thumb-plate-ink": "oklch(0.985 0.001 106.423)",
            "--thumb-plate-wash": "rgb(255 255 255 / 0.20)",
            "--thumb-live": "oklch(0.82 0.17 152)",
            "--thumb-drift": "oklch(0.84 0.14 82)",
          };
  const onThumb = "bg-[var(--thumb-plate)] text-[var(--thumb-plate-ink)]";

  /*
   * Status and length, on the artwork.
   *
   * Same plate as the quick actions above, and for the same reason: these are
   * always visible, so a fill that happens to match the form behind it is a
   * pill you cannot read on exactly the forms whose colours are subtle.
   *
   * They sit on their own row along the bottom of the thumbnail rather than
   * floating over it. The two top corners are already spoken for — the tick box
   * on the left, the quick actions on the right — and the bubbles fill the
   * middle, so anything overlaid would have collided with one of the three on
   * some card. A dedicated strip collides with nothing and reads as part of the
   * thumbnail, which is what the band already is.
   *
   * Split to the two ends: the state on the left, where the eye lands first and
   * where the dot gives it a shape you can scan without reading, and the size
   * on the right, so a column of cards lines its counts up.
   */
  /*
   * Bigger, because 10px was a label you had to lean in for.
   *
   * These were `text-[0.625rem]` with a 6px dot — sized to be unobtrusive on
   * the artwork, which got the priority backwards. Whether a form is live is
   * the single most consequential fact on the card: it is the difference
   * between a link that is collecting answers and one that 404s, and it was
   * set two steps below the response count underneath it. At 12px with a 8px
   * dot the strip reads at a glance, which is the only size worth having for
   * something you scan a grid for.
   *
   * And Live is now green *as a word*, not just as a dot beside one. A colour
   * you have to already know the code for is not a signal; a green "Live" is
   * legible before you have read it, which is what "clear at a glance" means.
   * Draft stays in the plate's own ink — it is the quiet half of the pair, and
   * two coloured states is two states competing for the same attention.
   */
  const thumbPill = cn(
    "inline-flex items-center gap-1.5 rounded-full px-2 py-1",
    "text-xs leading-none font-semibold backdrop-blur-sm",
    onThumb,
  );
  const thumbPills = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            thumbPill,
            // The one pill on this strip that never gives up width. If
            // something has to truncate it is "Unpublished changes", which
            // has a tooltip and a menu item behind it; "Live" has neither and
            // is the more consequential of the two.
            "shrink-0",
            published && "text-[var(--thumb-live)]",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              // Draft borrows the pill's own ink at low opacity, so it stays
              // legible on both fills without a second token that only works
              // on one of them.
              published ? "bg-[var(--thumb-live)]" : "bg-current opacity-40",
            )}
          />
          {published ? "Live" : "Draft"}
        </span>
        {/*
          The draft has moved on and the live form has not.

          Beside Live rather than replacing it, because both are true and the
          card would be lying if it picked one: the form *is* live, and what is
          live is not what you last edited. Amber for the same reason the
          builder header uses it — a state to resolve, not a fault.

          "Unpublished changes" in full, matching the menu item. The word alone
          read as a second status — a form that was somehow *not published*,
          sitting next to a Live pill that says it is — when what it means is
          that the draft has changes the live form does not have. It is the
          noun that carries the meaning, so it is the half that cannot be cut;
          it truncates before the question count does instead.
        */}
        {published && form.hasUnpublishedChanges && (
          <span
            className={cn(thumbPill, "min-w-0 text-[var(--thumb-drift)]")}
            title="This form has edits that are not live yet"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-[var(--thumb-drift)]"
            />
            <span className="truncate">Unpublished changes</span>
          </span>
        )}
      </span>
      {form.questionCount !== undefined && (
        <span className={cn(thumbPill, "tabular shrink-0")}>
          {form.questionCount} question{form.questionCount === 1 ? "" : "s"}
        </span>
      )}
    </>
  );

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
    /*
      Right-click is the same menu as the kebab.

      The kebab was the only way to reach Move to, Take offline and Delete, and
      it is three hover-revealed pixels in a corner. Everywhere else that shows
      a grid of things — a file manager, a photo library — answers a right-click
      on the thing itself, and a card that does not is a card people right-click
      once and then stop trying.

      `asChild` puts the trigger on the card element rather than wrapping it in
      a div, so the grid item stays one box and `h-full` still stretches it.
    */
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          style={{ ...thumbPlate }}
          className={cn(
            "bg-card border-border group relative flex h-full flex-col overflow-hidden rounded-2xl border",
            "shadow-xs transition-[box-shadow,outline-color] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
            /*
              A live form's edge is tinted green.

              The card already says Live twice — the pill on the artwork and
              the word in the status strip — but both of those live inside the
              thumbnail's top band, which is the busiest 128px on the card and
              the part your eye skips once you know the form. The border is the
              one property that traces the whole card, so it says which forms
              are collecting *before* you read anything on them, which is the
              question a grid of forms is usually being scanned for.

              A mix rather than `--success` itself: this is a resting edge on
              every published card at once, and a grid of saturated green
              outlines reads as a row of alerts. Mixed most of the way back to
              `--border` it is the same quiet line the draft cards have, in a
              green you only name once you look at it — and because it is mixed
              *toward the theme's own border colour*, it lands at the right
              lightness in both themes without a `dark:` twin.

              It is a border and not the outline because the outline is spoken
              for: transparent at rest, `--border` on hover, `--primary` when
              ticked. Those are the three things that happen *to* a card, and
              they layer over this one, which is what the card *is*.
            */
            published &&
              "border-[color-mix(in_oklab,var(--success)_38%,var(--border))]",
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
          <Link
            href={`/forms/${form.id}/build`}
            className="flex min-w-0 flex-1 flex-col"
          >
            <ChatThumb
              opener={opener}
              answer={asks[0]}
              theme={form.theme}
              logoAlt={form.title}
              pills={thumbPills}
            />

            {/*
          Title and status, and nothing else.
          The questions used to run underneath as a dot-joined subtitle — but
          the thumbnail above is already the form's own opening line, so the
          subtitle repeated what the picture said, in worse form and at two
          lines a card. A grid is for recognising, not reading.
        */}
            <div className="flex flex-1 flex-col p-4">
              <h3 className="font-display truncate font-semibold">
                {form.title}
              </h3>
              {/* `pe-8` when there is a tick box: it sits in this row's right-hand
              end, and a long relative time would otherwise run underneath it. */}
              <div
                className={cn(
                  "mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3",
                  selectable && "pe-8",
                )}
              >
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
              // `ghost` resting has no colour of its own, so the icons inherit the
              // plate's ink — but its hover *does*, and `--accent-foreground` on a
              // plate the app theme did not choose is how an icon disappears at the
              // moment you reach for it. Both halves come from the plate instead.
              "[&_[data-slot=button]]:hover:bg-[var(--thumb-plate-wash)]",
              "[&_[data-slot=button]]:hover:text-[var(--thumb-plate-ink)]",
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

          {/*
        The tick box, bottom-right, on the card rather than on the artwork.

        It was top-left over the thumbnail, which put it on the one part of the
        card that is a picture — three controls (tick box, quick actions,
        status strip) competing with the form's own opening line for a 128px
        band, and the box had to invent a fill that opposed whatever colour the
        form happened to be just to stay visible. Down here it sits on
        `bg-card`, which is one known surface in each theme, so the default
        checkbox styling is simply correct.

        It is also where the eye ends up: the footer is the last thing read on
        a card, the right end of it is empty, and a column of cards lines its
        boxes up on the same edge — which is what makes a run of them
        tickable without aiming.

        Still outside the `<Link>`, so choosing a form is never one mis-aimed
        pixel from opening it, and still hover-revealed until something in the
        grid is ticked — after which every box shows, because a selection you
        extend by remembering where invisible targets are is not a selection
        you can use.
      */}
          {selectable && (
            <div
              className={cn(
                // Tucked into the corner: `0.5` plus the 6px touch padding
                // inside puts the box's own edge 8px off each edge — half the
                // footer's 16px text column, so it reads as a control sitting
                // on the card rather than as another item in the meta row it
                // shares a line with. The padding is the part that stays: it
                // is what keeps the tap target over 32px without growing the
                // box, and it is why the box can sit this close to the corner
                // without the pointer having to find 22 exact pixels.
                "absolute right-0.5 bottom-0.5 z-10 p-1.5",
                "transition-opacity duration-[var(--duration-micro)]",
                selected || anySelected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100",
              )}
            >
              {/*
                `flex`, not the default block, and it fixes two things at once.

                The box is an inline-block button, so in a block parent it sits
                on a baseline with descender space under it: the ghost tick
                below centres itself against that taller box and lands low in
                the square rather than in it.

                Worse, Radix only mounts the indicator once the box is checked
                — so ticking it takes the button from empty to having in-flow
                content, which moves its baseline from its bottom edge up to
                the glyph's, and the whole box jumps at the moment you click
                it. As a flex item it is block-level and aligned to neither, so
                there is no baseline left to change.
              */}
              <div className="relative flex">
                <Checkbox
                  checked={selected}
                  onCheckedChange={(next) => onSelectedChange?.(next === true)}
                  aria-label={`Select ${form.title}`}
                  className={cn(
                    /*
                     * The resting box is painted in the theme's *opposite* ink.
                     *
                     * The stock resting style is `input/30` — a fill a shade off
                     * whatever it sits on. On a dark card that is a black square
                     * inside an orange outline, which is how it read: a rectangle
                     * on the card rather than a control on it. `--foreground` is
                     * the one colour guaranteed to oppose `--card` in either
                     * theme, so the box is near-white on dark and near-black on
                     * light and never has to guess. The `dark:` twin is not
                     * redundant: the base component sets `dark:bg-input/30`, and
                     * an unprefixed class does not override a prefixed one.
                     *
                     * Kept: 22px with a 2px edge, so it is a real target, and the
                     * accent fill when checked — `--primary-foreground` ink
                     * clears AA on the orange, and the flip from neutral to brand
                     * is the state change you see from across the grid.
                     */
                    "size-[22px] border-2 shadow-sm",
                    // The base component's tick is sized for a 16px box: at
                    // 22px the same 14px glyph at stroke-2 is a thin scratch
                    // in the middle of a large square. Scaled to 16px at
                    // stroke-3 it is a tick at this size. `inline-flex`
                    // centres it against the border box, since the stock
                    // indicator only lands centred when the glyph happens to
                    // fill the content box exactly.
                    "inline-flex items-center justify-center",
                    "[&_svg]:size-4 [&_svg]:stroke-[3]",
                    "border-foreground bg-foreground text-background dark:bg-foreground",
                    "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
                  )}
                />
                {/*
                  A ghost tick in the empty box.

                  An empty rounded square is only legibly a checkbox once you
                  have seen a ticked one beside it, and the first card you ever
                  hover has nothing beside it. Drawing the mark it *would* take,
                  faint, says what the control does before you use it. Same
                  glyph and size as the real indicator, so ticking the box reads
                  as the mark coming up to full strength rather than as one
                  thing being swapped for another.

                  `pointer-events-none` so the whole 22px stays the target, and
                  gone the moment it is checked — the real tick draws there.
                */}
                {!selected && (
                  <CheckIcon
                    aria-hidden
                    strokeWidth={3}
                    className="text-background pointer-events-none absolute inset-0 m-auto size-4 opacity-35"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {menuItems(CONTEXT_PARTS)}
      </ContextMenuContent>
    </ContextMenu>
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
  pills,
}: {
  opener: string;
  answer?: string;
  theme?: FormRow["theme"];
  logoAlt: string;
  /** The strip along the bottom edge. Built by the card, which is where the
   *  thumbnail's surface is already worked out for the quick actions. */
  pills: React.ReactNode;
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
        pills={pills}
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
    <ThumbFrame pills={pills} style={{ backgroundColor: theme.background }}>
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

/**
 * The thumbnail: bubbles above, a strip of pills along the bottom edge.
 *
 * A column rather than an overlay, and the extra height (h-28 → h-32 → h-36)
 * is what pays for the strip — the second bump when the pills went up to 12px,
 * because taking those six pixels out of the bubbles instead would have
 * clipped the answer bubble on any form whose opening line runs to two lines.
 *
 * Absolutely positioning the pills would have put them under a two-line opener
 * plus an answer bubble on exactly the cards that have the most to say — the
 * bubbles fill this box top-down and a fixed height has no give. Giving the bubbles `flex-1` and the strip its own
 * row means the strip is never covered and never pushed out; a bubble stack
 * that would have overrun clips against the strip instead of through it.
 */
function ThumbFrame({
  style,
  pills,
  children,
}: {
  style: CSSProperties;
  pills: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex h-36 shrink-0 flex-col overflow-hidden p-3 pb-2"
      style={style}
    >
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {/* `justify-between` with one child leaves it at the start, so a form
          with no question count keeps the status where it always was. */}
      <div className="flex shrink-0 items-center justify-between gap-2 pt-1.5">
        {pills}
      </div>
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
