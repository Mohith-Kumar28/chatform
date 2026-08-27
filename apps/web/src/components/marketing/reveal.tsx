"use client";

import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * Enter-on-scroll, using the motion tokens the rest of the product already
 * uses (DESIGN.md 4.5: entrances 220ms, ease-out). Fires once — a section that
 * re-animates every time it re-enters the viewport reads as a glitch.
 *
 * Reduced motion collapses the *duration*, and never the element. Branching on
 * `useReducedMotion()` to return a plain tag instead is the obvious shape and
 * the wrong one: it is a browser-only reading, so the server emitted a motion
 * element with `opacity: 0` inline and the client emitted a bare one, and React
 * threw the whole tree away on hydration. Same element in both passes; only the
 * transition differs, and a transition never reaches the server HTML.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  /** Seconds. Use ~0.06 steps to stagger siblings. */
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const reduced = usePrefersReducedMotion();
  const Comp = motion[as];

  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={
        reduced
          ? { duration: 0, delay: 0 }
          : { duration: 0.22, delay, ease: [0.2, 0, 0, 1] }
      }
    >
      {children}
    </Comp>
  );
}
