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
 * Scroll entrances came back, and neither objection to the old `Reveal` was
 * dropped to let them.
 *
 * The first was sameness: eleven identical fades down one page is not eleven
 * moments, it is a page that flickers as you scroll it. What plays now is one
 * entrance per *graphic* rather than one per band, and each says what its
 * graphic is — a bar grows, a chat bubble arrives from the side it was sent
 * from, a flow edge draws along its own path, a pen writes. `globals.css`
 * carries the six verbs.
 *
 * The second was fragility: `Reveal` and `FlowPreview`'s draw-in both put the
 * hidden frame into the server HTML, so whether content was visible at all
 * depended on an IntersectionObserver delivering. `in-view.tsx` inverts that —
 * nothing is hidden until the browser has proved it can animate, and it will
 * not even try in a hidden tab, without IO, or under reduced motion. Every
 * failure mode is the finished page.
 *
 * None of this runs through motion, which is why this file still only governs
 * the sliding pill.
 */
export function MarketingMotionConfig({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="never">{children}</MotionConfig>;
}
