"use client";

import { MotionConfig } from "motion/react";

/**
 * Motion's automatic reduced-motion degradation is turned off here — not to
 * ignore the preference, but to honour it deliberately.
 *
 * Left on, motion strips transforms from the client render only. The server had
 * already emitted `transform: translateY(12px)` in the initial style, so the
 * two passes disagreed on an attribute and React warned on every hydration for
 * reduced-motion visitors.
 *
 * Every animating component in this subtree handles the preference itself:
 * `Reveal` collapses its transition to zero, `ChatDemo` renders the whole
 * transcript at once with no typewriter, and `FlowPreview` skips the edge
 * draw-in. Same outcome, decided by us rather than half-applied by the library.
 */
export function MarketingMotionConfig({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="never">{children}</MotionConfig>;
}
