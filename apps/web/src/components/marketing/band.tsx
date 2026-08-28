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
 */

export type BandTone =
  | "paper"
  | "sand"
  | "ink"
  | "content"
  | "text"
  | "contact"
  | "number"
  | "choice"
  | "scale"
  | "advanced";

/** Ground and heading colour for each tone. Family tones read from the tokens. */
function groundStyle(tone: BandTone): React.CSSProperties | undefined {
  if (tone === "paper" || tone === "sand" || tone === "ink") return undefined;
  return { background: `var(--family-${tone}-band)` };
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
      className={cn(
        "text-display-lg font-bold tracking-[-0.03em] text-balance sm:text-[2.75rem]",
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
  const familyTinted = tone !== "paper" && tone !== "sand" && tone !== "ink";

  return (
    <p
      style={familyTinted ? { color: `var(--family-${tone}-band-muted)` } : undefined}
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
