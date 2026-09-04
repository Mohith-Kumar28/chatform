"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Loader2 } from "lucide-react";
import { uploadToSession, type UploadedFile } from "../upload-transport";
import { cn } from "@/lib/utils";

/**
 * Signature pad.
 *
 * Draws with pointer events (mouse, touch and stylus in one path) onto a
 * device-pixel-ratio-scaled canvas so strokes aren't blurry on retina screens.
 *
 * The drawing is then **uploaded**, and the answer carries the stored file
 * rather than a data URL. That is not an implementation detail:
 * `validateAnswer` requires `{ fileId, r2Key }` for a signature, so the
 * previous version — which posted `{ dataUrl, signedName }` — was rejected
 * every single time. Signing was impossible; three attempts escalated and the
 * form could not be finished. A data URL is also the wrong thing to keep in an
 * answer row: it is the whole image, inline, in every export.
 */
export function SignatureComposer({
  requireName,
  blockRef,
  uploadBase,
  respondentToken,
  onSubmit,
}: {
  requireName: boolean;
  blockRef: string;
  uploadBase: string | null;
  respondentToken: string | null;
  onSubmit: (value: UploadedFile & { signedName?: string }, display: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {error && <p className="text-destructive px-1 text-xs">{error}</p>}

      <button
        type="button"
        disabled={busy || !hasInk || !uploadBase || !respondentToken || (requireName && !name.trim())}
        onClick={() => void confirm()}
        className={cn(
          "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--cf-accent)] text-sm font-medium text-[var(--cf-accent-text)]",
          "transition-transform duration-[var(--duration-micro)] active:scale-[0.98]",
          "motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        {busy ? "Saving…" : "Confirm signature"}
      </button>
    </div>
  );

  async function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || !uploadBase || !respondentToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not read the signature.");
      const file = new File([blob], "signature.png", { type: "image/png" });
      const stored = await uploadToSession({ file, blockRef, uploadBase, respondentToken });
      const signedName = requireName ? name.trim() : undefined;
      onSubmit({ ...stored, signedName }, signedName ? `Signed — ${signedName}` : "Signed");
    } catch (err) {
      // Stay on the pad with the ink intact: re-drawing a signature because a
      // network call failed is the kind of thing people abandon a form over.
      setError(err instanceof Error ? err.message : "That didn't save. Try once more.");
      setBusy(false);
    }
  }
}
