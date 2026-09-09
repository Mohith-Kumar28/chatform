"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The brand sweep, alive.
 *
 * Everywhere the two hues meet on a surface — the hero wash, the closing CTA —
 * the ground used to be one `linear-gradient` declaration: correct, on the
 * mark's diagonal, and completely inert. This is the same two hues on the same
 * diagonal with five blurred lobes of them drifting across it and a sixth that
 * follows the pointer. Nothing about the colour changes; the surface just stops
 * being a printed plate.
 *
 * The technique is Aceternity UI's `BackgroundGradientAnimation`. What is kept
 * from it is the shape of the idea — a blurred stack of huge radial lobes on
 * incommensurable orbits, plus a pointer lobe lerped toward the cursor. What is
 * not kept is anything that would let it off the leash here (its SVG goo filter
 * is a fourth thing, dropped for a reason recorded at the blur below):
 *
 *   Colour. The original takes six raw `r, g, b` triplets and writes them to
 *   `document.body` — global mutable state, wrong for two instances on a page,
 *   and a palette that no theme can follow. Every colour below is a token, so
 *   the field retints with the theme like everything else, and the light and
 *   dark grounds derive from the same declaration.
 *
 *   Contrast. This is a decoration under an `h1`, and the ink over it is fixed
 *   (`--on-band-vivid` on the wash, `--on-primary` on the CTA — one warm
 *   near-black, the same value). So the lobes are drawn ONLY from colours that
 *   ink is already asserted against in `token-contrast.test.ts`: the two brand
 *   hues and their two hover twins. Every pixel of the field is therefore a
 *   mix of colours inside that tested set, and no drift can carry the ground
 *   somewhere the headline stops being readable. That constraint is the reason
 *   there is no `colors` prop — a caller who could pass arbitrary hues could
 *   pass a dark one.
 *
 *   The loop. The original lerps in React state on every `mousemove`, so the
 *   whole subtree re-renders at pointer rate and the easing only advances one
 *   step per event — it stops dead the instant you hold still off-target. Here
 *   the lerp is a `requestAnimationFrame` loop writing `transform` on one ref'd
 *   node: no renders, frame-rate easing, and it parks itself when the lobe
 *   arrives, when the field scrolls out of view, or when the tab is hidden.
 *
 * `aria-hidden` and `pointer-events-none`, always: the pointer is tracked on
 * `window` and mapped into the field's own box, so the field never has to sit
 * in front of the content to feel the cursor.
 *
 * @example The hero wash — bled up behind the nav, faded into the page.
 * ```tsx
 * <section className="relative">
 *   <GradientField
 *     tier="vivid"
 *     className="-top-32 [mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_100%)]"
 *   />
 *   <div className="relative" style={{ color: "var(--on-band-vivid)" }}>…</div>
 * </section>
 * ```
 */

/**
 * How loud the ground under the lobes is.
 *
 * `vivid` is the `-band-vivid` tier — the hue mixed with the page, bright in
 * both themes but still a wash, and what the hero and any full-bleed marketing
 * section wants. `full` is both hues at full strength, which the product
 * reserves for the brand mark and the one closing band (see `cta-band.tsx`).
 *
 * The lobes are the same in both. Only the plate they drift over changes.
 */
export type GradientFieldTier = "vivid" | "full";

const GROUND: Record<GradientFieldTier, { angle: number; stops: string }> = {
  /* 115deg — a touch steeper than the mark, so on a wide hero the seam clears
     the headline's second line instead of running through it.

     Four stops, not two. The plateaus at each end (orange holding to 30%,
     violet from 74%) are what make this a seam rather than a fade: a plain
     two-stop sweep is in transition across its entire width, and there is no
     moment where either hue is simply itself. The transition happens in the
     middle third, which is where the mark's diagonal is. */
  vivid: {
    angle: 115,
    stops:
      "var(--brand-orange-band-vivid) 0%, var(--brand-orange-band-vivid) 30%, var(--brand-violet-band-vivid) 74%, var(--brand-violet-band-vivid) 100%",
  },
  /* 100deg and the raw hues — `--brand-gradient` restated from its parts,
     because this needs the angle as a number it can override. Two stops here
     and not four: at full strength each hue is loud enough that a plateau of
     it reads as a plate, which is the one thing this pair is not allowed to
     do (see `cta-band.tsx`). */
  full: {
    angle: 100,
    stops: "var(--brand-orange) 0%, var(--brand-violet) 100%",
  },
};

