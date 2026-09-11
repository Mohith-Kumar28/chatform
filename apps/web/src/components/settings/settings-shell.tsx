import { cn } from "@/lib/utils";

/**
 * The two-pane settings frame: the map on the left, one section on the right.
 *
 * ## Why this exists
 *
 * There were two of these — `app/(app)/settings/layout.tsx` for the account and
 * organization screens, and the top half of `builder/settings-panel.tsx` for a
 * form's own — written months apart and agreeing on nothing: one card was
 * `rounded-xl`, the other `rounded-2xl`; one stacked on mobile, the other kept
 * a 14rem rail at 375px; one capped its pane at `calc(100svh - 220px)`, the
 * other capped nothing at all. Same shape, same job, two implementations.
 *
 * ## Why the frame is a fixed height
 *
 * Every section has a different amount in it — Profile is two cards, Security
 * is five, Keyboard shortcuts is a long table, an empty API-keys list is one
 * sentence. When the frame grew to fit whatever was inside it, moving between
 * sections resized the card and slid the rail's items up and down under the
 * cursor you were about to click with.
 *
 * So the page is exactly one viewport tall (minus the header above it) and the
 * pane takes whatever is left, scrolling its own content. The rail cannot move,
 * because nothing below it can push it. A short section leaves empty space —
 * that is the point: empty space is what a stable layout costs, and it is
 * cheaper than a card that jumps.
 *
 * The height comes from flexbox rather than a magic `calc`, so the only number
 * involved is the header's, which lives in `--app-header-h`. Anything the
 * surface puts above the frame (a back link, a heading) is measured, not
 * guessed.
 *
 * ## Why the lock starts at `md`
 *
 * Below it the frame is not a card and the rail is not a rail — the sections
 * become a horizontal strip above the content, and the pane *is* the page. A
 * viewport-height box with its own scrollbar nested inside the document's is
 * the one layout a phone handles worst, and there is no rail left for a
 * reflow to disturb, so mobile keeps flowing normally.
 */
export interface SettingsShellProps {
  /**
   * The section map. Rendered inside the frame, so it can be a rail at `md`
   * and a strip below it — see `SettingsNav` for the pattern.
   */
  nav: React.ReactNode;
  /** Above the frame: a back link, the `h1`, whatever the surface needs. */
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** For the scrolling pane — padding overrides, mostly. */
  paneClassName?: string;
}

export function SettingsShell({ nav, header, children, className, paneClassName }: SettingsShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col px-4 py-8 sm:px-6",
        "md:h-[calc(100svh-var(--app-header-h))] md:min-h-[var(--settings-pane-min-h)]",
        className,
      )}
    >
      {header}

      {/* `min-h-0` so the pane's `overflow-y-auto` has something to measure
          against: a flex child defaults to its content's height, which is
          exactly the growth this frame exists to prevent. */}
      <div className="md:bg-card md:shadow-xs flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden md:rounded-xl">
        {nav}

        {/*
          `@container/settings`, because the pane is not the viewport.

          With the rail present the pane is ~830px inside a 1152px page; without
          it, at 375px, the pane *is* the page. A section that splits into columns
          has to measure the space it actually has, or it stacks when there is
          room and crams when there is not.
        */}
        <div
          className={cn(
            "@container/settings min-w-0 flex-1 md:overflow-y-auto md:overscroll-contain md:p-6",
            paneClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
