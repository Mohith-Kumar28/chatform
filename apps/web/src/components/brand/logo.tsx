import { cn } from "@/lib/utils";

/**
 * The mark: one speech bubble, two tails, two plates.
 *
 * The old mark was a rounded orange square with a bubble and two form lines
 * inside it — three ideas competing inside 32 pixels, and at favicon size it
 * collapsed into an orange blob with a smudge. Worse, it said nothing the
 * product doesn't share with every chat widget ever shipped.
 *
 * This says the one thing that is only true here. A speech bubble has one
 * tail, because one person is talking. This one has two, at opposite corners,
 * and a diagonal seam splitting it into two plates — the interviewer's and the
 * respondent's, locked into the same shape. A form that answers back, drawn.
 *
 * Three details that are load-bearing:
 *
 *  - The seam is a real gap, not a colour change. The plates are two paths
 *    with ~0.9 units of nothing between them, so the page shows through and
 *    they read as two objects rather than one object painted twice. It also
 *    means the mark needs no knowledge of what it is sitting on.
 *  - The tails sweep rather than point straight out. A narrow vertical tail on
 *    the top edge reads as a stem and turns the whole mark into a piece of
 *    fruit; the sweep is what keeps it a tail. This was worth four attempts.
 *  - `mono` exists because two-tone on the orange CTA band or the ink band is
 *    a colour clash, not a logo. It draws the full silhouette in
 *    `currentColor`, seam included — the seam is in the outline, so the
 *    silhouette keeps the two-tail shape without needing the second hue.
 */

/** The whole shape, seam closed. Used by `mono` and by the favicon. */
const SILHOUETTE =
  "M11 7 L13.2 7 L21.6 3.9 L20.4 7 L21 7 A6 6 0 0 1 27 13 L27 19 A6 6 0 0 1 21 25 " +
  "L18.8 25 L10.4 28.1 L11.6 25 L11 25 A6 6 0 0 1 5 19 L5 13 A6 6 0 0 1 11 7 Z";

/** Lower-left plate — the respondent, and the tail that points back at them. */
const PLATE_ASK =
  "M19.7 25 L18.8 25 L10.4 28.1 L11.6 25 L11 25 A6 6 0 0 1 5 19 L5 13 A6 6 0 0 1 11 7 L11.3 7 Z";

/** Upper-right plate — the interviewer. */
const PLATE_ANSWER =
  "M12.3 7 L13.2 7 L21.6 3.9 L20.4 7 L21 7 A6 6 0 0 1 27 13 L27 19 A6 6 0 0 1 21 25 L20.7 25 Z";

export function LogoMark({
  className,
  variant = "duo",
}: {
  className?: string;
  /** `mono` draws one silhouette in `currentColor`, for coloured grounds. */
  variant?: "duo" | "mono";
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
    >
      {variant === "mono" ? (
        <path d={SILHOUETTE} fill="currentColor" />
      ) : (
        <>
          <path d={PLATE_ASK} className="fill-primary" />
          <path d={PLATE_ANSWER} style={{ fill: "var(--family-scale)" }} />
        </>
      )}
    </svg>
  );
}

export function Logo({
  className,
  variant = "duo",
}: {
  className?: string;
  variant?: "duo" | "mono";
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark variant={variant} />
      {/* 700, not the display utility's inherited 500. A wordmark set at text
          weight beside a saturated mark reads as a caption for it. */}
      <span className="font-display text-[1.0625rem] leading-none font-bold tracking-[-0.045em]">
        chatform
      </span>
    </span>
  );
}
