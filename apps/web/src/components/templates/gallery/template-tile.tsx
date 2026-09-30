"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ThemeDoc } from "@repo/form-schema";
import { ChatBubble } from "@/components/chat/chat-bubble";
import { chatThemeVars } from "@/lib/chat-theme";
import { patternImage, patternSize, patternWeight, resolvePattern } from "@/lib/background-patterns";

export interface TileData {
  slug: string;
  path: string;
  name: string;
  /** "Survey · Feedback" */
  kind: string;
  description: string;
  preview: { greeting: string; question: string; answer?: string; next?: string };
}

/**
 * A palette per card, picked by the slug, so a grid reads as many different
 * forms rather than one card repeated. Light grounds with a saturated accent,
 * plus a few dark and brand-strength ones so a row never goes flat. Each is a
 * real form theme: the bubbles are drawn by the chat's own components.
 */
const PALETTES: { bg: string; accent: string; ink: string; bot: string; botText: string }[] = [
  { bg: "#ffe4d3", accent: "#f26b1d", ink: "#ffffff", bot: "#ffffff", botText: "#1c1917" },
  { bg: "#ece3ff", accent: "#7c4dff", ink: "#ffffff", bot: "#ffffff", botText: "#1c1917" },
  { bg: "#d9f2e6", accent: "#15835a", ink: "#ffffff", bot: "#ffffff", botText: "#1c1917" },
  { bg: "#dbeafe", accent: "#2563eb", ink: "#ffffff", bot: "#ffffff", botText: "#1c1917" },
  { bg: "#fff1bf", accent: "#1c1917", ink: "#fff1bf", bot: "#ffffff", botText: "#1c1917" },
  { bg: "#ffdce8", accent: "#db2f6b", ink: "#ffffff", bot: "#ffffff", botText: "#1c1917" },
  { bg: "#221d44", accent: "#ff8a4c", ink: "#1c1917", bot: "#332c5e", botText: "#f5f3ff" },
  { bg: "#5b2ee6", accent: "#ffd166", ink: "#1c1917", bot: "#ffffff", botText: "#1c1917" },
  { bg: "#dff5f7", accent: "#0e7c88", ink: "#ffffff", bot: "#ffffff", botText: "#1c1917" },
  { bg: "#f26b1d", accent: "#1c1917", ink: "#ffffff", bot: "#fff7f0", botText: "#1c1917" },
  { bg: "#e8f0d8", accent: "#4d7c0f", ink: "#ffffff", bot: "#ffffff", botText: "#1c1917" },
  { bg: "#f1e8dc", accent: "#9a3412", ink: "#ffffff", bot: "#ffffff", botText: "#1c1917" },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function paletteFor(slug: string) {
  return PALETTES[hash(slug) % PALETTES.length]!;
}

/** The palette as a form theme, for anything that draws this template's chat. */
export function themeFor(slug: string): ThemeDoc {
  const p = paletteFor(slug);
  return ThemeDoc.parse({
    background: p.bg,
    accent: p.accent,
    accentText: p.ink,
    userBubble: p.accent,
    userBubbleText: p.ink,
    botBubble: p.bot,
    text: p.botText,
    radius: "lg",
  });
}

/** A soft shape in the corner, varied by slug, in the palette's accent. */
function Shape({ seed, color }: { seed: number; color: string }) {
  const kind = seed % 3;
  const flip = (seed >> 3) % 2 === 1;
  const style: CSSProperties = { color, transform: flip ? "scaleX(-1)" : undefined };
  return (
    <svg aria-hidden viewBox="0 0 400 240" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-[0.16]" style={style}>
      {kind === 0 && <path d="M0 170 C 80 120, 150 210, 230 170 S 360 120, 400 150 L400 240 L0 240 Z" fill="currentColor" />}
      {kind === 1 && <path d="M260 0 C 340 30, 420 90, 400 170 C 380 240, 300 250, 250 240 C 190 225, 200 150, 230 100 C 250 60, 220 20, 260 0 Z" fill="currentColor" />}
      {kind === 2 && (
        <g fill="none" stroke="currentColor" strokeWidth="6">
          <circle cx="330" cy="50" r="70" />
          <circle cx="60" cy="210" r="46" />
          <circle cx="360" cy="200" r="24" />
        </g>
      )}
    </svg>
  );
}

/**
 * The thumbnail: this template's own opening, drawn by the chat's bubbles in
 * its card palette, over a background tile and a shape. Hovering shows the
 * way in, the same gesture the dashboard card uses.
 */
export function TemplateThumb({ tile, className }: { tile: TileData; className?: string }) {
  const seed = hash(tile.slug);
  const p = paletteFor(tile.slug);
  const doc = themeFor(tile.slug);
  const pattern = resolvePattern("auto", tile.slug);
  const dark = p.bg === "#221d44" || p.bg === "#5b2ee6";
  const ground: CSSProperties = pattern
    ? {
        backgroundColor: p.bg,
        backgroundImage: patternImage(pattern, dark ? `rgba(255,255,255,${0.08 * patternWeight(pattern)})` : `rgba(0,0,0,${0.05 * patternWeight(pattern)})`),
        backgroundSize: patternSize(pattern),
      }
    : { backgroundColor: p.bg };

  return (
    <div className={`relative aspect-[16/10] overflow-hidden rounded-2xl ${className ?? ""}`} style={ground}>
      <Shape seed={seed} color={p.accent} />
      <div className="relative flex h-full flex-col justify-center gap-2 px-5 py-4 [zoom:0.72]" style={chatThemeVars(doc, tile.slug)}>
        <div className="flex justify-start">
          <ChatBubble from="bot" className="shadow-xs">
            <span className="line-clamp-2">{tile.preview.greeting}</span>
          </ChatBubble>
        </div>
        {tile.preview.question && (
          <div className="flex justify-start">
            <ChatBubble from="bot" className="shadow-xs">
              <span className="line-clamp-2">{tile.preview.question}</span>
            </ChatBubble>
          </div>
        )}
        {tile.preview.answer ? (
          <div className="flex justify-end">
            <ChatBubble from="user">
              <span className="block max-w-[16rem] truncate">{tile.preview.answer}</span>
            </ChatBubble>
          </div>
        ) : tile.preview.next ? (
          <div className="flex justify-start opacity-80">
            <ChatBubble from="bot">
              <span className="line-clamp-1">{tile.preview.next}</span>
            </ChatBubble>
          </div>
        ) : null}
      </div>
      <span className="bg-card text-foreground pointer-events-none absolute inset-x-3 bottom-3 flex translate-y-2 items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold opacity-0 shadow-md transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none">
        Preview template
        <ArrowRight className="size-4" />
      </span>
    </div>
  );
}

/**
 * One template in a grid. No box around it: the picture carries the colour,
 * and the words sit on the page, which is what keeps a grid of three hundred
 * from turning into a wall of borders.
 */
export function TemplateTile({ tile }: { tile: TileData }) {
  return (
    <article className="flex h-full flex-col">
      <Link href={tile.path} className="group focus-visible:ring-ring/50 rounded-2xl focus-visible:ring-[3px] focus-visible:outline-none">
        <TemplateThumb tile={tile} className="ring-foreground/5 ring-1 transition-shadow duration-200 group-hover:shadow-lg" />
        <p className="text-foreground/60 mt-3 text-[0.8125rem]">{tile.kind}</p>
        <h3 className="font-display text-foreground mt-1 text-lg leading-snug font-semibold">{tile.name}</h3>
        <p className="text-foreground/75 mt-1.5 line-clamp-3 text-[0.9375rem] leading-relaxed">{tile.description}</p>
      </Link>
      <Link
        href={`/templates/${tile.slug}`}
        className="text-foreground hover:text-primary mt-auto flex items-center justify-between pt-4 text-sm font-semibold transition-colors duration-[var(--duration-micro)]"
      >
        Make it yours
        <ArrowUpRight className="size-4" />
      </Link>
    </article>
  );
}
