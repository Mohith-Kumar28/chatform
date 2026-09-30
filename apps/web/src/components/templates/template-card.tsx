"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { TemplateSummary } from "@/lib/templates";
import { cn } from "@/lib/utils";
import tiles from "@/content/templates/tiles.generated.json";
import { TemplateThumb } from "./gallery/template-tile";

type TileInfo = { kind: string; preview: { greeting: string; question: string; answer?: string; next?: string } };
const TILES = tiles as Record<string, TileInfo>;

/**
 * One template, as the app's gallery and the new form dialog show it: the
 * same card as the public gallery, the template's own opening drawn as chat
 * bubbles, so a template looks the same wherever you meet it.
 *
 * The picture and name lead to the template's page; "Make it yours" creates
 * the form and opens it in the builder in one step.
 */
export function TemplateCard({
  template,
  variant = "full",
  disabled = false,
  onOpen,
  href,
}: {
  template: TemplateSummary;
  variant?: "full" | "compact";
  pending?: boolean;
  disabled?: boolean;
  /** Fired when the card is followed; the create dialog closes itself on it. */
  onOpen?: () => void;
  /** Where the card leads. The app's own detail page unless the public gallery says otherwise. */
  href?: string;
}) {
  const info = TILES[template.slug];
  const compact = variant === "compact";

  return (
    <article className={cn("flex h-full w-full flex-col", disabled && "pointer-events-none opacity-60")}>
      <Link prefetch={false}
        href={href ?? `/templates/${template.slug}`}
        onClick={onOpen}
        className="group focus-visible:ring-ring/50 rounded-2xl focus-visible:ring-[3px] focus-visible:outline-none"
      >
        {info ? (
          <TemplateThumb
            tile={{
              slug: template.slug,
              path: href ?? `/templates/${template.slug}`,
              name: template.title,
              kind: info.kind,
              description: template.description,
              preview: info.preview,
            }}
            className="ring-foreground/5 ring-1 transition-shadow duration-200 group-hover:shadow-lg"
          />
        ) : (
          <div className="bg-muted aspect-[16/10] rounded-2xl" />
        )}
        <p className={cn("text-foreground/60 mt-3", compact ? "text-xs" : "text-[0.8125rem]")}>{info?.kind ?? template.category}</p>
        <h3 className={cn("font-display text-foreground mt-0.5 leading-snug font-semibold", compact ? "text-[0.9375rem]" : "text-lg")}>
          {template.title}
        </h3>
        <p className={cn("text-foreground/75 mt-1 leading-relaxed", compact ? "line-clamp-2 text-sm" : "line-clamp-3 text-[0.9375rem]")}>
          {template.description}
        </p>
      </Link>
      <Link prefetch={false}
        href={`/templates/${template.slug}/use`}
        onClick={onOpen}
        className="text-foreground hover:text-primary mt-auto flex items-center justify-between pt-3 text-sm font-semibold transition-colors duration-[var(--duration-micro)]"
      >
        Make it yours
        <ArrowUpRight className="size-4" />
      </Link>
    </article>
  );
}

/** Card-shaped placeholder, so the grid does not reflow when data lands. */
export function TemplateCardSkeleton({ variant = "full" }: { variant?: "full" | "compact" }) {
  return (
    <div className="flex flex-col">
      <div className="shimmer aspect-[16/10] rounded-2xl" />
      <div className="mt-3 space-y-2">
        <div className="shimmer h-2.5 w-1/3 rounded" />
        <div className={cn("shimmer rounded", variant === "compact" ? "h-3.5 w-2/3" : "h-4 w-2/3")} />
        <div className="shimmer h-2.5 w-full rounded" />
      </div>
    </div>
  );
}
