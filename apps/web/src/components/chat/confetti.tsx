"use client";

import { useEffect, useRef } from "react";

/**
 * A short burst of confetti when a form completes.
 *
 * Canvas rather than DOM nodes so a few hundred pieces cost nothing, and the
 * whole thing removes itself after a couple of seconds. Skipped entirely under
 * `prefers-reduced-motion` — celebration is not worth making someone unwell.
 */
export function Confetti({ colors }: { colors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

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
      color: colors[Math.floor(Math.random() * colors.length)]!,
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
  }, [colors]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
