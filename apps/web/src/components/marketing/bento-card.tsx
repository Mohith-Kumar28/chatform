import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

/**
 * The feature-grid tile. Interactive cards lift on hover (DESIGN.md 4.4:
 * shadow-md, -2px, 150ms) — the old landing page's six identical cards did
 * nothing at all.
 */
export function BentoCard({
  icon: Icon,
  title,
  body,
  span = 1,
  tone,
  media,
  footer,
  delay = 0,
  className,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: React.ReactNode;
  /** Column span at `lg`. */
  span?: 1 | 2 | 3;
  /** Block-family accent, matching the colour a question of this kind wears. */
  tone?: "content" | "text" | "contact" | "number" | "choice" | "scale" | "advanced";
  media?: React.ReactNode;
  footer?: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <Reveal
      delay={delay}
      className={cn(
        span === 2 && "lg:col-span-2",
        span === 3 && "lg:col-span-3",
        "h-full",
      )}
    >
      <div
        className={cn(
          "bg-card border-border/70 shadow-xs group flex h-full flex-col rounded-2xl border p-6",
          "transition-[box-shadow,transform] duration-150 ease-[var(--ease-out)]",
          "hover:shadow-md motion-safe:hover:-translate-y-0.5",
          className,
        )}
      >
        {Icon && (
          <span
            className="mb-4 grid size-10 place-items-center rounded-xl"
            style={
              tone
                ? {
                    background: `var(--family-${tone}-soft)`,
                    color: `var(--family-${tone}-ink)`,
                  }
                : { background: "var(--primary-soft)", color: "var(--primary)" }
            }
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
        )}
        <h3 className="text-h3">{title}</h3>
        <p className="text-body text-muted-foreground mt-1.5 leading-relaxed">{body}</p>
        {media && <div className="mt-5 flex-1">{media}</div>}
        {footer && <div className="mt-5">{footer}</div>}
      </div>
    </Reveal>
  );
}

export function BentoGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>
  );
}
