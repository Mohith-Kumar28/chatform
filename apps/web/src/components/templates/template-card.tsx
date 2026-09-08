"use client";

import Link from "next/link";
import { ArrowRight, Blocks, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { templateAccent } from "@/lib/category-accent";
import type { TemplateSummary } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * One template, in two densities.
 *
 * `full` is the gallery on `/templates`: room for tags and both actions.
 * `compact` is the same card inside the create dialog, where the gallery is
 * one band of a taller screen and a card has to earn its height.
 *
 * The card is a LINK to the template, not a button that creates a form from it.
 * It used to be the latter, and a single click — the most casual gesture there
 * is, and the one a curious reader makes — created a form and dropped them in
 * the builder. Nobody browsing a catalogue means "yes, this one, now"; they
 * mean "what is this?". Creating a form is an explicit act with its own button,
 * on a page that has told you what you are about to get.
 */
export function TemplateCard({
  template,
  variant = "full",
  pending = false,
  disabled = false,
  onUse,
  onOpen,
}: {
  template: TemplateSummary;
  variant?: "full" | "compact";
  pending?: boolean;
  disabled?: boolean;
  /** Offered as an explicit shortcut for a reader who already knows this one. */
  onUse?: () => void;
  /** Fired when the card is followed — the create dialog closes itself on it. */
  onOpen?: () => void;
}) {
  const accent = templateAccent(template.category, template.accent, template.icon);
  const Icon = accent.icon;
  const compact = variant === "compact";

  const meta = [
    template.blockCount ? { icon: Blocks, label: `${template.blockCount} questions` } : null,
    template.estMinutes ? { icon: Clock, label: `~${template.estMinutes} min` } : null,
  ].filter(Boolean) as { icon: typeof Blocks; label: string }[];

  return (
    <div
      className={cn(
        "group bg-card border-border relative flex h-full w-full flex-col rounded-2xl border text-left",
        "shadow-xs transition-[box-shadow,transform,border-color] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        // Cards lift, buttons don't (DESIGN.md §4.4).
        "hover:border-border hover:shadow-md hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
        "focus-within:ring-ring/40 focus-within:ring-2",
        disabled && "pointer-events-none opacity-60",
        compact ? "p-3.5" : "p-5",
      )}
    >
      {/* The stretched-link pattern: the whole card follows to the template,
          and the explicit actions below sit above it so they win the click
          where they overlap. */}
      <Link
        href={`/templates/${template.slug}`}
        onClick={onOpen}
        aria-label={`View the ${template.title} template`}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none"
      />

      <div className={cn("pointer-events-none flex items-start gap-3", compact ? "gap-2.5" : "gap-3")}>
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-xl",
            accent.tile,
            compact ? "size-9" : "size-11",
          )}
        >
          <Icon className={compact ? "size-4" : "size-5"} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-display truncate font-semibold", compact ? "text-sm" : "text-base")}>
            {template.title}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">{template.category}</p>
        </div>
      </div>

      <p
        className={cn(
          "text-muted-foreground pointer-events-none mt-3 text-sm leading-relaxed",
          compact ? "line-clamp-2 text-xs" : "line-clamp-2",
        )}
      >
        {template.description}
      </p>

      {!compact && template.tags && template.tags.length > 0 && (
        <div className="pointer-events-none mt-3 flex flex-wrap gap-1.5">
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[0.6875rem]">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className={cn("mt-auto flex items-center gap-3 pt-3", compact ? "pt-2.5" : "pt-4")}>
        {meta.length > 0 && (
          <div className="text-muted-foreground pointer-events-none flex items-center gap-3 text-xs">
            {meta.map((m) => (
              <span key={m.label} className="tabular inline-flex items-center gap-1">
                <m.icon className="size-3" strokeWidth={1.75} />
                {m.label}
              </span>
            ))}
          </div>
        )}

        <div className="z-10 ml-auto flex items-center gap-1">
          {pending ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              Creating…
            </span>
          ) : (
            <>
              {/* The shortcut past the detail page, for someone who has been
                  here before. Revealed on hover so the quiet state of the
                  gallery stays a gallery, and always visible on touch, where
                  there is no hover to reveal it with. */}
              {onUse && (
                <Button
                  variant="outline"
                  size="sm"
                  shape="pill"
                  onClick={onUse}
                  aria-label={`Create a form from the ${template.title} template`}
                  // Outlined, not ghost. It sits beside the card's own "open
                  // this" hint, and two pieces of small grey text a few pixels
                  // apart — one of which creates a form — is exactly the
                  // ambiguity this whole screen was changed to remove.
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
                >
                  Use
                </Button>
              )}
              <span
                aria-hidden
                className={cn(
                  "text-muted-foreground group-hover:text-foreground inline-flex items-center gap-1 text-xs font-medium",
                  "transition-colors duration-[var(--duration-micro)]",
                )}
              >
                Preview
                <ArrowRight className="size-3.5 transition-transform duration-[var(--duration-micro)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Card-shaped placeholder, so the grid does not reflow when data lands. */
export function TemplateCardSkeleton({ variant = "full" }: { variant?: "full" | "compact" }) {
  return (
    <div
      className={cn(
        "bg-card border-border rounded-2xl border",
        variant === "compact" ? "h-[8.5rem] p-3.5" : "h-52 p-5",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("shimmer rounded-xl", variant === "compact" ? "size-9" : "size-11")} />
        <div className="flex-1 space-y-2 pt-1">
          <div className="shimmer h-3.5 w-2/3 rounded" />
          <div className="shimmer h-2.5 w-1/3 rounded" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="shimmer h-2.5 w-full rounded" />
        <div className="shimmer h-2.5 w-4/5 rounded" />
      </div>
    </div>
  );
}
