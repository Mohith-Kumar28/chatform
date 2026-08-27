"use client";

import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * A fragment of the flow canvas, drawn rather than screenshotted.
 *
 * The real editor is `@xyflow/react` with a dagre layout and a 200 KB chunk —
 * far too much to load on a marketing page, and a PNG would go stale. This is
 * the same shape: a question, two conditional arms, and the endings they lead
 * to, using the block-family colours the canvas itself uses.
 */

const EDGES = [
  { d: "M200 74 L200 100 Q200 112 188 112 L104 112 Q92 112 92 124 L92 150", label: "≥ 50", lx: 118, ly: 106 },
  { d: "M200 74 L200 100 Q200 112 212 112 L296 112 Q308 112 308 124 L308 150", label: "otherwise", lx: 246, ly: 106 },
  { d: "M92 194 L92 214 Q92 226 104 226 L188 226", label: "", lx: 0, ly: 0 },
  { d: "M308 194 L308 214 Q308 226 296 226 L212 226", label: "", lx: 0, ly: 0 },
] as const;

export function FlowPreview() {
  const reduced = usePrefersReducedMotion();

  return (
    <svg
      viewBox="0 0 400 260"
      className="w-full"
      role="img"
      aria-label="A flow fragment: one question branching on team size into two endings."
    >
      <defs>
        <marker
          id="cf-flow-arrow"
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L8 4 L0 8 z" fill="var(--border)" />
        </marker>
      </defs>

      {EDGES.map((edge, i) => (
        <g key={i}>
          <motion.path
            d={edge.d}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1.75"
            strokeLinecap="round"
            markerEnd="url(#cf-flow-arrow)"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={
              reduced
                ? { duration: 0, delay: 0 }
                : { duration: 0.45, delay: 0.15 + i * 0.12, ease: [0.2, 0, 0, 1] }
            }
          />
          {edge.label && (
            <text
              x={edge.lx}
              y={edge.ly}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 9, fontWeight: 500 }}
            >
              {edge.label}
            </text>
          )}
        </g>
      ))}

      {/* question */}
      <g>
        <rect
          x="112"
          y="30"
          width="176"
          height="44"
          rx="10"
          fill="var(--family-number-soft)"
          stroke="var(--family-number)"
          strokeOpacity="0.35"
        />
        <rect x="112" y="30" width="3.5" height="44" rx="1.75" fill="var(--family-number)" />
        <text x="128" y="49" className="fill-foreground" style={{ fontSize: 10.5, fontWeight: 600 }}>
          How big is your team?
        </text>
        <text x="128" y="63" style={{ fontSize: 9 }} className="fill-muted-foreground">
          Number · required
        </text>
      </g>

      {/* arms */}
      <g>
        <rect x="20" y="150" width="144" height="44" rx="10" fill="var(--card)" stroke="var(--border)" />
        <rect x="20" y="150" width="3.5" height="44" rx="1.75" fill="var(--family-contact)" />
        <text x="36" y="169" className="fill-foreground" style={{ fontSize: 10.5, fontWeight: 600 }}>
          Ask for a work email
        </text>
        <text x="36" y="183" style={{ fontSize: 9 }} className="fill-muted-foreground">
          Email · business only
        </text>
      </g>
      <g>
        <rect x="236" y="150" width="144" height="44" rx="10" fill="var(--card)" stroke="var(--border)" />
        <rect x="236" y="150" width="3.5" height="44" rx="1.75" fill="var(--family-choice)" />
        <text x="252" y="169" className="fill-foreground" style={{ fontSize: 10.5, fontWeight: 600 }}>
          Which plan fits?
        </text>
        <text x="252" y="183" style={{ fontSize: 9 }} className="fill-muted-foreground">
          Single select
        </text>
      </g>

      {/* ending */}
      <g>
        <rect
          x="188"
          y="208"
          width="24"
          height="36"
          rx="8"
          fill="var(--primary-soft)"
          stroke="var(--primary)"
          strokeOpacity="0.4"
        />
        <text
          x="200"
          y="230"
          textAnchor="middle"
          style={{ fontSize: 11, fontWeight: 700 }}
          className="fill-primary-soft-foreground"
        >
          ✓
        </text>
      </g>
    </svg>
  );
}
