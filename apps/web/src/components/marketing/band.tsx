import { cn } from "@/lib/utils";

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

export function Band({
  id,
  tone = "paper",
  children,
  className,
  containerClassName,
  size = "default",
}: {
  id?: string;
  tone?: BandTone;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  /** `tight` for connective bands; `tall` for the two that carry the argument. */
  size?: "tight" | "default" | "tall";
}) {
  return (
    <section
      id={id}
      style={groundStyle(tone)}
      className={cn(
        "scroll-mt-20 px-6",
        size === "tight" && "py-14 sm:py-16",
        size === "default" && "py-20 sm:py-24",
        size === "tall" && "py-24 sm:py-32",
        tone === "sand" && "bg-muted/50",
        tone === "ink" && "bg-foreground text-background dark:bg-card dark:text-foreground",
        className,
      )}
    >
      <div className={cn("mx-auto max-w-6xl", containerClassName)}>{children}</div>
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
