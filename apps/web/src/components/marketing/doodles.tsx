import { cn } from "@/lib/utils";

/**
 * Line doodles in the brand's two hues, for the margins of a section.
 *
 * Drawn in `currentColor` with a soft fill, so a caller tints one with a text
 * class. `drift` makes it move a little as the page scrolls past (CSS
 * `view()` timelines, so no script; browsers without them just show it still,
 * and reduced motion stops it). Decoration only: hidden from assistive tech
 * and below `md`, where there is no margin to put them in.
 */
const PATHS = {
  bubble: (
    <>
      <path d="M8 12c0-4 3-7 7-7h18c4 0 7 3 7 7v11c0 4-3 7-7 7H20l-8 7 1-7c-3-1-5-4-5-7z" fill="var(--doodle-fill)" />
      <path d="M17 17h14M17 22h9" />
    </>
  ),
  pencil: (
    <>
      <path d="M10 36l3-10L32 7l7 7-19 19z" fill="var(--doodle-fill)" />
      <path d="M28 11l7 7M13 26l7 7" />
    </>
  ),
  check: (
    <>
      <rect x="8" y="8" width="30" height="30" rx="7" fill="var(--doodle-fill)" />
      <path d="M15 23l6 6 11-13" />
    </>
  ),
  envelope: (
    <>
      <rect x="6" y="12" width="36" height="25" rx="5" fill="var(--doodle-fill)" />
      <path d="M8 15l16 12 16-12" />
    </>
  ),
  sparkle: <path d="M24 5c1 10 4 14 15 15-11 1-14 5-15 16-1-11-4-15-15-16 11-1 14-5 15-15z" fill="var(--doodle-fill)" />,
  plane: (
    <>
      <path d="M6 22L42 7 34 40l-11-9-6 7v-10z" fill="var(--doodle-fill)" />
      <path d="M17 28l25-21" />
    </>
  ),
} as const;

export type DoodleName = keyof typeof PATHS;

export function Doodle({
  name,
  className,
  tilt = 0,
  drift = true,
  tone = "orange",
}: {
  name: DoodleName;
  className?: string;
  tilt?: number;
  drift?: boolean;
  tone?: "orange" | "violet";
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={
        {
          "--doodle-fill": tone === "orange" ? "var(--primary-soft)" : "var(--brand-violet-soft)",
          rotate: `${tilt}deg`,
        } as React.CSSProperties
      }
      className={cn(
        "pointer-events-none absolute hidden size-14 md:block",
        tone === "orange" ? "text-primary/70" : "text-brand-violet/80",
        drift && "doodle-drift",
        className,
      )}
    >
      {PATHS[name]}
    </svg>
  );
}
