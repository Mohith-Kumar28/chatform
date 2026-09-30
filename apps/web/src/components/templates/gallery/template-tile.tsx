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

/** Every template is drawn in the form's own default look, exactly as it opens. */
const FORM_THEME = ThemeDoc.parse({});

/**
 * The dashboard card's ground for a form without its own theme: the brand
 * band, orange into violet at the pale `--band` mix, with the form's background
 * tile over it in white. The same gesture as `thumbSurface` in `form-card.tsx`,
 * so a template in the gallery looks like the form it becomes on the dashboard.
 */
const BRAND_BAND = "linear-gradient(115deg, var(--brand-orange-band) 0%, var(--brand-violet-band) 100%)";

/**
 * The thumbnail: this template's own opening, drawn by the chat's bubbles in
 * its card palette, over a background tile and a shape. Hovering shows the
 * way in, the same gesture the dashboard card uses.
 */
export function TemplateThumb({ tile, className }: { tile: TileData; className?: string }) {
  const pattern = resolvePattern("auto", tile.slug);
  const ground: CSSProperties = pattern
    ? {
        backgroundImage: `${patternImage(pattern, `rgba(255,255,255,${0.09 * patternWeight(pattern)})`)}, ${BRAND_BAND}`,
        backgroundSize: `${patternSize(pattern)}, 100% 100%`,
        backgroundRepeat: "repeat, no-repeat",
      }
    : { backgroundImage: BRAND_BAND };

  return (
    <div className={`relative aspect-[16/10] overflow-hidden rounded-2xl ${className ?? ""}`} style={ground}>
      <div className="relative flex h-full flex-col justify-center gap-2 px-5 py-4 [zoom:0.72]" style={chatThemeVars(FORM_THEME, tile.slug)}>
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
