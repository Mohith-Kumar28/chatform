import { cn } from "@/lib/utils";

/**
 * The one empty state. DESIGN.md 4.6 inventories eight places that need one and
 * the product shipped with zero — most surfaces render either nothing or the
 * literal string "Loading…".
 *
 * Shape: icon, a warm sentence-case title, one line of explanation, one action.
 * Never two competing actions; if there is a secondary path it goes in `hint`.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  hint,
  className,
  compact = false,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-muted/30 flex flex-col items-center justify-center rounded-2xl text-center",
        compact ? "gap-2 px-6 py-10" : "gap-3 px-8 py-16",
        className,
      )}
    >
      {Icon && (
        <div className="bg-primary-soft text-primary mb-1 grid size-12 place-items-center rounded-2xl">
          <Icon className="size-5" strokeWidth={1.75} />
        </div>
      )}
      <h3 className="text-h3">{title}</h3>
      {description && (
        <p className="text-muted-foreground text-body max-w-sm text-balance">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
      {hint && <p className="text-muted-foreground text-micro mt-1">{hint}</p>}
    </div>
  );
}