/**
 * The five lobes.
 *
 * Two things are load-bearing and neither is the colour.
 *
 * The `origin`s are scattered far outside the box — ±400px, ±800px — so the
 * three that rotate swing on arcs much wider than the section. A lobe rotating
 * about its own centre goes nowhere; a lobe rotating about a point eight
 * hundred pixels away sweeps the whole surface. That is the difference between
 * a spinning blob and weather.
 *
 * The `drift` classes carry periods that share no useful factor (30 / 20 / 40 /
 * 40 / 20, two of them reversed, one linear) — see the note in `globals.css`.
 * Five lobes on commensurate orbits re-form the same picture on a beat you can
 * feel; these do not resolve for minutes.
 *
 * Opacities fall as the list goes on because they composite: five lobes at 0.5
 * is not five lobes, it is a flat sheet of the last one.
 */
const LOBES = [
  { color: "var(--brand-orange)", opacity: 0.5, origin: "center center", drift: "field-drift-1" },
  { color: "var(--brand-violet)", opacity: 0.45, origin: "calc(50% - 400px)", drift: "field-drift-2" },
  {
    color: "var(--brand-violet-hover)",
    opacity: 0.4,
    origin: "calc(50% + 400px)",
    drift: "field-drift-3",
  },
  { color: "var(--primary-hover)", opacity: 0.35, origin: "calc(50% - 200px)", drift: "field-drift-4" },
  {
    color: "var(--brand-orange)",
    opacity: 0.35,
    origin: "calc(50% - 800px) calc(50% + 800px)",
    drift: "field-drift-5",
  },
] as const;

const POINTER_LOBE = { color: "var(--brand-violet)", opacity: 0.45 };

