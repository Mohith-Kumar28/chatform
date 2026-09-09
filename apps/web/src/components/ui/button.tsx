import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap",
    "outline-none disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    // Motion: buttons do not lift on hover (DESIGN.md 4.4) — they darken. The
    // only transform is a small press, which reads as a physical click.
    "transition-[background-color,border-color,color,box-shadow,transform]",
    "duration-[var(--duration-micro)] ease-[var(--ease-out)]",
    "active:scale-[0.98] motion-reduce:active:scale-100",
    "focus-visible:ring-ring/50 focus-visible:border-ring focus-visible:ring-[3px]",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        soft: "bg-primary-soft text-primary hover:bg-primary-soft/70",
        // The brand's other half. `brand` is the counterpart to `default`, for
        // the second action in a pair where `outline` would read as a retreat
        // — "See pricing" beside "Start free". Its ink is the same warm
        // near-black `default` uses; see the token note in globals.css.
        brand:
          "bg-brand-violet text-brand-violet-foreground shadow-xs hover:bg-brand-violet-hover",
        "brand-soft":
          "bg-brand-violet-soft text-brand-violet-soft-foreground hover:bg-brand-violet-soft/70",
        // Both plates at once — the closing band's ground, at button size.
        //
        // Reserved, and the reservation is the whole design (DESIGN.md 4.1b):
        // this is the *commercial ask*, and there is at most one on a screen.
        // Upgrade, unlock, start the paid plan. Everything else that is merely
        // important is `default`. A product where the gradient is how you make
        // a control interesting is a product where the gradient means nothing,
        // and the one button that actually needs to be seen is no longer the
        // one wearing it.
        //
        // Hover cross-fades rather than swapping: `background-image` does not
        // interpolate, so a straight swap of two gradients snaps. The overlay
        // is a `::before` at negative z-index inside the button's own stacking
        // context, which paints over the resting sweep and under the label.
        gradient: [
          "relative isolate bg-brand-gradient text-on-primary shadow-xs",
          "before:absolute before:inset-0 before:-z-10 before:rounded-[inherit]",
          "before:bg-brand-gradient-hover before:opacity-0 before:transition-opacity",
          "before:duration-[var(--duration-micro)] before:ease-[var(--ease-out)]",
          "hover:before:opacity-100",
        ].join(" "),
        // Controls that sit ON a full-strength brand ground — the hero wash,
        // the closing band. Every other variant assumes a page-coloured
        // surface underneath it, so `default` puts orange on orange and
        // `outline` draws a cream border on cream. These invert instead: the
        // page's own ground becomes the fill, which is the highest-contrast
        // thing available on a saturated band in either theme.
        //
        // Hand-rolled in `cta-band.tsx` first. Promoted here when the hero
        // needed the same two buttons, because the second copy is where a
        // pattern starts drifting.
        "on-brand": "bg-background text-foreground shadow-sm hover:bg-card",
        // The secondary of that pair, and it is NOT an outline any more.
        //
        // It was `border-2 border-current`, which on these grounds meant a 2px
        // near-black ring drawn around empty space. Two problems with that.
        // A hard rule at that weight is the heaviest mark on the band — it
        // out-drew the solid button beside it, so the *secondary* action was
        // the one your eye landed on. And an outline is a shape before it is a
        // control: on a saturated ground with nothing inside it, what reads is
        // the black rectangle, not the label.
        //
        // A tint of the band's own ink instead, with a hairline of the same at
        // a fifth of the strength. `currentColor` rather than a token, so it
        // takes whatever ink the band set on itself — the warm near-black of
        // the vivid tier under the hero, `--on-primary` on the closing
        // gradient — and stays legible on both without either knowing about
        // the other. The pair now reads as one material at two strengths:
        // opaque for the thing to do, translucent for the thing beside it.
        "on-brand-outline": [
          // Raised from 9%/18%. At a tenth of the ink this was a secondary in
          // the apologetic sense — technically present, easy to miss, and next
          // to a solid fill it read as disabled rather than as the other
          // option. A secondary action still has to look like something you
          // may press. A fifth of the ink is enough to hold its own edge on the
          // wash without competing with the opaque button beside it.
          "bg-[color-mix(in_oklch,currentColor_20%,transparent)]",
          "border border-[color-mix(in_oklch,currentColor_34%,transparent)]",
          "hover:bg-[color-mix(in_oklch,currentColor_28%,transparent)]",
          "hover:border-[color-mix(in_oklch,currentColor_44%,transparent)]",
        ].join(" "),
        link: "text-primary underline-offset-4 hover:underline",
      },
      shape: {
        default: "",
        pill: "rounded-full",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  shape = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, shape, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
