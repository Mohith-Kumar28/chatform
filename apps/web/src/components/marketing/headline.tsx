import { cn } from "@/lib/utils";

/**
 * The page's one authored motion moment.
 *
 * Before this, every band on the landing page entered identically — the same
 * `Reveal`, the same 12px fade, eleven times. Eleven identical entrances is not
 * eleven moments; it is a page that flickers as you scroll it. So the entrances
 * are gone almost everywhere and the budget is spent here, once, on the first
 * thing anyone sees.
 *
 * There is no `"use client"` here and no motion library, and that is the point.
 * The first attempt drove this with `motion.span`, which writes its `initial`
 * state into the server HTML as `opacity: 0` and relies on hydration plus a
 * running rAF loop to undo it. That shipped a headline that was simply not
 * there — observed, with computed `opacity: 0`, in a browser tab that happened
 * to be backgrounded, where rAF never fires. A backgrounded tab is a mundane
 * condition, and it is the one a link opened in a new tab starts in.
 *
 * An `h1` is the wrong place to make legibility depend on JavaScript getting a
 * frame. The correct static render is the visible one; the animation is a CSS
 * keyframe layered on top, and CSS keyframes do not need the main thread.
 *
 * The rise is short (0.34em) and unmasked. A taller rise wants a clip to hide
 * the word before it arrives, and a clip that is tight enough not to leak into
 * the line below is also tight enough to shear the descender off a `y` or a
 * `g`. The blur carries the entrance on its own.
 */

export function Headline({
  segments,
  className,
}: {
  /** One entry per word. `tone` colours it; `br` forces a line break after. */
  segments: readonly { text: string; tone?: "primary" | "answer"; br?: boolean }[];
  className?: string;
}) {
  return (
    <h1
      className={cn("text-display-2xl font-bold tracking-[-0.045em] text-balance", className)}
    >
      {segments.map((seg, i) => (
        <span key={`${seg.text}-${i}`}>
          <span
            className="word-rise"
            style={{
              animationDelay: `${60 + i * 70}ms`,
              ...(seg.tone === "primary"
                ? { color: "var(--primary)" }
                : seg.tone === "answer"
                  ? { color: "var(--family-scale-ink)" }
                  : null),
            }}
          >
            {seg.text}
          </span>
          {seg.br ? <br /> : " "}
        </span>
      ))}
    </h1>
  );
}
