"use client";

import { FormDoc } from "@repo/form-schema";
import { Ban, Shuffle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger } from "@/components/ui/select";
import {
  PATTERNS,
  PATTERN_AUTO,
  PATTERN_NONE,
  PatternDef,
  patternImage,
  patternSize,
  patternWeight,
  resolvePattern,
  rgbaFromHex,
} from "@/lib/background-patterns";
import { contrast } from "@/lib/chat-theme";
import { cn } from "@/lib/utils";

type Theme = FormDoc["theme"];

/**
 * The tile swatch, drawn far stronger than the page ever draws it.
 *
 * The runtime paints the pattern at 3–5% alpha, which is correct behind an
 * answer and completely invisible in an 80px chip — a picker where every
 * option looks like the same blank rectangle is not a picker. So a swatch uses
 * the same ink and the same tile at roughly ten times the alpha: what it
 * communicates is *which* pattern, and the form itself is right there behind
 * the sheet showing how quiet it really is.
 *
 * `patternWeight` still applies, so the solid tiles do not shout over the
 * hairline ones here either.
 */
const SWATCH_ALPHA = 0.5;

function swatchStyle(theme: Theme, pattern: PatternDef) {
  // The runtime's rule for which colour the tile is drawn in, so a form whose
  // accent is too pale to register shows its fallback ink here as well.
  const usable = contrast(theme.background, theme.accent) >= 1.3;
  const ink = rgbaFromHex(usable ? theme.accent : theme.text, SWATCH_ALPHA * patternWeight(pattern));
  return {
    backgroundColor: theme.background,
    backgroundImage: patternImage(pattern, ink),
    backgroundSize: patternSize(pattern),
    backgroundRepeat: "repeat",
  };
}

function Swatch({
  theme,
  pattern,
  className,
  children,
}: {
  theme: Theme;
  /** `null` for the "None" row, which is the page with nothing on it. */
  pattern: PatternDef | null;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "border-border/60 flex shrink-0 items-center justify-center overflow-hidden rounded-md border",
        className,
      )}
      style={pattern ? swatchStyle(theme, pattern) : { backgroundColor: theme.background }}
    >
      {children}
    </span>
  );
}

/**
 * The background-tile picker.
 *
 * One control for three kinds of answer — no texture, whichever tile this form
 * hashes to, or a named one — because they are one decision and a switch plus
 * a list would make it look like two. `Auto` leads and is the default: it is
 * what every form did before this control existed, and it is the answer that
 * needs no opinion.
 *
 * Each row carries the tile itself rather than its name. "Scallops" and
 * "Zigzag" mean nothing until you have seen them, and a picture you can read
 * at a glance is the whole reason this is not a text dropdown.
 */
export function PatternField({
  theme,
  /** The form's public slug — what `auto` hashes, so the `Auto` row can show it. */
  seed,
  onChange,
}: {
  theme: Theme;
  seed?: string | null;
  onChange: (patch: Partial<Theme>) => void;
}) {
  const value = theme.backgroundPattern || PATTERN_AUTO;
  const autoTile = resolvePattern(PATTERN_AUTO, seed);
  const current = resolvePattern(value, seed);
  const isAuto = value === PATTERN_AUTO;
  const isNone = value === PATTERN_NONE;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="theme-pattern">Background pattern</Label>
      <Select value={value} onValueChange={(v) => onChange({ backgroundPattern: v })}>
        <SelectTrigger id="theme-pattern" className="h-auto w-full py-1.5">
          <span className="flex min-w-0 items-center gap-2.5">
            <Swatch theme={theme} pattern={isNone ? null : current} className="h-7 w-12">
              {isNone ? <Ban className="text-muted-foreground size-3.5" /> : null}
            </Swatch>
            <span className="truncate text-sm">
              {isNone ? "None" : isAuto ? "Auto" : (current?.label ?? "Auto")}
            </span>
          </span>
        </SelectTrigger>

        {/*
          `position="popper"` so a 24-row list opens against the trigger and
          scrolls, instead of item-aligned's attempt to centre the selected row
          over it — which, in a sheet, pushed the list off the top of the
          viewport as soon as the choice was near the bottom of the list.
        */}
        <SelectContent position="popper" align="start" className="max-h-[22rem]">
          <SelectItem value={PATTERN_AUTO} className="py-1.5">
            <Swatch theme={theme} pattern={autoTile} className="h-10 w-20" />
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 font-medium">
                <Shuffle className="size-3.5" />
                Auto
              </span>
              <span className="text-muted-foreground text-xs">Picked from the form&rsquo;s link</span>
            </span>
          </SelectItem>

          <SelectItem value={PATTERN_NONE} className="py-1.5">
            <Swatch theme={theme} pattern={null} className="h-10 w-20">
              <Ban className="text-muted-foreground size-4" />
            </Swatch>
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">None</span>
              <span className="text-muted-foreground text-xs">Flat background</span>
            </span>
          </SelectItem>

          <SelectSeparator />

          {PATTERNS.map((p) => (
            <SelectItem key={p.id} value={p.id} className="py-1.5">
              <Swatch theme={theme} pattern={p} className="h-10 w-20" />
              <span className="truncate">{p.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
