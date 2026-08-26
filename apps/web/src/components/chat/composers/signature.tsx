"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Signature pad.
 *
 * `signature` blocks previously reused the file uploader — there was no way to
 * actually sign anything, and the recorded shape was a FileDescriptor[] which
 * `validateAnswer` rejects outright, so signature answers could never succeed.
 *
 * Draws with pointer events (mouse, touch and stylus in one path) onto a
 * device-pixel-ratio-scaled canvas so strokes aren't blurry on retina screens.
 */
export function SignatureComposer({
  requireName,
  onSubmit,
}: {
  requireName: boolean;
  onSubmit: (dataUrl: string, name: string | undefined) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Read the resolved theme colour so the signature matches the form.
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--cf-text").trim() || "#1c1917";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function up() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          // touch-none stops the browser scrolling the page while signing.
          className="h-36 w-full touch-none rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)]"
          aria-label="Signature pad"
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm opacity-40">
            Sign here
          </span>
        )}
        {hasInk && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear signature"
            className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-[var(--cf-chip-bg)] opacity-70 transition-opacity hover:opacity-100"
          >
            <Eraser className="size-3.5" />
          </button>
        )}
      </div>

      {requireName && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type your full name"
          className="h-11 w-full rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] px-4 text-[0.9375rem] outline-none focus:border-[var(--cf-accent)]"
        />
      )}

      <button
        type="button"
        disabled={!hasInk || (requireName && !name.trim())}
        onClick={() => {
          const dataUrl = canvasRef.current?.toDataURL("image/png");
          if (dataUrl) onSubmit(dataUrl, requireName ? name.trim() : undefined);
        }}
        className={cn(
          "h-11 w-full rounded-full bg-[var(--cf-accent)] text-sm font-medium text-[var(--cf-accent-text)]",
          "transition-transform duration-[var(--duration-micro)] active:scale-[0.98]",
          "motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        Confirm signature
      </button>
    </div>
  );
}
