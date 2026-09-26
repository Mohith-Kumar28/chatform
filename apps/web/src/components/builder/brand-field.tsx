"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { ThemeDoc } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadAsset } from "@/lib/assets";
import {
  hueDistance,
  isDarkTheme,
  pickBrand,
  swatchesFromBlob,
  swatchesFromUrl,
  themeFromAccent,
  themeFromSwatches,
  type Swatch,
} from "@/lib/brand-palette";

/** The colour fields a palette writes, which is also what "Undo" puts back. */
const PALETTE_KEYS = [
  "background",
  "surface",
  "text",
  "accent",
  "accentText",
  "botBubble",
  "userBubble",
  "userBubbleText",
] as const satisfies readonly (keyof ThemeDoc)[];

/**
 * Optional brand logo.
 *
 * Opt-in: a form without one still looks finished, falling back to the
 * chatform mark. The logo replaces that mark in the chat header and appears on
 * the completion screen. The name beside it is the form's own title, edited in
 * `ThemePanel`.
 *
 * Uploading a logo also dresses the form in it: the logo's colours are read
 * from the file in the browser, the brand colour becomes the accent, and the
 * page, ink and bubbles are derived from it (`themeFromSwatches`). It happens
 * in the same change as the upload, so one undo takes back both, and the
 * toast offers to keep the logo and put the old colours back.
 */
export function BrandField({
  theme,
  onChange,
}: {
  theme: ThemeDoc;
  onChange: (patch: Partial<ThemeDoc>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  /** Keyed by the logo they came from, so a stale read never shows under a new logo. */
  const [read, setRead] = useState<{ url: string; swatches: Swatch[] } | null>(null);
  const swatches = read && read.url === theme.logoUrl ? read.swatches : null;
  const dark = isDarkTheme(theme);

  // A logo uploaded before this existed, or on another visit: read it from its URL.
  useEffect(() => {
    const url = theme.logoUrl;
    if (!url || read?.url === url) return;
    let live = true;
    swatchesFromUrl(url)
      .then((s) => live && setRead({ url, swatches: s }))
      .catch(() => live && setRead({ url, swatches: [] }));
    return () => {
      live = false;
    };
  }, [theme.logoUrl, read?.url]);

  function applyPalette(palette: Partial<ThemeDoc> | null, extra: Partial<ThemeDoc> = {}) {
    if (!palette) {
      onChange(extra);
      return;
    }
    const before = Object.fromEntries(PALETTE_KEYS.map((k) => [k, theme[k]])) as Partial<ThemeDoc>;
    onChange({ ...extra, ...palette });
    toast.success("Colours matched to your logo", {
      action: { label: "Undo", onClick: () => onChange(before) },
    });
  }

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file");
      return;
    }
    setBusy(true);
    try {
      // Read from the file in hand, alongside the upload rather than after it.
      const [asset, found] = await Promise.all([uploadAsset(file), swatchesFromBlob(file).catch(() => [])]);
      setRead({ url: asset.url, swatches: found });
      applyPalette(themeFromSwatches(found, dark), { logoUrl: asset.url, logoKey: asset.key });
    } catch (err) {
      toast.error("Couldn't upload", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/*
        The whole row is the upload target, drawn as a drop zone, because a
        bare 48px tile beside a text field read as decoration: nobody could
        tell a logo went there.
      */}
      <div className="flex items-center gap-3 rounded-xl border border-dashed p-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-label={theme.logoUrl ? "Replace logo" : "Upload logo"}
          className="bg-muted/60 hover:bg-muted grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg transition-colors disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin opacity-60" />
          ) : theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt="" className="size-full object-contain" />
          ) : (
            <ImagePlus className="size-5 opacity-60" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{theme.logoUrl ? "Your logo" : "Upload your logo"}</p>
          <p className="text-muted-foreground text-xs">
            {theme.logoUrl ? "Shown at the top of your form." : "PNG, JPG or WebP. We match the colours to it."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {theme.logoUrl ? "Replace" : "Upload"}
          </Button>
          {theme.logoUrl && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove logo"
              className="hover:text-destructive"
              onClick={() => onChange({ logoUrl: null, logoKey: null })}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {theme.logoUrl && swatches && swatches.length > 0 && (
        <LogoSwatches
          swatches={swatches}
          accent={theme.accent}
          onPick={(hex) => {
            /*
             * The picked colour leads. The logo's other brand hue, if it has
             * one far enough round the wheel, still dresses their bubble, so
             * picking the violet in an orange-and-violet mark gives a violet
             * form with an orange bubble rather than a violet-only one.
             */
            const other = pickBrand(swatches.filter((s) => s.hex !== hex));
            const second =
              other && other.primary.c >= 0.045 && hueDistance(other.primary.h, swatches.find((s) => s.hex === hex)!.h) >= 40
                ? other.primary.hex
                : null;
            const palette = themeFromAccent(hex, { dark, secondary: second });
            if (palette) onChange(palette);
          }}
          onMatch={() => applyPalette(themeFromSwatches(swatches, dark))}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * The logo's colours, each one a way to set the accent, and a button that puts
 * the automatic match back after the colours have been changed by hand.
 */
function LogoSwatches({
  swatches,
  accent,
  onPick,
  onMatch,
}: {
  swatches: Swatch[];
  accent: string;
  onPick: (hex: string) => void;
  onMatch: () => void;
}) {
  // Near-white is the logo's backdrop more often than its colour, and it makes
  // an accent nobody can see.
  const shown = swatches.filter((s) => !(s.l > 0.93 && s.c < 0.04));
  if (shown.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">From your logo</span>
      <div className="flex flex-1 gap-1.5">
        {shown.map((s) => (
          <button
            key={s.hex}
            type="button"
            title={`Use ${s.hex} as the accent`}
            aria-label={`Use ${s.hex} as the accent`}
            onClick={() => onPick(s.hex)}
            className={cn(
              "size-5 rounded-full transition-transform hover:scale-110",
              s.hex.toLowerCase() === accent.toLowerCase() && "ring-ring ring-2 ring-offset-2 ring-offset-background",
            )}
            style={{ background: s.hex, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08)" }}
          />
        ))}
      </div>
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={onMatch}>
        <Wand2 className="size-3.5" />
        Match
      </Button>
    </div>
  );
}