/** A lobe: one hue at the centre, gone by half the radius, transparent after. */
function lobe(color: string, opacity: number): string {
  const tinted = `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
  return `radial-gradient(circle at center, ${tinted} 0%, transparent 50%) no-repeat`;
}

export function GradientField({
  tier = "vivid",
  angle,
  size = "80%",
  strength = 1,
  interactive = true,
  className,
}: {
  tier?: GradientFieldTier;
  /** Degrees for the base sweep. Defaults to the tier's own angle. */
  angle?: number;
  /** Lobe diameter, relative to the field. Bigger reads slower and softer. */
  size?: string;
  /** Multiplier on every lobe opacity. Below 1 for a field under dense type. */
  strength?: number;
  /** The lobe that follows the cursor. Off under reduced motion regardless. */
  interactive?: boolean;
  /** Positioning, masking, radius. The field is `absolute inset-0` by default. */
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);

  const ground = GROUND[tier];

  useEffect(() => {
    if (!interactive) return;
    const root = rootRef.current;
    const blob = pointerRef.current;
    if (!root || !blob) return;

    /* Read once, not through the hook: this decides whether an effect runs at
       all, and nothing it touches is in the server HTML. A visitor who asked
       for less motion keeps the five CSS lobes — which the global
       `prefers-reduced-motion` block has already frozen on their opening
       frame — and simply never gets a sixth one chasing the cursor. */
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let onscreen = false;
    let frame = 0;
    let armed = false;
    const cur = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    /* Where the cursor was, in viewport coordinates. Kept raw so the rect is
       read inside the frame that uses it — the field moves as the page
       scrolls, and a rect cached at pointer time is stale by the time it is
       drawn. One forced layout per frame, not one per pointer event. */
    const client = { x: 0, y: 0 };

    const tick = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      target.x = client.x - rect.left - rect.width / 2;
      target.y = client.y - rect.top - rect.height / 2;

      /* /12 rather than the original's /20: the lobe is enormous and heavily
         blurred, and at /20 its leading edge lags far enough behind a normal
         mouse sweep that it reads as unrelated to the cursor. */
      cur.x += (target.x - cur.x) / 12;
      cur.y += (target.y - cur.y) / 12;
      blob.style.transform = `translate3d(${Math.round(cur.x)}px, ${Math.round(cur.y)}px, 0)`;

      if (Math.hypot(target.x - cur.x, target.y - cur.y) > 0.5) {
        frame = requestAnimationFrame(tick);
      }
    };

    const wake = () => {
      if (!onscreen || document.hidden) return;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const sleep = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    /* Cancel on hide rather than letting the loop lapse. A browser stops
       servicing `requestAnimationFrame` in a background tab but does not drop
       the callback, so a frame scheduled just before the switch is left
       pending — and `wake()` skips scheduling whenever one already is. Without
       the explicit cancel, whether the lobe ever moves again after a tab
       switch comes down to whether the engine chooses to flush that stale
       callback. */
    const onVisibility = () => (document.hidden ? sleep() : wake());

    const onMove = (event: PointerEvent) => {
      client.x = event.clientX;
      client.y = event.clientY;
      if (!armed) {
        armed = true;
        /* Held at zero until the pointer has actually been somewhere.
           Otherwise the lobe opens as a bright motionless spot dead centre —
           the one position it is never meant to sit in. */
        blob.style.opacity = "1";
      }
      wake();
    };

    const observer = new IntersectionObserver((entries) => {
      onscreen = entries.some((entry) => entry.isIntersecting);
      if (onscreen) wake();
      else sleep();
    });
    observer.observe(root);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      sleep();
    };
  }, [interactive]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{
        backgroundImage: `linear-gradient(${angle ?? ground.angle}deg, ${ground.stops})`,
      }}
    >
      {/* One blur over the whole stack, not a filter per lobe: blurring the
          composite is what lets two lobes bleed into each other's colour
          instead of overlapping as two distinguishable discs.

          The reference implementation puts an SVG goo filter here first — a
          heavy blur, then `feColorMatrix` pushing alpha ×18 −8 so the soft
          edges of overlapping blobs snap into one metaball contour. It was
          tried and taken out, because that threshold needs near-opaque blobs
          to mean anything: it drives every alpha above ~0.44 to 1 and
          everything under it to 0, and the lobes here peak at 0.5 and spend
          most of their radius well below it. Almost nothing survives to be
          merged, and the little that does is then hidden anyway — `feBlend`
          composites the untouched source back over the result, and a 44px blur
          goes over both. Rendered side by side the two are hard to tell apart.

          It is not free, though. It is a per-instance filter id, and a Safari
          branch: Safari composites an SVG filter over a stack of animating
          layers at single-digit frame rates, so the reference ships a
          user-agent sniff and a second code path. That is a lot of machinery
          for an effect this palette cannot show. What reads at this scale is
          the drift, not the contour. */}
      <div className="absolute inset-0" style={{ filter: "blur(44px)" }}>
        {LOBES.map((l, i) => (
          <div
            key={i}
            className={cn("absolute", l.drift)}
            style={{
              background: lobe(l.color, l.opacity * strength),
              /* Square, always — `size` is read against the container's WIDTH
                 in every one of these, including the vertical centring, since
                 a percentage margin resolves against the containing block's
                 width too.

                 That squareness is load-bearing. A `circle` gradient with no
                 explicit extent is sized `farthest-corner`, so its radius is
                 half the box diagonal and a stop at 50% of it lands at 0.354
                 of the side — comfortably inside the box on every axis, which
                 is what guarantees the lobe has faded to nothing before it
                 reaches an edge it could be clipped on.

                 Sized off both axes instead, the box takes the shape of the
                 section, and in a wide shallow band like the closing CTA the
                 gradient is still near-opaque when the box runs out. That is
                 not a subtle artefact: it is a hard-edged rounded rectangle
                 sitting in the middle of the band. */
              width: size,
              aspectRatio: "1",
              left: `calc(50% - ${size} / 2)`,
              top: "50%",
              marginTop: `calc(${size} / -2)`,
              transformOrigin: l.origin,
            }}
          />
        ))}

        {/* The pointer lobe is the exception: it is `inset-0` and moved by
            `transform`, because it has to be centred on the cursor rather than
            on the field, and the effect below writes that offset in pixels
            measured from the field's own centre. It is a radial gradient in a
            box the shape of the section, so it CAN reach an edge still tinted
            — which is fine and unlike the five above, because the edge it
            reaches is the edge of the field itself. There is nothing past it
            for a contour to show up against. */}
        {interactive && (
          <div
            ref={pointerRef}
            className="absolute inset-0 opacity-0 transition-opacity duration-700"
            style={{ background: lobe(POINTER_LOBE.color, POINTER_LOBE.opacity * strength) }}
          />
        )}
            </div>
    </div>
  );
}
