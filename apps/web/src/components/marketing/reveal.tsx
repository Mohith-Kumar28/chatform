"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Enter-on-scroll, using the motion tokens the rest of the product already
 * uses (DESIGN.md 4.5: entrances 220ms, ease-out). Fires once — a section that
 * re-animates every time it re-enters the viewport reads as a glitch.
 *
 * Under reduced motion this renders a plain element with no transform, because
 * the global 0.01ms collapse in globals.css does not reach JS-driven values.
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
  const reduced = useReducedMotion();
  const Comp = motion[as];

  if (reduced) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.22, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </Comp>
  );
}
