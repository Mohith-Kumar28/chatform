"use client";

import { ArrowRight, Blocks, Clock, Eye, Loader2 } from "lucide-react";
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
 * The card is a button, not a link — using a template is a mutation that
 * creates a form, so there is no href to give it.
 */
export function TemplateCard({
  template,
  variant = "full",
  pending = false,
  disabled = false,
  onUse,
  onPreview,
}: {
  template: TemplateSummary;
  variant?: "full" | "compact";
  pending?: boolean;
  disabled?: boolean;
  onUse: () => void;
  onPreview?: () => void;
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
        "group bg-card border-border relative flex flex-col rounded-2xl border text-left",
        "shadow-xs transition-[box-shadow,transform,border-color] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        // Cards lift, buttons don't (DESIGN.md §4.4).
        "hover:border-border hover:shadow-md hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
        "focus-within:ring-ring/40 focus-within:ring-2",
        disabled && "pointer-events-none opacity-60",
        compact ? "p-3.5" : "p-5",
      )}
    >
      {/* The whole card opens the template. The stretched link pattern, but
          for a button: the overlay sits under the explicit actions below, so
          "Preview" still wins the click where it overlaps. */}
      <button
        type="button"
        onClick={onUse}
        disabled={disabled || pending}
        aria-label={`Use the ${template.title} template`}
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
          {onPreview && !compact && (
            <Button
              variant="ghost"
              size="sm"
              shape="pill"
              onClick={onPreview}
              className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
            >
              <Eye className="size-3.5" />
              Preview
            </Button>
          )}
          {pending ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              Creating…
            </span>
          ) : (
            <span
              aria-hidden
              className={cn(
                "text-muted-foreground group-hover:text-foreground inline-flex items-center gap-1 text-xs font-medium",
                "transition-colors duration-[var(--duration-micro)]",
              )}
            >
              Use
              <ArrowRight className="size-3.5 transition-transform duration-[var(--duration-micro)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
            </span>
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
