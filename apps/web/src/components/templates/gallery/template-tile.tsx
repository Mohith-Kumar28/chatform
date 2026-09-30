"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ThemeDoc, applyBackgroundPreset } from "@repo/form-schema";
import { ChatBubble } from "@/components/chat/chat-bubble";
import { chatThemeVars } from "@/lib/chat-theme";

export interface TileData {
  slug: string;
  path: string;
  name: string;
  /** "Survey · Feedback" */
  kind: string;
  description: string;
  preview: { preset: string; greeting: string; question: string; answer?: string; next?: string };
}

/** A soft shape in the corner, varied by slug, in the theme's accent. Decoration on the card only. */
function Shape({ slug }: { slug: string }) {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 16777619);
  const seed = h >>> 0;
  const kind = seed % 3;
  const style: CSSProperties = { color: "var(--cf-accent)", transform: (seed >> 3) % 2 === 1 ? "scaleX(-1)" : undefined };
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
 * the template's own theme (its builder background: colour, pattern and
 * bubbles), so the card looks like the form it opens as. Hovering shows the
 * way in, the same gesture the dashboard card uses.
 */
export function TemplateThumb({ tile, className }: { tile: TileData; className?: string }) {
  const theme = applyBackgroundPreset(ThemeDoc.parse({}), tile.preview.preset);
  const vars = chatThemeVars(theme, tile.slug);
  const ground: CSSProperties = {
    ...vars,
    backgroundColor: "var(--cf-bg)",
    backgroundImage: "var(--cf-pattern)",
    backgroundSize: "var(--cf-pattern-size)",
  };

  return (
    <div className={`relative aspect-[16/10] overflow-hidden rounded-2xl ${className ?? ""}`} style={ground}>
      <Shape slug={tile.slug} />
      <div className="relative flex h-full flex-col justify-center gap-2 px-5 py-4 [zoom:0.72]">
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
      <Link prefetch={false} href={tile.path} className="group focus-visible:ring-ring/50 rounded-2xl focus-visible:ring-[3px] focus-visible:outline-none">
        <TemplateThumb tile={tile} className="ring-foreground/5 ring-1 transition-shadow duration-200 group-hover:shadow-lg" />
        <p className="text-foreground/60 mt-3 text-[0.8125rem]">{tile.kind}</p>
        <h3 className="font-display text-foreground mt-1 text-lg leading-snug font-semibold">{tile.name}</h3>
        <p className="text-foreground/75 mt-1.5 line-clamp-3 text-[0.9375rem] leading-relaxed">{tile.description}</p>
      </Link>
      <Link prefetch={false}
        href={`/templates/${tile.slug}/use`}
        className="text-foreground hover:text-primary mt-auto flex items-center justify-between pt-4 text-sm font-semibold transition-colors duration-[var(--duration-micro)]"
      >
        Make it yours
        <ArrowUpRight className="size-4" />
      </Link>
    </article>
  );
}
