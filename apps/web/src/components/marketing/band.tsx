import { cn } from "@/lib/utils";
import { DotField, MarkWatermark } from "./annotate";

/**
 * A full-bleed horizontal band, tinted by one block family.
 *
 * This replaces `Section`, and the thing it deliberately does not have is an
 * eyebrow. The old shell took one on every band — "The difference", "How it
 * works", "Build", "Converse", "Collect", "Pricing", "Questions" — nine tiny
 * uppercase labels each restating the heading directly beneath it in weaker
 * type. They were the page's most repeated element and its least useful: a
 * heading that needs a label above it to explain what it is has not been
 * written yet. The prop is gone rather than optional, so it cannot come back.
 *
 * `tone` names a question family, and the ground comes from that family's
 * `-band` token — pastel on cream, deep tint on charcoal, derived rather than
 * picked. The scroll reads as a progression through the same colours a
 * respondent moves through, which is the one thing this product's palette
 * already means.
 *
 * `brand` is the one tone that is not a family. It grounds a band in the
 * mark's violet, and it exists so the page's loudest band can be the brand's
 * rather than a question type's. It used to be spelled `scale`, which put the
 * *ratings and scales* family under the section about the agent answering
 * back — the right colour for the wrong reason, and a tint that would have
 * moved the moment someone restyled a rating block.
 */

export type BandTone =
  | "paper"
  | "sand"
  | "ink"
  | "brand"
  | "content"
  | "text"
  | "contact"
  | "number"
  | "choice"
  | "scale"
  | "advanced";

/**
 * Ground and ink for each tone.
 *
 * These read the `-band-vivid` tier, not `-band`. The quiet tier is correct
 * for the builder, where someone works for hours and a saturated ground would
 * be a headache by lunchtime. It was never correct here: at 17% of the hue,
 * seven consecutive bands arrive as seven shades of the page background, and
 * a scroll that was designed as a progression through the product's own
 * spectrum read as one long grey.
 *
 * Ink comes with the ground rather than being left to inherit. Every vivid
 * ground lands at L≈0.67–0.80 in its own theme, so the warm near-black holds
 * across all of them — the same ink, and the same reasoning, as the brand
 * gradient. `--foreground` would be right in one theme and invisible in the
 * other; this is right in both.
 */
function groundStyle(tone: BandTone): React.CSSProperties | undefined {
  if (tone === "paper" || tone === "sand" || tone === "ink") return undefined;
  const hue = tone === "brand" ? "brand-violet" : `family-${tone}`;
  return {
    background: `var(--${hue}-band-vivid)`,
    color: "var(--on-band-vivid)",
  };
}

/**
 * Where a mark may sit, and at what angle.
 *
 * Three, not one, and no default: a caller has to say which, which makes two
 * marks on the same page a decision rather than an accident. The tilts are
 * small and none of them is zero — an upright logo in a corner reads as a
 * watermark stamped by software, and the whole device is meant to read as the
 * page's own shape showing through.
 */
const MARK_PLACEMENTS = {
  "bottom-right": {
    className: "-right-24 -bottom-32 size-[26rem] sm:-right-12 sm:size-[32rem]",
    tilt: -8,
  },
  "bottom-left": {
    className: "-left-28 -bottom-36 size-[24rem] sm:-left-16 sm:size-[30rem]",
    tilt: 14,
  },
  "top-right": {
    className: "-right-28 -top-28 size-[22rem] sm:-right-16 sm:size-[27rem]",
    tilt: -18,
  },
} as const;

