"use client";

import { useEffect, useRef } from "react";

/**
 * A short burst of confetti when a form completes.
 *
 * Canvas rather than DOM nodes so a few hundred pieces cost nothing, and the
 * whole thing removes itself after a couple of seconds. Skipped entirely under
 * `prefers-reduced-motion` — celebration is not worth making someone unwell.
 */
export function Confetti({
  colors,
  className = "pointer-events-none fixed inset-0 z-50 h-full w-full",
}: {
  colors: string[];
  /**
   * Defaults to the viewport, which is what a completed form wants. The
   * marketing replay passes an absolute box so the burst stays inside the demo
   * surface instead of raining over the landing page.
   */
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  /**
   * The palette is read at burst time rather than depended on.
   *
   * `colors` is a fresh array literal on every render of the ending card, so an
   * effect that listed it as a dependency re-ran on every render — and the
   * ending card re-renders constantly, because the transcript tracks whether it
   * is scrolled to the bottom. Scrolling the completion screen therefore set the
   * confetti off again, and again, and again. One burst per mount is the whole
   * intent, so the palette is captured once and the effect depends on nothing.
   */
  const colorsRef = useRef(colors);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const palette = colorsRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.offsetWidth * dpr);
    const h = (canvas.height = canvas.offsetHeight * dpr);
    ctx.scale(dpr, dpr);

    const width = canvas.offsetWidth;
    const pieces = Array.from({ length: 140 }, () => ({
      x: width / 2 + (Math.random() - 0.5) * width * 0.5,
      y: -20 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 5,
      vy: 2 + Math.random() * 4,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      color: palette[Math.floor(Math.random() * palette.length)]!,
    }));

    let raf = 0;
    const started = performance.now();

    function frame(now: number) {
      const elapsed = now - started;
      ctx!.clearRect(0, 0, w, h);

      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // gravity
        p.vx *= 0.995;
        p.rot += p.vr;

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        // Fade out over the last 800ms rather than vanishing mid-air.
        ctx!.globalAlpha = Math.max(0, Math.min(1, (2600 - elapsed) / 800));
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx!.restore();
      }

      if (elapsed < 2600) raf = requestAnimationFrame(frame);
      else ctx!.clearRect(0, 0, w, h);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas ref={ref} aria-hidden className={className} />
  );
}
