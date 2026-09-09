import { cn } from "@/lib/utils";

/**
 * The margin hand: circles, arrows, underlines and notes, drawn as though
 * somebody marked up a printout.
 *
 * Why these are SVG paths and not a font of dingbats or a border-radius trick:
 * a real annotation is *wrong* in a specific way. It overshoots the word, the
 * two ends of the ring do not meet, the arrow's curve is not a bezier anyone
 * would choose. Every path here is hand-plotted with those errors baked in,
 * because a perfect ellipse around a word does not read as somebody's pen — it
 * reads as a border, and the whole point is the human who was here.
 *
 * They are decoration and they say so: `aria-hidden` throughout, `currentColor`
 * so a note inherits the ink of whatever ground it lands on, and no layout
 * impact — the marks are absolutely positioned over the thing they mark, so
 * turning one off never reflows the sentence underneath.
 *
 * One rule for using them: at most one mark per section. The joke is that
 * someone reached for a pen once. Six pens on one page is a design system made
 * of pens.
 */

/**
 * The props that turn a static stroke into one that draws itself on.
 *
 * `pathLength="1"` renormalises the path so `stroke-dasharray: 1` covers all
 * of it whatever its real length is — which is what lets one keyframe in
 * `globals.css` draw a ring, an arrow and an underline without any of them
 * knowing how long they are.
 *
 * Nothing draws on its own: the class only does anything inside an `InView`
 * that has armed itself, so a visitor without JS, without an
 * IntersectionObserver, or with reduced motion on gets the finished mark.
 */
function drawProps(draw: boolean, delay: number) {
  if (!draw) return {};
  return {
    pathLength: 1,
    className: "cf-a-draw",
    style: { animationDelay: `${delay}ms` },
  } as const;
}

/**
 * A ring around a word, open at the top-left where the pen came round to meet
 * itself and missed. Wrap the word in a `relative inline-block` and drop this
 * inside it.
 */
export function CircleMark({
  className,
  strokeWidth = 3,
  draw = false,
  delay = 0,
}: {
  className?: string;
  strokeWidth?: number;
  /** Draw the stroke on rather than having it already there. See `InView`. */
  draw?: boolean;
  /** Milliseconds, for lining a mark up with whatever it is annotating. */
  delay?: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 240 96"
      preserveAspectRatio="none"
      fill="none"
      className={cn("pointer-events-none absolute -inset-x-4 -inset-y-2 h-[calc(100%+1rem)] w-[calc(100%+2rem)]", className)}
    >
      {/* Starts at the 10 o'clock, runs all the way round, and overshoots past
          its own start — the way a pen does when the hand keeps going. */}
      <path
        d="M52 14 C22 20 6 40 10 58 C14 78 46 90 108 92 C170 94 224 82 231 58 C238 34 206 12 140 7 C104 4 68 7 44 18"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        {...drawProps(draw, delay)}
      />
    </svg>
  );
}

/** A scribbled underline. Two strokes, because one pass never covers it. */
export function UnderlineMark({
  className,
  draw = false,
  delay = 0,
}: {
  className?: string;
  draw?: boolean;
  delay?: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 16"
      preserveAspectRatio="none"
      fill="none"
      className={cn("pointer-events-none absolute -bottom-2 left-0 h-3 w-full", className)}
    >
      <path
        d="M4 9 C44 4 92 3 140 5 C164 6 184 8 196 10"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        {...drawProps(draw, delay)}
      />
      <path
        d="M12 13 C56 9 108 8 154 10"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.55}
        vectorEffect="non-scaling-stroke"
        {...drawProps(draw, delay + 260)}
      />
    </svg>
  );
}

/**
 * A curved arrow, pointing from a note to the thing it is about.
 *
 * `dir` names where the arrowhead ends up relative to the tail, which is the
 * only thing a caller actually cares about at the call site.
 */