export function Band({
  id,
  tone = "paper",
  children,
  className,
  containerClassName,
  size = "default",
  mark,
}: {
  id?: string;
  tone?: BandTone;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  /** `tight` for connective bands; `tall` for the two that carry the argument. */
  size?: "tight" | "default" | "tall";
  /**
   * Put the oversized mark behind this band, at a named corner.
   *
   * Off unless asked for, and asked for rarely — see the note below.
   */
  mark?: keyof typeof MARK_PLACEMENTS;
}) {
  /**
   * The plain tones are the flat ones.
   *
   * `paper`, `sand` and `ink` have no hue to carry them, so at full width they
   * are large empty rectangles between the coloured bands — the page visibly
   * running out of things to say. They get the dot field, which fades before
   * it reaches the type, is `currentColor` so one declaration works on cream
   * and on charcoal, and is cheap enough to be everywhere. Texture that reads
   * as paper can repeat; that is what texture is.
   *
   * The coloured bands get nothing. They already have a ground doing this job.
   *
   * The mark does NOT come with `flat` any more, and that is the point. Every
   * flat band used to stamp it at the same corner, the same size and the same
   * angle, so a long page showed one silhouette three or four times down its
   * right edge — and on `/pricing` one of those landed behind the comparison
   * table. A logo repeated on a schedule is not a signature, it is a tiled
   * background, and the thing it costs is the reason the mark was worth using:
   * that you notice it. It is opt-in per band now, and the few call sites that
   * ask for it vary the corner and the tilt so no two are the same gesture.
   */
  const flat = tone === "paper" || tone === "sand" || tone === "ink";

  return (
    <section
      id={id}
      style={groundStyle(tone)}
      className={cn(
        "relative overflow-hidden scroll-mt-20 px-6",
        size === "tight" && "py-14 sm:py-16",
        size === "default" && "py-20 sm:py-24",
        size === "tall" && "py-24 sm:py-32",
        tone === "sand" && "bg-muted/50",
        tone === "ink" && "bg-foreground text-background dark:bg-card dark:text-foreground",
        className,
      )}
    >
      {flat && (
        <DotField
          className="[mask-image:radial-gradient(ellipse_80%_70%_at_50%_50%,black,transparent)]"
          opacity={0.06}
        />
      )}

      {/* Bled off an edge and cropped, so it reads as a shape the page is
          standing on rather than a logo somebody placed. */}
      {mark && (
        <MarkWatermark
          className={MARK_PLACEMENTS[mark].className}
          tilt={MARK_PLACEMENTS[mark].tilt}
          opacity={0.05}
        />
      )}

      <div className={cn("relative mx-auto max-w-6xl", containerClassName)}>{children}</div>
    </section>
  );
}

/**
 * The band heading. One size for every band on the page, set in Bricolage at
 * 700 — the display utilities leave weight alone because the app's own screens
 * want 500 there, so marketing asks for the weight it needs at the call site
 * rather than moving a shared token the builder also reads.
 */
export function BandTitle({
  children,
  className,
  as: Comp = "h2",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <Comp
      /* Fluid to 3.9rem, up from a fixed 2.75. The old size was one step above
         the body copy beneath it and one step below the hero — a heading that
         resolves an argument in five words, set as though it were a paragraph
         label. On a ground this saturated a timid heading is worse than on
         cream: the colour commits and the type does not, and the band reads as
         a mistake rather than a decision. Tracking tightens with the size, as
         display type has to. */
      className={cn(
        "font-display text-[2.5rem] leading-[1.03] font-bold tracking-[-0.04em] text-balance",
        "sm:text-[clamp(2.75rem,1.4rem+3.4vw,3.9rem)]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

/**
 * The one line under a heading. Deliberately capped: the old page ran three-
 * sentence ledes into every band, and nobody reads the third sentence of a
 * subtitle. `tone` tints it from the band's own hue rather than dropping to
 * grey, which is what `text-muted-foreground` does on a coloured ground.
 */
export function BandLede({
  children,
  tone = "paper",
  className,
}: {
  children: React.ReactNode;
  tone?: BandTone;
  className?: string;
}) {
  const tinted = tone !== "paper" && tone !== "sand" && tone !== "ink";

  return (
    <p
      /* One muted ink for all seven vivid grounds, where the quiet tier needed
         a per-family `-band-muted`. On a pastel the secondary line had to be
         pulled toward that family's own dark ink to avoid going grey; on a
         saturated ground it only has to be a step down from the near-black
         already sitting on it, and a step down from near-black is the same
         colour whichever hue it lands on. Clears 4.6:1 at worst. */
      style={tinted ? { color: "var(--on-band-vivid-muted)" } : undefined}
      className={cn(
        "text-body-lg mt-4 max-w-lg text-balance",
        tone === "ink" && "opacity-70",
        (tone === "paper" || tone === "sand") && "text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}
