import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BandTitle } from "./band";

/**
 * The pieces every home-page section is assembled from, after Youform's
 * landing page: an uppercase eyebrow, a two-line heading whose second line
 * answers the first, one muted paragraph, and a text link with an arrow. Most
 * sections pair that block with one picture on the other side, so the page
 * reads as a rhythm rather than as a list of different layouts.
 */

/**
 * The section heading, a size below `BandTitle`'s own. Twenty sections at the
 * band size read as twenty headlines; at this size the page has one headline
 * (the hero) and a run of chapter titles under it.
 */
export function SectionTitle({
  eyebrow,
  children,
  accent,
  className,
}: {
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  accent?: React.ReactNode;
  className?: string;
}) {
  // One element, so the eyebrow and the heading stay together as a grid child.
  return (
    <div>
      <BandTitle
        eyebrow={eyebrow}
        accent={accent}
        className={cn("text-[2.25rem] sm:text-[clamp(2.25rem,1.3rem+2.4vw,3.25rem)]", className)}
      >
        {children}
      </BandTitle>
    </div>
  );
}

export function SectionLede({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-muted-foreground mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-pretty", className)}>{children}</p>;
}

/**
 * The page's one button shape: a pill with a short drop under it that lifts a
 * pixel on hover, so it reads as something you press rather than a coloured
 * rectangle.
 */
const PRESSABLE =
  "inline-flex h-12 items-center justify-center gap-2.5 rounded-full px-7 text-[0.9375rem] font-semibold " +
  "transition-[transform,box-shadow,background-color] duration-[var(--duration-micro)] ease-[var(--ease-out)] " +
  "shadow-[0_3px_0_oklch(0.25_0.02_65/0.16)] hover:-translate-y-px hover:shadow-[0_4px_0_oklch(0.25_0.02_65/0.2)] " +
  "active:translate-y-0 active:shadow-[0_1px_0_oklch(0.25_0.02_65/0.16)] motion-reduce:transform-none " +
  "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none";

export function PrimaryCta({
  href = "/signin?mode=signup",
  children,
  className,
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(PRESSABLE, "bg-primary text-on-primary hover:bg-primary-hover", className)}>
      {children}
      <ArrowRight className="size-4" strokeWidth={2.25} />
    </Link>
  );
}

export function InkCta({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn(PRESSABLE, "bg-foreground text-background hover:bg-foreground/90", className)}>
      {children}
      <ArrowRight className="size-4" strokeWidth={2.25} />
    </Link>
  );
}

export const SECONDARY_CTA = cn(
  PRESSABLE,
  "border-border bg-card/70 text-foreground hover:bg-card border shadow-[0_3px_0_oklch(0.25_0.02_65/0.07)]",
);

/** The arrow link that ends most sections. Underlined on hover only. */
export function TextLink({
  href,
  children,
  className,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "group text-foreground inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold",
        "decoration-primary underline-offset-[5px] hover:underline",
        className,
      )}
    >
      {children}
      <ArrowRight className="size-4 transition-transform duration-[var(--duration-micro)] group-hover:translate-x-0.5" />
    </Link>
  );
}

/**
 * A contained, rounded panel: the way Youform makes a section stand out without
 * painting the whole width. `tint` takes a family or the brand's soft wash.
 */
export function Panel({
  children,
  tint = "card",
  className,
}: {
  children: React.ReactNode;
  tint?: "card" | "orange" | "violet" | "choice" | "text" | "number";
  className?: string;
}) {
  const ground: Record<typeof tint, string> = {
    card: "bg-card border-border",
    orange: "bg-primary-soft border-[color-mix(in_oklch,var(--primary)_22%,transparent)]",
    violet: "bg-brand-violet-soft border-[color-mix(in_oklch,var(--brand-violet)_24%,transparent)]",
    choice: "bg-[var(--family-choice-soft)] border-[color-mix(in_oklch,var(--family-choice)_24%,transparent)]",
    text: "bg-[var(--family-text-soft)] border-[color-mix(in_oklch,var(--family-text)_24%,transparent)]",
    number: "bg-[var(--family-number-soft)] border-[color-mix(in_oklch,var(--family-number)_24%,transparent)]",
  };
  return <div className={cn("relative rounded-[18px] border", ground[tint], className)}>{children}</div>;
}

/** The soft shadow under a raised picture. */
export const PANEL_SHADOW = "shadow-[0_18px_55px_-28px_oklch(0.25_0.02_65/0.35)]";

export function CheckItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <li className={cn("flex items-start gap-2.5", className)}>
      <span className="bg-primary-soft text-primary-soft-foreground mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span>{children}</span>
    </li>
  );
}

/** Copy on one side, picture on the other: the page's default section layout. */
export function Split({
  children,
  className,
  cols = "lg:grid-cols-[0.9fr_1.1fr]",
}: {
  children: React.ReactNode;
  className?: string;
  cols?: string;
}) {
  return <div className={cn("grid items-center gap-12 lg:gap-16", cols, className)}>{children}</div>;
}