export function ArrowMark({
  className,
  dir = "down-left",
  positioned = true,
  draw = false,
  delay = 0,
}: {
  className?: string;
  dir?: "down-left" | "down-right" | "up-right" | "up-left";
  /** Set false to place one in normal flow instead of over something. */
  positioned?: boolean;
  draw?: boolean;
  delay?: number;
}) {
  const paths = {
    "down-left": {
      curve: "M74 6 C70 30 52 46 20 54",
      head: "M34 44 L18 55 L33 63",
    },
    "down-right": {
      curve: "M6 6 C10 30 28 46 60 54",
      head: "M46 44 L62 55 L47 63",
    },
    "up-right": {
      curve: "M6 64 C14 38 34 20 66 14",
      head: "M52 6 L68 13 L55 25",
    },
    /* `up-right` mirrored across the box's centre line, plotted rather than
       flipped with a transform — a `scaleX(-1)` would also reverse the stroke
       taper and the overshoot, and those asymmetries are the whole reason
       these are hand-plotted in the first place. */
    "up-left": {
      curve: "M74 64 C66 38 46 20 14 14",
      head: "M28 6 L12 13 L25 25",
    },
  }[dir];

  return (
    <svg
      aria-hidden
      viewBox="0 0 80 70"
      fill="none"
      className={cn("pointer-events-none size-16", positioned && "absolute", className)}
    >
      <path
        d={paths.curve}
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        {...drawProps(draw, delay)}
      />
      {/* The head starts once the shaft has almost arrived, because that is
          the order a hand does it in. */}
      <path
        d={paths.head}
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...drawProps(draw, delay + 520)}
      />
    </svg>
  );
}

/**
 * A handwritten note in the margin.
 *
 * Rotated a couple of degrees because nothing written by hand lands square,
 * and that one detail is most of what separates "handwriting font" from
 * "somebody wrote this".
 */
export function HandNote({
  children,
  className,
  style,
  tilt = -4,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Degrees. Keep it small — past about 8 it reads as a mistake. */
  tilt?: number;
}) {
  return (
    <span
      style={{ fontFamily: "var(--font-hand)", transform: `rotate(${tilt}deg)`, ...style }}
      className={cn("inline-block text-[1.35rem] leading-none font-bold", className)}
    >
      {children}
    </span>
  );
}

/**
 * The mark, blown up and dropped into a corner at low opacity.
 *
 * It is the logo rather than an abstract blob on purpose: a shape that means
 * something is worth looking at twice, and the silhouette is already the most
 * recognisable object the brand owns. `mono` in `currentColor`, so it takes
 * the ink of whatever band it lands in and never fights the ground it sits on.
 *
 * This used to be described here as "the page's one repeating background
 * device", and `Band` duly stamped it on every flat band at the same corner,
 * the same size and the same angle. Repeated identically down a page it stops
 * being a signature and becomes wallpaper — on `/pricing` you could see the
 * same silhouette three times in one scroll, once of them sitting behind the
 * comparison table's numbers. It is opt-in now (see `Band`), and `tilt` exists
 * so that the few places which do use it are not stamped from one plate.
 */
export function MarkWatermark({
  className,
  opacity = 0.07,
  tilt = 0,
}: {
  className?: string;
  opacity?: number;
  /** Degrees. The mark is a soft silhouette; past about 25 it reads as fallen. */
  tilt?: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 32 32"
      fill="none"
      style={{ opacity, transform: tilt ? `rotate(${tilt}deg)` : undefined }}
      className={cn("pointer-events-none absolute", className)}
    >
      <path
        d={
          "M11 7 L13.2 7 L21.6 3.9 L20.4 7 L21 7 A6 6 0 0 1 27 13 L27 19 A6 6 0 0 1 21 25 " +
          "L18.8 25 L10.4 28.1 L11.6 25 L11 25 A6 6 0 0 1 5 19 L5 13 A6 6 0 0 1 11 7 Z"
        }
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * A field of dots, masked so it fades out rather than ending on a hard edge.
 *
 * The cheapest way to stop a large flat ground reading as an empty div. Sized
 * in the band's own ink, so it is the same device on cream and on charcoal.
 */
export function DotField({
  className,
  opacity = 0.09,
  size = 22,
}: {
  className?: string;
  opacity?: number;
  size?: number;
}) {
  return (
    <div
      aria-hidden
      style={{
        opacity,
        backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
      }}
      className={cn("pointer-events-none absolute inset-0", className)}
    />
  );
}
