"use client";

import { MotionConfig } from "motion/react";

/**
 * Motion's automatic reduced-motion degradation is turned off here — not to
 * ignore the preference, but to honour it deliberately.
 *
 * Left on, motion strips transforms from the client render only. The server
 * had already emitted the transform in the initial style, so the two passes
 * disagreed on an attribute and React warned on every hydration for
 * reduced-motion visitors.
 *
 * What is left in this subtree that motion still drives is the sliding pill in
 * `SegmentedControl`, on the pricing toggle and the code tabs. Everything else
 * that moves on these pages now handles the preference itself, without the
 * library: the hero headline is a CSS keyframe that the global
 * `prefers-reduced-motion` block collapses, the question-type marquee is the
 * same, and `ChatDemo` reads the preference through `usePrefersReducedMotion`
 * and renders the whole transcript at once with no typewriter.
 *
 * The scroll-entrance components this comment used to name — `Reveal` on every
 * band, and `FlowPreview`'s edge draw-in — are gone. Eleven identical fades
 * down one page is not eleven moments, it is a page that flickers as you
 * scroll it; and each one made whether content was visible at all conditional
 * on an IntersectionObserver delivering, which is a poor trade for a fade.
 */
export function MarketingMotionConfig({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="never">{children}</MotionConfig>;
}
