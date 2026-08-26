import { cn } from "@/lib/utils";

/**
 * A single metric. Values use tabular figures so a number changing from 9 to
 * 10 does not shift the layout, and long labels wrap rather than truncate —
 * the KPI row in Results currently wraps badly because neither is handled.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone?: "default" | "primary" | "success" | "warning" | "destructive";
  className?: string;
}) {
  const toneRing = {
    default: "text-muted-foreground bg-muted",
    primary: "text-primary bg-primary-soft",
    success: "text-[var(--success)] bg-[var(--success-soft)]",
    warning: "text-[var(--warning-foreground)] bg-[var(--warning-soft)]",
    destructive: "text-destructive bg-[var(--destructive-soft)]",
  }[tone];

  return (
    <div className={cn("border-border bg-card shadow-xs rounded-xl border p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-caption min-w-0">{label}</p>
        {Icon && (
          <div className={cn("grid size-7 shrink-0 place-items-center rounded-lg", toneRing)}>
            <Icon className="size-3.5" strokeWidth={1.75} />
          </div>
        )}
      </div>
      <p className="tabular text-h1 mt-2">{value}</p>
      {hint && <p className="text-muted-foreground text-micro mt-1">{hint}</p>}
    </div>
  );
}
